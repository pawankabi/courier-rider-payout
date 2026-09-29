import React, { useState, useMemo, useEffect } from 'react';
import { 
  CheckCircle2, 
  Clock, 
  MessageCircle, 
  Calendar, 
  User, 
  Package, 
  Coins, 
  Sparkles, 
  Share2, 
  AlertCircle,
  Receipt,
  Search,
  CheckCheck,
  Wallet,
  MinusCircle,
  Download,
  History,
  X,
  ArrowRight,
  TrendingDown,
  Phone,
  IndianRupee
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { DeliveryEntry, Rider, SettlementRecord } from '../types';
import { 
  formatINR, 
  formatDateDisplay, 
  getTodayDateString, 
  getDaysAgoDateString, 
  BASE_RATE, 
  INCENTIVE_RATE 
} from '../utils/formatters';
import { WhatsAppSlipModal } from './WhatsAppSlipModal';
import { WhatsAppSlipData } from '../utils/whatsapp';
import { generatePayoutPDF } from '../utils/pdfGenerator';
import { 
  generateStatementUrl, 
  formatSalarySmsText, 
  dispatchAutomatedSms, 
  getWhatsAppUrl, 
  getNativeSmsUrl 
} from '../services/smsService';
import { isNativeAndroid, sendNativeBackgroundSms } from '../services/nativeSms';

interface Props {
  riders: Rider[];
  entries: DeliveryEntry[];
  settlements?: SettlementRecord[];
  hubName?: string;
  onMarkEntriesPaid: (
    entryIds: string[],
    advanceAmount: number,
    advanceDate?: string,
    settlementDetails?: {
      riderId: string;
      riderName: string;
      riderPhone: string;
      startDate: string;
      endDate: string;
      totalParcels: number;
      baseAmount: number;
      incentiveAmount: number;
      grossTotal: number;
      advanceReason?: string;
    }
  ) => void;
  onToggleEntryStatus: (entryId: string) => void;
  onNavigateToRiders: () => void;
  onViewLedger?: (riderId: string) => void;
}

export const SettlementTab: React.FC<Props> = ({
  riders,
  entries,
  settlements = [],
  hubName,
  onMarkEntriesPaid,
  onToggleEntryStatus,
  onNavigateToRiders,
  onViewLedger,
}) => {
  // Filter States
  const [selectedRiderId, setSelectedRiderId] = useState<string>(
    riders.length > 0 ? riders[0].id : ''
  );
  const [startDate, setStartDate] = useState<string>(getDaysAgoDateString(14));
  const [endDate, setEndDate] = useState<string>(getTodayDateString());
  const [statusFilter, setStatusFilter] = useState<'All' | 'Unpaid' | 'Paid'>('All');

  // Advance Payment States (Auto-populated with lifetime advance, date, and purpose)
  const [advanceAmount, setAdvanceAmount] = useState<number | string>(0);
  const [advanceDate, setAdvanceDate] = useState<string>('');
  const [advanceReason, setAdvanceReason] = useState<string>('');

  // WhatsApp Slip Modal State
  const [slipData, setSlipData] = useState<WhatsAppSlipData | null>(null);
  const [isExportingPDF, setIsExportingPDF] = useState(false);

  // Instant Salary SMS Feedback State
  const [salarySmsFeedback, setSalarySmsFeedback] = useState<{
    riderName: string;
    phone: string;
    smsMessage: string;
    statementUrl: string;
    waUrl: string;
    smsUrl: string;
    statusText: string;
    netSalary: number;
  } | null>(null);

  // Selected Rider Object
  const selectedRider = useMemo(() => {
    return riders.find((r) => r.id === selectedRiderId) || riders[0];
  }, [riders, selectedRiderId]);

  // 15-Day Payout Presets
  const setFirstHalfOfMonth = () => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    setStartDate(`${y}-${m}-01`);
    setEndDate(`${y}-${m}-15`);
  };

  const setSecondHalfOfMonth = () => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const lastDay = new Date(y, now.getMonth() + 1, 0).getDate();
    setStartDate(`${y}-${m}-16`);
    setEndDate(`${y}-${m}-${lastDay}`);
  };

  const setLast15Days = () => {
    setStartDate(getDaysAgoDateString(14));
    setEndDate(getTodayDateString());
  };

  // Filtered Entries for Settlement
  const filteredEntries = useMemo(() => {
    if (!selectedRider) return [];

    return entries.filter((entry) => {
      if (entry.riderId !== selectedRider.id) return false;
      if (startDate && entry.date < startDate) return false;
      if (endDate && entry.date > endDate) return false;
      if (statusFilter === 'Unpaid' && entry.status !== 'Unpaid') return false;
      if (statusFilter === 'Paid' && entry.status !== 'Paid') return false;
      return true;
    }).sort((a, b) => a.date.localeCompare(b.date));
  }, [entries, selectedRider, startDate, endDate, statusFilter]);

  // Relevant past settlement for this rider and date range (if already settled)
  const matchingSettlement = useMemo(() => {
    if (!selectedRider) return undefined;
    return settlements.find(
      (s) =>
        s.riderId === selectedRider.id &&
        s.startDate === startDate &&
        s.endDate === endDate
    );
  }, [settlements, selectedRider, startDate, endDate]);

  // Auto-populate advance deduction: If selecting an already settled period, use saved record;
  // otherwise, auto-deduct total lifetime advance of the rider (independent of selected date range)
  useEffect(() => {
    if (matchingSettlement) {
      setAdvanceAmount(matchingSettlement.advanceAmount || 0);
      setAdvanceDate(matchingSettlement.advanceDate || '');
      setAdvanceReason(matchingSettlement.advanceReason || '');
    } else {
      // Auto-deduct entire active advance balance of the rider
      const lifetimeAdv = Number(selectedRider?.totalAdvance) || 0;
      setAdvanceAmount(lifetimeAdv);
      setAdvanceDate(getTodayDateString());
      setAdvanceReason('');
    }
  }, [selectedRiderId, startDate, endDate, matchingSettlement]);

  // Unpaid entries specifically for the Mark As Paid action
  const unpaidEntries = useMemo(() => {
    return filteredEntries.filter((e) => e.status === 'Unpaid');
  }, [filteredEntries]);

  // Aggregated delivery figures
  const totalParcels = filteredEntries.reduce((sum, e) => sum + e.parcels, 0);
  const totalBaseAmount = filteredEntries.reduce((sum, e) => sum + e.baseAmount, 0);
  const totalIncentiveAmount = filteredEntries.reduce((sum, e) => sum + e.incentiveAmount, 0);
  const grossTotal = filteredEntries.reduce((sum, e) => sum + e.totalEarnings, 0);

  // Real-Time Calculation with Advance Deduction:
  // Gross Earning = Sum of daily deliveries within the selected Date Range
  // Total Advance Deducted = Entire active advance balance of the rider
  // Net Settlement = Gross Earning - Total Advance
  const numericAdvance = Math.max(0, Number(advanceAmount) || 0);
  const netSettlement = grossTotal - numericAdvance;
  const netPayableAmount = Math.max(0, netSettlement);

  const unpaidGross = filteredEntries
    .filter((e) => e.status === 'Unpaid')
    .reduce((sum, e) => sum + e.totalEarnings, 0);

  const paidGross = filteredEntries
    .filter((e) => e.status === 'Paid')
    .reduce((sum, e) => sum + e.totalEarnings, 0);

  // Quick preset advance buttons
  const handleAddPresetAdvance = (val: number) => {
    setAdvanceAmount((prev) => (Number(prev) || 0) + val);
  };

  const handleResetAdvance = () => {
    setAdvanceAmount(0);
    setAdvanceDate('');
    setAdvanceReason('');
  };

  // Mark all entries as Paid
  const handleMarkAllAsPaid = () => {
    if (unpaidEntries.length === 0) {
      alert('All entries in this date range are already marked as Paid!');
      return;
    }

    const ids = unpaidEntries.map((e) => e.id);
    onMarkEntriesPaid(ids, numericAdvance, advanceDate || undefined, {
      riderId: selectedRider.id,
      riderName: selectedRider.name,
      riderPhone: selectedRider.phone,
      startDate,
      endDate,
      totalParcels,
      baseAmount: totalBaseAmount,
      incentiveAmount: totalIncentiveAmount,
      grossTotal,
      advanceReason: advanceReason.trim() || undefined,
    });

    // Fire celebratory confetti!
    try {
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 },
      });
    } catch {
      // safe fallback
    }

    // Generate canonical public ledger link for the rider: ${window.location.origin}/statement/${rider.id}
    const statementUrl = generateStatementUrl(selectedRider.id);

    // Format Dynamic SIM Background SMS on settlement:
    // If Net Settlement >= 0:
    // "नमस्ते [Rider], आपका दिनांक [From Date] से [To Date] तक कुल पारिश्रमिक ₹[Gross] बना है। आपका कुल एडवांस ₹[Advance] समायोजित कर कुल नेट भुगतान ₹[Net] कर दिया गया है। धन्यवाद - [Hub Name]"
    // If Net Settlement < 0 (Overpaid / Recovery Due):
    // "नमस्ते [Rider], आपका दिनांक [From Date] से [To Date] तक का कुल पारिश्रमिक ₹[Gross] बना, जबकि आपका कुल एडवांस ₹[Advance] था। हिसाब के उपरांत आपसे ₹[Math.abs(Net)] लेना शेष है। कृपया यह राशि आज ही कार्यालय में जमा कर दें ताकि अन्य डिलीवरी साथियों को भुगतान किया जा सके। आपके सहयोग के लिए धन्यवाद - [Hub Name]"
    const cleanPhone = (selectedRider.phone || '').trim().replace(/\D/g, '').slice(-10);
    const effectiveHubName = (hubName || '').trim() || 'सरायकेला कूरियर हब';

    const settlementSms =
      netSettlement >= 0
        ? `नमस्ते ${selectedRider.name}, आपका दिनांक ${formatDateDisplay(startDate)} से ${formatDateDisplay(endDate)} तक कुल पारिश्रमिक ₹${grossTotal} बना है। आपका कुल एडवांस ₹${numericAdvance} समायोजित कर कुल नेट भुगतान ₹${netSettlement} कर दिया गया है। धन्यवाद - ${effectiveHubName}`
        : `नमस्ते ${selectedRider.name}, आपका दिनांक ${formatDateDisplay(startDate)} से ${formatDateDisplay(endDate)} तक का कुल पारिश्रमिक ₹${grossTotal} बना, जबकि आपका कुल एडवांस ₹${numericAdvance} था। हिसाब के उपरांत आपसे ₹${Math.abs(netSettlement)} लेना शेष है। कृपया यह राशि आज ही कार्यालय में जमा कर दें ताकि अन्य डिलीवरी साथियों को भुगतान किया जा सके। आपके सहयोग के लिए धन्यवाद - ${effectiveHubName}`;

    const waUrl = getWhatsAppUrl(selectedRider.phone, settlementSms);
    const smsUrl = getNativeSmsUrl(selectedRider.phone, settlementSms);

    if (isNativeAndroid()) {
      sendNativeBackgroundSms(cleanPhone, settlementSms).then((smsRes) => {
        setSalarySmsFeedback({
          riderName: selectedRider.name,
          phone: selectedRider.phone,
          smsMessage: settlementSms,
          statementUrl,
          waUrl,
          smsUrl,
          statusText: smsRes.success
            ? '✅ सिम से पे-आउट सेटलमेंट SMS सफलतापूर्वक भेजा गया।'
            : `⚠️ सिम SMS सूचना: ${smsRes.error || 'सिम से नहीं भेजा जा सका'}`,
          netSalary: netPayableAmount,
        });
      });
    } else {
      // Trigger automated background API call (Fast2SMS / MSG91 / Webhook)
      dispatchAutomatedSms({
        riderPhone: selectedRider.phone,
        riderName: selectedRider.name,
        message: settlementSms,
        type: 'salary',
        statementUrl,
        amount: netPayableAmount,
      }).then((res) => {
        setSalarySmsFeedback({
          riderName: selectedRider.name,
          phone: selectedRider.phone,
          smsMessage: settlementSms,
          statementUrl,
          waUrl,
          smsUrl,
          statusText: res.message || 'वेतन SMS डिस्पैच सक्रिय!',
          netSalary: netPayableAmount,
        });
      });
    }
  };

  // Open WhatsApp Slip with full advance deduction breakdown
  const handleOpenSlip = () => {
    if (!selectedRider) return;

    setSlipData({
      riderName: selectedRider.name,
      phone: selectedRider.phone,
      startDate,
      endDate,
      totalParcels,
      baseAmount: totalBaseAmount,
      incentiveAmount: totalIncentiveAmount,
      totalAmount: grossTotal,
      advanceAmount: numericAdvance,
      advanceDate: advanceDate || undefined,
      advanceReason: advanceReason.trim() || undefined,
      netAmount: netPayableAmount,
      status: unpaidGross === 0 && grossTotal > 0 ? 'PAID' : 'UNPAID',
      settledDate: unpaidGross === 0 ? new Date().toISOString() : undefined,
      daysWorkedCount: filteredEntries.length,
    });
  };

  // Download PDF Payout Slip with Advance Deduction
  const handleDownloadPDFReceipt = () => {
    if (filteredEntries.length === 0) return;
    setIsExportingPDF(true);
    try {
      generatePayoutPDF({
        riderFilterName: selectedRider.name,
        startDate,
        endDate,
        entries: filteredEntries,
        advanceAmount: numericAdvance,
        advanceDate: advanceDate || undefined,
        isSettlementReceipt: true,
        riders,
      });
    } catch (err) {
      console.error('Error generating PDF receipt', err);
      alert('Could not export PDF receipt. Please check details.');
    } finally {
      setTimeout(() => setIsExportingPDF(false), 800);
    }
  };

  // Rider's past settlements history
  const riderSettlements = useMemo(() => {
    if (!selectedRider) return [];
    return settlements.filter((s) => s.riderId === selectedRider.id);
  }, [settlements, selectedRider]);

  if (riders.length === 0) {
    return (
      <div className="bg-slate-850 rounded-2xl border border-slate-750 p-8 text-center max-w-md mx-auto my-12">
        <AlertCircle className="w-10 h-10 text-amber-400 mx-auto mb-3" />
        <h3 className="font-bold text-base text-white">No Riders Available</h3>
        <p className="text-xs text-slate-400 mt-1 mb-4">
          Please add courier riders first to process settlements, advance deductions, and share WhatsApp payment slips.
        </p>
        <button
          onClick={onNavigateToRiders}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-xl"
        >
          Add Riders Now
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      {/* Header & Filter Card */}
      <div className="bg-slate-850 border border-slate-750 rounded-2xl p-4 sm:p-6 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 rounded-xl bg-emerald-600/20 text-emerald-400 border border-emerald-500/30">
              <Receipt className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white tracking-tight">
                15-Day / Custom Payout Settlement
              </h2>
              <p className="text-xs text-slate-400">
                Advance deductions, instant balance clearance, PDF statements, and WhatsApp slips
              </p>
            </div>
          </div>

          {/* Action Buttons: WhatsApp Slip & PDF Receipt */}
          <div className="flex items-center gap-2 flex-wrap">
            {selectedRider && (
              <a
                id="call-settlement-rider-top-btn"
                href={`tel:${selectedRider.phone}`}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/40 text-blue-300 hover:text-white text-xs font-bold rounded-xl shadow-sm transition active:scale-95"
                title={`Direct Call ${selectedRider.name}`}
              >
                <Phone className="w-3.5 h-3.5" />
                <span>Call Rider</span>
              </a>
            )}

            <button
              id="download-settlement-pdf-btn"
              onClick={handleDownloadPDFReceipt}
              disabled={filteredEntries.length === 0 || isExportingPDF}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-750 border border-slate-700 text-slate-200 disabled:opacity-50 disabled:cursor-not-allowed text-xs font-semibold rounded-xl transition"
              title="Download official PDF payout receipt"
            >
              <Download className="w-3.5 h-3.5 text-blue-400" />
              <span>{isExportingPDF ? 'Generating...' : 'Download PDF'}</span>
            </button>

            <button
              id="share-slip-whatsapp-btn"
              onClick={handleOpenSlip}
              disabled={filteredEntries.length === 0}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold rounded-xl shadow-lg shadow-emerald-600/25 active:scale-95 transition"
            >
              <MessageCircle className="w-4 h-4" />
              <span>Share Slip on WhatsApp</span>
            </button>
          </div>
        </div>

        {/* Filters: Rider Selection & Date Range */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3.5 pt-2 border-t border-slate-800">
          {/* Rider Selector */}
          <div className="md:col-span-5">
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-slate-300">
                Select Courier Rider:
              </label>
              {selectedRider && (
                <a
                  href={`tel:${selectedRider.phone}`}
                  className="inline-flex items-center gap-1 text-[11px] text-blue-400 hover:text-blue-300 font-bold"
                >
                  <Phone className="w-3 h-3" />
                  <span>Call ({selectedRider.phone})</span>
                </a>
              )}
            </div>
            <div className="relative">
              <select
                id="settlement-rider-select"
                value={selectedRiderId}
                onChange={(e) => setSelectedRiderId(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-xs font-semibold text-slate-100 focus:outline-none focus:border-blue-500 appearance-none"
              >
                {riders.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} • +91 {r.phone} {Number(r.totalAdvance || 0) > 0 ? `(एडवांस: ${formatINR(r.totalAdvance || 0)})` : ''}
                  </option>
                ))}
              </select>
              <div className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 text-xs">
                ▼
              </div>
            </div>

            {/* Direct Call & WhatsApp Contact Pill with Active Advance Badge */}
            {selectedRider && (
              <div className="mt-2 flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-slate-900/90 border border-slate-755 text-xs">
                <div className="flex items-center gap-2 truncate">
                  <span className="text-slate-300 font-mono text-[11px] truncate">
                    +91 {selectedRider.phone}
                  </span>
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold border shrink-0 ${
                    Number(selectedRider.totalAdvance || 0) > 0
                      ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40'
                      : 'bg-slate-800 text-slate-400 border-slate-700'
                  }`}>
                    <IndianRupee className="w-3 h-3 text-indigo-400" />
                    <span>एडवांस: {formatINR(selectedRider.totalAdvance || 0)}</span>
                  </span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <a
                    id="call-settlement-rider-btn"
                    href={`tel:${selectedRider.phone}`}
                    className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/40 text-blue-300 hover:text-white text-[11px] font-bold shadow-sm transition active:scale-95"
                    title={`Direct Call ${selectedRider.name}`}
                  >
                    <Phone className="w-3 h-3" />
                    <span>Call</span>
                  </a>
                  <a
                    id="wa-settlement-rider-btn"
                    href={`https://wa.me/91${selectedRider.phone}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 text-[11px] font-semibold transition"
                    title="Chat on WhatsApp"
                  >
                    <MessageCircle className="w-3 h-3" />
                    <span>WhatsApp</span>
                  </a>
                </div>
              </div>
            )}
          </div>

          {/* Date Range */}
          <div className="md:col-span-7 space-y-1.5">
            <label className="block text-xs font-semibold text-slate-300">
              Settlement Period:
            </label>
            <div className="grid grid-cols-2 gap-2">
              <input
                id="settlement-start-date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs font-medium text-slate-100 focus:outline-none focus:border-blue-500"
              />
              <input
                id="settlement-end-date"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs font-medium text-slate-100 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>
        </div>

        {/* 15-Day Payout Presets Row */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          <span className="text-[11px] font-semibold text-slate-400 mr-1">
            Settlement Cycles:
          </span>
          <button
            type="button"
            onClick={setLast15Days}
            className="px-2.5 py-1 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-300 border border-slate-700 transition"
          >
            Last 15 Days
          </button>
          <button
            type="button"
            onClick={setFirstHalfOfMonth}
            className="px-2.5 py-1 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-300 border border-slate-700 transition"
          >
            1st to 15th of Month
          </button>
          <button
            type="button"
            onClick={setSecondHalfOfMonth}
            className="px-2.5 py-1 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-300 border border-slate-700 transition"
          >
            16th to End of Month
          </button>

          <div className="ml-auto flex items-center gap-1 bg-slate-800 p-0.5 rounded-lg border border-slate-700">
            {(['All', 'Unpaid', 'Paid'] as const).map((filter) => (
              <button
                key={filter}
                onClick={() => setStatusFilter(filter)}
                className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition ${
                  statusFilter === filter
                    ? 'bg-blue-600 text-white shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {filter}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* NEW: Advance Payment Deduction Section */}
      <div
        id="advance-payment-deduction-section"
        className="bg-gradient-to-br from-slate-850 to-slate-900 border border-amber-500/30 rounded-2xl p-4 sm:p-5 shadow-xl relative overflow-hidden"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-500/15 text-amber-400 border border-amber-500/30">
              <Wallet className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm sm:text-base text-white">
                  Deduct Advance Payment (Optional)
                </h3>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
                  कुल एक्टिव एडवांस: {formatINR(selectedRider?.totalAdvance || 0)}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                कुल एक्टिव एडवांस राशि स्वचालित रूप से समायोजित की जाएगी
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {(selectedRider?.totalAdvance || 0) > 0 && Number(advanceAmount) !== (selectedRider?.totalAdvance || 0) && (
              <button
                type="button"
                onClick={() => setAdvanceAmount(selectedRider?.totalAdvance || 0)}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-300 hover:text-white bg-indigo-500/20 px-2.5 py-1 rounded-lg border border-indigo-500/30 transition"
                title="Use entire lifetime advance"
              >
                <span>कुल एडवांस भरें ({formatINR(selectedRider?.totalAdvance || 0)})</span>
              </button>
            )}
            {numericAdvance > 0 && (
              <button
                type="button"
                onClick={handleResetAdvance}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-400 hover:text-amber-400 transition"
              >
                <X className="w-3.5 h-3.5" />
                <span>Reset Advance</span>
              </button>
            )}
          </div>
        </div>

        {/* Advance Input Controls */}
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3.5 mt-3.5">
          {/* Field 1: Advance Amount */}
          <div className="sm:col-span-6 space-y-1.5">
            <label className="block text-xs font-semibold text-slate-300">
              Advance Amount (₹):
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-bold text-amber-400 text-sm">
                ₹
              </span>
              <input
                id="advance-amount-input"
                type="number"
                min="0"
                step="any"
                placeholder="0"
                value={advanceAmount === 0 ? '' : advanceAmount}
                onChange={(e) => {
                  const val = e.target.value;
                  setAdvanceAmount(val === '' ? 0 : Math.max(0, Number(val)));
                }}
                className="w-full pl-8 pr-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-sm font-bold text-amber-300 placeholder-slate-500 focus:outline-none focus:border-amber-500 transition"
              />
            </div>

            {/* Quick preset chips */}
            <div className="flex items-center gap-1.5 pt-1 overflow-x-auto">
              <span className="text-[10px] text-slate-500 font-medium shrink-0">Quick Add:</span>
              {[200, 500, 1000, 2000].map((val) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => handleAddPresetAdvance(val)}
                  className="px-2 py-0.5 text-[11px] font-semibold rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-300 border border-slate-700 hover:border-amber-500/40 transition shrink-0"
                >
                  +₹{val}
                </button>
              ))}
            </div>
          </div>

          {/* Field 2: Advance Date (Optional Date Picker) */}
          <div className="sm:col-span-6 space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-semibold text-slate-300">
                Advance Date (Optional):
              </label>
              {advanceDate && (
                <button
                  type="button"
                  onClick={() => setAdvanceDate('')}
                  className="text-[10px] text-slate-400 hover:text-white"
                >
                  Clear Date
                </button>
              )}
            </div>
            <div className="relative">
              <input
                id="advance-date-picker"
                type="date"
                value={advanceDate}
                onChange={(e) => setAdvanceDate(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-xs font-medium text-slate-100 focus:outline-none focus:border-amber-500 transition"
              />
            </div>
            <p className="text-[11px] text-slate-400">
              {advanceDate
                ? `Advance recorded for: ${formatDateDisplay(advanceDate)}`
                : 'Leave blank if advance date is not specified'}
            </p>
          </div>

          {/* Field 3: Advance Reason / Purpose */}
          <div className="sm:col-span-12 space-y-1.5 pt-1 border-t border-slate-800/80">
            <label className="block text-xs font-semibold text-slate-300">
              एडवांस देने का कारण (Reason / Purpose):
            </label>
            <input
              id="advance-reason-input"
              type="text"
              placeholder="e.g., Fuel / Bike Repair / Cash Advance / Emergency"
              value={advanceReason}
              onChange={(e) => setAdvanceReason(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-xs font-medium text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500 transition"
            />
          </div>
        </div>

        {/* Real-time Calculation Breakdown Strip */}
        <div className="mt-4 p-3 rounded-xl bg-slate-900/90 border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-2 sm:gap-4">
            <div className="flex items-center gap-1.5">
              <span className="text-slate-400">Gross Total:</span>
              <span className="font-bold text-white">{formatINR(grossTotal)}</span>
            </div>
            <span className="text-slate-600 hidden sm:inline">—</span>
            <div className="flex items-center gap-1.5">
              <span className="text-amber-400 flex items-center gap-1">
                <MinusCircle className="w-3.5 h-3.5" />
                Advance:
              </span>
              <span className="font-bold text-amber-300">
                {numericAdvance > 0 ? `-${formatINR(numericAdvance)}` : '₹0'}
              </span>
              {numericAdvance > 0 && advanceDate && (
                <span className="text-[10px] text-slate-400">({formatDateDisplay(advanceDate)})</span>
              )}
              {numericAdvance > 0 && advanceReason && (
                <span className="text-[10px] text-amber-300/80 max-w-[150px] truncate">[{advanceReason}]</span>
              )}
            </div>
            <span className="text-slate-600 hidden sm:inline">=</span>
          </div>

          <div className="flex items-center gap-2 pt-2 md:pt-0 border-t md:border-t-0 border-slate-800">
            {netSettlement >= 0 ? (
              <div className="flex items-center gap-2 bg-emerald-500/10 px-3 py-1.5 rounded-xl border border-emerald-500/30">
                <span className="font-bold text-emerald-400 uppercase tracking-wider text-[11px]">
                  FINAL NET PAYABLE:
                </span>
                <span className="text-base sm:text-lg font-black text-emerald-300">
                  {formatINR(netSettlement)}
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2 bg-rose-500/15 px-3 py-1.5 rounded-xl border border-rose-500/40">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                <span className="font-bold text-rose-300 uppercase tracking-wider text-[11px]">
                  राइडर से लेना बाकी (Recovery Due):
                </span>
                <span className="text-base sm:text-lg font-black text-rose-200">
                  {formatINR(Math.abs(netSettlement))}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Prominent Recovery Due Alert Banner when advance exceeds gross */}
        {netSettlement < 0 && (
          <div className="mt-3 p-3.5 rounded-xl bg-gradient-to-r from-rose-950/60 via-amber-950/40 to-slate-900 border border-rose-500/50 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-lg">
            <div className="flex items-center gap-2.5">
              <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
              <div>
                <p className="text-rose-200 font-bold">
                  कुल एक्टिव एडवांस ({formatINR(numericAdvance)}) इस अवधि के पारिश्रमिक ({formatINR(grossTotal)}) से अधिक है।
                </p>
                <p className="text-[11px] text-slate-300 mt-0.5">
                  हिसाब के उपरांत शेष राशि राइडर के लेजर में रिकवरी हेतु दर्ज रहेगी।
                </p>
              </div>
            </div>
            <div className="text-rose-300 font-bold flex items-center gap-2 shrink-0">
              <span className="text-xs uppercase">राइडर से लेना बाकी:</span>
              <span className="text-rose-100 text-sm font-black bg-rose-900/80 px-2.5 py-1 rounded-lg border border-rose-500/60 shadow">
                {formatINR(Math.abs(netSettlement))}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Instant Salary Settlement SMS Trigger Feedback Banner */}
      {salarySmsFeedback && (
        <div className="bg-emerald-950/40 border border-emerald-500/40 rounded-2xl p-4 sm:p-5 shadow-xl space-y-3 animate-in fade-in">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-emerald-300">
                  {salarySmsFeedback.statusText}
                </h4>
                <p className="text-xs text-slate-300 mt-0.5">
                  वेतन भुगतान संदेश स्वचालित रूप से +91 {selectedRider?.phone} पर डिस्पैच किया गया है।
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setSalarySmsFeedback(null)}
              className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 text-xs text-slate-200 leading-relaxed font-sans">
            {salarySmsFeedback.smsMessage}
          </div>

          <div className="flex items-center gap-2.5 flex-wrap pt-1">
            {/* 1-Click WhatsApp Fallback Button */}
            <a
              href={salarySmsFeedback.waUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#25D366] hover:bg-[#20bd5a] text-slate-950 text-xs font-bold shadow transition active:scale-95 cursor-pointer"
              title="1-Click WhatsApp Delivery"
            >
              <MessageCircle className="w-4 h-4" />
              <span>📲 Send via WhatsApp (1-Click)</span>
            </a>

            {/* 1-Click Native SMS Fallback Button */}
            <a
              href={salarySmsFeedback.smsUrl}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow transition active:scale-95 cursor-pointer"
              title="1-Click Native SMS Delivery"
            >
              <Phone className="w-4 h-4" />
              <span>📲 Send via SMS</span>
            </a>

            {/* Online Public Sheet View */}
            {onViewLedger && (
              <button
                type="button"
                onClick={() => onViewLedger(selectedRider.id)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold transition ml-auto"
              >
                <span>📄 View Online Excel Sheet</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Payout Summary & "Mark as Paid" Action Card */}
      <div className="bg-gradient-to-br from-slate-850 via-slate-850 to-slate-900 border border-slate-750 rounded-2xl p-5 sm:p-6 shadow-xl relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-blue-400">
                Settlement Statement For:
              </span>
              <span className="text-sm font-black text-white">{selectedRider?.name}</span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              WhatsApp: +91 {selectedRider?.phone} • Period: {formatDateDisplay(startDate)} to {formatDateDisplay(endDate)}
            </p>
          </div>

          {/* Mark as Paid Button */}
          <button
            id="mark-all-as-paid-btn"
            onClick={handleMarkAllAsPaid}
            disabled={unpaidEntries.length === 0}
            className="inline-flex items-center justify-center gap-2 px-5 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs sm:text-sm font-bold rounded-xl shadow-lg shadow-blue-600/25 active:scale-95 transition"
          >
            <CheckCheck className="w-4 h-4" />
            <span>Mark {unpaidEntries.length} Unpaid as Paid</span>
          </button>
        </div>

        {/* 4 Financial Figures in Settlement: Parcels, Gross Total, Advance Deducted, Final Net Payable */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 mt-5">
          {/* 1. Total Parcels */}
          <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800">
            <div className="text-[10px] uppercase font-bold text-slate-400">Total Parcels</div>
            <div className="text-lg sm:text-xl font-extrabold text-white mt-1">
              {totalParcels.toLocaleString('en-IN')} pkts
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              Across {filteredEntries.length} delivery shifts
            </div>
          </div>

          {/* 2. Gross Delivery Total */}
          <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800">
            <div className="text-[10px] uppercase font-bold text-slate-400">
              Gross Total (₹13 + ₹2)
            </div>
            <div className="text-lg sm:text-xl font-extrabold text-slate-100 mt-1">
              {formatINR(grossTotal)}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              Base {formatINR(totalBaseAmount)} + Inc {formatINR(totalIncentiveAmount)}
            </div>
          </div>

          {/* 3. Advance Deducted */}
          <div className="p-3.5 rounded-xl bg-slate-900/80 border border-amber-500/30">
            <div className="text-[10px] uppercase font-bold text-amber-400">
              Advance Deducted
            </div>
            <div className="text-lg sm:text-xl font-extrabold text-amber-300 mt-1">
              {numericAdvance > 0 ? `-${formatINR(numericAdvance)}` : '₹0'}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5 truncate">
              {numericAdvance > 0 && advanceDate
                ? `Date: ${formatDateDisplay(advanceDate)}`
                : numericAdvance > 0
                ? 'Advance applied'
                : 'No advance taken'}
            </div>
          </div>

          {/* 4. Final Net Payable Total / Recovery Due */}
          <div className={`p-3.5 rounded-xl bg-slate-900/90 border ${
            netSettlement >= 0 ? 'border-emerald-500/40' : 'border-rose-500/50'
          }`}>
            <div className={`text-[10px] uppercase font-bold ${
              netSettlement >= 0 ? 'text-emerald-400' : 'text-rose-400'
            }`}>
              {netSettlement >= 0 ? 'Final Net Payable Total' : 'राइडर से लेना बाकी (Recovery Due)'}
            </div>
            <div className={`text-lg sm:text-xl font-black mt-1 ${
              netSettlement >= 0 ? 'text-emerald-300' : 'text-rose-200'
            }`}>
              {netSettlement >= 0 ? formatINR(netSettlement) : formatINR(Math.abs(netSettlement))}
            </div>
            <div className="text-[11px] text-slate-300 mt-0.5 font-medium">
              {netSettlement < 0 ? (
                <span className="text-rose-300 font-semibold">
                  एडवांस अधिक है: {formatINR(Math.abs(netSettlement))} रिकवर करना बाकी
                </span>
              ) : unpaidGross === 0 && grossTotal > 0 ? (
                <span className="text-emerald-400 font-bold">✓ Fully Settled</span>
              ) : (
                <span>Unpaid Gross: {formatINR(unpaidGross)}</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Day-Wise Settlement Entries Table */}
      <div className="bg-slate-850 border border-slate-750 rounded-2xl p-4 sm:p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm sm:text-base font-bold text-white">
              Day-Wise Settlement Entries
            </h3>
            <p className="text-xs text-slate-400">
              Click status to toggle individual records or check settlement timestamps
            </p>
          </div>
          <span className="text-xs text-slate-400 font-semibold">
            {filteredEntries.length} Records
          </span>
        </div>

        {filteredEntries.length === 0 ? (
          <div className="text-center py-10 text-slate-500 text-xs">
            No entries found for {selectedRider?.name} in this date range.
          </div>
        ) : (
          <div className="overflow-x-auto -mx-4 sm:mx-0">
            <div className="inline-block min-w-full align-middle">
              <table className="min-w-full divide-y divide-slate-800">
                <thead>
                  <tr className="bg-slate-900/70 text-slate-400 text-[11px] font-semibold uppercase tracking-wider">
                    <th className="py-2.5 px-3 text-left">Date</th>
                    <th className="py-2.5 px-3 text-center">Parcels</th>
                    <th className="py-2.5 px-3 text-right">Base Pay</th>
                    <th className="py-2.5 px-3 text-center">Incentive</th>
                    <th className="py-2.5 px-3 text-right">Day Total</th>
                    <th className="py-2.5 px-3 text-center">Status Action</th>
                    <th className="py-2.5 px-3 text-right">Settled At</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-xs">
                  {filteredEntries.map((entry) => (
                    <tr key={entry.id} className="hover:bg-slate-800/40 transition">
                      <td className="py-2.5 px-3 text-slate-200 font-medium whitespace-nowrap">
                        {formatDateDisplay(entry.date)}
                      </td>
                      <td className="py-2.5 px-3 text-center font-bold text-blue-400 whitespace-nowrap">
                        {entry.parcels} pkts
                      </td>
                      <td className="py-2.5 px-3 text-right text-slate-300 whitespace-nowrap">
                        {formatINR(entry.baseAmount)}
                      </td>
                      <td className="py-2.5 px-3 text-center whitespace-nowrap">
                        {entry.hasIncentive ? (
                          <span className="text-emerald-400 font-semibold">
                            +₹2 ({formatINR(entry.incentiveAmount)})
                          </span>
                        ) : (
                          <span className="text-slate-500">₹0</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right font-extrabold text-emerald-300 whitespace-nowrap">
                        {formatINR(entry.totalEarnings)}
                      </td>
                      <td className="py-2.5 px-3 text-center whitespace-nowrap">
                        <button
                          onClick={() => onToggleEntryStatus(entry.id)}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold border transition ${
                            entry.status === 'Paid'
                              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30'
                              : 'bg-amber-500/20 text-amber-300 border-amber-500/40 hover:bg-amber-500/30'
                          }`}
                          title="Click to toggle Paid / Unpaid"
                        >
                          {entry.status === 'Paid' ? (
                            <>
                              <CheckCircle2 className="w-3 h-3" />
                              <span>Paid</span>
                            </>
                          ) : (
                            <>
                              <Clock className="w-3 h-3" />
                              <span>Mark Paid</span>
                            </>
                          )}
                        </button>
                      </td>
                      <td className="py-2.5 px-3 text-right text-[11px] text-slate-400 whitespace-nowrap">
                        {entry.paidAt
                          ? new Date(entry.paidAt).toLocaleDateString('en-IN', {
                              day: 'numeric',
                              month: 'short',
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : 'Pending'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Rider's Settlement & Advance Payout History */}
      {riderSettlements.length > 0 && (
        <div className="bg-slate-850 border border-slate-750 rounded-2xl p-4 sm:p-6 shadow-xl">
          <div className="flex items-center gap-2 mb-3">
            <History className="w-4 h-4 text-blue-400" />
            <h3 className="text-sm font-bold text-white">
              Previous Finalized Settlements for {selectedRider?.name}
            </h3>
          </div>
          <div className="space-y-2">
            {riderSettlements.map((settlement) => (
              <div
                key={settlement.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl bg-slate-900/80 border border-slate-800 text-xs"
              >
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white">
                      {formatDateDisplay(settlement.startDate)} to {formatDateDisplay(settlement.endDate)}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-bold border border-emerald-500/40">
                      PAID
                    </span>
                  </div>
                  <div className="text-slate-400 text-[11px]">
                    Settled on:{' '}
                    {new Date(settlement.paidAt).toLocaleString('en-IN', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </div>
                </div>

                <div className="flex items-center gap-4 text-right">
                  <div>
                    <div className="text-[10px] text-slate-400">Gross / Advance</div>
                    <div className="font-semibold text-slate-200">
                      {formatINR(settlement.grossTotal)}{' '}
                      <span className="text-amber-400">
                        {settlement.advanceAmount > 0 ? `(-${formatINR(settlement.advanceAmount)})` : ''}
                      </span>
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-emerald-400 font-semibold">Net Paid Total</div>
                    <div className="font-black text-emerald-300 text-sm">
                      {formatINR(settlement.netTotal)}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* WhatsApp Slip Modal */}
      {slipData && (
        <WhatsAppSlipModal
          data={slipData}
          onClose={() => setSlipData(null)}
        />
      )}
    </div>
  );
};
