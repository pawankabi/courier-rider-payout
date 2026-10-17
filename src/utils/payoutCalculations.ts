import { DeliveryEntry, Rider, RiderAdvanceEntry, RiderIncentiveEntry, SettlementRecord } from '../types';
import { formatINR } from './formatters';

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
    (s) => (!riderId || s.riderId === riderId) && (!s.status || s.status.trim().toUpperCase() === 'PAID')
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
    const { settledIncIds, latestPaidDate } = getSettlementContext(settlements, riderId || (inc as any).riderId);
    if (settledIncIds.has(inc.id)) return false;
    if (latestPaidDate) {
      const incDate = inc.date || (inc.createdAt ? inc.createdAt.split('T')[0] : '');
      if (incDate && incDate <= latestPaidDate) return false;
    }
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
  if (adv.isSettled === true || adv.isDeducted === true) return false;
  if ((adv as any).status === 'PAID') return false;
  if (adv.settledInPayoutId || adv.settledPayoutId || adv.settlementId) return false;
  if (adv.isRecovery || adv.type === 'recovery') return false;
  if (adv.id?.startsWith('settle_adj') || adv.reason?.includes('सेटलमेंट समायोजन')) return false;
  const amt = Number(adv.amount) || 0;
  if (amt <= 0) return false;

  if (settlements && settlements.length > 0) {
    const { settledAdvIds, latestPaidDate } = getSettlementContext(settlements, riderId || adv.riderId);
    if (settledAdvIds.has(adv.id)) return false;
    if (latestPaidDate) {
      const advDate = adv.date || (adv.createdAt ? adv.createdAt.split('T')[0] : '');
      if (advDate && advDate <= latestPaidDate) return false;
    }
  }

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
  const { settledAdvIds, latestPaidDate } = getSettlementContext(settlements, riderId);
  const recoveries = advances.filter((a) => {
    if (a.isSettled === true || a.isDeducted === true || (a as any).status === 'PAID' || a.settlementId) return false;
    if (settledAdvIds.has(a.id)) return false;
    if (latestPaidDate) {
      const recDate = a.date || (a.createdAt ? a.createdAt.split('T')[0] : '');
      if (recDate && recDate <= latestPaidDate) return false;
    }
    return (a.isRecovery || a.type === 'recovery') && !a.id?.startsWith('settle_adj');
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
  // In pure Khatabook formula: active advances and active incentives are resolved timelessly.
  // Delivery earnings before startDate that remain Unpaid:
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

  const pastUnsettledIncentives = 0; // Handled directly via timeless ActiveIncentives
  const pastUnrecoveredAdvances = 0; // Handled directly via timeless ActiveAdvances
  const openingBalance = pastUnpaidEarnings;

  if (openingBalance > 0) {
    return {
      openingBalance,
      pastUnpaidEarnings,
      pastUnsettledIncentives,
      pastUnrecoveredAdvances,
      status: 'payable',
      label: `पिछला बकाया पाना बाकी (Opening Balance: +₹${formatINR(openingBalance)})`,
      hindiDescription: `पिछला बकाया पाना बाकी (+₹${formatINR(openingBalance)})`,
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
 * Any rider whose previous settlements are PAID will immediately flip from red "लेना बाकी" to green/neutral "हिसाब चुकता: ₹0".
 * Ensure all historical incentives and advances included in past PAID payouts are marked isSettled: true across all riders.
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

    const settledAdvIds = new Set<string>();
    const settledIncIds = new Set<string>();
    let latestPaidDate = '';

    riderPaidSettlements.forEach((s) => {
      (s.settledAdvanceIds || []).forEach((id) => settledAdvIds.add(id));
      (s.settledIncentiveIds || []).forEach((id) => settledIncIds.add(id));
      const d = s.endDate || (s.paidAt ? s.paidAt.split('T')[0] : '');
      if (d > latestPaidDate) latestPaidDate = d;
    });

    // 1. Sanitize & settle advances
    const originalAdvances = rider.advances || [];
    const sanitizedAdvances: RiderAdvanceEntry[] = [];

    for (const adv of originalAdvances) {
      // Purge ghost settle_adj entries
      const amt = Number(adv.amount) || 0;
      const isGhost = adv.id?.startsWith('settle_adj') || adv.reason?.includes('सेटलमेंट समायोजन') || amt <= 0;
      if (isGhost) {
        riderChanged = true;
        continue;
      }

      const advDate = adv.date || (adv.createdAt ? adv.createdAt.split('T')[0] : '');
      const shouldBeSettled = 
        adv.isSettled === true || 
        adv.isDeducted === true || 
        (adv as any).status === 'PAID' ||
        Boolean(adv.settlementId) ||
        settledAdvIds.has(adv.id) ||
        (latestPaidDate !== '' && advDate !== '' && advDate <= latestPaidDate);

      if (shouldBeSettled && (!adv.isSettled || !adv.isDeducted || (adv as any).status !== 'PAID')) {
        sanitizedAdvances.push({
          ...adv,
          isSettled: true,
          isDeducted: true,
          status: 'PAID',
        });
        riderChanged = true;
      } else {
        sanitizedAdvances.push(adv);
      }
    }

    // 2. Sanitize & settle incentives
    const originalIncentives = rider.incentives || [];
    const sanitizedIncentives: RiderIncentiveEntry[] = [];

    for (const inc of originalIncentives) {
      const amt = Number(inc.amount) || 0;
      if (amt <= 0) {
        riderChanged = true;
        continue;
      }

      const incDate = inc.date || (inc.createdAt ? inc.createdAt.split('T')[0] : '');
      const shouldBeSettled =
        inc.isSettled === true ||
        inc.isPaid === true ||
        (inc as any).status === 'PAID' ||
        Boolean(inc.settlementId) ||
        settledIncIds.has(inc.id) ||
        (latestPaidDate !== '' && incDate !== '' && incDate <= latestPaidDate);

      if (shouldBeSettled && (!inc.isSettled || !inc.isPaid || (inc as any).status !== 'PAID')) {
        sanitizedIncentives.push({
          ...inc,
          isSettled: true,
          isPaid: true,
          status: 'PAID',
        });
        riderChanged = true;
      } else {
        sanitizedIncentives.push(inc);
      }
    }

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
