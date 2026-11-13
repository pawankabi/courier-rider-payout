/**
 * Master Accounting Engine ("एकल शुद्ध हिसाब-किताब इंजन")
 * 
 * UNIVERSAL COURIER HUB ARITHMETIC CONSTITUTION:
 * 1. Zero Rupee Loss to Hub. Zero Rupee Loss to Rider.
 * 2. Universal, generic, bank-grade mathematics (NO hardcoded rider names, NO special cases).
 * 3. Single Source of Truth: All screens (Dashboard, Settlements, Riders, Advances, Statements, SMS)
 *    derive from this engine only.
 * 
 * CORE FORMULAS:
 * 1. Gross Earnings = Delivered Parcels * Rate + Active Incentives
 * 2. Advance to Deduct = min(Gross Earnings, Total Active Advance)
 * 3. Net Cash Paid to Rider = max(0, Gross Earnings - Advance to Deduct) [Always >= 0]
 * 4. Remaining Advance = Total Active Advance - Advance to Deduct [Always >= 0, Exactly ONCE, never doubled]
 */

import { DeliveryEntry, Rider, RiderAdvanceEntry, RiderIncentiveEntry, SettlementRecord } from '../types';
import { formatINR, formatDateDisplay, getTodayDateString } from './formatters';

export interface RiderFinancialState {
  rawAdvance: number;
  rawIncentive: number;
  netAdvance: number;
  netIncentive: number;
  unsettledAdvancesCount: number;
  unsettledIncentivesCount: number;
}

export interface MasterSettlementResult {
  riderId: string;
  riderName: string;
  riderPhone: string;
  startDate: string;
  endDate: string;
  totalParcels: number;
  deliveryBaseAmount: number;
  deliveryIncentiveAmount: number;
  deliveryEarnings: number;
  activeIncentives: RiderIncentiveEntry[];
  totalIncentive: number;
  grossTotal: number;
  currentOutstandingAdvance: number;
  advanceDeducted: number;
  netPayableToRider: number;
  remainingAdvance: number;
  status: 'payable' | 'recovery_due' | 'zero';
  statusLabel: string;
  smsText: string;
}

export interface UnifiedLedgerRow {
  id: string;
  originalId: string;
  rawDate: string;
  sortTimestamp: number;
  formattedDate: string;
  type: 'advance' | 'incentive' | 'salary' | 'payment';
  entryKind: 'PLUS_EARNING' | 'MINUS_ADVANCE';
  typeLabel: string;
  title: string;
  subTitle?: string;
  plusAmount: number;
  minusAmount: number;
  runningBalance: number;
  runningBalanceLabel: string;
}

export interface UnifiedLedgerResult {
  timelineRows: UnifiedLedgerRow[];
  totalPlus: number;
  totalMinus: number;
  netBalance: number;
  rawDifference: number; // positive = hub owes rider, negative = rider owes hub, 0 = settled
  balanceStatus: 'rider_due' | 'payable' | 'settled';
  balanceLabel: string;
  adminBalanceLabel: string;
  riderBalanceLabel: string;
  outstandingAdvance: number;
  outstandingIncentive: number;
}

/**
 * Filter out synthetic or ghost advance entries permanently.
 */
export function purgeCorruptAdvances(advances: RiderAdvanceEntry[]): RiderAdvanceEntry[] {
  if (!Array.isArray(advances)) return [];
  const seen = new Set<string>();
  const cleanList: RiderAdvanceEntry[] = [];

  for (const adv of advances) {
    if (!adv) continue;
    if (adv.isDeleted === true || (adv as any).status === 'DELETED' || (adv as any).status === 'RESET_ARCHIVED') {
      continue;
    }
    const amt = Number(adv.amount) || 0;
    if (amt <= 0) continue;

    const id = String(adv.id || (adv as any)._id || '').trim();
    if (id.startsWith('settle_adj') || id.startsWith('adv-settlement-implicit')) {
      continue;
    }
    if (adv.reason?.includes('सेटलमेंट समायोजन') && !adv.reason?.includes('बकाया')) {
      continue;
    }

    // Deduplicate by clean ID or signature
    const sig = id ? id : `${adv.date}_${adv.amount}_${adv.reason}`;
    if (!seen.has(sig)) {
      seen.add(sig);
      cleanList.push(adv);
    }
  }

  return cleanList;
}

/**
 * Check if a paid settlement contains an advance ID
 */
function isAdvanceInPaidSettlement(advId: string, settlements?: SettlementRecord[], riderId?: string): boolean {
  if (!advId || !Array.isArray(settlements) || settlements.length === 0) return false;
  const cleanAdvId = advId.trim();

  return settlements.some((s) => {
    if (riderId && s.riderId && String(s.riderId).trim() !== String(riderId).trim()) return false;
    const isPaid = !s.status || s.status.trim().toUpperCase() === 'PAID' || s.status.trim().toUpperCase() === 'SETTLED';
    if (!isPaid) return false;

    // Direct ID match in settledAdvanceIds
    if (Array.isArray(s.settledAdvanceIds) && s.settledAdvanceIds.some((id) => String(id).trim() === cleanAdvId)) {
      return true;
    }

    // Direct settlementId linkage
    if ((s as any).id === cleanAdvId) return true;

    return false;
  });
}

/**
 * Determine if an advance is active and unrecovered
 */
export function isAdvanceActive(
  adv: RiderAdvanceEntry,
  settlements?: SettlementRecord[],
  riderId?: string
): boolean {
  if (!adv) return false;
  const amt = Number(adv.amount) || 0;
  if (amt <= 0) return false;

  // Ignore cash recoveries (handled separately)
  if (adv.isRecovery || adv.type === 'recovery') return false;

  // Explicit status checks
  if (adv.isSettled === true || adv.isDeducted === true || (adv as any).status === 'PAID') {
    return false;
  }

  const advId = String(adv.id || (adv as any)._id || '').trim();

  // If settled in an authentic paid settlement record
  if (isAdvanceInPaidSettlement(advId, settlements, riderId || adv.riderId)) {
    return false;
  }

  return true;
}

/**
 * Determine if an incentive is active and unpaid
 */
export function isIncentiveActive(
  inc: RiderIncentiveEntry,
  settlements?: SettlementRecord[],
  riderId?: string
): boolean {
  if (!inc) return false;
  const amt = Number(inc.amount) || 0;
  if (amt <= 0) return false;

  if (inc.isSettled === true || inc.isPaid === true || (inc as any).status === 'PAID') {
    return false;
  }
  if (inc.settledInPayoutId || inc.settledPayoutId || inc.settlementId) {
    return false;
  }

  const incId = String(inc.id || '').trim();
  if (settlements && Array.isArray(settlements)) {
    const isSettled = settlements.some((s) => {
      if (riderId && s.riderId && String(s.riderId).trim() !== String(riderId).trim()) return false;
      const isPaid = !s.status || s.status.trim().toUpperCase() === 'PAID' || s.status.trim().toUpperCase() === 'SETTLED';
      if (!isPaid) return false;
      return Array.isArray(s.settledIncentiveIds) && s.settledIncentiveIds.some((id) => String(id).trim() === incId);
    });
    if (isSettled) return false;
  }

  return true;
}

/**
 * SINGLE SOURCE OF TRUTH: Calculate Rider Net Outstanding Advance & Incentive
 */
export function calculateRiderFinancialState(
  advances?: RiderAdvanceEntry[],
  incentives?: RiderIncentiveEntry[],
  settlements?: SettlementRecord[],
  riderId?: string
): RiderFinancialState {
  const cleanAdvances = purgeCorruptAdvances(advances || []);
  const cleanIncentives = Array.isArray(incentives) ? incentives : [];

  // 1. Positive unrecovered advances
  const activeAdvances = cleanAdvances.filter((a) => isAdvanceActive(a, settlements, riderId));
  const totalAdvancesTaken = activeAdvances.reduce((sum, a) => sum + (Number(a.amount) || 0), 0);

  // 2. Active cash recoveries deposited by rider (reducing advance)
  const activeRecoveries = cleanAdvances.filter((a) => {
    if (a.isSettled === true || a.isDeducted === true || (a as any).status === 'PAID') return false;
    return Boolean(a.isRecovery || a.type === 'recovery') && (Number(a.amount) || 0) > 0;
  });
  const totalRecoveries = activeRecoveries.reduce((sum, a) => sum + (Number(a.amount) || 0), 0);

  const rawAdvance = Math.max(0, totalAdvancesTaken - totalRecoveries);

  // 3. Active uncredited incentives
  const activeIncentives = cleanIncentives.filter((i) => isIncentiveActive(i, settlements, riderId));
  const rawIncentive = activeIncentives.reduce((sum, i) => sum + (Number(i.amount) || 0), 0);

  // Net offset (Khatabook/Banking standard):
  const netAdvance = Math.max(0, rawAdvance - rawIncentive);
  const netIncentive = Math.max(0, rawIncentive - rawAdvance);

  return {
    rawAdvance,
    rawIncentive,
    netAdvance,
    netIncentive,
    unsettledAdvancesCount: activeAdvances.length,
    unsettledIncentivesCount: activeIncentives.length,
  };
}

/**
 * Universal Settlement Calculation Engine
 */
export function calculateMasterSettlement(
  entries: DeliveryEntry[],
  rider: Rider,
  startDate: string,
  endDate: string,
  advances: RiderAdvanceEntry[] = [],
  incentives: RiderIncentiveEntry[] = [],
  settlements: SettlementRecord[] = [],
  hubName: string = 'सरायकेला कूरियर डिलीवरी हब'
): MasterSettlementResult {
  // 1. Delivery parcels & operational earnings strictly within [startDate, endDate]
  const periodEntries = entries.filter((e) => {
    if (e.riderId !== rider.id) return false;
    if (startDate && e.date < startDate) return false;
    if (endDate && e.date > endDate) return false;
    return true;
  });

  const totalParcels = periodEntries.reduce((sum, e) => sum + (Number(e.parcels) || 0), 0);
  const deliveryBaseAmount = periodEntries.reduce((sum, e) => sum + (Number(e.baseAmount) || 0), 0);
  const deliveryIncentiveAmount = periodEntries.reduce((sum, e) => sum + (Number(e.incentiveAmount) || 0), 0);
  const deliveryEarnings = periodEntries.reduce((sum, e) => sum + (Number(e.totalEarnings) || 0), 0);

  // 2. Active uncredited incentives
  const allIncentives = rider.incentives && rider.incentives.length > 0 ? rider.incentives : incentives;
  const activeIncentives = allIncentives.filter((i) => isIncentiveActive(i, settlements, rider.id));
  const totalIncentive = activeIncentives.reduce((sum, i) => sum + (Number(i.amount) || 0), 0);

  // 3. Gross Earnings
  const grossTotal = deliveryEarnings + totalIncentive;

  // 4. Ground truth current outstanding advance
  const allAdvances = rider.advances && rider.advances.length > 0 ? rider.advances : advances;
  const financialState = calculateRiderFinancialState(allAdvances, allIncentives, settlements, rider.id);
  const currentOutstandingAdvance = financialState.netAdvance;

  // 5. THE UNIVERSAL FORMULA:
  // Advance to Deduct = min(Gross Earnings, Current Outstanding Advance)
  const advanceDeducted = Math.min(grossTotal, currentOutstandingAdvance);
  const netPayableToRider = Math.max(0, grossTotal - advanceDeducted);
  const remainingAdvance = Math.max(0, currentOutstandingAdvance - advanceDeducted);

  let status: 'payable' | 'recovery_due' | 'zero' = 'zero';
  let statusLabel = '⚪ हिसाब चुकता (₹0)';
  let smsText = '';

  if (remainingAdvance > 0) {
    status = 'recovery_due';
    statusLabel = `🔴 हब को लेना बाकी (Recovery Due): ₹${formatINR(remainingAdvance)}`;
    smsText = `नमस्ते ${rider.name}, आपका दिनांक ${formatDateDisplay(startDate)} से ${formatDateDisplay(endDate)} तक कुल पारिश्रमिक ₹${grossTotal} बना, जबकि आपका कुल एडवांस ₹${currentOutstandingAdvance} था। हिसाब के उपरांत आपसे ₹${remainingAdvance} लेना शेष है। कृपया यह राशि कार्यालय में जमा कर दें। धन्यवाद - ${hubName}`;
  } else if (netPayableToRider > 0) {
    status = 'payable';
    statusLabel = `🟢 कुल देय (Net Payable): ₹${formatINR(netPayableToRider)}`;
    smsText = `नमस्ते ${rider.name}, आपका दिनांक ${formatDateDisplay(startDate)} से ${formatDateDisplay(endDate)} तक कुल पारिश्रमिक ₹${grossTotal} बना है। आपका कुल एडवांस ₹${advanceDeducted} समायोजित कर कुल नेट भुगतान ₹${netPayableToRider} कर दिया गया है। धन्यवाद - ${hubName}`;
  } else {
    status = 'zero';
    statusLabel = '⚪ हिसाब चुकता (₹0)';
    smsText = `नमस्ते ${rider.name}, आपका दिनांक ${formatDateDisplay(startDate)} से ${formatDateDisplay(endDate)} तक कुल पारिश्रमिक ₹${grossTotal} और एडवांस ₹${advanceDeducted} समायोजित हुआ। हिसाब चुकता (₹0)। धन्यवाद - ${hubName}`;
  }

  return {
    riderId: rider.id,
    riderName: rider.name,
    riderPhone: rider.phone,
    startDate,
    endDate,
    totalParcels,
    deliveryBaseAmount,
    deliveryIncentiveAmount,
    deliveryEarnings,
    activeIncentives,
    totalIncentive,
    grossTotal,
    currentOutstandingAdvance,
    advanceDeducted,
    netPayableToRider,
    remainingAdvance,
    status,
    statusLabel,
    smsText,
  };
}

/**
 * Execute Settlement: Updates advances cleanly and deterministically.
 * GUARANTEE: The unrecovered advance is stored EXACTLY ONCE. Never duplicated!
 */
export function executeSettlementAdvances(
  currentAdvances: RiderAdvanceEntry[],
  settlementId: string,
  grossTotal: number,
  currentOutstandingAdvance: number,
  riderId: string,
  endDate: string = getTodayDateString(),
  startDate: string = ''
): {
  updatedAdvances: RiderAdvanceEntry[];
  newTotalAdvance: number;
} {
  const cleanAdvances = purgeCorruptAdvances(currentAdvances);
  const nowIso = new Date().toISOString();

  // CASE 1: Gross Earnings >= Advance (All advance is fully cleared!)
  if (grossTotal >= currentOutstandingAdvance) {
    const updated = cleanAdvances.map((adv) => {
      if (adv.isSettled || (adv as any).status === 'PAID') return adv;
      return {
        ...adv,
        isSettled: true,
        isDeducted: true,
        status: 'PAID',
        settledPayoutId: settlementId,
        settlementId,
        updatedAt: nowIso,
      };
    });

    return {
      updatedAdvances: updated,
      newTotalAdvance: 0,
    };
  }

  // CASE 2: Gross Earnings < Advance (Partial Recovery, Deficit Remaining)
  // e.g. Advance = ₹2,000, Gross = ₹1,250 -> Remaining Debt = ₹750!
  const remainingDebt = Math.max(0, currentOutstandingAdvance - grossTotal);

  // Mark all past active advances settled up to grossTotal, and replace them with
  // EXACTLY ONE clean residual debt entry of ₹750.
  const pastAdvances = cleanAdvances.map((adv) => {
    if (adv.isSettled || (adv as any).status === 'PAID') return adv;
    return {
      ...adv,
      isSettled: true,
      isDeducted: true,
      status: 'PAID',
      settledPayoutId: settlementId,
      settlementId,
      updatedAt: nowIso,
    };
  });

  const deficitReason = startDate
    ? `बकाया एडवांस (सेटलमेंट शेष: ${formatDateDisplay(startDate)} से ${formatDateDisplay(endDate)})`
    : `बकाया एडवांस (सेटलमेंट उपरांत शेष)`;

  const singleResidualAdvance: RiderAdvanceEntry = {
    id: `adv_rem_${settlementId}`,
    riderId,
    amount: remainingDebt,
    remainingAmount: remainingDebt,
    date: endDate,
    createdAt: nowIso,
    updatedAt: nowIso,
    reason: deficitReason,
    isSettled: false,
    isDeducted: false,
    status: 'UNPAID',
    runningBalance: remainingDebt,
  };

  const updatedAdvances = [singleResidualAdvance, ...pastAdvances];

  return {
    updatedAdvances,
    newTotalAdvance: remainingDebt,
  };
}

/**
 * Pure Single-Entry Rider Ledger Statement (Passbook)
 */
export function calculateMasterLedger(
  rider: Rider,
  settlements: SettlementRecord[] = [],
  sortOrder: 'asc' | 'desc' = 'desc'
): UnifiedLedgerResult {
  const cleanAdvances = purgeCorruptAdvances(rider.advances || []);
  const cleanSettlements = Array.isArray(settlements)
    ? settlements.filter((s) => s && s.riderId === rider.id && (!s.status || s.status.trim().toUpperCase() === 'PAID' || s.status.trim().toUpperCase() === 'SETTLED'))
    : [];

  const rawList: Array<{
    id: string;
    originalId: string;
    rawDate: string;
    sortTimestamp: number;
    formattedDate: string;
    type: 'advance' | 'incentive' | 'salary' | 'payment';
    entryKind: 'PLUS_EARNING' | 'MINUS_ADVANCE';
    typeLabel: string;
    title: string;
    subTitle?: string;
    plusAmount: number;
    minusAmount: number;
  }> = [];

  // 1. Advance Entries Taken by Rider (Minus -)
  // Skip carry-forward tokens (adv_rem_*, adv_deficit_*, settlement_adv_*) because original advances + settlements already represent them without doubling!
  cleanAdvances.forEach((adv) => {
    const amt = Number(adv.amount) || 0;
    if (amt <= 0) return;
    const advId = String(adv.id || (adv as any)._id || '').trim();
    if (
      advId.startsWith('adv_rem_') ||
      advId.startsWith('adv_deficit_') ||
      advId.startsWith('settlement_adv_') ||
      advId.endsWith('_rem')
    ) {
      return;
    }
    const isRec = Boolean(adv.isRecovery || adv.type === 'recovery');
    const dateVal = adv.date || adv.createdAt || '';
    const timestamp = dateVal ? new Date(dateVal).getTime() : 0;

    if (isRec) {
      // Cash recovery returned by rider is a (+) entry
      rawList.push({
        id: `rec-${adv.id}`,
        originalId: adv.id,
        rawDate: dateVal,
        sortTimestamp: timestamp,
        formattedDate: adv.date ? formatDateDisplay(adv.date) : formatDateDisplay(adv.createdAt),
        type: 'advance',
        entryKind: 'PLUS_EARNING',
        typeLabel: '(+) नकद रिकवरी',
        title: adv.reason || 'नकद रिकवरी / जमा',
        subTitle: 'राइडर द्वारा हब में नकद जमा (Credit)',
        plusAmount: amt,
        minusAmount: 0,
      });
    } else {
      rawList.push({
        id: `adv-${adv.id}`,
        originalId: adv.id,
        rawDate: dateVal,
        sortTimestamp: timestamp,
        formattedDate: adv.date ? formatDateDisplay(adv.date) : formatDateDisplay(adv.createdAt),
        type: 'advance',
        entryKind: 'MINUS_ADVANCE',
        typeLabel: '(-) एडवांस',
        title: adv.reason || 'नकद एडवांस',
        subTitle: adv.isSettled ? 'सेटलमेंट में समायोजित (Settled)' : 'सक्रिय बकाया (Unsettled)',
        plusAmount: 0,
        minusAmount: amt,
      });
    }
  });

  // 2. Active standalone incentives (not already in a settlement or deleted)
  (rider.incentives || []).forEach((inc) => {
    if (!inc || (inc as any).isDeleted === true || (inc as any).status === 'DELETED' || (inc as any).status === 'RESET_ARCHIVED') return;
    const amt = Number(inc.amount) || 0;
    if (amt <= 0) return;
    if (inc.isSettled || inc.isPaid || (inc as any).status === 'PAID' || inc.settlementId || inc.settledPayoutId || inc.settledInPayoutId) return;
    const dateVal = inc.date || inc.createdAt || '';
    const timestamp = dateVal ? new Date(dateVal).getTime() : 0;

    rawList.push({
      id: `inc-${inc.id}`,
      originalId: inc.id,
      rawDate: dateVal,
      sortTimestamp: timestamp,
      formattedDate: inc.date ? formatDateDisplay(inc.date) : formatDateDisplay(inc.createdAt),
      type: 'incentive',
      entryKind: 'PLUS_EARNING',
      typeLabel: '(+) इंसेंटिव',
      title: inc.reason || 'इंसेंटिव / बोनस',
      subTitle: 'सक्रिय बोनस (Unsettled)',
      plusAmount: amt,
      minusAmount: 0,
    });
  });

  // 3. Paid Settlements:
  cleanSettlements.forEach((sal) => {
    const dateVal = sal.paidAt ? sal.paidAt.split('T')[0] : sal.endDate;
    const timestamp = new Date(sal.paidAt || sal.endDate).getTime() || 0;
    const grossTotal = Number(sal.grossTotal) || 0;
    const advAmount = Number(sal.advanceAmount) || 0;
    const netCashPaid = Math.max(0, grossTotal - advAmount);

    // Plus (+) Entry: Salary Gross Earnings
    rawList.push({
      id: `sal-${sal.id}`,
      originalId: sal.id,
      rawDate: dateVal,
      sortTimestamp: timestamp,
      formattedDate: formatDateDisplay(dateVal),
      type: 'salary',
      entryKind: 'PLUS_EARNING',
      typeLabel: '(+) पे-आउट',
      title: `सैलरी पे-आउट (${formatDateDisplay(sal.startDate)} से ${formatDateDisplay(sal.endDate)})`,
      subTitle: `${sal.totalParcels} पार्सल • सकल कमाई: ${formatINR(grossTotal)} | एडवांस कटौती: ${formatINR(advAmount)} | नकद भुगतान: ${formatINR(netCashPaid)}`,
      plusAmount: grossTotal,
      minusAmount: 0,
    });

    // Minus (-) Entry: Net cash disbursed in hand
    if (netCashPaid > 0) {
      rawList.push({
        id: `payout-cash-${sal.id}`,
        originalId: sal.id,
        rawDate: dateVal,
        sortTimestamp: timestamp + 2,
        formattedDate: formatDateDisplay(dateVal),
        type: 'payment',
        entryKind: 'MINUS_ADVANCE',
        typeLabel: '(-) नकद भुगतान',
        title: `नेट सैलरी नकद भुगतान (${formatDateDisplay(sal.startDate)} से ${formatDateDisplay(sal.endDate)})`,
        subTitle: `हब द्वारा राइडर को नेट नकद / ऑनलाइन हस्तांतरण (${formatINR(netCashPaid)})`,
        plusAmount: 0,
        minusAmount: netCashPaid,
      });
    }
  });

  // Deduplicate entries by ID
  const seenIds = new Set<string>();
  const uniqueList: typeof rawList = [];
  for (const item of rawList) {
    if (!seenIds.has(item.id)) {
      seenIds.add(item.id);
      uniqueList.push(item);
    }
  }

  // Sort chronological oldest first for running balance simulation
  uniqueList.sort((a, b) => {
    if (a.sortTimestamp !== b.sortTimestamp) return a.sortTimestamp - b.sortTimestamp;
    return a.entryKind === 'MINUS_ADVANCE' ? -1 : 1;
  });

  let running = 0;
  const processedRows: UnifiedLedgerRow[] = uniqueList.map((entry) => {
    if (entry.entryKind === 'PLUS_EARNING') {
      running += entry.plusAmount;
    } else {
      running -= entry.minusAmount;
    }

    const absBal = Math.abs(running);
    let label = '⚪ हिसाब चुकता: ₹0';
    if (running < -0.01) {
      label = `🔴 राइडर से ${formatINR(absBal)} पाना बाकी`;
    } else if (running > 0.01) {
      label = `🟢 राइडर को ${formatINR(absBal)} देना बाकी`;
    }

    return {
      ...entry,
      runningBalance: running,
      runningBalanceLabel: label,
    };
  });

  const totalPlus = processedRows.reduce((sum, r) => sum + r.plusAmount, 0);
  const totalMinus = processedRows.reduce((sum, r) => sum + r.minusAmount, 0);
  const rawDifference = totalPlus - totalMinus;
  const netBalance = Math.abs(rawDifference);

  let balanceStatus: 'rider_due' | 'payable' | 'settled' = 'settled';
  let adminBalanceLabel = '⚪ हिसाब चुकता: ₹0';
  let riderBalanceLabel = '⚪ हिसाब चुकता: ₹0';

  if (rawDifference < -0.01) {
    balanceStatus = 'rider_due';
    adminBalanceLabel = `🔴 राइडर से ${formatINR(netBalance)} पाना बाकी है`;
    riderBalanceLabel = `🔴 आपसे हब ${formatINR(netBalance)} पाएगा`;
  } else if (rawDifference > 0.01) {
    balanceStatus = 'payable';
    adminBalanceLabel = `🟢 राइडर को ${formatINR(netBalance)} देना बाकी है`;
    riderBalanceLabel = `🟢 आपको हब से ${formatINR(netBalance)} लेना है`;
  }

  const financialState = calculateRiderFinancialState(cleanAdvances, rider.incentives, cleanSettlements, rider.id);

  if (sortOrder === 'desc') {
    processedRows.reverse();
  }

  return {
    timelineRows: processedRows,
    totalPlus,
    totalMinus,
    netBalance,
    rawDifference,
    balanceStatus,
    balanceLabel: adminBalanceLabel,
    adminBalanceLabel,
    riderBalanceLabel,
    outstandingAdvance: financialState.netAdvance,
    outstandingIncentive: financialState.netIncentive,
  };
}
