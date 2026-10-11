import React, { useState, useEffect, useMemo } from 'react';
import { 
  FileSpreadsheet, 
  Printer, 
  ArrowLeft, 
  Phone, 
  Download, 
  Copy, 
  Check, 
  MessageCircle, 
  RefreshCw, 
  Receipt,
  ArrowUpDown,
  Trash2,
  RotateCcw,
  ShieldCheck
} from 'lucide-react';
import { PublicRiderStatement } from '../types';
import { formatINR, formatDateDisplay, formatPhoneNumber, getCleanPhoneDigits } from '../utils/formatters';
import { fetchPublicRiderStatement } from '../services/firestoreSync';
import { generateStatementUrl } from '../services/smsService';
import { loadRidersFromStorage, loadDeliveriesFromStorage, loadSettlementsFromStorage } from '../utils/storage';
import { calculateRiderLedger } from '../utils/ledgerCalculation';
import type { UnifiedTransactionItem } from '../utils/ledgerCalculation';

export type { UnifiedTransactionItem };

export interface RiderLedgerStatementProps {
  riderId?: string;
  initialStatement?: PublicRiderStatement | null;
  onBackToApp?: () => void;
  userId?: string;
  isAdmin?: boolean;
  onDeleteAdvance?: (advId: string) => Promise<void>;
  onDeleteIncentive?: (incId: string) => Promise<void>;
  onResetAccount?: () => Promise<void>;
}

export const RiderLedgerStatement: React.FC<RiderLedgerStatementProps> = ({
  riderId: propRiderId,
  initialStatement = null,
  onBackToApp,
  isAdmin = false,
  onDeleteAdvance,
  onDeleteIncentive,
  onResetAccount,
}) => {
  // Extract or resolve riderId from prop or window location (hash or search params)
  const resolvedRiderId = useMemo(() => {
    if (propRiderId && propRiderId.trim()) return decodeURIComponent(propRiderId).trim();
    if (typeof window !== 'undefined') {
      const search = window.location.search || '';
      const params = new URLSearchParams(search);
      const queryId = params.get('statement') || params.get('rider') || params.get('riderId') || params.get('ledger') || params.get('riderStatement');
      if (queryId) return decodeURIComponent(queryId).trim();

      const hash = window.location.hash || '';
      if (hash.includes('statement')) {
        const match = hash.match(/statement[\/=]([^\/?#]+)/i);
        if (match && match[1]) return decodeURIComponent(match[1]).trim();
        const parts = hash.split(/statement[\/=]/i);
        if (parts.length > 1 && parts[1]) {
          const raw = parts[1].split(/[?#&]/)[0];
          if (raw) return decodeURIComponent(raw).trim();
        }
      }
      if (hash.includes('ledger')) {
        const match = hash.match(/ledger[\/=]([^\/?#]+)/i);
        if (match && match[1]) return decodeURIComponent(match[1]).trim();
      }

      const pathname = window.location.pathname || '';
      if (pathname.includes('/statement/')) {
        const part = pathname.split('/statement/')[1]?.split('?')[0]?.split('#')[0];
        if (part) return decodeURIComponent(part).replace(/\/+$/, '').trim();
      }
      if (pathname.includes('/ledger/')) {
        const part = pathname.split('/ledger/')[1]?.split('?')[0]?.split('#')[0];
        if (part) return decodeURIComponent(part).replace(/\/+$/, '').trim();
      }
    }
    return '';
  }, [propRiderId]);

  // Initial local cached statement if available for instant display
  const [statement, setStatement] = useState<PublicRiderStatement | null>(() => {
    if (initialStatement) return initialStatement;
    if (typeof window !== 'undefined' && resolvedRiderId) {
      try {
        const cachedRiders = loadRidersFromStorage();
        const localRider = (cachedRiders || []).find((r) => r && (r.id === resolvedRiderId || r.phone === resolvedRiderId));
        if (localRider) {
          const cachedDeliveries = loadDeliveriesFromStorage(cachedRiders);
          const cachedSettlements = loadSettlementsFromStorage();
          return {
            riderId: localRider.id || resolvedRiderId,
            riderName: localRider.name || 'कूरियर डिलीवरी राइडर',
            riderPhone: localRider.phone || '',
            vehicleType: localRider.vehicleType || 'Bike',
            hubName: 'सरायकेला कूरियर डिलीवरी हब',
            hubSignature: 'सरायकेला कूरियर डिलीवरी हब',
            totalAdvance: typeof localRider.totalAdvance === 'number' ? localRider.totalAdvance : 0,
            totalIncentive: typeof localRider.totalIncentive === 'number' ? localRider.totalIncentive : 0,
            advances: Array.isArray(localRider.advances) ? localRider.advances : [],
            incentives: Array.isArray(localRider.incentives) ? localRider.incentives : [],
            salaries: (cachedSettlements || [])
              .filter((s) => s && s.riderId === localRider.id)
              .map((s) => ({
                id: s.id,
                startDate: s.startDate,
                endDate: s.endDate,
                totalParcels: s.totalParcels || 0,
                baseAmount: s.baseAmount || 0,
                incentiveAmount: s.incentiveAmount || 0,
                grossTotal: s.grossTotal || 0,
                advanceAmount: s.advanceAmount || 0,
                netTotal: s.netTotal || 0,
                paidAt: s.paidAt,
                status: s.status || 'PAID',
              })),
            recentDeliveries: (cachedDeliveries || [])
              .filter((d) => d && d.riderId === localRider.id)
              .slice(0, 30),
            updatedAt: new Date().toISOString(),
          };
        }
      } catch {}
    }
    return null;
  });

  const [loading, setLoading] = useState<boolean>(!initialStatement && !statement);
  const [copiedLink, setCopiedLink] = useState(false);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc'); // Default: 'desc' = Current to Oldest (Newest at top)
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  };

  // Sync state if initialStatement updates from parent
  useEffect(() => {
    if (initialStatement) {
      setStatement(initialStatement);
      setLoading(false);
    }
  }, [initialStatement]);

  // Keyboard Escape and Mobile Hardware Back listeners
  useEffect(() => {
    if (!onBackToApp) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onBackToApp();
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    const historyToken = `khatabook-${Date.now()}`;
    window.history.pushState({ khatabookModal: historyToken }, '');
    const handlePopState = () => {
      onBackToApp();
    };
    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('popstate', handlePopState);
    };
  }, [onBackToApp]);

  // Fetch statement data from Firestore if not provided or to refresh live
  useEffect(() => {
    let isMounted = true;
    if (resolvedRiderId) {
      if (!statement) setLoading(true);
      fetchPublicRiderStatement(resolvedRiderId)
        .then((data) => {
          if (isMounted) {
            if (data) {
              setStatement(data);
            }
            setLoading(false);
          }
        })
        .catch((err) => {
          console.error('Failed to load statement from Firestore:', err);
          if (isMounted) setLoading(false);
        });
    } else {
      setLoading(false);
    }
    return () => {
      isMounted = false;
    };
  }, [resolvedRiderId]);

  // Statement URL strictly resolved to production Vercel domain or current vercel.app origin
  const baseUrl = typeof window !== 'undefined' && window.location?.hostname?.includes('vercel.app')
    ? window.location.origin
    : 'https://courier-rider-payout.vercel.app';
  const statementUrl = `${baseUrl}/#/statement/${encodeURIComponent((resolvedRiderId || statement?.riderId || '').trim())}`;

  const handleCopyLink = () => {
    if (statementUrl) {
      navigator.clipboard.writeText(statementUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  // Compile Transactions & Simple Khatabook Math via calculateRiderLedger
  const { 
    timelineRows, 
    totalPaidToRider, 
    totalSettledOrEarned, 
    netBalance, 
    balanceStatus,
    balanceLabel,
  } = useMemo(() => {
    return calculateRiderLedger(statement, sortOrder);
  }, [statement, sortOrder]);

  // Admin Actions: Delete Row
  const handleDeleteRow = async (row: UnifiedTransactionItem) => {
    if (!isAdmin) return;
    const itemAmount = row.paidToRider || row.settledOrEarned;
    const confirmPrompt = `क्या आप इसे हटाना चाहते हैं? (${row.title} - ₹${itemAmount})`;

    let confirmed = true;
    try {
      if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
        confirmed = window.confirm(confirmPrompt);
      }
    } catch {
      confirmed = true;
    }
    if (!confirmed) return;

    setActionInProgress(row.id);
    try {
      if (row.type === 'advance' && onDeleteAdvance) {
        await onDeleteAdvance(row.originalId);
        // Optimistic state update
        setStatement((prev) => {
          if (!prev) return null;
          const updatedAdvances = (prev.advances || []).filter(
            (a) => a.id !== row.originalId && `adv-${a.id}` !== row.id
          );
          const newTotal = updatedAdvances.reduce((sum, a) => sum + (Number(a.amount) || 0), 0);
          return {
            ...prev,
            advances: updatedAdvances,
            totalAdvance: newTotal,
          };
        });
        showToast('एडवांस एंट्री सफलतापूर्वक हटाई गई।');
      } else if (row.type === 'incentive' && onDeleteIncentive) {
        await onDeleteIncentive(row.originalId);
        // Optimistic state update
        setStatement((prev) => {
          if (!prev) return null;
          const updatedIncentives = (prev.incentives || []).filter(
            (i) => i.id !== row.originalId && `inc-${i.id}` !== row.id
          );
          const newTotal = updatedIncentives.reduce((sum, i) => sum + (Number(i.amount) || 0), 0);
          return {
            ...prev,
            incentives: updatedIncentives,
            totalIncentive: newTotal,
          };
        });
        showToast('इंसेंटिव एंट्री सफलतापूर्वक हटाई गई।');
      }
    } catch (err) {
      console.error('Error deleting ledger row:', err);
      showToast('एंट्री हटाने में त्रुटि हुई।');
    } finally {
      setActionInProgress(null);
    }
  };

  // Admin Action: Reset Entire Rider Account (Clear Test Data)
  const handleResetEntireAccount = async () => {
    if (!isAdmin || !statement) return;
    const confirmPrompt = `क्या आप ${statement.riderName} का पूरा खाता रीसेट (Clear Test Data) करना चाहते हैं?\n\nसभी टेस्ट एडवांस और इंसेंटिव डेटा स्थायी रूप से मिटा दिए जाएंगे और बकाया राशि ₹0 हो जाएगी।`;
    if (!window.confirm(confirmPrompt)) return;

    setActionInProgress('reset-all');
    try {
      if (onResetAccount) {
        await onResetAccount();
      }
      setStatement((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          advances: [],
          incentives: [],
          totalAdvance: 0,
          totalIncentive: 0,
        };
      });
      showToast('खाता सफलतापूर्वक रीसेट (₹0) कर दिया गया!');
    } catch (err) {
      console.error('Error resetting account:', err);
      showToast('खाता रीसेट करने में त्रुटि हुई।');
    } finally {
      setActionInProgress(null);
    }
  };

  // Clean CSV Export
  const handleExportCSV = () => {
    if (!statement) return;
    let csvContent = 'data:text/csv;charset=utf-8,';

    csvContent += `KHATABOOK STATEMENT - ${statement.riderName}\n`;
    csvContent += `Hub: ${statement.hubName || 'सरायकेला कूरियर डिलीवरी हब'}\n`;
    csvContent += `Phone: +91 ${statement.riderPhone}\n`;
    csvContent += `Net Balance: ${
      balanceStatus === 'rider_due' ? 'Rider Due: Rs. ' + netBalance : balanceStatus === 'payable' ? 'Payable to Rider: Rs. ' + netBalance : 'All Settled: Rs. 0'
    }\n`;
    csvContent += `Generated At: ${new Date().toLocaleDateString('en-IN')}\n\n`;

    csvContent += 'तारीख (Date),विवरण (Details),दिया गया / एडवांस (₹),काटा गया / चुकता (₹)\n';

    timelineRows.forEach((row) => {
      const dateClean = `"${row.formattedDate}"`;
      const detailsClean = `"${row.title.replace(/"/g, '""')}${row.subTitle ? ' - ' + row.subTitle.replace(/"/g, '""') : ''}"`;
      const paidStr = row.paidToRider > 0 ? `${row.paidToRider}` : '0';
      const settledStr = row.settledOrEarned > 0 ? `${row.settledOrEarned}` : '0';
      csvContent += `${dateClean},${detailsClean},${paidStr},${settledStr}\n`;
    });

    csvContent += `\n"कुल योग (TOTALS)","","${totalPaidToRider}","${totalSettledOrEarned}"\n`;
    csvContent += `"अंतिम शेष (FINAL NET BALANCE)","","${
      balanceStatus === 'rider_due' 
        ? 'लेना बाकी: Rs ' + netBalance 
        : balanceStatus === 'payable' 
        ? 'देना बाकी: Rs ' + netBalance 
        : 'पूरा हिसाब चुकता: Rs 0'
    }",""\n`;

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `${statement.riderName.replace(/\s+/g, '_')}_Ledger_Statement.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const cleanDigits = statement ? getCleanPhoneDigits(statement.riderPhone).slice(-10) : '';
  const shareText = statement 
    ? `नमस्ते ${statement.riderName}, आपका कूरियर खाता स्टेटमेंट यहाँ देखें:\n${balanceLabel}\nलिंक: ${statementUrl}` 
    : '';
  const waShareUrl = cleanDigits
    ? `https://wa.me/91${cleanDigits}?text=${encodeURIComponent(shareText)}` 
    : '#';

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-white">
        <RefreshCw className="w-10 h-10 text-emerald-400 animate-spin mb-4" />
        <h2 className="text-xl font-bold">लेजर खाता लोड हो रहा है...</h2>
        <p className="text-slate-400 text-sm mt-1">कृपया प्रतीक्षा करें, राइडर स्टेटमेंट प्राप्त किया जा रहा है।</p>
      </div>
    );
  }

  if (!statement) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-white text-center">
        <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mb-4">
          <FileSpreadsheet className="w-8 h-8" />
        </div>
        <h2 className="text-2xl font-bold text-white">स्टेटमेंट उपलब्ध नहीं है (Statement Not Found)</h2>
        <p className="text-slate-400 text-sm max-w-md mt-2">
          इस राइडर ID के लिए कोई सार्वजनिक लेजर रिकॉर्ड नहीं मिला।
        </p>
        {onBackToApp && (
          <button
            onClick={onBackToApp}
            className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-sm transition cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>ऐप पर वापस जाएं</span>
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col print:bg-white print:text-black">
      {/* Toast Notification */}
      {toastMsg && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-emerald-600 text-white px-4 py-2.5 rounded-xl shadow-2xl text-xs font-bold flex items-center gap-2 animate-in fade-in slide-in-from-top duration-200">
          <Check className="w-4 h-4" />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Top Application Ribbon (Actions & Navigation) */}
      <header className="border-b border-slate-800 bg-slate-900/95 backdrop-blur sticky top-0 z-30 px-3 sm:px-4 py-3 print:hidden">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2.5">
            {onBackToApp && (
              <button
                onClick={onBackToApp}
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white transition cursor-pointer"
                title="मुख्य ऐप पर वापस जाएं"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-600 flex items-center justify-center text-white shadow-md shadow-emerald-900/40">
                <Receipt className="w-5 h-5" />
              </div>
              <div>
                <h1 className="font-bold text-sm sm:text-base text-white flex items-center gap-2">
                  <span>खाता लेजर (Khatabook)</span>
                  {isAdmin ? (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30 font-medium flex items-center gap-1">
                      <ShieldCheck className="w-3 h-3 text-blue-400" />
                      <span>Admin View</span>
                    </span>
                  ) : (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-medium">
                      Read-Only
                    </span>
                  )}
                </h1>
                <p className="text-xs text-slate-400">
                  {statement.hubName || 'सरायकेला कूरियर डिलीवरी हब'}
                </p>
              </div>
            </div>
          </div>

          {/* Action Ribbon Buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Admin-Only Reset Account Button */}
            {isAdmin && (
              <button
                type="button"
                onClick={handleResetEntireAccount}
                disabled={actionInProgress === 'reset-all'}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-950/50 hover:bg-rose-900/80 text-rose-300 hover:text-rose-100 border border-rose-800/60 transition active:scale-95 cursor-pointer text-xs font-bold disabled:opacity-50"
                title="खाता रीसेट करें (Clear Test Data & Set Balance to ₹0)"
              >
                <RotateCcw className={`w-3.5 h-3.5 text-rose-400 ${actionInProgress === 'reset-all' ? 'animate-spin' : ''}`} />
                <span>खाता रीसेट (Clear Test Data)</span>
              </button>
            )}

            <button
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-md shadow-blue-600/30 transition active:scale-95 cursor-pointer"
              title="डाउनलोड पीडीएफ या प्रिंट करें"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Download PDF / Print</span>
            </button>

            <button
              onClick={handleExportCSV}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-200 text-xs font-semibold border border-slate-700 transition active:scale-95 cursor-pointer"
              title="एक्सेल CSV फाइल डाउनलोड करें"
            >
              <Download className="w-3.5 h-3.5 text-emerald-400" />
              <span className="hidden sm:inline">Excel CSV</span>
            </button>

            <button
              onClick={handleCopyLink}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-200 text-xs font-semibold border border-slate-700 transition active:scale-95 cursor-pointer"
              title="सार्वजनिक खाता लिंक कॉपी करें"
            >
              {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-slate-400" />}
              <span>{copiedLink ? 'Copied!' : 'Copy Link'}</span>
            </button>

            <a
              href={waShareUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#25D366] hover:bg-[#20bd5a] text-slate-950 text-xs font-bold transition active:scale-95 shadow cursor-pointer"
              title="WhatsApp पर खाता भेजें"
            >
              <MessageCircle className="w-3.5 h-3.5" />
              <span>WhatsApp</span>
            </a>
          </div>
        </div>
      </header>

      {/* Main Single-Page Container */}
      <main className="max-w-5xl w-full mx-auto p-3.5 sm:p-6 flex-1 space-y-4 print:p-4 print:max-w-none print:space-y-3">
        
        {/* 2. ONE SIMPLE, CLEAN HEADER BAR */}
        {/* Rider Name & Phone + Simple Net Balance in Plain Text (Prints identically) */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-4 print:border print:border-slate-300 print:bg-white print:shadow-none print:p-4">
          {/* Left: Rider Name & Phone */}
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white flex items-center justify-center text-xl font-black shadow-md shrink-0 print:border print:border-indigo-300">
              {statement.riderName.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg sm:text-xl font-black text-white print:text-black">
                  {statement.riderName}
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-700 print:bg-slate-100 print:text-slate-800 print:border-slate-300">
                  {statement.hubName || 'सरायकेला कूरियर हब'}
                </span>
              </div>
              <div className="text-xs text-slate-400 mt-1 flex items-center gap-2 flex-wrap print:text-slate-600">
                <a
                  href={`tel:${cleanDigits}`}
                  className="inline-flex items-center gap-1 font-mono text-slate-300 hover:text-white print:text-slate-800"
                >
                  <Phone className="w-3 h-3 text-blue-400 print:text-slate-600" />
                  <span>+91 {formatPhoneNumber(statement.riderPhone)}</span>
                </a>
                <span>•</span>
                <span className="text-slate-400 print:text-slate-600">
                  {statement.vehicleType || 'Bike'}
                </span>
              </div>
            </div>
          </div>

          {/* Right: Simple Net Balance in Plain Hindi/English */}
          <div className="flex items-center">
            <div className={`w-full sm:w-auto px-4 py-3 rounded-xl border text-sm sm:text-base font-black flex items-center gap-2 shadow-sm ${
              balanceStatus === 'rider_due'
                ? 'bg-rose-950/40 border-rose-500/40 text-rose-300 print:bg-rose-50 print:border-rose-300 print:text-rose-800'
                : balanceStatus === 'payable'
                ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300 print:bg-emerald-50 print:border-emerald-300 print:text-emerald-800'
                : 'bg-slate-800/80 border-slate-700 text-slate-200 print:bg-slate-100 print:border-slate-300 print:text-slate-800'
            }`}>
              <span>{balanceLabel}</span>
            </div>
          </div>
        </div>

        {/* 3. CLEAN KHATABOOK TABLE (EXACT 4 COLUMNS) */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-lg print:border print:border-slate-300 print:bg-white print:shadow-none">
          <div className="p-3.5 sm:p-4 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between flex-wrap gap-2 print:bg-slate-100 print:border-slate-300">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
              <h3 className="text-sm font-bold text-white print:text-black">
                खाता लेजर तालिका (Rider Ledger Sheet)
              </h3>
            </div>
            
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-300 text-[11px] font-medium border border-slate-700 transition cursor-pointer print:hidden"
                title="तारीख के अनुसार क्रम बदलें"
              >
                <ArrowUpDown className="w-3 h-3 text-slate-400" />
                <span>{sortOrder === 'asc' ? 'क्रम: पुराना से नया (Ascending)' : 'क्रम: नया से पुराना (Descending)'}</span>
              </button>
              <span className="text-xs text-slate-400 font-mono">
                कुल एंट्री: <strong className="text-white print:text-black">{timelineRows.length}</strong>
              </span>
            </div>
          </div>

          {timelineRows.length === 0 ? (
            <div className="p-10 text-center text-slate-400 text-xs">
              इस राइडर के लिए अभी तक कोई लेनदेन दर्ज नहीं किया गया है।
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-950 text-slate-300 font-bold sticky top-0 print:bg-slate-200 print:text-black print:border-slate-400">
                    {/* Column 1: तारीख व विवरण (Date & Details) */}
                    <th className="py-3 px-3 sm:px-4 min-w-[280px]">
                      तारीख व विवरण (Date & Details)
                    </th>
                    {/* Column 2: आपने दिया (YOU GAVE ₹) [Red] */}
                    <th className="py-3 px-3 sm:px-4 text-right w-[150px] whitespace-nowrap text-rose-400 print:text-rose-800 bg-rose-950/10 print:bg-transparent">
                      आपने दिया (YOU GAVE ₹)
                    </th>
                    {/* Column 3: बना / मिला (YOU GOT ₹) [Green] */}
                    <th className="py-3 px-3 sm:px-4 text-right w-[150px] whitespace-nowrap text-emerald-400 print:text-emerald-800 bg-emerald-950/10 print:bg-transparent">
                      बना / मिला (YOU GOT ₹)
                    </th>
                    {/* Column 4: एडमिन (Admin delete action - only visible to admin) */}
                    {isAdmin && (
                      <th className="py-3 px-3 sm:px-4 text-center w-[80px] whitespace-nowrap text-slate-400 print:hidden">
                        एडमिन
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80 font-sans print:divide-slate-300">
                  {timelineRows.map((row) => (
                    <tr 
                      key={row.id} 
                      className="hover:bg-slate-850/40 transition print:hover:bg-transparent"
                    >
                      {/* 1. तारीख व विवरण (Date & Details) */}
                      <td className="py-3 px-3 sm:px-4 align-top">
                        <div className="flex items-start gap-2.5">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 mt-0.5 ${
                            row.type === 'advance'
                              ? 'bg-rose-500/15 text-rose-300 border border-rose-500/30'
                              : row.type === 'incentive'
                              ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                              : row.type === 'salary'
                              ? 'bg-blue-500/15 text-blue-300 border border-blue-500/30'
                              : 'bg-slate-800 text-slate-300 border border-slate-700'
                          }`}>
                            {row.type === 'advance' ? 'एडवांस' : row.type === 'incentive' ? 'इंसेंटिव' : row.type === 'salary' ? 'पे-आउट' : 'डिलीवरी'}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-mono text-[11px] font-semibold text-slate-400 print:text-slate-600">
                                {row.formattedDate}
                              </span>
                              <span className="text-slate-600 print:text-slate-400">•</span>
                              <span className="font-bold text-white print:text-black text-xs">
                                {row.title}
                              </span>
                            </div>
                            {row.subTitle && (
                              <div className="text-[11px] text-slate-400 print:text-slate-600 mt-0.5">
                                {row.subTitle}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* 2. आपने दिया (YOU GAVE ₹) [Red] */}
                      <td className="py-3 px-3 sm:px-4 text-right font-mono font-bold bg-rose-950/10 print:bg-transparent align-top whitespace-nowrap">
                        {row.paidToRider > 0 ? (
                          <span className="text-rose-400 print:text-rose-700">
                            +₹{formatINR(row.paidToRider)}
                          </span>
                        ) : (
                          <span className="text-slate-600 print:text-slate-400 font-normal">-</span>
                        )}
                      </td>

                      {/* 3. बना / मिला (YOU GOT ₹) [Green] */}
                      <td className="py-3 px-3 sm:px-4 text-right font-mono font-bold bg-emerald-950/10 print:bg-transparent align-top whitespace-nowrap">
                        {row.settledOrEarned > 0 ? (
                          <span className="text-emerald-400 print:text-emerald-700">
                            -₹{formatINR(row.settledOrEarned)}
                          </span>
                        ) : (
                          <span className="text-slate-600 print:text-slate-400 font-normal">-</span>
                        )}
                      </td>

                      {/* 4. एडमिन (Admin Delete Button 🗑️ - Strictly visible ONLY inside Admin login) */}
                      {isAdmin && (
                        <td className="py-3 px-3 sm:px-4 text-center align-top whitespace-nowrap print:hidden">
                          {(row.type === 'advance' || row.type === 'incentive') && row.originalId !== 'opening-advance' ? (
                            <button
                              type="button"
                              onClick={() => handleDeleteRow(row)}
                              disabled={actionInProgress === row.id}
                              className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition active:scale-90 cursor-pointer disabled:opacity-40"
                              title={`${row.type === 'advance' ? 'एडवांस' : 'इंसेंटिव'} एंट्री हटाएं (Delete Document)`}
                            >
                              <Trash2 className={`w-4 h-4 ${actionInProgress === row.id ? 'animate-pulse text-rose-500' : ''}`} />
                            </button>
                          ) : (
                            <span className="text-slate-600 text-xs">-</span>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>

                {/* Bottom TOTALS Row & Net Status */}
                <tfoot>
                  <tr className="border-t-2 border-slate-700 bg-slate-950 text-xs font-bold font-mono print:bg-slate-200 print:border-slate-400">
                    <td className="py-3.5 px-3 sm:px-4 font-sans font-black text-white print:text-black">
                      कुल योग (Grand Totals)
                    </td>
                    <td className="py-3.5 px-3 sm:px-4 text-right font-black text-rose-400 print:text-rose-700 bg-rose-950/20 print:bg-transparent whitespace-nowrap">
                      ₹{formatINR(totalPaidToRider)}
                    </td>
                    <td className="py-3.5 px-3 sm:px-4 text-right font-black text-emerald-400 print:text-emerald-700 bg-emerald-950/20 print:bg-transparent whitespace-nowrap">
                      ₹{formatINR(totalSettledOrEarned)}
                    </td>
                    {isAdmin && <td className="print:hidden" />}
                  </tr>
                  <tr className="border-t border-slate-800 bg-slate-900/90 text-xs font-bold print:bg-slate-100 print:border-slate-300">
                    <td className="py-3 px-3 sm:px-4 font-sans text-slate-300 print:text-black">
                      अंतिम हिसाब स्थिति (Net Status)
                    </td>
                    <td 
                      colSpan={isAdmin ? 3 : 2} 
                      className={`py-3 px-3 sm:px-4 text-right font-black font-sans text-sm ${
                        balanceStatus === 'rider_due'
                          ? 'text-rose-400 print:text-rose-800'
                          : balanceStatus === 'payable'
                          ? 'text-emerald-400 print:text-emerald-800'
                          : 'text-slate-300 print:text-black'
                      }`}
                    >
                      {balanceLabel}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>

        {/* Printable Official Footer (Only in Print / PDF Mode) */}
        <div className="hidden print:block pt-8 mt-6 border-t border-slate-300 text-xs">
          <div className="flex justify-between items-end">
            <div>
              <p className="text-slate-600 font-sans">
                This is an official computer-generated statement issued by <strong>{statement.hubName}</strong>.
              </p>
              <p className="text-slate-500 font-mono text-[10px] mt-0.5">
                Timestamp: {new Date().toISOString()} • Online Token: {statement.riderId}
              </p>
            </div>
            <div className="text-center w-48">
              <div className="border-b border-slate-800 pb-8"></div>
              <p className="mt-1 font-bold text-slate-800 font-sans">Authorized Hub Signature / Stamp</p>
            </div>
          </div>
        </div>

      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/80 bg-slate-900/60 py-4 px-4 text-center text-xs text-slate-500 print:hidden mt-auto">
        <div className="max-w-5xl mx-auto flex items-center justify-between flex-wrap gap-2">
          <span>
            {statement.hubName || 'सरायकेला कूरियर हब'} • सुरक्षित खाता
          </span>
          <span className="font-mono text-[11px] text-slate-600">
            {statementUrl}
          </span>
        </div>
      </footer>
    </div>
  );
};
