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
  paidToRider: number;     // आपने दिया (YOU GAVE) -> Advances, shortages, cash adjustments (+₹)
  settledOrEarned: number; // बना / मिला (YOU GOT) -> Salary earnings, incentives, bonuses (-₹)
  runningBalance: number;  // Running Net Balance after this row
  runningBalanceLabel: string; // e.g. "लेना: ₹500" or "देना: ₹200" or "₹0"
}

export interface LedgerCalculationResult {
  timelineRows: UnifiedTransactionItem[];
  totalPaidToRider: number;
  totalSettledOrEarned: number;
  unsettledAdvances: number;
  unsettledIncentives: number;
  unpaidSalary: number;
  netBalance: number; // Absolute balance value
  rawDifference: number; // positive = rider owes hub, negative = hub owes rider
  balanceStatus: 'rider_due' | 'payable' | 'settled';
  balanceLabel: string;
  adminBalanceLabel: string;
  riderBalanceLabel: string;
}

/**
 * Clean & bulletproof Khatabook ledger math calculation.
 * 
 * Rules:
 * 1. An advance given adds to rider debt (Paid to Rider / दिया गया +₹).
 * 2. When a settlement deducts an advance:
 *    - It clears previously accumulated advance up to `advanceDeducted`.
 *    - If status is PAID, net payout is already disbursed and advance is cleared.
 *    - Outstanding balance for this settlement deduction is ZERO.
 *    - It NEVER adds `advanceDeducted` as money the hub owes to the rider!
 * 3. Formula for Net Balance:
 *    - Unsettled Advances = Max(0, Total Advances Given - Total Advances Deducted)
 *    - Unsettled Incentives = Sum of incentives not yet paid
 *    - Unpaid Salary = Net salary of settlements marked UNPAID or PENDING
 *    - Total Rider Due (लेना बाकी) = Unsettled Advances
 *    - Total Rider Receivable (देना बाकी) = Unsettled Incentives + Unpaid Salary
 *    - Net Balance = Total Rider Due - Total Rider Receivable
 */
export function calculateRiderLedger(
  statement: PublicRiderStatement | null | undefined,
  sortOrder: 'asc' | 'desc' = 'desc',
  isRider: boolean = false
): LedgerCalculationResult {
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

  // 1. Filter out any internal negative adjustment records created by old settlement routines
  const validAdvances: RiderAdvanceEntry[] = (statement.advances || []).filter((a) => {
    const amt = Number(a.amount) || 0;
    const isNegativeOrAdj = amt < 0 || a.id?.startsWith('settle_adj') || a.reason?.includes('सेटलमेंट समायोजन');
    return amt > 0 && !isNegativeOrAdj;
  });

  const sumExplicitAdvances = validAdvances.reduce((sum, a) => sum + (Number(a.amount) || 0), 0);

  // 2. Filter positive incentives
  const validIncentives: RiderIncentiveEntry[] = (statement.incentives || []).filter((i) => {
    return (Number(i.amount) || 0) > 0;
  });

  const sumExplicitIncentives = validIncentives.reduce((sum, i) => sum + (Number(i.amount) || 0), 0);

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

  // Total advances already deducted in PAID settlements
  const totalAdvanceDeductedInPaidSettlements = paidSalaries.reduce((sum, s) => sum + s.advanceAmount, 0);
  
  // Unpaid salaries (status is not PAID)
  const unpaidSalary = unpaidSalaries.reduce((sum, s) => sum + s.netTotal, 0);

  // Unpaid daily deliveries from recentDeliveries (if present)
  const unpaidDeliveries = (statement.recentDeliveries || [])
    .filter((d) => d.status === 'Unpaid')
    .reduce((sum, d) => sum + (Number(d.totalEarnings) || 0), 0);

  const totalUnpaidEarnings = unpaidSalary + unpaidDeliveries;

  // 4. Calculate ACTIVE / UNSETTLED ADVANCES (Universal Running Balance Law):
  // Recoveries (Cash received from rider) act as credits reducing debt
  const recoveries = (statement.advances || []).filter((a) => {
    return (a.isRecovery || a.type === 'recovery') && !a.id?.startsWith('settle_adj');
  });
  const sumRecoveries = recoveries.reduce((sum, r) => sum + Math.abs(Number(r.amount) || 0), 0);

  // Total positive advances given (excluding ghost negative adjustments)
  const totalAdvancesGiven = validAdvances.reduce((sum, a) => sum + (Number(a.amount) || 0), 0);

  // Total cleared advance pool = advances deducted in paid settlements + cash recoveries
  const totalAdvanceCleared = totalAdvanceDeductedInPaidSettlements + sumRecoveries;

  // Net active unsettled advances: ONLY true remaining unpaid advance debt
  const unsettledAdvances = Math.max(0, totalAdvancesGiven - totalAdvanceCleared);

  // 5. Calculate ACTIVE / UNSETTLED INCENTIVES (Universal Running Balance Law):
  // Find latest paid settlement date
  const latestPaidSettlementDate = paidSalaries.map((s) => s.endDate).sort().pop() || '';

  const approvedUnsettledIncentives = validIncentives.filter((inc) => {
    if (inc.isSettled || inc.isPaid || (inc as any).status === 'PAID' || inc.settlementId) return false;
    const incDate = inc.date || (inc.createdAt ? inc.createdAt.slice(0, 10) : '');
    // If incentive was from a period covered by a paid settlement, it is considered settled
    if (latestPaidSettlementDate && incDate && incDate <= latestPaidSettlementDate) {
      return false;
    }
    return true;
  });

  const unsettledIncentives = approvedUnsettledIncentives.reduce((sum, i) => sum + (Number(i.amount) || 0), 0);

  // 6. Net Balance Formula:
  // Total Active Advances = unsettledAdvances (Rider Due / लेना बाकी)
  // Total Active Earnings = unsettledIncentives + totalUnpaidEarnings (Payable to Rider / देना बाकी)
  const totalRiderDue = unsettledAdvances;
  const totalRiderReceivable = unsettledIncentives + totalUnpaidEarnings;
  const rawDifference = totalRiderDue - totalRiderReceivable;
  const netBalance = Math.abs(rawDifference);

  let balanceStatus: 'rider_due' | 'payable' | 'settled' = 'settled';
  let adminBalanceLabel = '⚪ हिसाब चुकता: ₹0';
  let riderBalanceLabel = '⚪ हिसाब चुकता: ₹0';

  if (rawDifference > 0) {
    // CASE 2: Rider owes money to hub (Adv > Earnings)
    balanceStatus = 'rider_due';
    adminBalanceLabel = `🔴 लेना बाकी / रिकवरी: ₹${formatINR(netBalance)}`;
    riderBalanceLabel = `🔴 हब में जमा करना बाकी है (आपको हब को देना होगा): ₹${formatINR(netBalance)}`;
  } else if (rawDifference < 0) {
    // CASE 1: Hub owes money to rider (Earnings > Adv)
    balanceStatus = 'payable';
    adminBalanceLabel = `🟢 देना बाकी: ₹${formatINR(netBalance)}`;
    riderBalanceLabel = `🟢 आपको मिलना बाकी है (हब से प्राप्त होगा): ₹${formatINR(netBalance)}`;
  } else {
    balanceStatus = 'settled';
    adminBalanceLabel = '⚪ हिसाब चुकता: ₹0';
    riderBalanceLabel = '⚪ हिसाब चुकता: ₹0';
  }

  const balanceLabel = isRider ? riderBalanceLabel : adminBalanceLabel;

  // 7. Assemble Unified Transaction Rows
  type DraftRow = Omit<UnifiedTransactionItem, 'runningBalance' | 'runningBalanceLabel'>;
  const rawList: DraftRow[] = [];

  // A. Advances Given & Cash Recoveries (Double Entry)
  (statement.advances || []).forEach((adv) => {
    const amt = Number(adv.amount) || 0;
    if (amt <= 0 && !adv.isRecovery && adv.type !== 'recovery') return;
    if (adv.id?.startsWith('settle_adj') || adv.reason?.includes('सेटलमेंट समायोजन')) return;

    const dateVal = adv.date || adv.createdAt || '';
    const timestamp = dateVal ? new Date(dateVal).getTime() : 0;
    const isRec = Boolean(adv.isRecovery || adv.type === 'recovery');
    const positiveAmt = Math.abs(amt);

    if (isRec) {
      // RULE 4: Advance Recovery / Cash Received from Rider -> Credit (settledOrEarned)
      rawList.push({
        id: `rec-${adv.id}`,
        originalId: adv.id,
        rawDate: dateVal,
        sortTimestamp: timestamp,
        formattedDate: adv.date ? formatDateDisplay(adv.date) : formatDateDisplay(adv.createdAt),
        type: 'advance',
        title: adv.reason || 'नकद रिकवरी / जमा (Cash Inward / Recovery)',
        subTitle: 'राइडर द्वारा हब में नकद जमा (Credit)',
        paidToRider: 0,
        settledOrEarned: positiveAmt,
      });
    } else {
      // Advance Given -> Debit (paidToRider)
      rawList.push({
        id: `adv-${adv.id}`,
        originalId: adv.id,
        rawDate: dateVal,
        sortTimestamp: timestamp,
        formattedDate: adv.date ? formatDateDisplay(adv.date) : formatDateDisplay(adv.createdAt),
        type: 'advance',
        title: adv.reason || 'एडवांस भुगतान (Advance Given)',
        subTitle: adv.isSettled || adv.isDeducted ? 'नकद / ऑनलाइन भुगतान (सेटलमेंट में समायोजित)' : 'नकद / ऑनलाइन भुगतान',
        paidToRider: positiveAmt,
        settledOrEarned: 0,
      });
    }
  });

  // B. Incentives Given
  validIncentives.forEach((inc) => {
    const incAmt = Number(inc.amount) || 0;
    const dateVal = inc.date || inc.createdAt || '';
    const timestamp = dateVal ? new Date(dateVal).getTime() : 0;
    const isSettled = Boolean(inc.isSettled || inc.isPaid || inc.settlementId);

    rawList.push({
      id: `inc-${inc.id}`,
      originalId: inc.id,
      rawDate: dateVal,
      sortTimestamp: timestamp,
      formattedDate: inc.date ? formatDateDisplay(inc.date) : formatDateDisplay(inc.createdAt),
      type: 'incentive',
      title: inc.reason || 'इंसेंटिव / बोनस (Incentive & Bonus)',
      subTitle: inc.source === 'surplus' 
        ? 'अतिरिक्त सरप्लस जमा' 
        : isSettled 
        ? 'स्वीकृत बोनस (सेटलमेंट में चुकता)' 
        : 'स्वीकृत बोनस',
      paidToRider: 0,
      settledOrEarned: incAmt,
    });
  });

  // C. Salary Settlements
  salaries.forEach((sal) => {
    const dateVal = sal.paidAt ? sal.paidAt.split('T')[0] : sal.endDate;
    const timestamp = new Date(sal.paidAt || sal.endDate).getTime() || 0;
    const isPaid = !sal.status || sal.status.trim().toUpperCase() === 'PAID';
    
    // In the ledger:
    // If advance was deducted: that deduction clears advance debt (- बना / मिला)
    // If salary is unpaid: the unpaid net salary is also owed to the rider (- बना / मिला)
    // If salary is fully paid with 0 advance: net was paid out, so settledOrEarned for advance is 0
    const advDeducted = sal.advanceAmount;
    const unpaidNet = isPaid ? 0 : sal.netTotal;
    const settledAmount = advDeducted + unpaidNet;

    let subTitle = `${sal.totalParcels} पार्सल • सकल: ₹${formatINR(sal.grossTotal)}`;
    if (advDeducted > 0) {
      subTitle += ` | एडवांस कटौती: ₹${formatINR(advDeducted)}`;
    }
    subTitle += ` | नेट भुगतान: ₹${formatINR(sal.netTotal)} • ${isPaid ? 'भुगतान पूर्ण (PAID)' : 'लंबित (PENDING)'}`;

    rawList.push({
      id: `sal-${sal.id}`,
      originalId: sal.id,
      rawDate: dateVal,
      sortTimestamp: timestamp,
      formattedDate: formatDateDisplay(dateVal),
      type: 'salary',
      title: `सैलरी पे-आउट (${sal.startDate} से ${sal.endDate})`,
      subTitle,
      salaryDetails: {
        startDate: sal.startDate,
        endDate: sal.endDate,
        totalParcels: sal.totalParcels,
        grossTotal: sal.grossTotal,
        advanceDeducted: advDeducted,
        netPaid: sal.netTotal,
        status: sal.status,
      },
      paidToRider: 0,
      settledOrEarned: settledAmount,
    });
  });

  // Sort strictly oldest first (ascending) to compute chronological running balance
  rawList.sort((a, b) => a.sortTimestamp - b.sortTimestamp);

  // Compute chronological running balance:
  // Let balance = 0 at start.
  // आपने दिया (YOU GAVE: advance / shortage) -> balance += paidToRider
  // बना / मिला (YOU GOT: salary / incentive / bonus) -> balance -= settledOrEarned
  let running = 0;
  const processedRows: UnifiedTransactionItem[] = rawList.map((row) => {
    running = running + row.paidToRider - row.settledOrEarned;
    const absBal = Math.abs(running);
    let label = 'Bal. ₹0';
    if (isRider) {
      if (running > 0) {
        label = `जमा करना: ₹${formatINR(absBal)}`;
      } else if (running < 0) {
        label = `मिलना बाकी: ₹${formatINR(absBal)}`;
      }
    } else {
      if (running > 0) {
        label = `लेना: ₹${formatINR(absBal)}`;
      } else if (running < 0) {
        label = `देना: ₹${formatINR(absBal)}`;
      }
    }
    return {
      ...row,
      runningBalance: running,
      runningBalanceLabel: label,
    };
  });

  // If user requested descending order, reverse the rows after running balance is computed
  if (sortOrder === 'desc') {
    processedRows.reverse();
  }

  // Calculate Table Column Totals
  const totalPaidToRider = processedRows.reduce((acc, row) => acc + row.paidToRider, 0);
  const totalSettledOrEarned = processedRows.reduce((acc, row) => acc + row.settledOrEarned, 0);

  return {
    timelineRows: processedRows,
    totalPaidToRider,
    totalSettledOrEarned,
    unsettledAdvances,
    unsettledIncentives,
    unpaidSalary,
    netBalance,
    rawDifference,
    balanceStatus,
    balanceLabel,
    adminBalanceLabel,
    riderBalanceLabel,
  };
}
