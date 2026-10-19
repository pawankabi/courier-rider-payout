import { PublicRiderStatement, RiderAdvanceEntry, RiderIncentiveEntry } from '../types';
import { formatDateDisplay, formatINR } from './formatters';

export interface LedgerSalaryRecord {
  id: string;
  startDate: string;
  endDate: string;
  totalParcels: number;
  baseAmount?: number;
  incentiveAmount?: number;
  grossTotal: number;
  advanceAmount: number;
  netTotal: number;
  paidAt?: string;
  status: string; // 'PAID' | 'UNPAID' | 'PENDING'
}

export interface UnifiedTransactionItem {
  id: string;
  originalId: string;
  rawDate: string;
  sortTimestamp: number;
  formattedDate: string;
  type: 'advance' | 'incentive' | 'salary' | 'delivery';
  title: string;
  subTitle?: string;
  salaryDetails?: {
    startDate: string;
    endDate: string;
    totalParcels: number;
    grossTotal: number;
    advanceDeducted: number;
    netPaid: number;
    status: string;
  };
  paidToRider: number;     // आपने दिया (YOU GAVE) -> Cash advances, net cash paid out (+₹)
  settledOrEarned: number; // बना / मिला (YOU GOT) -> Delivery earnings, recoveries, bonuses (-₹)
  runningBalance: number;  // Running Net Balance after this row
  runningBalanceLabel: string; // e.g. "देना है: ₹2,635" or "पाना है: ₹500" or "⚪ Bal. ₹0"
}

export interface PureLedgerCalculationResult {
  timelineRows: UnifiedTransactionItem[];
  totalPaidToRider: number;
  totalSettledOrEarned: number;
  unsettledAdvances: number;
  unsettledIncentives: number;
  unpaidSalary: number;
  netBalance: number; // Absolute balance value
  rawDifference: number; // positive = hub owes rider (credit), negative = rider owes hub (debit), 0 = clean slate
  balanceStatus: 'rider_due' | 'payable' | 'settled';
  balanceLabel: string;
  adminBalanceLabel: string;
  riderBalanceLabel: string;
}

/**
 * Filter out any synthetic, phantom, or ghost advance entries permanently.
 * Synthetic keys like `adv_cf_...`, `settle_adj...`, `adv-settlement-implicit`
 * or negative/zero amounts must NEVER pollute the pure ledger.
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
 * PURE LEDGER ENGINE (Single Source of Truth):
 * 
 * Strict Mathematical Rules:
 * Net Balance = Total Earned (Deliveries + Incentives + Recoveries) minus Total Advances (and disbursements).
 * 
 * CASE 1 (Rider Owes Hub - Deficit):
 *   Total Advances exceed Earnings (e.g. Lakhindar Mahato: Advances ₹11,445 - Salary Payout ₹8,810 = Net Deficit ₹2,635).
 *   Header & Badge: 🔴 आपसे बकाया (You owe the Hub): ₹2,635 (NEVER ₹3,518!).
 * 
 * CASE 2 (Hub Owes Rider - Payable):
 *   Earnings exceed Advances and payout is due.
 *   Header & Badge: 🟢 भुगतान योग्य (Payable / Hub Owes Rider): ₹[Amount].
 * 
 * CASE 3 (Cleared Accounts):
 *   Accounts with zero balance or fully settled payouts.
 *   Header & Badge: ⚪ हिसाब चुकता: ₹0 (Never resurrect old settled advances!).
 */
export function calculatePureRiderLedger(
  statement: PublicRiderStatement | null | undefined,
  sortOrder: 'asc' | 'desc' = 'desc',
  isRider: boolean = false
): PureLedgerCalculationResult {
  if (!statement) {
    return {
      timelineRows: [],
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

  // 1. Filter genuine, authentic advances (permanently reject all phantoms & duplicates)
  const validAdvances: RiderAdvanceEntry[] = purgePhantomAdvances(statement.advances || []);

  // 2. Filter genuine incentives
  const validIncentives: RiderIncentiveEntry[] = (statement.incentives || []).filter((i) => {
    return (Number(i.amount) || 0) > 0;
  });

  // 3. Process settlements / salaries
  const salaries: LedgerSalaryRecord[] = (statement.salaries || []).map((s) => ({
    id: s.id,
    startDate: s.startDate,
    endDate: s.endDate,
    totalParcels: Number(s.totalParcels) || 0,
    baseAmount: Number(s.baseAmount) || 0,
    incentiveAmount: Number(s.incentiveAmount) || 0,
    grossTotal: Number(s.grossTotal) || 0,
    advanceAmount: Number(s.advanceAmount) || 0,
    netTotal: Number(s.netTotal) || 0,
    paidAt: s.paidAt,
    status: s.status || 'PAID',
  }));

  const paidSalaries = salaries.filter((s) => !s.status || s.status.trim().toUpperCase() === 'PAID');
  const unpaidSalaries = salaries.filter((s) => s.status && s.status.trim().toUpperCase() !== 'PAID');

  // 4. Draft ledger entries for chronological simulation
  interface DraftLedgerEntry {
    id: string;
    originalId: string;
    rawDate: string;
    sortTimestamp: number;
    formattedDate: string;
    type: 'advance' | 'incentive' | 'salary';
    entryKind: 'ADVANCE_GIVEN' | 'CASH_RECOVERY' | 'INCENTIVE' | 'PAYOUT_SETTLEMENT';
    title: string;
    subTitle?: string;
    amount: number;
    netPaid: number;
    advanceDeducted: number;
    grossTotal: number;
    isPaid: boolean;
    salaryDetails?: UnifiedTransactionItem['salaryDetails'];
    paidToRiderCol: number;
    settledOrEarnedCol: number;
  }

  const rawList: DraftLedgerEntry[] = [];

  // A. Advances Given & Cash Recoveries
  validAdvances.forEach((adv) => {
    const amt = Number(adv.amount) || 0;
    const isRec = Boolean(adv.isRecovery || adv.type === 'recovery');
    const positiveAmt = Math.abs(amt);
    const dateVal = adv.date || adv.createdAt || '';
    const timestamp = dateVal ? new Date(dateVal).getTime() : 0;
    const isSettled = Boolean(
      adv.isSettled || 
      adv.isDeducted || 
      (adv as any).status === 'PAID'
    );

    if (isRec) {
      rawList.push({
        id: `rec-${adv.id}`,
        originalId: adv.id,
        rawDate: dateVal,
        sortTimestamp: timestamp,
        formattedDate: adv.date ? formatDateDisplay(adv.date) : formatDateDisplay(adv.createdAt),
        type: 'advance',
        entryKind: 'CASH_RECOVERY',
        title: adv.reason || 'नकद रिकवरी / जमा (Cash Inward / Recovery)',
        subTitle: 'राइडर द्वारा हब में नकद जमा (Credit)',
        amount: positiveAmt,
        netPaid: 0,
        advanceDeducted: 0,
        grossTotal: 0,
        isPaid: true,
        paidToRiderCol: 0,
        settledOrEarnedCol: positiveAmt,
      });
    } else {
      rawList.push({
        id: `adv-${adv.id}`,
        originalId: adv.id,
        rawDate: dateVal,
        sortTimestamp: timestamp,
        formattedDate: adv.date ? formatDateDisplay(adv.date) : formatDateDisplay(adv.createdAt),
        type: 'advance',
        entryKind: 'ADVANCE_GIVEN',
        title: adv.reason || 'एडवांस भुगतान (Advance Given)',
        subTitle: isSettled ? 'नकद / ऑनलाइन भुगतान (सेटलमेंट में समायोजित)' : 'नकद / ऑनलाइन भुगतान (सक्रिय बकाया)',
        amount: positiveAmt,
        netPaid: 0,
        advanceDeducted: 0,
        grossTotal: 0,
        isPaid: isSettled,
        paidToRiderCol: positiveAmt,
        settledOrEarnedCol: 0,
      });
    }
  });

  // B. Incentives Given
  validIncentives.forEach((inc) => {
    const incAmt = Number(inc.amount) || 0;
    const dateVal = inc.date || inc.createdAt || '';
    const timestamp = dateVal ? new Date(dateVal).getTime() : 0;
    const isSettled = Boolean(
      inc.isSettled || 
      inc.isPaid || 
      (inc as any).status === 'PAID'
    );

    rawList.push({
      id: `inc-${inc.id}`,
      originalId: inc.id,
      rawDate: dateVal,
      sortTimestamp: timestamp,
      formattedDate: inc.date ? formatDateDisplay(inc.date) : formatDateDisplay(inc.createdAt),
      type: 'incentive',
      entryKind: 'INCENTIVE',
      title: inc.reason || 'इंसेंटिव / बोनस (Incentive & Bonus)',
      subTitle: inc.source === 'surplus' 
        ? 'अतिरिक्त सरप्लस जमा' 
        : isSettled 
        ? 'स्वीकृत बोनस (सेटलमेंट में चुकता)' 
        : 'स्वीकृत बोनस (सक्रिय)',
      amount: incAmt,
      netPaid: 0,
      advanceDeducted: 0,
      grossTotal: 0,
      isPaid: isSettled,
      paidToRiderCol: 0,
      settledOrEarnedCol: incAmt,
    });
  });

  // C. Salary Settlements
  salaries.forEach((sal) => {
    const dateVal = sal.paidAt ? sal.paidAt.split('T')[0] : sal.endDate;
    const timestamp = new Date(sal.paidAt || sal.endDate).getTime() || 0;
    const isPaid = !sal.status || sal.status.trim().toUpperCase() === 'PAID';
    const netTotal = Number(sal.netTotal) || 0;
    const netPaid = isPaid ? Math.max(0, netTotal) : 0;
    const advanceDeducted = Number(sal.advanceAmount) || 0;
    const grossTotal = Number(sal.grossTotal) || 0;

    let subTitle = `${sal.totalParcels} पार्सल • सकल: ₹${formatINR(grossTotal)}`;
    if (advanceDeducted > 0) {
      subTitle += ` | एडवांस कटौती: ₹${formatINR(advanceDeducted)}`;
    }
    if (netTotal < 0) {
      subTitle += ` | लेना शेष है: ₹${formatINR(Math.abs(netTotal))} • ${isPaid ? 'सेटलमेंट दर्ज (PARTIALLY SETTLED)' : 'लंबित (PENDING)'}`;
    } else {
      subTitle += ` | नेट भुगतान: ₹${formatINR(netPaid)} • ${isPaid ? 'भुगतान पूर्ण (PAID)' : 'लंबित (PENDING)'}`;
    }

    rawList.push({
      id: `sal-${sal.id}`,
      originalId: sal.id,
      rawDate: dateVal,
      sortTimestamp: timestamp,
      formattedDate: formatDateDisplay(dateVal),
      type: 'salary',
      entryKind: 'PAYOUT_SETTLEMENT',
      title: `सैलरी पे-आउट (${sal.startDate} से ${sal.endDate})`,
      subTitle,
      amount: grossTotal,
      netPaid,
      advanceDeducted,
      grossTotal,
      isPaid,
      salaryDetails: {
        startDate: sal.startDate,
        endDate: sal.endDate,
        totalParcels: sal.totalParcels,
        grossTotal,
        advanceDeducted,
        netPaid,
        status: sal.status,
      },
      paidToRiderCol: isPaid ? netPaid : 0,
      settledOrEarnedCol: grossTotal,
    });
  });

  // Sort strictly oldest first (ascending) to compute chronological running balance
  rawList.sort((a, b) => {
    if (a.sortTimestamp !== b.sortTimestamp) return a.sortTimestamp - b.sortTimestamp;
    const typeOrder = { ADVANCE_GIVEN: 1, INCENTIVE: 2, CASH_RECOVERY: 3, PAYOUT_SETTLEMENT: 4 };
    return (typeOrder[a.entryKind] || 0) - (typeOrder[b.entryKind] || 0);
  });

  // Compute Standard Commercial Running Balance:
  // Let Running = 0;
  // Positive = Rider has credit / Hub owes rider ("पाना है")
  // Negative = Rider owes Hub / Hub is owed by rider ("देना है")
  let running = 0;
  const processedRows: UnifiedTransactionItem[] = rawList.map((entry) => {
    switch (entry.entryKind) {
      case 'INCENTIVE':
        running += entry.amount;
        break;

      case 'ADVANCE_GIVEN':
        running -= entry.amount;
        break;

      case 'CASH_RECOVERY':
        running += entry.amount;
        break;

      case 'PAYOUT_SETTLEMENT': {
        // Standalone incentives that were already added as INCENTIVE rows:
        const settledStandaloneInc = validIncentives
          .filter((i) => i.settlementId === entry.originalId || i.settledPayoutId === entry.originalId || i.settledInPayoutId === entry.originalId)
          .reduce((sum, i) => sum + (Number(i.amount) || 0), 0);
        const cycleDeliveryGross = Math.max(0, entry.grossTotal - settledStandaloneInc);
        const cashDisbursed = entry.isPaid ? entry.netPaid : 0;
        
        // Commercial Double-Entry Formula:
        // Credit the cycle's delivery earnings and debit any actual cash disbursed
        running += (cycleDeliveryGross - cashDisbursed);
        break;
      }
    }

    const absBal = Math.abs(running);
    let label = '⚪ Bal. ₹0';
    if (running < -0.01) {
      label = `देना है: ₹${formatINR(absBal)}`;
    } else if (running > 0.01) {
      label = `पाना है: ₹${formatINR(absBal)}`;
    }

    return {
      id: entry.id,
      originalId: entry.originalId,
      rawDate: entry.rawDate,
      sortTimestamp: entry.sortTimestamp,
      formattedDate: entry.formattedDate,
      type: entry.type,
      title: entry.title,
      subTitle: entry.subTitle,
      salaryDetails: entry.salaryDetails,
      paidToRider: entry.paidToRiderCol,
      settledOrEarned: entry.settledOrEarnedCol,
      runningBalance: running,
      runningBalanceLabel: label,
    };
  });

  const totalPaidToRider = processedRows.reduce((acc, row) => acc + row.paidToRider, 0);
  const totalSettledOrEarned = processedRows.reduce((acc, row) => acc + row.settledOrEarned, 0);

  // Lifetime audit calculations
  const totalAdvancesTaken = validAdvances
    .filter((a) => !a.isRecovery && a.type !== 'recovery')
    .reduce((sum, a) => sum + (Number(a.amount) || 0), 0);

  const totalRecoveries = validAdvances
    .filter((a) => a.isRecovery || a.type === 'recovery')
    .reduce((sum, a) => sum + Math.abs(Number(a.amount) || 0), 0);

  const totalGrossEarned = paidSalaries.reduce((sum, s) => sum + (Number(s.grossTotal) || 0), 0);
  const totalCashDisbursed = paidSalaries.reduce((sum, s) => sum + Math.max(0, Number(s.netTotal) || 0), 0);
  const totalAdvanceCoveredByEarnings = Math.max(0, totalGrossEarned - totalCashDisbursed);

  // Exact unrecovered advance deficit
  const trueUnrecoveredAdvanceDebt = Math.max(0, totalAdvancesTaken - totalAdvanceCoveredByEarnings - totalRecoveries);

  const unsettledAdvances = trueUnrecoveredAdvanceDebt;

  // Active unsettled incentives
  const rawUnsettledIncentives = validIncentives.filter((inc) => {
    if (inc.isSettled || inc.isPaid || (inc as any).status === 'PAID') return false;
    return true;
  });
  const unsettledIncentives = rawUnsettledIncentives.reduce((sum, i) => sum + (Number(i.amount) || 0), 0);

  const unpaidSalary = unpaidSalaries.reduce((sum, s) => sum + s.netTotal, 0);

  // Chronological traversal terminal balance is the cumulative running balance after all events
  const finalRawDifference = processedRows.length > 0
    ? running
    : ((unsettledIncentives + unpaidSalary) - unsettledAdvances);
  const netBalance = Math.abs(finalRawDifference);

  // LOCKED MATHEMATICAL STATUS & BADGES:
  // CASE 1: Deficit (finalRawDifference < -0.99) -> 🔴 आपसे बकाया (You owe the Hub): ₹[Amount]
  // CASE 2: Payable (finalRawDifference > 0.99) -> 🟢 भुगतान योग्य (Payable / Hub Owes Rider): ₹[Amount]
  // CASE 3: Cleared (|finalRawDifference| <= 0.99) -> ⚪ हिसाब चुकता: ₹0
  let balanceStatus: 'rider_due' | 'payable' | 'settled' = 'settled';
  let adminBalanceLabel = '⚪ हिसाब चुकता: ₹0';
  let riderBalanceLabel = '⚪ हिसाब चुकता: ₹0';

  if (finalRawDifference < -0.99) {
    balanceStatus = 'rider_due';
    adminBalanceLabel = `🔴 आपसे बकाया (You owe the Hub): ₹${formatINR(netBalance)}`;
    riderBalanceLabel = `🔴 आपसे बकाया (You owe the Hub): ₹${formatINR(netBalance)}`;
  } else if (finalRawDifference > 0.99) {
    balanceStatus = 'payable';
    adminBalanceLabel = `🟢 भुगतान योग्य (Payable / Hub Owes Rider): ₹${formatINR(netBalance)}`;
    riderBalanceLabel = `🟢 आपको मिलना बाकी है: ₹${formatINR(netBalance)}`;
  } else {
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
    totalPaidToRider,
    totalSettledOrEarned,
    unsettledAdvances,
    unsettledIncentives,
    unpaidSalary,
    netBalance,
    rawDifference: finalRawDifference,
    balanceStatus,
    balanceLabel,
    adminBalanceLabel,
    riderBalanceLabel,
  };
}

// Default export alias for seamless consumer drop-in
export const calculateRiderLedger = calculatePureRiderLedger;
export default calculatePureRiderLedger;
