import React, { useState, useMemo, useEffect } from 'react';
import { 
  Banknote, 
  ChevronDown, 
  ChevronUp, 
  Share2, 
  Copy, 
  Check, 
  Coins, 
  AlertCircle,
  FileSpreadsheet,
  ArrowUpRight,
  Plus,
  Trash2,
  Clock,
  User,
  RotateCcw,
  ShieldCheck,
  Building2,
  Wallet,
  AlertTriangle,
  History
} from 'lucide-react';
import { 
  CodDailyEntry, 
  CashWithdrawalRecord, 
  DenominationValue, 
  STANDARD_DENOMINATIONS 
} from '../../types';
import { formatINR } from '../../utils/formatters';
import { 
  aggregateDailyDenominations, 
  formatDenominationShareText,
  calculateVaultRemainingSummary,
  formatVaultSummaryShareText
} from '../../utils/denominationUtils';

export interface DailyConsolidatedDenominationSummaryProps {
  entries: CodDailyEntry[];
  selectedDate: string;
  hubName?: string;
  isDarkTheme?: boolean;
  hubId?: string;
  adminName?: string;
  onWithdrawalsChange?: (withdrawals: CashWithdrawalRecord[]) => void;
}

const QUICK_PURPOSE_OPTIONS = [
  'बैंक में जमा (SBI Bank Deposit)',
  'बैंक में जमा (HDFC / Other Bank)',
  'हब खर्च / पेट्रोल (Fuel & Hub Expense)',
  'वेंडर भुगतान (Vendor / Rent Payment)',
  'स्टाफ / राइडर अग्रिम भुगतान (Staff Expense)'
];

export const DailyConsolidatedDenominationSummary: React.FC<DailyConsolidatedDenominationSummaryProps> = ({
  entries,
  selectedDate,
  hubName = 'सरायकेला कूरियर हब',
  isDarkTheme = false,
  hubId,
  adminName = 'हब एडमिन',
  onWithdrawalsChange,
}) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [showAllNotes, setShowAllNotes] = useState(false);
  const [copied, setCopied] = useState(false);
  const [vaultCopied, setVaultCopied] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // Persistence Key scoped to date and hub
  const storageKey = useMemo(() => {
    return `cp_cod_withdrawals_${selectedDate}_${(hubId || 'default').trim()}`;
  }, [selectedDate, hubId]);

  // Saved Withdrawal Records State
  const [withdrawals, setWithdrawals] = useState<CashWithdrawalRecord[]>(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {
      console.warn('Failed to load withdrawals from storage:', e);
    }
    return [];
  });

  // Re-sync when selectedDate or hubId changes
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setWithdrawals(parsed);
          return;
        }
      }
      setWithdrawals([]);
    } catch (e) {
      setWithdrawals([]);
    }
  }, [storageKey]);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  };

  const saveWithdrawalsToStorage = (updated: CashWithdrawalRecord[]) => {
    setWithdrawals(updated);
    try {
      localStorage.setItem(storageKey, JSON.stringify(updated));
    } catch (e) {
      console.warn('Failed to save withdrawals to storage:', e);
    }
    onWithdrawalsChange?.(updated);
  };

  // 1. Compute Inward Daily Summary
  const inwardSummary = useMemo(() => {
    return aggregateDailyDenominations(entries);
  }, [entries]);

  // 2. Compute Net Remaining Vault Balance
  const vaultSummary = useMemo(() => {
    return calculateVaultRemainingSummary(inwardSummary, withdrawals);
  }, [inwardSummary, withdrawals]);

  // Form State for Adding New Withdrawal
  const [isWithdrawalFormOpen, setIsWithdrawalFormOpen] = useState(false);
  const [formNotes, setFormNotes] = useState<Record<DenominationValue, string>>({
    2000: '',
    500: '',
    200: '',
    100: '',
    50: '',
    20: '',
    10: '',
    5: '',
    2: '',
    1: '',
  });

  // Current local date-time string in YYYY-MM-DDTHH:mm format
  const getInitialDateTime = () => {
    const now = new Date();
    const timePart = now.toTimeString().slice(0, 5);
    return `${selectedDate} ${timePart}`;
  };

  const [formRecipient, setFormRecipient] = useState('');
  const [formDateTime, setFormDateTime] = useState(getInitialDateTime);
  const [formWithdrawnBy, setFormWithdrawnBy] = useState(adminName);

  // Update dateTime when selectedDate changes
  useEffect(() => {
    setFormDateTime(getInitialDateTime());
  }, [selectedDate]);

  // Calculate live numbers for current form entry
  const currentFormCalc = useMemo(() => {
    let formTotalNotes = 0;
    let formTotalAmount = 0;
    const errors: Partial<Record<DenominationValue, string>> = {};
    const notesBreakdown: Partial<Record<DenominationValue, number>> = {};

    STANDARD_DENOMINATIONS.forEach((val) => {
      const rawCount = formNotes[val];
      const count = parseInt(rawCount || '0', 10);
      // Available remaining in vault before this new withdrawal
      const remainingInVault = vaultSummary.breakdown.find((b) => b.value === val)?.remainingCount || 0;

      if (!isNaN(count) && count > 0) {
        notesBreakdown[val] = count;
        formTotalNotes += count;
        formTotalAmount += count * val;

        if (count > remainingInVault) {
          errors[val] = `तिजोरी में केवल ${remainingInVault} नोट उपलब्ध हैं (आपने ${count} दर्ज किया)`;
        }
      }
    });

    const hasErrors = Object.keys(errors).length > 0;
    const canSubmit = formTotalNotes > 0 && !hasErrors && formRecipient.trim().length > 0;

    return {
      formTotalNotes,
      formTotalAmount,
      errors,
      hasErrors,
      notesBreakdown,
      canSubmit,
    };
  }, [formNotes, vaultSummary.breakdown, formRecipient]);

  const handleRecordWithdrawal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentFormCalc.canSubmit) {
      if (!formRecipient.trim()) {
        showToast('⚠️ कृपया निकासी का कारण / किसे दिया दर्ज करें।');
      } else if (currentFormCalc.hasErrors) {
        showToast('⚠️ तिजोरी में उपलब्ध नोटों से अधिक निकासी संभव नहीं है।');
      } else {
        showToast('⚠️ कृपया कम से कम 1 नोट की निकासी दर्ज करें।');
      }
      return;
    }

    const newRecord: CashWithdrawalRecord = {
      id: `wth_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      date: selectedDate,
      dateTime: formDateTime.trim() || `${selectedDate} ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
      recipientOrPurpose: formRecipient.trim(),
      withdrawnBy: formWithdrawnBy.trim() || adminName,
      notesBreakdown: currentFormCalc.notesBreakdown,
      totalNotes: currentFormCalc.formTotalNotes,
      totalAmount: currentFormCalc.formTotalAmount,
      createdAt: new Date().toISOString(),
    };

    const nextWithdrawals = [newRecord, ...withdrawals];
    saveWithdrawalsToStorage(nextWithdrawals);

    // Reset Form
    setFormNotes({
      2000: '',
      500: '',
      200: '',
      100: '',
      50: '',
      20: '',
      10: '',
      5: '',
      2: '',
      1: '',
    });
    setFormRecipient('');
    setFormDateTime(getInitialDateTime());
    setIsWithdrawalFormOpen(false);
    showToast(`✅ ₹${formatINR(newRecord.totalAmount)} की निकासी (${newRecord.totalNotes} नोट) सफलतापूर्वक दर्ज की गई!`);
  };

  const handleDeleteWithdrawal = (id: string) => {
    const next = withdrawals.filter((w) => w.id !== id);
    saveWithdrawalsToStorage(next);
    showToast('निकासी रिकॉर्ड हटा दिया गया।');
  };

  const handleClearAllWithdrawals = () => {
    if (withdrawals.length === 0) return;
    saveWithdrawalsToStorage([]);
    showToast('इस तारीख की सभी निकासी प्रविष्टियां रीसेट कर दी गईं।');
  };

  const displayedItems = showAllNotes ? inwardSummary.allItems : inwardSummary.activeItems;

  const handleCopyInward = () => {
    const text = formatDenominationShareText(selectedDate, inwardSummary, hubName);
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  };

  const handleWhatsAppInward = () => {
    const text = formatDenominationShareText(selectedDate, inwardSummary, hubName);
    const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleCopyVaultReport = () => {
    const text = formatVaultSummaryShareText(selectedDate, vaultSummary, withdrawals, hubName);
    navigator.clipboard.writeText(text);
    setVaultCopied(true);
    setTimeout(() => setVaultCopied(false), 2200);
  };

  const handleWhatsAppVaultReport = () => {
    const text = formatVaultSummaryShareText(selectedDate, vaultSummary, withdrawals, hubName);
    const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  // Base background styling matching surrounding theme
  const containerClass = isDarkTheme
    ? 'bg-slate-900 border-slate-800 text-white'
    : 'bg-white border-slate-200 text-slate-900';

  const headerClass = isDarkTheme
    ? 'bg-slate-850 border-slate-800'
    : 'bg-gradient-to-r from-emerald-50/60 via-slate-50 to-teal-50/60 border-slate-200';

  const cardBgClass = isDarkTheme
    ? 'bg-slate-950/70 border-slate-800'
    : 'bg-slate-50/80 border-slate-200';

  const totalRowClass = isDarkTheme
    ? 'bg-slate-950 border-emerald-500/30'
    : 'bg-emerald-50/80 border-emerald-200';

  return (
    <div 
      id="daily-consolidated-denomination-summary"
      className={`rounded-2xl border shadow-sm overflow-hidden transition-all duration-200 ${containerClass}`}
    >
      {/* Toast Notification */}
      {toastMsg && (
        <div className="fixed bottom-5 right-5 z-50 px-4 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-bold shadow-xl border border-slate-700 animate-in fade-in slide-in-from-bottom-2">
          {toastMsg}
        </div>
      )}

      {/* 1. Header / Accordion Toggle Bar */}
      <div 
        onClick={() => setIsExpanded(!isExpanded)}
        className={`px-4 sm:px-5 py-3.5 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer select-none transition ${headerClass}`}
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-xs shrink-0">
            <Banknote className="w-5 h-5 stroke-[2.2]" />
          </div>
          <div>
            <h3 className="text-sm sm:text-base font-bold flex items-center gap-2 flex-wrap">
              <span>📊 आज का कुल कैश नोट विवरण</span>
              <span className={`text-[11px] font-semibold ${isDarkTheme ? 'text-slate-400' : 'text-slate-500'}`}>
                (Daily Consolidated Denomination Summary)
              </span>
            </h3>
            <p className={`text-xs mt-0.5 ${isDarkTheme ? 'text-slate-400' : 'text-slate-500'}`}>
              तारीख: <strong className={isDarkTheme ? 'text-emerald-300' : 'text-emerald-700'}>{selectedDate}</strong> • {inwardSummary.totalRidersWithCash} राइडर्स ने कैश जमा किया
            </p>
          </div>
        </div>

        {/* Quick Stats Badges & Actions */}
        <div className="flex items-center gap-2 self-end sm:self-auto flex-wrap">
          <div className={`px-3 py-1 rounded-xl text-xs font-mono font-bold border ${
            isDarkTheme 
              ? 'bg-slate-800 border-slate-700 text-slate-300' 
              : 'bg-white border-slate-200 text-slate-700 shadow-2xs'
          }`}>
            <span>इनवर्ड नोट: </span>
            <strong className={isDarkTheme ? 'text-emerald-400' : 'text-emerald-600'}>
              {inwardSummary.totalNotes}
            </strong>
          </div>

          <div className={`px-3 py-1 rounded-xl text-xs font-mono font-bold border ${
            isDarkTheme 
              ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300' 
              : 'bg-emerald-100/70 border-emerald-300 text-emerald-800'
          }`}>
            <span>इनवर्ड कैश: </span>
            <strong className="text-sm font-black">
              ₹{formatINR(inwardSummary.totalAmount || inwardSummary.totalCashDeposited)}
            </strong>
          </div>

          {/* Quick Remaining in Vault Badge */}
          <div className={`px-3 py-1 rounded-xl text-xs font-mono font-bold border ${
            isDarkTheme 
              ? 'bg-indigo-950/70 border-indigo-500/40 text-indigo-300' 
              : 'bg-indigo-50 border-indigo-300 text-indigo-800'
          }`}>
            <span>तिजोरी शेष: </span>
            <strong className="text-sm font-black">
              ₹{formatINR(vaultSummary.netRemainingCash)}
            </strong>
          </div>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleCopyInward();
            }}
            className={`p-2 rounded-xl border text-xs font-semibold transition cursor-pointer ${
              isDarkTheme 
                ? 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-300' 
                : 'bg-white hover:bg-slate-100 border-slate-200 text-slate-700 shadow-2xs'
            }`}
            title="नोट विवरण कॉपी करें"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleWhatsAppInward();
            }}
            className="p-2 rounded-xl bg-[#25D366] hover:bg-[#20bd5a] text-slate-950 font-bold transition shadow-2xs cursor-pointer"
            title="WhatsApp पर सारांश भेजें"
          >
            <Share2 className="w-4 h-4" />
          </button>

          <div className={`p-1.5 rounded-lg ${isDarkTheme ? 'text-slate-400' : 'text-slate-500'}`}>
            {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
          </div>
        </div>
      </div>

      {/* 2. Expandable Body Content */}
      {isExpanded && (
        <div className="p-4 sm:p-5 space-y-6">
          {/* SECTION A: INWARD CASH NOTES (Rider COD Deposit) */}
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2 flex-wrap text-xs">
              <span className={`font-semibold flex items-center gap-1.5 ${isDarkTheme ? 'text-emerald-400' : 'text-emerald-800'}`}>
                <Coins className="w-4 h-4" />
                <span>१. दैनिक कुल इनवर्ड नोट (Rider COD Handover Inward):</span>
              </span>

              <button
                type="button"
                onClick={() => setShowAllNotes(!showAllNotes)}
                className={`px-3 py-1 rounded-lg border font-semibold transition cursor-pointer ${
                  showAllNotes
                    ? isDarkTheme 
                      ? 'bg-blue-950 border-blue-600 text-blue-300' 
                      : 'bg-blue-50 border-blue-300 text-blue-700'
                    : isDarkTheme 
                      ? 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700' 
                      : 'bg-slate-100 border-slate-200 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {showAllNotes ? 'सक्रिय नोट ही दिखाएं (Active Only)' : 'सभी नोट दिखाएं (Show All ₹1-₹2000)'}
              </button>
            </div>

            {/* Empty State */}
            {displayedItems.length === 0 ? (
              <div className={`p-6 text-center rounded-2xl border ${
                isDarkTheme ? 'bg-slate-950/40 border-slate-800 text-slate-400' : 'bg-slate-50 border-slate-200 text-slate-500'
              }`}>
                <Coins className="w-8 h-8 mx-auto mb-2 text-slate-400 stroke-1" />
                <p className="text-sm font-semibold">
                  इस तारीख ({selectedDate}) के लिए अभी तक कोई नोट विवरण दर्ज नहीं किया गया है।
                </p>
                <p className="text-xs mt-1 text-slate-400">
                  राइडर या इंचार्ज द्वारा कैश एंट्री करते समय 💵 आइकॉन पर क्लिक करके नोटों का विवरण दर्ज करें।
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Responsive Cards Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2.5">
                  {displayedItems.map((item) => {
                    const hasCount = item.count > 0;
                    return (
                      <div 
                        key={item.value} 
                        className={`p-3 rounded-xl border flex items-center justify-between transition ${cardBgClass} ${
                          hasCount ? 'ring-1 ring-emerald-500/20' : 'opacity-60'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className={`w-8 h-8 rounded-lg flex items-center justify-center font-mono font-black text-xs ${
                            item.value >= 500
                              ? isDarkTheme ? 'bg-purple-950/80 text-purple-300 border border-purple-800' : 'bg-purple-100 text-purple-800 border border-purple-200'
                              : item.value >= 100
                              ? isDarkTheme ? 'bg-blue-950/80 text-blue-300 border border-blue-800' : 'bg-blue-100 text-blue-800 border border-blue-200'
                              : isDarkTheme ? 'bg-amber-950/80 text-amber-300 border border-amber-800' : 'bg-amber-100 text-amber-800 border border-amber-200'
                          }`}>
                            ₹{item.value}
                          </span>
                          <div>
                            <div className={`font-mono text-xs ${isDarkTheme ? 'text-slate-300' : 'text-slate-700'}`}>
                              <strong className={`text-sm ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>{item.count}</strong> नोट
                            </div>
                            <div className="text-[10px] text-slate-400">
                              ₹{item.value} × {item.count}
                            </div>
                          </div>
                        </div>

                        <div className="text-right">
                          <span className={`font-mono font-extrabold text-xs sm:text-sm ${
                            hasCount 
                              ? isDarkTheme ? 'text-emerald-400' : 'text-emerald-700'
                              : isDarkTheme ? 'text-slate-500' : 'text-slate-400'
                          }`}>
                            ₹{formatINR(item.subtotal)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Bottom Grand Total Row */}
                <div className={`p-4 rounded-2xl border flex flex-col sm:flex-row items-center justify-between gap-3 ${totalRowClass}`}>
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-xl bg-emerald-600 text-white font-bold text-xs">
                      INWARD TOTAL
                    </div>
                    <div>
                      <h4 className={`text-sm font-extrabold ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>
                        कुल इनवर्ड नोट (Total Inward Inflow)
                      </h4>
                      <p className={`text-xs ${isDarkTheme ? 'text-slate-400' : 'text-slate-500'}`}>
                        राइडर्स द्वारा हब में जमा किए गए कुल नोट
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-6 text-right">
                    <div>
                      <span className={`text-[10px] uppercase font-bold tracking-wider block ${isDarkTheme ? 'text-slate-400' : 'text-slate-500'}`}>
                        कुल नोट (Total Notes)
                      </span>
                      <span className={`font-mono font-black text-lg ${isDarkTheme ? 'text-slate-200' : 'text-slate-800'}`}>
                        {inwardSummary.totalNotes}
                      </span>
                    </div>

                    <div>
                      <span className="text-[10px] uppercase font-bold tracking-wider text-emerald-600 block">
                        कुल कैश (Total Inward)
                      </span>
                      <span className={`font-mono font-black text-xl sm:text-2xl ${
                        isDarkTheme ? 'text-emerald-400' : 'text-emerald-700'
                      }`}>
                        ₹{formatINR(inwardSummary.totalAmount)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Inward Reconciliation Warning */}
                {inwardSummary.totalCashDeposited > inwardSummary.totalAmount && (
                  <div className={`p-3 rounded-xl border flex items-center justify-between text-xs ${
                    isDarkTheme ? 'bg-amber-950/40 border-amber-800 text-amber-300' : 'bg-amber-50 border-amber-200 text-amber-800'
                  }`}>
                    <div className="flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0 text-amber-600" />
                      <span>
                        कुछ राइडर्स का कुल कैश <strong>₹{formatINR(inwardSummary.totalCashDeposited)}</strong> है, जिसमें से <strong>₹{formatINR(inwardSummary.totalAmount)}</strong> का नोट विवरण दर्ज है (शेष: ₹{formatINR(inwardSummary.totalCashDeposited - inwardSummary.totalAmount)} का नोट विवरण पेंडिंग है)।
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* =====================================================================
              SECTION B: DEDICATED CASH WITHDRAWAL / DENOMINATION OUTWARD TRACKER
              "कैश निकासी / नोट वितरण विवरण (Cash Outward & Vault Withdrawal)"
          ===================================================================== */}
          <div 
            id="cash-withdrawal-vault-section" 
            className={`pt-5 border-t ${isDarkTheme ? 'border-slate-800' : 'border-slate-200'} space-y-4`}
          >
            {/* Section Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-amber-600 to-rose-600 text-white flex items-center justify-center shadow-xs shrink-0">
                  <ArrowUpRight className="w-5 h-5 stroke-[2.2]" />
                </div>
                <div>
                  <h4 className="text-sm sm:text-base font-extrabold flex items-center gap-2">
                    <span>📤 कैश निकासी / नोट वितरण विवरण</span>
                    <span className={`text-[11px] font-semibold ${isDarkTheme ? 'text-slate-400' : 'text-slate-500'}`}>
                      (Cash Outward & Vault Withdrawal)
                    </span>
                  </h4>
                  <p className={`text-xs ${isDarkTheme ? 'text-slate-400' : 'text-slate-500'}`}>
                    बैंक जमा, वेंडर या हब खर्च हेतु तिजोरी से निकाले गए नोटों का सटीक हिसाब
                  </p>
                </div>
              </div>

              {/* Action Buttons: Add Withdrawal & Reset */}
              <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
                <button
                  type="button"
                  onClick={() => setIsWithdrawalFormOpen(!isWithdrawalFormOpen)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold text-xs shadow-xs transition active:scale-95 cursor-pointer ${
                    isWithdrawalFormOpen
                      ? 'bg-slate-200 text-slate-800 hover:bg-slate-300'
                      : 'bg-gradient-to-r from-amber-600 to-rose-600 hover:from-amber-500 hover:to-rose-500 text-white shadow-amber-600/20'
                  }`}
                >
                  <Plus className={`w-4 h-4 ${isWithdrawalFormOpen ? 'rotate-45' : ''} transition-transform`} />
                  <span>{isWithdrawalFormOpen ? 'फॉर्म बंद करें' : '+ नई कैश निकासी दर्ज करें'}</span>
                </button>

                {withdrawals.length > 0 && (
                  <button
                    type="button"
                    onClick={handleClearAllWithdrawals}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-rose-300 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-semibold transition active:scale-95 cursor-pointer"
                    title="इस तारीख की सभी निकासी रीसेट करें"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">रीसेट करें</span>
                  </button>
                )}
              </div>
            </div>

            {/* WITHDRAWAL FORM MODAL / EXPANDABLE PANEL */}
            {isWithdrawalFormOpen && (
              <form 
                onSubmit={handleRecordWithdrawal}
                className={`p-4 sm:p-5 rounded-2xl border ${
                  isDarkTheme 
                    ? 'bg-slate-950/90 border-amber-500/40' 
                    : 'bg-gradient-to-br from-amber-50/40 via-white to-rose-50/30 border-amber-300 shadow-md'
                } space-y-4 animate-in fade-in`}
              >
                <div className="flex items-center justify-between border-b pb-3 border-amber-200/60">
                  <div className="flex items-center gap-2">
                    <Wallet className="w-4 h-4 text-amber-600" />
                    <h5 className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white">
                      नई निकासी प्रविष्टि (Withdraw Physical Notes from Vault)
                    </h5>
                  </div>
                  <span className="text-[11px] font-mono font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-md border border-amber-300">
                    तिजोरी में उपलब्ध: ₹{formatINR(vaultSummary.netRemainingCash)}
                  </span>
                </div>

                {/* Recipient / Purpose & Date-Time Inputs */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="md:col-span-2 space-y-1">
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                      किसे दिया / निकासी कारण (Recipient / Purpose) *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. बैंक में जमा (SBI Bank), पेट्रोल / हब खर्च, वेंडर पेमेंट..."
                      value={formRecipient}
                      onChange={(e) => setFormRecipient(e.target.value)}
                      className={`w-full px-3 py-2 rounded-xl text-xs font-semibold border ${
                        isDarkTheme 
                          ? 'bg-slate-900 border-slate-700 text-white focus:border-amber-500' 
                          : 'bg-white border-slate-300 text-slate-900 focus:border-amber-500'
                      } focus:outline-none focus:ring-1 focus:ring-amber-500`}
                    />
                    {/* Quick selection chips */}
                    <div className="flex items-center gap-1.5 flex-wrap pt-1">
                      {QUICK_PURPOSE_OPTIONS.map((opt) => (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => setFormRecipient(opt)}
                          className="px-2 py-0.5 rounded-md bg-amber-100 hover:bg-amber-200 text-amber-900 text-[10px] font-medium transition cursor-pointer"
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-slate-500" />
                      <span>दिनांक व समय (Date & Time)</span>
                    </label>
                    <input
                      type="text"
                      value={formDateTime}
                      onChange={(e) => setFormDateTime(e.target.value)}
                      placeholder="YYYY-MM-DD HH:mm"
                      className={`w-full px-3 py-2 rounded-xl text-xs font-mono border ${
                        isDarkTheme 
                          ? 'bg-slate-900 border-slate-700 text-white' 
                          : 'bg-white border-slate-300 text-slate-900'
                      } focus:outline-none focus:ring-1 focus:ring-amber-500`}
                    />
                  </div>
                </div>

                {/* Denomination Note Inputs: ₹2000 to ₹1 */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-300">
                    <span>निकाले जाने वाले नोटों की संख्या (Enter Note Counts):</span>
                    <span className="text-[11px] text-slate-500 font-normal">
                      नोट: उपलब्ध संख्या से अधिक दर्ज नहीं किया जा सकता
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2.5">
                    {STANDARD_DENOMINATIONS.map((val) => {
                      const avail = vaultSummary.breakdown.find((b) => b.value === val)?.remainingCount || 0;
                      const hasAvail = avail > 0;
                      const valError = currentFormCalc.errors[val];

                      return (
                        <div 
                          key={val} 
                          className={`p-2.5 rounded-xl border transition ${
                            valError 
                              ? 'bg-rose-50 border-rose-300 ring-1 ring-rose-500' 
                              : hasAvail 
                              ? isDarkTheme ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200' 
                              : 'bg-slate-100/70 border-slate-200 opacity-60'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-mono font-black text-xs text-amber-700 dark:text-amber-400">
                              ₹{val}
                            </span>
                            <span className="text-[10px] font-mono text-slate-500">
                              उपलब्ध: <strong>{avail}</strong>
                            </span>
                          </div>

                          <div className="relative">
                            <input
                              type="number"
                              min="0"
                              max={avail}
                              placeholder="0"
                              disabled={!hasAvail}
                              value={formNotes[val]}
                              onChange={(e) => {
                                const valStr = e.target.value;
                                setFormNotes((prev) => ({ ...prev, [val]: valStr }));
                              }}
                              className={`w-full px-2.5 py-1.5 rounded-lg font-mono text-sm font-bold text-right border ${
                                valError
                                  ? 'border-rose-400 text-rose-700 bg-rose-50/50'
                                  : isDarkTheme 
                                  ? 'bg-slate-950 border-slate-700 text-white focus:border-amber-400' 
                                  : 'bg-slate-50 border-slate-300 text-slate-900 focus:border-amber-500'
                              } focus:outline-none focus:ring-1`}
                            />
                          </div>

                          {valError ? (
                            <div className="text-[9px] text-rose-600 font-bold mt-1 leading-tight">
                              {valError}
                            </div>
                          ) : formNotes[val] && parseInt(formNotes[val], 10) > 0 ? (
                            <div className="text-[10px] font-mono font-bold text-emerald-600 text-right mt-1">
                              = ₹{formatINR(parseInt(formNotes[val], 10) * val)}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Form Total Calculation & Submit Bar */}
                <div className={`p-3.5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                  isDarkTheme ? 'bg-slate-900 border-slate-800' : 'bg-amber-100/50 border-amber-200'
                }`}>
                  <div className="flex items-center gap-3">
                    <div className="text-xs">
                      <span className="text-slate-500 block">इस निकासी का कुल योग:</span>
                      <span className="font-mono font-black text-sm text-slate-900 dark:text-white">
                        {currentFormCalc.formTotalNotes} नोट • ₹{formatINR(currentFormCalc.formTotalAmount)}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 justify-end">
                    <button
                      type="button"
                      onClick={() => setIsWithdrawalFormOpen(false)}
                      className="px-3.5 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-semibold transition cursor-pointer"
                    >
                      रद्द करें
                    </button>
                    <button
                      type="submit"
                      disabled={!currentFormCalc.canSubmit}
                      className="px-5 py-2 rounded-xl bg-gradient-to-r from-amber-600 to-rose-600 hover:from-amber-500 hover:to-rose-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold shadow-md transition cursor-pointer active:scale-95"
                    >
                      💾 निकासी दर्ज करें (Record Outward)
                    </button>
                  </div>
                </div>
              </form>
            )}

            {/* WITHDRAWAL LOGS HISTORY */}
            {withdrawals.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-300">
                  <span className="flex items-center gap-1.5">
                    <History className="w-3.5 h-3.5 text-amber-600" />
                    <span>आज की दर्ज निकासी सूचि ({withdrawals.length} निकासी):</span>
                  </span>
                  <span className="font-mono text-rose-600 dark:text-rose-400">
                    कुल निकाली गई राशि: -₹{formatINR(vaultSummary.withdrawnTotalAmount)} ({vaultSummary.withdrawnTotalNotes} नोट)
                  </span>
                </div>

                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {withdrawals.map((w) => (
                    <div 
                      key={w.id}
                      className={`p-3 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 transition ${
                        isDarkTheme ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-50 border-slate-200'
                      }`}
                    >
                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/40 text-[10px] font-bold">
                            {w.recipientOrPurpose}
                          </span>
                          <span className="text-[11px] text-slate-500 font-mono">
                            {w.dateTime}
                          </span>
                          <span className="text-[10px] text-slate-400">
                            दर्जकर्ता: <strong>{w.withdrawnBy || 'Admin'}</strong>
                          </span>
                        </div>

                        {/* Breakdown badges */}
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {STANDARD_DENOMINATIONS.map((val) => {
                            const cnt = w.notesBreakdown?.[val];
                            if (!cnt || cnt <= 0) return null;
                            return (
                              <span 
                                key={val}
                                className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300"
                              >
                                ₹{val} × {cnt}
                              </span>
                            );
                          })}
                        </div>
                      </div>

                      <div className="flex items-center gap-3 self-end sm:self-auto shrink-0">
                        <div className="text-right">
                          <span className="font-mono font-black text-rose-600 dark:text-rose-400 text-sm block">
                            -₹{formatINR(w.totalAmount)}
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono">
                            {w.totalNotes} नोट
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleDeleteWithdrawal(w.id)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition cursor-pointer"
                          title="यह निकासी हटाएं"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* =====================================================================
                SECTION C: REMAINING VAULT BALANCE (तिजोरी में शेष शुद्ध नोट व कैश)
            ===================================================================== */}
            <div 
              id="remaining-vault-balance-card"
              className={`p-4 sm:p-5 rounded-2xl border ${
                isDarkTheme 
                  ? 'bg-gradient-to-br from-indigo-950/90 via-slate-900 to-slate-950 border-indigo-500/40 shadow-xl' 
                  : 'bg-gradient-to-br from-indigo-50/90 via-white to-emerald-50/70 border-indigo-200 shadow-sm'
              } space-y-4`}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-indigo-200/50 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold shadow-xs shrink-0">
                    <Building2 className="w-5 h-5 stroke-[2.2]" />
                  </div>
                  <div>
                    <h4 className="text-sm sm:text-base font-black text-indigo-950 dark:text-indigo-200 flex items-center gap-2">
                      <span>🏛️ तिजोरी में शेष शुद्ध नोट व कैश</span>
                      <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                        (Remaining Vault Balance)
                      </span>
                    </h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      इनवर्ड जमा में से सभी निकासी घटाने के बाद तिजोरी में उपलब्ध शुद्ध नोट
                    </p>
                  </div>
                </div>

                {/* Share Vault Report via WhatsApp / Copy */}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCopyVaultReport}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-100 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 text-xs font-semibold shadow-2xs transition active:scale-95 cursor-pointer"
                    title="तिजोरी रिपोर्ट कॉपी करें"
                  >
                    {vaultCopied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{vaultCopied ? 'Copied!' : 'कॉपी करें'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleWhatsAppVaultReport}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#25D366] hover:bg-[#20bd5a] text-slate-950 text-xs font-bold shadow-2xs transition active:scale-95 cursor-pointer"
                    title="WhatsApp पर तिजोरी शेष रिपोर्ट भेजें"
                  >
                    <Share2 className="w-3.5 h-3.5" />
                    <span>WhatsApp रिपोर्ट</span>
                  </button>
                </div>
              </div>

              {/* High-Level Net Balance Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* 1. Total Inward */}
                <div className={`p-3.5 rounded-xl border ${
                  isDarkTheme ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-2xs'
                }`}>
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                    कुल इनवर्ड (Total Inward)
                  </span>
                  <div className="flex items-baseline justify-between mt-1">
                    <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400 text-base sm:text-lg">
                      ₹{formatINR(vaultSummary.inwardTotalAmount)}
                    </span>
                    <span className="font-mono text-xs text-slate-500">
                      {vaultSummary.inwardTotalNotes} नोट
                    </span>
                  </div>
                </div>

                {/* 2. Total Outward Withdrawn */}
                <div className={`p-3.5 rounded-xl border ${
                  isDarkTheme ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-2xs'
                }`}>
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                    कुल निकासी (Total Outward)
                  </span>
                  <div className="flex items-baseline justify-between mt-1">
                    <span className="font-mono font-bold text-rose-600 dark:text-rose-400 text-base sm:text-lg">
                      -₹{formatINR(vaultSummary.withdrawnTotalAmount)}
                    </span>
                    <span className="font-mono text-xs text-slate-500">
                      {vaultSummary.withdrawnTotalNotes} नोट
                    </span>
                  </div>
                </div>

                {/* 3. Net Remaining Vault Cash */}
                <div className={`p-3.5 rounded-xl border ${
                  isDarkTheme 
                    ? 'bg-indigo-950/80 border-indigo-500/50 text-indigo-200' 
                    : 'bg-indigo-100/60 border-indigo-300 text-indigo-950 shadow-2xs'
                }`}>
                  <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider block">
                    तिजोरी में शुद्ध शेष (Net Remaining)
                  </span>
                  <div className="flex items-baseline justify-between mt-1">
                    <span className="font-mono font-black text-indigo-700 dark:text-indigo-300 text-lg sm:text-xl">
                      ₹{formatINR(vaultSummary.netRemainingCash)}
                    </span>
                    <span className="font-mono font-bold text-xs text-indigo-700 dark:text-indigo-300">
                      {vaultSummary.netRemainingNotes} नोट
                    </span>
                  </div>
                </div>
              </div>

              {/* Denomination Breakup Table: Original - Withdrawn = Remaining */}
              <div className="space-y-2">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
                  प्रत्येक नोट का शुद्ध शेष विवरण (Denomination-wise Remaining):
                </span>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5">
                  {vaultSummary.breakdown.map((item) => {
                    const hasActivity = item.inwardCount > 0 || item.withdrawnCount > 0;
                    if (!showAllNotes && !hasActivity) return null;

                    return (
                      <div 
                        key={item.value}
                        className={`p-3 rounded-xl border flex flex-col justify-between transition ${
                          item.remainingCount > 0 
                            ? isDarkTheme ? 'bg-slate-900 border-indigo-500/30' : 'bg-white border-indigo-200 shadow-2xs'
                            : 'bg-slate-100/60 border-slate-200 opacity-60'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-mono font-black text-sm text-indigo-700 dark:text-indigo-400">
                            ₹{item.value}
                          </span>
                          <span className={`font-mono font-black text-sm ${
                            item.remainingCount > 0 ? 'text-indigo-900 dark:text-indigo-200' : 'text-slate-400'
                          }`}>
                            ₹{formatINR(item.remainingAmount)}
                          </span>
                        </div>

                        {/* Calculation Equation */}
                        <div className="mt-2 pt-1.5 border-t border-slate-200 dark:border-slate-800 text-[11px] font-mono flex items-center justify-between text-slate-600 dark:text-slate-400">
                          <span>
                            {item.inwardCount} - {item.withdrawnCount} =
                          </span>
                          <span className="font-bold text-indigo-600 dark:text-indigo-400">
                            शेष {item.remainingCount} नोट
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DailyConsolidatedDenominationSummary;
