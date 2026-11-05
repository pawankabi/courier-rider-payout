import React, { useState, useEffect } from 'react';
import { TrendingUp, Plus, Trash2, X, IndianRupee, PieChart, Calendar, ShieldCheck, Sparkles } from 'lucide-react';
import { DeliveryEntry, HubDailyExpenseRecord } from '../types';
import { 
  loadHubExpenses, 
  saveHubExpense, 
  deleteHubExpense, 
  calculateHubDailyProfitLoss 
} from '../services/hubOperationsService';
import { formatINR, formatDateDisplay, getTodayDateString } from '../utils/formatters';

interface HubProfitLossModalProps {
  isOpen: boolean;
  onClose: () => void;
  hubId: string;
  entries: DeliveryEntry[];
  selectedDate?: string;
  defaultCompanyRate?: number;
}

export const HubProfitLossModal: React.FC<HubProfitLossModalProps> = ({
  isOpen,
  onClose,
  hubId,
  entries,
  selectedDate = getTodayDateString(),
  defaultCompanyRate = 18,
}) => {
  const [currentDate, setCurrentDate] = useState(selectedDate);
  const [companyRate, setCompanyRate] = useState<number>(defaultCompanyRate);
  const [expenses, setExpenses] = useState<HubDailyExpenseRecord[]>([]);
  const [isAddingExpense, setIsAddingExpense] = useState(false);
  const [expCategory, setExpCategory] = useState<'FUEL' | 'OFFICE_RENT' | 'STAFF_TEA_SNACKS' | 'MAINTENANCE' | 'OTHER'>('STAFF_TEA_SNACKS');
  const [expDescription, setExpDescription] = useState('');
  const [expAmount, setExpAmount] = useState('');

  const fetchExpenses = async () => {
    try {
      const list = await loadHubExpenses(hubId, currentDate);
      setExpenses(list);
    } catch (err) {
      console.warn('Failed to load expenses:', err);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchExpenses();
    }
  }, [isOpen, hubId, currentDate]);

  if (!isOpen) return null;

  // Filter entries for the selected date
  const dateEntries = (entries || []).filter((e) => e.date === currentDate && !e.isDeleted);
  const pnl = calculateHubDailyProfitLoss(dateEntries, expenses, companyRate);

  const handleAddExpenseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Number(expAmount);
    if (!amt || amt <= 0) return;

    const newExp: HubDailyExpenseRecord = {
      id: `exp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      date: currentDate,
      category: expCategory,
      description: expDescription.trim() || 'दैनिक हब खर्च',
      amount: amt,
      createdAt: new Date().toISOString(),
    };

    await saveHubExpense(hubId, newExp);
    setExpenses((prev) => [newExp, ...prev]);
    setExpDescription('');
    setExpAmount('');
    setIsAddingExpense(false);
  };

  const handleDeleteExpenseClick = async (id: string) => {
    await deleteHubExpense(hubId, currentDate, id);
    setExpenses((prev) => prev.filter((e) => e.id !== id));
  };

  const getCategoryLabel = (cat: string) => {
    switch (cat) {
      case 'FUEL': return 'पेट्रोल / डीजल';
      case 'OFFICE_RENT': return 'ऑफिस किराया';
      case 'STAFF_TEA_SNACKS': return 'चाय / नाश्ता';
      case 'MAINTENANCE': return 'मेंटेनेंस / मरम्मत';
      default: return 'अन्य खर्च';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/75 backdrop-blur-xs animate-in fade-in">
      <div className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-5 bg-gradient-to-r from-emerald-950 via-slate-900 to-indigo-950 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold flex items-center gap-2">
                <span>दैनिक हब लाभ-हानि रिपोर्ट (Profit & Loss)</span>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/30 text-emerald-200 text-xs font-mono font-bold">
                  Live Net Margin
                </span>
              </h3>
              <p className="text-xs text-slate-300 font-medium mt-0.5">
                कंपनी से प्राप्त दर − राइडर पेआउट − दैनिक हब खर्च = सटीक शुद्ध मुनाफा
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Filter Bar (Date & Company Rate Config) */}
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-slate-500" />
            <input
              type="date"
              value={currentDate}
              onChange={(e) => setCurrentDate(e.target.value)}
              className="px-3 py-1.5 rounded-xl border border-slate-300 bg-white font-mono text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-600 font-semibold">कंपनी प्रति-पैकेट दर:</span>
            <div className="flex items-center gap-1 bg-white px-2.5 py-1 rounded-xl border border-slate-300">
              <span className="text-slate-400 font-bold">₹</span>
              <input
                type="number"
                min="0"
                step="0.5"
                value={companyRate}
                onChange={(e) => setCompanyRate(Number(e.target.value) || 0)}
                className="w-14 font-mono font-bold text-xs text-slate-900 focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* Main P&L Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Summary Stat Cards Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3.5 rounded-2xl bg-indigo-50 border border-indigo-200">
              <span className="text-[11px] font-bold text-indigo-700 block">कुल डिलीवरी पैकेट्स</span>
              <span className="text-xl font-extrabold text-indigo-950 font-mono mt-1 block">
                {pnl.totalDeliveredParcels}
              </span>
            </div>

            <div className="p-3.5 rounded-2xl bg-sky-50 border border-sky-200">
              <span className="text-[11px] font-bold text-sky-700 block">कंपनी कुल रेवेन्यू (₹{companyRate})</span>
              <span className="text-xl font-extrabold text-sky-950 font-mono mt-1 block">
                ₹{formatINR(pnl.grossCompanyRevenue)}
              </span>
            </div>

            <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200">
              <span className="text-[11px] font-bold text-amber-700 block">कुल राइडर पेआउट</span>
              <span className="text-xl font-extrabold text-amber-950 font-mono mt-1 block">
                ₹{formatINR(pnl.totalRiderPayouts)}
              </span>
            </div>

            <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200">
              <span className="text-[11px] font-bold text-rose-700 block">कुल दैनिक खर्च</span>
              <span className="text-xl font-extrabold text-rose-950 font-mono mt-1 block">
                ₹{formatINR(pnl.totalExpenses)}
              </span>
            </div>
          </div>

          {/* NET PROFIT HIGHLIGHT BANNER */}
          <div className={`p-4 rounded-3xl border-2 flex items-center justify-between gap-4 shadow-sm ${
            pnl.netProfit >= 0 
              ? 'bg-gradient-to-r from-emerald-500/10 to-teal-500/10 border-emerald-400 text-emerald-950'
              : 'bg-rose-50 border-rose-300 text-rose-950'
          }`}>
            <div className="flex items-center gap-3">
              <div className={`p-2.5 rounded-2xl ${pnl.netProfit >= 0 ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'}`}>
                <IndianRupee className="w-6 h-6" />
              </div>
              <div>
                <span className="text-xs font-bold uppercase tracking-wider block">
                  {pnl.netProfit >= 0 ? 'हब शुद्ध मुनाफा (Net Daily Profit)' : 'हब शुद्ध घाटा (Net Deficit)'}
                </span>
                <span className="text-xs text-slate-600 font-medium">
                  ग्रॉस मार्जिन ₹{formatINR(pnl.grossHubMargin)} − खर्च ₹{formatINR(pnl.totalExpenses)}
                </span>
              </div>
            </div>
            <div className="text-right">
              <span className={`text-2xl sm:text-3xl font-extrabold font-mono ${pnl.netProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                ₹{formatINR(pnl.netProfit)}
              </span>
            </div>
          </div>

          {/* Hub Expenses Section */}
          <div className="border border-slate-200 rounded-3xl p-4 bg-slate-50/50">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                दैनिक हब खर्च (Expenses) — ₹{formatINR(pnl.totalExpenses)}
              </h4>
              <button
                onClick={() => setIsAddingExpense(true)}
                className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs flex items-center gap-1 shadow-2xs transition cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ खर्च जोड़ें</span>
              </button>
            </div>

            {/* Add Expense Form Drawer */}
            {isAddingExpense && (
              <form onSubmit={handleAddExpenseSubmit} className="mb-4 p-3.5 rounded-2xl bg-white border border-slate-200 shadow-2xs space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <select
                    value={expCategory}
                    onChange={(e: any) => setExpCategory(e.target.value)}
                    className="px-3 py-2 rounded-xl border border-slate-300 text-xs font-semibold focus:outline-none"
                  >
                    <option value="STAFF_TEA_SNACKS">चाय / नाश्ता</option>
                    <option value="FUEL">पेट्रोल / डीजल</option>
                    <option value="OFFICE_RENT">ऑफिस किराया</option>
                    <option value="MAINTENANCE">मेंटेनेंस / मरम्मत</option>
                    <option value="OTHER">अन्य खर्च</option>
                  </select>

                  <input
                    type="text"
                    placeholder="खर्च का विवरण (उदा. शाम का नाश्ता)"
                    value={expDescription}
                    onChange={(e) => setExpDescription(e.target.value)}
                    className="px-3 py-2 rounded-xl border border-slate-300 text-xs focus:outline-none"
                  />

                  <input
                    type="number"
                    min="1"
                    placeholder="राशि ₹"
                    value={expAmount}
                    onChange={(e) => setExpAmount(e.target.value)}
                    className="px-3 py-2 rounded-xl border border-slate-300 text-xs font-mono font-bold focus:outline-none"
                  />
                </div>

                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsAddingExpense(false)}
                    className="px-3 py-1.5 rounded-lg text-slate-500 hover:text-slate-700 text-xs font-semibold cursor-pointer"
                  >
                    रद्द करें
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-2xs transition cursor-pointer"
                  >
                    सुरक्षित करें
                  </button>
                </div>
              </form>
            )}

            {/* Expense Items List */}
            {expenses.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-4">इस तारीख के लिए कोई अतिरिक्त खर्च दर्ज नहीं है।</p>
            ) : (
              <div className="space-y-2">
                {expenses.map((exp) => (
                  <div key={exp.id} className="p-2.5 rounded-xl bg-white border border-slate-200 flex items-center justify-between text-xs">
                    <div>
                      <span className="font-bold text-slate-800">{exp.description}</span>
                      <span className="ml-2 px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px]">
                        {getCategoryLabel(exp.category)}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-mono font-bold text-slate-900">₹{formatINR(exp.amount)}</span>
                      <button
                        onClick={() => handleDeleteExpenseClick(exp.id)}
                        className="text-slate-400 hover:text-rose-600 p-1 transition cursor-pointer"
                        title="हटाएं"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <span className="text-xs text-slate-500 font-medium">
            तारीख: <strong>{formatDateDisplay(currentDate)}</strong>
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold text-xs transition cursor-pointer"
          >
            बंद करें
          </button>
        </div>
      </div>
    </div>
  );
};
