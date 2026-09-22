import { Rider, DeliveryEntry, SettlementRecord } from '../types';
import { getTodayDateString, formatDateDisplay } from './formatters';

function escapeCsvCell(cell: any): string {
  if (cell === null || cell === undefined) return '""';
  const str = String(cell);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return `"${str}"`;
}

function triggerDownload(csvContent: string, fileName: string): void {
  // \uFEFF is the UTF-8 Byte Order Mark (BOM) so Excel opens Hindi/special characters and currency cleanly
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', fileName);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

/**
 * Bulk Download: Generates and triggers clean CSV/Excel download of all riders,
 * their performance, rates, and dues under a specific user workspace.
 */
export function exportBulkRidersToCSV(options: {
  userName: string;
  userEmail: string;
  riders: Rider[];
  entries: DeliveryEntry[];
  settlements?: SettlementRecord[];
}): void {
  const { userName, userEmail, riders, entries, settlements = [] } = options;

  const todayStr = getTodayDateString();
  const cleanEmail = (userEmail || 'workspace').replace(/[^a-zA-Z0-9]/g, '_');
  const fileName = `Courier_All_Riders_${cleanEmail}_${todayStr}.csv`;

  // Calculate totals
  const totalParcels = entries.reduce((acc, e) => acc + (e.parcels || 0), 0);
  const totalGross = entries.reduce((acc, e) => acc + (e.totalEarnings || 0), 0);
  const totalUnpaid = entries
    .filter((e) => e.status === 'Unpaid')
    .reduce((acc, e) => acc + (e.totalEarnings || 0), 0);
  const totalPaid = entries
    .filter((e) => e.status === 'Paid')
    .reduce((acc, e) => acc + (e.totalEarnings || 0), 0);

  const lines: string[] = [];

  // Metadata Header Block
  lines.push('=== COURIER RIDER PAYOUT - MASTER WORKSPACE AUDIT REPORT ===');
  lines.push(`Workspace Owner,${escapeCsvCell(userName)},Email,${escapeCsvCell(userEmail)}`);
  lines.push(`Export Date,${escapeCsvCell(todayStr)},Export Time,${escapeCsvCell(new Date().toLocaleTimeString('en-IN'))}`);
  lines.push(`Total Registered Riders,${riders.length},Total Parcels Delivered,${totalParcels}`);
  lines.push(`Total Gross Earnings (INR),₹${totalGross.toLocaleString('en-IN')},Total Settled / Paid (INR),₹${totalPaid.toLocaleString('en-IN')}`);
  lines.push(`Total Pending Unpaid Dues (INR),₹${totalUnpaid.toLocaleString('en-IN')},Total Settlements,${settlements.length}`);
  lines.push(''); // Blank row

  // 1. RIDER DIRECTORY SUMMARY TABLE
  lines.push('=== RIDERS SUMMARY & FINANCIAL STATUS ===');
  const riderHeaders = [
    'Sl No',
    'Rider ID',
    'Rider Name',
    'Contact Phone',
    'Vehicle Type',
    'Status',
    'Base Rate (Rs/pkt)',
    'Incentive Rate (Rs/pkt)',
    'Joined Date',
    'Delivered Parcels',
    'Base Earnings (Rs)',
    'Incentives (Rs)',
    'Gross Total (Rs)',
    'Settled / Paid (Rs)',
    'Pending Dues (Rs)',
    'Unpaid Entries Count',
  ];
  lines.push(riderHeaders.map(escapeCsvCell).join(','));

  riders.forEach((rider, index) => {
    const riderEntries = entries.filter((e) => e.riderId === rider.id);
    const rParcels = riderEntries.reduce((sum, e) => sum + (e.parcels || 0), 0);
    const rBase = riderEntries.reduce((sum, e) => sum + (e.baseAmount || 0), 0);
    const rIncentive = riderEntries.reduce((sum, e) => sum + (e.incentiveAmount || 0), 0);
    const rGross = riderEntries.reduce((sum, e) => sum + (e.totalEarnings || 0), 0);
    const rPaid = riderEntries
      .filter((e) => e.status === 'Paid')
      .reduce((sum, e) => sum + (e.totalEarnings || 0), 0);
    const rUnpaid = riderEntries
      .filter((e) => e.status === 'Unpaid')
      .reduce((sum, e) => sum + (e.totalEarnings || 0), 0);
    const unpaidCount = riderEntries.filter((e) => e.status === 'Unpaid').length;

    const row = [
      index + 1,
      rider.id,
      rider.name,
      rider.phone || 'N/A',
      rider.vehicleType || 'Hero Splendor (Bike)',
      rider.active !== false ? 'Active' : 'Inactive',
      rider.baseRate ?? 13,
      rider.incentiveRate ?? 2,
      rider.joinedDate || 'N/A',
      rParcels,
      rBase,
      rIncentive,
      rGross,
      rPaid,
      rUnpaid,
      unpaidCount,
    ];
    lines.push(row.map(escapeCsvCell).join(','));
  });

  lines.push(''); // Blank row
  lines.push(''); // Blank row

  // 2. DETAILED DELIVERY LEDGER
  lines.push('=== ALL DELIVERY RECORDS LEDGER ===');
  const deliveryHeaders = [
    'Sl No',
    'Date',
    'Rider ID',
    'Rider Name',
    'Rider Phone',
    'Parcels Delivered',
    'Base Rate Applied (Rs)',
    'Base Amount (Rs)',
    'Incentive Rate Applied (Rs)',
    'Incentive Amount (Rs)',
    'Gross Day Earnings (Rs)',
    'Payment Status',
    'Settlement Reference ID',
    'Settlement Date',
  ];
  lines.push(deliveryHeaders.map(escapeCsvCell).join(','));

  entries.forEach((entry, idx) => {
    const rider = riders.find((r) => r.id === entry.riderId);
    const row = [
      idx + 1,
      entry.date,
      entry.riderId,
      entry.riderName,
      rider?.phone || 'N/A',
      entry.parcels,
      (entry as any).appliedBaseRate ?? entry.baseRate ?? 13,
      entry.baseAmount,
      (entry as any).appliedIncentiveRate ?? entry.incentiveRate ?? 2,
      entry.incentiveAmount,
      entry.totalEarnings,
      entry.status,
      entry.settlementId || 'N/A',
      entry.paidAt ? formatDateDisplay(entry.paidAt) : 'N/A',
    ];
    lines.push(row.map(escapeCsvCell).join(','));
  });

  triggerDownload(lines.join('\r\n'), fileName);
}

/**
 * Single Rider Download: Generates and triggers clean CSV/Excel download of an
 * individual rider's full delivery breakdown, vehicle info, and payout ledger.
 */
export function exportSingleRiderToCSV(options: {
  userName: string;
  userEmail: string;
  rider: Rider;
  entries: DeliveryEntry[];
  settlements?: SettlementRecord[];
}): void {
  const { userName, userEmail, rider, entries } = options;
  const riderEntries = entries
    .filter((e) => e.riderId === rider.id)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const todayStr = getTodayDateString();
  const cleanRiderName = (rider.name || 'Rider').replace(/[^a-zA-Z0-9]/g, '_');
  const fileName = `Rider_Statement_${cleanRiderName}_${todayStr}.csv`;

  // Rider metrics
  const totalParcels = riderEntries.reduce((sum, e) => sum + (e.parcels || 0), 0);
  const totalBase = riderEntries.reduce((sum, e) => sum + (e.baseAmount || 0), 0);
  const totalIncentive = riderEntries.reduce((sum, e) => sum + (e.incentiveAmount || 0), 0);
  const totalGross = riderEntries.reduce((sum, e) => sum + (e.totalEarnings || 0), 0);
  const totalPaid = riderEntries
    .filter((e) => e.status === 'Paid')
    .reduce((sum, e) => sum + (e.totalEarnings || 0), 0);
  const totalUnpaid = riderEntries
    .filter((e) => e.status === 'Unpaid')
    .reduce((sum, e) => sum + (e.totalEarnings || 0), 0);
  const unpaidCount = riderEntries.filter((e) => e.status === 'Unpaid').length;

  const lines: string[] = [];

  // Metadata Header Block
  lines.push('=== COURIER RIDER PAYOUT - INDIVIDUAL RIDER STATEMENT ===');
  lines.push(`Rider Name,${escapeCsvCell(rider.name)},Contact Phone,${escapeCsvCell(rider.phone || 'N/A')}`);
  lines.push(`Vehicle Type,${escapeCsvCell(rider.vehicleType || 'Bike')},Status,${rider.active !== false ? 'Active' : 'Inactive'}`);
  lines.push(`Assigned Base Rate,Rs. ${rider.baseRate ?? 13} / pkt,Assigned Incentive Rate,Rs. ${rider.incentiveRate ?? 2} / pkt`);
  lines.push(`Joined Hub Date,${escapeCsvCell(rider.joinedDate || 'N/A')},Export Date,${escapeCsvCell(todayStr)}`);
  lines.push(`Managed Under Hub,${escapeCsvCell(userName)},Hub Contact Email,${escapeCsvCell(userEmail)}`);
  lines.push(''); // Blank row

  // Financial Snapshot
  lines.push('=== FINANCIAL SUMMARY & EARNINGS SNAPSHOT ===');
  lines.push(`Total Delivered Parcels,${totalParcels} pkts`);
  lines.push(`Total Base Earnings,Rs. ${totalBase.toLocaleString('en-IN')}`);
  lines.push(`Total Incentives Earned,Rs. ${totalIncentive.toLocaleString('en-IN')}`);
  lines.push(`Total Gross Earnings,Rs. ${totalGross.toLocaleString('en-IN')}`);
  lines.push(`Total Settled / Paid,Rs. ${totalPaid.toLocaleString('en-IN')}`);
  lines.push(`Current Pending Unpaid Due,Rs. ${totalUnpaid.toLocaleString('en-IN')}`);
  lines.push(`Pending Unpaid Deliveries,${unpaidCount} dates`);
  lines.push(''); // Blank row

  // Delivery Ledger
  lines.push('=== COMPLETE DATE-BY-DATE DELIVERY LEDGER ===');
  const headers = [
    'Sl No',
    'Delivery Date',
    'Parcels Delivered',
    'Base Rate Applied (Rs)',
    'Base Amount (Rs)',
    'Incentive Rate (Rs)',
    'Incentive Amount (Rs)',
    'Gross Earnings (Rs)',
    'Advance Amount (Rs)',
    'Advance Date',
    'Payment Status',
    'Settlement Reference ID',
    'Settled Date',
  ];
  lines.push(headers.map(escapeCsvCell).join(','));

  riderEntries.forEach((entry, idx) => {
    const row = [
      idx + 1,
      entry.date,
      entry.parcels,
      (entry as any).appliedBaseRate ?? entry.baseRate ?? 13,
      entry.baseAmount,
      (entry as any).appliedIncentiveRate ?? entry.incentiveRate ?? 2,
      entry.incentiveAmount,
      entry.totalEarnings,
      entry.advanceAmount || 0,
      entry.advanceDate || 'N/A',
      entry.status,
      entry.settlementId || 'N/A',
      entry.paidAt ? formatDateDisplay(entry.paidAt) : 'N/A',
    ];
    lines.push(row.map(escapeCsvCell).join(','));
  });

  triggerDownload(lines.join('\r\n'), fileName);
}
