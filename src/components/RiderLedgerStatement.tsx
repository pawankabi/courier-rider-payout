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
  ShieldCheck,
  Pencil,
  X
} from 'lucide-react';
import { PublicRiderStatement, RiderAdvanceEntry } from '../types';
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
  onEditAdvance?: (advId: string, updated: { amount: number; reason: string; date: string }) => Promise<void>;
  onDeleteIncentive?: (incId: string) => Promise<void>;
  onEditIncentive?: (incId: string, updated: { amount: number; reason: string; date: string }) => Promise<void>;
  onResetAccount?: () => Promise<void>;
}

export const RiderLedgerStatement: React.FC<RiderLedgerStatementProps> = ({
  riderId: propRiderId,
  initialStatement = null,
  onBackToApp,
  isAdmin = false,
  onDeleteAdvance,
  onEditAdvance,
  onDeleteIncentive,
  onEditIncentive,
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

  // Admin Edit Advance State
  const [editingAdvanceRow, setEditingAdvanceRow] = useState<UnifiedTransactionItem | null>(null);
  const [editAmount, setEditAmount] = useState<string>('');
  const [editDate, setEditDate] = useState<string>('');
  const [editReason, setEditReason] = useState<string>('');
  const [isSavingEdit, setIsSavingEdit] = useState<boolean>(false);

  // Admin Edit Incentive State
  const [editingIncentiveRow, setEditingIncentiveRow] = useState<UnifiedTransactionItem | null>(null);
  const [editIncAmount, setEditIncAmount] = useState<string>('');
  const [editIncDate, setEditIncDate] = useState<string>('');
  const [editIncReason, setEditIncReason] = useState<string>('');
  const [isSavingIncEdit, setIsSavingIncEdit] = useState<boolean>(false);

  // In-App Confirm Delete Row State (Android WebView safe, zero window.confirm)
  const [deletingRow, setDeletingRow] = useState<UnifiedTransactionItem | null>(null);
  const [isDeletingRow, setIsDeletingRow] = useState<boolean>(false);

  // In-App Confirm Reset Account State (Android WebView safe, zero window.confirm)
  const [showResetConfirm, setShowResetConfirm] = useState<boolean>(false);
  const [isResetting, setIsResetting] = useState<boolean>(false);

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

  // Fetch statement data from Firestore only if initialStatement is NOT provided
  useEffect(() => {
    let isMounted = true;
    if (resolvedRiderId && !initialStatement) {
      setLoading(true);
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
    } else if (initialStatement) {
      setStatement(initialStatement);
      setLoading(false);
    } else {
      setLoading(false);
    }
    return () => {
      isMounted = false;
    };
  }, [resolvedRiderId, initialStatement]);

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
    try {
      window.print();
    } catch (err) {
      console.warn('Native window.print notice:', err);
    }
  };

  const isRider = !isAdmin;

  // Compile Transactions & Simple Khatabook Math via calculateRiderLedger
  const { 
    timelineRows, 
    totalPaidToRider, 
    totalSettledOrEarned, 
    netBalance, 
    balanceStatus,
    balanceLabel,
    adminBalanceLabel,
    riderBalanceLabel,
  } = useMemo(() => {
    return calculateRiderLedger(statement, sortOrder, isRider);
  }, [statement, sortOrder, isRider]);

  // Admin Actions: Delete Row (Android WebView safe, zero window.confirm)
  const handleConfirmDeleteRow = async () => {
    if (!isAdmin || !deletingRow) return;
    const row = deletingRow;
    setIsDeletingRow(true);
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
      setDeletingRow(null);
    } catch (err) {
      console.error('Error deleting ledger row:', err);
      showToast('एंट्री हटाने में त्रुटि हुई।');
    } finally {
      setIsDeletingRow(false);
      setActionInProgress(null);
    }
  };

  // Admin Actions: Edit Advance Row
  const handleStartEditAdvance = (row: UnifiedTransactionItem) => {
    if (!isAdmin) return;
    setEditingAdvanceRow(row);
    setEditAmount(String(row.paidToRider));
    setEditDate(row.rawDate ? row.rawDate.slice(0, 10) : new Date().toISOString().slice(0, 10));
    setEditReason(row.title || '');
  };

  const handleCancelEditAdvance = () => {
    setEditingAdvanceRow(null);
    setEditAmount('');
    setEditDate('');
    setEditReason('');
  };

  const handleSaveEditAdvance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAdvanceRow || !onEditAdvance) return;

    const num = Math.max(0, parseFloat(editAmount) || 0);
    if (num <= 0) {
      showToast('कृपया मान्य एडवांस राशि दर्ज करें।');
      return;
    }

    setIsSavingEdit(true);
    setActionInProgress(editingAdvanceRow.id);
    try {
      await onEditAdvance(editingAdvanceRow.originalId, {
        amount: num,
        reason: editReason.trim() || 'सामान्य एडवांस',
        date: editDate || new Date().toISOString().slice(0, 10),
      });

      // Optimistic update
      setStatement((prev) => {
        if (!prev) return null;
        const exists = (prev.advances || []).some(
          (a) => a.id === editingAdvanceRow.originalId || `adv-${a.id}` === editingAdvanceRow.id
        );
        let updatedAdvances: RiderAdvanceEntry[];
        if (exists) {
          updatedAdvances = (prev.advances || []).map((a) => {
            if (a.id === editingAdvanceRow.originalId || `adv-${a.id}` === editingAdvanceRow.id) {
              return {
                ...a,
                amount: num,
                reason: editReason.trim() || 'सामान्य एडवांस',
                date: editDate || a.date,
              };
            }
            return a;
          });
        } else {
          const newAdv: RiderAdvanceEntry = {
            id: editingAdvanceRow.originalId !== 'prior-settled-advance' ? editingAdvanceRow.originalId : `adv_${Date.now()}`,
            riderId: prev.riderId,
            amount: num,
            reason: editReason.trim() || 'सामान्य एडवांस',
            date: editDate || new Date().toISOString().slice(0, 10),
            runningBalance: num,
            createdAt: new Date().toISOString(),
          };
          updatedAdvances = [newAdv, ...(prev.advances || [])];
        }
        const newTotal = updatedAdvances.reduce((sum, a) => sum + (Number(a.amount) || 0), 0);
        return {
          ...prev,
          advances: updatedAdvances,
          totalAdvance: newTotal,
        };
      });

      showToast('एडवांस एंट्री सफलतापूर्वक अपडेट की गई।');
      handleCancelEditAdvance();
    } catch (err) {
      console.error('Error updating advance in ledger:', err);
      showToast('एडवांस अपडेट करने में त्रुटि हुई।');
    } finally {
      setIsSavingEdit(false);
      setActionInProgress(null);
    }
  };

  // Admin Actions: Edit Incentive Row
  const handleStartEditIncentive = (row: UnifiedTransactionItem) => {
    if (!isAdmin) return;
    setEditingIncentiveRow(row);
    setEditIncAmount(String(row.settledOrEarned));
    setEditIncDate(row.rawDate ? row.rawDate.slice(0, 10) : new Date().toISOString().slice(0, 10));
    setEditIncReason(row.title || '');
  };

  const handleCancelEditIncentive = () => {
    setEditingIncentiveRow(null);
    setEditIncAmount('');
    setEditIncDate('');
    setEditIncReason('');
  };

  const handleSaveEditIncentive = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingIncentiveRow || !onEditIncentive) return;

    const num = Math.max(0, parseFloat(editIncAmount) || 0);
    if (num <= 0) {
      showToast('कृपया मान्य इंसेंटिव राशि दर्ज करें।');
      return;
    }

    setIsSavingIncEdit(true);
    setActionInProgress(editingIncentiveRow.id);
    try {
      await onEditIncentive(editingIncentiveRow.originalId, {
        amount: num,
        reason: editIncReason.trim() || 'इंसेंटिव / बोनस',
        date: editIncDate || new Date().toISOString().slice(0, 10),
      });

      // Optimistic update
      setStatement((prev) => {
        if (!prev) return null;
        const updatedIncentives = (prev.incentives || []).map((i) => {
          if (i.id === editingIncentiveRow.originalId || `inc-${i.id}` === editingIncentiveRow.id) {
            return {
              ...i,
              amount: num,
              reason: editIncReason.trim() || 'इंसेंटिव / बोनस',
              date: editIncDate || i.date,
            };
          }
          return i;
        });
        const newTotal = updatedIncentives.reduce((sum, i) => sum + (Number(i.amount) || 0), 0);
        return {
          ...prev,
          incentives: updatedIncentives,
          totalIncentive: newTotal,
        };
      });

      showToast('इंसेंटिव एंट्री सफलतापूर्वक अपडेट की गई।');
      handleCancelEditIncentive();
    } catch (err) {
      console.error('Error updating incentive in ledger:', err);
      showToast('इंसेंटिव अपडेट करने में त्रुटि हुई।');
    } finally {
      setIsSavingIncEdit(false);
      setActionInProgress(null);
    }
  };

  // Admin Action: Reset Entire Rider Account (In-App Confirm, zero window.confirm)
  const handleConfirmResetAccount = async () => {
    if (!isAdmin || !statement) return;
    setIsResetting(true);
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
      setShowResetConfirm(false);
    } catch (err) {
      console.error('Error resetting account:', err);
      showToast('खाता रीसेट करने में त्रुटि हुई।');
    } finally {
      setIsResetting(false);
      setActionInProgress(null);
    }
  };

  // Clean CSV Export
  const handleExportCSV = () => {
    if (!statement) return;
    let csvContent = 'data:text/csv;charset=utf-8,';

    csvContent += `HISAAB KITAAB STATEMENT - ${statement.riderName}\n`;
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
        ? (isAdmin ? 'लेना बाकी / रिकवरी: Rs ' + netBalance : 'हब में जमा करना बाकी है (आपको हब को देना होगा): Rs ' + netBalance)
        : balanceStatus === 'payable' 
        ? (isAdmin ? 'देना बाकी: Rs ' + netBalance : 'आपको मिलना बाकी है (हब से प्राप्त होगा): Rs ' + netBalance)
        : 'पूरा हिसाब चुकता: Rs 0'
    }",""\n`;

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `${statement.riderName.replace(/\s+/g, '_')}_Hisab_Kitab_Statement.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const cleanDigits = statement ? getCleanPhoneDigits(statement.riderPhone).slice(-10) : '';
  const shareText = statement 
    ? `नमस्ते ${statement.riderName}, आपका हिसाब किताब यहाँ देखें:\n${riderBalanceLabel}\nलिंक: ${statementUrl}` 
    : '';
  const waShareUrl = cleanDigits
    ? `https://wa.me/91${cleanDigits}?text=${encodeURIComponent(shareText)}` 
    : '#';

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex flex-col items-center justify-center p-6 text-slate-800">
        <RefreshCw className="w-10 h-10 text-[#047857] animate-spin mb-4" />
        <h2 className="text-xl font-bold text-slate-900">हिसाब किताब लोड हो रहा है...</h2>
        <p className="text-slate-500 text-sm mt-1">कृपया प्रतीक्षा करें, राइडर स्टेटमेंट प्राप्त किया जा रहा है।</p>
      </div>
    );
  }

  if (!statement) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex flex-col items-center justify-center p-6 text-slate-900 text-center">
        <div className="w-16 h-16 rounded-2xl bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center mb-4 shadow-xs">
          <FileSpreadsheet className="w-8 h-8" />
        </div>
        <h2 className="text-2xl font-bold text-slate-900">स्टेटमेंट उपलब्ध नहीं है (Statement Not Found)</h2>
        <p className="text-slate-500 text-sm max-w-md mt-2">
          इस राइडर ID के लिए कोई सार्वजनिक हिसाब किताब रिकॉर्ड नहीं मिला।
        </p>
        {onBackToApp && (
          <button
            onClick={onBackToApp}
            className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-sm transition cursor-pointer shadow-sm active:scale-95"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>ऐप पर वापस जाएं</span>
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 flex flex-col print:bg-white print:text-black">
      {/* Toast Notification */}
      {toastMsg && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-[#047857] text-white px-4 py-2.5 rounded-xl shadow-xl text-xs font-bold flex items-center gap-2 animate-in fade-in slide-in-from-top duration-200">
          <Check className="w-4 h-4" />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Top Application Ribbon (Actions & Navigation) */}
      <header className="border-b border-slate-200 bg-white sticky top-0 z-30 px-3 sm:px-4 py-3 shadow-xs print:hidden">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2.5">
            {onBackToApp && (
              <button
                onClick={onBackToApp}
                className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition cursor-pointer"
                title="मुख्य ऐप पर वापस जाएं"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-[#047857] to-teal-600 flex items-center justify-center text-white shadow-xs">
                <Receipt className="w-5 h-5" />
              </div>
              <div>
                <h1 className="font-bold text-sm sm:text-base text-slate-900 flex items-center gap-2">
                  <span>हिसाब किताब (Hisab Kitab)</span>
                  {isAdmin ? (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 font-semibold flex items-center gap-1">
                      <ShieldCheck className="w-3 h-3 text-blue-600" />
                      <span>Admin View</span>
                    </span>
                  ) : (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-[#047857] border border-emerald-200 font-semibold">
                      Read-Only
                    </span>
                  )}
                </h1>
                <p className="text-xs text-slate-500 font-medium">
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
                onClick={() => setShowResetConfirm(true)}
                disabled={actionInProgress === 'reset-all'}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-50 hover:bg-red-100 text-[#B91C1C] border border-red-200 transition active:scale-95 cursor-pointer text-xs font-bold disabled:opacity-50"
                title="खाता रीसेट करें (Clear Test Data & Set Balance to ₹0)"
              >
                <RotateCcw className={`w-3.5 h-3.5 text-[#B91C1C] ${actionInProgress === 'reset-all' ? 'animate-spin' : ''}`} />
                <span>खाता रीसेट (Clear Test Data)</span>
              </button>
            )}

            <button
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-xs transition active:scale-95 cursor-pointer"
              title="डाउनलोड पीडीएफ या प्रिंट करें"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Download PDF / Print</span>
            </button>

            <button
              onClick={handleExportCSV}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold border border-slate-300 transition active:scale-95 cursor-pointer shadow-2xs"
              title="एक्सेल CSV फाइल डाउनलोड करें"
            >
              <Download className="w-3.5 h-3.5 text-[#047857]" />
              <span className="hidden sm:inline">Excel CSV</span>
            </button>

            <button
              onClick={handleCopyLink}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold border border-slate-300 transition active:scale-95 cursor-pointer shadow-2xs"
              title="सार्वजनिक हिसाब किताब लिंक कॉपी करें"
            >
              {copiedLink ? <Check className="w-3.5 h-3.5 text-[#047857]" /> : <Copy className="w-3.5 h-3.5 text-slate-500" />}
              <span>{copiedLink ? 'Copied!' : 'Copy Link'}</span>
            </button>

            <a
              href={waShareUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#25D366] hover:bg-[#20bd5a] text-slate-950 text-xs font-bold transition active:scale-95 shadow-xs cursor-pointer"
              title="WhatsApp पर हिसाब किताब भेजें"
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
        <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4 print:border print:border-slate-300 print:bg-white print:shadow-none print:p-4">
          {/* Left: Rider Name & Phone */}
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white flex items-center justify-center text-xl font-black shadow-xs shrink-0 print:border print:border-indigo-300">
              {statement.riderName.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg sm:text-xl font-black text-slate-900 print:text-black">
                  {statement.riderName}
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200 print:bg-slate-100 print:text-slate-800">
                  {statement.hubName || 'सरायकेला कूरियर हब'}
                </span>
              </div>
              <div className="text-xs text-slate-500 mt-1 flex items-center gap-2 flex-wrap print:text-slate-600">
                <a
                  href={`tel:${cleanDigits}`}
                  className="inline-flex items-center gap-1 font-mono text-slate-700 hover:text-blue-600 font-semibold print:text-slate-800"
                >
                  <Phone className="w-3 h-3 text-blue-600 print:text-slate-600" />
                  <span>+91 {formatPhoneNumber(statement.riderPhone)}</span>
                </a>
                <span>•</span>
                <span className="text-slate-500 font-medium print:text-slate-600">
                  {statement.vehicleType || 'Bike'}
                </span>
              </div>
            </div>
          </div>

          {/* Right: Simple Net Balance in Plain Hindi/English */}
          <div className="flex items-center">
            <div className={`w-full sm:w-auto px-4 py-3 rounded-xl border text-sm sm:text-base font-black flex items-center gap-2 shadow-xs ${
              balanceStatus === 'rider_due'
                ? 'bg-red-50 border-red-200 text-[#B91C1C] print:bg-rose-50 print:border-rose-300 print:text-rose-800'
                : balanceStatus === 'payable'
                ? 'bg-emerald-50 border-emerald-200 text-[#047857] print:bg-emerald-50 print:border-emerald-300 print:text-emerald-800'
                : 'bg-slate-100 border-slate-200 text-slate-800 print:bg-slate-100 print:border-slate-300 print:text-slate-800'
            }`}>
              <span>{balanceLabel}</span>
            </div>
          </div>
        </div>

        {/* 3. CLEAN HISAB KITAB TABLE (EXACT 4 COLUMNS) */}
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs print:border print:border-slate-300 print:bg-white print:shadow-none">
          <div className="p-3.5 sm:p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between flex-wrap gap-2 print:bg-slate-100 print:border-slate-300">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-[#047857]" />
              <h3 className="text-sm font-bold text-slate-900 print:text-black">
                हिसाब किताब तालिका (Rider Ledger Sheet)
              </h3>
            </div>
            
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white hover:bg-slate-100 text-slate-700 text-[11px] font-semibold border border-slate-300 transition cursor-pointer print:hidden shadow-2xs"
                title="तारीख के अनुसार क्रम बदलें"
              >
                <ArrowUpDown className="w-3 h-3 text-slate-500" />
                <span>{sortOrder === 'asc' ? 'क्रम: पुराना से नया (Ascending)' : 'क्रम: नया से पुराना (Descending)'}</span>
              </button>
              <span className="text-xs text-slate-500 font-mono font-medium">
                कुल एंट्री: <strong className="text-slate-900 print:text-black">{timelineRows.length}</strong>
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
                  <tr className="border-b border-slate-200 bg-slate-100/70 text-slate-700 font-bold sticky top-0 print:bg-slate-200 print:text-black print:border-slate-400">
                    {/* Column 1: तारीख व विवरण (Date & Details) */}
                    <th className="py-3 px-3 sm:px-4 min-w-[280px]">
                      तारीख व विवरण (Date & Details)
                    </th>
                    {/* Column 2: आपने दिया (YOU GAVE ₹) [Crimson / Maroon #B91C1C] */}
                    <th className="py-3 px-3 sm:px-4 text-right w-[150px] whitespace-nowrap text-[#B91C1C] bg-red-50/50 print:bg-transparent">
                      आपने दिया (YOU GAVE ₹)
                    </th>
                    {/* Column 3: बना / मिला (YOU GOT ₹) [Dark Emerald Green #047857] */}
                    <th className="py-3 px-3 sm:px-4 text-right w-[150px] whitespace-nowrap text-[#047857] bg-emerald-50/50 print:bg-transparent">
                      बना / मिला (YOU GOT ₹)
                    </th>
                    {/* Column 4: एडमिन (Admin delete action - only visible to admin) */}
                    {isAdmin && (
                      <th className="py-3 px-3 sm:px-4 text-center w-[80px] whitespace-nowrap text-slate-500 print:hidden">
                        एडमिन
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-sans print:divide-slate-300">
                  {timelineRows.map((row) => (
                    <tr 
                      key={row.id} 
                      className="hover:bg-slate-50/80 transition print:hover:bg-transparent"
                    >
                      {/* 1. तारीख व विवरण (Date & Details) */}
                      <td className="py-3 px-3 sm:px-4 align-top">
                        <div className="flex items-start gap-2.5">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 mt-0.5 ${
                            row.type === 'advance'
                              ? 'bg-red-50 text-[#B91C1C] border border-red-200'
                              : row.type === 'incentive'
                              ? 'bg-emerald-50 text-[#047857] border border-emerald-200'
                              : row.type === 'salary'
                              ? 'bg-blue-50 text-blue-700 border border-blue-200'
                              : 'bg-slate-100 text-slate-700 border border-slate-200'
                          }`}>
                            {row.type === 'advance' ? 'एडवांस' : row.type === 'incentive' ? 'इंसेंटिव' : row.type === 'salary' ? 'पे-आउट' : 'डिलीवरी'}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-mono text-[11px] font-semibold text-slate-500 print:text-slate-600">
                                {row.formattedDate}
                              </span>
                              <span className="text-slate-300 print:text-slate-400">•</span>
                              <span className="font-bold text-slate-900 print:text-black text-xs">
                                {row.title}
                              </span>
                            </div>
                            {row.subTitle && (
                              <div className="text-[11px] text-slate-500 print:text-slate-600 mt-0.5 leading-relaxed">
                                {row.subTitle}
                              </div>
                            )}

                            {/* PART 2: In-Row Balance Badge directly beneath timestamp & details */}
                            <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                              <span 
                                className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-mono font-bold tracking-tight ${
                                  row.runningBalance < -0.01
                                    ? 'bg-red-50 text-[#B91C1C] border border-red-200'
                                    : row.runningBalance > 0.01
                                    ? 'bg-emerald-50 text-[#047857] border border-emerald-200'
                                    : 'bg-slate-100 text-slate-600 border border-slate-200'
                                }`}
                              >
                                {row.runningBalance < -0.01
                                  ? `देना है: ₹${formatINR(Math.abs(row.runningBalance))}`
                                  : row.runningBalance > 0.01
                                  ? `पाना है: ₹${formatINR(row.runningBalance)}`
                                  : '⚪ Bal. ₹0'}
                              </span>
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* 2. आपने दिया (YOU GAVE ₹) [Crimson / Maroon #B91C1C] */}
                      <td className="py-3 px-3 sm:px-4 text-right font-mono font-bold bg-red-50/25 print:bg-transparent align-top whitespace-nowrap">
                        {row.paidToRider > 0 ? (
                          <span className="text-[#B91C1C]">
                            +₹{formatINR(row.paidToRider)}
                          </span>
                        ) : (
                          <span className="text-slate-300 print:text-slate-400 font-normal">-</span>
                        )}
                      </td>

                      {/* 3. बना / मिला (YOU GOT ₹) [Dark Emerald Green #047857] */}
                      <td className="py-3 px-3 sm:px-4 text-right font-mono font-bold bg-emerald-50/25 print:bg-transparent align-top whitespace-nowrap">
                        {row.settledOrEarned > 0 ? (
                          <span className="text-[#047857]">
                            -₹{formatINR(row.settledOrEarned)}
                          </span>
                        ) : (
                          <span className="text-slate-300 print:text-slate-400 font-normal">-</span>
                        )}
                      </td>

                      {/* 4. एडमिन (Admin Actions - Strictly visible ONLY inside Admin login) */}
                      {isAdmin && (
                        <td className="py-3 px-3 sm:px-4 text-center align-top whitespace-nowrap print:hidden">
                          {(row.type === 'advance' || row.type === 'incentive') && row.originalId !== 'opening-advance' ? (
                            <div className="flex items-center justify-center gap-1">
                              {row.type === 'advance' && onEditAdvance && (
                                <button
                                  type="button"
                                  onClick={() => handleStartEditAdvance(row)}
                                  disabled={actionInProgress === row.id}
                                  className="p-1.5 text-slate-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition active:scale-90 cursor-pointer disabled:opacity-40"
                                  title="एडवांस एडिट करें (Edit Advance)"
                                >
                                  <Pencil className="w-3.5 h-3.5 text-amber-600" />
                                </button>
                              )}
                              {row.type === 'incentive' && onEditIncentive && (
                                <button
                                  type="button"
                                  onClick={() => handleStartEditIncentive(row)}
                                  disabled={actionInProgress === row.id}
                                  className="p-1.5 text-slate-500 hover:text-[#047857] hover:bg-emerald-50 rounded-lg transition active:scale-90 cursor-pointer disabled:opacity-40"
                                  title="इंसेंटिव एडिट करें (Edit Incentive)"
                                >
                                  <Pencil className="w-3.5 h-3.5 text-[#047857]" />
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => setDeletingRow(row)}
                                disabled={actionInProgress === row.id}
                                className="p-1.5 text-slate-500 hover:text-[#B91C1C] hover:bg-red-50 rounded-lg transition active:scale-90 cursor-pointer disabled:opacity-40"
                                title={`${row.type === 'advance' ? 'एडवांस' : 'इंसेंटिव'} एंट्री हटाएं (Delete Document)`}
                              >
                                <Trash2 className={`w-3.5 h-3.5 ${actionInProgress === row.id ? 'animate-pulse text-[#B91C1C]' : ''}`} />
                              </button>
                            </div>
                          ) : (
                            <span className="text-slate-400 text-xs">-</span>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>

                {/* Bottom TOTALS Row & Net Status */}
                <tfoot>
                  <tr className="border-t-2 border-slate-200 bg-slate-50 text-xs font-bold font-mono print:bg-slate-200 print:border-slate-400">
                    <td className="py-3.5 px-3 sm:px-4 font-sans font-black text-slate-900 print:text-black">
                      कुल योग (Grand Totals)
                    </td>
                    <td className="py-3.5 px-3 sm:px-4 text-right font-black text-[#B91C1C] bg-red-50/50 print:bg-transparent whitespace-nowrap">
                      ₹{formatINR(totalPaidToRider)}
                    </td>
                    <td className="py-3.5 px-3 sm:px-4 text-right font-black text-[#047857] bg-emerald-50/50 print:bg-transparent whitespace-nowrap">
                      ₹{formatINR(totalSettledOrEarned)}
                    </td>
                    {isAdmin && <td className="print:hidden" />}
                  </tr>
                  <tr className="border-t border-slate-200 bg-white text-xs font-bold print:bg-slate-100 print:border-slate-300">
                    <td className="py-3 px-3 sm:px-4 font-sans text-slate-700 print:text-black">
                      अंतिम हिसाब स्थिति (Net Status)
                    </td>
                    <td 
                      colSpan={isAdmin ? 3 : 2} 
                      className={`py-3 px-3 sm:px-4 text-right font-black font-sans text-sm ${
                        balanceStatus === 'rider_due'
                          ? 'text-[#B91C1C]'
                          : balanceStatus === 'payable'
                          ? 'text-[#047857]'
                          : 'text-slate-800 print:text-black'
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
      <footer className="border-t border-slate-200 bg-white py-4 px-4 text-center text-xs text-slate-500 print:hidden mt-auto shadow-2xs">
        <div className="max-w-5xl mx-auto flex items-center justify-between flex-wrap gap-2">
          <span className="font-medium text-slate-600">
            {statement.hubName || 'सरायकेला कूरियर हब'} • सुरक्षित हिसाब किताब
          </span>
          <span className="font-mono text-[11px] text-slate-500">
            {statementUrl}
          </span>
        </div>
      </footer>

      {/* Admin Edit Advance Modal */}
      {editingAdvanceRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150 print:hidden">
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl shadow-2xl p-5 sm:p-6 space-y-4 animate-in zoom-in-95 duration-200 text-slate-900">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-amber-50 text-amber-600 border border-amber-200">
                  <Pencil className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm sm:text-base text-slate-900">
                    एडवांस संपादित करें (Edit Advance)
                  </h3>
                  <p className="text-xs text-slate-500">
                    {statement.riderName} • {statement.riderPhone ? `+91 ${statement.riderPhone}` : ''}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleCancelEditAdvance}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEditAdvance} className="space-y-4">
              <div>
                <label className="text-xs text-slate-700 font-bold block mb-1">
                  एडवांस राशि (Amount in ₹) <span className="text-[#B91C1C]">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-slate-400 font-bold text-xs">₹</span>
                  <input
                    type="number"
                    min="1"
                    step="any"
                    value={editAmount}
                    onChange={(e) => setEditAmount(e.target.value)}
                    required
                    placeholder="1000"
                    className="w-full pl-7 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 font-mono font-bold focus:outline-none focus:bg-white focus:border-amber-500 transition"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-700 font-bold block mb-1">
                  दिनांक (Date) <span className="text-[#B91C1C]">*</span>
                </label>
                <input
                  type="date"
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                  required
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 font-mono focus:outline-none focus:bg-white focus:border-amber-500 transition cursor-pointer"
                />
              </div>

              <div>
                <label className="text-xs text-slate-700 font-bold block mb-1">
                  कारण / विवरण (Reason / Purpose)
                </label>
                <input
                  type="text"
                  value={editReason}
                  onChange={(e) => setEditReason(e.target.value)}
                  placeholder="उदा. बाइक मरम्मत, फ्यूल, त्यौहार खर्च"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:bg-white focus:border-amber-500 transition"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={handleCancelEditAdvance}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition cursor-pointer"
                >
                  रद्द करें (Cancel)
                </button>
                <button
                  type="submit"
                  disabled={isSavingEdit}
                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-amber-600 to-[#B91C1C] hover:from-amber-500 hover:to-red-700 text-white text-xs font-bold shadow-md flex items-center gap-1.5 transition active:scale-95 cursor-pointer disabled:opacity-50"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>{isSavingEdit ? 'अपडेट हो रहा है...' : 'सुरक्षित करें (Save Changes)'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Admin Edit Incentive Modal */}
      {editingIncentiveRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150 print:hidden">
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl shadow-2xl p-5 sm:p-6 space-y-4 animate-in zoom-in-95 duration-200 text-slate-900">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-emerald-50 text-[#047857] border border-emerald-200">
                  <Pencil className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm sm:text-base text-slate-900">
                    इंसेंटिव संपादित करें (Edit Incentive)
                  </h3>
                  <p className="text-xs text-slate-500">
                    {statement.riderName} • {statement.riderPhone ? `+91 ${statement.riderPhone}` : ''}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleCancelEditIncentive}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEditIncentive} className="space-y-4">
              <div>
                <label className="text-xs text-slate-700 font-bold block mb-1">
                  इंसेंटिव राशि (Amount in ₹) <span className="text-[#B91C1C]">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-slate-400 font-bold text-xs">₹</span>
                  <input
                    type="number"
                    min="1"
                    step="any"
                    value={editIncAmount}
                    onChange={(e) => setEditIncAmount(e.target.value)}
                    required
                    placeholder="500"
                    className="w-full pl-7 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-[#047857] font-mono font-bold focus:outline-none focus:bg-white focus:border-[#047857] transition"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-700 font-bold block mb-1">
                  दिनांक (Date) <span className="text-[#B91C1C]">*</span>
                </label>
                <input
                  type="date"
                  value={editIncDate}
                  onChange={(e) => setEditIncDate(e.target.value)}
                  required
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 font-mono focus:outline-none focus:bg-white focus:border-[#047857] transition cursor-pointer"
                />
              </div>

              <div>
                <label className="text-xs text-slate-700 font-bold block mb-1">
                  कारण / विवरण (Reason / Purpose)
                </label>
                <input
                  type="text"
                  value={editIncReason}
                  onChange={(e) => setEditIncReason(e.target.value)}
                  placeholder="उदा. त्यौहार बोनस, परफॉर्मेंस इंसेंटिव"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:bg-white focus:border-[#047857] transition"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={handleCancelEditIncentive}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition cursor-pointer"
                >
                  रद्द करें (Cancel)
                </button>
                <button
                  type="submit"
                  disabled={isSavingIncEdit}
                  className="px-5 py-2 rounded-xl bg-[#047857] hover:bg-emerald-700 text-white text-xs font-bold shadow-md flex items-center gap-1.5 transition active:scale-95 cursor-pointer disabled:opacity-50"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>{isSavingIncEdit ? 'अपडेट हो रहा है...' : 'सुरक्षित करें (Save Changes)'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* In-App Confirm Delete Row Modal (Android WebView safe, zero window.confirm) */}
      {deletingRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in print:hidden">
          <div 
            className="w-full max-w-sm bg-white border border-slate-200 rounded-2xl p-5 shadow-2xl space-y-4 animate-in zoom-in-95 text-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-red-50 text-[#B91C1C] border border-red-200">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-slate-900">
                  {deletingRow.type === 'advance' ? 'एडवांस एंट्री हटाएं?' : 'इंसेंटिव एंट्री हटाएं?'}
                </h3>
                <p className="text-xs text-slate-500">यह रिकॉर्ड डेटाबेस से हमेशा के लिए हटा दिया जाएगा।</p>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5 text-xs font-mono">
              <div className="flex justify-between text-slate-700 font-sans">
                <span>राइडर:</span>
                <span className="font-bold text-slate-900">{statement.riderName}</span>
              </div>
              <div className="flex justify-between text-slate-700">
                <span>प्रकार:</span>
                <span className="font-semibold text-amber-700">{deletingRow.type === 'advance' ? 'एडवांस' : 'इंसेंटिव'}</span>
              </div>
              <div className="flex justify-between text-slate-700">
                <span>राशि:</span>
                <span className="font-bold text-[#B91C1C]">
                  ₹{deletingRow.paidToRider || deletingRow.settledOrEarned}
                </span>
              </div>
              <div className="flex justify-between text-slate-500 font-sans">
                <span>विवरण:</span>
                <span className="text-slate-800 truncate max-w-[180px] font-medium">{deletingRow.title}</span>
              </div>
              <div className="flex justify-between text-slate-500">
                <span>दिनांक:</span>
                <span className="text-slate-800 font-medium">{deletingRow.formattedDate}</span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setDeletingRow(null)}
                disabled={isDeletingRow}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition cursor-pointer"
              >
                रद्द करें (Cancel)
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteRow}
                disabled={isDeletingRow}
                className="px-4 py-2 rounded-xl bg-[#B91C1C] hover:bg-red-800 disabled:opacity-50 text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-md"
              >
                {isDeletingRow ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>हटा रहे हैं...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>हाँ, हटाएं (Confirm Delete)</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* In-App Confirm Reset Entire Account Modal (Android WebView safe, zero window.confirm) */}
      {showResetConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in print:hidden">
          <div 
            className="w-full max-w-sm bg-white border border-red-200 rounded-2xl p-5 shadow-2xl space-y-4 animate-in zoom-in-95 text-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-red-50 text-[#B91C1C] border border-red-200">
                <RotateCcw className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-slate-900">खाता पूरा रीसेट करें?</h3>
                <p className="text-xs text-[#B91C1C] font-semibold">Clear Test Data • सेट बकाया ₹0</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              क्या आप <strong>{statement.riderName}</strong> का पूरा खाता रीसेट करना चाहते हैं?
              सभी टेस्ट एडवांस और इंसेंटिव डेटा स्थायी रूप से हटा दिए जाएंगे और कुल बकाया ₹0 हो जाएगा।
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setShowResetConfirm(false)}
                disabled={isResetting}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition cursor-pointer"
              >
                रद्द करें (Cancel)
              </button>
              <button
                type="button"
                onClick={handleConfirmResetAccount}
                disabled={isResetting}
                className="px-4 py-2 rounded-xl bg-[#B91C1C] hover:bg-red-800 disabled:opacity-50 text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-md"
              >
                {isResetting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>रीसेट हो रहा है...</span>
                  </>
                ) : (
                  <>
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>हाँ, रीसेट करें (Confirm Reset)</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
