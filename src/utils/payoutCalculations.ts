import { DeliveryEntry, Rider, RiderAdvanceEntry, RiderIncentiveEntry, SettlementRecord } from '../types';
import { formatINR } from './formatters';
import { purgePhantomAdvances } from './pureLedgerEngine';

export interface OpeningBalanceResult {
  openingBalance: number;
  pastUnpaidEarnings: number;
  pastUnsettledIncentives: number;
  pastUnrecoveredAdvances: number;
  status: 'payable' | 'rider_debt' | 'zero';
  label: string;
  hindiDescription: string;
}

export interface SettlementCalculationResult {
  deliveryEarnings: number;
  deliveryParcels: number;
  deliveryBaseAmount: number;
  deliveryIncentiveAmount: number;
  activeIncentives: RiderIncentiveEntry[];
  totalIncentive: number;
  activeAdvances: RiderAdvanceEntry[];
  totalAdvanceDeduction: number;
  grossEarnings: number;
  finalNetPayable: number;
  status: 'payable' | 'recovery_due' | 'zero';
  statusLabel: string;
}

export interface ActiveCycleNetPayableResult {
  openingBalanceResult: OpeningBalanceResult;
  periodDeliveriesGross: number;
  periodBaseEarnings: number;
  periodDeliveryIncentive: number;
  periodParcels: number;
  periodUnsettledIncentives: number;
  activeUnsettledAdvances: number;
  netPayable: number;
  receivableOrPayableStatus: 'payable_to_rider' | 'recovery_from_rider' | 'zero';
  statusLabel: string;
}

/**
 * Helper to collect all settled IDs and latest paid settlement date
 */
function getSettlementContext(settlements?: SettlementRecord[], riderId?: string) {
  const paidSettlements = (settlements || []).filter(
    (s) =>
      (!riderId || s.riderId === riderId) &&
      (!s.status || s.status.trim().toUpperCase() === 'PAID' || s.status.trim().toUpperCase() === 'SETTLED')
  );
  const settledAdvIds = new Set<string>();
  const settledIncIds = new Set<string>();
  let latestPaidDate = '';

  paidSettlements.forEach((s) => {
    (s.settledAdvanceIds || []).forEach((id) => settledAdvIds.add(id));
    (s.settledIncentiveIds || []).forEach((id) => settledIncIds.add(id));
    const d = s.endDate || (s.paidAt ? s.paidAt.split('T')[0] : '');
    if (d > latestPaidDate) latestPaidDate = d;
  });

  return { paidSettlements, settledAdvIds, settledIncIds, latestPaidDate };
}

/**
 * STANDARD KHATABOOK / BANKING FORMULAS:
 * Check if an incentive is active and unsettled.
 * Timeless / State-Scoped: Stays active across ALL time horizons until fully settled by a paid settlement.
 */
export function isUnsettledIncentive(
  inc: RiderIncentiveEntry,
  settlements?: SettlementRecord[],
  riderId?: string
): boolean {
  if (inc.isSettled === true || inc.isPaid === true) return false;
  if ((inc as any).status === 'PAID') return false;
  if (inc.settledInPayoutId || inc.settledPayoutId || inc.settlementId) return false;
  const amt = Number(inc.amount) || 0;
  if (amt <= 0) return false;

  if (settlements && settlements.length > 0) {
    const { settledIncIds } = getSettlementContext(settlements, riderId || (inc as any).riderId);
    if (settledIncIds.has(inc.id)) return false;
  }

  return true;
}

/**
 * Return all active, unsettled incentives for a rider (Timeless).
 */
export function getActiveIncentives(
  incentives?: RiderIncentiveEntry[],
  settlements?: SettlementRecord[],
  riderId?: string
): RiderIncentiveEntry[] {
  if (!Array.isArray(incentives)) return [];
  return incentives.filter((i) => isUnsettledIncentive(i, settlements, riderId));
}

/**
 * Sum ALL active, unsettled incentives (Timeless / State-Scoped).
 * If all are settled, strictly returns 0.
 */
export function calculateActiveIncentiveTotal(
  incentives?: RiderIncentiveEntry[],
  settlements?: SettlementRecord[],
  riderId?: string
): number {
  if (!Array.isArray(incentives) || incentives.length === 0) return 0;
  return getActiveIncentives(incentives, settlements, riderId)
    .reduce((sum, i) => sum + (Number(i.amount) || 0), 0);
}

/**
 * STANDARD KHATABOOK / BANKING FORMULAS:
 * Check if an advance is active and unsettled/unrecovered.
 * Timeless / State-Scoped: Stays active across ALL time horizons until fully settled or recovered.
 */
export function isUnsettledAdvance(
  adv: RiderAdvanceEntry,
  settlements?: SettlementRecord[],
  riderId?: string
): boolean {
  if (!adv) return false;
  const advId = String(adv.id || (adv as any)._id || '').trim();

  // 1) adv.isSettled !== true && (adv as any).status !== 'PAID'
  if (adv.isSettled === true || (adv as any).status === 'PAID') return false;

  // 2) If settlements exist: !settlements.some(s => (s.status === 'PAID' || s.status === 'SETTLED') && Array.isArray(s.settledAdvanceIds) && s.settledAdvanceIds.includes(String(adv.id || (adv as any)._id)))
  // If settlements is empty or undefined, this condition passes automatically
  if (settlements && Array.isArray(settlements) && settlements.length > 0) {
    const isAlreadySettledInRecord = settlements.some(
      (s) =>
        (!riderId || String(s.riderId).trim() === String(riderId).trim()) &&
        (!s.status || s.status.trim().toUpperCase() === 'PAID' || s.status.trim().toUpperCase() === 'SETTLED') &&
        Array.isArray(s.settledAdvanceIds) &&
        s.settledAdvanceIds.some((id) => String(id).trim() === advId)
    );
    if (isAlreadySettledInRecord) return false;
  }

  // 3) Number(adv.amount) > 0
  const amt = Number(adv.amount) || 0;
  if (amt <= 0) return false;

  // 4) adv.type !== 'recovery' && !adv.isRecovery
  if (adv.type === 'recovery' || adv.isRecovery) return false;

  // 5) !String(adv.id || '').startsWith('settle_adj') && !String(adv.id || '').startsWith('adv_cf_') && !adv.reason?.includes('सेटलमेंट समायोजन')
  if (advId.startsWith('settle_adj') || advId.startsWith('adv_cf_') || adv.reason?.includes('सेटलमेंट समायोजन')) return false;

  return true;
}

/**
 * Return all active, unsettled advances for a rider (Timeless).
 */
export function getActiveAdvances(
  advances?: RiderAdvanceEntry[],
  settlements?: SettlementRecord[],
  riderId?: string
): RiderAdvanceEntry[] {
  if (!Array.isArray(advances)) return [];
  return advances.filter((a) => isUnsettledAdvance(a, settlements, riderId));
}

/**
 * Sum ALL active, unsettled advances (Timeless / State-Scoped).
 * Active Advances = Sum of unrecovered advances where isSettled !== true && isDeducted !== true.
 * If all are settled, strictly returns 0.
 */
export function calculateActiveAdvanceTotal(
  advances?: RiderAdvanceEntry[],
  settlements?: SettlementRecord[],
  riderId?: string
): number {
  if (!Array.isArray(advances) || advances.length === 0) return 0;

  // 1. Total positive advances given that are unsettled
  const validAdvances = getActiveAdvances(advances, settlements, riderId);
  const totalAdvances = validAdvances.reduce((sum, a) => sum + (Number(a.amount) || 0), 0);

  // 2. Total active un-settled cash recoveries
  const { settledAdvIds } = getSettlementContext(settlements, riderId);
  const recoveries = advances.filter((a) => {
    if (a.isSettled === true || a.isDeducted === true || (a as any).status === 'PAID' || a.settlementId) return false;
    if (settledAdvIds.has(a.id)) return false;
    return (a.isRecovery || a.type === 'recovery') && !a.id?.startsWith('settle_adj') && (Number(a.amount) || 0) !== 0;
  });
  const totalRecoveries = recoveries.reduce((sum, a) => sum + Math.abs(Number(a.amount) || 0), 0);

  return Math.max(0, totalAdvances - totalRecoveries);
}

/**
 * 1. SETTLEMENT NET PAYABLE FORMULA (SettlementTab.tsx & payoutCalculations.ts):
 * When generating a payout settlement for ANY rider:
 *   a) OPERATIONAL EARNINGS (Scoped strictly to selected [startDate, endDate]):
 *      DeliveryEarnings = Sum of verified delivered parcels rate within the date range.
 *   
 *   b) ALL ACTIVE UNSETTLED INCENTIVES (Timeless / State-Scoped):
 *      ActiveIncentives = All incentives for rider where isSettled !== true && isPaid !== true && status !== 'PAID'.
 *      TotalIncentive = Sum(ActiveIncentives.map(i => Number(i.amount) || 0));
 *   
 *   c) ALL ACTIVE UNSETTLED ADVANCES (Timeless / State-Scoped):
 *      ActiveAdvances = All advances for rider where isSettled !== true && isDeducted !== true && status !== 'PAID'.
 *      TotalAdvanceDeduction = Sum(ActiveAdvances.map(a => Number(a.amount) || 0));
 *   
 *   d) TRUE NET PAYABLE:
 *      Gross Earnings = DeliveryEarnings + TotalIncentive;
 *      Final Net Payable = Gross Earnings - TotalAdvanceDeduction;
 */
export function calculateSettlementNetPayable(
  entries: DeliveryEntry[],
  riderId: string,
  startDate: string,
  endDate: string,
  advances: RiderAdvanceEntry[] = [],
  incentives: RiderIncentiveEntry[] = []
): SettlementCalculationResult {
  // a) Operational Earnings (scoped strictly to selected [startDate, endDate])
  const periodEntries = entries.filter((e) => {
    if (e.riderId !== riderId) return false;
    if (startDate && e.date < startDate) return false;
    if (endDate && e.date > endDate) return false;
    return true;
  });

  const deliveryParcels = periodEntries.reduce((sum, e) => sum + (e.parcels || 0), 0);
  const deliveryBaseAmount = periodEntries.reduce((sum, e) => sum + (e.baseAmount || 0), 0);
  const deliveryIncentiveAmount = periodEntries.reduce((sum, e) => sum + (e.incentiveAmount || 0), 0);
  const deliveryEarnings = periodEntries.reduce((sum, e) => sum + (e.totalEarnings || 0), 0);

  // b) ALL Active Unsettled Incentives (Timeless / State-Scoped)
  const activeIncentivesList = getActiveIncentives(incentives);
  const totalIncentive = activeIncentivesList.reduce((sum, i) => sum + (Number(i.amount) || 0), 0);

  // c) ALL Active Unsettled Advances (Timeless / State-Scoped)
  const activeAdvancesList = getActiveAdvances(advances);
  const totalAdvanceDeduction = calculateActiveAdvanceTotal(advances);

  // d) True Net Payable
  const grossEarnings = deliveryEarnings + totalIncentive;
  const finalNetPayable = grossEarnings - totalAdvanceDeduction;

  let status: 'payable' | 'recovery_due' | 'zero' = 'zero';
  let statusLabel = '⚪ हिसाब चुकता (₹0)';
  if (finalNetPayable > 0) {
    status = 'payable';
    statusLabel = `🟢 कुल देय (Net Payable): ₹${formatINR(finalNetPayable)}`;
  } else if (finalNetPayable < 0) {
    status = 'recovery_due';
    statusLabel = `🔴 हब को वसूली योग्य (Recovery Due): ₹${formatINR(Math.abs(finalNetPayable))}`;
  }

  return {
    deliveryEarnings,
    deliveryParcels,
    deliveryBaseAmount,
    deliveryIncentiveAmount,
    activeIncentives: activeIncentivesList,
    totalIncentive,
    activeAdvances: activeAdvancesList,
    totalAdvanceDeduction,
    grossEarnings,
    finalNetPayable,
    status,
    statusLabel,
  };
}

/**
 * Historical Opening Balance helper for statements (compatible bridge)
 */
export function calculateOpeningBalance(
  riderId: string,
  startDate: string,
  entries: DeliveryEntry[] = [],
  advances: RiderAdvanceEntry[] = [],
  incentives: RiderIncentiveEntry[] = [],
  settlements: SettlementRecord[] = []
): OpeningBalanceResult {
  // 1. Unpaid operational deliveries strictly dated before startDate that are not in any settlement
  const pastPaidSettlementDates = (settlements || [])
    .filter((s) => s.riderId === riderId && (!s.status || s.status.trim().toUpperCase() === 'PAID'))
    .map((s) => s.endDate)
    .sort();
  const latestPaidDate = pastPaidSettlementDates.pop() || '';

  const pastUnpaidEntries = entries.filter((e) => {
    if (e.riderId !== riderId) return false;
    if (!e.date || e.date >= startDate) return false;
    if (latestPaidDate && e.date <= latestPaidDate) return false;
    if (e.settlementId) return false;
    return e.status === 'Unpaid';
  });
  const pastUnpaidEarnings = pastUnpaidEntries.reduce((sum, e) => sum + (Number(e.totalEarnings) || 0), 0);

  // 2. Prior negative net settlements (where earnings were insufficient to cover advances)
  const priorSettlements = (settlements || []).filter(
    (s) => s.riderId === riderId && (!s.status || s.status.trim().toUpperCase() === 'PAID') && (!startDate || s.endDate < startDate)
  );
  let priorUnrecoveredSettlementDebt = 0;
  priorSettlements.forEach((s) => {
    const net = Number(s.netTotal) || 0;
    if (net < 0) {
      priorUnrecoveredSettlementDebt += Math.abs(net);
    }
  });

  // 3. Active unsettled advances originating before startDate
  const priorActiveAdvances = (advances || []).filter((a) => {
    if (a.isSettled || a.isDeducted || (a as any).status === 'PAID' || a.settlementId) return false;
    if (a.isRecovery || a.type === 'recovery') return false;
    const advDate = (a.date || a.createdAt || '').split('T')[0];
    if (startDate && advDate && advDate >= startDate) return false;
    return (Number(a.amount) || 0) > 0;
  });
  const pastUnrecoveredAdvances = Math.max(
    priorActiveAdvances.reduce((sum, a) => sum + (Number(a.amount) || 0), 0),
    priorUnrecoveredSettlementDebt
  );

  const openingBalance = pastUnpaidEarnings - pastUnrecoveredAdvances;

  if (openingBalance > 0.01) {
    return {
      openingBalance,
      pastUnpaidEarnings,
      pastUnsettledIncentives: 0,
      pastUnrecoveredAdvances: 0,
      status: 'payable',
      label: `पिछला बकाया पाना बाकी (Opening Balance: +₹${formatINR(openingBalance)})`,
      hindiDescription: `पिछला बकाया पाना बाकी (+₹${formatINR(openingBalance)})`,
    };
  } else if (openingBalance < -0.01) {
    const debt = Math.abs(openingBalance);
    return {
      openingBalance,
      pastUnpaidEarnings,
      pastUnsettledIncentives: 0,
      pastUnrecoveredAdvances: debt,
      status: 'rider_debt',
      label: `पहले का बकाया (Previous Debt): -₹${formatINR(debt)}`,
      hindiDescription: `पहले का बकाया (Previous Debt): -₹${formatINR(debt)} (हब को वसूली योग्य)`,
    };
  }

  return {
    openingBalance: 0,
    pastUnpaidEarnings: 0,
    pastUnsettledIncentives: 0,
    pastUnrecoveredAdvances: 0,
    status: 'zero',
    label: 'प्रारंभिक शेष: ₹0 (Clean Slate)',
    hindiDescription: 'हिसाब चुकता (Clean Slate: ₹0)',
  };
}

/**
 * Backward compatibility wrapper
 */
export function calculateActiveCycleNetPayable(
  riderId: string,
  startDate: string,
  endDate: string,
  entries: DeliveryEntry[] = [],
  advances: RiderAdvanceEntry[] = [],
  incentives: RiderIncentiveEntry[] = []
): ActiveCycleNetPayableResult {
  const result = calculateSettlementNetPayable(
    entries,
    riderId,
    startDate,
    endDate,
    advances,
    incentives
  );

  return {
    openingBalanceResult: {
      openingBalance: 0,
      pastUnpaidEarnings: 0,
      pastUnsettledIncentives: 0,
      pastUnrecoveredAdvances: 0,
      status: 'zero',
      label: 'प्रारंभिक शेष: ₹0 (Clean Slate)',
      hindiDescription: 'हिसाब चुकता (Clean Slate: ₹0)',
    },
    periodDeliveriesGross: result.deliveryEarnings,
    periodBaseEarnings: result.deliveryBaseAmount,
    periodDeliveryIncentive: result.deliveryIncentiveAmount,
    periodParcels: result.deliveryParcels,
    periodUnsettledIncentives: result.totalIncentive,
    activeUnsettledAdvances: result.totalAdvanceDeduction,
    netPayable: result.finalNetPayable,
    receivableOrPayableStatus: result.status === 'payable' ? 'payable_to_rider' : result.status === 'recovery_due' ? 'recovery_from_rider' : 'zero',
    statusLabel: result.statusLabel,
  };
}

/**
 * 4. AUTOMATIC RECALCULATION & CACHE INVALIDATION FOR ALL RIDERS:
 * Run a global ledger re-index on app load so every rider's ledger sheet immediately recalculates correctly.
 * NEVER wipe out unrecovered advances:
 * Lifetime unrecovered debt = totalAdvancesTaken - totalAdvanceCoveredByEarnings - totalRecoveries.
 * If a rider owes ₹2,635, it stays active as an unrecovered advance across ALL cycles until fully paid!
 */
export function reindexAndSanitizeRiderBalances(
  riders: Rider[],
  settlements: SettlementRecord[]
): { updatedRiders: Rider[]; hasChanges: boolean } {
  if (!Array.isArray(riders) || riders.length === 0) {
    return { updatedRiders: riders || [], hasChanges: false };
  }

  let hasAnyChange = false;

  const updatedRiders = riders.map((rider) => {
    let riderChanged = false;
    const riderPaidSettlements = (settlements || []).filter(
      (s) => s.riderId === rider.id && (!s.status || s.status.trim().toUpperCase() === 'PAID')
    );

    // 1. Lifetime earnings and cash disbursed from paid settlements
    const totalGrossEarned = riderPaidSettlements.reduce((sum, s) => sum + (Number(s.grossTotal) || 0), 0);
    const totalCashDisbursed = riderPaidSettlements.reduce((sum, s) => sum + Math.max(0, Number(s.netTotal) || 0), 0);
    // Lifetime earnings used towards advances:
    const totalAdvanceCoveredByEarnings = Math.max(0, totalGrossEarned - totalCashDisbursed);

    // Lifetime advances taken & recoveries:
    // Strictly filter out any synthetic/phantom duplicates (adv_cf_, settle_adj, etc.)
    const originalAdvances = purgePhantomAdvances(rider.advances || []);
    const regularAdvances = originalAdvances.filter((a) => !a.isRecovery && a.type !== 'recovery');
    const recoveries = originalAdvances.filter((a) => a.isRecovery || a.type === 'recovery');

    const totalAdvancesTaken = regularAdvances.reduce((sum, a) => sum + (Number(a.amount) || 0), 0);
    const totalRecoveries = recoveries.reduce((sum, a) => sum + Math.abs(Number(a.amount) || 0), 0);

    // True mathematical unrecovered advance debt
    const netUnrecoveredDebt = Math.max(0, totalAdvancesTaken - totalAdvanceCoveredByEarnings - totalRecoveries);

    // Sort regular advances chronologically oldest to newest
    const sortedRegular = [...regularAdvances].sort((a, b) => {
      const timeA = new Date(a.date || a.createdAt || 0).getTime();
      const timeB = new Date(b.date || b.createdAt || 0).getTime();
      return timeA - timeB;
    });

    let allowanceToSettle = totalAdvanceCoveredByEarnings + totalRecoveries;
    const sanitizedAdvances: RiderAdvanceEntry[] = [];

    // If net debt is zero, ALL advances are completely settled (Clean slate: 0)
    if (netUnrecoveredDebt === 0) {
      sortedRegular.forEach((adv) => {
        if (!adv.isSettled || !adv.isDeducted || (adv as any).status !== 'PAID') {
          riderChanged = true;
        }
        sanitizedAdvances.push({
          ...adv,
          isSettled: true,
          isDeducted: true,
          status: 'PAID',
        });
      });
    } else {
      // Partially unrecovered debt: Settle up to allowance, keep remainder strictly active
      sortedRegular.forEach((adv) => {
        const amt = Number(adv.amount) || 0;
        if (allowanceToSettle >= amt) {
          allowanceToSettle -= amt;
          if (!adv.isSettled || !adv.isDeducted || (adv as any).status !== 'PAID') {
            riderChanged = true;
          }
          sanitizedAdvances.push({
            ...adv,
            isSettled: true,
            isDeducted: true,
            status: 'PAID',
          });
        } else if (allowanceToSettle > 0) {
          const coveredAmt = allowanceToSettle;
          const unrecoveredAmt = amt - coveredAmt;
          allowanceToSettle = 0;
          riderChanged = true;

          // 1. Covered portion marked settled
          sanitizedAdvances.push({
            ...adv,
            amount: coveredAmt,
            isSettled: true,
            isDeducted: true,
            status: 'PAID',
          });
          // 2. Active unrecovered portion
          const remId = adv.id.endsWith('_rem') ? adv.id : `${adv.id}_rem`;
          sanitizedAdvances.push({
            id: remId,
            riderId: rider.id,
            amount: unrecoveredAmt,
            date: adv.date,
            createdAt: adv.createdAt || new Date().toISOString(),
            reason: adv.reason || 'बकाया एडवांस (Carry Forward Debt)',
            isSettled: false,
            isDeducted: false,
            status: 'UNPAID',
            runningBalance: unrecoveredAmt,
          });
        } else {
          // Entirely active unrecovered advance
          if (adv.isSettled || adv.isDeducted || (adv as any).status === 'PAID') {
            riderChanged = true;
          }
          sanitizedAdvances.push({
            ...adv,
            isSettled: false,
            isDeducted: false,
            status: 'UNPAID',
          });
        }
      });
    }

    // Include recoveries in sanitizedAdvances
    recoveries.forEach((rec) => {
      sanitizedAdvances.push(rec);
    });

    // Check if rider's advances list or totalAdvance changed
    if (rider.advances?.length !== sanitizedAdvances.length) {
      riderChanged = true;
    }
    if (rider.totalAdvance !== netUnrecoveredDebt) {
      riderChanged = true;
    }

    // 2. Sanitize Incentives with lifetime double-entry math
    const totalIncentivesEarned = (rider.incentives || []).reduce((sum, i) => sum + (Number(i.amount) || 0), 0);
    const totalIncentivesSettledInPayouts = riderPaidSettlements.reduce((sum, s) => sum + (Number(s.incentiveAmount) || 0), 0);
    let allowanceToPayIncentive = totalIncentivesSettledInPayouts;

    const sortedIncentives = [...(rider.incentives || [])].sort((a, b) => {
      const timeA = new Date(a.date || a.createdAt || 0).getTime();
      const timeB = new Date(b.date || b.createdAt || 0).getTime();
      return timeA - timeB;
    });

    const sanitizedIncentives: RiderIncentiveEntry[] = [];
    sortedIncentives.forEach((inc) => {
      const amt = Number(inc.amount) || 0;
      if (amt <= 0) return;

      if (allowanceToPayIncentive >= amt) {
        allowanceToPayIncentive -= amt;
        if (!inc.isSettled || !inc.isPaid || (inc as any).status !== 'PAID') {
          riderChanged = true;
        }
        sanitizedIncentives.push({
          ...inc,
          isSettled: true,
          isPaid: true,
          status: 'PAID',
        });
      } else {
        if (inc.isSettled || inc.isPaid || (inc as any).status === 'PAID') {
          riderChanged = true;
        }
        sanitizedIncentives.push({
          ...inc,
          isSettled: false,
          isPaid: false,
          status: 'UNPAID',
        });
      }
    });

    const newActiveAdv = calculateActiveAdvanceTotal(sanitizedAdvances, settlements, rider.id);
    const newActiveInc = calculateActiveIncentiveTotal(sanitizedIncentives, settlements, rider.id);

    if (rider.totalAdvance !== newActiveAdv || rider.totalIncentive !== newActiveInc) {
      riderChanged = true;
    }

    if (riderChanged) {
      hasAnyChange = true;
      return {
        ...rider,
        advances: sanitizedAdvances,
        incentives: sanitizedIncentives,
        totalAdvance: newActiveAdv,
        totalIncentive: newActiveInc,
      };
    }

    return rider;
  });

  return { updatedRiders, hasChanges: hasAnyChange };
}
