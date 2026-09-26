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
  X
} from 'lucide-react';
import { PublicRiderStatement, RiderAdvanceEntry } from '../types';
import { formatINR, formatDateDisplay, formatPhoneNumber, getCleanPhoneDigits } from '../utils/formatters';
import { fetchPublicRiderStatement } from '../services/firestoreSync';
import { generateStatementUrl } from '../services/smsService';

interface RiderLedgerStatementProps {
  riderId: string;
  initialStatement?: PublicRiderStatement | null;
  onBackToApp?: () => void;
}

interface KhatabookLedgerRow {
  id: string;
  dateStr: string;
  sortTimestamp: number;
  details: string;
  subDetails?: string;
  category: 'advance' | 'salary';
  debit: number;   // Amount Given / Dr (Red)
  credit: number;  // Amount Received / Cr (Green)
  runningBalance: number;
  balanceType: 'Dr' | 'Cr' | 'Zero';
}

export const RiderLedgerStatement: React.FC<RiderLedgerStatementProps> = ({
  riderId,
  initialStatement = null,
  onBackToApp,
}) => {
  const [statement, setStatement] = useState<PublicRiderStatement | null>(initialStatement);
  const [loading, setLoading] = useState<boolean>(!initialStatement);
  const [activeTab, setActiveTab] = useState<'khatabook' | 'advance' | 'salary'>('khatabook');
  const [copiedLink, setCopiedLink] = useState(false);

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

    // Push dummy history entry to cleanly intercept mobile hardware back button
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
    if (riderId) {
      if (!statement) setLoading(true);
      const cleanId = decodeURIComponent(riderId).trim();
      fetchPublicRiderStatement(cleanId)
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
    }
    return () => {
      isMounted = false;
    };
  }, [riderId]);

  const statementUrl = generateStatementUrl(riderId);

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

  // Compile Unified Khatabook 4-Column Transactions Data:
  // Merges:
  // 1. Advances (Debits / Dr - Amount given to rider)
  // 2. Settlement Salaries (Credits / Cr - Payouts settled)
  // 3. Daily Delivery Payouts / Entries (Credits / Cr - Parcels delivered)
  const { ledgerRows, totalDebit, totalCredit, netBalance, netBalanceType } = useMemo(() => {
    if (!statement) {
      return { ledgerRows: [], totalDebit: 0, totalCredit: 0, netBalance: 0, netBalanceType: 'Zero' as const };
    }

    const rawRows: Omit<KhatabookLedgerRow, 'runningBalance' | 'balanceType'>[] = [];

    // 1. Advances Given (Debits / Dr - Amount Given to Rider by Hub)
    (statement.advances || []).forEach((adv) => {
      const dateVal = adv.date || adv.createdAt;
      const timestamp = new Date(dateVal).getTime() || 0;
      rawRows.push({
        id: adv.id,
        dateStr: adv.date ? formatDateDisplay(adv.date) : formatDateDisplay(adv.createdAt),
        sortTimestamp: timestamp,
        details: adv.reason || 'एडवांस भुगतान (Advance Given)',
        subDetails: 'एडवांस नकद / ऑनलाइन ट्रांसफर',
        category: 'advance',
        debit: Number(adv.amount) || 0,
        credit: 0,
      });
    });

    // Opening Advance entry if advances list is empty but totalAdvance > 0
    if ((!statement.advances || statement.advances.length === 0) && (statement.totalAdvance || 0) > 0) {
      rawRows.push({
        id: 'opening-advance',
        dateStr: formatDateDisplay(statement.updatedAt || new Date().toISOString()),
        sortTimestamp: new Date(statement.updatedAt || Date.now()).getTime() - 86400000,
        details: 'ओपनिंग एडवांस बैलेंस (Opening Advance)',
        subDetails: 'स्वीकृत कुल एडवांस राशि',
        category: 'advance',
        debit: Number(statement.totalAdvance) || 0,
        credit: 0,
      });
    }

    // 2. Salaries / Settlement Payouts (Credits / Cr - Amount Settled / Received by Rider)
    (statement.salaries || []).forEach((sal) => {
      const dateVal = sal.paidAt ? sal.paidAt.split('T')[0] : sal.endDate;
      const timestamp = new Date(sal.paidAt || sal.endDate).getTime() || 0;
      const advanceDeductionNote = sal.advanceAmount > 0 
        ? ` [एडवांस कटौती: ₹${sal.advanceAmount}]` 
        : '';

      rawRows.push({
        id: sal.id,
        dateStr: formatDateDisplay(dateVal),
        sortTimestamp: timestamp,
        details: `सैलरी पे-आउट (${sal.startDate} से ${sal.endDate})${advanceDeductionNote}`,
        subDetails: `${sal.totalParcels} पार्सल डिलीवर • सकल आय: ₹${sal.grossTotal}`,
        category: 'salary',
        debit: 0,
        credit: Number(sal.netTotal) || 0,
      });
    });

    // 3. Delivery Entries / Delivery Payouts (Credits / Cr - Parcels Delivered by Rider)
    // If settlements exist, only include deliveries outside the settled periods to prevent double-counting.
    // If no settlements exist, include all daily delivery payouts!
    if (statement.recentDeliveries && statement.recentDeliveries.length > 0) {
      statement.recentDeliveries.forEach((del) => {
        if (del.settlementId) return;
        const isCoveredBySalary = (statement.salaries || []).some(
          (sal) => del.date >= sal.startDate && del.date <= sal.endDate
        );
        if (isCoveredBySalary && (statement.salaries || []).length > 0) return;

        const dateVal = del.date;
        const timestamp = new Date(dateVal).getTime() || 0;
        rawRows.push({
          id: del.id,
          dateStr: formatDateDisplay(dateVal),
          sortTimestamp: timestamp,
          details: `डेली डिलीवरी पे-आउट (${del.parcels} पार्सल)`,
          subDetails: del.status === 'Paid' 
            ? `सकल आय: ₹${del.totalEarnings} • भुगतान संपन्न (Paid)` 
            : `सकल आय: ₹${del.totalEarnings} • उपार्जित डिलीवरी`,
          category: 'salary',
          debit: 0,
          credit: Number(del.totalEarnings) || 0,
        });
      });
    }

    // Sort chronologically (oldest first) to compute running net balance
    rawRows.sort((a, b) => a.sortTimestamp - b.sortTimestamp);

    let cumulativeBalance = 0; // Positive = Dr (Rider owes Hub), Negative = Cr (Hub owes Rider)
    let sumDebit = 0;
    let sumCredit = 0;

    const compiledRows: KhatabookLedgerRow[] = rawRows.map((row) => {
      sumDebit += row.debit;
      sumCredit += row.credit;

      // In Indian Khatabook accounting for rider fleet:
      // Giving advance increases Debit (+Dr)
      // Settling payout or receiving advance deduction credits account (-Cr)
      cumulativeBalance = cumulativeBalance + row.debit - row.credit;

      const balanceType: 'Dr' | 'Cr' | 'Zero' = 
        cumulativeBalance > 0 ? 'Dr' : cumulativeBalance < 0 ? 'Cr' : 'Zero';

      return {
        ...row,
        runningBalance: Math.abs(cumulativeBalance),
        balanceType,
      };
    });

    // Final Net Balance:
    // If statement has totalAdvance, use totalAdvance as authoritative outstanding advance Dr
    const authoritativeAdvance = typeof statement.totalAdvance === 'number' ? statement.totalAdvance : 0;
    const finalNetBalance = authoritativeAdvance > 0 
      ? authoritativeAdvance 
      : Math.abs(cumulativeBalance);
    const finalType: 'Dr' | 'Cr' | 'Zero' = authoritativeAdvance > 0 
      ? 'Dr' 
      : (cumulativeBalance < 0 ? 'Cr' : (cumulativeBalance > 0 ? 'Dr' : 'Zero'));

    // Return in reverse chronological order (newest on top) for convenient reading
    return {
      ledgerRows: compiledRows.reverse(),
      totalDebit: sumDebit,
      totalCredit: sumCredit,
      netBalance: finalNetBalance,
      netBalanceType: finalType,
    };
  }, [statement]);

  // CSV Export
  const handleExportCSV = () => {
    if (!statement) return;
    let csvContent = 'data:text/csv;charset=utf-8,';

    csvContent += `KHATABOOK STATEMENT - ${statement.riderName}\n`;
    csvContent += `Hub: ${statement.hubName || 'Courier Hub'}\n`;
    csvContent += `Phone: +91 ${statement.riderPhone}\n`;
    csvContent += `Current Net Balance: Rs. ${netBalance} ${netBalanceType}\n`;
    csvContent += `Generated At: ${new Date().toLocaleDateString('en-IN')}\n\n`;

    // 4 Columns
    csvContent += 'Date & Details,Amount Given / Debit (Dr),Amount Earned / Credit (Cr),Running Net Balance (Dr/Cr)\n';

    ledgerRows.forEach((row) => {
      const detailsClean = `"${row.dateStr} - ${row.details.replace(/"/g, '""')}"`;
      const debitStr = row.debit > 0 ? `${row.debit}` : '0';
      const creditStr = row.credit > 0 ? `${row.credit}` : '0';
      const balanceStr = `"${row.runningBalance} ${row.balanceType}"`;
      csvContent += `${detailsClean},${debitStr},${creditStr},${balanceStr}\n`;
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `${statement.riderName.replace(/\s+/g, '_')}_Khatabook_Ledger.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const shareText = statement 
    ? `नमस्ते ${statement.riderName}, आपका कूरियर खाता व Khatabook ऑनलाइन लेजर यहाँ देखें:\nकुल बकाया बैलेंस: ₹${netBalance} ${netBalanceType}\nलिंक: ${statementUrl}` 
    : '';

  const cleanDigits = statement ? getCleanPhoneDigits(statement.riderPhone).slice(-10) : '';
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
          इस राइडर ID के लिए कोई सार्वजनिक लेजर रिकॉर्ड नहीं मिला। कृपया अपने हब मैनेजर से सही लिंक प्राप्त करें।
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
                title="मुख्य डैशबोर्ड पर वापस जाएं"
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
                  <span>खाता लेजर (Khatabook Statement)</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-mono font-medium">
                    Verified Online
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
            {/* Clean Download PDF / Print Button (Prompt Requirement) */}
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

            {/* Explicit Sticky Top-Header Navigation: Clear "✕ Close" button at top-right corner */}
            {onBackToApp && (
              <button
                id="khatabook-top-close-back-btn"
                type="button"
                onClick={onBackToApp}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs shadow-md shadow-red-900/40 border border-red-500/50 transition active:scale-95 cursor-pointer ml-1.5"
                title="✕ Close and return to Riders list"
              >
                <X className="w-4 h-4 text-white" />
                <span>✕ Close</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Container */}
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
                Net Balance: ₹{formatINR(netBalance)} {netBalanceType}
              </span>
            </div>
          </div>
        </div>

        {/* Khatabook-Style Rider Header & Current Net Balance Card (Prompt Requirement) */}
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

            {/* Right: Khatabook Current Net Balance (₹X Dr or ₹X Cr) */}
            <div className={`p-4 rounded-xl border flex flex-col justify-between min-w-[240px] print:bg-slate-50 print:border-slate-300 ${
              netBalanceType === 'Dr'
                ? 'bg-rose-950/30 border-rose-500/40 text-rose-300'
                : netBalanceType === 'Cr'
                ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-300'
                : 'bg-slate-950/70 border-slate-800 text-slate-300'
            }`}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] uppercase font-bold tracking-wider text-slate-400 print:text-slate-700">
                  वर्तमान कुल शेष खाता (Current Net Balance)
                </span>
                <span className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase ${
                  netBalanceType === 'Dr'
                    ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                    : netBalanceType === 'Cr'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    : 'bg-slate-800 text-slate-400'
                }`}>
                  {netBalanceType === 'Dr' ? 'देना बाकी (Dr)' : netBalanceType === 'Cr' ? 'जमा (Cr)' : 'बराबर (Settled)'}
                </span>
              </div>

              <div className="mt-1 flex items-baseline gap-2">
                <div className={`text-2xl sm:text-3xl font-black font-mono tracking-tight ${
                  netBalanceType === 'Dr' ? 'text-rose-400 print:text-rose-700' : netBalanceType === 'Cr' ? 'text-emerald-400 print:text-emerald-700' : 'text-white print:text-black'
                }`}>
                  {formatINR(netBalance)}
                </div>
                <span className={`text-base font-bold font-mono ${
                  netBalanceType === 'Dr' ? 'text-rose-400' : netBalanceType === 'Cr' ? 'text-emerald-400' : 'text-slate-400'
                }`}>
                  {netBalanceType !== 'Zero' ? netBalanceType : ''}
                </span>
              </div>

              <div className="mt-2 pt-2 border-t border-slate-800/80 grid grid-cols-2 gap-2 text-[11px]">
                <div>
                  <span className="text-slate-400 block text-[10px]">कुल दिया (Debit):</span>
                  <span className="font-bold text-rose-400 font-mono">
                    {formatINR(totalDebit)}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">कुल पे-आउट (Credit):</span>
                  <span className="font-bold text-emerald-400 font-mono">
                    {formatINR(totalCredit)}
                  </span>
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* View Selection Tabs */}
        <div className="flex items-center gap-2 border-b border-slate-800 pb-2 print:hidden overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab('khatabook')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition cursor-pointer shrink-0 ${
              activeTab === 'khatabook'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                : 'bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-850'
            }`}
          >
            <Receipt className="w-3.5 h-3.5" />
            <span>Khatabook खाता (4 Columns)</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-950/60 font-mono">
              {ledgerRows.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('advance')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition cursor-pointer shrink-0 ${
              activeTab === 'advance'
                ? 'bg-amber-600 text-white shadow-md shadow-amber-600/30'
                : 'bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-850'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>एडवांस हिस्ट्री (Advances Only)</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-950/60 font-mono">
              {statement.advances?.length || 0}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('salary')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition cursor-pointer shrink-0 ${
              activeTab === 'salary'
                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30'
                : 'bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-850'
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5" />
            <span>सैलरी व पे-आउट (Salaries Only)</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-950/60 font-mono">
              {statement.salaries?.length || 0}
            </span>
          </button>
        </div>

        {/* TAB 1: KHATABOOK 4-COLUMN STATEMENT (STRICT USER SPECIFICATION) */}
        {activeTab === 'khatabook' && (
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden shadow-xl print:border print:border-slate-300 print:bg-white print:shadow-none">
            <div className="p-3.5 sm:p-4 bg-slate-950/70 border-b border-slate-800 flex items-center justify-between flex-wrap gap-2">
              <div>
                <h3 className="text-xs sm:text-sm font-bold text-white print:text-black flex items-center gap-2">
                  <span>खाता विवरण (Khatabook 4-Column Ledger)</span>
                  <span className="text-[10px] text-slate-400 font-normal">
                    (दिनांक अनुसार सम्पूर्ण अग्रिम व भुगतान सूची)
                  </span>
                </h3>
              </div>
              <div className="text-xs text-slate-400 font-mono">
                कुल प्रविष्टियां: <strong className="text-white">{ledgerRows.length}</strong>
              </div>
            </div>

            {ledgerRows.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs">
                इस राइडर के लिए अभी तक कोई लेनदेन दर्ज नहीं किया गया है।
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 bg-slate-950/80 text-slate-300 font-bold sticky top-0 print:bg-slate-100 print:text-black print:border-slate-400">
                      {/* Column 1: Date & Details */}
                      <th className="py-3 px-3 sm:px-4 min-w-[220px]">
                        Date &amp; Details (तारीख और विवरण)
                      </th>
                      {/* Column 2: Amount Given / Debit (Dr) in Red */}
                      <th className="py-3 px-3 sm:px-4 text-right min-w-[130px] text-rose-400 print:text-rose-800 bg-rose-950/10 print:bg-transparent">
                        Amount Given / Dr
                      </th>
                      {/* Column 3: Amount Earned / Credit (Cr) in Green */}
                      <th className="py-3 px-3 sm:px-4 text-right min-w-[140px] text-emerald-400 print:text-emerald-800 bg-emerald-950/10 print:bg-transparent">
                        Amount Earned / Cr
                      </th>
                      {/* Column 4: Running Net Balance */}
                      <th className="py-3 px-3 sm:px-4 text-right min-w-[140px] text-amber-300 print:text-black bg-amber-950/10 print:bg-transparent">
                        Running Net Balance (Dr / Cr)
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70 font-mono print:divide-slate-300">
                    {ledgerRows.map((row) => (
                      <tr 
                        key={row.id} 
                        className="hover:bg-slate-850/50 transition print:hover:bg-transparent"
                      >
                        {/* Col 1: Date & Details */}
                        <td className="py-3 px-3 sm:px-4 font-sans">
                          <div className="flex items-start gap-2">
                            <span className="text-[10px] font-bold font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-200 border border-slate-700/60 print:border-slate-300 print:bg-slate-100 print:text-black shrink-0 mt-0.5">
                              {row.dateStr}
                            </span>
                            <div>
                              <div className="font-semibold text-slate-200 print:text-black text-xs">
                                {row.details}
                              </div>
                              {row.subDetails && (
                                <div className="text-[10px] text-slate-400 print:text-slate-600 mt-0.5 font-sans">
                                  {row.subDetails}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Col 2: Amount Given / Debit (Dr) in Red Column */}
                        <td className="py-3 px-3 sm:px-4 text-right font-bold bg-rose-950/10 print:bg-transparent">
                          {row.debit > 0 ? (
                            <span className="text-rose-400 print:text-rose-700">
                              + {formatINR(row.debit)}
                            </span>
                          ) : (
                            <span className="text-slate-600 print:text-slate-400 font-normal">-</span>
                          )}
                        </td>

                        {/* Col 3: Amount Received / Credit (Cr) in Green Column */}
                        <td className="py-3 px-3 sm:px-4 text-right font-bold bg-emerald-950/10 print:bg-transparent">
                          {row.credit > 0 ? (
                            <span className="text-emerald-400 print:text-emerald-700">
                              + {formatINR(row.credit)}
                            </span>
                          ) : (
                            <span className="text-slate-600 print:text-slate-400 font-normal">-</span>
                          )}
                        </td>

                        {/* Col 4: Running Net Balance Styled With Dr in Red or Cr in Green */}
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
                            <span className="text-slate-400">₹0 Settled</span>
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
                        netBalanceType === 'Dr' ? 'text-rose-400 print:text-rose-700' : netBalanceType === 'Cr' ? 'text-emerald-400 print:text-emerald-700' : 'text-white print:text-black'
                      }`}>
                        {formatINR(netBalance)} {netBalanceType !== 'Zero' ? netBalanceType : ''}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: DETAILED ADVANCES TABLE */}
        {activeTab === 'advance' && (
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden shadow-xl print:border print:border-slate-300 print:bg-white print:shadow-none">
            <div className="p-3.5 sm:p-4 bg-slate-950/70 border-b border-slate-800 flex items-center justify-between flex-wrap gap-2">
              <h3 className="text-xs sm:text-sm font-bold text-white print:text-black flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-400" />
                <span>अग्रिम इतिहास तालिका (Advance History Table)</span>
              </h3>
              <div className="text-xs text-amber-400 font-bold font-mono">
                कुल बकाया: {formatINR(statement.totalAdvance || 0)}
              </div>
            </div>

            {(!statement.advances || statement.advances.length === 0) ? (
              <div className="p-8 text-center text-slate-400 text-xs">
                कोई अग्रिम प्रविष्टि दर्ज नहीं है।
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs font-mono">
                  <thead>
                    <tr className="border-b border-slate-800 bg-slate-950/80 text-slate-400 font-semibold sticky top-0 print:bg-slate-100 print:text-black">
                      <th className="py-2.5 px-3">Date</th>
                      <th className="py-2.5 px-3 text-right">Advance Amount (₹)</th>
                      <th className="py-2.5 px-3 font-sans">Reason / Purpose</th>
                      <th className="py-2.5 px-3 text-right">Running Advance Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {statement.advances.map((adv) => (
                      <tr key={adv.id} className="hover:bg-slate-850/40 transition">
                        <td className="py-2.5 px-3 text-slate-200 print:text-black">
                          {adv.date ? formatDateDisplay(adv.date) : formatDateDisplay(adv.createdAt)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold text-rose-400 print:text-rose-700">
                          + {formatINR(adv.amount)}
                        </td>
                        <td className="py-2.5 px-3 font-sans text-slate-300 print:text-black">
                          {adv.reason || 'सामान्य एडवांस'}
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold text-amber-300 print:text-black">
                          {formatINR(adv.runningBalance !== undefined ? adv.runningBalance : (statement.totalAdvance || 0))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: DETAILED SALARIES & PAYOUTS TABLE */}
        {activeTab === 'salary' && (
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden shadow-xl print:border print:border-slate-300 print:bg-white print:shadow-none">
            <div className="p-3.5 sm:p-4 bg-slate-950/70 border-b border-slate-800 flex items-center justify-between flex-wrap gap-2">
              <h3 className="text-xs sm:text-sm font-bold text-white print:text-black flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-emerald-400" />
                <span>वेतन व पे-आउट इतिहास (Salary &amp; Payout History)</span>
              </h3>
            </div>

            {(!statement.salaries || statement.salaries.length === 0) ? (
              <div className="p-8 text-center text-slate-400 text-xs">
                कोई वेतन/पे-आउट प्रविष्टि दर्ज नहीं है।
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs font-mono">
                  <thead>
                    <tr className="border-b border-slate-800 bg-slate-950/80 text-slate-400 font-semibold sticky top-0 print:bg-slate-100 print:text-black">
                      <th className="py-2.5 px-3 font-sans">Pay Period (From - To)</th>
                      <th className="py-2.5 px-3 text-center">Deliveries</th>
                      <th className="py-2.5 px-3 text-right">Gross Earnings</th>
                      <th className="py-2.5 px-3 text-right text-rose-400">Advance Deducted</th>
                      <th className="py-2.5 px-3 text-right text-emerald-400">Net Payout Paid</th>
                      <th className="py-2.5 px-3 text-right">Settled Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {statement.salaries.map((sal) => (
                      <tr key={sal.id} className="hover:bg-slate-850/40 transition">
                        <td className="py-2.5 px-3 text-slate-200 font-sans font-medium print:text-black">
                          {sal.startDate} to {sal.endDate}
                        </td>
                        <td className="py-2.5 px-3 text-center text-white print:text-black">
                          {sal.totalParcels} pkts
                        </td>
                        <td className="py-2.5 px-3 text-right text-slate-300 print:text-black">
                          {formatINR(sal.grossTotal)}
                        </td>
                        <td className="py-2.5 px-3 text-right text-rose-400 print:text-rose-700">
                          {sal.advanceAmount > 0 ? `- ${formatINR(sal.advanceAmount)}` : '₹0'}
                        </td>
                        <td className="py-2.5 px-3 text-right font-black text-emerald-400 print:text-emerald-700">
                          {formatINR(sal.netTotal)}
                        </td>
                        <td className="py-2.5 px-3 text-right text-slate-400 print:text-black">
                          {sal.paidAt ? sal.paidAt.split('T')[0] : sal.endDate}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Print / Formal Footer with Signatures */}
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
