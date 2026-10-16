import { 
  DenominationValue, 
  STANDARD_DENOMINATIONS, 
  CashDenomination, 
  CodDailyEntry 
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
