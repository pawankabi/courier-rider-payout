import React, { useState, useMemo } from 'react';
import {
  X,
  MessageCircle,
  Sparkles,
  Phone,
  Check,
  Copy,
  Send,
  Calendar,
  Users,
  Info,
  Edit3,
  RotateCcw,
  MessageSquare,
  Clock,
  Loader2,
  Search,
  Filter,
  CheckSquare,
  Square,
} from 'lucide-react';
import { Rider } from '../types';
import {
  FESTIVALS,
  getFestivalAlert,
  getFestivalDaysDiff,
  getEffectiveFestivalMonthDay,
  loadFestivalDateOverrides,
  saveFestivalDateOverride,
  clearFestivalDateOverride,
  loadCustomFestivalTemplates,
  saveCustomFestivalTemplates,
  formatFestivalGreeting,
  buildWhatsAppGreetingUrl,
  buildSmsGreetingUrl,
} from '../data/festivals';
import {
  loadFestivalGreetingSentRecords,
  saveFestivalGreetingSentRecord,
  isFestivalGreetingSentWithin24Hours,
  FestivalGreetingSentRecord,
} from '../utils/storage';
import { isNativeAndroid, sendNativeBackgroundSms } from '../services/nativeSms';

export interface FestivalGreetingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  riders: Rider[];
  initialFestivalId?: string;
  hubSignature?: string;
}

const HINDI_MONTHS = [
  'जनवरी',
  'फ़रवरी',
  'मार्च',
  'अप्रैल',
  'मई',
  'जून',
  'जुलाई',
  'अगस्त',
  'सितंबर',
  'अक्टूबर',
  'नवंबर',
  'दिसंबर',
];

export const FestivalGreetingsModal: React.FC<FestivalGreetingsModalProps> = ({
  isOpen,
  onClose,
  riders,
  initialFestivalId,
  hubSignature,
}) => {
  const [dateOverrides, setDateOverrides] = useState(() => loadFestivalDateOverrides());
  const smartAlert = useMemo(() => getFestivalAlert(new Date(), dateOverrides), [dateOverrides]);

  const [selectedFestivalId, setSelectedFestivalId] = useState<string>(() => {
    if (initialFestivalId) return initialFestivalId;
    return smartAlert.festival.id;
  });

  const [categoryFilter, setCategoryFilter] = useState<
    'all' | 'upcoming_30' | 'local_jharkhand' | 'national'
  >('all');
  const [festivalSearch, setFestivalSearch] = useState('');

  // Custom message override state per festival (persisted in localStorage)
  const [customTemplates, setCustomTemplates] = useState<Record<string, string>>(() =>
    loadCustomFestivalTemplates()
  );
  const [isEditingTemplate, setIsEditingTemplate] = useState(false);

  // Optional lunar/yearly date adjustment UI
  const [isEditingDate, setIsEditingDate] = useState(false);
  const [editMonth, setEditMonth] = useState<number>(1);
  const [editDay, setEditDay] = useState<number>(1);

  // Rider list filtering & targeted selection
  const [riderSearch, setRiderSearch] = useState('');
  const [showUnsentOnly, setShowUnsentOnly] = useState(false);
  const [selectedRiderIds, setSelectedRiderIds] = useState<Set<string>>(() => new Set());

  // 24-Hour persistent records
  const [sentRecords, setSentRecords] = useState<FestivalGreetingSentRecord[]>(() =>
    loadFestivalGreetingSentRecords()
  );
  const [copiedRiderId, setCopiedRiderId] = useState<string | null>(null);
  const [smsFeedbackToast, setSmsFeedbackToast] = useState<{
    message: string;
    type: 'success' | 'error';
  } | null>(null);
  const [sendingRiderId, setSendingRiderId] = useState<string | null>(null);
  const [isBulkSending, setIsBulkSending] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ current: 0, total: 0, currentName: '' });
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [bulkTargetMode, setBulkTargetMode] = useState<'all_active' | 'unsent_only' | 'selected'>(
    'all_active'
  );

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const selectedFestival = useMemo(() => {
    return FESTIVALS.find((f) => f.id === selectedFestivalId) || smartAlert.festival || FESTIVALS[0];
  }, [selectedFestivalId, smartAlert.festival]);

  const effectiveDate = useMemo(
    () => getEffectiveFestivalMonthDay(selectedFestival, dateOverrides),
    [selectedFestival, dateOverrides]
  );

  const selectedFestivalDaysDiff = useMemo(
    () => getFestivalDaysDiff(selectedFestival, new Date(), dateOverrides),
    [selectedFestival, dateOverrides]
  );

  const activeTemplate = customTemplates[selectedFestival.id] || selectedFestival.greetingTemplate;

  const upcoming30Count = useMemo(() => {
    const now = new Date();
    return FESTIVALS.filter((f) => getFestivalDaysDiff(f, now, dateOverrides) <= 30).length;
  }, [dateOverrides]);

  // Filtered & sorted festivals for selector dropdown
  const filteredFestivals = useMemo(() => {
    const now = new Date();
    const q = festivalSearch.trim().toLowerCase();

    let list = FESTIVALS.filter((f) => {
      if (categoryFilter === 'local_jharkhand' && f.category !== 'local_jharkhand') return false;
      if (categoryFilter === 'national' && f.category !== 'national') return false;
      if (categoryFilter === 'upcoming_30' && getFestivalDaysDiff(f, now, dateOverrides) > 30) {
        return false;
      }
      if (!q) return true;
      return (
        f.nameHindi.toLowerCase().includes(q) ||
        f.name.toLowerCase().includes(q) ||
        f.region.toLowerCase().includes(q) ||
        f.dateLabel.toLowerCase().includes(q) ||
        f.description.toLowerCase().includes(q) ||
        (f.communityTag || '').toLowerCase().includes(q)
      );
    });

    if (categoryFilter === 'upcoming_30') {
      list = [...list].sort(
        (a, b) =>
          getFestivalDaysDiff(a, now, dateOverrides) - getFestivalDaysDiff(b, now, dateOverrides)
      );
    }
    return list;
  }, [categoryFilter, festivalSearch, dateOverrides]);

  // Strictly filter out all Inactive riders
  const activeRiders = useMemo(() => riders.filter((r) => r.active !== false), [riders]);
  const inactiveRidersCount = riders.length - activeRiders.length;

  const unsentActiveRiders = useMemo(
    () =>
      activeRiders.filter(
        (r) => !isFestivalGreetingSentWithin24Hours(sentRecords, r.id, selectedFestival.id).isSent
      ),
    [activeRiders, sentRecords, selectedFestival.id]
  );

  const visibleActiveRiders = useMemo(() => {
    const q = riderSearch.trim().toLowerCase();
    return activeRiders.filter((r) => {
      if (
        showUnsentOnly &&
        isFestivalGreetingSentWithin24Hours(sentRecords, r.id, selectedFestival.id).isSent
      ) {
        return false;
      }
      if (!q) return true;
      return r.name.toLowerCase().includes(q) || (r.phone || '').includes(q);
    });
  }, [activeRiders, riderSearch, showUnsentOnly, sentRecords, selectedFestival.id]);

  const targetBulkRiders = useMemo(() => {
    if (bulkTargetMode === 'selected' && selectedRiderIds.size > 0) {
      return activeRiders.filter((r) => selectedRiderIds.has(r.id));
    }
    if (bulkTargetMode === 'unsent_only') {
      return unsentActiveRiders;
    }
    return activeRiders;
  }, [bulkTargetMode, selectedRiderIds, activeRiders, unsentActiveRiders]);

  if (!isOpen) return null;

  const handleResetTemplate = () => {
    setCustomTemplates((prev) => {
      const next = { ...prev };
      delete next[selectedFestival.id];
      saveCustomFestivalTemplates(next);
      return next;
    });
    setIsEditingTemplate(false);
  };

  const handleTemplateChange = (val: string) => {
    setCustomTemplates((prev) => {
      const next = {
        ...prev,
        [selectedFestival.id]: val,
      };
      saveCustomFestivalTemplates(next);
      return next;
    });
  };

  const handleOpenDateEditor = () => {
    setEditMonth(effectiveDate.month);
    setEditDay(effectiveDate.day);
    setIsEditingDate((prev) => !prev);
  };

  const handleSaveDateOverride = () => {
    const updated = saveFestivalDateOverride(selectedFestival.id, editMonth, editDay);
    setDateOverrides(updated);
    setIsEditingDate(false);
    setSmsFeedbackToast({
      message: `📅 "${selectedFestival.nameHindi}" की तिथि ${editDay} ${HINDI_MONTHS[editMonth - 1]} पर अपडेट की गई।`,
      type: 'success',
    });
    setTimeout(() => setSmsFeedbackToast(null), 3500);
  };

  const handleResetDateOverride = () => {
    const updated = clearFestivalDateOverride(selectedFestival.id);
    setDateOverrides(updated);
    setIsEditingDate(false);
  };

  const handleToggleRiderSelect = (riderId: string) => {
    setSelectedRiderIds((prev) => {
      const next = new Set(prev);
      if (next.has(riderId)) next.delete(riderId);
      else next.add(riderId);
      return next;
    });
  };

  const handleMarkSent = (riderId: string) => {
    const updated = saveFestivalGreetingSentRecord(riderId, selectedFestival.id);
    setSentRecords(updated);
  };

  const handleSendWhatsApp = (rider: Rider) => {
    if (rider.active === false) {
      setSmsFeedbackToast({
        message: `⚠️ Rider "${rider.name}" is Inactive and excluded from festival greetings.`,
        type: 'error',
      });
      return;
    }
    const personalizedMessage = formatFestivalGreeting(activeTemplate, rider.name, hubSignature);
    const url = buildWhatsAppGreetingUrl(rider.phone, personalizedMessage);
    handleMarkSent(rider.id);
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleSendSimSms = async (rider: Rider) => {
    if (rider.active === false) {
      setSmsFeedbackToast({
        message: `⚠️ Rider "${rider.name}" is Inactive and excluded from festival greetings.`,
        type: 'error',
      });
      return;
    }
    const cleanPhone = (rider.phone || '').trim().replace(/\D/g, '').slice(-10);
    const personalizedMessage = formatFestivalGreeting(activeTemplate, rider.name, hubSignature);

    setSendingRiderId(rider.id);
    try {
      if (isNativeAndroid()) {
        const res = await sendNativeBackgroundSms(
          cleanPhone,
          personalizedMessage,
          `fest_${selectedFestival.id}_${rider.id}`
        );
        if (res.success) {
          handleMarkSent(rider.id);
          setSmsFeedbackToast({
            message: `✅ ${rider.name} को त्योहार SMS भेजा गया।`,
            type: 'success',
          });
        } else {
          setSmsFeedbackToast({
            message: `⚠️ ${rider.name} को SMS नहीं भेजा जा सका: ${res.error || 'सिम SMS त्रुटि'}`,
            type: 'error',
          });
        }
      } else {
        const url = buildSmsGreetingUrl(rider.phone, personalizedMessage);
        handleMarkSent(rider.id);
        try {
          window.open(url, '_blank', 'noopener,noreferrer');
        } catch {}
        setSmsFeedbackToast({
          message: `✅ ${rider.name} को त्योहार SMS भेजा गया।`,
          type: 'success',
        });
      }
    } catch (err: any) {
      setSmsFeedbackToast({
        message: `⚠️ ${rider.name} को SMS भेजने में त्रुटि: ${err?.message || 'असफल'}`,
        type: 'error',
      });
    } finally {
      setSendingRiderId(null);
      setTimeout(() => setSmsFeedbackToast(null), 4500);
    }
  };

  const handleCopyMessage = (rider: Rider) => {
    if (rider.active === false) return;
    const personalizedMessage = formatFestivalGreeting(activeTemplate, rider.name, hubSignature);
    navigator.clipboard.writeText(personalizedMessage);
    setCopiedRiderId(rider.id);
    setTimeout(() => setCopiedRiderId(null), 2500);
  };

  const nextUnsentRider = unsentActiveRiders[0];
  const sentCount = activeRiders.length - unsentActiveRiders.length;

  const openBulkConfirm = (mode: 'all_active' | 'unsent_only' | 'selected') => {
    setBulkTargetMode(mode);
    setShowConfirmModal(true);
  };

  const handleBulkSendFestivalSms = async () => {
    const recipients = targetBulkRiders;
    if (recipients.length === 0) return;

    setShowConfirmModal(false);
    setIsBulkSending(true);
    setBulkProgress({ current: 0, total: recipients.length, currentName: '' });

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < recipients.length; i++) {
      const rider = recipients[i];
      setBulkProgress({
        current: i + 1,
        total: recipients.length,
        currentName: rider.name,
      });

      const cleanPhone = (rider.phone || '').trim().replace(/\D/g, '').slice(-10);
      const personalizedMessage = formatFestivalGreeting(activeTemplate, rider.name, hubSignature);

      try {
        if (isNativeAndroid()) {
          const res = await sendNativeBackgroundSms(
            cleanPhone,
            personalizedMessage,
            `fest_${selectedFestival.id}_${rider.id}`
          );
          if (res.success) {
            handleMarkSent(rider.id);
            successCount++;
          } else {
            failCount++;
          }
        } else {
          const url = buildSmsGreetingUrl(rider.phone, personalizedMessage);
          handleMarkSent(rider.id);
          try {
            window.open(url, '_blank', 'noopener,noreferrer');
          } catch {}
          successCount++;
        }
      } catch {
        failCount++;
      }

      if (isNativeAndroid() && i < recipients.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 350));
      }
    }

    setIsBulkSending(false);
    if (bulkTargetMode === 'selected') {
      setSelectedRiderIds(new Set());
    }
    setSmsFeedbackToast({
      message: `✅ ${successCount} सक्रिय राइडर्स को त्योहार शुभकामनाएं भेज दी गईं!${
        failCount > 0 ? ` (${failCount} असफल)` : ''
      }`,
      type: 'success',
    });
    setTimeout(() => setSmsFeedbackToast(null), 5000);
  };

  const formatCountdownText = (days: number) => {
    if (days === 0) return 'आज है!';
    if (days === 1) return 'कल है!';
    return `${days} दिन बाद`;
  };

  const samplePreviewName = activeRiders[0]?.name || 'साथी राइडर';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-sm overflow-y-auto animate-in fade-in duration-150">
      <div
        className="bg-slate-900 border border-amber-500/30 w-full max-w-3xl rounded-2xl shadow-2xl overflow-hidden my-auto max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with Festive Gradient */}
        <div className="bg-gradient-to-r from-amber-600 via-orange-600 to-rose-600 p-4 sm:p-5 text-white flex items-start justify-between relative shrink-0">
          <div className="flex items-start sm:items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-black/20 backdrop-blur-md border border-white/20 flex items-center justify-center text-2xl shadow-lg shrink-0">
              🎉
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] uppercase tracking-wider font-extrabold px-2.5 py-0.5 rounded-full bg-black/35 border border-white/25">
                  {selectedFestival.badge}
                </span>
                <span className="text-[11px] text-amber-100 font-semibold">
                  {effectiveDate.isOverridden
                    ? `${effectiveDate.day} ${HINDI_MONTHS[effectiveDate.month - 1]} (कस्टम तिथि)`
                    : selectedFestival.dateLabel}
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-black/25 text-amber-100 font-bold">
                  ⏳ {formatCountdownText(selectedFestivalDaysDiff)}
                </span>
                {selectedFestival.communityTag && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/20 text-white font-bold">
                    {selectedFestival.communityTag}
                  </span>
                )}
              </div>
              <h2 className="text-lg sm:text-xl font-black mt-1 tracking-tight flex items-center gap-2">
                <span>{selectedFestival.nameHindi}</span>
              </h2>
              <p className="text-xs text-amber-100/90 mt-0.5 line-clamp-1">
                {selectedFestival.description}
              </p>
            </div>
          </div>

          <button
            id="close-festival-modal-btn"
            onClick={onClose}
            className="p-1.5 rounded-xl bg-black/20 hover:bg-black/40 text-white transition active:scale-95 shrink-0"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* SMS Feedback Toast Notification */}
        {smsFeedbackToast && (
          <div className="mx-4 mt-3 p-3 rounded-xl bg-slate-950 border border-amber-500/50 shadow-xl flex items-center justify-between gap-3 animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="flex items-center gap-2">
              <span className="text-base">
                {smsFeedbackToast.type === 'success' ? '📱' : '⚠️'}
              </span>
              <span
                className={`text-xs font-bold ${
                  smsFeedbackToast.type === 'success' ? 'text-emerald-300' : 'text-rose-300'
                }`}
              >
                {smsFeedbackToast.message}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setSmsFeedbackToast(null)}
              className="text-slate-400 hover:text-white p-1 rounded"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Modal Scrollable Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4">
          {/* Smart Auto-Detection Alert Banner */}
          {smartAlert.status === 'today' && (
            <div className="p-3.5 rounded-xl bg-gradient-to-r from-emerald-950/70 via-slate-900 to-emerald-900/60 border border-emerald-500/50 shadow-lg flex items-center justify-between gap-3 animate-pulse">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center justify-center text-lg shrink-0">
                  🎉
                </div>
                <div>
                  <div className="text-xs sm:text-sm font-extrabold text-emerald-300">
                    {smartAlert.alertHeadline}
                  </div>
                  <div className="text-[11px] text-emerald-200/80">
                    {smartAlert.alertDescription}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedFestivalId(smartAlert.festival.id)}
                className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-lg shrink-0 transition"
              >
                चुनें
              </button>
            </div>
          )}

          {smartAlert.status === 'tomorrow' && (
            <div className="p-3.5 rounded-xl bg-gradient-to-r from-amber-950/70 via-slate-900 to-yellow-900/60 border border-yellow-500/50 shadow-lg flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-yellow-500/20 text-yellow-300 border border-yellow-500/40 flex items-center justify-center text-lg shrink-0">
                  🔔
                </div>
                <div>
                  <div className="text-xs sm:text-sm font-extrabold text-yellow-300">
                    {smartAlert.alertHeadline}
                  </div>
                  <div className="text-[11px] text-yellow-200/80">
                    {smartAlert.alertDescription}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedFestivalId(smartAlert.festival.id)}
                className="px-3 py-1 bg-yellow-600 hover:bg-yellow-500 text-slate-950 font-black text-xs rounded-lg shrink-0 transition"
              >
                चुनें
              </button>
            </div>
          )}

          {smartAlert.status === 'upcoming' && (
            <div className="p-3 rounded-xl bg-slate-850 border border-slate-750 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-blue-500/15 text-blue-400 border border-blue-500/30 flex items-center justify-center text-sm shrink-0">
                  🗓️
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-200">
                    {smartAlert.alertHeadline}
                  </div>
                  <div className="text-[11px] text-slate-400">{smartAlert.alertDescription}</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedFestivalId(smartAlert.festival.id)}
                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-750 text-amber-300 border border-slate-700 font-semibold text-xs rounded-lg shrink-0 transition"
              >
                चुनें
              </button>
            </div>
          )}

          {/* Festival Selection Bar with Search, Category Tabs & Date Override */}
          <div className="bg-slate-850 p-3.5 rounded-xl border border-slate-750 space-y-2.5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <label className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-amber-400" />
                <span>पर्व चुनें ({filteredFestivals.length} प्रमुख पर्व):</span>
              </label>

              {/* Category Filter Tabs */}
              <div className="flex flex-wrap items-center gap-1 bg-slate-900/80 p-1 rounded-lg border border-slate-750 text-[11px] font-semibold">
                <button
                  type="button"
                  onClick={() => setCategoryFilter('all')}
                  className={`px-2 py-0.5 rounded-md transition ${
                    categoryFilter === 'all'
                      ? 'bg-amber-500 text-slate-950 font-bold'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  सभी ({FESTIVALS.length})
                </button>
                <button
                  type="button"
                  onClick={() => setCategoryFilter('upcoming_30')}
                  className={`px-2 py-0.5 rounded-md transition ${
                    categoryFilter === 'upcoming_30'
                      ? 'bg-amber-500 text-slate-950 font-bold'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  🗓️ आगामी 30 दिन ({upcoming30Count})
                </button>
                <button
                  type="button"
                  onClick={() => setCategoryFilter('local_jharkhand')}
                  className={`px-2 py-0.5 rounded-md transition ${
                    categoryFilter === 'local_jharkhand'
                      ? 'bg-amber-500 text-slate-950 font-bold'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  🌾 झारखंड लोक ({FESTIVALS.filter((f) => f.category === 'local_jharkhand').length})
                </button>
                <button
                  type="button"
                  onClick={() => setCategoryFilter('national')}
                  className={`px-2 py-0.5 rounded-md transition ${
                    categoryFilter === 'national'
                      ? 'bg-amber-500 text-slate-950 font-bold'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  🕉️🌙✝️ सर्वधर्म व राष्ट्रीय ({FESTIVALS.filter((f) => f.category === 'national').length})
                </button>
              </div>
            </div>

            {/* Search Input + Date Editor Trigger */}
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={festivalSearch}
                  onChange={(e) => setFestivalSearch(e.target.value)}
                  placeholder="पर्व, समुदाय या धर्म से खोजें (जैसे: करमा, परशुराम, माघे, ईद, छठ)..."
                  className="w-full pl-8 pr-8 py-2 rounded-xl bg-slate-900 border border-slate-750 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-500"
                />
                {festivalSearch && (
                  <button
                    type="button"
                    onClick={() => setFestivalSearch('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={handleOpenDateEditor}
                className={`inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold transition shrink-0 ${
                  effectiveDate.isOverridden
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                    : 'bg-slate-900 text-slate-300 border-slate-750 hover:text-white'
                }`}
                title="यदि इस वर्ष हिंदी/चांद्र तिथि बदली हो तो तारीख सेट करें"
              >
                <Calendar className="w-3.5 h-3.5 text-amber-400" />
                <span>{effectiveDate.isOverridden ? 'कस्टम तिथि सक्रिय' : 'तिथि बदलें'}</span>
              </button>
            </div>

            {/* Inline Yearly Lunar Date Override Panel */}
            {isEditingDate && (
              <div className="p-3 rounded-xl bg-slate-900/95 border border-amber-500/35 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-amber-300 font-semibold">इस वर्ष की तिथि सेट करें:</span>
                  <select
                    value={editDay}
                    onChange={(e) => setEditDay(Number(e.target.value))}
                    className="px-2 py-1 rounded-lg bg-slate-850 border border-slate-700 text-white"
                  >
                    {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                  <select
                    value={editMonth}
                    onChange={(e) => setEditMonth(Number(e.target.value))}
                    className="px-2 py-1 rounded-lg bg-slate-850 border border-slate-700 text-white"
                  >
                    {HINDI_MONTHS.map((mName, idx) => (
                      <option key={mName} value={idx + 1}>
                        {mName}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-1.5">
                  {effectiveDate.isOverridden && (
                    <button
                      type="button"
                      onClick={handleResetDateOverride}
                      className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-300 font-semibold"
                    >
                      डिफ़ॉल्ट करें
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleSaveDateOverride}
                    className="px-3 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-black"
                  >
                    सेव करें
                  </button>
                </div>
              </div>
            )}

            {/* Dropdown Select with Smart Countdown Indicator */}
            <div className="relative">
              <select
                id="festival-dropdown-select"
                value={selectedFestivalId}
                onChange={(e) => setSelectedFestivalId(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-750 text-xs sm:text-sm font-semibold text-amber-200 focus:outline-none focus:border-amber-500 appearance-none"
              >
                {filteredFestivals.length === 0 ? (
                  <option value={selectedFestival.id}>
                    कोई मेल खाता पर्व नहीं मिला — फिल्टर साफ़ करें
                  </option>
                ) : (
                  filteredFestivals.map((f) => {
                    const isCurrentAlert = f.id === smartAlert.festival.id;
                    const diff = getFestivalDaysDiff(f, new Date(), dateOverrides);
                    const tagInfo = f.communityTag ? ` • ${f.communityTag}` : '';
                    return (
                      <option key={f.id} value={f.id}>
                        {isCurrentAlert ? '⭐ ' : ''}
                        {f.nameHindi} — {f.dateLabel} ({formatCountdownText(diff)}
                        {tagInfo})
                      </option>
                    );
                  })
                )}
              </select>
              <div className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-amber-400 text-xs">
                ▼
              </div>
            </div>
          </div>

          {/* Cultural Significance & Traditional Blessing */}
          <div className="p-3.5 rounded-xl bg-amber-950/30 border border-amber-500/25 space-y-1.5">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <Info className="w-4 h-4 text-amber-400 shrink-0" />
                <h4 className="text-xs font-bold text-amber-300">
                  झारखंड एवं भारत में यह पर्व क्यों मनाया जाता है? (सांस्कृतिक महत्व):
                </h4>
              </div>
              {selectedFestival.communityTag && (
                <span className="text-[10px] px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-200 border border-amber-500/25 font-semibold">
                  {selectedFestival.communityTag}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-300 leading-relaxed font-sans">
              {selectedFestival.culturalSignificance}
            </p>
            <div className="pt-1.5 flex items-center gap-2 text-[11px] text-amber-200/90 font-medium flex-wrap">
              <span className="font-bold text-amber-400">पारंपरिक आशीष (Blessing):</span>
              <span className="italic bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                "{selectedFestival.traditionalBlessing}"
              </span>
            </div>
          </div>

          {/* Hindi Greeting Message Template Preview & Persistent Edit Box */}
          <div className="bg-slate-850 p-4 rounded-xl border border-amber-500/20 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-400" />
                <span className="text-xs font-bold text-white">
                  सम्मानजनक शुभकामना संदेश (Hindi Greeting Preview):
                </span>
              </div>

              <div className="flex items-center gap-2">
                {customTemplates[selectedFestival.id] && (
                  <button
                    type="button"
                    onClick={handleResetTemplate}
                    className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-white transition"
                    title="मूल संदेश वापस लाएं"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Reset</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsEditingTemplate(!isEditingTemplate)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-750 border border-slate-700 text-[11px] font-semibold text-amber-300 transition"
                >
                  <Edit3 className="w-3 h-3" />
                  <span>{isEditingTemplate ? 'सेव व प्रीव्यू' : 'संदेश बदलें'}</span>
                </button>
              </div>
            </div>

            {isEditingTemplate ? (
              <div>
                <textarea
                  value={activeTemplate}
                  onChange={(e) => handleTemplateChange(e.target.value)}
                  rows={6}
                  className="w-full p-3 rounded-xl bg-slate-900 border border-amber-500/50 text-xs text-white leading-relaxed focus:outline-none focus:ring-1 focus:ring-amber-500 font-sans"
                  placeholder="Use {riderName} as placeholder..."
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  💡 <code className="text-amber-300">{'{riderName}'}</code> की जगह प्रत्येक राइडर का नाम अपने-आप जुड़ जाएगा (बदलाव स्वतः सुरक्षित रहेगा)।
                </p>
              </div>
            ) : (
              <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 space-y-2 font-sans">
                <div className="text-xs text-slate-200 leading-relaxed whitespace-pre-line">
                  {formatFestivalGreeting(activeTemplate, samplePreviewName, hubSignature)}
                </div>
                {hubSignature && (
                  <div className="pt-1.5 border-t border-slate-800 text-[11px] text-amber-300/90 flex items-center gap-1.5">
                    <Sparkles className="w-3 h-3 text-amber-400" />
                    <span>हब हस्ताक्षर:</span>
                    <span className="font-semibold text-white bg-slate-800 px-2 py-0.5 rounded border border-slate-750">
                      {hubSignature}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 1-Click Bulk Send Card (All Active / Unsent Only / Selected) */}
          <div className="p-4 rounded-xl bg-gradient-to-r from-amber-600/25 via-orange-600/20 to-slate-900/90 border border-amber-500/40 shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <Sparkles className="w-4 h-4 text-amber-400" />
                <h4 className="text-sm font-bold text-white">
                  1-Click त्योहार SMS डिस्पैच
                </h4>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-extrabold border border-emerald-500/30">
                  {activeRiders.length} Active
                </span>
                {unsentActiveRiders.length < activeRiders.length && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 font-bold border border-blue-500/30">
                    {unsentActiveRiders.length} बाकी
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                {isNativeAndroid()
                  ? 'सिम से सीधे बैकग्राउंड SMS भेजें। चाहें तो केवल बाकी बचे या चुने हुए राइडर्स को ही भेजें।'
                  : 'सक्रिय राइडर्स को तुरंत त्योहार शुभकामना संदेश भेजें।'}
                {inactiveRidersCount > 0 && (
                  <span className="text-amber-400 font-semibold ml-1">
                    ({inactiveRidersCount} Inactive राइडर अलग रखे गए हैं)
                  </span>
                )}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {selectedRiderIds.size > 0 && (
                <button
                  type="button"
                  onClick={() => openBulkConfirm('selected')}
                  disabled={isBulkSending}
                  className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs shadow-md active:scale-95 transition cursor-pointer disabled:opacity-50"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>चुने हुए को भेजें ({selectedRiderIds.size})</span>
                </button>
              )}

              {unsentActiveRiders.length > 0 && unsentActiveRiders.length < activeRiders.length && (
                <button
                  type="button"
                  onClick={() => openBulkConfirm('unsent_only')}
                  disabled={isBulkSending}
                  className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-md active:scale-95 transition cursor-pointer disabled:opacity-50"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>केवल बाकी ({unsentActiveRiders.length}) को भेजें</span>
                </button>
              )}

              <button
                id="bulk-festival-sms-send-all-btn"
                type="button"
                onClick={() => openBulkConfirm('all_active')}
                disabled={activeRiders.length === 0 || isBulkSending}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-black text-xs shadow-md shadow-amber-500/25 active:scale-95 transition cursor-pointer disabled:opacity-50"
              >
                <Send className="w-4 h-4 text-slate-950" />
                <span>सभी Active को SMS ({activeRiders.length})</span>
              </button>
            </div>
          </div>

          {/* Live Bulk Dispatch Progress Bar */}
          {isBulkSending && (
            <div className="p-3.5 rounded-xl bg-amber-950/40 border border-amber-500/40 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-amber-300 flex items-center gap-1.5">
                  <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
                  <span>SMS भेजा जा रहा है: {bulkProgress.currentName}...</span>
                </span>
                <span className="font-bold text-amber-200">
                  {bulkProgress.current} / {bulkProgress.total}
                </span>
              </div>
              <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-amber-500 to-orange-500 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${(bulkProgress.current / bulkProgress.total) * 100}%` }}
                />
              </div>
            </div>
          )}

          {/* Active Riders List with Search, Unsent Filter & Multi-select */}
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Users className="w-4 h-4 text-emerald-400" />
                  <span>सक्रिय डिलीवरी राइडर्स ({activeRiders.length})</span>
                </h3>
                <p className="text-xs text-slate-400 flex items-center gap-1.5 mt-0.5">
                  <Clock className="w-3 h-3 text-slate-500" />
                  <span>
                    प्रगति: {sentCount} / {activeRiders.length} को भेजा गया (24 घंटे रिकॉर्ड)
                  </span>
                </p>
              </div>

              {/* Progress bar and Quick Next Action */}
              <div className="flex items-center gap-2 flex-wrap">
                <div className="w-24 bg-slate-800 h-2 rounded-full overflow-hidden border border-slate-700">
                  <div
                    className="bg-emerald-500 h-full transition-all duration-300"
                    style={{
                      width:
                        activeRiders.length > 0 ? `${(sentCount / activeRiders.length) * 100}%` : '0%',
                    }}
                  />
                </div>
                {nextUnsentRider && (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleSendSimSms(nextUnsentRider)}
                      disabled={sendingRiderId === nextUnsentRider.id || isBulkSending}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 text-white font-bold text-xs rounded-xl shadow border border-amber-400/40 transition active:scale-95 disabled:opacity-50"
                      title={`Send Native SIM SMS to ${nextUnsentRider.name}`}
                    >
                      <MessageSquare className="w-3 h-3 text-amber-200" />
                      <span>SIM: {nextUnsentRider.name}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSendWhatsApp(nextUnsentRider)}
                      disabled={isBulkSending}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow transition active:scale-95 disabled:opacity-50"
                      title={`Send WhatsApp to ${nextUnsentRider.name}`}
                    >
                      <Send className="w-3 h-3" />
                      <span>WA: {nextUnsentRider.name}</span>
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Compact Rider Search + Unsent Only + Select All Bar */}
            {activeRiders.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative flex-1 min-w-[180px]">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={riderSearch}
                    onChange={(e) => setRiderSearch(e.target.value)}
                    placeholder="राइडर का नाम या नंबर खोजें..."
                    className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-slate-850 border border-slate-750 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-500"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setShowUnsentOnly((prev) => !prev)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-semibold transition ${
                    showUnsentOnly
                      ? 'bg-blue-500/20 text-blue-300 border-blue-500/40'
                      : 'bg-slate-850 text-slate-300 border-slate-750 hover:text-white'
                  }`}
                >
                  <Filter className="w-3.5 h-3.5" />
                  <span>केवल बाकी ({unsentActiveRiders.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (selectedRiderIds.size > 0) {
                      setSelectedRiderIds(new Set());
                    } else {
                      setSelectedRiderIds(new Set(visibleActiveRiders.map((r) => r.id)));
                    }
                  }}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-850 hover:bg-slate-800 border border-slate-750 text-xs font-semibold text-amber-300 transition"
                >
                  {selectedRiderIds.size > 0 ? (
                    <>
                      <CheckSquare className="w-3.5 h-3.5" />
                      <span>चयन हटाएं ({selectedRiderIds.size})</span>
                    </>
                  ) : (
                    <>
                      <Square className="w-3.5 h-3.5" />
                      <span>सभी चुनें</span>
                    </>
                  )}
                </button>
              </div>
            )}

            {/* Active Rider List */}
            <div className="divide-y divide-slate-800/80 rounded-xl bg-slate-850 border border-slate-750 max-h-64 overflow-y-auto">
              {visibleActiveRiders.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-400 space-y-1">
                  <p>
                    {activeRiders.length === 0
                      ? 'कोई सक्रिय राइडर उपलब्ध नहीं है।'
                      : 'इस फ़िल्टर के अनुसार कोई राइडर नहीं मिला।'}
                  </p>
                  {inactiveRidersCount > 0 && activeRiders.length === 0 && (
                    <p className="text-amber-400">
                      सभी {inactiveRidersCount} राइडर्स Inactive हैं।
                    </p>
                  )}
                </div>
              ) : (
                visibleActiveRiders.map((rider, idx) => {
                  const sentStatus = isFestivalGreetingSentWithin24Hours(
                    sentRecords,
                    rider.id,
                    selectedFestival.id
                  );
                  const isCopied = copiedRiderId === rider.id;
                  const isSelected = selectedRiderIds.has(rider.id);

                  return (
                    <div
                      key={rider.id}
                      className="p-3 flex items-center justify-between gap-2 hover:bg-slate-800/40 transition"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <button
                          type="button"
                          onClick={() => handleToggleRiderSelect(rider.id)}
                          className="text-slate-400 hover:text-amber-300 shrink-0"
                          title="चुनें"
                        >
                          {isSelected ? (
                            <CheckSquare className="w-4 h-4 text-amber-400" />
                          ) : (
                            <Square className="w-4 h-4" />
                          )}
                        </button>
                        <span className="w-6 h-6 rounded-lg bg-slate-800 text-slate-400 text-[11px] font-mono font-bold flex items-center justify-center shrink-0">
                          #{idx + 1}
                        </span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-bold text-white truncate">
                              {rider.name}
                            </span>
                            {sentStatus.isSent && (
                              <span
                                id={`sent-badge-${rider.id}`}
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                                title={`पिछले 24 घंटे में भेजा गया (~${sentStatus.hoursRemaining}h बाकी)`}
                              >
                                <Check className="w-2.5 h-2.5" /> भेजा गया
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-0.5">
                            <span>+91 {rider.phone}</span>
                            <a
                              href={`tel:${rider.phone}`}
                              className="inline-flex items-center gap-0.5 text-blue-400 hover:text-blue-300 font-semibold"
                              title={`Direct call ${rider.name}`}
                            >
                              <Phone className="w-2.5 h-2.5" />
                              <span>Call</span>
                            </a>
                          </div>
                        </div>
                      </div>

                      {/* Action buttons: Copy, Call, SIM SMS, WhatsApp */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleCopyMessage(rider)}
                          className="p-1.5 text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-750 border border-slate-700 rounded-lg transition"
                          title="संदेश कॉपी करें"
                        >
                          {isCopied ? (
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>

                        <a
                          href={`tel:${rider.phone}`}
                          className="p-1.5 text-blue-300 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 rounded-lg transition"
                          title={`Call ${rider.name}`}
                        >
                          <Phone className="w-3.5 h-3.5" />
                        </a>

                        <button
                          type="button"
                          id={`send-festival-sim-sms-${rider.id}`}
                          onClick={() => handleSendSimSms(rider)}
                          disabled={sendingRiderId === rider.id || isBulkSending}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-bold rounded-xl transition active:scale-95 cursor-pointer disabled:opacity-50 ${
                            sendingRiderId === rider.id
                              ? 'bg-amber-600/40 text-amber-200 border border-amber-500/40 opacity-75'
                              : sentStatus.isSent
                              ? 'bg-slate-800 text-amber-300 border border-amber-500/30 hover:bg-amber-500/20'
                              : 'bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 text-white border border-amber-400/40 shadow-sm shadow-amber-600/25'
                          }`}
                          title={`SIM SMS भेजें (${rider.name})`}
                        >
                          <MessageSquare className="w-3.5 h-3.5 text-amber-200" />
                          <span>{sendingRiderId === rider.id ? 'Sending...' : 'SIM SMS'}</span>
                        </button>

                        <button
                          type="button"
                          id={`send-festival-wa-${rider.id}`}
                          onClick={() => handleSendWhatsApp(rider)}
                          disabled={isBulkSending}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-bold rounded-xl transition active:scale-95 disabled:opacity-50 ${
                            sentStatus.isSent
                              ? 'bg-slate-800 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20'
                              : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-600/25'
                          }`}
                          title={`WhatsApp शुभकामना भेजें (${rider.name})`}
                        >
                          <MessageCircle className="w-3.5 h-3.5" />
                          <span>{sentStatus.isSent ? 'Sent ✓' : 'WhatsApp'}</span>
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-3.5 bg-slate-950 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400 shrink-0">
          <span className="flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>संपूर्ण झारखंड की पावन लोक परंपरा व सर्वधर्म समरसता</span>
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-200 font-semibold transition cursor-pointer"
          >
            वापस जाएं (Close)
          </button>
        </div>
      </div>

      {/* Confirmation Modal for Bulk Festival SMS */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-60 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-amber-500/40 w-full max-w-md rounded-2xl p-5 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">
                    त्योहार SMS भेजने की पुष्टि करें
                  </h3>
                  <p className="text-xs text-amber-300 font-semibold">
                    {targetBulkRiders.length} राइडर्स को शुभकामनाएं भेजी जाएंगी
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-2 text-xs">
              <div className="flex items-center justify-between text-slate-300">
                <span>पर्व (Festival):</span>
                <span className="font-bold text-amber-300 truncate max-w-[210px]">
                  {selectedFestival.nameHindi}
                </span>
              </div>
              <div className="flex items-center justify-between text-slate-300">
                <span>प्राप्तकर्ता राइडर्स:</span>
                <span className="font-extrabold text-white">
                  {targetBulkRiders.length} राइडर्स
                </span>
              </div>
              <div className="flex items-center justify-between text-slate-300">
                <span>डिलीवरी माध्यम:</span>
                <span className="font-semibold text-emerald-400">
                  {isNativeAndroid() ? 'मोबाइल SIM से सीधे बैकग्राउंड SMS' : 'Web SMS Service'}
                </span>
              </div>
              {inactiveRidersCount > 0 && (
                <div className="flex items-center justify-between text-amber-400 pt-1.5 border-t border-slate-850">
                  <span>Inactive राइडर्स:</span>
                  <span className="font-bold">{inactiveRidersCount} (स्वतः अलग रखे गए)</span>
                </div>
              )}
            </div>

            <div className="space-y-1">
              <span className="text-[11px] font-semibold text-slate-400">संदेश प्रीव्यू:</span>
              <div className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800 text-xs text-amber-200/90 italic font-sans max-h-24 overflow-y-auto whitespace-pre-line">
                "{formatFestivalGreeting(activeTemplate, targetBulkRiders[0]?.name || samplePreviewName, hubSignature)}"
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-750 transition cursor-pointer"
              >
                रद्द करें
              </button>
              <button
                type="button"
                onClick={handleBulkSendFestivalSms}
                className="px-4 py-2 rounded-xl text-xs font-black bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 shadow-lg shadow-amber-500/25 active:scale-95 transition cursor-pointer"
              >
                पुष्टि करें व भेजें ({targetBulkRiders.length} SMS)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
