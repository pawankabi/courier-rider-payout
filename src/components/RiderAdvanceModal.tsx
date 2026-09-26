import React, { useState, useEffect } from 'react';
import { 
  X, 
  IndianRupee, 
  Calendar, 
  FileText, 
  TrendingUp, 
  Check, 
  Send, 
  MessageCircle, 
  FileSpreadsheet, 
  ExternalLink, 
  Copy, 
  RefreshCw, 
  AlertCircle,
  Clock,
  Trash2,
  Pencil,
  Sparkles,
  Phone
} from 'lucide-react';
import { Rider, RiderAdvanceEntry, SettlementRecord, DeliveryEntry } from '../types';
import { formatINR, formatDateDisplay, getTodayDateString, formatPhoneNumber, getCleanPhoneDigits } from '../utils/formatters';
import { 
  generateStatementUrl, 
  formatAdvanceSmsText, 
  dispatchAutomatedSms, 
  getWhatsAppUrl, 
  getNativeSmsUrl,
  SmsDispatchResult
} from '../services/smsService';
import { InstantShareSuccessModal } from './InstantShareSuccessModal';

interface RiderAdvanceModalProps {
  rider: Rider;
  settlements?: SettlementRecord[];
  deliveries?: DeliveryEntry[];
  hubName?: string;
  hubSignature?: string;
  onClose: () => void;
  onSaveAdvance: (updatedRider: Rider, newAdvance: RiderAdvanceEntry) => Promise<void>;
  onDeleteAdvance?: (updatedRider: Rider, advanceId: string) => Promise<void>;
  onViewLedger?: (riderId: string) => void;
}

export const RiderAdvanceModal: React.FC<RiderAdvanceModalProps> = ({
  rider,
  settlements = [],
  deliveries = [],
  hubName,
  hubSignature,
  onClose,
  onSaveAdvance,
  onDeleteAdvance,
  onViewLedger,
}) => {
  // Input form state with auto-preserved draft resilience
  const draftKey = `cp_advance_draft_${rider.id}`;

  const [amount, setAmount] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(draftKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed?.amount !== undefined) return String(parsed.amount);
      }
    } catch {}
    return '';
  });
  const [date, setDate] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(draftKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed?.date) return String(parsed.date);
      }
    } catch {}
    return '';
  }); // Completely OPTIONAL
  const [reason, setReason] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(draftKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed?.reason) return String(parsed.reason);
      }
    } catch {}
    return '';
  });
  const [editingAdvance, setEditingAdvance] = useState<RiderAdvanceEntry | null>(null);
  const [instantShareData, setInstantShareData] = useState<{
    riderName: string;
    riderPhone: string;
    riderId: string;
    amount: number;
    message: string;
  } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Auto-save unsaved form draft on typing, phone sleep, or app switch (phone calls / screen lock resilience)
  useEffect(() => {
    if (editingAdvance) return;
    try {
      if (amount || date || reason) {
        localStorage.setItem(
          draftKey,
          JSON.stringify({
            amount,
            date,
            reason,
            savedAt: Date.now(),
          })
        );
      } else {
        localStorage.removeItem(draftKey);
      }
    } catch {}
  }, [amount, date, reason, editingAdvance, draftKey]);

  // Smooth Escape key handler to return smoothly without freeze
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Dispatch feedback state
  const [dispatchResult, setDispatchResult] = useState<{
    smsMessage: string;
    statementUrl: string;
    waUrl: string;
    smsUrl: string;
    statusText: string;
    provider?: string;
  } | null>(null);

  const [copiedLink, setCopiedLink] = useState(false);

  // Helper to recompute running balances chronologically for a list of advances
  const computeRunningBalances = (advList: RiderAdvanceEntry[]): { updatedAdvances: RiderAdvanceEntry[]; total: number } => {
    // Sort oldest first to calculate running cumulative balances
    const sorted = [...advList].sort((a, b) => {
      const timeA = new Date(a.date || a.createdAt).getTime();
      const timeB = new Date(b.date || b.createdAt).getTime();
      return timeA - timeB;
    });

    let running = 0;
    const computed = sorted.map((item) => {
      running += Number(item.amount) || 0;
      return {
        ...item,
        runningBalance: running,
      };
    });

    // Return in reverse chronological order (newest first for UI display)
    return {
      updatedAdvances: computed.reverse(),
      total: running,
    };
  };

  // Running balance calculation: previousAdvanceTotal + newAdvanceAmount = currentTotalAdvance
  const previousAdvanceTotal = typeof rider.totalAdvance === 'number' ? rider.totalAdvance : 0;
  const numericAmount = Math.max(0, Number(amount) || parseFloat(amount) || 0);

  // When editing, adjust running projection
  const currentTotalAdvance = editingAdvance
    ? Math.max(0, previousAdvanceTotal - (editingAdvance.amount || 0) + numericAmount)
    : previousAdvanceTotal + numericAmount;

  // Quick reason presets
  const reasonPresets = [
    'Bike repair (बाइक रिपेयर)',
    'Fuel (पेट्रोल खर्च)',
    'Festival emergency (त्यौहार खर्च)',
    'Medical emergency (दवा खर्च)',
    'Family expense (घरेलू खर्च)',
  ];

  const statementUrl = generateStatementUrl(rider.id);

  // Active values for dynamic 1-tap dispatch
  const activeAmountForMsg = numericAmount > 0
    ? numericAmount
    : (rider.advances && rider.advances.length > 0 ? (rider.advances[0]?.amount || 0) : previousAdvanceTotal);

  const activeReasonForMsg = numericAmount > 0
    ? (reason.trim() || 'एडवांस')
    : (rider.advances && rider.advances.length > 0 ? (rider.advances[0]?.reason || 'एडवांस') : 'एडवांस');

  const activeTotalForMsg = numericAmount > 0 ? currentTotalAdvance : previousAdvanceTotal;

  // Persistent direct messaging URLs for 1-tap dispatch without needing form submit
  const persistentSmsMessage = formatAdvanceSmsText({
    riderName: rider.name,
    amount: activeAmountForMsg,
    reason: activeReasonForMsg,
    totalAdvance: activeTotalForMsg,
    statementUrl,
  });
  const persistentWaUrl = getWhatsAppUrl(rider.phone, persistentSmsMessage);
  const persistentSmsUrl = getNativeSmsUrl(rider.phone, persistentSmsMessage);

  const handleStartEdit = (adv: RiderAdvanceEntry) => {
    setEditingAdvance(adv);
    setAmount(String(adv.amount));
    setDate(adv.date || '');
    setReason(adv.reason || '');
    setErrorMessage(null);
    // Scroll form into view
    const formElem = document.getElementById('rider-advance-form-card');
    if (formElem) {
      formElem.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleCancelEdit = () => {
    setEditingAdvance(null);
    setAmount('');
    setDate('');
    setReason('');
    setErrorMessage(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const validAmount = Number(amount) || parseFloat(amount) || 0;
    if (validAmount <= 0 || isNaN(validAmount)) {
      setErrorMessage('कृपया मान्य एडवांस राशि (Amount) दर्ज करें।');
      return;
    }

    setIsSubmitting(true);

    try {
      const nowIso = new Date().toISOString();

      if (editingAdvance) {
        // --- EDIT MODE ---
        const existingList = rider.advances || [];
        const rawUpdatedList = existingList.map((a) => {
          if (a.id === editingAdvance.id) {
            return {
              ...a,
              amount: validAmount,
              date: date.trim().length > 0 ? date.trim() : undefined,
              reason: reason.trim().length > 0 ? reason.trim() : 'सामान्य एडवांस (General Advance)',
              updatedAt: nowIso,
            };
          }
          return a;
        });

        const { updatedAdvances, total } = computeRunningBalances(rawUpdatedList);
        const updatedItem = updatedAdvances.find((a) => a.id === editingAdvance.id)!;

        const updatedRider: Rider = {
          ...rider,
          totalAdvance: total,
          advances: updatedAdvances,
        };

        await onSaveAdvance(updatedRider, updatedItem);

        const smsMessage = formatAdvanceSmsText({
          riderName: rider.name,
          amount: validAmount,
          reason: `${updatedItem.reason} (अपडेटेड)`,
          totalAdvance: total,
          statementUrl,
        });

        const waUrl = getWhatsAppUrl(rider.phone, smsMessage);
        const smsUrl = getNativeSmsUrl(rider.phone, smsMessage);

        let apiResult: SmsDispatchResult = {
          success: true,
          message: 'एडवांस एंट्री सफलतापूर्वक अपडेट की गई!',
          provider: 'Gateway API',
        };

        try {
          const res = await dispatchAutomatedSms({
            riderPhone: rider.phone,
            riderName: rider.name,
            message: smsMessage,
            type: 'advance',
            statementUrl,
            amount: validAmount,
          });
          if (res) apiResult = res;
        } catch (smsErr) {
          console.warn('Background SMS trigger handled gracefully:', smsErr);
        }

        setDispatchResult({
          smsMessage,
          statementUrl,
          waUrl,
          smsUrl,
          statusText: `एडवांस एंट्री सफलतापूर्वक अपडेट की गई!`,
          provider: apiResult.provider,
        });

        // 1-Tap direct native SMS trigger and instant share popup
        const cleanPhone = (rider.phone || '').trim().replace(/\D/g, '').slice(-10);
        const autoMessage = `नमस्ते ${rider.name}, आपका पे-आउट/एडवांस अपडेट कर दिया गया है। कुल बकाया/हिसाब देखने के लिए खाता लेजर लिंक पर क्लिक करें: https://courier-rider-payout.vercel.app/#/statement/${encodeURIComponent(rider.id)}`;
        try {
          window.open(`sms:${cleanPhone}?body=${encodeURIComponent(autoMessage)}`, '_blank');
        } catch {}
        setInstantShareData({
          riderName: rider.name,
          riderPhone: cleanPhone,
          riderId: rider.id,
          amount: validAmount,
          message: autoMessage,
        });

        handleCancelEdit();
      } else {
        // --- NEW ENTRY MODE ---
        const newAdvanceId = `adv_${Date.now()}`;
        const newAdvance: RiderAdvanceEntry = {
          id: newAdvanceId,
          riderId: rider.id,
          amount: validAmount,
          date: date.trim().length > 0 ? date.trim() : undefined, // Optional: if empty, left undefined
          reason: reason.trim().length > 0 ? reason.trim() : 'सामान्य एडवांस (General Advance)',
          runningBalance: currentTotalAdvance,
          createdAt: nowIso,
          createdBy: rider.userId || rider.createdBy,
        };

        const rawList = [newAdvance, ...(rider.advances || [])];
        const { updatedAdvances, total } = computeRunningBalances(rawList);
        const savedNewAdvance = updatedAdvances.find((a) => a.id === newAdvanceId) || newAdvance;

        const updatedRider: Rider = {
          ...rider,
          totalAdvance: total,
          advances: updatedAdvances,
        };

        // 1. Save to state & Firestore immediately
        await onSaveAdvance(updatedRider, savedNewAdvance);

        // 2. Prepare SMS Message text according to specification:
        const smsMessage = formatAdvanceSmsText({
          riderName: rider.name,
          amount: validAmount,
          reason: newAdvance.reason,
          totalAdvance: total,
          statementUrl,
        });

        const waUrl = getWhatsAppUrl(rider.phone, smsMessage);
        const smsUrl = getNativeSmsUrl(rider.phone, smsMessage);

        // 3. Automated background API call (Fast2SMS / MSG91 / Webhook)
        let apiResult: SmsDispatchResult = {
          success: true,
          message: 'SMS सफलतापूर्वक भेजा गया!',
          provider: 'Gateway API',
        };

        try {
          const res = await dispatchAutomatedSms({
            riderPhone: rider.phone,
            riderName: rider.name,
            message: smsMessage,
            type: 'advance',
            statementUrl,
            amount: validAmount,
          });
          if (res) apiResult = res;
        } catch (smsErr) {
          console.warn('Background SMS trigger handled gracefully:', smsErr);
        }

        setDispatchResult({
          smsMessage,
          statementUrl,
          waUrl,
          smsUrl,
          statusText: apiResult.message || `SMS सफलतापूर्वक भेजा गया!`,
          provider: apiResult.provider,
        });

        // 1-Tap direct native SMS trigger and instant share popup
        const cleanPhone = (rider.phone || '').trim().replace(/\D/g, '').slice(-10);
        const autoMessage = `नमस्ते ${rider.name}, आपका पे-आउट/एडवांस अपडेट कर दिया गया है। कुल बकाया/हिसाब देखने के लिए खाता लेजर लिंक पर क्लिक करें: https://courier-rider-payout.vercel.app/#/statement/${encodeURIComponent(rider.id)}`;
        try {
          window.open(`sms:${cleanPhone}?body=${encodeURIComponent(autoMessage)}`, '_blank');
        } catch {}
        setInstantShareData({
          riderName: rider.name,
          riderPhone: cleanPhone,
          riderId: rider.id,
          amount: validAmount,
          message: autoMessage,
        });

        // Clear input fields and saved draft
        try {
          localStorage.removeItem(draftKey);
        } catch {}
        setAmount('');
        setDate('');
        setReason('');
      }
    } catch (err: any) {
      console.error('Error saving advance:', err);
      setErrorMessage(err?.message || 'एडवांस सुरक्षित करने में त्रुटि हुई।');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopyStatementLink = () => {
    navigator.clipboard.writeText(statementUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const handleDeleteItem = async (advId: string) => {
    if (!onDeleteAdvance) return;
    const targetAdv = (rider.advances || []).find((a) => a.id === advId);
    if (!targetAdv) return;
    if (!window.confirm(`क्या आप ₹${targetAdv.amount} (${targetAdv.reason || 'एडवांस'}) की एंट्री हटाना चाहते हैं?`)) return;

    try {
      const remainingList = (rider.advances || []).filter((a) => a.id !== advId);
      const { updatedAdvances, total } = computeRunningBalances(remainingList);

      const updatedRider: Rider = {
        ...rider,
        totalAdvance: total,
        advances: updatedAdvances,
      };

      await onDeleteAdvance(updatedRider, advId);

      if (editingAdvance?.id === advId) {
        handleCancelEdit();
      }
    } catch (err) {
      console.error('Error deleting advance item:', err);
    }
  };

  return (
    <div 
      id="rider-advance-modal-backdrop"
      className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div 
        id="rider-advance-modal-card"
        className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-2xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden my-auto animate-in fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 bg-slate-950/70 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center font-bold text-lg shrink-0">
              ₹
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-lg font-bold text-white truncate">
                  राइडर एडवांस प्रबंधन (Advance Entry &amp; Ledger)
                </h2>
                <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono">
                  {rider.name}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-2">
                <span>Phone: <strong className="text-slate-200">+91 {formatPhoneNumber(rider.phone)}</strong></span>
                <span>•</span>
                <span>Vehicle: <strong className="text-slate-200">{rider.vehicleType || 'Bike'}</strong></span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {onViewLedger && (
              <button
                type="button"
                onClick={() => onViewLedger(rider.id)}
                className="px-2.5 py-1.5 rounded-xl bg-emerald-950 hover:bg-emerald-900 text-emerald-300 border border-emerald-700/60 text-xs font-semibold flex items-center gap-1.5 transition"
                title="ऑनलाइन एक्सेल खाता खोलें"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Online Ledger</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-5 flex-1">
          
          {/* Running Balance Banner */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3.5 rounded-xl bg-slate-950/70 border border-slate-800">
            <div>
              <span className="text-[11px] text-slate-400 block">पिछला कुल एडवांस (Previous Total)</span>
              <span className="text-base font-bold text-slate-200 font-mono mt-0.5 block">
                {formatINR(previousAdvanceTotal)}
              </span>
            </div>

            <div>
              <span className="text-[11px] text-slate-400 block">नया एडवांस (New Entry)</span>
              <span className="text-base font-bold text-amber-400 font-mono mt-0.5 block">
                + {formatINR(numericAmount)}
              </span>
            </div>

            <div className="border-t sm:border-t-0 sm:border-l border-slate-800 pt-2 sm:pt-0 sm:pl-3">
              <span className="text-[11px] text-amber-400 font-bold block uppercase tracking-wider">
                वर्तमान कुल बकाया (New Balance)
              </span>
              <span className="text-xl font-black text-amber-300 font-mono mt-0.5 block">
                {formatINR(currentTotalAdvance)}
              </span>
            </div>
          </div>

          {/* Persistent Instant WhatsApp & SMS Dispatch Ribbon (Always Available to Admin) */}
          <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-300">
                <Send className="w-3.5 h-3.5 text-emerald-400" />
                <span>राइडर को तुरंत स्लिप व खाता लिंक भेजें (Instant 1-Tap Dispatch)</span>
              </div>
              <span className="text-[11px] text-slate-400">
                बकाया: <strong className="text-amber-400">{formatINR(previousAdvanceTotal)}</strong>
              </span>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <a
                href={persistentWaUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#25D366] hover:bg-[#20bd5a] text-slate-950 text-xs font-bold shadow transition active:scale-95 cursor-pointer"
                title="WhatsApp पर तुरंत खाता लिंक व एडवांस भेजें"
              >
                <MessageCircle className="w-3.5 h-3.5" />
                <span>📲 Send SMS / WhatsApp</span>
              </a>

              <a
                href={persistentSmsUrl}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow transition active:scale-95 cursor-pointer"
                title="फोन SMS ऐप से तुरंत भेजें"
              >
                <Send className="w-3.5 h-3.5" />
                <span>📲 Send via SMS</span>
              </a>

              <button
                type="button"
                onClick={handleCopyStatementLink}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-200 text-xs font-medium border border-slate-700 transition cursor-pointer"
                title="सार्वजनिक खाता लिंक कॉपी करें"
              >
                {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-slate-400" />}
                <span>{copiedLink ? 'Link Copied!' : 'Copy Link'}</span>
              </button>

              {onViewLedger && (
                <button
                  type="button"
                  onClick={() => onViewLedger(rider.id)}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-950/80 hover:bg-emerald-900 text-emerald-300 text-xs font-medium border border-emerald-700/50 transition ml-auto cursor-pointer"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Open Sheet</span>
                </button>
              )}
            </div>
          </div>

          {/* Instant SMS Dispatch Feedback Banner (if triggered) */}
          {dispatchResult && (
            <div className="p-4 rounded-xl bg-emerald-950/40 border border-emerald-500/40 space-y-2.5 animate-in fade-in">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                    <Check className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-emerald-300">
                      {dispatchResult.statusText}
                    </h4>
                    <p className="text-[11px] text-slate-300 mt-0.5">
                      स्वचालित SMS बैकग्राउंड में डिस्पैच कर दिया गया है।
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setDispatchResult(null)}
                  className="text-slate-400 hover:text-white p-1"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Message text preview */}
              <div className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800 text-[11px] text-slate-300 leading-relaxed font-sans">
                {dispatchResult.smsMessage}
              </div>

              {/* 1-Click Fallback Buttons for WhatsApp & SMS */}
              <div className="flex items-center gap-2 flex-wrap pt-1">
                <a
                  href={dispatchResult.waUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#25D366] hover:bg-[#20bd5a] text-slate-950 text-xs font-bold shadow transition active:scale-95 cursor-pointer"
                  title="WhatsApp पर तुरंत भेजें"
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  <span>📲 Send via WhatsApp (1-Click)</span>
                </a>

                <a
                  href={dispatchResult.smsUrl}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow transition active:scale-95 cursor-pointer"
                  title="फोन SMS ऐप से भेजें"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>📲 Send via SMS</span>
                </a>

                <button
                  type="button"
                  onClick={handleCopyStatementLink}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition"
                  title="सार्वजनिक खाता लिंक कॉपी करें"
                >
                  {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-slate-400" />}
                  <span>{copiedLink ? 'Link Copied!' : 'Copy Link'}</span>
                </button>

                {onViewLedger && (
                  <button
                    type="button"
                    onClick={() => onViewLedger(rider.id)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-900/60 hover:bg-emerald-800 text-emerald-200 text-xs font-medium border border-emerald-700/50 transition ml-auto"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>View Sheet</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Advance Entry Form */}
          <form id="rider-advance-form-card" onSubmit={handleSubmit} className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                <IndianRupee className="w-4 h-4 text-emerald-400" />
                <span>{editingAdvance ? 'एडवांस में बदलाव करें (Edit Advance)' : 'नया एडवांस जोड़ें (Add New Advance)'}</span>
              </h3>
              {editingAdvance && (
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  className="text-xs text-slate-400 hover:text-white bg-slate-800 px-2.5 py-1 rounded-lg transition"
                >
                  रद्द करें (Cancel Edit)
                </button>
              )}
            </div>

            {editingAdvance && (
              <div className="p-2.5 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs flex items-center justify-between gap-2 animate-in fade-in">
                <div className="flex items-center gap-2">
                  <Pencil className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span>
                    आप <strong>₹{editingAdvance.amount}</strong> की एंट्री में बदलाव कर रहे हैं। सेव करने पर नया बैलेंस अपडेट होगा।
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  className="text-[11px] underline text-amber-200 hover:text-white"
                >
                  रद्द करें
                </button>
              </div>
            )}

            {errorMessage && (
              <div className="p-2.5 rounded-lg bg-rose-950/80 border border-rose-800 text-rose-200 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Advance Amount (REQUIRED) */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  एडवांस राशि (Amount in ₹) <span className="text-rose-400">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">
                    ₹
                  </span>
                  <input
                    id="advance-amount-input"
                    type="number"
                    min="0"
                    step="any"
                    placeholder="e.g. 5406"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full pl-8 pr-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-sm font-bold text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                    required
                    autoFocus
                  />
                </div>
              </div>

              {/* Advance Date (COMPLETELY OPTIONAL) */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center justify-between">
                  <span>तारीख (Date)</span>
                  <span className="text-[11px] text-slate-400 font-normal">वैकल्पिक (Optional)</span>
                </label>
                <div className="relative">
                  <input
                    id="advance-date-input"
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-sm text-white focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                  />
                </div>
                <p className="text-[10px] text-slate-500 mt-1">
                  {date ? `चुनी गई तारीख: ${formatDateDisplay(date)}` : 'खाली छोड़ने पर वर्तमान समय सुरक्षित किया जाएगा (Not forced/blocked)'}
                </p>
              </div>
            </div>

            {/* Reason / Purpose */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                एडवांस देने का कारण (Reason / Purpose)
              </label>
              <input
                id="advance-reason-input"
                type="text"
                placeholder="उदा. Bike repair, Fuel, Festival emergency, या घरेलू खर्च"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
              />

              {/* Quick suggestion tags */}
              <div className="flex items-center gap-1.5 flex-wrap mt-2">
                <span className="text-[10px] text-slate-400">सुझाव (Quick):</span>
                {reasonPresets.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setReason(preset)}
                    className="px-2 py-0.5 rounded-md bg-slate-800 hover:bg-slate-700 text-[10px] text-slate-300 border border-slate-700 transition"
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>

            {/* Submit Button */}
            <div className="pt-2 flex items-center justify-between gap-3">
              <span className="text-[11px] text-slate-400">
                {editingAdvance ? 'अपडेट करने पर राइडर का कुल बकाया व लेजर शीट अपडेट होगी' : 'सेव करने पर राइडर को विस्तृत SMS व ऑनलाइन एक्सेल लिंक भेजा जाएगा'}
              </span>

              <div className="flex items-center gap-2">
                {editingAdvance && (
                  <button
                    type="button"
                    onClick={handleCancelEdit}
                    className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs transition"
                  >
                    रद्द करें
                  </button>
                )}
                <button
                  type="submit"
                  id="save-advance-submit-btn"
                  disabled={isSubmitting || numericAmount <= 0}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-slate-950 font-bold text-xs shadow-lg shadow-amber-600/30 active:scale-95 transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  {isSubmitting ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>{editingAdvance ? 'अपडेट हो रहा है...' : 'सेव हो रहा है...'}</span>
                    </>
                  ) : (
                    <>
                      {editingAdvance ? <Check className="w-4 h-4" /> : <Send className="w-4 h-4" />}
                      <span>{editingAdvance ? 'अपडेट करें (Update Advance)' : 'सेव करें एवं SMS भेजें (Save & Trigger SMS)'}</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </form>

          {/* Past Advances Table for this Rider */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-blue-400" />
                <span>पिछला अग्रिम इतिहास (Advance History - {(rider.advances || []).length})</span>
              </h3>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopyStatementLink}
                  className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
                >
                  <Copy className="w-3 h-3" />
                  <span>{copiedLink ? 'Copied' : 'Share Link'}</span>
                </button>
              </div>
            </div>

            {(!rider.advances || rider.advances.length === 0) ? (
              <div className="p-6 text-center rounded-xl bg-slate-950/40 border border-slate-800 text-slate-400 text-xs">
                इस राइडर के लिए अभी तक कोई अग्रिम दर्ज नहीं किया गया है।
              </div>
            ) : (
              <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950/60 max-h-56 overflow-y-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 bg-slate-900/90 text-slate-400 font-semibold sticky top-0 z-10">
                      <th className="py-2 px-3">Date</th>
                      <th className="py-2 px-3 text-right">Advance Amount</th>
                      <th className="py-2 px-3">Reason / Notes</th>
                      <th className="py-2 px-3 text-right">Running Balance</th>
                      <th className="py-2 px-2 text-center w-16">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono">
                    {rider.advances.map((adv) => (
                      <tr key={adv.id} className="hover:bg-slate-850/40 transition">
                        <td className="py-2 px-3 text-slate-200">
                          {adv.date ? formatDateDisplay(adv.date) : formatDateDisplay(adv.createdAt)}
                        </td>
                        <td className="py-2 px-3 text-right font-bold text-rose-400">
                          + {formatINR(adv.amount)}
                        </td>
                        <td className="py-2 px-3 text-slate-300 font-sans text-[11px]">
                          {adv.reason || 'सामान्य एडवांस'}
                        </td>
                        <td className="py-2 px-3 text-right font-bold text-amber-300">
                          {formatINR(adv.runningBalance !== undefined ? adv.runningBalance : previousAdvanceTotal)}
                        </td>
                        <td className="py-2 px-2 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleStartEdit(adv)}
                              className="text-slate-400 hover:text-amber-400 p-1 rounded hover:bg-slate-800 transition"
                              title="एडवांस एंट्री में बदलाव करें (Edit Entry)"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            {onDeleteAdvance && (
                              <button
                                type="button"
                                onClick={() => handleDeleteItem(adv.id)}
                                className="text-slate-500 hover:text-rose-400 p-1 rounded hover:bg-slate-800 transition"
                                title="एडवांस हटाएं (Delete Entry)"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-3 sm:p-4 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-slate-400">
            <span>कुल बकाया एडवांस: <strong className="text-amber-400">{formatINR(rider.totalAdvance || 0)}</strong></span>
          </div>

          <button
            type="button"
            id="close-rider-advance-modal-bottom-btn"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition cursor-pointer"
          >
            Back / Cancel (वापस जाएं)
          </button>
        </div>
      </div>

      {/* Automatic 1-Tap SMS / WhatsApp Instant Share Success Modal */}
      {instantShareData && (
        <InstantShareSuccessModal
          isOpen={Boolean(instantShareData)}
          onClose={() => setInstantShareData(null)}
          riderName={instantShareData.riderName}
          riderPhone={instantShareData.riderPhone}
          riderId={instantShareData.riderId}
          title="एडवांस सुरक्षित किया गया! (Advance Saved)"
          subtitle={`सफलतापूर्वक दर्ज किया गया • ${instantShareData.riderName}`}
          amount={instantShareData.amount}
          entryType="advance"
          customMessage={instantShareData.message}
        />
      )}
    </div>
  );
};
