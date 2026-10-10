import React, { useState, useEffect } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Gift,
  ArrowRight,
  TrendingDown,
  TrendingUp,
  X,
  FileText,
  IndianRupee,
} from 'lucide-react';
import { formatINR } from '../utils/formatters';

export interface CodShortageModalProps {
  isOpen: boolean;
  onClose: () => void;
  riderId: string;
  riderName: string;
  riderPhone?: string;
  field: 'company1' | 'company2' | 'cash' | 'online';
  fieldLabel: string;
  reportedAmount: number;
  initialActual?: number;
  initialNotes?: string;
  currentShortage?: number;
  date: string;
  onSaveShortage: (data: {
    actualAmount: number;
    shortageAmount: number;
    surplusAmount: number;
    notes: string;
  }) => Promise<void>;
  onClearShortage?: () => Promise<void>;
  onAddSurplusToIncentive?: (data: {
    surplusAmount: number;
    source: string;
    date: string;
  }) => Promise<void>;
}

export const CodShortageModal: React.FC<CodShortageModalProps> = ({
  isOpen,
  onClose,
  riderId,
  riderName,
  riderPhone,
  field,
  fieldLabel,
  reportedAmount,
  initialActual,
  initialNotes = '',
  currentShortage = 0,
  date,
  onSaveShortage,
  onClearShortage,
  onAddSurplusToIncentive,
}) => {
  const isCodMode = field === 'company1' || field === 'company2';

  const [actualInput, setActualInput] = useState<string>(
    initialActual !== undefined ? String(initialActual) : String(reportedAmount)
  );
  const [notes, setNotes] = useState<string>(initialNotes);
  const [isSaving, setIsSaving] = useState(false);
  const [isAddingSurplus, setIsAddingSurplus] = useState(false);

  useEffect(() => {
    setActualInput(
      initialActual !== undefined ? String(initialActual) : String(reportedAmount)
    );
    setNotes(initialNotes);
  }, [initialActual, reportedAmount, initialNotes, isOpen]);

  if (!isOpen) return null;

  const actualVal = Math.max(0, parseFloat(actualInput) || 0);

  // Exact formulas based on mode:
  // COD Verification Mode:
  // Shortage = Actual COD Amount (कंपनी COD) - Reported COD Amount (लड़के द्वारा दर्ज)
  // If Reported < Actual COD => Shortage
  // If Reported > Actual COD => Surplus
  //
  // Cash / Online Deposit Mode:
  // Shortage = Reported Amount - Actual Received Amount
  // If Actual Received < Reported => Shortage
  // If Actual Received > Reported => Surplus
  let shortageAmount = 0;
  let surplusAmount = 0;

  if (isCodMode) {
    if (actualVal > reportedAmount) {
      shortageAmount = actualVal - reportedAmount;
      surplusAmount = 0;
    } else if (reportedAmount > actualVal) {
      surplusAmount = reportedAmount - actualVal;
      shortageAmount = 0;
    }
  } else {
    if (actualVal < reportedAmount) {
      shortageAmount = reportedAmount - actualVal;
      surplusAmount = 0;
    } else if (actualVal > reportedAmount) {
      surplusAmount = actualVal - reportedAmount;
      shortageAmount = 0;
    }
  }

  const handleConfirm = async () => {
    setIsSaving(true);
    try {
      await onSaveShortage({
        actualAmount: actualVal,
        shortageAmount,
        surplusAmount,
        notes: notes.trim(),
      });
      onClose();
    } catch (err) {
      console.error('Error saving shortage:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleClear = async () => {
    if (!onClearShortage) return;
    setIsSaving(true);
    try {
      await onClearShortage();
      onClose();
    } catch (err) {
      console.error('Error clearing shortage:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleTransferSurplus = async () => {
    if (!onAddSurplusToIncentive || surplusAmount <= 0) return;
    setIsAddingSurplus(true);
    try {
      await onAddSurplusToIncentive({
        surplusAmount,
        source: fieldLabel,
        date,
      });
      onClose();
    } catch (err) {
      console.error('Error transferring surplus to incentive:', err);
    } finally {
      setIsAddingSurplus(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[130] bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-indigo-500/40 w-full max-w-md rounded-2xl p-5 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div
              className={`p-2.5 rounded-xl border ${
                shortageAmount > 0
                  ? 'bg-rose-500/20 text-rose-400 border-rose-500/40'
                  : surplusAmount > 0
                  ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                  : 'bg-indigo-500/20 text-indigo-400 border-indigo-500/40'
              }`}
            >
              {shortageAmount > 0 ? (
                <AlertTriangle className="w-5 h-5" />
              ) : surplusAmount > 0 ? (
                <TrendingUp className="w-5 h-5" />
              ) : (
                <CheckCircle2 className="w-5 h-5" />
              )}
            </div>
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                <span>
                  {isCodMode
                    ? 'कंपनी COD ऑडिट व सत्यापन'
                    : 'कैश / ऑनलाइन ऑडिट व सत्यापन'}
                </span>
                <span
                  className={`text-[10px] font-extrabold px-1.5 py-0.2 rounded uppercase ${
                    isCodMode
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                      : 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
                  }`}
                >
                  {isCodMode ? 'COD Audit' : 'Deposit Audit'}
                </span>
              </h3>
              <p className="text-[11px] text-slate-400 font-medium mt-0.5">
                {riderName} {riderPhone ? `(${riderPhone})` : ''} •{' '}
                <span className="text-amber-300 font-bold">{fieldLabel}</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 text-sm font-bold cursor-pointer rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-3.5">
          {/* Card 1: Reported / Declared Amount */}
          <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
            <div>
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
                {isCodMode
                  ? 'लड़के द्वारा दर्ज COD (Reported COD)'
                  : 'लड़के द्वारा घोषित जमा (Declared Deposit)'}
              </span>
              <span className="text-[11px] text-slate-400 font-medium">
                {isCodMode ? 'Rider companion app entry' : 'Declared Cash / UPI deposit'}
              </span>
            </div>
            <span className="text-base font-black text-white font-mono">
              {formatINR(reportedAmount)}
            </span>
          </div>

          {/* Card 2: Actual Amount Input */}
          <div>
            <label className="text-xs text-slate-200 font-bold block mb-1">
              {isCodMode
                ? 'Actual COD Amount (वास्तविक कंपनी COD राशि ₹)'
                : 'Actual Received Amount (वास्तविक प्राप्त राशि ₹)'}
              <span className="text-rose-400 ml-1">*</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-slate-400 font-bold text-sm">
                ₹
              </span>
              <input
                type="number"
                min="0"
                step="any"
                autoFocus
                value={actualInput}
                onChange={(e) => setActualInput(e.target.value)}
                placeholder="0"
                className="w-full pl-8 pr-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-sm text-emerald-300 font-mono font-bold focus:outline-none focus:border-indigo-500 transition"
              />
            </div>
            <span className="text-[10px] text-slate-400 mt-1 block">
              {isCodMode
                ? 'कंपनी शीट के अनुसार वास्तविक COD दर्ज करें'
                : 'लड़के द्वारा जमा की गई भौतिक नकदी या बैंक UPI राशि दर्ज करें'}
            </span>
          </div>

          {/* Card 3: Dynamic Real-Time Status / Discrepancy Alert */}
          {shortageAmount > 0 ? (
            <div className="p-3.5 rounded-xl border bg-rose-950/40 border-rose-500/50 text-rose-200 space-y-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 font-bold text-xs">
                  <TrendingDown className="w-4 h-4 text-rose-400" />
                  <span>
                    {isCodMode
                      ? `₹${shortageAmount} कम COD दर्ज किया गया (Shortage)`
                      : `₹${shortageAmount} कम राशि प्राप्त हुई (Shortage)`}
                  </span>
                </div>
                <span className="text-sm font-black text-rose-300 font-mono">
                  -{formatINR(shortageAmount)}
                </span>
              </div>
              <p className="text-[10px] text-rose-300/80">
                {isCodMode
                  ? `वास्तविक कंपनी COD (${formatINR(actualVal)}) > दर्ज COD (${formatINR(reportedAmount)})`
                  : `घोषित जमा (${formatINR(reportedAmount)}) > प्राप्त जमा (${formatINR(actualVal)})`}
              </p>
            </div>
          ) : surplusAmount > 0 ? (
            <div className="p-3.5 rounded-xl border bg-emerald-950/40 border-emerald-500/50 text-emerald-200 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 font-bold text-xs text-emerald-300">
                  <TrendingUp className="w-4 h-4 text-emerald-400" />
                  <span>
                    {isCodMode
                      ? `₹${surplusAmount} अधिक COD दर्ज किया गया (Surplus/Excess)`
                      : `₹${surplusAmount} अधिक राशि प्राप्त हुई (Surplus/Excess)`}
                  </span>
                </div>
                <span className="text-sm font-black text-emerald-300 font-mono">
                  +{formatINR(surplusAmount)}
                </span>
              </div>
              <p className="text-[10px] text-emerald-300/80">
                {isCodMode
                  ? `लड़के ने कंपनी से ₹${surplusAmount} अधिक COD दर्ज किया है।`
                  : `लड़के ने काउंटर पर ₹${surplusAmount} अतिरिक्त (Excess) जमा किया है।`}
              </p>

              {/* SURPLUS (EXCESS CASH) AUTO-TRANSFER BUTTON */}
              {onAddSurplusToIncentive && (
                <button
                  type="button"
                  onClick={handleTransferSurplus}
                  disabled={isAddingSurplus}
                  className="w-full mt-2 py-2 px-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold shadow-md shadow-emerald-950/50 flex items-center justify-center gap-2 transition active:scale-98 cursor-pointer disabled:opacity-50"
                >
                  <Gift className="w-3.5 h-3.5" />
                  <span>
                    {isAddingSurplus
                      ? 'ट्रांसफर हो रहा है...'
                      : 'इंसेंटिव/सरप्लस खाते में जोड़ें (Add to Incentive)'}
                  </span>
                </button>
              )}
            </div>
          ) : (
            <div className="p-3.5 rounded-xl border bg-emerald-950/20 border-emerald-500/30 text-emerald-300 flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-bold">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>✓ सत्यापन स्थिति: 100% टैली (No Discrepancy)</span>
              </div>
              <span className="text-xs font-bold font-mono text-emerald-400">
                ₹0 Short
              </span>
            </div>
          )}

          {/* Remark / Notes */}
          <div>
            <label className="text-xs text-slate-300 font-bold block mb-1">
              Shortage / Surplus Reason / Remark (कारण / विवरण - Optional)
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="उदा. ₹500 शॉर्ट कैश, कल एडजस्ट होगा / कंपनी रिटर्न री-ऑडिट"
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500 transition"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-800">
            {currentShortage > 0 || shortageAmount > 0 ? (
              <button
                type="button"
                onClick={handleClear}
                disabled={isSaving}
                className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-rose-300 hover:text-rose-200 text-xs font-bold transition border border-rose-500/30 cursor-pointer disabled:opacity-50"
              >
                Clear Shortage
              </button>
            ) : (
              <div />
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={isSaving}
                className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={isSaving}
                className={`px-4 py-2 rounded-xl text-white text-xs font-bold shadow-lg transition cursor-pointer disabled:opacity-50 ${
                  shortageAmount > 0
                    ? 'bg-rose-600 hover:bg-rose-500 shadow-rose-950/50'
                    : 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-950/50'
                }`}
              >
                {isSaving
                  ? 'सुरक्षित हो रहा है...'
                  : shortageAmount > 0
                  ? 'Confirm Shortage'
                  : 'Verify & Confirm'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
