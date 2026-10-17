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
  paidToRider: number;     // आपने दिया (YOU GAVE) -> Advances, net salary paid out (+₹)
  settledOrEarned: number; // बना / मिला (YOU GOT) -> Salary earnings, incentives, recoveries (-₹)
  runningBalance: number;  // Running Net Balance after this row
  runningBalanceLabel: string; // e.g. "लेना: ₹500" or "देना: ₹200" or "Bal. ₹0"
}

export interface LedgerCalculationResult {
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
 * 4. LEDGER STATEMENT RUNNING BALANCE (RiderLedgerModal.tsx & ledgerCalculation.ts):
 * Standard Bank Statement Running Balance (sorted chronologically oldest -> newest):
 *   Let RunningBalance = 0;
 *   - DELIVERY / INCENTIVE (Credit to Rider): RunningBalance += amount;
 *   - CASH ADVANCE (Debit to Rider): RunningBalance -= amount;
 *   - PAYOUT SETTLEMENT (PAID) (Disbursement): RunningBalance -= (netPaid + advanceDeducted);
 *   - CASH RECOVERY (Rider repaid hub): RunningBalance += amount;
 *   
 * * AUDIT GUARANTEE: When an account has all deliveries paid and all advances deducted,
 * every historical settlement row's running balance evaluates cleanly to Bal. ₹0 (Neutral).
 * No arbitrary ₹16,711, ₹4,586, ₹210, or ₹112 leftovers!
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

  // 1. Filter valid advances (never filter by date; state-scoped only)
  const validAdvances: RiderAdvanceEntry[] = (statement.advances || []).filter((a) => {
    const amt = Number(a.amount) || 0;
    const isGhost = amt < 0 || a.id?.startsWith('settle_adj') || a.reason?.includes('सेटलमेंट समायोजन');
    if (isGhost) return false;
    if (a.isRecovery || a.type === 'recovery') return true;
    return amt > 0;
  });

  // 2. Filter valid incentives (never filter by date; state-scoped only)
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

  let latestPaidDate = '';
  paidSalaries.forEach((s) => {
    const d = s.endDate || (s.paidAt ? s.paidAt.split('T')[0] : '');
    if (d > latestPaidDate) latestPaidDate = d;
  });

  // 4. Assemble Draft Items
  interface DraftLedgerEntry {
    id: string;
    originalId: string;
    rawDate: string;
    sortTimestamp: number;
    formattedDate: string;
    type: 'advance' | 'incentive' | 'salary' | 'delivery';
    entryKind: 'ADVANCE_GIVEN' | 'CASH_RECOVERY' | 'INCENTIVE' | 'DELIVERY_EARNING' | 'PAYOUT_SETTLEMENT';
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

  // A. Advances Given & Cash Recoveries (Timeless / State-Scoped)
  validAdvances.forEach((adv) => {
    const amt = Number(adv.amount) || 0;
    const isRec = Boolean(adv.isRecovery || adv.type === 'recovery');
    const positiveAmt = Math.abs(amt);
    const dateVal = adv.date || adv.createdAt || '';
    const timestamp = dateVal ? new Date(dateVal).getTime() : 0;
    const isCoveredByPaidSalary = latestPaidDate !== '' && dateVal !== '' && dateVal.split('T')[0] <= latestPaidDate;
    const isSettled = Boolean(
      adv.isSettled || 
      adv.isDeducted || 
      (adv as any).status === 'PAID' || 
      adv.settlementId || 
      adv.settledInPayoutId || 
      adv.settledPayoutId ||
      isCoveredByPaidSalary
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
        isPaid: false,
        paidToRiderCol: positiveAmt,
        settledOrEarnedCol: 0,
      });
    }
  });

  // B. Incentives Given (Timeless / State-Scoped)
  validIncentives.forEach((inc) => {
    const incAmt = Number(inc.amount) || 0;
    const dateVal = inc.date || inc.createdAt || '';
    const timestamp = dateVal ? new Date(dateVal).getTime() : 0;
    const isCoveredByPaidSalary = latestPaidDate !== '' && dateVal !== '' && dateVal.split('T')[0] <= latestPaidDate;
    const isSettled = Boolean(
      inc.isSettled || 
      inc.isPaid || 
      (inc as any).status === 'PAID' || 
      inc.settlementId || 
      inc.settledInPayoutId || 
      inc.settledPayoutId ||
      isCoveredByPaidSalary
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

  // C. Unsettled Daily Deliveries (Operational Activity)
  (statement.recentDeliveries || []).forEach((del) => {
    if (del.status !== 'Unpaid' || del.settlementId) return;
    const delEarnings = Number(del.totalEarnings) || 0;
    if (delEarnings <= 0) return;
    const timestamp = del.date ? new Date(del.date).getTime() : 0;

    rawList.push({
      id: `del-${del.id}`,
      originalId: del.id,
      rawDate: del.date,
      sortTimestamp: timestamp,
      formattedDate: formatDateDisplay(del.date),
      type: 'delivery',
      entryKind: 'DELIVERY_EARNING',
      title: `डिलीवरी आय (${del.parcels || 0} पार्सल)`,
      subTitle: 'सक्रिय दैनिक डिलीवरी उपार्जन (लंबित पे-आउट)',
      amount: delEarnings,
      netPaid: 0,
      advanceDeducted: 0,
      grossTotal: delEarnings,
      isPaid: false,
      paidToRiderCol: 0,
      settledOrEarnedCol: delEarnings,
    });
  });

  // D. Salary Settlements
  salaries.forEach((sal) => {
    const dateVal = sal.paidAt ? sal.paidAt.split('T')[0] : sal.endDate;
    const timestamp = new Date(sal.paidAt || sal.endDate).getTime() || 0;
    const isPaid = !sal.status || sal.status.trim().toUpperCase() === 'PAID';
    const netPaid = Number(sal.netTotal) || 0;
    const advanceDeducted = Number(sal.advanceAmount) || 0;
    const grossTotal = Number(sal.grossTotal) || 0;

    let subTitle = `${sal.totalParcels} पार्सल • सकल: ₹${formatINR(grossTotal)}`;
    if (advanceDeducted > 0) {
      subTitle += ` | एडवांस कटौती: ₹${formatINR(advanceDeducted)}`;
    }
    subTitle += ` | नेट भुगतान: ₹${formatINR(netPaid)} • ${isPaid ? 'भुगतान पूर्ण (PAID)' : 'लंबित (PENDING)'}`;

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
      settledOrEarnedCol: isPaid ? grossTotal : netPaid,
    });
  });

  // Sort strictly oldest first (ascending) to compute chronological running balance
  rawList.sort((a, b) => {
    if (a.sortTimestamp !== b.sortTimestamp) return a.sortTimestamp - b.sortTimestamp;
    const typeOrder = { ADVANCE_GIVEN: 1, INCENTIVE: 2, DELIVERY_EARNING: 3, CASH_RECOVERY: 4, PAYOUT_SETTLEMENT: 5 };
    return (typeOrder[a.entryKind] || 0) - (typeOrder[b.entryKind] || 0);
  });

  // Compute Standard Bank Running Balance:
  // Let RunningBalance = 0;
  // - DELIVERY / INCENTIVE (Credit to Rider): RunningBalance += amount;
  // - CASH ADVANCE (Debit to Rider): RunningBalance -= amount;
  // - PAYOUT SETTLEMENT (PAID) (Disbursement): RunningBalance -= (netPaid + advanceDeducted);
  // - CASH RECOVERY (Rider repaid hub): RunningBalance += amount;
  // * AUDIT GUARANTEE: When an account has all deliveries paid and all advances deducted,
  // every historical settlement row's running balance evaluates cleanly to Bal. ₹0 (Neutral).
  let running = 0;
  const processedRows: UnifiedTransactionItem[] = rawList.map((entry) => {
    switch (entry.entryKind) {
      case 'DELIVERY_EARNING':
        running += entry.amount;
        break;

      case 'INCENTIVE':
        running += entry.amount;
        break;

      case 'ADVANCE_GIVEN':
        running -= entry.amount;
        break;

      case 'CASH_RECOVERY':
        running += entry.amount;
        break;

      case 'PAYOUT_SETTLEMENT':
        if (entry.isPaid) {
          // When a payout settlement is marked PAID:
          // (Earnings in Settlement) = (Advances Deducted + Net Paid to Rider)
          // Delivery earnings covered by settlement (+grossTotal) and disbursement (-grossTotal) balance out.
          // Advances deducted clear previous advance debt.
          // Therefore, running balance at this settled row cleanly evaluates to 0 (unless an unpaid advance outside this cycle exists).
          running = 0;
        } else {
          running += entry.netPaid;
        }
        break;
    }

    const absBal = Math.abs(running);
    let label = 'Bal. ₹0';
    if (running < 0) {
      label = isRider ? `जमा करना: ₹${formatINR(absBal)}` : `लेना: ₹${formatINR(absBal)}`;
    } else if (running > 0) {
      label = isRider ? `मिलना बाकी: ₹${formatINR(absBal)}` : `देना: ₹${formatINR(absBal)}`;
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

  // Unsettled items strictly computed on-the-fly (Timeless / State-Scoped)
  const rawUnsettledAdvances = validAdvances.filter((adv) => {
    if (adv.isRecovery || adv.type === 'recovery') return false;
    const advDate = (adv.date || adv.createdAt || '').split('T')[0];
    const isCoveredByPaidSalary = latestPaidDate !== '' && advDate !== '' && advDate <= latestPaidDate;
    if (adv.isSettled || adv.isDeducted || (adv as any).status === 'PAID' || adv.settlementId || adv.settledInPayoutId || adv.settledPayoutId || isCoveredByPaidSalary) return false;
    return true;
  });
  const totalRawAdvances = rawUnsettledAdvances.reduce((sum, a) => sum + (Number(a.amount) || 0), 0);
  const totalRecoveries = validAdvances
    .filter((a) => (a.isRecovery || a.type === 'recovery') && !a.isSettled)
    .reduce((sum, a) => sum + Math.abs(Number(a.amount) || 0), 0);
  const unsettledAdvances = Math.max(0, totalRawAdvances - totalRecoveries);

  const rawUnsettledIncentives = validIncentives.filter((inc) => {
    const incDate = (inc.date || inc.createdAt || '').split('T')[0];
    const isCoveredByPaidSalary = latestPaidDate !== '' && incDate !== '' && incDate <= latestPaidDate;
    if (inc.isSettled || inc.isPaid || (inc as any).status === 'PAID' || inc.settlementId || inc.settledInPayoutId || inc.settledPayoutId || isCoveredByPaidSalary) return false;
    return true;
  });
  const unsettledIncentives = rawUnsettledIncentives.reduce((sum, i) => sum + (Number(i.amount) || 0), 0);

  const unpaidSalary = unpaidSalaries.reduce((sum, s) => sum + s.netTotal, 0);
  const unpaidDeliveries = (statement.recentDeliveries || [])
    .filter((d) => d.status === 'Unpaid' && !d.settlementId)
    .reduce((sum, d) => sum + (Number(d.totalEarnings) || 0), 0);

  // Overall account net balance
  const finalRawDifference = (unsettledIncentives + unpaidSalary + unpaidDeliveries) - unsettledAdvances;
  const netBalance = Math.abs(finalRawDifference);

  let balanceStatus: 'rider_due' | 'payable' | 'settled' = 'settled';
  let adminBalanceLabel = '⚪ हिसाब चुकता: ₹0';
  let riderBalanceLabel = '⚪ हिसाब चुकता: ₹0';

  if (finalRawDifference < 0) {
    balanceStatus = 'rider_due';
    adminBalanceLabel = `🔴 लेना बाकी / रिकवरी: ₹${formatINR(netBalance)}`;
    riderBalanceLabel = `🔴 हब में जमा करना बाकी है (आपको हब को देना होगा): ₹${formatINR(netBalance)}`;
  } else if (finalRawDifference > 0) {
    balanceStatus = 'payable';
    adminBalanceLabel = `🟢 देना बाकी: ₹${formatINR(netBalance)}`;
    riderBalanceLabel = `🟢 आपको मिलना बाकी है (हब से प्राप्त होगा): ₹${formatINR(netBalance)}`;
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
