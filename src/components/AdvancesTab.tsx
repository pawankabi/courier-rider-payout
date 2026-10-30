import React, { useState, useMemo } from 'react';
import {
  IndianRupee,
  TrendingDown,
  Users,
  Calendar,
  Send,
  Trash2,
  ExternalLink,
  CheckCircle2,
  Search,
  PlusCircle,
  FileSpreadsheet,
  Pencil,
  X,
} from 'lucide-react';
import { Rider, RiderAdvanceEntry, SettlementRecord } from '../types';
import { formatINR, formatDateDisplay, getTodayDateString } from '../utils/formatters';
import { calculateActiveAdvanceTotal, calculateActiveIncentiveTotal, isUnsettledAdvance } from '../utils/payoutCalculations';
import { getRiderStatementUrl } from '../utils/shareLink';
import { formatAdvanceSmsText, dispatchAutomatedSms } from '../services/smsService';
import { sendNativeBackgroundSms, isNativeAndroid } from '../services/nativeSms';

interface Props {
  riders: Rider[];
  settlements?: SettlementRecord[];
  onSaveAdvance: (updatedRider: Rider, newAdvance: RiderAdvanceEntry) => Promise<void>;
  onDeleteAdvance?: (updatedRider: Rider, advanceId: string) => Promise<void>;
  onViewLedger?: (riderId: string) => void;
  hubName?: string;
  userId?: string;
}

const ADVANCE_PRESETS = [
  'बाइक मरम्मत (Bike Repair)',
  'फ्यूल / पेट्रोल (Fuel)',
  'त्यौहार / आपातकालीन (Festival Emergency)',
  'मोबाइल रिचार्ज (Mobile Recharge)',
  'घरेलू खर्च (Personal Advance)',
];

export const AdvancesTab: React.FC<Props> = ({
  riders,
  settlements,
  onSaveAdvance,
  onDeleteAdvance,
  onViewLedger,
  hubName = 'सरायकेला कूरियर हब',
}) => {
  const [selectedRiderId, setSelectedRiderId] = useState<string>('');
  const [amount, setAmount] = useState<string>('');
  const [date, setDate] = useState<string>(getTodayDateString());
  const [reason, setReason] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Edit Advance Modal State
  const [editingAdvance, setEditingAdvance] = useState<{
    entry: RiderAdvanceEntry;
    rider: Rider;
  } | null>(null);
  const [editAmount, setEditAmount] = useState<string>('');
  const [editDate, setEditDate] = useState<string>('');
  const [editReason, setEditReason] = useState<string>('');
  const [isSavingEdit, setIsSavingEdit] = useState<boolean>(false);

  // In-App Confirm Delete Advance State (Android WebView safe, no window.confirm)
  const [deletingAdvance, setDeletingAdvance] = useState<{
    entry: RiderAdvanceEntry;
    rider: Rider;
  } | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  // Search & Filters
  const [filterRiderId, setFilterRiderId] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const activeRiders = useMemo(() => {
    return (riders || []).filter((r) => r.active !== false);
  }, [riders]);

  // Aggregate all advances across fleet
  const allAdvances = useMemo(() => {
    const list: Array<{
      entry: RiderAdvanceEntry;
      rider: Rider;
    }> = [];

    (riders || []).forEach((r) => {
      if (Array.isArray(r.advances) && r.advances.length > 0) {
        r.advances.forEach((adv) => {
          list.push({ entry: adv, rider: r });
        });
      }
    });

    return list.sort((a, b) => {
      const timeA = a.entry.date ? new Date(a.entry.date).getTime() : new Date(a.entry.createdAt).getTime();
      const timeB = b.entry.date ? new Date(b.entry.date).getTime() : new Date(b.entry.createdAt).getTime();
      return timeB - timeA;
    });
  }, [riders]);

  const filteredAdvances = useMemo(() => {
    return allAdvances.filter(({ entry, rider }) => {
      if (filterRiderId !== 'all' && rider.id !== filterRiderId) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = rider.name.toLowerCase().includes(q);
        const matchesPhone = (rider.phone || '').includes(q);
        const matchesReason = (entry.reason || '').toLowerCase().includes(q);
        if (!matchesName && !matchesPhone && !matchesReason) return false;
      }
      return true;
    });
  }, [allAdvances, filterRiderId, searchQuery]);

  // Helper: compute pure ground-truth net outstanding advance for a rider
  const getRiderNetAdvance = (r: Rider): number => {
    const adv = calculateActiveAdvanceTotal(r.advances, settlements, r.id);
    const inc = calculateActiveIncentiveTotal(r.incentives, settlements, r.id);
    return Math.max(0, adv - inc);
  };

  // Stats
  const totalOutstandingAdvance = useMemo(() => {
    return (riders || []).reduce(
      (sum, r) => sum + getRiderNetAdvance(r),
      0
    );
  }, [riders, settlements]);

  const ridersWithAdvanceCount = useMemo(() => {
    return (riders || []).filter((r) => getRiderNetAdvance(r) > 0).length;
  }, [riders, settlements]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4500);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRiderId) {
      showToast('⚠️ कृपया राइडर चुनें!');
      return;
    }
    const num = Math.max(0, parseFloat(amount) || 0);
    if (num <= 0) {
      showToast('⚠️ कृपया मान्य एडवांस राशि दर्ज करें!');
      return;
    }

    const targetRider = riders.find((r) => r.id === selectedRiderId);
    if (!targetRider) return;

    setIsSubmitting(true);
    try {
      const advId = `adv_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const newAdvEntry: RiderAdvanceEntry = {
        id: advId,
        riderId: targetRider.id,
        riderName: targetRider.name,
        riderPhone: targetRider.phone,
        amount: num,
        remainingAmount: num,
        date: date || getTodayDateString(),
        reason: reason.trim() || 'सामान्य एडवांस',
        isSettled: false,
        runningBalance: 0,
        createdAt: new Date().toISOString(),
      };

      const updatedAdvances = [newAdvEntry, ...(targetRider.advances || [])];
      const rawAdv = calculateActiveAdvanceTotal(updatedAdvances, settlements, targetRider.id);
      const rawInc = calculateActiveIncentiveTotal(targetRider.incentives, settlements, targetRider.id);
      const totalPendingAdvance = Math.max(0, rawAdv - rawInc);
      newAdvEntry.runningBalance = totalPendingAdvance;

      const updatedRider: Rider = {
        ...targetRider,
        totalAdvance: totalPendingAdvance,
        advances: updatedAdvances,
      };

      await onSaveAdvance(updatedRider, newAdvEntry);

      // Background SMS dispatch
      const statementUrl = getRiderStatementUrl(targetRider.id);
      const smsText = formatAdvanceSmsText({
        riderName: targetRider.name,
        amount: num,
        reason: reason.trim() || 'सामान्य एडवांस',
        date: newAdvEntry.date,
        totalAdvance: totalPendingAdvance,
        netBalance: totalPendingAdvance,
        statementUrl,
      });

      dispatchAutomatedSms({
        riderName: targetRider.name,
        riderPhone: targetRider.phone,
        amount: num,
        message: smsText,
        type: 'advance',
        statementUrl,
      }).catch((e) => console.warn('Advance background SMS notice:', e));

      setAmount('');
      setReason('');
      showToast(`✅ ₹${num} का एडवांस ${targetRider.name} के खाते में दर्ज किया गया एवं SMS भेजा गया!`);
    } catch (err) {
      console.error('Error adding advance:', err);
      showToast('एडवांस दर्ज करने में त्रुटि हुई।');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStartEdit = (rider: Rider, entry: RiderAdvanceEntry) => {
    setEditingAdvance({ rider, entry });
    setEditAmount(String(entry.amount));
    setEditDate(entry.date || entry.createdAt.slice(0, 10));
    setEditReason(entry.reason || '');
  };

  const handleCancelEdit = () => {
    setEditingAdvance(null);
    setEditAmount('');
    setEditDate('');
    setEditReason('');
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAdvance) return;

    const num = Math.max(0, parseFloat(editAmount) || 0);
    if (num <= 0) {
      showToast('⚠️ कृपया मान्य एडवांस राशि दर्ज करें!');
      return;
    }

    const { rider, entry } = editingAdvance;
    setIsSavingEdit(true);

    try {
      const nowIso = new Date().toISOString();
      const updatedAdvances = (rider.advances || []).map((a) => {
        if (a.id === entry.id) {
          return {
            ...a,
            amount: num,
            date: editDate || a.date,
            reason: editReason.trim() || 'सामान्य एडवांस',
            updatedAt: nowIso,
          };
        }
        return a;
      });

      const rawAdv = calculateActiveAdvanceTotal(updatedAdvances, settlements, rider.id);
      const rawInc = calculateActiveIncentiveTotal(rider.incentives, settlements, rider.id);
      const newTotal = Math.max(0, rawAdv - rawInc);
      const updatedEntry = updatedAdvances.find((a) => a.id === entry.id)!;

      const updatedRider: Rider = {
        ...rider,
        totalAdvance: newTotal,
        advances: updatedAdvances,
      };

      await onSaveAdvance(updatedRider, updatedEntry);
      showToast(`✅ ₹${num} का एडवांस (${rider.name}) सफलतापूर्वक अपडेट किया गया!`);
      handleCancelEdit();
    } catch (err) {
      console.error('Error updating advance:', err);
      showToast('एडवांस अपडेट करने में त्रुटि हुई।');
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingAdvance || !onDeleteAdvance) return;
    const { rider, entry } = deletingAdvance;
    setIsDeleting(true);
    try {
      const remainingAdvances = (rider.advances || []).filter((a) => a.id !== entry.id);
      const rawAdv = calculateActiveAdvanceTotal(remainingAdvances, settlements, rider.id);
      const rawInc = calculateActiveIncentiveTotal(rider.incentives, settlements, rider.id);
      const newTotal = Math.max(0, rawAdv - rawInc);
      const updatedRider: Rider = {
        ...rider,
        totalAdvance: newTotal,
        advances: remainingAdvances,
      };

      await onDeleteAdvance(updatedRider, entry.id);
      showToast('एडवांस एंट्री सफलतापूर्वक हटाई गई।');
      setDeletingAdvance(null);
    } catch (err) {
      console.error('Error deleting advance:', err);
      showToast('एडवांस हटाने में त्रुटि हुई।');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-200">
      {/* Toast */}
      {toastMessage && (
        <div className="fixed top-5 right-5 z-[150] bg-emerald-600 text-white px-4 py-2.5 rounded-xl shadow-2xl text-xs font-bold flex items-center gap-2 border border-emerald-400/30 animate-in slide-in-from-top-2">
          <CheckCircle2 className="w-4 h-4" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header Banner */}
      <div className="p-5 rounded-2xl bg-gradient-to-r from-amber-950 via-slate-900 to-rose-950 border border-amber-500/30 shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/40">
              <IndianRupee className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-black text-white flex items-center gap-2">
                <span>एडवांस व उधारी खाता (Advances & Loan Ledger)</span>
                <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40">
                  Fleet Advances
                </span>
              </h1>
              <p className="text-xs text-slate-400 mt-0.5">
                डिलीवरी साथियों को दिए गए सभी अग्रिम भुगतान, बाइक मेंटेनेंस, फ्यूल लोन व दैनिक शॉर्टेज वसूली
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400 font-medium hidden sm:inline">
            हब: <strong className="text-white">{hubName}</strong>
          </span>
        </div>
      </div>

      {/* 3 Top Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Card 1: Total Fleet Advance */}
        <div className="p-4 rounded-2xl bg-slate-900/90 border border-amber-500/30 shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              कुल बकाया एडवांस (Net Advance)
            </span>
            <TrendingDown className="w-4 h-4 text-rose-400" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-amber-300 font-mono mt-1">
            {formatINR(totalOutstandingAdvance)}
          </div>
          <span className="text-[10px] text-slate-400 mt-1 block">
            अंतिम वेतन/पे-आउट से स्वतः समायोजित (Deducted) होगा
          </span>
        </div>

        {/* Card 2: Riders with Advance */}
        <div className="p-4 rounded-2xl bg-slate-900/90 border border-purple-500/30 shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              एडवांस धारक राइडर्स
            </span>
            <Users className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-purple-300 font-mono mt-1">
            {ridersWithAdvanceCount} <span className="text-xs font-medium text-slate-400">/ {activeRiders.length}</span>
          </div>
          <span className="text-[10px] text-slate-400 mt-1 block">
            सक्रिय बकाया वाले डिलीवरी साथी
          </span>
        </div>

        {/* Card 3: Total Recorded Advances */}
        <div className="p-4 rounded-2xl bg-slate-900/90 border border-blue-500/30 shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              कुल दर्ज लेनदेन
            </span>
            <Calendar className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-blue-300 font-mono mt-1">
            {allAdvances.length}
          </div>
          <span className="text-[10px] text-slate-400 mt-1 block">
            ऐतिहासिक एडवांस व शॉर्टेज रिकॉर्ड्स
          </span>
        </div>
      </div>

      {/* Log Advance Form Card */}
      <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <PlusCircle className="w-5 h-5 text-amber-400" />
            <h2 className="text-sm sm:text-base font-bold text-white">
              नया एडवांस जोड़ें (Add Advance Entry)
            </h2>
          </div>
          <span className="text-[11px] text-slate-400">
            SMS तुरंत बैलेंस अपडेट के साथ जाएगा
          </span>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            {/* Rider Select */}
            <div>
              <label className="text-xs text-slate-300 font-bold block mb-1">
                राइडर चुनें (Select Rider) <span className="text-rose-400">*</span>
              </label>
              <select
                value={selectedRiderId}
                onChange={(e) => setSelectedRiderId(e.target.value)}
                required
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white font-medium focus:outline-none focus:border-amber-500 transition cursor-pointer"
              >
                <option value="">-- डिलीवरी साथी चुनें --</option>
                {activeRiders.map((r) => {
                  const netAdv = getRiderNetAdvance(r);
                  return (
                    <option key={r.id} value={r.id}>
                      {r.name} ({r.phone || 'No phone'}) - कुल बकाया एडवांस: ₹{formatINR(netAdv)}
                    </option>
                  );
                })}
              </select>
            </div>

            {/* Amount */}
            <div>
              <label className="text-xs text-slate-300 font-bold block mb-1">
                एडवांस राशि (Amount in ₹) <span className="text-rose-400">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-slate-400 font-bold text-xs">
                  ₹
                </span>
                <input
                  type="number"
                  min="1"
                  step="any"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="1000"
                  required
                  className="w-full pl-7 pr-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-amber-300 font-mono font-bold focus:outline-none focus:border-amber-500 transition"
                />
              </div>
            </div>

            {/* Date */}
            <div>
              <label className="text-xs text-slate-300 font-bold block mb-1">
                दिनांक (Date) <span className="text-rose-400">*</span>
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white font-mono focus:outline-none focus:border-amber-500 transition cursor-pointer"
              />
            </div>
          </div>

          {/* Reason / Remark with Presets */}
          <div>
            <label className="text-xs text-slate-300 font-bold block mb-1">
              कारण / विवरण (Reason / Purpose)
            </label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="उदा. बाइक मरम्मत, फ्यूल, त्योहार खर्च"
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500 transition"
            />
            
            {/* Preset chips */}
            <div className="flex items-center gap-1.5 flex-wrap mt-2">
              <span className="text-[10px] text-slate-400 font-medium">त्वरित कारण:</span>
              {ADVANCE_PRESETS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setReason(p)}
                  className={`px-2 py-0.5 rounded-lg text-[10px] font-bold border transition cursor-pointer ${
                    reason === p
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                      : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          <div className="flex justify-end pt-1">
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-600 to-rose-600 hover:from-amber-500 hover:to-rose-500 text-white text-xs font-bold shadow-lg shadow-amber-950/50 flex items-center gap-2 transition active:scale-95 cursor-pointer disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5" />
              <span>
                {isSubmitting ? 'सुरक्षित हो रहा है...' : 'एडवांस सुरक्षित करें व SMS भेजें (Save Advance & Send SMS)'}
              </span>
            </button>
          </div>
        </form>
      </div>

      {/* History Ledger Table */}
      <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div>
            <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
              <span>अग्रिम इतिहास तालिका (Advance History Ledger)</span>
              <span className="text-xs font-mono text-amber-400">
                ({filteredAdvances.length} Records)
              </span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              सभी दिए गए अग्रिम व दैनिक शॉर्टेज से ट्रांसफर की गई उधारी
            </p>
          </div>

          {/* Filters */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="सर्च नाम, फोन, कारण..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 pr-3 py-1.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500 w-44"
              />
            </div>

            <select
              value={filterRiderId}
              onChange={(e) => setFilterRiderId(e.target.value)}
              className="px-3 py-1.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500 cursor-pointer"
            >
              <option value="all">सभी राइडर्स (All Riders)</option>
              {activeRiders.map((r) => {
                const netAdv = getRiderNetAdvance(r);
                return (
                  <option key={r.id} value={r.id}>
                    {r.name} (बकाया: ₹{formatINR(netAdv)})
                  </option>
                );
              })}
            </select>
          </div>
        </div>

        {filteredAdvances.length === 0 ? (
          <div className="p-10 text-center text-xs text-slate-400 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
            <IndianRupee className="w-8 h-8 text-slate-600 mx-auto mb-2" />
            <p className="font-bold text-slate-300">कोई अग्रिम रिकॉर्ड नहीं मिला</p>
            <p className="text-[11px] text-slate-500">
              इस हब में सभी राइडर्स के खाते 100% शून्य एडवांस या क्लोज्ड हैं।
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-800">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-950 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
                  <th className="p-3 font-bold">दिनांक (Date)</th>
                  <th className="p-3 font-bold">राइडर (Rider)</th>
                  <th className="p-3 font-bold">कारण / विवरण (Reason)</th>
                  <th className="p-3 font-bold text-center">स्थिति (Status)</th>
                  <th className="p-3 font-bold text-right">राशि (Amount ₹)</th>
                  <th className="p-3 font-bold text-center">एक्शन (Actions)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-medium">
                {filteredAdvances.map(({ entry, rider }) => {
                  const isUnsettled = isUnsettledAdvance(entry, settlements, rider.id);
                  return (
                    <tr
                      key={entry.id}
                      className="hover:bg-slate-850/50 transition duration-100"
                    >
                      <td className="p-3 text-slate-300 font-mono text-[11px] whitespace-nowrap">
                        {formatDateDisplay(entry.date || entry.createdAt.slice(0, 10))}
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center justify-center font-bold text-[10px] shrink-0">
                            {rider.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <span className="font-bold text-white block">
                              {rider.name}
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono">
                              {rider.phone || 'No phone'}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="p-3 text-slate-200">
                        <span className="font-semibold">{entry.reason || 'सामान्य एडवांस'}</span>
                      </td>
                      <td className="p-3 text-center whitespace-nowrap">
                        {isUnsettled ? (
                          <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold">
                            सक्रिय बकाया
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold">
                            चुकता (Settled)
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-right font-mono font-black text-rose-300 text-sm whitespace-nowrap">
                        -₹{formatINR(entry.amount)}
                      </td>
                      <td className="p-3 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              if (onViewLedger) onViewLedger(rider.id);
                              else window.open(getRiderStatementUrl(rider.id), '_blank');
                            }}
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white transition cursor-pointer"
                            title="ऑनलाइन खाता लेजर खोलें"
                          >
                            <ExternalLink className="w-3.5 h-3.5 text-amber-400" />
                          </button>

                          <button
                            type="button"
                            onClick={() => handleStartEdit(rider, entry)}
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-amber-400 transition cursor-pointer"
                            title="एडवांस एडिट करें (Edit Advance)"
                          >
                            <Pencil className="w-3.5 h-3.5 text-amber-400" />
                          </button>

                          {onDeleteAdvance && (
                            <button
                              type="button"
                              onClick={() => setDeletingAdvance({ rider, entry })}
                              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-rose-400 transition cursor-pointer"
                              title="हटाएं (Delete)"
                            >
                              <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Edit Advance Modal (Admin View) */}
      {editingAdvance && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-5 sm:p-6 space-y-4 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/40">
                  <Pencil className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm sm:text-base text-white">
                    एडवांस संपादित करें (Edit Advance)
                  </h3>
                  <p className="text-xs text-slate-400">
                    {editingAdvance.rider.name} • {editingAdvance.rider.phone || 'No phone'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleCancelEdit}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-4">
              {/* Amount */}
              <div>
                <label className="text-xs text-slate-300 font-bold block mb-1">
                  एडवांस राशि (Amount in ₹) <span className="text-rose-400">*</span>
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
                    className="w-full pl-7 pr-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-amber-300 font-mono font-bold focus:outline-none focus:border-amber-500 transition"
                  />
                </div>
              </div>

              {/* Date */}
              <div>
                <label className="text-xs text-slate-300 font-bold block mb-1">
                  दिनांक (Date) <span className="text-rose-400">*</span>
                </label>
                <input
                  type="date"
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                  required
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white font-mono focus:outline-none focus:border-amber-500 transition cursor-pointer"
                />
              </div>

              {/* Reason */}
              <div>
                <label className="text-xs text-slate-300 font-bold block mb-1">
                  कारण / विवरण (Reason / Purpose)
                </label>
                <input
                  type="text"
                  value={editReason}
                  onChange={(e) => setEditReason(e.target.value)}
                  placeholder="उदा. बाइक मरम्मत, फ्यूल, त्यौहार"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500 transition"
                />

                {/* Preset chips */}
                <div className="flex items-center gap-1.5 flex-wrap mt-2">
                  <span className="text-[10px] text-slate-400 font-medium">त्वरित कारण:</span>
                  {ADVANCE_PRESETS.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setEditReason(p)}
                      className={`px-2 py-0.5 rounded-lg text-[10px] font-bold border transition cursor-pointer ${
                        editReason === p
                          ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                          : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white'
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 text-xs font-semibold transition cursor-pointer"
                >
                  रद्द करें (Cancel)
                </button>
                <button
                  type="submit"
                  disabled={isSavingEdit}
                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-amber-600 to-rose-600 hover:from-amber-500 hover:to-rose-500 text-white text-xs font-bold shadow-lg shadow-amber-950/50 flex items-center gap-1.5 transition active:scale-95 cursor-pointer disabled:opacity-50"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>{isSavingEdit ? 'अपडेट हो रहा है...' : 'सुरक्षित करें (Save Changes)'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* In-App Confirm Delete Advance Modal (WebView Safe) */}
      {deletingAdvance && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-5 space-y-4 animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-500/20 text-rose-400 border border-rose-500/40 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-white">एडवांस एंट्री हटाएं? (Delete Advance)</h3>
                <p className="text-xs text-slate-400">{deletingAdvance.rider.name}</p>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs space-y-1">
              <div className="flex justify-between text-slate-300">
                <span>राशि (Amount):</span>
                <span className="font-mono font-bold text-rose-400">₹{formatINR(deletingAdvance.entry.amount)}</span>
              </div>
              <div className="flex justify-between text-slate-400 text-[11px]">
                <span>विवरण (Reason):</span>
                <span className="text-slate-200">{deletingAdvance.entry.reason || 'सामान्य एडवांस'}</span>
              </div>
              <div className="flex justify-between text-slate-400 text-[11px]">
                <span>दिनांक (Date):</span>
                <span>{formatDateDisplay(deletingAdvance.entry.date || deletingAdvance.entry.createdAt.slice(0, 10))}</span>
              </div>
            </div>

            <p className="text-xs text-slate-400">
              यह एडवांस डेटाबेस से स्थायी रूप से हटा दिया जाएगा और राइडर का कुल बकाया एडवांस तुरंत पुनः समायोजित होगा।
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setDeletingAdvance(null)}
                disabled={isDeleting}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 text-xs font-semibold transition cursor-pointer"
              >
                रद्द करें (Cancel)
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-lg shadow-rose-950/50 flex items-center gap-1.5 transition active:scale-95 cursor-pointer disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{isDeleting ? 'हटाया जा रहा है...' : 'हाँ, हटाएं (Yes, Delete)'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
