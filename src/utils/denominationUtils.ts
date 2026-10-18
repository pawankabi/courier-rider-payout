import { 
  DenominationValue, 
  STANDARD_DENOMINATIONS, 
  CashDenomination, 
  CodDailyEntry,
  CashWithdrawalRecord
} from '../types';
import { formatINR } from './formatters';

export interface DenominationItem {
  value: DenominationValue;
  count: number;
  subtotal: number;
}

export interface AggregatedDenominationResult {
  breakdown: Record<DenominationValue, number>;
  totalNotes: number;
  totalAmount: number;
  activeItems: DenominationItem[];
  allItems: DenominationItem[];
  ridersWithBreakdownCount: number;
  totalRidersWithCash: number;
  totalCashDeposited: number;
  isFullyCovered: boolean;
}

/**
 * Calculates the total cash amount and total count of physical notes from a breakdown.
 */
export function calculateDenominationTotal(
  counts: Partial<Record<DenominationValue, number>>
): { total: number; totalNotes: number; items: DenominationItem[] } {
  let total = 0;
  let totalNotes = 0;

  const items: DenominationItem[] = STANDARD_DENOMINATIONS.map((val) => {
    const rawCount = counts[val];
    const count = typeof rawCount === 'number' && !isNaN(rawCount) && rawCount > 0 
      ? Math.floor(rawCount) 
      : 0;
    const subtotal = count * val;
    total += subtotal;
    totalNotes += count;

    return {
      value: val,
      count,
      subtotal,
    };
  });

  return { total, totalNotes, items };
}

/**
 * Aggregates cash denomination note counts across all riders for a given daily COD sheet.
 */
export function aggregateDailyDenominations(
  entries: CodDailyEntry[]
): AggregatedDenominationResult {
  const breakdown: Record<DenominationValue, number> = {
    2000: 0,
    500: 0,
    200: 0,
    100: 0,
    50: 0,
    20: 0,
    10: 0,
    5: 0,
    2: 0,
    1: 0,
  };

  let totalNotes = 0;
  let totalAmount = 0;
  let ridersWithBreakdownCount = 0;
  let totalRidersWithCash = 0;
  let totalCashDeposited = 0;

  entries.forEach((entry) => {
    const cash = Number(entry.cashDeposit) || 0;
    if (cash > 0) {
      totalRidersWithCash++;
      totalCashDeposited += cash;
    }

    const denom = entry.cashDenomination;
    if (denom && typeof denom === 'object') {
      let hasAnyNotes = false;
      STANDARD_DENOMINATIONS.forEach((val) => {
        const count = Number(denom[val]) || 0;
        if (count > 0) {
          breakdown[val] += count;
          totalNotes += count;
          const subtotal = count * val;
          totalAmount += subtotal;
          hasAnyNotes = true;
        }
      });
      if (hasAnyNotes || (denom.total && denom.total > 0)) {
        ridersWithBreakdownCount++;
      }
    }
  });

  const allItems: DenominationItem[] = STANDARD_DENOMINATIONS.map((val) => ({
    value: val,
    count: breakdown[val],
    subtotal: breakdown[val] * val,
  }));

  const activeItems = allItems.filter((item) => item.count > 0);
  const isFullyCovered = totalCashDeposited > 0 && Math.abs(totalCashDeposited - totalAmount) < 1;

  return {
    breakdown,
    totalNotes,
    totalAmount,
    activeItems,
    allItems,
    ridersWithBreakdownCount,
    totalRidersWithCash,
    totalCashDeposited,
    isFullyCovered,
  };
}

/**
 * Creates a clean Hindi/English text summary suitable for WhatsApp or clipboard export.
 */
export function formatDenominationShareText(
  date: string,
  summary: AggregatedDenominationResult,
  hubName: string = 'कूरियर डिलीवरी हब'
): string {
  let text = `💵 *दैनिक कुल कैश नोट विवरण (Consolidated Cash Denominations)*\n`;
  text += `🏢 *हब:* ${hubName}\n`;
  text += `📅 *तारीख:* ${date}\n`;
  text += `👥 *कैश जमा करने वाले राइडर्स:* ${summary.totalRidersWithCash}\n`;
  text += `━━━━━━━━━━━━━━━━━━━━━\n`;

  if (summary.activeItems.length === 0) {
    text += `(कोई नोट विवरण दर्ज नहीं किया गया)\n`;
  } else {
    summary.activeItems.forEach((item) => {
      text += `• ₹${item.value} × ${item.count} नोट = ₹${formatINR(item.subtotal)}\n`;
    });
  }

  text += `━━━━━━━━━━━━━━━━━━━━━\n`;
  text += `🔢 *कुल नोट (Total Notes):* ${summary.totalNotes}\n`;
  text += `💰 *कुल कैश (Grand Total Cash):* ₹${formatINR(summary.totalAmount || summary.totalCashDeposited)}\n`;
  
  if (summary.totalCashDeposited > summary.totalAmount) {
    const diff = summary.totalCashDeposited - summary.totalAmount;
    text += `⚠️ *बिना नोट विवरण वाला कैश:* ₹${formatINR(diff)}\n`;
  }
  
  text += `\n_Generated via Courier Payout Pro_`;
  return text;
}

export interface VaultRemainingBreakdownItem {
  value: DenominationValue;
  inwardCount: number;
  inwardAmount: number;
  withdrawnCount: number;
  withdrawnAmount: number;
  remainingCount: number;
  remainingAmount: number;
}

export interface VaultRemainingSummary {
  inwardTotalNotes: number;
  inwardTotalAmount: number;
  withdrawnTotalNotes: number;
  withdrawnTotalAmount: number;
  netRemainingNotes: number;
  netRemainingCash: number;
  breakdown: VaultRemainingBreakdownItem[];
  activeBreakdown: VaultRemainingBreakdownItem[];
}

/**
 * Aggregates all cash withdrawal entries for a given date.
 */
export function aggregateCashWithdrawals(withdrawals: CashWithdrawalRecord[]): {
  withdrawnBreakdown: Record<DenominationValue, number>;
  totalNotesWithdrawn: number;
  totalAmountWithdrawn: number;
} {
  const withdrawnBreakdown: Record<DenominationValue, number> = {
    2000: 0,
    500: 0,
    200: 0,
    100: 0,
    50: 0,
    20: 0,
    10: 0,
    5: 0,
    2: 0,
    1: 0,
  };
  let totalNotesWithdrawn = 0;
  let totalAmountWithdrawn = 0;

  withdrawals.forEach((w) => {
    STANDARD_DENOMINATIONS.forEach((val) => {
      const cnt = Number(w.notesBreakdown?.[val]) || 0;
      if (cnt > 0) {
        withdrawnBreakdown[val] += cnt;
        totalNotesWithdrawn += cnt;
        totalAmountWithdrawn += cnt * val;
      }
    });
  });

  return { withdrawnBreakdown, totalNotesWithdrawn, totalAmountWithdrawn };
}

/**
 * Computes net remaining notes and cash in the vault after all withdrawals:
 * Net Remaining Notes = (Total Inward Notes - Total Outward Notes)
 * Net Remaining Cash = (Total Inward Cash - Total Outward Cash)
 */
export function calculateVaultRemainingSummary(
  inwardSummary: AggregatedDenominationResult,
  withdrawals: CashWithdrawalRecord[]
): VaultRemainingSummary {
  const { withdrawnBreakdown, totalNotesWithdrawn, totalAmountWithdrawn } = aggregateCashWithdrawals(withdrawals);

  const breakdown: VaultRemainingBreakdownItem[] = STANDARD_DENOMINATIONS.map((val) => {
    const inwardCount = inwardSummary.breakdown[val] || 0;
    const inwardAmount = inwardCount * val;
    const withdrawnCount = withdrawnBreakdown[val] || 0;
    const withdrawnAmount = withdrawnCount * val;
    const remainingCount = Math.max(0, inwardCount - withdrawnCount);
    const remainingAmount = remainingCount * val;

    return {
      value: val,
      inwardCount,
      inwardAmount,
      withdrawnCount,
      withdrawnAmount,
      remainingCount,
      remainingAmount,
    };
  });

  const activeBreakdown = breakdown.filter((item) => item.inwardCount > 0 || item.withdrawnCount > 0);
  const netRemainingNotes = Math.max(0, inwardSummary.totalNotes - totalNotesWithdrawn);
  const netRemainingCash = Math.max(0, inwardSummary.totalAmount - totalAmountWithdrawn);

  return {
    inwardTotalNotes: inwardSummary.totalNotes,
    inwardTotalAmount: inwardSummary.totalAmount,
    withdrawnTotalNotes: totalNotesWithdrawn,
    withdrawnTotalAmount: totalAmountWithdrawn,
    netRemainingNotes,
    netRemainingCash,
    breakdown,
    activeBreakdown,
  };
}

/**
 * Formats a comprehensive share text including Inward, Withdrawn, and Remaining Vault Balance.
 */
export function formatVaultSummaryShareText(
  date: string,
  vaultSummary: VaultRemainingSummary,
  withdrawals: CashWithdrawalRecord[],
  hubName: string = 'कूरियर डिलीवरी हब'
): string {
  let text = `🏦 *हब तिजोरी व कैश निकासी रिपोर्ट (Hub Vault & Cash Outward)*\n`;
  text += `🏢 *हब:* ${hubName}\n`;
  text += `📅 *तारीख:* ${date}\n`;
  text += `━━━━━━━━━━━━━━━━━━━━━\n`;
  text += `📥 *कुल इनवर्ड कैश (Rider COD Inward):*\n`;
  text += `  • कुल नोट: ${vaultSummary.inwardTotalNotes} | कुल कैश: ₹${formatINR(vaultSummary.inwardTotalAmount)}\n`;
  text += `━━━━━━━━━━━━━━━━━━━━━\n`;
  text += `📤 *कुल निकासी (Cash Outward / Bank / Expense):*\n`;
  text += `  • कुल निकासी नोट: ${vaultSummary.withdrawnTotalNotes} | कुल निकासी कैश: ₹${formatINR(vaultSummary.withdrawnTotalAmount)}\n`;
  
  if (withdrawals.length > 0) {
    withdrawals.forEach((w, idx) => {
      text += `    ${idx + 1}. ${w.recipientOrPurpose} (${w.dateTime}): ₹${formatINR(w.totalAmount)} (${w.totalNotes} नोट)\n`;
    });
  }

  text += `━━━━━━━━━━━━━━━━━━━━━\n`;
  text += `🏛️ *तिजोरी में शेष शुद्ध बैलेंस (Remaining Vault Balance):*\n`;
  text += `  • शेष शुद्ध नोट: ${vaultSummary.netRemainingNotes}\n`;
  text += `  • शेष शुद्ध कैश: *₹${formatINR(vaultSummary.netRemainingCash)}*\n`;
  text += `━━━━━━━━━━━━━━━━━━━━━\n`;
  text += `📊 *नोट अनुसार शेष विवरण:*\n`;

  vaultSummary.activeBreakdown.forEach((item) => {
    text += `  • ₹${item.value} : कुल ${item.inwardCount} - निकासी ${item.withdrawnCount} = *शेष ${item.remainingCount} नोट* (₹${formatINR(item.remainingAmount)})\n`;
  });

  text += `\n_Generated via Courier Payout Pro_`;
  return text;
}

