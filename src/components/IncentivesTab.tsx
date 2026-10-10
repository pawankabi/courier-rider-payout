import React, { useState, useMemo } from 'react';
import {
  Gift,
  Sparkles,
  TrendingUp,
  User,
  Calendar,
  Send,
  Trash2,
  FileSpreadsheet,
  CheckCircle2,
  Search,
  MessageSquare,
  Award,
  IndianRupee,
  PlusCircle,
  ExternalLink,
} from 'lucide-react';
import { Rider, RiderIncentiveEntry } from '../types';
import { formatINR, formatDateDisplay, getTodayDateString } from '../utils/formatters';
import { getRiderStatementUrl } from '../utils/shareLink';

interface Props {
  riders: Rider[];
  onSaveIncentive: (
    riderId: string,
    incentive: {
      amount: number;
      reason: string;
      date: string;
    }
  ) => Promise<void>;
  onDeleteIncentive?: (riderId: string, incentiveId: string) => Promise<void>;
  onViewLedger?: (riderId: string) => void;
  hubName?: string;
  userId?: string;
}

const REASON_PRESETS = [
  'त्यौहार बोनस',
  'बढ़िया परफॉर्मेंस',
  'अतिरिक्त माइलेज',
  'दैनिक लक्ष्य पूरा',
  'विशेष प्रोत्साहन',
  'रविवार उपस्थिति बोनस',
];

export const IncentivesTab: React.FC<Props> = ({
  riders,
  onSaveIncentive,
  onDeleteIncentive,
  onViewLedger,
  hubName = 'सरायकेला कूरियर हब',
}) => {
  const [selectedRiderId, setSelectedRiderId] = useState<string>('');
  const [amount, setAmount] = useState<string>('');
  const [date, setDate] = useState<string>(getTodayDateString());
  const [reason, setReason] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Filter toolbar states
  const [filterRiderId, setFilterRiderId] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Active riders list (excluding inactive)
  const activeRiders = useMemo(() => {
    return (riders || []).filter((r) => r.active !== false);
  }, [riders]);

  // Aggregate all incentives across all riders
  const allIncentives = useMemo(() => {
    const list: Array<{
      entry: RiderIncentiveEntry;
      rider: Rider;
    }> = [];

    (riders || []).forEach((r) => {
      if (Array.isArray(r.incentives) && r.incentives.length > 0) {
        r.incentives.forEach((inc) => {
          list.push({ entry: inc, rider: r });
        });
      }
    });

    // Sort newest date first
    return list.sort((a, b) => {
      const timeA = a.entry.date ? new Date(a.entry.date).getTime() : new Date(a.entry.createdAt).getTime();
      const timeB = b.entry.date ? new Date(b.entry.date).getTime() : new Date(b.entry.createdAt).getTime();
      return timeB - timeA;
    });
  }, [riders]);

  // Filtered list
  const filteredIncentives = useMemo(() => {
    return allIncentives.filter(({ entry, rider }) => {
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
  }, [allIncentives, filterRiderId, searchQuery]);

  // Stats calculation
  const totalIncentivesAmount = useMemo(() => {
    return allIncentives.reduce((sum, item) => sum + (Number(item.entry.amount) || 0), 0);
  }, [allIncentives]);

  const ridersWithIncentivesCount = useMemo(() => {
    return (riders || []).filter((r) => Array.isArray(r.incentives) && r.incentives.length > 0).length;
  }, [riders]);

  const currentMonthIncentivesAmount = useMemo(() => {
    const now = new Date();
    const currentYearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    return allIncentives
      .filter((i) => i.entry.date && i.entry.date.startsWith(currentYearMonth))
      .reduce((sum, i) => sum + (Number(i.entry.amount) || 0), 0);
  }, [allIncentives]);

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
      showToast('⚠️ कृपया मान्य राशि (Amount) दर्ज करें!');
      return;
    }

    setIsSubmitting(true);
    try {
      await onSaveIncentive(selectedRiderId, {
        amount: num,
        reason: reason.trim() || 'त्यौहार बोनस',
        date: date || getTodayDateString(),
      });
      setAmount('');
      setReason('');
      showToast(`🎉 ₹${num} का इंसेंटिव/बोनस सफलतापूर्वक सुरक्षित हुआ एवं SMS भेजा गया!`);
    } catch (err: any) {
      console.error('Error adding incentive:', err);
      showToast('इंसेंटिव सुरक्षित करने में त्रुटि हुई।');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (riderId: string, incentiveId: string, incAmount: number) => {
    if (!onDeleteIncentive) return;
    if (!window.confirm(`क्या आप ₹${incAmount} का यह इंसेंटिव रिकॉर्ड हटाना चाहते हैं?`)) {
      return;
    }
    try {
      await onDeleteIncentive(riderId, incentiveId);
      showToast('इंसेंटिव रिकॉर्ड सफलतापूर्वक हटा दिया गया।');
    } catch (err) {
      console.error('Error deleting incentive:', err);
      showToast('इंसेंटिव हटाने में त्रुटि हुई।');
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
      <div className="p-5 rounded-2xl bg-gradient-to-r from-emerald-950 via-slate-900 to-teal-950 border border-emerald-500/30 shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
              <Gift className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-black text-white flex items-center gap-2">
                <span>इंसेंटिव / अतिरिक्त कमाई (Incentive & Bonus)</span>
                <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                  Fleet Rewards
                </span>
              </h1>
              <p className="text-xs text-slate-400 mt-0.5">
                त्यौहार बोनस, उत्कृष्ट परफॉर्मेंस, अतिरिक्त माइलेज एवं सरप्लस कमाई का संपूर्ण लेज़र
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
        {/* Card 1: Total Fleet Incentives */}
        <div className="p-4 rounded-2xl bg-slate-900/90 border border-emerald-500/30 shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              कुल इंसेंटिव / बोनस
            </span>
            <Sparkles className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-emerald-300 font-mono mt-1">
            {formatINR(totalIncentivesAmount)}
          </div>
          <span className="text-[10px] text-slate-400 mt-1 block">
            कुल {allIncentives.length} रिवॉर्ड एंट्रीज़ दर्ज
          </span>
        </div>

        {/* Card 2: Riders Rewarded */}
        <div className="p-4 rounded-2xl bg-slate-900/90 border border-teal-500/30 shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              इंसेंटिव प्राप्त राइडर्स
            </span>
            <Award className="w-4 h-4 text-teal-400" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-teal-300 font-mono mt-1">
            {ridersWithIncentivesCount} <span className="text-xs font-medium text-slate-400">/ {activeRiders.length}</span>
          </div>
          <span className="text-[10px] text-slate-400 mt-1 block">
            राइडर्स के अंतिम पे-आउट में अतिरिक्त जुड़ेगा
          </span>
        </div>

        {/* Card 3: Current Month Total */}
        <div className="p-4 rounded-2xl bg-slate-900/90 border border-amber-500/30 shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              इस महीने का कुल इंसेंटिव
            </span>
            <TrendingUp className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-amber-300 font-mono mt-1">
            {formatINR(currentMonthIncentivesAmount)}
          </div>
          <span className="text-[10px] text-slate-400 mt-1 block">
            मासिक प्रोत्साहन व परफॉर्मेंस राशि
          </span>
        </div>
      </div>

      {/* Log Incentive Form Card */}
      <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <PlusCircle className="w-5 h-5 text-emerald-400" />
            <h2 className="text-sm sm:text-base font-bold text-white">
              नया इंसेंटिव / बोनस दर्ज करें (Log New Incentive)
            </h2>
          </div>
          <span className="text-[11px] text-slate-400">
            SMS तुरंत राइडर को भेजा जाएगा
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
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white font-medium focus:outline-none focus:border-emerald-500 transition cursor-pointer"
              >
                <option value="">-- डिलीवरी साथी चुनें --</option>
                {activeRiders.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} ({r.phone || 'No phone'}) - Advance: ₹{r.totalAdvance || 0}
                  </option>
                ))}
              </select>
            </div>

            {/* Amount */}
            <div>
              <label className="text-xs text-slate-300 font-bold block mb-1">
                इंसेंटिव / बोनस राशि (Amount in ₹) <span className="text-rose-400">*</span>
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
                  placeholder="500"
                  required
                  className="w-full pl-7 pr-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-emerald-300 font-mono font-bold focus:outline-none focus:border-emerald-500 transition"
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
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white font-mono focus:outline-none focus:border-emerald-500 transition cursor-pointer"
              />
            </div>
          </div>

          {/* Reason / Remark with Presets */}
          <div>
            <label className="text-xs text-slate-300 font-bold block mb-1">
              कारण / विवरण (Reason / Remark)
            </label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="उदा. त्यौहार बोनस, बढ़िया परफॉर्मेंस, अतिरिक्त माइलेज"
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500 transition"
            />
            
            {/* Preset chips */}
            <div className="flex items-center gap-1.5 flex-wrap mt-2">
              <span className="text-[10px] text-slate-400 font-medium">त्वरित सुझाव:</span>
              {REASON_PRESETS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setReason(p)}
                  className={`px-2 py-0.5 rounded-lg text-[10px] font-bold border transition cursor-pointer ${
                    reason === p
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
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
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold shadow-lg shadow-emerald-950/50 flex items-center gap-2 transition active:scale-95 cursor-pointer disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5" />
              <span>
                {isSubmitting ? 'सुरक्षित हो रहा है...' : 'इंसेंटिव सुरक्षित करें व SMS भेजें (Save & Send SMS)'}
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
              <span>इंसेंटिव इतिहास तालिका (Incentives History Ledger)</span>
              <span className="text-xs font-mono text-emerald-400">
                ({filteredIncentives.length} Records)
              </span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              सभी स्वीकृत अतिरिक्त रिवॉर्ड्स, त्यौहार बोनस व सरप्लस क्रेडिट्स
            </p>
          </div>

          {/* Filters */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Search */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="सर्च नाम, फोन, कारण..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 pr-3 py-1.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500 w-44"
              />
            </div>

            {/* Rider Filter */}
            <select
              value={filterRiderId}
              onChange={(e) => setFilterRiderId(e.target.value)}
              className="px-3 py-1.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500 cursor-pointer"
            >
              <option value="all">सभी राइडर्स (All Riders)</option>
              {activeRiders.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Table */}
        {filteredIncentives.length === 0 ? (
          <div className="p-10 text-center text-xs text-slate-400 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
            <Gift className="w-8 h-8 text-slate-600 mx-auto mb-2" />
            <p className="font-bold text-slate-300">कोई इंसेंटिव रिकॉर्ड नहीं मिला</p>
            <p className="text-[11px] text-slate-500">
              ऊपर दिए गए फॉर्म से राइडर के लिए नया त्यौहार बोनस या परफॉर्मेंस इंसेंटिव दर्ज करें।
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
                  <th className="p-3 font-bold">स्रोत (Source)</th>
                  <th className="p-3 font-bold text-right">राशि (Amount ₹)</th>
                  <th className="p-3 font-bold text-center">एक्शन (Actions)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-medium">
                {filteredIncentives.map(({ entry, rider }) => {
                  const isSurplus = entry.source === 'surplus';
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
                          <div className="w-6 h-6 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center justify-center font-bold text-[10px] shrink-0">
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
                        <span className="font-semibold">{entry.reason || 'इंसेंटिव'}</span>
                      </td>
                      <td className="p-3 whitespace-nowrap">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                            isSurplus
                              ? 'bg-teal-500/20 text-teal-300 border-teal-500/40'
                              : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                          }`}
                        >
                          {isSurplus ? 'अतिरिक्त सरप्लस जमा' : 'मैनुअल इंसेंटिव'}
                        </span>
                      </td>
                      <td className="p-3 text-right font-mono font-black text-emerald-300 text-sm whitespace-nowrap">
                        +{formatINR(entry.amount)}
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
                            <ExternalLink className="w-3.5 h-3.5 text-emerald-400" />
                          </button>

                          {onDeleteIncentive && (
                            <button
                              type="button"
                              onClick={() => handleDelete(rider.id, entry.id, entry.amount)}
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
