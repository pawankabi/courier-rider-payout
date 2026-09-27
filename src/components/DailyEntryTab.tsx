import React, { useState, useEffect, useMemo } from 'react';
import { 
  Package, 
  Calendar, 
  Sparkles, 
  CheckCircle, 
  Trash2, 
  Edit3, 
  Plus, 
  UserCheck, 
  Coins, 
  ArrowRight,
  TrendingUp,
  AlertCircle,
  Save,
  RotateCcw,
  CheckCircle2,
  Phone,
  MessageCircle,
  Bell
} from 'lucide-react';
import { DeliveryEntry, Rider, UserRateConfig } from '../types';
import { 
  BASE_RATE, 
  INCENTIVE_RATE, 
  formatINR, 
  formatDateDisplay, 
  getTodayDateString 
} from '../utils/formatters';
import { EditEntryModal } from './EditEntryModal';
import { getFestivalAlert } from '../data/festivals';
import { FestivalGreetingsModal } from './FestivalGreetingsModal';
import { InstantShareSuccessModal } from './InstantShareSuccessModal';
import { isNativeAndroid, sendNativeBackgroundSms } from '../services/nativeSms';

const DAILY_ENTRY_DRAFT_KEY = 'courier_daily_entry_draft_v1';

interface DraftData {
  selectedRiderId?: string;
  date?: string;
  parcels?: number | '';
  hasIncentive?: boolean;
  notes?: string;
  savedAt?: number;
}

interface Props {
  riders: Rider[];
  entries: DeliveryEntry[];
  onAddEntry: (entry: Omit<DeliveryEntry, 'id' | 'createdAt'>) => void;
  onUpdateEntry: (entry: DeliveryEntry) => void;
  onDeleteEntry: (id: string) => void;
  onNavigateToRiders: () => void;
  userRateConfig?: UserRateConfig;
  canAccessIncentives?: boolean;
  canAccessFestivalGreetings?: boolean;
}

export const DailyEntryTab: React.FC<Props> = ({
  riders,
  entries,
  onAddEntry,
  onUpdateEntry,
  onDeleteEntry,
  onNavigateToRiders,
  userRateConfig,
  canAccessIncentives = true,
  canAccessFestivalGreetings = false,
}) => {
  // Read saved draft if present
  const getInitialDraft = (): DraftData | null => {
    try {
      const raw = localStorage.getItem(DAILY_ENTRY_DRAFT_KEY);
      if (raw) {
        return JSON.parse(raw) as DraftData;
      }
    } catch (e) {
      console.warn('Could not read draft from localStorage', e);
    }
    return null;
  };

  const initialDraft = getInitialDraft();

  // Form State with initial draft recovery
  const [selectedRiderId, setSelectedRiderId] = useState<string>(() => {
    if (initialDraft?.selectedRiderId) {
      return initialDraft.selectedRiderId;
    }
    return riders.length > 0 ? riders[0].id : '';
  });

  const [date, setDate] = useState<string>(() => {
    return initialDraft?.date || getTodayDateString();
  });

  const [parcels, setParcels] = useState<number | ''>(() => {
    if (initialDraft && initialDraft.parcels !== undefined) {
      return initialDraft.parcels;
    }
    return 50;
  });

  const [hasIncentive, setHasIncentive] = useState<boolean>(() => {
    if (initialDraft && typeof initialDraft.hasIncentive === 'boolean') {
      return initialDraft.hasIncentive;
    }
    return true;
  });

  const [notes, setNotes] = useState<string>(() => {
    return initialDraft?.notes || '';
  });

  const [isDraftRestored, setIsDraftRestored] = useState<boolean>(!!initialDraft);
  const [submittedToast, setSubmittedToast] = useState<string | null>(null);
  const [isFestivalModalOpen, setIsFestivalModalOpen] = useState(false);

  // Smart Festival Alert
  const festivalAlert = useMemo(() => getFestivalAlert(), []);

  // Automatically keep selectedRiderId valid and synchronized whenever riders list is restored or updated
  useEffect(() => {
    if (riders.length > 0) {
      if (!selectedRiderId || !riders.some((r) => r.id === selectedRiderId)) {
        if (initialDraft?.selectedRiderId && riders.some((r) => r.id === initialDraft.selectedRiderId)) {
          setSelectedRiderId(initialDraft.selectedRiderId);
        } else {
          setSelectedRiderId(riders[0].id);
        }
      }
    }
  }, [riders, selectedRiderId, initialDraft]);

  // Auto-Save in-progress draft on EVERY keystroke or field change
  useEffect(() => {
    const draft: DraftData = {
      selectedRiderId,
      date,
      parcels,
      hasIncentive,
      notes,
      savedAt: Date.now(),
    };

    try {
      localStorage.setItem(DAILY_ENTRY_DRAFT_KEY, JSON.stringify(draft));
    } catch (e) {
      console.warn('Failed to write in-progress draft to localStorage', e);
    }
  }, [selectedRiderId, date, parcels, hasIncentive, notes]);

  // Ensure draft is saved if user receives a phone call, minimizes, or switches apps
  useEffect(() => {
    const saveCurrentDraft = () => {
      try {
        const draft: DraftData = {
          selectedRiderId,
          date,
          parcels,
          hasIncentive,
          notes,
          savedAt: Date.now(),
        };
        localStorage.setItem(DAILY_ENTRY_DRAFT_KEY, JSON.stringify(draft));
      } catch (err) {}
    };

    window.addEventListener('visibilitychange', saveCurrentDraft);
    window.addEventListener('pagehide', saveCurrentDraft);
    window.addEventListener('beforeunload', saveCurrentDraft);

    return () => {
      window.removeEventListener('visibilitychange', saveCurrentDraft);
      window.removeEventListener('pagehide', saveCurrentDraft);
      window.removeEventListener('beforeunload', saveCurrentDraft);
    };
  }, [selectedRiderId, date, parcels, hasIncentive, notes]);

  // Discard draft helper
  const handleDiscardDraft = () => {
    try {
      localStorage.removeItem(DAILY_ENTRY_DRAFT_KEY);
    } catch {}
    setIsDraftRestored(false);
    setDate(getTodayDateString());
    setParcels(50);
    setHasIncentive(true);
    setNotes('');
    if (riders.length > 0) {
      setSelectedRiderId(riders[0].id);
    }
  };

  // Edit Modal State
  const [editingEntry, setEditingEntry] = useState<DeliveryEntry | null>(null);

  // Instant 1-Tap SMS / WhatsApp popup state on save
  const [instantShareData, setInstantShareData] = useState<{
    riderName: string;
    riderPhone: string;
    riderId: string;
    amount: number;
    message: string;
  } | null>(null);

  // Dynamic Rate Calculations
  const selectedRider = riders.find((r) => r.id === selectedRiderId);
  const activeBaseRate = 
    typeof selectedRider?.baseRate === 'number'
      ? selectedRider.baseRate
      : (userRateConfig?.defaultBaseRate ?? BASE_RATE);

  const activeIncentiveRate = 
    typeof selectedRider?.incentiveRate === 'number'
      ? selectedRider.incentiveRate
      : (userRateConfig?.defaultIncentiveRate ?? INCENTIVE_RATE);

  const incentivesAllowed = 
    canAccessIncentives && 
    (userRateConfig?.incentivesEnabled !== false) && 
    (selectedRider?.incentiveEnabled !== false);

  const isApplyingIncentive = incentivesAllowed && hasIncentive;
  const parcelCount = typeof parcels === 'number' && parcels >= 0 ? parcels : 0;
  const baseAmount = parcelCount * activeBaseRate;
  const incentiveAmount = parcelCount * (isApplyingIncentive ? activeIncentiveRate : 0);
  const totalEarnings = baseAmount + incentiveAmount;
  const effectiveRate = isApplyingIncentive ? (activeBaseRate + activeIncentiveRate) : activeBaseRate;

  // Recent entries (sorted newest first)
  const recentEntries = [...entries]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime() || b.createdAt.localeCompare(a.createdAt))
    .slice(0, 10);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedRiderId) {
      alert('Please select or add a rider first.');
      return;
    }

    if (parcelCount <= 0) {
      alert('Please enter a valid number of delivered parcels (> 0).');
      return;
    }

    const rider = riders.find((r) => r.id === selectedRiderId);
    if (!rider) return;

    onAddEntry({
      riderId: rider.id,
      riderName: rider.name,
      riderPhone: rider.phone,
      date,
      parcels: parcelCount,
      baseRate: activeBaseRate,
      hasIncentive: isApplyingIncentive,
      incentiveRate: activeIncentiveRate,
      baseAmount,
      incentiveAmount,
      totalEarnings,
      status: 'Unpaid',
      notes: notes.trim(),
    });

    // Construct automatic SMS / WhatsApp message and trigger direct native SMS fallback
    const statementUrl = `https://courier-rider-payout.vercel.app/#/statement/${encodeURIComponent(rider.id)}`;
    const autoMessage = `नमस्ते ${rider.name}, आपका पे-आउट/एडवांस अपडेट कर दिया गया है। कुल बकाया/हिसाब देखने के लिए खाता लेजर लिंक पर क्लिक करें: ${statementUrl}`;
    const cleanPhone = (rider.phone || '').trim().replace(/\D/g, '').slice(-10);

    if (isNativeAndroid()) {
      // Native Android (APK): Directly dispatch statement SMS via background SIM without opening external composer
      sendNativeBackgroundSms(cleanPhone, autoMessage).then((smsRes) => {
        if (smsRes.success) {
          setSubmittedToast('✅ सिम से SMS सफलतापूर्वक भेजा गया।');
        } else {
          setSubmittedToast(`⚠️ SMS सूचना: ${smsRes.error || 'सिम से SMS नहीं भेजा जा सका'}`);
        }
      });
    } else {
      // Desktop / Web Browser fallback: trigger 1-tap SMS/WhatsApp fallback modal
      try {
        window.open(`sms:${cleanPhone}?body=${encodeURIComponent(autoMessage)}`, '_blank');
      } catch (smsErr) {
        console.warn('Native SMS trigger notice:', smsErr);
      }

      setInstantShareData({
        riderName: rider.name,
        riderPhone: cleanPhone,
        riderId: rider.id,
        amount: totalEarnings,
        message: autoMessage,
      });
    }

    // Clear temporary draft ONLY when submitted successfully
    try {
      localStorage.removeItem(DAILY_ENTRY_DRAFT_KEY);
    } catch {}
    setIsDraftRestored(false);

    setSubmittedToast(`Logged ${parcelCount} parcels for ${rider.name} (Total: ${formatINR(totalEarnings)})`);
    setTimeout(() => setSubmittedToast(null), 3500);

    // Reset notes and prep next parcels for fast rapid entry
    setNotes('');
    setParcels(50);
  };

  const handleQuickAddParcels = (addQty: number) => {
    setParcels((prev) => (typeof prev === 'number' ? prev + addQty : addQty));
  };

  const handleSetExactParcels = (qty: number) => {
    setParcels(qty);
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      {/* Toast Notification */}
      {submittedToast && (
        <div
          id="entry-toast-success"
          className="bg-emerald-600 text-white px-4 py-3 rounded-2xl shadow-xl flex items-center justify-between text-xs font-semibold animate-in slide-in-from-top duration-200"
        >
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-200 shrink-0" />
            <span>{submittedToast}</span>
          </div>
          <button
            onClick={() => setSubmittedToast(null)}
            className="text-emerald-200 hover:text-white ml-2 text-sm"
          >
            ✕
          </button>
        </div>
      )}

      {/* Smart Festival Alert Ribbon (Today / Tomorrow / Upcoming) - strictly gated by Master Admin permission */}
      {canAccessFestivalGreetings && festivalAlert && (festivalAlert.status === 'today' || festivalAlert.status === 'tomorrow' || festivalAlert.status === 'upcoming') && (
        <div 
          id="daily-entry-festival-ribbon"
          className={`p-3.5 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs shadow-lg transition ${
            festivalAlert.status === 'today'
              ? 'bg-gradient-to-r from-emerald-950/70 via-slate-900 to-emerald-900/60 border-emerald-500/50 text-emerald-200'
              : festivalAlert.status === 'tomorrow'
              ? 'bg-gradient-to-r from-amber-950/70 via-slate-900 to-yellow-900/60 border-yellow-500/50 text-yellow-200'
              : 'bg-slate-850/90 border-slate-750 text-slate-300'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-base shrink-0 ${
              festivalAlert.status === 'today'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 animate-pulse'
                : festivalAlert.status === 'tomorrow'
                ? 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/40'
                : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
            }`}>
              {festivalAlert.status === 'today' ? '🎉' : festivalAlert.status === 'tomorrow' ? '🔔' : '🗓️'}
            </div>
            <div>
              <div className="font-extrabold text-white text-xs sm:text-sm flex items-center gap-2 flex-wrap">
                <span>{festivalAlert.alertHeadline}</span>
                <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-white/10 text-amber-300 border border-white/10">
                  {festivalAlert.festival.badge}
                </span>
              </div>
              <div className="text-[11px] text-slate-300 mt-0.5 line-clamp-1">
                {festivalAlert.festival.description}
              </div>
            </div>
          </div>

          <button
            type="button"
            id="open-festival-greetings-from-daily-entry-btn"
            onClick={() => setIsFestivalModalOpen(true)}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-3.5 py-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-black text-xs rounded-xl shadow-md transition active:scale-95 shrink-0"
          >
            <Sparkles className="w-3.5 h-3.5 text-slate-950" />
            <span>शुभकामनाएं भेजें (WhatsApp/SMS)</span>
          </button>
        </div>
      )}

      {/* Main Form Card */}
      <div className="bg-slate-850 border border-slate-750 rounded-2xl p-4 sm:p-6 shadow-xl relative overflow-hidden">
        {/* Subtle decorative background glow */}
        <div className="absolute -top-24 -right-24 w-60 h-60 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 rounded-xl bg-blue-600/20 text-blue-400 border border-blue-500/30">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white tracking-tight">
                Daily Delivery Entry
              </h2>
              <p className="text-xs text-slate-400">
                Log rider deliveries with automatic ₹13 base & ₹2 incentive payout computation
              </p>
            </div>
          </div>

          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-800 border border-slate-700 text-xs font-medium text-slate-300">
            <Coins className="w-3.5 h-3.5 text-amber-400" />
            <span>Base: ₹13 | Incentive: ₹2</span>
          </div>
        </div>

        {riders.length === 0 ? (
          <div className="text-center py-8 px-4 rounded-xl bg-slate-900/70 border border-slate-700/60">
            <AlertCircle className="w-8 h-8 text-amber-400 mx-auto mb-2" />
            <p className="text-sm font-semibold text-slate-200">No Courier Riders Found</p>
            <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
              Please add at least one rider to start logging daily deliveries.
            </p>
            <button
              onClick={onNavigateToRiders}
              className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white rounded-xl shadow transition"
            >
              <Plus className="w-4 h-4" />
              <span>Add First Rider</span>
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Restored Draft Alert */}
            {isDraftRestored && (
              <div className="flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-blue-500/15 border border-blue-500/30 text-xs text-blue-200 animate-in fade-in">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
                  <span>
                    <strong>In-Progress Draft Restored:</strong> Recovered your previous typing automatically.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleDiscardDraft}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-300 hover:text-white bg-slate-800 px-2.5 py-1 rounded-lg border border-slate-700 hover:border-slate-600 transition"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Reset Form</span>
                </button>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Rider Selector */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-slate-300">
                    Select Courier Rider <span className="text-red-400">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={onNavigateToRiders}
                    className="text-[11px] text-blue-400 hover:text-blue-300 flex items-center gap-1"
                  >
                    Manage Riders
                    <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
                <div className="relative">
                  <select
                    id="rider-select"
                    value={selectedRiderId}
                    onChange={(e) => setSelectedRiderId(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-sm font-medium text-slate-100 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition appearance-none"
                    required
                  >
                    {riders.map((rider) => (
                      <option key={rider.id} value={rider.id}>
                        {rider.name} • {rider.phone}
                      </option>
                    ))}
                  </select>
                  <div className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 text-xs">
                    ▼
                  </div>
                </div>

                {/* Quick Call & Contact Pill for Selected Rider */}
                {(() => {
                  const currentRider = riders.find((r) => r.id === selectedRiderId);
                  if (!currentRider) return null;
                  return (
                    <div className="mt-1.5 flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-slate-900/80 border border-slate-800 text-xs">
                      <div className="flex items-center gap-1.5 text-slate-300 truncate mr-2">
                        <UserCheck className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                        <span className="font-semibold truncate">{currentRider.name}</span>
                        <span className="text-slate-400 font-mono text-[11px] shrink-0">+91 {currentRider.phone}</span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <a
                          id={`call-selected-rider-${currentRider.id}`}
                          href={`tel:${currentRider.phone}`}
                          className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/40 text-blue-300 hover:text-white text-[11px] font-bold shadow-sm transition active:scale-95"
                          title={`Direct Call ${currentRider.name}`}
                        >
                          <Phone className="w-3 h-3" />
                          <span>Call</span>
                        </a>
                        <a
                          href={`https://wa.me/91${currentRider.phone}`}
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
                  );
                })()}
              </div>

              {/* Delivery Date Picker */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Delivery Date <span className="text-red-400">*</span>
                </label>
                <div className="relative">
                  <input
                    id="delivery-date-input"
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-sm font-medium text-slate-100 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition"
                    required
                  />
                </div>
              </div>
            </div>

            {/* Delivered Parcels Count */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-slate-300">
                  Number of Delivered Parcels <span className="text-red-400">*</span>
                </label>
                <span className="text-[11px] text-slate-400">Quick count presets:</span>
              </div>
              
              <div className="flex flex-col sm:flex-row gap-2.5">
                <div className="relative flex-1">
                  <input
                    id="parcels-count-input"
                    type="number"
                    min="1"
                    max="1000"
                    placeholder="e.g. 65"
                    value={parcels}
                    onChange={(e) =>
                      setParcels(e.target.value === '' ? '' : parseInt(e.target.value, 10))
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-base font-bold text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition"
                    required
                  />
                  <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400">
                    pkts
                  </span>
                </div>

                {/* Quick Presets for fast depot tap */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
                  {[40, 50, 60, 75, 90].map((qty) => (
                    <button
                      key={qty}
                      type="button"
                      onClick={() => handleSetExactParcels(qty)}
                      className={`px-2.5 py-2 text-xs font-semibold rounded-xl border transition shrink-0 ${
                        parcels === qty
                          ? 'bg-blue-600 text-white border-blue-500'
                          : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-750'
                      }`}
                    >
                      {qty}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => handleQuickAddParcels(10)}
                    className="px-2.5 py-2 text-xs font-bold rounded-xl border border-slate-700 bg-slate-800 text-emerald-400 hover:bg-slate-750 shrink-0"
                    title="Add 10 parcels"
                  >
                    +10
                  </button>
                </div>
              </div>
            </div>

            {/* Incentive Toggle / Checkbox */}
            <div className="p-3.5 rounded-2xl bg-gradient-to-r from-slate-800 to-slate-800/90 border border-slate-700/90 transition">
              {incentivesAllowed ? (
                <label className="flex items-start sm:items-center justify-between cursor-pointer gap-3">
                  <div className="flex items-center gap-3">
                    <input
                      id="incentive-checkbox"
                      type="checkbox"
                      checked={hasIncentive}
                      onChange={(e) => setHasIncentive(e.target.checked)}
                      className="w-5 h-5 rounded-md text-blue-600 focus:ring-blue-500 bg-slate-900 border-slate-600 cursor-pointer accent-blue-600 mt-0.5 sm:mt-0"
                    />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs sm:text-sm font-bold text-white">
                          Add ₹{activeIncentiveRate} Incentive per parcel
                        </span>
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                          ₹{activeBaseRate + activeIncentiveRate} Rate
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400">
                        {hasIncentive
                          ? `Incentive active: ₹${activeBaseRate} Base + ₹${activeIncentiveRate} Extra = ₹${activeBaseRate + activeIncentiveRate} per parcel`
                          : `Standard payout: Base rate ₹${activeBaseRate} per parcel (No incentive)`}
                      </p>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <span
                      className={`inline-block text-xs font-bold px-2.5 py-1 rounded-xl border transition ${
                        hasIncentive
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                          : 'bg-slate-700/60 text-slate-400 border-slate-600'
                      }`}
                    >
                      {hasIncentive ? `₹${activeBaseRate + activeIncentiveRate} / pkt` : `₹${activeBaseRate} / pkt`}
                    </span>
                  </div>
                </label>
              ) : (
                <div className="flex items-center justify-between text-xs text-slate-400 py-1">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-slate-500" />
                    <span>Incentive bonus system is disabled for this account/rider.</span>
                  </div>
                  <span className="font-bold text-slate-300 bg-slate-700/60 px-2.5 py-1 rounded-xl border border-slate-600">
                    Fixed ₹{activeBaseRate} / pkt
                  </span>
                </div>
              )}
            </div>

            {/* Optional Notes */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Route / Hub Notes <span className="text-slate-500 font-normal">(Optional)</span>
              </label>
              <input
                id="notes-input"
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Sector 14 delivery beat, on-time delivery bonus"
                className="w-full px-3.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs text-slate-200 focus:outline-none focus:border-blue-500 transition"
              />
            </div>

            {/* Live Calculation Display */}
            <div className="p-4 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-850 border border-blue-500/30 shadow-inner space-y-2.5">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-blue-500" />
                  Base Amount ({parcelCount} pkts × ₹{BASE_RATE})
                </span>
                <span className="font-semibold text-slate-200 text-sm">
                  {formatINR(baseAmount)}
                </span>
              </div>

              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="flex items-center gap-1.5">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      hasIncentive ? 'bg-emerald-400' : 'bg-slate-600'
                    }`}
                  />
                  Incentive Amount ({hasIncentive ? `${parcelCount} pkts × ₹${INCENTIVE_RATE}` : 'Not applied'})
                </span>
                <span
                  className={`font-semibold text-sm ${
                    hasIncentive ? 'text-emerald-400' : 'text-slate-500'
                  }`}
                >
                  +{formatINR(incentiveAmount)}
                </span>
              </div>

              <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
                <div>
                  <span className="text-xs uppercase font-bold tracking-wider text-slate-400">
                    Total Daily Earnings
                  </span>
                  <p className="text-[11px] text-slate-500">
                    Effective: ₹{effectiveRate} / parcel
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-xl sm:text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-emerald-300 to-emerald-400">
                    {formatINR(totalEarnings)}
                  </span>
                </div>
              </div>
            </div>

            {/* Submit Action */}
            <div className="space-y-2">
              <button
                id="submit-delivery-entry-btn"
                type="submit"
                className="w-full py-3.5 px-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-sm rounded-xl shadow-lg shadow-blue-600/25 active:scale-[0.99] transition flex items-center justify-center gap-2"
              >
                <CheckCircle className="w-4 h-4" />
                <span>Submit Delivery Entry</span>
              </button>
              
              <div className="flex items-center justify-between text-[11px] text-slate-400 px-1">
                <span className="flex items-center gap-1.5 text-emerald-400">
                  <Save className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Draft auto-saved continuously — safe from phone calls & app switching</span>
                </span>
                <span className="text-slate-500 text-[10px]">Auto-clears on submit</span>
              </div>
            </div>
          </form>
        )}
      </div>

      {/* Recent Entries Section */}
      <div className="bg-slate-850 border border-slate-750 rounded-2xl p-4 sm:p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm sm:text-base font-bold text-white">Recent Delivery Entries</h3>
            <p className="text-xs text-slate-400">Showing the latest 10 recorded delivery entries</p>
          </div>
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-800 border border-slate-700 text-slate-300">
            Total {entries.length} records
          </span>
        </div>

        {recentEntries.length === 0 ? (
          <div className="text-center py-10 text-slate-500 text-xs">
            No delivery entries recorded yet. Use the form above to add your first entry.
          </div>
        ) : (
          <div className="overflow-x-auto -mx-4 sm:mx-0">
            <div className="inline-block min-w-full align-middle">
              <table className="min-w-full divide-y divide-slate-800">
                <thead>
                  <tr className="bg-slate-900/60 text-slate-400 text-[11px] font-semibold uppercase tracking-wider">
                    <th className="py-2.5 px-3 text-left">Date</th>
                    <th className="py-2.5 px-3 text-left">Rider</th>
                    <th className="py-2.5 px-3 text-center">Parcels</th>
                    <th className="py-2.5 px-3 text-right">Base Pay</th>
                    <th className="py-2.5 px-3 text-center">Incentive</th>
                    <th className="py-2.5 px-3 text-right">Total</th>
                    <th className="py-2.5 px-3 text-center">Status</th>
                    <th className="py-2.5 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-xs">
                  {recentEntries.map((entry) => (
                    <tr key={entry.id} className="hover:bg-slate-800/40 transition">
                      <td className="py-2.5 px-3 text-slate-300 whitespace-nowrap font-medium">
                        {formatDateDisplay(entry.date)}
                      </td>
                      <td className="py-2.5 px-3 text-white font-semibold whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <span>{entry.riderName}</span>
                          {entry.riderPhone && (
                            <a
                              id={`call-entry-rider-${entry.id}`}
                              href={`tel:${entry.riderPhone}`}
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-blue-500/15 hover:bg-blue-500/25 border border-blue-500/30 text-blue-300 hover:text-white text-[10px] font-bold transition active:scale-95"
                              title={`Direct Call ${entry.riderName} (+91 ${entry.riderPhone})`}
                            >
                              <Phone className="w-2.5 h-2.5" />
                              <span>Call</span>
                            </a>
                          )}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-center font-bold text-blue-400 whitespace-nowrap">
                        {entry.parcels} pkts
                      </td>
                      <td className="py-2.5 px-3 text-right text-slate-300 whitespace-nowrap">
                        {formatINR(entry.baseAmount)}
                      </td>
                      <td className="py-2.5 px-3 text-center whitespace-nowrap">
                        {entry.hasIncentive ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                            +₹2 ({formatINR(entry.incentiveAmount)})
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-500">None</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right font-extrabold text-emerald-400 whitespace-nowrap">
                        {formatINR(entry.totalEarnings)}
                      </td>
                      <td className="py-2.5 px-3 text-center whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            entry.status === 'Paid'
                              ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                              : 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                          }`}
                        >
                          {entry.status}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => setEditingEntry(entry)}
                            className="p-1.5 text-slate-400 hover:text-blue-400 hover:bg-slate-800 rounded-lg transition"
                            title="Edit entry"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => {
                              if (window.confirm(`Delete entry for ${entry.riderName} on ${entry.date}?`)) {
                                onDeleteEntry(entry.id);
                              }
                            }}
                            className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded-lg transition"
                            title="Delete entry"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Edit Entry Modal */}
      {editingEntry && (
        <EditEntryModal
          entry={editingEntry}
          riders={riders}
          onSave={onUpdateEntry}
          onClose={() => setEditingEntry(null)}
          canAccessIncentives={incentivesAllowed}
        />
      )}

      {/* Festival Greetings Modal */}
      {canAccessFestivalGreetings && isFestivalModalOpen && (
        <FestivalGreetingsModal
          isOpen={isFestivalModalOpen}
          onClose={() => setIsFestivalModalOpen(false)}
          riders={riders}
          initialFestivalId={festivalAlert?.festival?.id}
          hubSignature={userRateConfig?.hubSignature}
        />
      )}

      {/* Automatic 1-Tap SMS / WhatsApp Instant Share Success Modal */}
      {instantShareData && (
        <InstantShareSuccessModal
          isOpen={Boolean(instantShareData)}
          onClose={() => setInstantShareData(null)}
          riderName={instantShareData.riderName}
          riderPhone={instantShareData.riderPhone}
          riderId={instantShareData.riderId}
          title="पे-आउट एंट्री दर्ज हुई! (Payout Logged)"
          subtitle={`सफलतापूर्वक दर्ज की गई • ${instantShareData.riderName}`}
          amount={instantShareData.amount}
          entryType="payout"
          customMessage={instantShareData.message}
        />
      )}
    </div>
  );
};
