import React, { useState, useEffect } from 'react';
import { 
  X, 
  Gift, 
  Calendar, 
  FileText, 
  Sparkles, 
  Check, 
  Send, 
  MessageCircle, 
  Copy, 
  RefreshCw, 
  AlertCircle,
  Clock,
  Trash2,
  IndianRupee,
  Phone,
  Bike
} from 'lucide-react';
import { Rider, RiderIncentiveEntry } from '../types';
import { formatINR, formatDateDisplay, getTodayDateString, formatPhoneNumber, getCleanPhoneDigits } from '../utils/formatters';
import { 
  generateStatementUrl, 
  formatIncentiveSmsText, 
  dispatchAutomatedSms, 
  getWhatsAppUrl, 
  getNativeSmsUrl 
} from '../services/smsService';
import { InstantShareSuccessModal } from './InstantShareSuccessModal';

interface RiderIncentiveModalProps {
  rider: Rider;
  hubName?: string;
  hubSignature?: string;
  onClose: () => void;
  onSaveIncentive: (
    riderId: string, 
    incentiveData: { amount: number; reason: string; date: string }
  ) => Promise<void>;
  onDeleteIncentive?: (riderId: string, incentiveId: string) => Promise<void>;
  onViewLedger?: (riderId: string) => void;
}

const PRESET_REASONS = [
  'त्यौहार बोनस (Festival Bonus)',
  'बढ़िया परफॉर्मेंस (High Performance)',
  'अतिरिक्त माइलेज (Extra Fuel/Distance)',
  'रविवार उपस्थिति बोनस (Sunday Bonus)',
  'दैनिक लक्ष्य पूरा (Target Achieved)',
  'विशेष प्रोत्साहन (Special Incentive)',
];

export const RiderIncentiveModal: React.FC<RiderIncentiveModalProps> = ({
  rider,
  hubName = 'सरायकेला कूरियर हब',
  hubSignature,
  onClose,
  onSaveIncentive,
  onDeleteIncentive,
  onViewLedger,
}) => {
  const [amount, setAmount] = useState<string>('');
  const [date, setDate] = useState<string>(getTodayDateString());
  const [reason, setReason] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [instantShareData, setInstantShareData] = useState<{
    riderName: string;
    riderPhone: string;
    riderId: string;
    amount: number;
    message: string;
  } | null>(null);

  // Smooth Escape key handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const numericAmount = Math.max(0, Number(amount) || parseFloat(amount) || 0);
  const currentTotalIncentive = Number(rider.totalIncentive) || 0;
  const projectedTotalIncentive = currentTotalIncentive + numericAmount;
  const statementUrl = generateStatementUrl(rider.id);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (numericAmount <= 0) {
      setErrorMessage('कृपया मान्य इंसेंटिव राशि दर्ज करें (कम से कम ₹1)।');
      return;
    }

    const cleanReason = reason.trim() || 'त्यौहार / परफॉर्मेंस इंसेंटिव';
    const entryDate = date.trim() || getTodayDateString();

    setIsSubmitting(true);
    try {
      await onSaveIncentive(rider.id, {
        amount: numericAmount,
        reason: cleanReason,
        date: entryDate,
      });

      // Prepare share text
      const smsMessage = formatIncentiveSmsText({
        riderName: rider.name,
        amount: numericAmount,
        reason: cleanReason,
        totalIncentive: projectedTotalIncentive,
        statementUrl,
      });

      setInstantShareData({
        riderName: rider.name,
        riderPhone: rider.phone,
        riderId: rider.id,
        amount: numericAmount,
        message: smsMessage,
      });

      // Clear input
      setAmount('');
      setReason('');
      setDate(getTodayDateString());
    } catch (err: any) {
      console.error('Error saving incentive:', err);
      setErrorMessage('इंसेंटिव सुरक्षित करने में त्रुटि हुई। कृपया पुनः प्रयास करें।');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteItem = async (incId: string) => {
    if (!onDeleteIncentive) return;
    const targetInc = (rider.incentives || []).find((i) => i.id === incId);
    if (!targetInc) return;

    if (!window.confirm(`क्या आप ₹${targetInc.amount} (${targetInc.reason || 'इंसेंटिव'}) का रिकॉर्ड हटाना चाहते हैं? यह डेटाबेस से स्थाई रूप से हट जाएगा।`)) {
      return;
    }

    try {
      await onDeleteIncentive(rider.id, incId);
    } catch (err) {
      console.error('Error deleting incentive item:', err);
    }
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(statementUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const cleanDigits = getCleanPhoneDigits(rider.phone).slice(-10);
  const activeAmountForMsg = numericAmount > 0 
    ? numericAmount 
    : (rider.incentives && rider.incentives.length > 0 ? (rider.incentives[0]?.amount || 0) : currentTotalIncentive);
  const activeReasonForMsg = numericAmount > 0
    ? (reason.trim() || 'इंसेंटिव')
    : (rider.incentives && rider.incentives.length > 0 ? (rider.incentives[0]?.reason || 'इंसेंटिव') : 'इंसेंटिव');
  const persistentSmsMessage = formatIncentiveSmsText({
    riderName: rider.name,
    amount: activeAmountForMsg,
    reason: activeReasonForMsg,
    totalIncentive: numericAmount > 0 ? projectedTotalIncentive : currentTotalIncentive,
    statementUrl,
  });
  const persistentWaUrl = getWhatsAppUrl(rider.phone, persistentSmsMessage);
  const persistentSmsUrl = getNativeSmsUrl(rider.phone, persistentSmsMessage);

  return (
    <div 
      className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div 
        className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-2xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Ribbon */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-emerald-950/80 via-slate-900 to-slate-900 border-b border-emerald-500/20 flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="w-11 h-11 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0 shadow-md shadow-emerald-950/50">
              <Gift className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-lg font-black text-white">
                  इंसेंटिव व अतिरिक्त कमाई (+ Incentive)
                </h2>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                  {rider.name}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-2 flex-wrap">
                <span>{formatPhoneNumber(rider.phone)}</span>
                <span>•</span>
                <span className="flex items-center gap-1">
                  <Bike className="w-3 h-3 text-teal-400" />
                  <span>{rider.vehicleType || 'Bike'}</span>
                </span>
                <span>•</span>
                <span>{hubName}</span>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
            title="बंद करें"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-5">
          {/* Top Hero Balance Card */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800">
              <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400 block">
                कुल स्वीकृत इंसेंटिव (Total Incentive)
              </span>
              <div className="text-xl sm:text-2xl font-black text-emerald-400 font-mono mt-1">
                {formatINR(currentTotalIncentive)}
              </div>
              <span className="text-[10px] text-slate-500 block mt-0.5">
                {(rider.incentives || []).length} रिकॉर्ड्स दर्ज
              </span>
            </div>

            <div className="p-3.5 rounded-xl bg-emerald-950/20 border border-emerald-500/30 flex flex-col justify-between">
              <span className="text-[10px] uppercase tracking-wider font-bold text-emerald-300 block">
                नया इंसेंटिव जोड़ने के बाद (New Total)
              </span>
              <div className="text-xl sm:text-2xl font-black text-emerald-300 font-mono mt-1">
                {formatINR(projectedTotalIncentive)}
              </div>
              <span className="text-[10px] text-emerald-400/80 block mt-0.5">
                {numericAmount > 0 ? `+ ₹${numericAmount} जोड़ा जाएगा` : 'नई राशि दर्ज करें'}
              </span>
            </div>
          </div>

          {/* New Incentive Entry Form */}
          <form onSubmit={handleSubmit} className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-4">
            <h3 className="text-xs font-bold text-slate-200 flex items-center gap-1.5 uppercase tracking-wider">
              <Sparkles className="w-4 h-4 text-emerald-400" />
              <span>नया इंसेंटिव दर्ज करें (Add Incentive Entry)</span>
            </h3>

            {errorMessage && (
              <div className="p-2.5 rounded-lg bg-rose-950/40 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Amount */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  इंसेंटिव राशि (Amount ₹) *
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-slate-400 font-bold text-sm">₹</span>
                  <input
                    type="number"
                    min="1"
                    step="any"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="उदा. 500"
                    className="w-full bg-slate-900 border border-slate-700/80 rounded-xl pl-8 pr-3 py-2 text-white font-bold font-mono text-sm focus:outline-none focus:border-emerald-500"
                    required
                  />
                </div>
              </div>

              {/* Date */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  दिनांक (Date)
                </label>
                <div className="relative">
                  <Calendar className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700/80 rounded-xl pl-9 pr-3 py-2 text-white text-xs focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>
            </div>

            {/* Reason */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                कारण / टिप्पणी (Reason / Note)
              </label>
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="उदा. त्यौहार बोनस, बढ़िया परफॉर्मेंस"
                className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-emerald-500"
              />

              {/* Preset buttons */}
              <div className="flex flex-wrap gap-1.5 mt-2">
                {PRESET_REASONS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setReason(p.split(' ')[0])}
                    className="text-[10px] px-2 py-0.5 rounded-lg bg-slate-800 hover:bg-emerald-950 hover:text-emerald-300 text-slate-400 border border-slate-700 transition"
                  >
                    + {p.split(' ')[0]}
                  </button>
                ))}
              </div>
            </div>

            {/* Submit button */}
            <div className="flex items-center justify-between pt-2">
              <span className="text-[11px] text-slate-400">
                सुरक्षित करने पर राइडर को SMS ऑटोमैटिक भेजा जाएगा।
              </span>
              <button
                type="submit"
                disabled={isSubmitting || numericAmount <= 0}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-xs shadow-md shadow-emerald-900/40 transition active:scale-95 flex items-center gap-1.5 cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>सेव हो रहा है...</span>
                  </>
                ) : (
                  <>
                    <Gift className="w-3.5 h-3.5" />
                    <span>इंसेंटिव जोड़ें (+ Save)</span>
                  </>
                )}
              </button>
            </div>
          </form>

          {/* Action Ribbon: WhatsApp / SMS / Copy Link / Ledger */}
          <div className="flex items-center gap-2 flex-wrap text-xs">
            <a
              href={persistentWaUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 rounded-xl bg-[#25D366]/20 hover:bg-[#25D366]/30 text-[#25D366] border border-[#25D366]/40 font-bold flex items-center gap-1.5 transition"
            >
              <MessageCircle className="w-3.5 h-3.5" />
              <span>WhatsApp पर भेजें</span>
            </a>

            <a
              href={persistentSmsUrl}
              className="px-3 py-1.5 rounded-xl bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 border border-blue-500/40 font-bold flex items-center gap-1.5 transition"
            >
              <Send className="w-3.5 h-3.5" />
              <span>SMS भेजें</span>
            </a>

            <button
              type="button"
              onClick={handleCopyLink}
              className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 border border-slate-700 font-semibold flex items-center gap-1.5 transition"
            >
              {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-slate-400" />}
              <span>{copiedLink ? 'Copied!' : 'खाता लिंक कॉपी करें'}</span>
            </button>

            {onViewLedger && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onViewLedger(rider.id);
                }}
                className="px-3 py-1.5 rounded-xl bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 border border-indigo-500/40 font-bold flex items-center gap-1.5 transition ml-auto"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>पूर्ण खाता लेजर देखें</span>
              </button>
            )}
          </div>

          {/* History Table */}
          <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950/40">
            <div className="p-3 bg-slate-900/80 border-b border-slate-800 flex items-center justify-between">
              <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-emerald-400" />
                <span>इंसेंटिव इतिहास (Incentive History - {(rider.incentives || []).length})</span>
              </h4>
              <span className="text-[10px] text-slate-400 font-mono">
                कुल: <strong className="text-emerald-400">{formatINR(currentTotalIncentive)}</strong>
              </span>
            </div>

            {(!rider.incentives || rider.incentives.length === 0) ? (
              <div className="p-6 text-center text-xs text-slate-500">
                इस राइडर के लिए अभी तक कोई इंसेंटिव दर्ज नहीं है।
              </div>
            ) : (
              <div className="overflow-x-auto max-h-64">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 bg-slate-900/60 text-slate-400 sticky top-0">
                      <th className="py-2 px-3">Date</th>
                      <th className="py-2 px-3">Reason</th>
                      <th className="py-2 px-3 text-right">Amount (₹)</th>
                      <th className="py-2 px-3 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono">
                    {rider.incentives.map((inc) => (
                      <tr key={inc.id} className="hover:bg-slate-900/40">
                        <td className="py-2 px-3 text-slate-300">
                          {inc.date ? formatDateDisplay(inc.date) : formatDateDisplay(inc.createdAt)}
                        </td>
                        <td className="py-2 px-3 font-sans text-slate-200">
                          <span className="font-medium">{inc.reason || 'इंसेंटिव / बोनस'}</span>
                          {inc.source === 'surplus' && (
                            <span className="ml-1.5 text-[9px] px-1.5 py-0.2 rounded bg-cyan-950 text-cyan-300 border border-cyan-800">
                              सरप्लस
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-right font-bold text-emerald-400">
                          + {formatINR(inc.amount)}
                        </td>
                        <td className="py-2 px-3 text-center">
                          {onDeleteIncentive && (
                            <button
                              type="button"
                              onClick={() => handleDeleteItem(inc.id)}
                              className="p-1 rounded text-slate-500 hover:text-rose-400 hover:bg-slate-800 transition"
                              title="इंसेंटिव हटाएं (Delete from Database)"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Instant Share Success Modal */}
      {instantShareData && (
        <InstantShareSuccessModal
          isOpen={true}
          onClose={() => setInstantShareData(null)}
          riderName={instantShareData.riderName}
          riderPhone={instantShareData.riderPhone}
          riderId={instantShareData.riderId}
          amount={instantShareData.amount}
          title="इंसेंटिव सफलतापूर्वक जोड़ा गया!"
          subtitle="राइडर को WhatsApp व SMS द्वारा सूचना भेजें"
          customMessage={instantShareData.message}
          entryType="payout"
        />
      )}
    </div>
  );
};
