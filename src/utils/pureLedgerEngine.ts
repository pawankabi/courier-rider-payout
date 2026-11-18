/**
 * Pure Ledger Calculation Engine (Ground Truth Single Source of Truth)
 * 
 * Strict Arithmetic Protocol:
 * - Plus (+) Entries: Delivered parcel payouts, active daily deliveries, incentives, and festival bonuses earned.
 * - Minus (-) Entries: Advances taken, fuel/cash cash-outs, and cash payouts settled.
 * - Net Balance = sum(Delivery Earnings + Bonuses) - sum(Advances + Fuel Cashouts + Settlements Paid)
 * 
 * Contextual Hindi Labels:
 * Case 1: Rider Owes Hub (Advances > Earnings, e.g. Sample Rider: Advances ₹11,445 - Salary Payout ₹8,810 = ₹2,635):
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
import { formatINR, formatDateDisplay, getTodayDateString } from './formatters';

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
  isSettled?: boolean;
  isRecovery?: boolean;
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
  const id = String(adv.id || (adv as any)._id || '');
  if (
    id.startsWith('adv_cf_') ||
    id.startsWith('settle_adj') ||
    id.startsWith('adv-settlement-implicit')
  ) {
    return true;
  }
  const reason = adv.reason || '';
  if (reason.includes('सेटलमेंट समायोजन')) {
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
 * Check if an advance entry is a synthetic carryover/placeholder token generated during settlement
 * rather than an authentic user-entered advance.
 */
function isSyntheticDisplayAdvance(adv: Partial<RiderAdvanceEntry>): boolean {
  if (!adv) return true;
  const sId = String(adv.id || (adv as any)._id || '').trim();
  if (
    sId.startsWith('adv_rem_') ||
    sId.startsWith('adv_deficit_') ||
    sId.startsWith('settlement_adv_') ||
    sId.endsWith('_rem') ||
    sId.startsWith('adv_cf_') ||
    sId.startsWith('settle_adj') ||
    sId.startsWith('adv-settlement-implicit')
  ) {
    return true;
  }
  const reason = adv.reason || '';
  if (reason.includes('सेटलमेंट समायोजन') || reason.includes('पिछला सेटलमेंट घाटा')) {
    return true;
  }
  return false;
}

/**
 * Pure arithmetic calculation of rider ledger timeline and net balance.
 * Reflects real-time ground truth from active and historical database collections.
 * NOTE: Daily delivery entries (`recentDeliveries`) are intentionally excluded from the ledger timeline.
 */
export function calculatePureRiderLedger(
  statement: PublicRiderStatement | null | undefined,
  sortOrder: 'asc' | 'desc' = 'desc',
  isRider: boolean = false,
  externalSettlements?: any[],
  externalAdvances?: RiderAdvanceEntry[]
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

  // 1. Gather Authentic Advances (resolving both statement.advances and external master advances)
  const isNotDeleted = (item: any) =>
    Boolean(item) &&
    item.isDeleted !== true &&
    item.status !== 'DELETED' &&
    item.status !== 'RESET_ARCHIVED';

  const rawAdvancesMap = new Map<string, RiderAdvanceEntry>();
  const noIdAdvances: RiderAdvanceEntry[] = [];
  const addAdv = (a: RiderAdvanceEntry) => {
    if (!a) return;
    const key = String(a.id || (a as any)._id || '').trim();
    if (key) {
      const existing = rawAdvancesMap.get(key);
      // Authoritative deleted status or external master update overrides stale snapshot
      if (!existing || a.isDeleted || (a as any).status === 'DELETED' || (a as any).status === 'RESET_ARCHIVED') {
        rawAdvancesMap.set(key, a);
      } else {
        rawAdvancesMap.set(key, { ...existing, ...a });
      }
    } else {
      noIdAdvances.push(a);
    }
  };

  const cleanPhone = (p?: string) => (p || '').replace(/\D/g, '').slice(-10);
  const targetRiderId = String(statement.riderId || '').trim();
  const targetPhone = cleanPhone(statement.riderPhone);

  (statement.advances || []).forEach(addAdv);
  if (externalAdvances && Array.isArray(externalAdvances)) {
    externalAdvances
      .filter((a) => {
        if (!a) return false;
        const aRiderId = String(a.riderId || '').trim();
        const aPhone = cleanPhone((a as any).riderPhone);
        return (targetRiderId && aRiderId === targetRiderId) || (targetPhone && aPhone && aPhone === targetPhone);
      })
      .forEach(addAdv);
  }

  const rawAdvancesList: RiderAdvanceEntry[] = [...Array.from(rawAdvancesMap.values()), ...noIdAdvances].filter(isNotDeleted);
  const validAdvances: RiderAdvanceEntry[] = purgePhantomAdvances(rawAdvancesList);

  // 2. Gather Authentic Incentives (deduplicated by id)
  const rawIncMap = new Map<string, RiderIncentiveEntry>();
  (statement.incentives || []).forEach((i) => {
    if (!isNotDeleted(i) || (Number(i.amount) || 0) <= 0) return;
    const key = String(i.id || `${i.date}_${i.amount}_${i.reason}`).trim();
    const prev = rawIncMap.get(key);
    rawIncMap.set(key, prev ? { ...prev, ...i } : i);
  });
  const validIncentives: RiderIncentiveEntry[] = Array.from(rawIncMap.values());

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
      .filter((s: any) => {
        if (!s) return false;
        const sRiderId = String(s.riderId || '').trim();
        const sPhone = cleanPhone(s.riderPhone);
        return (targetRiderId && sRiderId === targetRiderId) || (targetPhone && sPhone && sPhone === targetPhone);
      })
      .forEach((s: any) => {
        const key = `${s.startDate}_${s.endDate}`;
        if (!seenSalKeys.has(key)) {
          seenSalKeys.add(key);
          uniqueSalaries.push(s);
        }
      });
  }

  type ExtendedSalaryRecord = LedgerSalaryRecord & {
    settledAdvanceIds?: string[];
    settledIncentiveIds?: string[];
  };

  const salaries: ExtendedSalaryRecord[] = uniqueSalaries.map((s: any) => ({
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
    settledAdvanceIds: s.settledAdvanceIds,
    settledIncentiveIds: s.settledIncentiveIds,
  }));

  const paidOrSettledSalaries = salaries.filter(
    (s) => !s.status || s.status.trim().toUpperCase() === 'PAID' || s.status.trim().toUpperCase() === 'SETTLED'
  );
  const paidSalIdSet = new Set(paidOrSettledSalaries.map((s) => String(s.id || '').trim()).filter(Boolean));

  // Helper: check if an advance is active and truly unsettled
  const isUnsettledAdvanceEntry = (adv: RiderAdvanceEntry): boolean => {
    if (!adv) return false;
    if (!isNotDeleted(adv)) return false;
    const advId = String(adv.id || (adv as any)._id || '').trim();

    if (adv.isSettled === true || (adv as any).status === 'PAID' || (adv as any).status === 'SETTLED') return false;

    const amt = Number(adv.amount) || 0;
    if (amt <= 0) return false;

    if (adv.type === 'recovery' || adv.isRecovery) return false;

    if (advId.startsWith('settle_adj') || advId.startsWith('adv_cf_') || adv.reason?.includes('सेटलमेंट समायोजन')) return false;

    if (paidOrSettledSalaries.length > 0) {
      const isSettledInSalaries = paidOrSettledSalaries.some((s) => {
        return (
          advId !== `adv_deficit_${s.id}` &&
          advId !== `adv_rem_${s.id}` &&
          !advId.endsWith('_rem') &&
          Array.isArray(s.settledAdvanceIds) &&
          s.settledAdvanceIds.some((id: any) => String(id).trim() === advId)
        );
      });
      if (isSettledInSalaries) return false;
    }

    return true;
  };

  const isSettledIncentiveEntry = (inc: RiderIncentiveEntry): boolean => {
    const incId = String(inc.id || '').trim();
    if (
      inc.isSettled ||
      inc.isPaid ||
      (inc as any).status === 'PAID' ||
      (inc as any).status === 'SETTLED' ||
      inc.settlementId ||
      inc.settledPayoutId ||
      inc.settledInPayoutId
    ) {
      return true;
    }
    return paidOrSettledSalaries.some(
      (s) => Array.isArray(s.settledIncentiveIds) && s.settledIncentiveIds.some((id: any) => String(id).trim() === incId)
    );
  };

  const isSettledRecoveryEntry = (rec: RiderAdvanceEntry): boolean => {
    const recId = String(rec.id || (rec as any)._id || '').trim();
    if (
      rec.isSettled === true ||
      rec.isDeducted === true ||
      (rec as any).status === 'PAID' ||
      (rec as any).status === 'SETTLED' ||
      rec.settlementId ||
      rec.settledPayoutId
    ) {
      return true;
    }
    return paidOrSettledSalaries.some(
      (s) => Array.isArray(s.settledAdvanceIds) && s.settledAdvanceIds.some((id: any) => String(id).trim() === recId)
    );
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
    isSettled?: boolean;
    isRecovery?: boolean;
  }

  const rawList: DraftLedgerEntry[] = [];

  // A. ALL Authentic Advances Taken & Cash Recoveries (Both Settled AND Unsettled stay visible!)
  validAdvances.forEach((adv) => {
    if (isSyntheticDisplayAdvance(adv)) return;
    const amt = Number(adv.amount) || 0;
    const isRec = Boolean(adv.isRecovery || adv.type === 'recovery');
    const positiveAmt = Math.abs(amt);
    const dateVal = adv.date || adv.createdAt || '';
    const timestamp = dateVal ? new Date(dateVal).getTime() : 0;
    const entryId = String(adv.id || (adv as any)._id || `${dateVal}_${positiveAmt}`);

    if (isRec) {
      const settled = isSettledRecoveryEntry(adv);
      rawList.push({
        id: `rec-${entryId}`,
        originalId: entryId,
        rawDate: dateVal,
        sortTimestamp: isNaN(timestamp) ? 0 : timestamp,
        formattedDate: adv.date ? formatDateDisplay(adv.date) : formatDateDisplay(adv.createdAt),
        type: 'advance',
        entryKind: 'PLUS_EARNING',
        typeLabel: '(+) नकद रिकवरी',
        title: adv.reason || 'नकद रिकवरी / जमा (Cash Recovery)',
        subTitle: settled
          ? 'राइडर द्वारा हब में नकद जमा (✓ सेटल)'
          : 'राइडर द्वारा हब में नकद जमा (सक्रिय क्रेडिट)',
        plusAmount: positiveAmt,
        minusAmount: 0,
        isSettled: settled,
        isRecovery: true,
      });
    } else {
      const settled = !isUnsettledAdvanceEntry(adv);
      rawList.push({
        id: `adv-${entryId}`,
        originalId: entryId,
        rawDate: dateVal,
        sortTimestamp: isNaN(timestamp) ? 0 : timestamp,
        formattedDate: adv.date ? formatDateDisplay(adv.date) : formatDateDisplay(adv.createdAt),
        type: 'advance',
        entryKind: 'MINUS_ADVANCE',
        typeLabel: '(-) एडवांस',
        title: adv.reason || 'नकद एडवांस',
        subTitle: settled
          ? 'नकद / ऑनलाइन भुगतान (✓ सेटल)'
          : 'नकद / ऑनलाइन भुगतान (सक्रिय बकाया)',
        plusAmount: 0,
        minusAmount: positiveAmt,
        isSettled: settled,
        isRecovery: false,
      });
    }
  });

  // B. ALL Authentic Incentives & Festival Bonuses (Both Settled AND Unsettled stay visible!)
  validIncentives.forEach((inc) => {
    const incAmt = Number(inc.amount) || 0;
    if (incAmt <= 0) return;
    const settled = isSettledIncentiveEntry(inc);
    const dateVal = inc.date || inc.createdAt || '';
    const timestamp = dateVal ? new Date(dateVal).getTime() : 0;
    const baseSub = inc.source === 'surplus' ? 'अतिरिक्त सरप्लस जमा' : 'स्वीकृत बोनस';

    rawList.push({
      id: `inc-${inc.id}`,
      originalId: inc.id,
      rawDate: dateVal,
      sortTimestamp: isNaN(timestamp) ? 0 : timestamp,
      formattedDate: inc.date ? formatDateDisplay(inc.date) : formatDateDisplay(inc.createdAt),
      type: 'incentive',
      entryKind: 'PLUS_EARNING',
      typeLabel: '(+) इंसेंटिव',
      title: inc.reason || 'इंसेंटिव / बोनस (Incentive & Bonus)',
      subTitle: settled ? `${baseSub} (✓ सेटल)` : `${baseSub} (सक्रिय)`,
      plusAmount: incAmt,
      minusAmount: 0,
      isSettled: settled,
    });
  });

  // C. Delivered Parcel Payouts & Net Cash Disbursed (Preventing Double Counting of Settled Incentives)
  // Sort salaries chronologically (oldest first) so each settled advance/incentive pairs deterministically with at most one settlement.
  const chronoSalaries = [...salaries].sort((a, b) => {
    const tA = new Date(a.paidAt || a.endDate || a.startDate || 0).getTime() || 0;
    const tB = new Date(b.paidAt || b.endDate || b.startDate || 0).getTime() || 0;
    return tA - tB;
  });

  const usedIncIdsForSal = new Set<string>();
  const usedAdvIdsForSal = new Set<string>();
  const settledGenuineAdvances = validAdvances.filter((a) => {
    if (isSyntheticDisplayAdvance(a)) return false;
    return a.isRecovery || a.type === 'recovery' ? isSettledRecoveryEntry(a) : !isUnsettledAdvanceEntry(a);
  });
  const settledGenuineIncentives = validIncentives.filter((i) => isSettledIncentiveEntry(i));

  chronoSalaries.forEach((sal) => {
    const dateVal = sal.paidAt ? sal.paidAt.split('T')[0] : sal.endDate;
    const timestamp = new Date(sal.paidAt || sal.endDate || sal.startDate).getTime() || 0;
    const salEndDate = sal.endDate || dateVal || '';
    const isPaid = !sal.status || sal.status.trim().toUpperCase() === 'PAID' || sal.status.trim().toUpperCase() === 'SETTLED';
    const netTotal = Number(sal.netTotal) || 0;
    const netCashPaid = isPaid ? Math.max(0, netTotal) : 0;
    const totalAdvInSal = Number(sal.advanceAmount) || 0;
    const grossTotal = Number(sal.grossTotal) || 0;

    // 1. Match settled incentives belonging to this settlement
    const salSettledIncSet = new Set((sal.settledIncentiveIds || []).map((id) => String(id).trim()));
    const matchedIncs = settledGenuineIncentives.filter((inc) => {
      if (usedIncIdsForSal.has(inc.id)) return false;
      const linkedSalId = String(inc.settledPayoutId || inc.settlementId || inc.settledInPayoutId || '').trim();
      if (salSettledIncSet.has(inc.id) || (linkedSalId && linkedSalId === sal.id)) {
        return true;
      }
      // If linked to another known settlement, do not claim it here
      if (linkedSalId && paidSalIdSet.has(linkedSalId)) return false;
      // Legacy fallback: settlement had no settledIncentiveIds recorded
      if (salSettledIncSet.size === 0 && isPaid && salEndDate) {
        const incDate = (inc.date || inc.createdAt || '').split('T')[0];
        if (!incDate || incDate <= salEndDate) {
          return true;
        }
      }
      return false;
    });
    matchedIncs.forEach((i) => usedIncIdsForSal.add(i.id));

    // 2. Match settled advances & recoveries belonging to this settlement
    const salSettledAdvSet = new Set((sal.settledAdvanceIds || []).map((id) => String(id).trim()));
    const matchedAdvs = settledGenuineAdvances.filter((adv) => {
      const aId = String(adv.id || (adv as any)._id || '').trim();
      if (!aId || usedAdvIdsForSal.has(aId)) return false;
      const linkedSalId = String(adv.settledPayoutId || adv.settlementId || '').trim();
      if (salSettledAdvSet.has(aId) || (linkedSalId && linkedSalId === sal.id)) {
        return true;
      }
      if (linkedSalId && paidSalIdSet.has(linkedSalId)) return false;
      if (salSettledAdvSet.size === 0 && isPaid && salEndDate) {
        const advDate = (adv.date || adv.createdAt || '').split('T')[0];
        if (!advDate || advDate <= salEndDate) {
          return true;
        }
      }
      return false;
    });
    matchedAdvs.forEach((a) => {
      const aId = String(a.id || (a as any)._id || '').trim();
      if (aId) usedAdvIdsForSal.add(aId);
    });

    // Determine how much standalone incentive was actually added into sal.grossTotal
    // (In RidersTab & SettlementTab: grossTotal = deliveryGross + Math.max(0, rawIncentives - rawNetAdvances))
    const matchedIncSum = matchedIncs.reduce((sum, i) => sum + (Number(i.amount) || 0), 0);
    const matchedAdvNetSum = matchedAdvs.reduce((sum, a) => {
      const amt = Math.abs(Number(a.amount) || 0);
      return sum + (a.isRecovery || a.type === 'recovery' ? -amt : amt);
    }, 0);
    const maxStandaloneIncInGross = Math.max(0, matchedIncSum - Math.max(0, matchedAdvNetSum));
    const maxPossibleFromGross = Number(sal.baseAmount) > 0 && grossTotal >= Number(sal.baseAmount)
      ? grossTotal - Number(sal.baseAmount)
      : grossTotal;
    const standaloneIncAlreadyIncludedInGross = Math.min(maxStandaloneIncInGross, maxPossibleFromGross);
    const deliveryEarningsOnly = Math.max(0, grossTotal - standaloneIncAlreadyIncludedInGross);

    let subTitle = `${sal.totalParcels} पार्सल • डिलीवरी कमाई: ${formatINR(deliveryEarningsOnly)}`;
    if (standaloneIncAlreadyIncludedInGross > 0) {
      subTitle += ` + इंसेंटिव: ${formatINR(standaloneIncAlreadyIncludedInGross)}`;
    }
    if (totalAdvInSal > 0) {
      subTitle += ` | एडवांस समायोजन: ${formatINR(totalAdvInSal)}`;
    }
    if (netTotal < 0) {
      subTitle += ` | लेना शेष था: ${formatINR(Math.abs(netTotal))} • ${isPaid ? 'सेटलमेंट दर्ज (✓ सेटल)' : 'लंबित (PENDING)'}`;
    } else {
      subTitle += ` | नेट भुगतान: ${formatINR(netCashPaid)} • ${isPaid ? 'भुगतान पूर्ण (✓ सेटल)' : 'लंबित (PENDING)'}`;
    }

    // 1. Plus (+) Entry: Pure Delivery Parcel Earnings for this payout period (without duplicating standalone incentives)
    if (deliveryEarningsOnly > 0 || sal.totalParcels > 0) {
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
        plusAmount: deliveryEarningsOnly,
        minusAmount: 0,
        isSettled: isPaid,
        salaryDetails: {
          startDate: sal.startDate,
          endDate: sal.endDate,
          totalParcels: sal.totalParcels,
          baseAmount: sal.baseAmount,
          incentiveAmount: sal.incentiveAmount,
          grossTotal,
          advanceDeducted: totalAdvInSal,
          netPaid: netCashPaid,
          status: sal.status,
        },
      });
    }

    // NOTE: Generic lump-sum advance deduction rows (`sal-adv-${sal.id}`) and generic deficit carry-forwards
    // (`settlement-deficit-cf`) are intentionally NOT added here because all individual advances and cash
    // recoveries remain permanently visible above with their exact dates and original reasons.

    // 2. Minus (-) Entry: Net cash disbursed to rider in hand
    if (isPaid && netCashPaid > 0) {
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
        subTitle: `हब द्वारा राइडर को नेट नकद / ऑनलाइन भुगतान (${formatINR(netCashPaid)})`,
        plusAmount: 0,
        minusAmount: netCashPaid,
        isSettled: true,
      });
    }
  });

  // Deduplicate entries by ID to ensure single ground truth
  const seenEntryIds = new Set<string>();
  const uniqueList: DraftLedgerEntry[] = [];
  for (const entry of rawList) {
    if (!seenEntryIds.has(entry.id)) {
      seenEntryIds.add(entry.id);
      uniqueList.push(entry);
    }
  }

  // Canonical Active Unsettled Totals (must match RidersTab / AdvancesTab / IncentivesTab / SettlementTab 100%)
  const uncoveredDeficitSettlements = paidOrSettledSalaries.filter((s) => {
    if (Number(s.netTotal) >= 0) return false;
    const sTs = new Date(s.paidAt || s.endDate || s.startDate).getTime() || 0;
    const deficitId = `adv_deficit_${s.id}`;
    const remId = `adv_rem_${s.id}`;

    const supersededByLater = paidOrSettledSalaries.some((laterS) => {
      if (laterS.id === s.id) return false;
      const laterTs = new Date(laterS.paidAt || laterS.endDate || laterS.startDate).getTime() || 0;
      const isLater = laterS.endDate > s.endDate || laterTs > sTs;
      if (!isLater) return false;
      const hasSettledToken =
        Array.isArray(laterS.settledAdvanceIds) &&
        (laterS.settledAdvanceIds.includes(deficitId) || laterS.settledAdvanceIds.includes(remId));
      return hasSettledToken || Number(laterS.advanceAmount) > 0;
    });
    if (supersededByLater) return false;

    const explicitRem = rawAdvancesMap.get(remId) || rawAdvancesMap.get(deficitId);
    if (explicitRem && (explicitRem.isSettled === true || (explicitRem as any).status === 'PAID' || !isNotDeleted(explicitRem))) {
      return false;
    }

    return true;
  });

  const totalSettlementDeficits = uncoveredDeficitSettlements.reduce((sum, s) => sum + Math.abs(Number(s.netTotal)), 0);

  const rawRegularActiveAdvAmt = validAdvances
    .filter((a) => isUnsettledAdvanceEntry(a))
    .reduce((sum, a) => sum + (Number(a.amount) || 0), 0);
  const rawActiveRecoveryAmt = validAdvances
    .filter((a) => {
      if (!isNotDeleted(a)) return false;
      if (isSettledRecoveryEntry(a)) return false;
      return Boolean(a.isRecovery || a.type === 'recovery') && (Number(a.amount) || 0) !== 0;
    })
    .reduce((sum, a) => sum + Math.abs(Number(a.amount) || 0), 0);
  const rawActiveAdvAmt = Math.max(0, rawRegularActiveAdvAmt - rawActiveRecoveryAmt);
  const rawActiveIncAmt = validIncentives
    .filter((i) => !isSettledIncentiveEntry(i))
    .reduce((sum, i) => sum + (Number(i.amount) || 0), 0);

  const hasExplicitActiveResidualAdv = validAdvances.some((a) => {
    if (!isNotDeleted(a)) return false;
    if (a.isSettled === true || (a as any).status === 'PAID') return false;
    const aId = String(a.id || '').trim();
    return aId.startsWith('adv_rem_') || aId.startsWith('adv_deficit_') || aId.endsWith('_rem');
  });
  const effectiveActiveAdv = rawActiveAdvAmt + (hasExplicitActiveResidualAdv ? 0 : totalSettlementDeficits);
  const expectedNetFromApp = rawActiveIncAmt - effectiveActiveAdv;

  // 100% Mathematical Parity Lock:
  // If an older settlement or pre-app opening balance exists whose individual advance/credit document was never stored,
  // add one transparent historical reconciliation entry so (totalPlus - totalMinus) === expectedNetFromApp identically.
  const itemizedPlus = uniqueList.reduce((acc, row) => acc + row.plusAmount, 0);
  const itemizedMinus = uniqueList.reduce((acc, row) => acc + row.minusAmount, 0);
  const itemizedDiff = itemizedPlus - itemizedMinus;
  const legacyDelta = Math.round((expectedNetFromApp - itemizedDiff) * 100) / 100;

  if (Math.abs(legacyDelta) > 0.01) {
    const earliestDate =
      chronoSalaries[0]?.startDate ||
      validAdvances[0]?.date ||
      validIncentives[0]?.date ||
      getTodayDateString();
    const earliestTs = Math.max(0, (new Date(earliestDate).getTime() || Date.now()) - 1000);
    uniqueList.push({
      id: 'legacy-balance-reconciliation',
      originalId: 'legacy-balance-reconciliation',
      rawDate: earliestDate,
      sortTimestamp: earliestTs,
      formattedDate: formatDateDisplay(earliestDate),
      type: legacyDelta < 0 ? 'advance' : 'incentive',
      entryKind: legacyDelta < 0 ? 'MINUS_ADVANCE' : 'PLUS_EARNING',
      typeLabel: legacyDelta < 0 ? '(-) पूर्व समायोजन' : '(+) पूर्व समायोजन',
      title: 'पूर्व रिकॉर्ड / पुराना लेजर समायोजन',
      subTitle:
        legacyDelta < 0
          ? 'पुराने सेटलमेंट या सिस्टम माइग्रेशन से पहले का दर्ज पूर्व एडवांस अंतर'
          : 'पुराने सेटलमेंट या सिस्टम माइग्रेशन से पहले का दर्ज अतिरिक्त जमा अंतर',
      plusAmount: legacyDelta > 0 ? legacyDelta : 0,
      minusAmount: legacyDelta < 0 ? Math.abs(legacyDelta) : 0,
      isSettled: true,
    });
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
      salaryDetails: entry.salaryDetails,
      plusAmount: entry.plusAmount,
      minusAmount: entry.minusAmount,
      paidToRider: entry.minusAmount,
      settledOrEarned: entry.plusAmount,
      runningBalance: running,
      runningBalanceLabel: label,
      isSettled: entry.isSettled,
      isRecovery: entry.isRecovery,
    };
  });

  const totalPlus = processedRows.reduce((acc, row) => acc + row.plusAmount, 0);
  const totalMinus = processedRows.reduce((acc, row) => acc + row.minusAmount, 0);

  const finalDifference = totalPlus - totalMinus;
  const netBalance = Math.abs(finalDifference);

  let balanceStatus: 'rider_due' | 'payable' | 'settled' = 'settled';
  let adminBalanceLabel = '⚪ हिसाब चुकता: ₹0';
  let riderBalanceLabel = '⚪ हिसाब चुकता: ₹0';

  if (finalDifference < -0.01) {
    balanceStatus = 'rider_due';
    adminBalanceLabel = `🔴 राइडर से ${formatINR(netBalance)} पाना बाकी है`;
    riderBalanceLabel = `🔴 आपसे हब ${formatINR(netBalance)} पाएगा`;
  } else if (finalDifference > 0.01) {
    balanceStatus = 'payable';
    adminBalanceLabel = `🟢 राइडर को ${formatINR(netBalance)} देना बाकी है`;
    riderBalanceLabel = `🟢 आपको हब से ${formatINR(netBalance)} लेना है`;
  } else {
    balanceStatus = 'settled';
    adminBalanceLabel = '⚪ हिसाब चुकता: ₹0';
    riderBalanceLabel = '⚪ हिसाब चुकता: ₹0';
  }

  const balanceLabel = isRider ? riderBalanceLabel : adminBalanceLabel;

  if (sortOrder === 'desc') {
    processedRows.reverse();
  }

  const canonicalUnsettledAdvances = Math.max(0, effectiveActiveAdv - rawActiveIncAmt);
  const canonicalUnsettledIncentives = Math.max(0, rawActiveIncAmt - effectiveActiveAdv);

  return {
    timelineRows: processedRows,
    totalPlus,
    totalMinus,
    totalPaidToRider: totalMinus,
    totalSettledOrEarned: totalPlus,
    unsettledAdvances: canonicalUnsettledAdvances,
    unsettledIncentives: canonicalUnsettledIncentives,
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
