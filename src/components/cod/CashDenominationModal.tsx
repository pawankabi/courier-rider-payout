import React, { useState, useEffect, useMemo } from 'react';
import { 
  X, 
  Coins, 
  Check, 
  RotateCcw, 
  Calculator, 
  FileSpreadsheet, 
  Banknote,
  Plus,
  Minus
} from 'lucide-react';
import { 
  DenominationValue, 
  STANDARD_DENOMINATIONS, 
  CashDenomination 
} from '../../types';
import { formatINR } from '../../utils/formatters';
import { calculateDenominationTotal } from '../../utils/denominationUtils';

export interface CashDenominationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm?: (denomination: CashDenomination) => void;
  initialDenomination?: CashDenomination | null;
  targetCashAmount?: number;
  riderName?: string;
  date?: string;
  readOnly?: boolean;
}

export const CashDenominationModal: React.FC<CashDenominationModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  initialDenomination,
  targetCashAmount,
  riderName,
  date,
  readOnly = false,
}) => {
  const [counts, setCounts] = useState<Record<DenominationValue, number>>({
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
  });

  // Initialize counts when modal opens or initialDenomination changes
  useEffect(() => {
    if (!isOpen) return;

    const nextCounts: Record<DenominationValue, number> = {
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

    if (initialDenomination) {
      STANDARD_DENOMINATIONS.forEach((val) => {
        const c = initialDenomination[val];
        nextCounts[val] = typeof c === 'number' && !isNaN(c) && c > 0 ? Math.floor(c) : 0;
      });
    }

    setCounts(nextCounts);
  }, [isOpen, initialDenomination]);

  // Compute live calculations
  const { total, totalNotes, items } = useMemo(() => {
    return calculateDenominationTotal(counts);
  }, [counts]);

  if (!isOpen) return null;

  const handleCountChange = (val: DenominationValue, newCount: number) => {
    if (readOnly) return;
    const sanitized = Math.max(0, Math.floor(isNaN(newCount) ? 0 : newCount));
    setCounts((prev) => ({
      ...prev,
      [val]: sanitized,
    }));
  };

  const handleStepCount = (val: DenominationValue, step: number) => {
    if (readOnly) return;
    setCounts((prev) => {
      const current = prev[val] || 0;
      const next = Math.max(0, current + step);
      return {
        ...prev,
        [val]: next,
      };
    });
  };

  const handleReset = () => {
    if (readOnly) return;
    setCounts({
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
    });
  };

  const handleConfirm = () => {
    if (!onConfirm) {
      onClose();
      return;
    }

    const payload: CashDenomination = {
      2000: counts[2000] || 0,
      500: counts[500] || 0,
      200: counts[200] || 0,
      100: counts[100] || 0,
      50: counts[50] || 0,
      20: counts[20] || 0,
      10: counts[10] || 0,
      5: counts[5] || 0,
      2: counts[2] || 0,
      1: counts[1] || 0,
      totalNotes,
      total,
      updatedAt: new Date().toISOString(),
    };

    onConfirm(payload);
    onClose();
  };

  const isMatchedWithTarget = typeof targetCashAmount === 'number' && targetCashAmount > 0 
    ? Math.abs(targetCashAmount - total) === 0 
    : null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in">
      <div className="w-full sm:max-w-lg bg-white border border-slate-200 rounded-t-3xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden">
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-sm">
              <Banknote className="w-5 h-5 stroke-[2.2]" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <span>कैश नोटों का विवरण (Cash Denomination)</span>
                {readOnly && (
                  <span className="text-[10px] font-bold bg-slate-200 text-slate-700 px-2 py-0.5 rounded-full">
                    ऑडिट व्यू (Read-Only)
                  </span>
                )}
              </h3>
              <p className="text-xs text-slate-500">
                {riderName ? `${riderName} • ` : ''}{date ? `तारीख: ${date}` : 'दैनिक भौतिक कैश गणना'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition cursor-pointer"
            title="बंद करें"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Target Amount Comparison Banner (If given) */}
        {typeof targetCashAmount === 'number' && targetCashAmount > 0 && !readOnly && (
          <div className={`px-5 py-2.5 text-xs font-semibold flex items-center justify-between border-b ${
            isMatchedWithTarget 
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200' 
              : 'bg-amber-50 text-amber-900 border-amber-200'
          }`}>
            <span>अपेक्षित कैश (Target Cash): <strong>₹{formatINR(targetCashAmount)}</strong></span>
            <span>
              {isMatchedWithTarget ? (
                <span className="text-emerald-700 font-bold flex items-center gap-1">
                  ✓ नोटों का जोड़ बिल्कुल सही है!
                </span>
              ) : (
                <span className="text-amber-800 font-mono">
                  अंतर: ₹{formatINR(Math.abs(targetCashAmount - total))} ({total < targetCashAmount ? 'कम है' : 'ज़्यादा है'})
                </span>
              )}
            </span>
          </div>
        )}

        {/* Scrollable Denomination Table */}
        <div className="overflow-y-auto p-4 sm:p-5 flex-1 divide-y divide-slate-100 space-y-1">
          <div className="grid grid-cols-12 text-[11px] font-bold uppercase tracking-wider text-slate-500 pb-2 px-2">
            <div className="col-span-4">नोट मूल्य (Note)</div>
            <div className="col-span-4 text-center">संख्या (Count)</div>
            <div className="col-span-4 text-right">उप-योग (Amount)</div>
          </div>

          {items.map((item) => {
            const hasCount = item.count > 0;
            return (
              <div 
                key={item.value} 
                className={`grid grid-cols-12 items-center py-2 px-2 rounded-xl transition ${
                  hasCount 
                    ? 'bg-emerald-50/70 border border-emerald-200/60 shadow-2xs' 
                    : 'hover:bg-slate-50'
                }`}
              >
                {/* Note Value */}
                <div className="col-span-4 flex items-center gap-2">
                  <span className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs font-mono shadow-2xs ${
                    item.value >= 500 
                      ? 'bg-purple-100 text-purple-800 border border-purple-200' 
                      : item.value >= 100 
                      ? 'bg-blue-100 text-blue-800 border border-blue-200' 
                      : 'bg-amber-100 text-amber-800 border border-amber-200'
                  }`}>
                    ₹
                  </span>
                  <div className="flex flex-col">
                    <span className="font-extrabold text-slate-900 text-sm font-mono">
                      ₹{item.value}
                    </span>
                    <span className="text-[10px] text-slate-400">
                      {item.value >= 10 ? 'का नोट' : 'का सिक्का/नोट'}
                    </span>
                  </div>
                </div>

                {/* Count Input / Steppers */}
                <div className="col-span-4 flex items-center justify-center gap-1.5">
                  {!readOnly ? (
                    <>
                      <button
                        type="button"
                        onClick={() => handleStepCount(item.value, -1)}
                        disabled={item.count <= 0}
                        className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed text-slate-700 font-black flex items-center justify-center transition cursor-pointer shrink-0"
                        title="घटाएं (-1)"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>

                      <input
                        type="number"
                        inputMode="numeric"
                        min="0"
                        value={item.count === 0 ? '' : item.count}
                        placeholder="0"
                        onChange={(e) => handleCountChange(item.value, parseInt(e.target.value, 10))}
                        className={`w-14 sm:w-16 text-center py-1 rounded-lg text-sm font-bold font-mono border focus:outline-none focus:ring-2 focus:ring-emerald-500 ${
                          hasCount 
                            ? 'bg-white border-emerald-400 text-emerald-800 ring-1 ring-emerald-300' 
                            : 'bg-slate-50 border-slate-300 text-slate-700'
                        }`}
                      />

                      <button
                        type="button"
                        onClick={() => handleStepCount(item.value, 1)}
                        className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-black flex items-center justify-center transition cursor-pointer shrink-0"
                        title="बढ़ाएं (+1)"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </>
                  ) : (
                    <span className={`font-mono text-sm font-bold px-3 py-1 rounded-lg ${
                      hasCount ? 'bg-emerald-100 text-emerald-800' : 'text-slate-400'
                    }`}>
                      {item.count}
                    </span>
                  )}
                </div>

                {/* Subtotal */}
                <div className="col-span-4 text-right">
                  <span className={`font-mono text-sm font-extrabold ${
                    hasCount ? 'text-emerald-700' : 'text-slate-400'
                  }`}>
                    ₹{formatINR(item.subtotal)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Bottom Sticky Bar: Total Notes Count & Grand Total Amount */}
        <div className="border-t border-slate-200 bg-slate-50/90 backdrop-blur-xs p-4 sm:p-5 shrink-0 space-y-3">
          <div className="bg-white border border-slate-200 rounded-2xl p-3 shadow-2xs flex items-center justify-between">
            <div>
              <span className="text-[11px] text-slate-500 font-bold uppercase tracking-wider block">
                कुल नोटों की संख्या (Total Notes)
              </span>
              <span className="text-base sm:text-lg font-black text-slate-800 font-mono">
                {totalNotes} <span className="text-xs font-normal text-slate-500">नोट / सिक्के</span>
              </span>
            </div>
            <div className="text-right">
              <span className="text-[11px] text-emerald-700 font-bold uppercase tracking-wider block">
                कुल कैश योग (Grand Total Cash)
              </span>
              <span className="text-xl sm:text-2xl font-black text-emerald-600 font-mono">
                ₹{formatINR(total)}
              </span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            {!readOnly ? (
              <>
                <button
                  type="button"
                  onClick={handleReset}
                  className="px-3.5 py-2.5 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs transition flex items-center gap-1.5 cursor-pointer"
                  title="सभी नोट संख्या रीसेट करें"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>रीसेट</span>
                </button>

                <button
                  type="button"
                  onClick={handleConfirm}
                  className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-extrabold text-xs sm:text-sm shadow-md shadow-emerald-600/25 active:scale-[0.99] transition flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Check className="w-4 h-4 stroke-[3]" />
                  <span>कन्फर्म व कैश में दर्ज करें (Save & Fill Cash)</span>
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={onClose}
                className="w-full py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs transition cursor-pointer"
              >
                बंद करें (Close)
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CashDenominationModal;
