import React, { useState, useEffect, useMemo } from 'react';
import { 
  FileSpreadsheet, 
  Printer, 
  Share2, 
  ArrowLeft, 
  Calendar, 
  IndianRupee, 
  Bike, 
  Phone, 
  CheckCircle2, 
  Clock, 
  TrendingUp, 
  Download, 
  Copy, 
  Check, 
  MessageCircle, 
  ShieldCheck, 
  Building2,
  RefreshCw, 
  ExternalLink, 
  Receipt, 
  ArrowDownLeft, 
  ArrowUpRight, 
  X, 
  Gift,
  Trash2,
  AlertCircle,
  AlertTriangle
} from 'lucide-react';
import { PublicRiderStatement, RiderAdvanceEntry, RiderIncentiveEntry } from '../types';
import { formatINR, formatDateDisplay, formatPhoneNumber, getCleanPhoneDigits } from '../utils/formatters';
import { fetchPublicRiderStatement, deleteAdvanceFromFirestore, deleteIncentiveFromFirestore, syncPublicRiderStatement } from '../services/firestoreSync';
import { generateStatementUrl } from '../services/smsService';
import { loadRidersFromStorage, loadDeliveriesFromStorage, loadSettlementsFromStorage } from '../utils/storage';

interface RiderLedgerStatementProps {
  riderId?: string;
  initialStatement?: PublicRiderStatement | null;
  onBackToApp?: () => void;
  onDeleteAdvance?: (advanceId: string) => Promise<void>;
  onDeleteIncentive?: (incentiveId: string) => Promise<void>;
  userId?: string;
}

export interface UnifiedTransactionItem {
  id: string;
  rawDate: string;
  sortTimestamp: number;
  formattedDate: string;
  type: 'advance' | 'incentive' | 'salary' | 'delivery';
  title: string;
  subTitle?: string;
  salaryDetails?: {
    startDate: string;
    endDate: string;
    totalParcels: number;
    grossTotal: number;
    advanceDeducted: number;
    netPaid: number;
  };
  debit: number;    // Amount Given / Dr (Red)
  credit: number;   // Amount Earned / Cr (Green)
  runningBalance: number;
  balanceType: 'Dr' | 'Cr' | 'Zero';
  canDelete: boolean;
  deleteId?: string;
}

export const RiderLedgerStatement: React.FC<RiderLedgerStatementProps> = ({
  riderId: propRiderId,
  initialStatement = null,
  onBackToApp,
  onDeleteAdvance,
  onDeleteIncentive,
  userId = '',
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
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [feedbackToast, setFeedbackToast] = useState<{ text: string; type: 'success' | 'info' | 'error' } | null>(null);

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

  const statementUrl = generateStatementUrl(resolvedRiderId || statement?.riderId || '');

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

  // Compile Unified Single-Timeline Transactions & Running Balance
  const { 
    timelineRows, 
    totalDebit, 
    totalCredit, 
    netBalance, 
    balanceStatus,
    totalAdvancesGiven,
    totalIncentivesGiven,
    totalAdvanceRecovered,
    outstandingAdvance
  } = useMemo(() => {
    if (!statement) {
      return { 
        timelineRows: [], 
        totalDebit: 0, 
        totalCredit: 0, 
        netBalance: 0, 
        balanceStatus: 'settled' as const,
        totalAdvancesGiven: 0,
        totalIncentivesGiven: 0,
        totalAdvanceRecovered: 0,
        outstandingAdvance: 0,
      };
    }

    const rawList: Omit<UnifiedTransactionItem, 'runningBalance' | 'balanceType'>[] = [];

    // 1. ADVANCES GIVEN (Dr - Rider owes Hub)
    let advancesSum = 0;
    (statement.advances || []).forEach((adv) => {
      const advAmt = Number(adv.amount) || 0;
      advancesSum += advAmt;
      const dateVal = adv.date || adv.createdAt || '';
      const timestamp = dateVal ? new Date(dateVal).getTime() : 0;

      rawList.push({
        id: `adv-${adv.id}`,
        rawDate: dateVal,
        sortTimestamp: timestamp,
        formattedDate: adv.date ? formatDateDisplay(adv.date) : formatDateDisplay(adv.createdAt),
        type: 'advance',
        title: adv.reason || 'एडवांस भुगतान (Advance Given)',
        subTitle: 'नकद / ऑनलाइन ट्रांसफर',
        debit: advAmt,
        credit: 0,
        canDelete: true,
        deleteId: adv.id,
      });
    });

    // Fallback opening advance if advances array is empty but totalAdvance > 0
    if ((!statement.advances || statement.advances.length === 0) && (statement.totalAdvance || 0) > 0) {
      const opAmt = Number(statement.totalAdvance) || 0;
      advancesSum += opAmt;
      rawList.push({
        id: 'opening-advance',
        rawDate: statement.updatedAt || new Date().toISOString(),
        sortTimestamp: new Date(statement.updatedAt || Date.now()).getTime() - 86400000,
        formattedDate: formatDateDisplay(statement.updatedAt || new Date().toISOString()),
        type: 'advance',
        title: 'ओपनिंग एडवांस बैलेंस (Opening Advance)',
        subTitle: 'स्वीकृत कुल प्रारंभिक एडवांस राशि',
        debit: opAmt,
        credit: 0,
        canDelete: false,
      });
    }

    // 2. INCENTIVES GIVEN (Cr - Hub awards Bonus / Surplus to Rider)
    let incentivesSum = 0;
    (statement.incentives || []).forEach((inc) => {
      const incAmt = Number(inc.amount) || 0;
      incentivesSum += incAmt;
      const dateVal = inc.date || inc.createdAt || '';
      const timestamp = dateVal ? new Date(dateVal).getTime() : 0;

      rawList.push({
        id: `inc-${inc.id}`,
        rawDate: dateVal,
        sortTimestamp: timestamp,
        formattedDate: inc.date ? formatDateDisplay(inc.date) : formatDateDisplay(inc.createdAt),
        type: 'incentive',
        title: inc.reason || 'इंसेंटिव / बोनस (Incentive & Bonus)',
        subTitle: inc.source === 'surplus' ? 'अतिरिक्त सरप्लस जमा (Excess Cash Credit)' : 'स्वीकृत बोनस',
        debit: 0,
        credit: incAmt,
        canDelete: true,
        deleteId: inc.id,
      });
    });

    // 3. SALARY / PAYOUT CALCULATED (Settlement Payouts)
    let recoveredAdvanceSum = 0;
    (statement.salaries || []).forEach((sal) => {
      const dateVal = sal.paidAt ? sal.paidAt.split('T')[0] : sal.endDate;
      const timestamp = new Date(sal.paidAt || sal.endDate).getTime() || 0;
      const advDeducted = Number(sal.advanceAmount) || 0;
      recoveredAdvanceSum += advDeducted;

      // Settlement clears advance debt by advDeducted, and rider received netTotal
      rawList.push({
        id: `sal-${sal.id}`,
        rawDate: dateVal,
        sortTimestamp: timestamp,
        formattedDate: formatDateDisplay(dateVal),
        type: 'salary',
        title: `सैलरी पे-आउट (${sal.startDate} से ${sal.endDate})`,
        subTitle: `${sal.totalParcels} पार्सल • सकल: ₹${sal.grossTotal} | एडवांस कटौती: ₹${advDeducted} | नेट भुगतान: ₹${sal.netTotal}`,
        salaryDetails: {
          startDate: sal.startDate,
          endDate: sal.endDate,
          totalParcels: sal.totalParcels,
          grossTotal: Number(sal.grossTotal) || 0,
          advanceDeducted: advDeducted,
          netPaid: Number(sal.netTotal) || 0,
        },
        debit: 0,
        // The credit to rider's advance ledger is the advance amount recovered
        credit: advDeducted,
        canDelete: false,
      });
    });

    // 4. UNSETTLED DELIVERIES (If no settlement yet, rider has accrued delivery credits)
    if (statement.recentDeliveries && statement.recentDeliveries.length > 0) {
      statement.recentDeliveries.forEach((del) => {
        if (del.settlementId) return;
        const isCoveredBySalary = (statement.salaries || []).some(
          (sal) => del.date >= sal.startDate && del.date <= sal.endDate
        );
        if (isCoveredBySalary && (statement.salaries || []).length > 0) return;

        const dateVal = del.date;
        const timestamp = new Date(dateVal).getTime() || 0;
        const earnings = Number(del.totalEarnings) || 0;

        rawList.push({
          id: `del-${del.id}`,
          rawDate: dateVal,
          sortTimestamp: timestamp,
          formattedDate: formatDateDisplay(dateVal),
          type: 'delivery',
          title: `दैनिक डिलीवरी (${del.parcels} पार्सल)`,
          subTitle: del.status === 'Paid' ? `सकल आय: ₹${earnings} • भुगतान संपन्न` : `उपार्जित पार्सल आय: ₹${earnings}`,
          debit: 0,
          credit: 0, // Informative row
          canDelete: false,
        });
      });
    }

    // Sort chronologically (oldest first) to compute running net balance
    rawList.sort((a, b) => a.sortTimestamp - b.sortTimestamp);

    let cumulativeBalance = 0; // Positive = Rider owes Hub (Dr), Negative = Hub owes Rider (Cr)
    let sumDebit = 0;
    let sumCredit = 0;

    const compiledRows: UnifiedTransactionItem[] = rawList.map((row) => {
      sumDebit += row.debit;
      sumCredit += row.credit;

      cumulativeBalance = cumulativeBalance + row.debit - row.credit;

      const balanceType: 'Dr' | 'Cr' | 'Zero' = 
        cumulativeBalance > 0 ? 'Dr' : cumulativeBalance < 0 ? 'Cr' : 'Zero';

      return {
        ...row,
        runningBalance: Math.abs(cumulativeBalance),
        balanceType,
      };
    });

    // Authoritative Outstanding Advance
    const currentOutstandingAdvance = typeof statement.totalAdvance === 'number'
      ? statement.totalAdvance
      : Math.max(0, advancesSum - recoveredAdvanceSum);

    // Final Net Balance:
    // Net = outstanding advance (debt) - total active incentives (credits)
    const netDue = currentOutstandingAdvance - incentivesSum;

    let balanceStatus: 'rider_due' | 'payable' | 'settled' = 'settled';
    if (netDue > 0) {
      balanceStatus = 'rider_due';
    } else if (netDue < 0) {
      balanceStatus = 'payable';
    } else {
      balanceStatus = 'settled';
    }

    return {
      // Reverse so newest transactions are right at the top for immediate visibility
      timelineRows: compiledRows.reverse(),
      totalDebit: sumDebit,
      totalCredit: sumCredit,
      netBalance: Math.abs(netDue),
      balanceStatus,
      totalAdvancesGiven: advancesSum,
      totalIncentivesGiven: incentivesSum,
      totalAdvanceRecovered: recoveredAdvanceSum,
      outstandingAdvance: currentOutstandingAdvance,
    };
  }, [statement]);

  // Handle Delete Advance with instant Firestore removal & recalculation
  const handleDeleteAdvanceItem = async (advId: string) => {
    if (!statement) return;
    const target = (statement.advances || []).find((a) => a.id === advId);
    const amtStr = target ? `₹${target.amount}` : '';
    const reasonStr = target?.reason || 'एडवांस';

    if (!window.confirm(`क्या आप ${amtStr} (${reasonStr}) की एडवांस एंट्री हटाना चाहते हैं? यह डेटाबेस से तुरंत हट जाएगी और बैलेंस दोबारा कैलकुलेट हो जाएगा।`)) {
      return;
    }

    setDeletingId(`adv-${advId}`);
    try {
      // 1. Delete Firestore document
      const currentUserId = userId || (statement as any).userId || (statement as any).workspaceId || '';
      await deleteAdvanceFromFirestore(currentUserId, advId);

      // 2. Call parent callback if available
      if (onDeleteAdvance) {
        await onDeleteAdvance(advId);
      }

      // 3. Immediately update local statement state so UI recalculates in 0 seconds
      const updatedAdvances = (statement.advances || []).filter((a) => a.id !== advId);
      const newTotalAdv = updatedAdvances.reduce((s, a) => s + (Number(a.amount) || 0), 0);
      setStatement({
        ...statement,
        advances: updatedAdvances,
        totalAdvance: newTotalAdv,
      });

      setFeedbackToast({
        text: `एडवांस एंट्री सफलतापूर्वक हटाई गई एवं बैलेंस अपडेट हो गया।`,
        type: 'success',
      });
      setTimeout(() => setFeedbackToast(null), 3000);
    } catch (err) {
      console.error('Error deleting advance item:', err);
      setFeedbackToast({
        text: 'एडवांस हटाने में समस्या आई। कृपया पुनः प्रयास करें।',
        type: 'error',
      });
      setTimeout(() => setFeedbackToast(null), 3000);
    } finally {
      setDeletingId(null);
    }
  };

  // Handle Delete Incentive with instant Firestore removal & recalculation
  const handleDeleteIncentiveItem = async (incId: string) => {
    if (!statement) return;
    const target = (statement.incentives || []).find((i) => i.id === incId);
    const amtStr = target ? `₹${target.amount}` : '';
    const reasonStr = target?.reason || 'इंसेंटिव';

    if (!window.confirm(`क्या आप ${amtStr} (${reasonStr}) का इंसेंटिव रिकॉर्ड हटाना चाहते हैं? यह डेटाबेस से तुरंत हट जाएगा और बैलेंस दोबारा कैलकुलेट हो जाएगा।`)) {
      return;
    }

    setDeletingId(`inc-${incId}`);
    try {
      // 1. Delete Firestore document
      const currentUserId = userId || (statement as any).userId || (statement as any).workspaceId || '';
      await deleteIncentiveFromFirestore(currentUserId, incId);

      // 2. Call parent callback if available
      if (onDeleteIncentive) {
        await onDeleteIncentive(incId);
      }

      // 3. Immediately update local statement state
      const updatedIncentives = (statement.incentives || []).filter((i) => i.id !== incId);
      const newTotalInc = updatedIncentives.reduce((s, i) => s + (Number(i.amount) || 0), 0);
      setStatement({
        ...statement,
        incentives: updatedIncentives,
        totalIncentive: newTotalInc,
      });

      setFeedbackToast({
        text: `इंसेंटिव रिकॉर्ड सफलतापूर्वक हटाया गया एवं बैलेंस अपडेट हो गया।`,
        type: 'success',
      });
      setTimeout(() => setFeedbackToast(null), 3000);
    } catch (err) {
      console.error('Error deleting incentive item:', err);
      setFeedbackToast({
        text: 'इंसेंटिव हटाने में समस्या आई। कृपया पुनः प्रयास करें।',
        type: 'error',
      });
      setTimeout(() => setFeedbackToast(null), 3000);
    } finally {
      setDeletingId(null);
    }
  };

  // CSV Export
  const handleExportCSV = () => {
    if (!statement) return;
    let csvContent = 'data:text/csv;charset=utf-8,';

    csvContent += `KHATABOOK UNIFIED STATEMENT - ${statement.riderName}\n`;
    csvContent += `Hub: ${statement.hubName || 'Courier Hub'}\n`;
    csvContent += `Phone: +91 ${statement.riderPhone}\n`;
    csvContent += `Balance Status: ${balanceStatus === 'rider_due' ? 'Rider Due' : balanceStatus === 'payable' ? 'Payable' : 'All Settled'} - Rs. ${netBalance}\n`;
    csvContent += `Generated At: ${new Date().toLocaleDateString('en-IN')}\n\n`;

    csvContent += 'Date,Type,Details,Amount Given / Dr,Amount Earned / Cr,Running Balance\n';

    timelineRows.forEach((row) => {
      const dateClean = `"${row.formattedDate}"`;
      const typeClean = `"${row.type.toUpperCase()}"`;
      const detailsClean = `"${row.title.replace(/"/g, '""')} ${row.subTitle ? row.subTitle.replace(/"/g, '""') : ''}"`;
      const debitStr = row.debit > 0 ? `${row.debit}` : '0';
      const creditStr = row.credit > 0 ? `${row.credit}` : '0';
      const balanceStr = `"${row.runningBalance} ${row.balanceType}"`;
      csvContent += `${dateClean},${typeClean},${detailsClean},${debitStr},${creditStr},${balanceStr}\n`;
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `${statement.riderName.replace(/\s+/g, '_')}_Khatabook_Statement.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const cleanDigits = statement ? getCleanPhoneDigits(statement.riderPhone).slice(-10) : '';
  const shareText = statement 
    ? `नमस्ते ${statement.riderName}, आपका कूरियर खाता स्टेटमेंट यहाँ देखें:\n${
        balanceStatus === 'rider_due' 
          ? `एडमिन को लेना बाकी है: ₹${formatINR(netBalance)}`
          : balanceStatus === 'payable'
          ? `राइडर को देना बाकी है: ₹${formatINR(netBalance)}`
          : `हिसाब चुकता: ₹0`
      }\nलिंक: ${statementUrl}` 
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
            className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-sm transition"
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
      {/* Top Application Bar / Action Ribbon */}
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
                  <span>एकल-पृष्ठ खाता लेजर (Unified Ledger)</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-mono font-medium">
                    Live Khatabook
                  </span>
                </h1>
                <p className="text-xs text-slate-400">
                  {statement.hubName || 'सरायकेला कूरियर डिलीवरी हब'}
                </p>
              </div>
            </div>
          </div>

          {/* Action Ribbon Buttons */}
          <div className="flex items-center gap-2 flex-wrap">
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

      {/* Floating Feedback Toast */}
      {feedbackToast && (
        <div className={`fixed top-16 right-4 z-50 px-4 py-2.5 rounded-xl border shadow-xl text-xs font-bold flex items-center gap-2 animate-in fade-in slide-in-from-top-2 ${
          feedbackToast.type === 'success'
            ? 'bg-emerald-950 border-emerald-500/50 text-emerald-200'
            : feedbackToast.type === 'error'
            ? 'bg-rose-950 border-rose-500/50 text-rose-200'
            : 'bg-slate-900 border-slate-700 text-white'
        }`}>
          {feedbackToast.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-400" />
          )}
          <span>{feedbackToast.text}</span>
        </div>
      )}

      {/* Main Single-Page Container */}
      <main className="max-w-5xl w-full mx-auto p-3.5 sm:p-6 flex-1 space-y-4 sm:space-y-5 print:p-0 print:max-w-none">
        
        {/* Printable Official Header (Only in Print / PDF Mode) */}
        <div className="hidden print:block border-b-2 border-slate-800 pb-3 mb-4">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-2xl font-black text-slate-900">{statement.hubName || 'सरायकेला कूरियर डिलीवरी हब'}</h1>
              <p className="text-xs text-slate-600 mt-0.5">{statement.hubSignature || 'Official Courier Payout & Rider Advance Ledger'}</p>
              <p className="text-xs text-slate-700 mt-1 font-mono">
                Rider: <strong>{statement.riderName}</strong> • Phone: +91 {formatPhoneNumber(statement.riderPhone)}
              </p>
            </div>
            <div className="text-right">
              <span className="text-xs font-mono bg-slate-100 px-2.5 py-1 rounded border border-slate-300 block">
                DATE: {new Date().toLocaleDateString('en-IN')}
              </span>
              <span className="text-sm font-bold mt-1 block">
                Status: {balanceStatus === 'rider_due' ? 'Rider Due' : balanceStatus === 'payable' ? 'Payable' : 'All Settled'}
              </span>
            </div>
          </div>
        </div>

        {/* Rider Profile Card & Overview */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xl relative overflow-hidden print:border print:border-slate-300 print:bg-white print:shadow-none">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            
            {/* Left: Rider Info, Hub Name, Contact */}
            <div className="flex items-start sm:items-center gap-3.5">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white flex items-center justify-center text-2xl font-black shadow-lg shadow-blue-900/40 shrink-0">
                {statement.riderName.charAt(0).toUpperCase()}
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-lg sm:text-xl font-black text-white print:text-black">
                    {statement.riderName}
                  </h2>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 print:border-emerald-600 print:text-emerald-800">
                    सक्रिय खाता (Active)
                  </span>
                </div>

                <div className="text-xs text-slate-300 font-medium mt-0.5">
                  हब / कंपनी: <strong className="text-white print:text-black">{statement.hubName || 'सरायकेला कूरियर डिलीवरी हब'}</strong>
                </div>

                <div className="mt-1.5 flex items-center gap-2 text-xs text-slate-400 print:text-slate-700 flex-wrap">
                  <a
                    href={`tel:${cleanDigits}`}
                    className="inline-flex items-center gap-1 font-mono text-slate-300 hover:text-white bg-slate-800/80 px-2 py-0.5 rounded-lg border border-slate-700/60 print:bg-transparent print:border-none"
                  >
                    <Phone className="w-3 h-3 text-blue-400" />
                    <span>+91 {formatPhoneNumber(statement.riderPhone)}</span>
                  </a>
                  <span>•</span>
                  <span className="flex items-center gap-1">
                    <Bike className="w-3 h-3 text-teal-400" />
                    <span>{statement.vehicleType || 'Bike'}</span>
                  </span>
                  <span>•</span>
                  <span className="font-mono text-[11px] text-slate-500">
                    ID: {statement.riderId}
                  </span>
                </div>
              </div>
            </div>

            {/* Quick Financial Summary Pills */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
              <div className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800 print:bg-slate-100">
                <span className="text-[10px] text-slate-400 block">कुल एडवांस दिया:</span>
                <span className="font-bold text-rose-400 font-mono text-sm">
                  {formatINR(totalAdvancesGiven)}
                </span>
              </div>

              <div className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800 print:bg-slate-100">
                <span className="text-[10px] text-slate-400 block">कुल इंसेंटिव / बोनस:</span>
                <span className="font-bold text-emerald-400 font-mono text-sm">
                  {formatINR(totalIncentivesGiven)}
                </span>
              </div>

              <div className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800 print:bg-slate-100 col-span-2 sm:col-span-1">
                <span className="text-[10px] text-slate-400 block">सैलरी से काटा गया:</span>
                <span className="font-bold text-blue-400 font-mono text-sm">
                  {formatINR(totalAdvanceRecovered)}
                </span>
              </div>
            </div>

          </div>
        </div>

        {/* 1. TOP HERO CARD: Net balance clearly stating who owes whom (Prompt Requirement) */}
        {balanceStatus === 'rider_due' ? (
          // RED CARD: Rider owes Hub
          <div className="rounded-2xl p-5 sm:p-6 bg-gradient-to-r from-rose-950/70 via-rose-900/30 to-slate-900 border-2 border-rose-500/50 shadow-xl shadow-rose-950/30 print:bg-rose-50 print:border-rose-400">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1.5">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs font-bold uppercase tracking-wider">
                  <AlertTriangle className="w-4 h-4 text-rose-400" />
                  <span>एडमिन को राइडर से लेना बाकी है (Rider Due)</span>
                </div>
                <h3 className="text-xl sm:text-2xl font-black text-rose-200 print:text-rose-900">
                  एडमिन को राइडर से लेना बाकी है (Rider Due): ₹{formatINR(netBalance)}
                </h3>
                <p className="text-xs text-rose-300/80 print:text-rose-700">
                  राइडर के पास कुल एडवांस में से इंसेंटिव व वेतन कटौती के बाद ₹{formatINR(netBalance)} बकाया शेष है।
                </p>
              </div>

              <div className="text-left sm:text-right bg-rose-950/50 sm:bg-transparent p-3 sm:p-0 rounded-xl border border-rose-800/40 sm:border-none">
                <span className="text-[10px] uppercase font-bold text-rose-300 block">
                  कुल बकाया राशि (Due Balance)
                </span>
                <div className="text-3xl sm:text-4xl font-black text-rose-400 font-mono tracking-tight print:text-rose-700">
                  ₹{formatINR(netBalance)}
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30 inline-block mt-1 font-mono">
                  Dr (देना बाकी)
                </span>
              </div>
            </div>
          </div>
        ) : balanceStatus === 'payable' ? (
          // GREEN CARD: Hub owes Rider
          <div className="rounded-2xl p-5 sm:p-6 bg-gradient-to-r from-emerald-950/70 via-emerald-900/30 to-slate-900 border-2 border-emerald-500/50 shadow-xl shadow-emerald-950/30 print:bg-emerald-50 print:border-emerald-400">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1.5">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-bold uppercase tracking-wider">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>राइडर को देना बाकी है (Payable)</span>
                </div>
                <h3 className="text-xl sm:text-2xl font-black text-emerald-200 print:text-emerald-900">
                  राइडर को देना बाकी है (Payable): ₹{formatINR(netBalance)}
                </h3>
                <p className="text-xs text-emerald-300/80 print:text-emerald-700">
                  राइडर का अतिरिक्त इंसेंटिव / जमा राशि हब द्वारा भुगतान योग्य (Payable) है।
                </p>
              </div>

              <div className="text-left sm:text-right bg-emerald-950/50 sm:bg-transparent p-3 sm:p-0 rounded-xl border border-emerald-800/40 sm:border-none">
                <span className="text-[10px] uppercase font-bold text-emerald-300 block">
                  कुल देय राशि (Payable to Rider)
                </span>
                <div className="text-3xl sm:text-4xl font-black text-emerald-400 font-mono tracking-tight print:text-emerald-700">
                  ₹{formatINR(netBalance)}
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 inline-block mt-1 font-mono">
                  Cr (जमा / देय)
                </span>
              </div>
            </div>
          </div>
        ) : (
          // GRAY CARD: Zero All Settled
          <div className="rounded-2xl p-5 sm:p-6 bg-gradient-to-r from-slate-900 via-slate-850 to-slate-900 border-2 border-slate-700 shadow-xl print:bg-slate-50 print:border-slate-400">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1.5">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-800 text-slate-300 border border-slate-700 text-xs font-bold uppercase tracking-wider">
                  <Check className="w-4 h-4 text-slate-400" />
                  <span>हिसाब चुकता (All Settled)</span>
                </div>
                <h3 className="text-xl sm:text-2xl font-black text-white print:text-black">
                  हिसाब चुकता (All Settled): ₹0
                </h3>
                <p className="text-xs text-slate-400 print:text-slate-600">
                  राइडर एवं हब के मध्य सभी एडवांस, इंसेंटिव व वेतन पे-आउट पूरी तरह से चुकता हैं। कोई बकाया शेष नहीं है।
                </p>
              </div>

              <div className="text-left sm:text-right bg-slate-950/50 sm:bg-transparent p-3 sm:p-0 rounded-xl border border-slate-800 sm:border-none">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">
                  वर्तमान शेष (Current Net Balance)
                </span>
                <div className="text-3xl sm:text-4xl font-black text-slate-300 font-mono tracking-tight print:text-black">
                  ₹0
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700 inline-block mt-1 font-mono">
                  Settled (समतुल्य)
                </span>
              </div>
            </div>
          </div>
        )}

        {/* 2. UNIFIED TRANSACTION TIMELINE (Single Sorted List) */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden shadow-xl print:border print:border-slate-300 print:bg-white print:shadow-none">
          <div className="p-4 bg-slate-950/70 border-b border-slate-800 flex items-center justify-between flex-wrap gap-2">
            <div>
              <h3 className="text-sm font-black text-white print:text-black flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-400" />
                <span>संयुक्त खाता लेनदेन विवरण (Unified Transaction Timeline)</span>
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5">
                एडवांस, इंसेंटिव, वेतन व रनिंग बैलेंस का सम्पूर्ण कालानुक्रमिक लेजर
              </p>
            </div>
            <div className="text-xs text-slate-400 font-mono">
              कुल लेनदेन: <strong className="text-white">{timelineRows.length}</strong>
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
                  <tr className="border-b border-slate-800 bg-slate-950/80 text-slate-300 font-bold sticky top-0 print:bg-slate-100 print:text-black print:border-slate-400">
                    <th className="py-3 px-3 sm:px-4 min-w-[240px]">
                      तारीख व प्रकार (Date &amp; Details)
                    </th>
                    <th className="py-3 px-3 sm:px-4 text-right min-w-[130px] text-rose-400 print:text-rose-800 bg-rose-950/10 print:bg-transparent">
                      दिया गया (Debit / Dr)
                    </th>
                    <th className="py-3 px-3 sm:px-4 text-right min-w-[130px] text-emerald-400 print:text-emerald-800 bg-emerald-950/10 print:bg-transparent">
                      क्रेडिट / कटौती (Credit / Cr)
                    </th>
                    <th className="py-3 px-3 sm:px-4 text-right min-w-[150px] text-amber-300 print:text-black bg-amber-950/10 print:bg-transparent">
                      रनिंग बैलेंस (Running Balance)
                    </th>
                    <th className="py-3 px-3 text-center min-w-[70px] print:hidden">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70 font-mono print:divide-slate-300">
                  {timelineRows.map((row) => (
                    <tr 
                      key={row.id} 
                      className="hover:bg-slate-850/50 transition print:hover:bg-transparent"
                    >
                      {/* Column 1: Date, Type Badge, Details */}
                      <td className="py-3 px-3 sm:px-4 font-sans">
                        <div className="flex items-start gap-2.5">
                          {/* Type Pill */}
                          <div className="mt-0.5 shrink-0">
                            {row.type === 'advance' ? (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-300 border border-rose-500/30">
                                एडवांस
                              </span>
                            ) : row.type === 'incentive' ? (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                                इंसेंटिव
                              </span>
                            ) : row.type === 'salary' ? (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-300 border border-blue-500/30">
                                पे-आउट
                              </span>
                            ) : (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                                डिलीवरी
                              </span>
                            )}
                          </div>

                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-mono text-[11px] text-slate-400 print:text-slate-600">
                                {row.formattedDate}
                              </span>
                              <span className="font-bold text-white print:text-black text-xs">
                                {row.title}
                              </span>
                            </div>

                            {row.subTitle && (
                              <div className="text-[11px] text-slate-400 print:text-slate-600 mt-0.5 font-sans">
                                {row.subTitle}
                              </div>
                            )}

                            {/* Detailed breakdown for Salary payouts */}
                            {row.salaryDetails && (
                              <div className="mt-1 flex items-center gap-2 flex-wrap text-[10px] text-slate-400 font-mono bg-slate-950/60 px-2 py-1 rounded border border-slate-800/80 print:bg-slate-50 print:border-slate-300">
                                <span>सकल आय: <strong>₹{row.salaryDetails.grossTotal}</strong></span>
                                <span>•</span>
                                <span className="text-rose-400 font-bold">एडवांस कटौती: ₹{row.salaryDetails.advanceDeducted}</span>
                                <span>•</span>
                                <span className="text-emerald-400 font-bold">नेट पेड: ₹{row.salaryDetails.netPaid}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Column 2: Debit / Dr in Red */}
                      <td className="py-3 px-3 sm:px-4 text-right font-bold bg-rose-950/10 print:bg-transparent">
                        {row.debit > 0 ? (
                          <span className="text-rose-400 print:text-rose-700">
                            + {formatINR(row.debit)}
                          </span>
                        ) : (
                          <span className="text-slate-600 print:text-slate-400 font-normal">-</span>
                        )}
                      </td>

                      {/* Column 3: Credit / Cr in Green */}
                      <td className="py-3 px-3 sm:px-4 text-right font-bold bg-emerald-950/10 print:bg-transparent">
                        {row.credit > 0 ? (
                          <span className="text-emerald-400 print:text-emerald-700">
                            - {formatINR(row.credit)}
                          </span>
                        ) : (
                          <span className="text-slate-600 print:text-slate-400 font-normal">-</span>
                        )}
                      </td>

                      {/* Column 4: Running Net Balance */}
                      <td className="py-3 px-3 sm:px-4 text-right font-bold bg-amber-950/10 print:bg-transparent">
                        {row.balanceType === 'Dr' ? (
                          <span className="text-rose-400 print:text-rose-700 inline-flex items-center gap-1 justify-end">
                            <span>{formatINR(row.runningBalance)}</span>
                            <span className="text-[10px] font-black px-1.5 py-0.2 rounded bg-rose-500/20 text-rose-300 print:border print:border-rose-400">
                              Dr
                            </span>
                          </span>
                        ) : row.balanceType === 'Cr' ? (
                          <span className="text-emerald-400 print:text-emerald-700 inline-flex items-center gap-1 justify-end">
                            <span>{formatINR(row.runningBalance)}</span>
                            <span className="text-[10px] font-black px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 print:border print:border-emerald-400">
                              Cr
                            </span>
                          </span>
                        ) : (
                          <span className="text-slate-400 font-mono">₹0 Settled</span>
                        )}
                      </td>

                      {/* Column 5: Action (Delete for Advance & Incentive) */}
                      <td className="py-3 px-3 text-center print:hidden">
                        {row.canDelete && row.deleteId && (
                          <button
                            type="button"
                            disabled={deletingId === row.id}
                            onClick={() => {
                              if (row.type === 'advance') {
                                handleDeleteAdvanceItem(row.deleteId!);
                              } else if (row.type === 'incentive') {
                                handleDeleteIncentiveItem(row.deleteId!);
                              }
                            }}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-slate-800 transition disabled:opacity-50 cursor-pointer"
                            title={`${row.type === 'advance' ? 'एडवांस' : 'इंसेंटिव'} हटाएं (Delete Entry)`}
                          >
                            {deletingId === row.id ? (
                              <RefreshCw className="w-3.5 h-3.5 animate-spin text-rose-400" />
                            ) : (
                              <Trash2 className="w-3.5 h-3.5" />
                            )}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>

                {/* Summary Totals Row */}
                <tfoot>
                  <tr className="border-t-2 border-slate-700 bg-slate-950 text-xs font-bold font-mono print:bg-slate-100 print:border-slate-400">
                    <td className="py-3 px-3 sm:px-4 font-sans font-black text-white print:text-black">
                      कुल योग (Grand Totals)
                    </td>
                    <td className="py-3 px-3 sm:px-4 text-right font-black text-rose-400 print:text-rose-700 bg-rose-950/20 print:bg-transparent">
                      {formatINR(totalDebit)} Dr
                    </td>
                    <td className="py-3 px-3 sm:px-4 text-right font-black text-emerald-400 print:text-emerald-700 bg-emerald-950/20 print:bg-transparent">
                      {formatINR(totalCredit)} Cr
                    </td>
                    <td className={`py-3 px-3 sm:px-4 text-right font-black bg-amber-950/20 print:bg-transparent ${
                      balanceStatus === 'rider_due' ? 'text-rose-400 print:text-rose-700' : balanceStatus === 'payable' ? 'text-emerald-400 print:text-emerald-700' : 'text-white print:text-black'
                    }`}>
                      {formatINR(netBalance)} {balanceStatus === 'rider_due' ? 'Dr' : balanceStatus === 'payable' ? 'Cr' : 'Settled'}
                    </td>
                    <td className="print:hidden"></td>
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
            {statement.hubName || 'सरायकेला कूरियर हब'} • सुरक्षित ऑनलाइन खाता
          </span>
          <span className="font-mono text-[11px] text-slate-600">
            {statementUrl}
          </span>
        </div>
      </footer>
    </div>
  );
};
