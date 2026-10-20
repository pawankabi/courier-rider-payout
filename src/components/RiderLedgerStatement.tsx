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
import { calculatePureRiderLedger, UnifiedTransactionItem } from '../utils/pureLedgerEngine';

export type { UnifiedTransactionItem };

export interface RiderLedgerStatementProps {
  riderId?: string;
  initialStatement?: PublicRiderStatement | null;
  settlements?: any[];
  advances?: RiderAdvanceEntry[];
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
  settlements: propSettlements,
  advances: propAdvances,
  onBackToApp,
  isAdmin = false,
  onDeleteAdvance,
  onEditAdvance,
  onDeleteIncentive,
  onEditIncentive,
  onResetAccount,
}) => {
  // Extract or resolve riderId from prop or window location (hash, query, or path)
  const resolvedRiderId = useMemo(() => {
    if (propRiderId && propRiderId.trim()) return decodeURIComponent(propRiderId).trim();
    if (typeof window !== 'undefined') {
      const search = window.location.search || '';
      const params = new URLSearchParams(search);
      const queryId = params.get('statement') || params.get('rider') || params.get('riderId') || params.get('ledger') || params.get('riderStatement');
      if (queryId && queryId !== ':riderId' && queryId !== ':id') return decodeURIComponent(queryId).trim();

      const hash = window.location.hash || '';
      if (hash.includes('statement') || hash.includes('ledger')) {
        const matchRider = hash.match(/(?:statement|ledger)\/rider\/([^\/?#]+)/i);
        if (matchRider && matchRider[1]) {
          const val = decodeURIComponent(matchRider[1]).replace(/\/+$/, '').trim();
          if (val && val !== ':riderId' && val !== ':id') return val;
        }
        const match = hash.match(/(?:statement|ledger)[\/=]([^\/?#]+)/i);
        if (match && match[1] && match[1].toLowerCase() !== 'rider') {
          const val = decodeURIComponent(match[1]).replace(/\/+$/, '').trim();
          if (val && val !== ':riderId' && val !== ':id') return val;
        }
        const parts = hash.split(/(?:statement|ledger)[\/=]/i);
        if (parts.length > 1 && parts[1]) {
          const cleanedPart = parts[1].replace(/^rider\//i, '');
          const raw = cleanedPart.split(/[?#&]/)[0];
          if (raw) {
            const val = decodeURIComponent(raw).replace(/\/+$/, '').trim();
            if (val && val !== ':riderId' && val !== ':id' && val.toLowerCase() !== 'rider') return val;
          }
        }
      }

      const pathname = window.location.pathname || '';
      if (pathname.includes('/statement') || pathname.includes('/ledger')) {
        const matchRider = pathname.match(/\/(?:statement|ledger)\/rider\/([^\/?#]+)/i);
        if (matchRider && matchRider[1]) {
          const val = decodeURIComponent(matchRider[1]).replace(/\/+$/, '').trim();
          if (val && val !== ':riderId' && val !== ':id') return val;
        }
        const match = pathname.match(/\/(?:statement|ledger)\/([^\/?#]+)/i);
        if (match && match[1] && match[1].toLowerCase() !== 'rider') {
          const val = decodeURIComponent(match[1]).replace(/\/+$/, '').trim();
          if (val && val !== ':riderId' && val !== ':id') return val;
        }
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
        const cleanResolved = resolvedRiderId.toLowerCase().trim();
        const localRider = (cachedRiders || []).find((r) => {
          if (!r) return false;
          const rId = (r.id || '').toLowerCase().trim();
          const rPhone = (r.phone || '').trim();
          const rName = (r.name || '').toLowerCase().trim();
          return (
            rId === cleanResolved ||
            rPhone === cleanResolved ||
            rPhone.endsWith(cleanResolved) ||
            rName === cleanResolved ||
            rName.includes(cleanResolved) ||
            cleanResolved.includes(rName)
          );
        });

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
              .filter((s) => s && (s.riderId === localRider.id || (localRider.phone && s.riderPhone === localRider.phone)))
              .map((s) => ({
                id: s.id,
                startDate: s.startDate,
                endDate: s.endDate,
                totalParcels: s.totalParcels || 0,
                baseAmount: s.baseAmount || 0,
                incentiveAmount: s.incentiveAmount || 0,
                grossTotal: s.grossTotal || 0,
                advanceAmount: s.advanceAmount || 0,
                advanceDate: s.advanceDate,
                advanceReason: s.advanceReason,
                netTotal: s.netTotal || 0,
                paidAt: s.paidAt,
                status: s.status || 'PAID',
              })),
            recentDeliveries: (cachedDeliveries || [])
              .filter((d) => d && (d.riderId === localRider.id || (localRider.phone && d.riderPhone === localRider.phone)))
              .slice(0, 100),
            updatedAt: new Date().toISOString(),
          };
        }
      } catch {}
    }
    return null;
  });

  const [loading, setLoading] = useState<boolean>(!initialStatement && !statement);
  const [copiedLink, setCopiedLink] = useState(false);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc'); // Default: 'desc' = Newest at top
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

  // Statement URL strictly resolved to production domain or current host origin
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

  const effectiveSettlements = useMemo(() => {
    if (propSettlements && Array.isArray(propSettlements) && propSettlements.length > 0) {
      return propSettlements;
    }
    if (typeof window !== 'undefined') {
      try {
        return loadSettlementsFromStorage();
      } catch {}
    }
    return [];
  }, [propSettlements]);

  // Gather effective master advances across sources
  const effectiveAdvances = useMemo(() => {
    if (propAdvances && Array.isArray(propAdvances) && propAdvances.length > 0) {
      return propAdvances;
    }
    if (typeof window !== 'undefined') {
      try {
        const cachedRiders = loadRidersFromStorage();
        const allCachedAdvances = (cachedRiders || []).flatMap((r) => r.advances || []);
        if (allCachedAdvances.length > 0) return allCachedAdvances;
      } catch {}
    }
    return statement?.advances || [];
  }, [propAdvances, statement?.advances]);

  // Pure Arithmetic Accounting Calculation via pureLedgerEngine
  const { 
    timelineRows, 
    totalPlus, 
    totalMinus, 
    netBalance, 
    balanceStatus,
    balanceLabel,
    adminBalanceLabel,
    riderBalanceLabel,
  } = useMemo(() => {
    return calculatePureRiderLedger(statement, sortOrder, isRider, effectiveSettlements, effectiveAdvances);
  }, [statement, sortOrder, isRider, effectiveSettlements, effectiveAdvances]);

  // Admin Actions: Delete Row (Android WebView safe, zero window.confirm)
  const handleConfirmDeleteRow = async () => {
    if (!isAdmin || !deletingRow) return;
    const row = deletingRow;
    setIsDeletingRow(true);
    setActionInProgress(row.id);

    try {
      if (row.type === 'advance' && onDeleteAdvance) {
        await onDeleteAdvance(row.originalId);
        showToast('एडवांस सफलतापूर्वक हटा दिया गया');
      } else if (row.type === 'incentive' && onDeleteIncentive) {
        await onDeleteIncentive(row.originalId);
        showToast('इंसेंटिव सफलतापूर्वक हटा दिया गया');
      }

      setStatement((prev) => {
        if (!prev) return null;
        if (row.type === 'advance') {
          return {
            ...prev,
            advances: (prev.advances || []).filter((a) => a.id !== row.originalId && `adv-${a.id}` !== row.id),
          };
        }
        if (row.type === 'incentive') {
          return {
            ...prev,
            incentives: (prev.incentives || []).filter((i) => i.id !== row.originalId && `inc-${i.id}` !== row.id),
          };
        }
        return prev;
      });
      setDeletingRow(null);
    } catch (err: any) {
      showToast(`हटाने में त्रुटि: ${err.message || 'अज्ञात समस्या'}`);
    } finally {
      setIsDeletingRow(false);
      setActionInProgress(null);
    }
  };

  // Admin Actions: Start Edit Advance
  const handleStartEditAdvance = (row: UnifiedTransactionItem) => {
    setEditingAdvanceRow(row);
    setEditAmount(row.minusAmount ? String(row.minusAmount) : '');
    setEditDate(row.rawDate || new Date().toISOString().split('T')[0]);
    setEditReason(row.title || 'एडवांस भुगतान');
  };

  // Admin Actions: Save Edit Advance
  const handleSaveAdvanceEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAdvanceRow || !onEditAdvance) return;

    const numAmount = parseFloat(editAmount);
    if (isNaN(numAmount) || numAmount <= 0) {
      showToast('कृपया वैध राशि दर्ज करें');
      return;
    }

    setIsSavingEdit(true);
    setActionInProgress(editingAdvanceRow.id);

    try {
      await onEditAdvance(editingAdvanceRow.originalId, {
        amount: numAmount,
        reason: editReason.trim() || 'एडवांस भुगतान',
        date: editDate || new Date().toISOString().split('T')[0],
      });

      setStatement((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          advances: (prev.advances || []).map((a) => {
            if (a.id === editingAdvanceRow.originalId || `adv-${a.id}` === editingAdvanceRow.id) {
              return {
                ...a,
                amount: numAmount,
                reason: editReason.trim() || 'एडवांस भुगतान',
                date: editDate || a.date,
              };
            }
            return a;
          }),
        };
      });

      showToast('एडवांस सफलतापूर्वक अपडेट किया गया');
      setEditingAdvanceRow(null);
    } catch (err: any) {
      showToast(`अपडेट में त्रुटि: ${err.message || 'अज्ञात समस्या'}`);
    } finally {
      setIsSavingEdit(false);
      setActionInProgress(null);
    }
  };

  // Admin Actions: Start Edit Incentive
  const handleStartEditIncentive = (row: UnifiedTransactionItem) => {
    setEditingIncentiveRow(row);
    setEditIncAmount(row.plusAmount ? String(row.plusAmount) : '');
    setEditIncDate(row.rawDate || new Date().toISOString().split('T')[0]);
    setEditIncReason(row.title || 'इंसेंटिव / बोनस');
  };

  // Admin Actions: Save Edit Incentive
  const handleSaveIncentiveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingIncentiveRow || !onEditIncentive) return;

    const numAmount = parseFloat(editIncAmount);
    if (isNaN(numAmount) || numAmount <= 0) {
      showToast('कृपया वैध राशि दर्ज करें');
      return;
    }

    setIsSavingIncEdit(true);
    setActionInProgress(editingIncentiveRow.id);

    try {
      await onEditIncentive(editingIncentiveRow.originalId, {
        amount: numAmount,
        reason: editIncReason.trim() || 'इंसेंटिव / बोनस',
        date: editIncDate || new Date().toISOString().split('T')[0],
      });

      setStatement((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          incentives: (prev.incentives || []).map((i) => {
            if (i.id === editingIncentiveRow.originalId || `inc-${i.id}` === editingIncentiveRow.id) {
              return {
                ...i,
                amount: numAmount,
                reason: editIncReason.trim() || 'इंसेंटिव / बोनस',
                date: editIncDate || i.date,
              };
            }
            return i;
          }),
        };
      });

      showToast('इंसेंटिव सफलतापूर्वक अपडेट किया गया');
      setEditingIncentiveRow(null);
    } catch (err: any) {
      showToast(`अपडेट में त्रुटि: ${err.message || 'अज्ञात समस्या'}`);
    } finally {
      setIsSavingIncEdit(false);
      setActionInProgress(null);
    }
  };

  // Admin Actions: Confirm Reset Account (Android WebView safe, zero window.confirm)
  const handleConfirmResetAccount = async () => {
    if (!isAdmin || !onResetAccount) return;
    setIsResetting(true);
    try {
      await onResetAccount();
      setStatement((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          advances: [],
          incentives: [],
          salaries: [],
          recentDeliveries: [],
          totalAdvance: 0,
          totalIncentive: 0,
        };
      });
      showToast('खाता सफलतापूर्वक रीसेट (शून्य) कर दिया गया');
      setShowResetConfirm(false);
    } catch (err: any) {
      showToast(`रीसेट में त्रुटि: ${err.message || 'अज्ञात समस्या'}`);
    } finally {
      setIsResetting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4">
        <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4" />
        <h3 className="text-white text-base font-bold font-sans">
          राइडर खाता बही लोड हो रहा है...
        </h3>
        <p className="text-slate-400 text-xs mt-1 font-sans">
          कृपया प्रतीक्षा करें...
        </p>
      </div>
    );
  }

  if (!statement) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4">
        <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 max-w-md w-full text-center space-y-4 shadow-xl">
          <div className="w-12 h-12 bg-red-500/10 text-red-400 rounded-full flex items-center justify-center mx-auto">
            <X className="w-6 h-6" />
          </div>
          <h3 className="text-white text-base font-bold font-sans">
            राइडर खाता विवरण नहीं मिला
          </h3>
          <p className="text-slate-400 text-xs leading-relaxed font-sans">
            यह खाता लिंक अमान्य हो सकता है या खाता अभी तक सेट नहीं किया गया है।
          </p>
          {onBackToApp && (
            <button
              type="button"
              onClick={onBackToApp}
              className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer shadow-md"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>मुख्य ऐप पर वापस जाएं</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  const cleanDigits = getCleanPhoneDigits(statement.riderPhone);
  const whatsappShareText = encodeURIComponent(
    `*${statement.riderName} - कूरियर खाता बही*\n` +
    `हब: ${statement.hubName}\n` +
    `स्थिति: ${balanceLabel}\n` +
    `विवरण देखने के लिए लिंक खोलें:\n${statementUrl}`
  );

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans text-slate-800 antialiased print:bg-white print:text-black ledger-printable-root">
      
      {/* Toast Notification */}
      {toastMsg && (
        <div className="fixed top-4 right-4 z-[9999] bg-slate-900 text-white px-4 py-2.5 rounded-xl shadow-2xl text-xs font-semibold flex items-center gap-2 border border-slate-700 animate-in fade-in slide-in-from-top-2 print:hidden">
          <Check className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* 1. TOP STICKY APPLICATION BAR (Hidden in Print) */}
      <header className="sticky top-0 z-40 bg-slate-900 text-white border-b border-slate-800 px-4 py-3 print:hidden shadow-md">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-3">
          {/* Back button & Title */}
          <div className="flex items-center gap-2.5 min-w-0">
            {onBackToApp && (
              <button
                type="button"
                onClick={onBackToApp}
                className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-300 hover:text-white transition active:scale-95 cursor-pointer"
                title="मुख्य ऐप पर वापस जाएं (Esc)"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            )}
            <div className="min-w-0">
              <h1 className="text-sm sm:text-base font-black truncate text-white">
                राइडर खाता बही (Rider Khatabook Ledger)
              </h1>
              <p className="text-[11px] text-slate-400 truncate">
                {statement.riderName} • {statement.hubName || 'सरायकेला कूरियर डिलीवरी हब'}
              </p>
            </div>
          </div>

          {/* Quick Action Buttons */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Native Print / PDF Download Button */}
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition active:scale-95 shadow-xs cursor-pointer"
              title="ब्राउज़र प्रिंट या PDF डाउनलोड करें"
            >
              <Printer className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">PDF डाउनलोड / प्रिंट</span>
              <span className="sm:hidden">प्रिंट</span>
            </button>

            {/* Copy Public Link */}
            <button
              type="button"
              onClick={handleCopyLink}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-slate-700 transition active:scale-95 shadow-xs cursor-pointer"
              title="राइडर के साथ शेयर करने के लिए लिंक कॉपी करें"
            >
              {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">{copiedLink ? 'कॉपी हो गया!' : 'लिंक कॉपी करें'}</span>
              <span className="sm:hidden">{copiedLink ? 'कॉपी!' : 'लिंक'}</span>
            </button>

            {/* WhatsApp Share */}
            <a
              href={`https://wa.me/?text=${whatsappShareText}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#25D366] hover:bg-[#20bd5a] text-slate-950 text-xs font-bold transition active:scale-95 shadow-xs cursor-pointer"
              title="WhatsApp पर हिसाब किताब भेजें"
            >
              <MessageCircle className="w-3.5 h-3.5" />
              <span>WhatsApp</span>
            </a>

            {/* Admin Reset Account */}
            {isAdmin && onResetAccount && (
              <button
                type="button"
                onClick={() => setShowResetConfirm(true)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-red-950/60 hover:bg-red-900 text-red-300 text-xs font-bold border border-red-800/60 transition active:scale-95 shadow-xs cursor-pointer"
                title="खाता रीसेट (Zero Balance)"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span className="hidden md:inline">खाता रीसेट</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-5xl w-full mx-auto p-3.5 sm:p-6 flex-1 space-y-4 print:p-4 print:max-w-none print:space-y-3">
        
        {/* 2. RIDER PROFILE & NET BALANCE HEADER CARD */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4 print:border print:border-slate-300 print:bg-white print:shadow-none print:p-4">
          {/* Left: Rider Profile Details */}
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

          {/* Right: Net Balance Badge in Exact Hindi (Admin vs Rider Contextual) */}
          <div className="flex items-center">
            <div className={`w-full sm:w-auto px-5 py-3.5 rounded-2xl border text-sm sm:text-base font-black flex items-center gap-2.5 shadow-xs ${
              balanceStatus === 'rider_due'
                ? 'bg-red-50 border-red-300 text-[#B91C1C] print:bg-rose-50 print:border-rose-300 print:text-rose-800'
                : balanceStatus === 'payable'
                ? 'bg-emerald-50 border-emerald-300 text-[#047857] print:bg-emerald-50 print:border-emerald-300 print:text-emerald-800'
                : 'bg-slate-100 border-slate-300 text-slate-800 print:bg-slate-100 print:border-slate-300 print:text-slate-800'
            }`}>
              <span className="leading-tight">{balanceLabel}</span>
            </div>
          </div>
        </div>

        {/* 3. CLEAN TRANSACTION AUDIT TABLE */}
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs print:border print:border-slate-300 print:bg-white print:shadow-none print:overflow-visible">
          {/* Table Header Bar */}
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
            <div className="overflow-x-auto print:overflow-visible">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-100 text-slate-700 font-bold sticky top-0 print:static print:bg-slate-200 print:text-black print:border-slate-400">
                    {/* Column 1: तारीख व विवरण (Date & Details) */}
                    <th className="py-3 px-3 sm:px-4 min-w-[260px]">
                      तारीख व विवरण (Date & Details)
                    </th>
                    {/* Column 2: प्रकार (Type) */}
                    <th className="py-3 px-2 sm:px-3 text-center w-[110px] whitespace-nowrap">
                      प्रकार (Type)
                    </th>
                    {/* Column 3: कुल कमाई (+) (Earned / Credit +) [Emerald #047857] */}
                    <th className="py-3 px-3 sm:px-4 text-right w-[140px] whitespace-nowrap text-[#047857] bg-emerald-50/50 print:bg-transparent">
                      कुल कमाई (+)
                    </th>
                    {/* Column 4: कुल एडवांस / कटौती (-) (Advance / Debit -) [Crimson #B91C1C] */}
                    <th className="py-3 px-3 sm:px-4 text-right w-[140px] whitespace-nowrap text-[#B91C1C] bg-red-50/50 print:bg-transparent">
                      कुल एडवांस / कटौती (-)
                    </th>
                    {/* Column 5: चालू बैलेंस (Running Balance) */}
                    <th className="py-3 px-3 sm:px-4 text-right w-[150px] whitespace-nowrap">
                      चालू बैलेंस (Balance)
                    </th>
                    {/* Column 6: एडमिन (Admin Actions) */}
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
                          </div>
                        </div>
                      </td>

                      {/* 2. प्रकार (Type Badge) */}
                      <td className="py-3 px-2 sm:px-3 text-center align-top whitespace-nowrap">
                        <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          row.entryKind === 'PLUS_EARNING'
                            ? 'bg-emerald-50 text-[#047857] border border-emerald-200'
                            : 'bg-red-50 text-[#B91C1C] border border-red-200'
                        }`}>
                          {row.typeLabel || (row.entryKind === 'PLUS_EARNING' ? '(+) पे-आउट' : '(-) एडवांस')}
                        </span>
                      </td>

                      {/* 3. कुल कमाई (+) (Earned / Credit +) [Emerald #047857] */}
                      <td className="py-3 px-3 sm:px-4 text-right font-mono font-bold bg-emerald-50/25 print:bg-transparent align-top whitespace-nowrap">
                        {row.plusAmount > 0 ? (
                          <span className="text-[#047857]">
                            +{formatINR(row.plusAmount)}
                          </span>
                        ) : (
                          <span className="text-slate-300 print:text-slate-400 font-normal">-</span>
                        )}
                      </td>

                      {/* 4. कुल एडवांस / कटौती (-) (Advance / Debit -) [Crimson #B91C1C] */}
                      <td className="py-3 px-3 sm:px-4 text-right font-mono font-bold bg-red-50/25 print:bg-transparent align-top whitespace-nowrap">
                        {row.minusAmount > 0 ? (
                          <span className="text-[#B91C1C]">
                            -{formatINR(row.minusAmount)}
                          </span>
                        ) : (
                          <span className="text-slate-300 print:text-slate-400 font-normal">-</span>
                        )}
                      </td>

                      {/* 5. चालू बैलेंस (Running Balance) */}
                      <td className="py-3 px-3 sm:px-4 text-right align-top whitespace-nowrap font-mono text-xs">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-mono font-bold ${
                          row.runningBalance < -0.01
                            ? 'bg-red-50 text-[#B91C1C] border border-red-200'
                            : row.runningBalance > 0.01
                            ? 'bg-emerald-50 text-[#047857] border border-emerald-200'
                            : 'bg-slate-100 text-slate-700 border border-slate-200'
                        }`}>
                          {row.runningBalanceLabel}
                        </span>
                      </td>

                      {/* 6. एडमिन (Admin Actions - Strictly visible ONLY inside Admin login) */}
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
                  <tr className="border-t-2 border-slate-300 bg-slate-50 text-xs font-bold font-mono print:bg-slate-200 print:border-slate-400">
                    <td colSpan={2} className="py-3.5 px-3 sm:px-4 font-sans font-black text-slate-900 print:text-black">
                      कुल योग (Grand Totals)
                    </td>
                    <td className="py-3.5 px-3 sm:px-4 text-right font-black text-[#047857] bg-emerald-50/50 print:bg-transparent whitespace-nowrap">
                      +{formatINR(totalPlus)}
                    </td>
                    <td className="py-3.5 px-3 sm:px-4 text-right font-black text-[#B91C1C] bg-red-50/50 print:bg-transparent whitespace-nowrap">
                      -{formatINR(totalMinus)}
                    </td>
                    <td colSpan={isAdmin ? 2 : 1} className="py-3.5 px-3 sm:px-4 text-right font-black font-sans text-xs">
                      {balanceStatus === 'rider_due' ? `देना शेष: ₹${formatINR(netBalance)}` : balanceStatus === 'payable' ? `पाना शेष: ₹${formatINR(netBalance)}` : 'शेष: ₹0'}
                    </td>
                  </tr>
                  <tr className="border-t border-slate-200 bg-white text-xs font-bold print:bg-slate-100 print:border-slate-300">
                    <td colSpan={2} className="py-3 px-3 sm:px-4 font-sans text-slate-700 print:text-black">
                      अंतिम शेष (Bal)
                    </td>
                    <td 
                      colSpan={isAdmin ? 4 : 3} 
                      className={`py-3 px-3 sm:px-4 text-right font-black font-sans text-sm sm:text-base ${
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

        {/* Printable Official Footer (Only visible in Print / PDF Mode) */}
        <div className="hidden print:block pt-8 mt-6 border-t border-slate-300 text-xs">
          <div className="flex justify-between items-end">
            <div>
              <p className="text-slate-600 font-sans">
                यह <strong>{statement.hubName || 'सरायकेला कूरियर डिलीवरी हब'}</strong> द्वारा जारी किया गया आधिकारिक कंप्यूटर जनरेटेड खाता विवरण है।
              </p>
              <p className="text-slate-400 text-[10px] mt-1 font-mono">
                जनरेटेड दिनांक: {formatDateDisplay(new Date().toISOString().split('T')[0])}
              </p>
            </div>
            <div className="text-right">
              <div className="h-10 border-b border-slate-400 w-44 mb-1"></div>
              <p className="text-slate-700 font-bold font-sans">
                अधिकृत हस्ताक्षर (Hub In-charge)
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* Admin Modal: Edit Advance */}
      {editingAdvanceRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Pencil className="w-4 h-4 text-amber-600" />
                <span>एडवांस एंट्री एडिट करें</span>
              </h3>
              <button
                type="button"
                onClick={() => setEditingAdvanceRow(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveAdvanceEdit} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  एडवांस राशि (₹)
                </label>
                <input
                  type="number"
                  step="any"
                  required
                  value={editAmount}
                  onChange={(e) => setEditAmount(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm font-mono focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                  placeholder="0"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  तारीख
                </label>
                <input
                  type="date"
                  required
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  विवरण / कारण
                </label>
                <input
                  type="text"
                  value={editReason}
                  onChange={(e) => setEditReason(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                  placeholder="एडवांस का कारण"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingAdvanceRow(null)}
                  disabled={isSavingEdit}
                  className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  रद्द करें
                </button>
                <button
                  type="submit"
                  disabled={isSavingEdit}
                  className="px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl transition flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isSavingEdit ? 'सहेज रहे हैं...' : 'अपडेट करें'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Admin Modal: Edit Incentive */}
      {editingIncentiveRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Pencil className="w-4 h-4 text-[#047857]" />
                <span>इंसेंटिव एंट्री एडिट करें</span>
              </h3>
              <button
                type="button"
                onClick={() => setEditingIncentiveRow(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveIncentiveEdit} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  इंसेंटिव राशि (₹)
                </label>
                <input
                  type="number"
                  step="any"
                  required
                  value={editIncAmount}
                  onChange={(e) => setEditIncAmount(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm font-mono focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                  placeholder="0"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  तारीख
                </label>
                <input
                  type="date"
                  required
                  value={editIncDate}
                  onChange={(e) => setEditIncDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  विवरण / कारण
                </label>
                <input
                  type="text"
                  value={editIncReason}
                  onChange={(e) => setEditIncReason(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                  placeholder="इंसेंटिव का कारण"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingIncentiveRow(null)}
                  disabled={isSavingIncEdit}
                  className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  रद्द करें
                </button>
                <button
                  type="submit"
                  disabled={isSavingIncEdit}
                  className="px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl transition flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isSavingIncEdit ? 'सहेज रहे हैं...' : 'अपडेट करें'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Admin Modal: Confirm Delete Row (Android WebView safe, zero window.confirm) */}
      {deletingRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-2xl border border-slate-200 space-y-4">
            <div className="w-10 h-10 rounded-full bg-red-50 text-[#B91C1C] flex items-center justify-center mx-auto">
              <Trash2 className="w-5 h-5" />
            </div>
            <div className="text-center">
              <h3 className="text-sm font-bold text-slate-900">
                क्या आप यह एंट्री हटाना चाहते हैं?
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                {deletingRow.title} • {formatINR(deletingRow.minusAmount || deletingRow.plusAmount)}
              </p>
            </div>
            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeletingRow(null)}
                disabled={isDeletingRow}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
              >
                रद्द करें
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteRow}
                disabled={isDeletingRow}
                className="px-4 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-500 rounded-xl transition cursor-pointer disabled:opacity-50"
              >
                {isDeletingRow ? 'हटा रहे हैं...' : 'हाँ, हटाएं'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Admin Modal: Confirm Reset Account */}
      {showResetConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-2xl border border-slate-200 space-y-4 text-center">
            <div className="w-12 h-12 rounded-full bg-red-50 text-red-600 flex items-center justify-center mx-auto">
              <RotateCcw className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                क्या आप {statement.riderName} का खाता रीसेट करना चाहते हैं?
              </h3>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                यह राइडर के सभी बकाया एडवांस, इंसेंटिव और पे-आउट इतिहास को रीसेट करके बैलेंस शून्य (⚪ हिसाब चुकता: ₹0) कर देगा।
              </p>
            </div>
            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowResetConfirm(false)}
                disabled={isResetting}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
              >
                रद्द करें
              </button>
              <button
                type="button"
                onClick={handleConfirmResetAccount}
                disabled={isResetting}
                className="px-4 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-500 rounded-xl transition cursor-pointer disabled:opacity-50"
              >
                {isResetting ? 'रीसेट हो रहा है...' : 'हाँ, रीसेट करें'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RiderLedgerStatement;
