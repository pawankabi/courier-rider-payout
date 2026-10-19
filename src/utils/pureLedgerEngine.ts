/**
 * Pure Ledger Calculation Engine (Ground Truth Single Source of Truth)
 * 
 * Strict Arithmetic Protocol:
 * - Plus (+) Entries: Delivered parcel payouts, active daily deliveries, incentives, and festival bonuses earned.
 * - Minus (-) Entries: Advances taken, fuel/cash cash-outs, and cash payouts settled.
 * - Net Balance = sum(Delivery Earnings + Bonuses) - sum(Advances + Fuel Cashouts + Settlements Paid)
 * 
 * Contextual Hindi Labels:
 * Case 1: Rider Owes Hub (Advances > Earnings, e.g. Lakhindar Mahato: Advances ₹11,445 - Salary Payout ₹8,810 = ₹2,635):
 *   - Admin: 🔴 राइडर से ₹2,635 पाना बाकी है
 *   - Rider: 🔴 आपसे हब ₹2,635 पाएगा
 * 
 * Case 2: Hub Owes Rider (Earnings > Advances):
 *   - Admin: 🟢 राइडर को ₹[Amount] देना बाकी है
 *   - Rider: 🟢 आपको हब से ₹[Amount] लेना है
 * 
 * Case 3: Zero Balance / Cleared Account:
 *   - Both Admin & Rider: ⚪ हिसाब चुकता: ₹0
 */

import { PublicRiderStatement, RiderAdvanceEntry, RiderIncentiveEntry } from '../types';
import { formatINR, formatDateDisplay } from './formatters';

export interface LedgerSalaryRecord {
  id: string;
  startDate: string;
  endDate: string;
  totalParcels: number;
  baseAmount?: number;
  incentiveAmount?: number;
  grossTotal: number;
  advanceAmount: number;
  advanceDate?: string;
  advanceReason?: string;
  netTotal: number;
  paidAt?: string;
  status?: string;
}

export interface UnifiedTransactionItem {
  id: string;
  originalId: string;
  rawDate: string;
  sortTimestamp: number;
  formattedDate: string;
  type: 'advance' | 'incentive' | 'salary' | 'delivery' | 'payment';
  entryKind: 'PLUS_EARNING' | 'MINUS_ADVANCE';
  typeLabel: string;
  title: string;
  subTitle?: string;
  salaryDetails?: {
    startDate: string;
    endDate: string;
    totalParcels: number;
    baseAmount?: number;
    incentiveAmount?: number;
    grossTotal: number;
    advanceDeducted: number;
    netPaid: number;
    status?: string;
  };
  plusAmount: number;
  minusAmount: number;
  paidToRider: number;
  settledOrEarned: number;
  runningBalance: number;
  runningBalanceLabel: string;
}

export interface PureLedgerCalculationResult {
  timelineRows: UnifiedTransactionItem[];
  totalPlus: number;
  totalMinus: number;
  totalPaidToRider: number;
  totalSettledOrEarned: number;
  unsettledAdvances: number;
  unsettledIncentives: number;
  unpaidSalary: number;
  netBalance: number;
  rawDifference: number; // positive = hub owes rider, negative = rider owes hub, 0 = settled
  balanceStatus: 'rider_due' | 'payable' | 'settled';
  balanceLabel: string;
  adminBalanceLabel: string;
  riderBalanceLabel: string;
}

/**
 * Filter out synthetic, phantom, or ghost advance entries permanently.
 */
export function isPhantomOrSyntheticAdvance(adv: Partial<RiderAdvanceEntry>): boolean {
  if (!adv) return true;
  const amt = Number(adv.amount) || 0;
  if (amt <= 0) return true;
  const id = adv.id || '';
  if (
    id.startsWith('adv_cf_') ||
    id.startsWith('settle_adj') ||
    id.startsWith('adv-settlement-implicit') ||
    id.includes('phantom') ||
    id.includes('ghost')
  ) {
    return true;
  }
  const reason = adv.reason || '';
  if (
    reason.includes('सेटलमेंट समायोजन') ||
    reason.includes('Synthetic') ||
    reason.includes('Auto Settlement Adjustment')
  ) {
    return true;
  }
  return false;
}

/**
 * Purge phantom and duplicate advances from an array.
 */
export function purgePhantomAdvances(advances: RiderAdvanceEntry[]): RiderAdvanceEntry[] {
  if (!Array.isArray(advances)) return [];
  const seenIds = new Set<string>();
  const cleanList: RiderAdvanceEntry[] = [];

  for (const adv of advances) {
    if (isPhantomOrSyntheticAdvance(adv)) continue;
    const cleanId = (adv.id || '').trim();
    if (cleanId && seenIds.has(cleanId)) continue;
    if (cleanId) seenIds.add(cleanId);
    cleanList.push(adv);
  }
  return cleanList;
}

/**
 * Pure arithmetic calculation of rider ledger timeline and net balance.
 * Reflects real-time ground truth from active database collections.
 */
export function calculatePureRiderLedger(
  statement: PublicRiderStatement | null | undefined,
  sortOrder: 'asc' | 'desc' = 'desc',
  isRider: boolean = false,
  externalSettlements?: any[]
): PureLedgerCalculationResult {
  if (!statement) {
    return {
      timelineRows: [],
      totalPlus: 0,
      totalMinus: 0,
      totalPaidToRider: 0,
      totalSettledOrEarned: 0,
      unsettledAdvances: 0,
      unsettledIncentives: 0,
      unpaidSalary: 0,
      netBalance: 0,
      rawDifference: 0,
      balanceStatus: 'settled',
      balanceLabel: '⚪ हिसाब चुकता: ₹0',
      adminBalanceLabel: '⚪ हिसाब चुकता: ₹0',
      riderBalanceLabel: '⚪ हिसाब चुकता: ₹0',
    };
  }

  const riderNameLower = (statement.riderName || '').toLowerCase();
  const riderIdLower = (statement.riderId || '').toLowerCase();
  const isLakhindar = riderNameLower.includes('lakhindar') || riderIdLower.includes('lakhindar') || riderNameLower.includes('लखिंदर');

  // 1. Gather Authentic Advances (excluding phantom/ghost duplicates)
  const validAdvances: RiderAdvanceEntry[] = purgePhantomAdvances(statement.advances || []);

  // 2. Gather Authentic Incentives
  const validIncentives: RiderIncentiveEntry[] = (statement.incentives || []).filter((i) => {
    return (Number(i.amount) || 0) > 0;
  });

  // 3. Gather Authentic Settlements / Salaries (deduplicating to prevent double-counting)
  const seenSalKeys = new Set<string>();
  const uniqueSalaries: any[] = [];

  (statement.salaries || []).forEach((s: any) => {
    const key = `${s.startDate}_${s.endDate}`;
    if (!seenSalKeys.has(key)) {
      seenSalKeys.add(key);
      uniqueSalaries.push(s);
    }
  });

  if (externalSettlements && Array.isArray(externalSettlements)) {
    externalSettlements
      .filter((s: any) => s && (s.riderId === statement.riderId || (statement.riderPhone && s.riderPhone === statement.riderPhone)))
      .forEach((s: any) => {
        const key = `${s.startDate}_${s.endDate}`;
        if (!seenSalKeys.has(key)) {
          seenSalKeys.add(key);
          uniqueSalaries.push(s);
        }
      });
  }

  const salaries: LedgerSalaryRecord[] = uniqueSalaries.map((s: any) => ({
    id: s.id,
    startDate: s.startDate,
    endDate: s.endDate,
    totalParcels: Number(s.totalParcels) || 0,
    baseAmount: Number(s.baseAmount) || 0,
    incentiveAmount: Number(s.incentiveAmount) || 0,
    grossTotal: Number(s.grossTotal) || 0,
    advanceAmount: Number(s.advanceAmount) || 0,
    advanceDate: s.advanceDate,
    advanceReason: s.advanceReason,
    netTotal: Number(s.netTotal) || 0,
    paidAt: s.paidAt,
    status: s.status || 'PAID',
  }));


  // 4. केवल वास्तविक सक्रिय (Unsettled) प्रविष्टियों का निर्माण
  const rawList: DraftLedgerEntry[] = [];

  // (A) सक्रिय अनपेड एडवांस और नकद जमा
  validAdvances.forEach((adv: any) => {
    const amt = Number(adv.amount) || 0;
    const isSettled = Boolean(adv.isSettled || adv.isDeducted || (adv as any).status === 'PAID');
    const isRecovery = Boolean(adv.isRecovery || adv.type === 'recovery');
    const dateVal = adv.date || adv.createdAt || '';
    const timestamp = dateVal ? new Date(dateVal).getTime() : 0;

    if (isRecovery) {
      rawList.push({
        id: `rec-${adv.id}`,
        originalId: adv.id,
        rawDate: dateVal,
        sortTimestamp: timestamp,
        formattedDate: formatDateDisplay(dateVal),
        type: 'advance',
        entryKind: 'PLUS_EARNING',
        typeLabel: '(+) नकद जमा',
        title: adv.reason || 'नकद जमा (Cash Recovery)',
        subTitle: 'राइडर द्वारा जमा किया गया नकद',
        plusAmount: Math.abs(amt),
        minusAmount: 0,
      });
    } else if (!isSettled && amt > 0) {
      rawList.push({
        id: `adv-${adv.id}`,
        originalId: adv.id,
        rawDate: dateVal,
        sortTimestamp: timestamp,
        formattedDate: formatDateDisplay(dateVal),
        type: 'advance',
        entryKind: 'MINUS_ADVANCE',
        typeLabel: '(-) एडवांस',
        title: adv.reason || 'एडवांस / शॉर्ट कैश',
        subTitle: 'सक्रिय एडवांस बकाया',
        plusAmount: 0,
        minusAmount: amt,
      });
    }
  });

  // (B) सक्रिय अनपेड इंसेंटिव
  validIncentives.forEach((inc: any) => {
    const amt = Number(inc.amount) || 0;
    const isSettled = Boolean(inc.isSettled || inc.isPaid || (inc as any).status === 'PAID');
    const dateVal = inc.date || inc.createdAt || '';
    const timestamp = dateVal ? new Date(dateVal).getTime() : 0;

    if (!isSettled && amt > 0) {
      rawList.push({
        id: `inc-${inc.id}`,
        originalId: inc.id,
        rawDate: dateVal,
        sortTimestamp: timestamp,
        formattedDate: formatDateDisplay(dateVal),
        type: 'incentive',
        entryKind: 'PLUS_EARNING',
        typeLabel: '(+) इंसेंटिव',
        title: inc.reason || 'इंसेंटिव / बोनस',
        subTitle: 'सक्रिय इंसेंटिव',
        plusAmount: amt,
        minusAmount: 0,
      });
    }
  });

  // (C) सैलरी (केवल वही जो अनपेड / पेंडिंग है)
  salaries.forEach((sal: any) => {
    const isPaid = sal.status && sal.status.trim().toUpperCase() === 'PAID';
    const dateVal = sal.paidAt ? sal.paidAt.split('T')[0] : sal.endDate;
    const timestamp = new Date(sal.paidAt || sal.endDate).getTime() || 0;
    const netTotal = Number(sal.netTotal) || 0;

    if (!isPaid && netTotal > 0) {
      rawList.push({
        id: `sal-${sal.id}`,
        originalId: sal.id,
        rawDate: dateVal,
        sortTimestamp: timestamp,
        formattedDate: formatDateDisplay(dateVal),
        type: 'salary',
        entryKind: 'PLUS_EARNING',
        typeLabel: '(+) लंबित सैलरी',
        title: `सैलरी (${formatDateDisplay(sal.startDate)} से ${formatDateDisplay(sal.endDate)})`,
        subTitle: 'भुगतान हेतु शेष',
        plusAmount: netTotal,
        minusAmount: 0,
      });
    }
  });

  // तारीखवार क्रमबद्ध
  rawList.sort((a, b) => a.sortTimestamp - b.sortTimestamp);

  // रनिंग बैलेंस गणना
  let running = 0;
  const processedRows: UnifiedTransactionItem[] = rawList.map((entry) => {
    if (entry.entryKind === 'PLUS_EARNING') {
      running += entry.plusAmount;
    } else {
      running -= entry.minusAmount;
    }

    const absBal = Math.abs(running);
    let label = '⚪ हिसाब चुकता: ₹0';
    if (running < -0.01) {
      label = isRider ? `🔴 देना है: ${formatINR(absBal)}` : `🔴 पाना बाकी: ${formatINR(absBal)}`;
    } else if (running > 0.01) {
      label = isRider ? `🟢 लेना है: ${formatINR(absBal)}` : `🟢 देना बाकी: ${formatINR(absBal)}`;
    }

    return {
      id: entry.id,
      originalId: entry.originalId,
      rawDate: entry.rawDate,
      sortTimestamp: entry.sortTimestamp,
      formattedDate: entry.formattedDate,
      type: entry.type,
      entryKind: entry.entryKind,
      typeLabel: entry.typeLabel,
      title: entry.title,
      subTitle: entry.subTitle,
      plusAmount: entry.plusAmount,
      minusAmount: entry.minusAmount,
      paidToRider: 0,
      settledOrEarned: 0,
      runningBalance: running,
      runningBalanceLabel: label,
    };
  });

  const finalDifference = running;
  const netBalance = Math.abs(finalDifference);

  let balanceStatus: 'rider_due' | 'payable' | 'settled' = 'settled';
  let adminBalanceLabel = '⚪ हिसाब चुकता: ₹0';
  let riderBalanceLabel = '⚪ हिसाब चुकता: ₹0';

  if (finalDifference < -0.01) {
    balanceStatus = 'rider_due';
    adminBalanceLabel = `🔴 राइडर से ${formatINR(netBalance)} पाना बाकी है`;
    riderBalanceLabel = `🔴 आपको हब को ${formatINR(netBalance)} देना है`;
  } else if (finalDifference > 0.01) {
    balanceStatus = 'payable';
    adminBalanceLabel = `🟢 राइडर को ${formatINR(netBalance)} देना बाकी है`;
    riderBalanceLabel = `🟢 आपको हब से ${formatINR(netBalance)} लेना है`;
  }

  const balanceLabel = isRider ? riderBalanceLabel : adminBalanceLabel;

  if (sortOrder === 'desc') {
    processedRows.reverse();
  }

  const activeAdvTotal = rawList.filter(r => r.entryKind === 'MINUS_ADVANCE').reduce((s, r) => s + r.minusAmount, 0);
  const activeIncTotal = rawList.filter(r => r.type === 'incentive').reduce((s, r) => s + r.plusAmount, 0);
  const unpaidSalTotal = rawList.filter(r => r.type === 'salary').reduce((s, r) => s + r.plusAmount, 0);

  return {
    timelineRows: processedRows,
    totalPlus: processedRows.reduce((acc, row) => acc + row.plusAmount, 0),
    totalMinus: processedRows.reduce((acc, row) => acc + row.minusAmount, 0),
    totalPaidToRider: 0,
    totalSettledOrEarned: 0,
    unsettledAdvances: balanceStatus === 'rider_due' ? netBalance : activeAdvTotal,
    unsettledIncentives: activeIncTotal,
    unpaidSalary: unpaidSalTotal,
    rawDifference: finalDifference,
    balanceStatus,
    balanceLabel,
    adminBalanceLabel,
    riderBalanceLabel,
  };
}

// Default export alias for seamless consumer drop-in
export const calculateRiderLedger = calculatePureRiderLedger;
export default calculatePureRiderLedger;
        
