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
} from 'lucide-react';
import { Rider, RiderAdvanceEntry } from '../types';
import { formatINR, formatDateDisplay, getTodayDateString } from '../utils/formatters';
import { getRiderStatementUrl } from '../utils/shareLink';
import { formatAdvanceSmsText, dispatchAutomatedSms } from '../services/smsService';

interface Props {
  riders: Rider[];
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

  // Stats
  const totalOutstandingAdvance = useMemo(() => {
    return (riders || []).reduce((sum, r) => sum + (Number(r.totalAdvance) || 0), 0);
  }, [riders]);

  const ridersWithAdvanceCount = useMemo(() => {
    return (riders || []).filter((r) => Number(r.totalAdvance || 0) > 0).length;
  }, [riders]);

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
      const prevTotal = Number(targetRider.totalAdvance) || 0;
      const newTotal = prevTotal + num;
      const advId = `adv_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

      const newAdvEntry: RiderAdvanceEntry = {
        id: advId,
        riderId: targetRider.id,
        amount: num,
        date: date || getTodayDateString(),
        reason: reason.trim() || 'सामान्य एडवांस',
        runningBalance: newTotal,
        createdAt: new Date().toISOString(),
      };

      const updatedAdvances = [newAdvEntry, ...(targetRider.advances || [])];
      const updatedRider: Rider = {
        ...targetRider,
        totalAdvance: newTotal,
        advances: updatedAdvances,
      };

      await onSaveAdvance(updatedRider, newAdvEntry);

      // Background SMS dispatch
      const statementUrl = getRiderStatementUrl(targetRider.id);
      const smsText = formatAdvanceSmsText({
        riderName: targetRider.name,
        amount: num,
        reason: reason.trim() || 'सामान्य एडवांस',
        totalAdvance: newTotal,
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

  const handleDelete = async (rider: Rider, advId: string, advAmount: number) => {
    if (!onDeleteAdvance) return;
    if (!window.confirm(`क्या आप ₹${advAmount} का यह एडवांस रिकॉर्ड हटाना चाहते हैं?`)) {
      return;
    }

    try {
      const remainingAdvances = (rider.advances || []).filter((a) => a.id !== advId);
      const newTotal = remainingAdvances.reduce((sum, a) => sum + (Number(a.amount) || 0), 0);
      const updatedRider: Rider = {
        ...rider,
        totalAdvance: newTotal,
        advances: remainingAdvances,
      };

      await onDeleteAdvance(updatedRider, advId);
      showToast('एडवांस एंट्री सफलतापूर्वक हटाई गई।');
    } catch (err) {
      console.error('Error deleting advance:', err);
      showToast('एडवांस हटाने में त्रुटि हुई।');
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
              कुल बकाया एडवांस (Total Active Advance)
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
                {activeRiders.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} ({r.phone || 'No phone'}) - Current Advance: ₹{r.totalAdvance || 0}
                  </option>
                ))}
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
              {activeRiders.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} (₹{r.totalAdvance || 0})
                </option>
              ))}
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
                  <th className="p-3 font-bold text-right">राशि (Amount ₹)</th>
                  <th className="p-3 font-bold text-center">एक्शन (Actions)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-medium">
                {filteredAdvances.map(({ entry, rider }) => {
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

                          {onDeleteAdvance && (
                            <button
                              type="button"
                              onClick={() => handleDelete(rider, entry.id, entry.amount)}
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
    </div>
  );
};
