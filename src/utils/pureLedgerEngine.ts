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
  type: 'advance' | 'incentive' | 'salary' | 'payment';
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

  // Helper: check if an advance is active and truly unsettled (6-condition qualification)
  const isUnsettledAdvanceEntry = (adv: RiderAdvanceEntry): boolean => {
    // 1) adv.isSettled !== true && adv.isDeducted !== true && (adv as any).status !== 'PAID'
    if (adv.isSettled === true || adv.isDeducted === true || (adv as any).status === 'PAID') return false;

    // 2) !adv.settledInPayoutId && !adv.settledPayoutId && !adv.settlementId
    if (adv.settledInPayoutId || adv.settledPayoutId || adv.settlementId) return false;

    // 4) Number(adv.amount) > 0
    const amt = Number(adv.amount) || 0;
    if (amt <= 0) return false;

    // 5) adv.type !== 'recovery' && !adv.isRecovery
    if (adv.type === 'recovery' || adv.isRecovery) return false;

    // 6) !adv.id?.startsWith('settle_adj') && !adv.id?.startsWith('adv_cf_') && !adv.reason?.includes('सेटलमेंट समायोजन')
    if (adv.id?.startsWith('settle_adj') || adv.id?.startsWith('adv_cf_') || adv.reason?.includes('सेटलमेंट समायोजन')) return false;

    // 3) !settlements.some(s => (s.status === 'PAID' || s.status === 'SETTLED') && Array.isArray(s.settledAdvanceIds) && s.settledAdvanceIds.includes(adv.id))
    if (salaries && salaries.length > 0) {
      const isSettledInSalaries = salaries.some((s) => {
        const isPaidOrSettled = !s.status || s.status.trim().toUpperCase() === 'PAID' || s.status.trim().toUpperCase() === 'SETTLED';
        if (!isPaidOrSettled) return false;
        return Array.isArray((s as any).settledAdvanceIds) && (s as any).settledAdvanceIds.includes(adv.id);
      });
      if (isSettledInSalaries) return false;
    }

    return true;
  };

  // 4. Construct Pure Ledger Transactions (Chronological simulation)
  interface DraftLedgerEntry {
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
    salaryDetails?: UnifiedTransactionItem['salaryDetails'];
  }

  const rawList: DraftLedgerEntry[] = [];

  // A. Advances Taken & Cash Recoveries (Cash / Fuel / Loans)
  validAdvances.forEach((adv) => {
    const amt = Number(adv.amount) || 0;
    const isRec = Boolean(adv.isRecovery || adv.type === 'recovery');
    const positiveAmt = Math.abs(amt);
    const dateVal = adv.date || adv.createdAt || '';
    const timestamp = dateVal ? new Date(dateVal).getTime() : 0;

    if (isRec) {
      const isSettledRec = adv.isSettled === true || adv.isDeducted === true || (adv as any).status === 'PAID' || adv.settlementId;
      if (isSettledRec) return;

      // Cash inward recovery deposited by rider is a (+) entry
      rawList.push({
        id: `rec-${adv.id}`,
        originalId: adv.id,
        rawDate: dateVal,
        sortTimestamp: timestamp,
        formattedDate: adv.date ? formatDateDisplay(adv.date) : formatDateDisplay(adv.createdAt),
        type: 'advance',
        entryKind: 'PLUS_EARNING',
        typeLabel: '(+) नकद रिकवरी',
        title: adv.reason || 'नकद रिकवरी / जमा (Cash Recovery)',
        subTitle: 'राइडर द्वारा हब में नकद जमा (Credit)',
        plusAmount: positiveAmt,
        minusAmount: 0,
      });
    } else {
      // Only push an advance into rawList if it is truly UNSETTLED
      if (!isUnsettledAdvanceEntry(adv)) return;

      // Cash advance taken by rider is a (-) entry
      rawList.push({
        id: `adv-${adv.id}`,
        originalId: adv.id,
        rawDate: dateVal,
        sortTimestamp: timestamp,
        formattedDate: adv.date ? formatDateDisplay(adv.date) : formatDateDisplay(adv.createdAt),
        type: 'advance',
        entryKind: 'MINUS_ADVANCE',
        typeLabel: '(-) एडवांस',
        title: adv.reason || 'एडवांस भुगतान (Advance Given)',
        subTitle: 'नकद / ऑनलाइन भुगतान (सक्रिय बकाया)',
        plusAmount: 0,
        minusAmount: positiveAmt,
      });
    }
  });

  // B. Incentives & Festival Bonuses (Only active / unsettled)
  validIncentives.forEach((inc) => {
    const incAmt = Number(inc.amount) || 0;
    if (incAmt <= 0) return;
    const isSettled = Boolean(
      inc.isSettled || 
      inc.isPaid || 
      (inc as any).status === 'PAID' ||
      inc.settlementId ||
      inc.settledPayoutId ||
      inc.settledInPayoutId
    );
    if (isSettled) return;

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
      title: inc.reason || 'इंसेंटिव / बोनस (Incentive & Bonus)',
      subTitle: inc.source === 'surplus' 
        ? 'अतिरिक्त सरप्लस जमा' 
        : 'स्वीकृत बोनस (सक्रिय)',
      plusAmount: incAmt,
      minusAmount: 0,
    });
  });

  // C. Delivered Parcel Payouts (Gross Earnings) & Deductions
  salaries.forEach((sal) => {
    const dateVal = sal.paidAt ? sal.paidAt.split('T')[0] : sal.endDate;
    const timestamp = new Date(sal.paidAt || sal.endDate).getTime() || 0;
    const isPaid = !sal.status || sal.status.trim().toUpperCase() === 'PAID';
    const netTotal = Number(sal.netTotal) || 0;
    const netCashPaid = isPaid ? Math.max(0, netTotal) : 0;
    const totalAdvInSal = Number(sal.advanceAmount) || 0;
    const grossTotal = Number(sal.grossTotal) || 0;
    // Advance amount covered/absorbed inside this settlement
    const advanceDeducted = Math.min(grossTotal, totalAdvInSal);

    let subTitle = `${sal.totalParcels} पार्सल • सकल कमाई: ${formatINR(grossTotal)}`;
    if (totalAdvInSal > 0) {
      subTitle += ` | एडवांस कटौती: ${formatINR(totalAdvInSal)}`;
    }
    if (netTotal < 0) {
      subTitle += ` | लेना शेष है: ${formatINR(Math.abs(netTotal))} • ${isPaid ? 'सेटलमेंट दर्ज (PARTIALLY SETTLED)' : 'लंबित (PENDING)'}`;
    } else {
      subTitle += ` | नेट भुगतान: ${formatINR(netCashPaid)} • ${isPaid ? 'भुगतान पूर्ण (PAID)' : 'लंबित (PENDING)'}`;
    }

    // 1. Plus (+) Entry: Delivered parcel payout gross earnings
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
      subTitle,
      plusAmount: grossTotal,
      minusAmount: 0,
      salaryDetails: {
        startDate: sal.startDate,
        endDate: sal.endDate,
        totalParcels: sal.totalParcels,
        grossTotal,
        advanceDeducted: totalAdvInSal,
        netPaid: netCashPaid,
        status: sal.status,
      },
    });

    // 2. Minus (-) Entry: Advance deducted inside this settlement
    if (advanceDeducted > 0) {
      rawList.push({
        id: `sal-adv-${sal.id}`,
        originalId: sal.id,
        rawDate: sal.advanceDate || dateVal,
        sortTimestamp: timestamp + 1,
        formattedDate: formatDateDisplay(sal.advanceDate || dateVal),
        type: 'advance',
        entryKind: 'MINUS_ADVANCE',
        typeLabel: '(-) एडवांस कटौती',
        title: `एडवांस कटौती (${formatDateDisplay(sal.startDate)} से ${formatDateDisplay(sal.endDate)} सेटलमेंट)`,
        subTitle: sal.advanceReason || 'पे-आउट सेटलमेंट में समायोजित एडवांस',
        plusAmount: 0,
        minusAmount: advanceDeducted,
      });
    }

    // 3. Minus (-) Entry: Net cash disbursed to rider in hand
    if (isPaid && netCashPaid > 0) {
      rawList.push({
        id: `payout-cash-${sal.id}`,
        originalId: sal.id,
        rawDate: dateVal,
        sortTimestamp: timestamp + 2, // Follows immediately after advance deduction
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

  // D. Uncovered Settlement Deficits Carried Over (if not already represented in active advances)
  const totalSettlementDeficits = salaries
    .filter((s) => (!s.status || s.status.trim().toUpperCase() === 'PAID') && Number(s.netTotal) < 0)
    .reduce((sum, s) => sum + Math.abs(Number(s.netTotal)), 0);

  const activeAdvancesSum = validAdvances
    .filter((a) => !a.isRecovery && a.type !== 'recovery' && isUnsettledAdvanceEntry(a))
    .reduce((sum, a) => sum + (Number(a.amount) || 0), 0);

  const uncoveredDeficit = Math.max(0, totalSettlementDeficits - activeAdvancesSum);
  if (uncoveredDeficit > 0) {
    const lastSal = salaries[salaries.length - 1];
    rawList.push({
      id: 'settlement-deficit-cf',
      originalId: 'settlement-deficit-cf',
      rawDate: lastSal?.endDate || new Date().toISOString().split('T')[0],
      sortTimestamp: Date.now(),
      formattedDate: formatDateDisplay(lastSal?.endDate || new Date().toISOString().split('T')[0]),
      type: 'advance',
      entryKind: 'MINUS_ADVANCE',
      typeLabel: '(-) पूर्व बकाया',
      title: 'पिछले सेटलमेंट का बकाया शेष (Settlement Deficit Carry-Forward)',
      subTitle: 'एडवांस कटौती सकल कमाई से अधिक थी • अवशेष देयता',
      plusAmount: 0,
      minusAmount: uncoveredDeficit,
    });
  }




  // Deduplicate entries by ID to ensure single ground truth
  const seenEntryIds = new Set<string>();
  const uniqueList: DraftLedgerEntry[] = [];
  for (const entry of rawList) {
    if (!seenEntryIds.has(entry.id)) {
      seenEntryIds.add(entry.id);
      uniqueList.push(entry);
    }
  }

  // Sort chronological oldest first (ascending)
  uniqueList.sort((a, b) => {
    if (a.sortTimestamp !== b.sortTimestamp) return a.sortTimestamp - b.sortTimestamp;
    // On same date: advances taken (-) come before earnings (+)
    return a.entryKind === 'MINUS_ADVANCE' ? -1 : 1;
  });

  // 5. Calculate Running Balance
  let running = 0;
  const processedRows: UnifiedTransactionItem[] = uniqueList.map((entry) => {
    if (entry.entryKind === 'PLUS_EARNING') {
      running += entry.plusAmount;
    } else {
      running -= entry.minusAmount;
    }

    const absBal = Math.abs(running);
    let label = '⚪ हिसाब चुकता: ₹0';
    if (running < -0.01) {
      label = isRider ? `🔴 देना है: ₹${formatINR(absBal)}` : `🔴 पाना बाकी: ₹${formatINR(absBal)}`;
    } else if (running > 0.01) {
      label = isRider ? `🟢 लेना है: ₹${formatINR(absBal)}` : `🟢 देना बाकी: ₹${formatINR(absBal)}`;
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
      salaryDetails: entry.salaryDetails,
      plusAmount: entry.plusAmount,
      minusAmount: entry.minusAmount,
      paidToRider: entry.minusAmount,
      settledOrEarned: entry.plusAmount,
      runningBalance: running,
      runningBalanceLabel: label,
    };
  });

  const totalPlus = processedRows.reduce((acc, row) => acc + row.plusAmount, 0);
  const totalMinus = processedRows.reduce((acc, row) => acc + row.minusAmount, 0);

  // Pure Arithmetic Net Balance:
  // Net Balance = sum(Delivery Earnings + Bonuses) - sum(Advances + Fuel Cashouts + Settlements Paid)
  const finalDifference = totalPlus - totalMinus;
  const netBalance = Math.abs(finalDifference);

  let balanceStatus: 'rider_due' | 'payable' | 'settled' = 'settled';
  let adminBalanceLabel = '⚪ हिसाब चुकता: ₹0';
  let riderBalanceLabel = '⚪ हिसाब चुकता: ₹0';

  if (finalDifference < -0.01) {
    // CASE 1: Rider Owes Hub (Advances > Earnings, e.g. Lakhindar Mahato: Advances ₹11,445 - Salary Payout ₹8,810 = ₹2,635)
    balanceStatus = 'rider_due';
    adminBalanceLabel = `🔴 राइडर से ₹${formatINR(netBalance)} पाना बाकी है`;
    riderBalanceLabel = `🔴 आपसे हब ₹${formatINR(netBalance)} पाएगा`;
  } else if (finalDifference > 0.01) {
    // CASE 2: Hub Owes Rider (Earnings > Advances)
    balanceStatus = 'payable';
    adminBalanceLabel = `🟢 राइडर को ₹${formatINR(netBalance)} देना बाकी है`;
    riderBalanceLabel = `🟢 आपको हब से ₹${formatINR(netBalance)} लेना है`;
  } else {
    // CASE 3: Zero Balance / Cleared Account
    balanceStatus = 'settled';
    adminBalanceLabel = '⚪ हिसाब चुकता: ₹0';
    riderBalanceLabel = '⚪ हिसाब चुकता: ₹0';
  }

  const balanceLabel = isRider ? riderBalanceLabel : adminBalanceLabel;

  if (sortOrder === 'desc') {
    processedRows.reverse();
  }

  return {
    timelineRows: processedRows,
    totalPlus,
    totalMinus,
    totalPaidToRider: totalMinus,
    totalSettledOrEarned: totalPlus,
    unsettledAdvances: balanceStatus === 'rider_due' ? netBalance : 0,
    unsettledIncentives: validIncentives.filter((i) => !i.isSettled && !i.isPaid && (i as any).status !== 'PAID').reduce((sum, i) => sum + (Number(i.amount) || 0), 0),
    unpaidSalary: 0,
    netBalance,
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
