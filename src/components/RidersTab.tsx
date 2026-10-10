import React, { useState, useEffect } from 'react';
import { 
  Users, 
  UserPlus, 
  Phone, 
  MessageCircle, 
  Edit, 
  Trash2, 
  Search, 
  CheckCircle2, 
  Bike, 
  AlertCircle,
  AlertTriangle,
  X,
  Check,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  GripVertical,
  Clock,
  History,
  ChevronDown,
  ChevronUp,
  Coins,
  Calendar,
  DollarSign,
  Sparkles,
  IndianRupee,
  FileSpreadsheet,
  Plus,
  Table,
  Share2,
  Gift,
  Receipt
} from 'lucide-react';
import { Rider, DeliveryEntry, SettlementRecord, RiderAdvanceEntry, CodSettings } from '../types';
import { RiderAdvanceModal } from './RiderAdvanceModal';
import { RiderIncentiveModal } from './RiderIncentiveModal';
import { generateStatementUrl, formatSalarySmsText, dispatchAutomatedSms, getWhatsAppUrl, getNativeSmsUrl } from '../services/smsService';
import { 
  getRiderAppUrl, 
  copyAppShareLink 
} from '../utils/shareLink';
import { 
  formatINR, 
  isValidIndianPhone, 
  cleanPhoneNumber, 
  formatDateDisplay, 
  getTodayDateString, 
  getDaysAgoDateString 
} from '../utils/formatters';
import { FestivalBannerCard } from './FestivalBannerCard';
import { FestivalGreetingsModal } from './FestivalGreetingsModal';
import { BulkDateRangeSmsModal } from './BulkDateRangeSmsModal';
import { CodManagementModal } from './CodManagementModal';
import { CodCompanionApp } from './CodCompanionApp';
import { CodStandaloneApp } from './CodStandaloneApp';
import { loadCodSettings, DEFAULT_COD_SETTINGS } from '../services/codService';
import { isNativeAndroid, sendNativeBackgroundSms } from '../services/nativeSms';

interface Props {
  riders: Rider[];
  entries: DeliveryEntry[];
  onAddRider: (rider: Omit<Rider, 'id' | 'joinedDate'>) => void;
  onUpdateRider: (rider: Rider) => void;
  onDeleteRider: (id: string) => void;
  onReorderRiders?: (reorderedRiders: Rider[]) => void;
  onMarkEntriesPaid?: (
    entryIds: string[],
    advanceAmount?: number,
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
    }
  ) => void;
  onToggleEntryStatus?: (entryId: string) => void;
  onSaveAdvance?: (updatedRider: Rider, newAdvance: RiderAdvanceEntry) => Promise<void>;
  onDeleteAdvance?: (updatedRider: Rider, advanceId: string) => Promise<void>;
  onSaveIncentive?: (
    riderId: string,
    incentive: {
      amount: number;
      reason: string;
      date: string;
    }
  ) => Promise<void>;
  onDeleteIncentive?: (riderId: string, incentiveId: string) => Promise<void>;
  onViewLedger?: (riderId: string) => void;
  settlements?: SettlementRecord[];
  canAccessFestivalGreetings?: boolean;
  hubSignature?: string;
  isProUser?: boolean;
  onOpenSubscriptionModal?: (reason?: string) => void;
  isSuperAdmin?: boolean;
  userId?: string;
  hubName?: string;
  onOpenCodPortal?: () => void;
  onOpenCodCompanion?: () => void;
}

export const RidersTab: React.FC<Props> = ({
  riders,
  entries,
  settlements = [],
  onAddRider,
  onUpdateRider,
  onDeleteRider,
  onReorderRiders,
  onMarkEntriesPaid,
  onToggleEntryStatus,
  onSaveAdvance,
  onDeleteAdvance,
  onSaveIncentive,
  onDeleteIncentive,
  onViewLedger,
  canAccessFestivalGreetings = false,
  hubSignature,
  isProUser = true,
  onOpenSubscriptionModal,
  isSuperAdmin = false,
  userId = 'guest',
  hubName = 'सरायकेला कूरियर हब',
  onOpenCodPortal,
  onOpenCodCompanion,
}) => {
  // COD हिसाब-किताब Sub-App Modal State & Feature Flag
  const [isCodModalOpen, setIsCodModalOpen] = useState(false);
  const [copiedRiderUrl, setCopiedRiderUrl] = useState(false);
  const [codSettings, setCodSettings] = useState<CodSettings>(DEFAULT_COD_SETTINGS);
  const [isInternalCompanionOpen, setIsInternalCompanionOpen] = useState(false);
  const [isInternalStandaloneOpen, setIsInternalStandaloneOpen] = useState(false);

  // 1. Rider Companion Action: strictly opens CodCompanionApp
  const handleOpenCompanion = () => {
    if (onOpenCodCompanion) {
      onOpenCodCompanion();
    } else {
      setIsInternalCompanionOpen(true);
    }
  };

  // 2. Admin Standalone COD Portal Action: strictly opens CodStandaloneApp
  const handleOpenStandalonePortal = () => {
    if (onOpenCodPortal) {
      onOpenCodPortal();
    } else {
      setIsInternalStandaloneOpen(true);
    }
  };

  useEffect(() => {
    loadCodSettings(userId).then(setCodSettings);
  }, [userId, isCodModalOpen]);

  // Feature Flag: Super Admin always has access; regular users only when enabled by owner
  const canViewCodModule = Boolean(isSuperAdmin || codSettings.isEnabled);

  // Status Filter State: 'unpaid' (Default), 'all', 'active', 'inactive'
  const [statusFilter, setStatusFilter] = useState<'unpaid' | 'all' | 'active' | 'inactive'>(() => {
    try {
      const saved = localStorage.getItem('cp_riders_status_filter');
      if (saved === 'all' || saved === 'unpaid' || saved === 'active' || saved === 'inactive') return saved as any;
    } catch {}
    return 'unpaid';
  });

  useEffect(() => {
    try {
      localStorage.setItem('cp_riders_status_filter', statusFilter);
    } catch {}
  }, [statusFilter]);

  // Full-screen in-app rendering of CodCompanionApp when opened internally without external browser
  if (isInternalCompanionOpen) {
    return (
      <div className="fixed inset-0 z-50 bg-slate-900 overflow-y-auto">
        <CodCompanionApp onBackToMainApp={() => setIsInternalCompanionOpen(false)} />
      </div>
    );
  }

  // Full-screen in-app rendering of Admin Standalone COD Grid/Sub-App (CodStandaloneApp)
  if (isInternalStandaloneOpen) {
    return (
      <CodStandaloneApp
        onExit={() => setIsInternalStandaloneOpen(false)}
        riders={riders}
        userId={userId || 'guest'}
        isSuperAdmin={Boolean(isSuperAdmin)}
        hubName={hubName}
      />
    );
  }

  // Advance Management Modal state
  const [advanceModalRider, setAdvanceModalRider] = useState<Rider | null>(null);
  // Incentive Management Modal state
  const [incentiveModalRider, setIncentiveModalRider] = useState<Rider | null>(null);

  // Expanded entry lists per rider ID
  const [expandedRiderIds, setExpandedRiderIds] = useState<Record<string, boolean>>({});

  // Add Rider Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [initialStatus, setInitialStatus] = useState<boolean>(true);

  // Sorting State
  const [sortBy, setSortBy] = useState<
    'order' | 'unpaid-desc' | 'name-asc' | 'name-desc' | 'parcels-desc' | 'newest'
  >('order');

  // New Rider Form State
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [vehicleType, setVehicleType] = useState('Hero Splendor');
  const [searchQuery, setSearchQuery] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);

  // Edit Rider Modal
  const [editingRider, setEditingRider] = useState<Rider | null>(null);

  // Delete Confirmation Popup State
  const [deletingRider, setDeletingRider] = useState<Rider | null>(null);

  // Mark Paid Modal State
  const [payingRiderData, setPayingRiderData] = useState<{
    rider: Rider;
    stats: ReturnType<typeof getRiderStats>;
  } | null>(null);
  const [advanceDeduction, setAdvanceDeduction] = useState<number | string>(0);
  const [paidToast, setPaidToast] = useState<string | null>(null);

  // Drag and drop state
  const [draggedRiderId, setDraggedRiderId] = useState<string | null>(null);

  // Festival Greetings Modal State
  const [isFestivalModalOpen, setIsFestivalModalOpen] = useState(false);

  // Date Range Filter State for Payouts / Summaries
  const [rangeStartDate, setRangeStartDate] = useState<string>(() => {
    try {
      const saved = localStorage.getItem('cp_riders_range_start');
      if (saved) return saved;
    } catch {}
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}-01`;
  });

  const [rangeEndDate, setRangeEndDate] = useState<string>(() => {
    try {
      const saved = localStorage.getItem('cp_riders_range_end');
      if (saved) return saved;
    } catch {}
    return getTodayDateString();
  });

  const [isBulkSmsModalOpen, setIsBulkSmsModalOpen] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem('cp_riders_range_start', rangeStartDate);
      localStorage.setItem('cp_riders_range_end', rangeEndDate);
    } catch {}
  }, [rangeStartDate, rangeEndDate]);

  const handleSetPreset = (preset: 'this_month' | 'last_7_days' | 'last_30_days' | 'today' | 'all_time') => {
    const today = getTodayDateString();
    if (preset === 'today') {
      setRangeStartDate(today);
      setRangeEndDate(today);
    } else if (preset === 'last_7_days') {
      setRangeStartDate(getDaysAgoDateString(6));
      setRangeEndDate(today);
    } else if (preset === 'last_30_days') {
      setRangeStartDate(getDaysAgoDateString(29));
      setRangeEndDate(today);
    } else if (preset === 'this_month') {
      const now = new Date();
      const y = now.getFullYear();
      const m = String(now.getMonth() + 1).padStart(2, '0');
      setRangeStartDate(`${y}-${m}-01`);
      setRangeEndDate(today);
    } else if (preset === 'all_time') {
      setRangeStartDate('');
      setRangeEndDate('');
    }
  };

  const getRiderRangeStats = (riderId: string) => {
    const riderEntries = entries.filter((e) => {
      if (e.riderId !== riderId) return false;
      if (rangeStartDate && e.date < rangeStartDate) return false;
      if (rangeEndDate && e.date > rangeEndDate) return false;
      return true;
    });
    const parcels = riderEntries.reduce((sum, e) => sum + e.parcels, 0);
    const earnings = riderEntries.reduce((sum, e) => sum + e.totalEarnings, 0);
    return { parcels, earnings, count: riderEntries.length };
  };

  const filteredRangeEntries = entries.filter((e) => {
    if (rangeStartDate && e.date < rangeStartDate) return false;
    if (rangeEndDate && e.date > rangeEndDate) return false;
    return true;
  });
  const totalRangeParcels = filteredRangeEntries.reduce((sum, e) => sum + e.parcels, 0);
  const totalRangeEarnings = filteredRangeEntries.reduce((sum, e) => sum + e.totalEarnings, 0);

  const handlePhoneChange = (val: string) => {
    setPhone(val);
    if (phoneError) setPhoneError('');
  };

  // Khatabook-style Phonebook Contact Picker
  const handlePickContact = async () => {
    try {
      if ('contacts' in navigator && 'ContactsManager' in window) {
        const props = ['name', 'tel'];
        const contacts = await (navigator as any).contacts.select(props, { multiple: false });
        if (contacts && contacts.length > 0) {
          const selected = contacts[0];
          const contactName = selected.name?.[0] || '';
          const rawPhone = selected.tel?.[0] || '';
          const clean = rawPhone.replace(/[^0-9]/g, '').slice(-10);

          if (contactName) {
            setName(contactName);
          }
          if (clean) {
            setPhone(clean);
            if (phoneError) setPhoneError('');
          }
        }
      } else {
        alert('फ़ोनबुक पिकर आपके इस डिवाइस में सीधे उपलब्ध नहीं है या अनुमति बंद है।');
      }
    } catch (err) {
      console.log('Contact pick cancelled or error:', err);
    }
  };

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // 1. Freemium Gate: Free users can add up to 3 riders locally
    if (!isProUser && riders.length >= 3) {
      setIsAddModalOpen(false);
      onOpenSubscriptionModal?.('free_limit_reached');
      return;
    }

    const cleanPhone = cleanPhoneNumber(phone);

    if (!name.trim()) {
      setPhoneError('Please enter the full name.');
      return;
    }

    if (!isValidIndianPhone(cleanPhone)) {
      setPhoneError('Please enter a valid 10-digit Indian mobile number (e.g. 9876543210)');
      return;
    }

    // Check duplicate phone
    const existing = riders.find((r) => cleanPhoneNumber(r.phone) === cleanPhone);
    if (existing) {
      setPhoneError(`Phone number already registered with rider "${existing.name}".`);
      return;
    }

    onAddRider({
      name: name.trim(),
      phone: cleanPhone,
      vehicleType: vehicleType.trim() || 'Hero Splendor',
      active: initialStatus,
    });

    setName('');
    setPhone('');
    setVehicleType('Hero Splendor');
    setInitialStatus(true);
    setPhoneError('');
    setIsAddModalOpen(false);
    setShowAddForm(false);
    setPaidToast(`Successfully added rider "${name.trim()}"!`);
    setTimeout(() => setPaidToast(null), 3500);
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRider) return;

    const cleanPhone = cleanPhoneNumber(editingRider.phone);
    if (!isValidIndianPhone(cleanPhone)) {
      alert('Please enter a valid 10-digit Indian phone number.');
      return;
    }

    onUpdateRider({
      ...editingRider,
      name: editingRider.name.trim(),
      phone: cleanPhone,
    });

    setEditingRider(null);
  };

  // Toggle Rider Active / Inactive Status
  const handleToggleRiderActive = (rider: Rider) => {
    const newActive = rider.active === false ? true : false;
    onUpdateRider({
      ...rider,
      active: newActive,
    });
    setPaidToast(
      newActive
        ? `✅ Rider "${rider.name}" is now Active.`
        : `⏸️ Rider "${rider.name}" marked as Inactive.`
    );
    setTimeout(() => setPaidToast(null), 3000);
  };

  // Move Rider Up / Down in list
  const handleMoveRider = (riderId: string, direction: 'up' | 'down') => {
    const currentIndex = riders.findIndex((r) => r.id === riderId);
    if (currentIndex === -1) return;

    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= riders.length) return;

    const updated = [...riders];
    const temp = updated[currentIndex];
    updated[currentIndex] = updated[targetIndex];
    updated[targetIndex] = temp;

    if (onReorderRiders) {
      onReorderRiders(updated);
    }
  };

  // Drag and drop handlers
  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedRiderId(id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, targetRiderId: string) => {
    e.preventDefault();
    if (!draggedRiderId || draggedRiderId === targetRiderId) return;

    const fromIndex = riders.findIndex((r) => r.id === draggedRiderId);
    const toIndex = riders.findIndex((r) => r.id === targetRiderId);
    if (fromIndex === -1 || toIndex === -1) return;

    const updated = [...riders];
    const [moved] = updated.splice(fromIndex, 1);
    updated.splice(toIndex, 0, moved);

    setDraggedRiderId(null);
    if (onReorderRiders) {
      onReorderRiders(updated);
    }
  };

  // Toggle expanded entries
  const toggleExpandRider = (riderId: string) => {
    setExpandedRiderIds((prev) => ({
      ...prev,
      [riderId]: !prev[riderId],
    }));
  };

  // Get aggregated stats for each rider
  const getRiderStats = (riderId: string) => {
    const riderEntries = entries.filter((e) => e.riderId === riderId);
    const unpaidEntries = riderEntries.filter((e) => e.status === 'Unpaid');
    const paidEntries = riderEntries.filter((e) => e.status === 'Paid');

    const totalParcels = riderEntries.reduce((sum, e) => sum + e.parcels, 0);
    const totalEarned = riderEntries.reduce((sum, e) => sum + e.totalEarnings, 0);

    const unpaidParcels = unpaidEntries.reduce((sum, e) => sum + e.parcels, 0);
    const unpaidAmount = unpaidEntries.reduce((sum, e) => sum + e.totalEarnings, 0);

    const paidParcels = paidEntries.reduce((sum, e) => sum + e.parcels, 0);
    const paidAmount = paidEntries.reduce((sum, e) => sum + e.totalEarnings, 0);

    return {
      totalParcels,
      totalEarned,
      unpaidAmount,
      unpaidParcels,
      unpaidCount: unpaidEntries.length,
      unpaidEntries: [...unpaidEntries].sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      ),
      paidAmount,
      paidParcels,
      paidCount: paidEntries.length,
      paidEntries: [...paidEntries].sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      ),
      allEntries: [...riderEntries].sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      ),
      entriesCount: riderEntries.length,
    };
  };

  // Restore persisted active modal for a rider (e.g. after phone unlock / app resume)
  useEffect(() => {
    if (riders.length === 0) return;
    try {
      const raw = localStorage.getItem('cp_riders_active_modal');
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed?.riderId) {
        const target = riders.find((r) => r.id === parsed.riderId);
        if (target) {
          if (parsed.type === 'advance') {
            setAdvanceModalRider((curr) => (curr?.id === target.id ? curr : target));
          } else if (parsed.type === 'edit') {
            setEditingRider((curr) => (curr?.id === target.id ? curr : target));
          } else if (parsed.type === 'paying') {
            const stats = getRiderStats(target.id);
            setPayingRiderData((curr) => (curr?.rider?.id === target.id ? curr : { rider: target, stats }));
          }
        }
      }
    } catch {}
  }, [riders]);

  // Persist open modal state so lock/unlock / page refresh brings user right back
  useEffect(() => {
    try {
      if (advanceModalRider) {
        localStorage.setItem(
          'cp_riders_active_modal',
          JSON.stringify({ type: 'advance', riderId: advanceModalRider.id })
        );
      } else if (editingRider) {
        localStorage.setItem(
          'cp_riders_active_modal',
          JSON.stringify({ type: 'edit', riderId: editingRider.id })
        );
      } else if (payingRiderData) {
        localStorage.setItem(
          'cp_riders_active_modal',
          JSON.stringify({ type: 'paying', riderId: payingRiderData.rider.id })
        );
      } else {
        localStorage.removeItem('cp_riders_active_modal');
      }
    } catch {}
  }, [advanceModalRider, editingRider, payingRiderData]);

  // Smooth Escape key handler to return smoothly without freeze
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (advanceModalRider) setAdvanceModalRider(null);
        else if (incentiveModalRider) setIncentiveModalRider(null);
        else if (isAddModalOpen) setIsAddModalOpen(false);
        else if (editingRider) setEditingRider(null);
        else if (deletingRider) setDeletingRider(null);
        else if (payingRiderData) setPayingRiderData(null);
        else if (isFestivalModalOpen) setIsFestivalModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [advanceModalRider, incentiveModalRider, isAddModalOpen, editingRider, deletingRider, payingRiderData, isFestivalModalOpen]);

  // Mark all unpaid entries for rider as paid
  const handleOpenMarkPaid = (rider: Rider) => {
    const stats = getRiderStats(rider.id);
    if (stats.unpaidCount === 0) return;
    setAdvanceDeduction(0);
    setPayingRiderData({ rider, stats });
  };

  const handleConfirmMarkPaid = () => {
    if (!payingRiderData || !onMarkEntriesPaid) return;

    const { rider, stats } = payingRiderData;
    const unpaidIds = stats.unpaidEntries.map((e) => e.id);
    if (unpaidIds.length === 0) {
      setPayingRiderData(null);
      return;
    }

    const numAdvance =
      typeof advanceDeduction === 'number'
        ? advanceDeduction
        : parseFloat(advanceDeduction) || 0;

    const dates = stats.unpaidEntries.map((e) => e.date).sort();
    const startDate = dates[0] || getTodayDateString();
    const endDate = dates[dates.length - 1] || getTodayDateString();

    onMarkEntriesPaid(
      unpaidIds,
      numAdvance,
      numAdvance > 0 ? getTodayDateString() : undefined,
      {
        riderId: rider.id,
        riderName: rider.name,
        riderPhone: rider.phone,
        startDate,
        endDate,
        totalParcels: stats.unpaidParcels,
        baseAmount: stats.unpaidEntries.reduce((sum, e) => sum + e.baseAmount, 0),
        incentiveAmount: stats.unpaidEntries.reduce(
          (sum, e) => sum + e.incentiveAmount,
          0
        ),
        grossTotal: stats.unpaidAmount,
      }
    );

    // Precise SIM SMS dispatch on payout settlement stating exact date range, gross, advance adjustment and net
    const cleanPhone = cleanPhoneNumber(rider.phone);
    const grossPayout = stats.unpaidAmount;
    const netPayout = grossPayout - numAdvance;
    const effectiveHub = (hubSignature || '').trim() || 'सरायकेला कूरियर हब';

    const settlementSms =
      netPayout >= 0
        ? `नमस्ते ${rider.name}, आपका दिनांक ${formatDateDisplay(startDate)} से ${formatDateDisplay(endDate)} तक कुल पारिश्रमिक ₹${grossPayout} बना है। आपका कुल एडवांस ₹${numAdvance} समायोजित कर कुल नेट भुगतान ₹${netPayout} कर दिया गया है। धन्यवाद - ${effectiveHub}`
        : `नमस्ते ${rider.name}, आपका दिनांक ${formatDateDisplay(startDate)} से ${formatDateDisplay(endDate)} तक का कुल पारिश्रमिक ₹${grossPayout} बना, जबकि आपका कुल एडवांस ₹${numAdvance} था। हिसाब के उपरांत आपसे ₹${Math.abs(netPayout)} लेना शेष है। कृपया यह राशि आज ही कार्यालय में जमा कर दें ताकि अन्य डिलीवरी साथियों को भुगतान किया जा सके। आपके सहयोग के लिए धन्यवाद - ${effectiveHub}`;

    if (isNativeAndroid()) {
      sendNativeBackgroundSms(cleanPhone, settlementSms).then((smsRes) => {
        if (smsRes.success) {
          setPaidToast(`✅ सिम से पे-आउट सेटलमेंट SMS भेजा गया: ${rider.name}`);
        } else {
          setPaidToast(`⚠️ पे-आउट सेटल हुआ, SMS: ${smsRes.error || 'सिम SMS नहीं भेजा जा सका'}`);
        }
        setTimeout(() => setPaidToast(null), 4500);
      });
    } else {
      setPaidToast(
        `Marked ${formatINR(stats.unpaidAmount)} as Paid for ${
          rider.name
        }. Balance updated in Firestore!`
      );
      setTimeout(() => setPaidToast(null), 4500);
    }

    setPayingRiderData(null);
    setAdvanceDeduction(0);
  };

  // Toggle single entry
  const handleToggleEntry = (entryId: string, riderName: string) => {
    if (onToggleEntryStatus) {
      onToggleEntryStatus(entryId);
      setPaidToast(`Updated entry status in Firestore for ${riderName}.`);
      setTimeout(() => setPaidToast(null), 3000);
    }
  };

  // Global counts for filter badges
  const totalUnpaidDeliveries = entries.filter((e) => e.status === 'Unpaid');
  const totalUnpaidAmount = totalUnpaidDeliveries.reduce(
    (sum, e) => sum + e.totalEarnings,
    0
  );
  const totalUnpaidParcels = totalUnpaidDeliveries.reduce(
    (sum, e) => sum + e.parcels,
    0
  );
  const totalAdvanceAmount = riders.reduce(
    (sum, r) => sum + (Number(r.totalAdvance) || 0),
    0
  );

  const ridersWithUnpaid = riders.filter((r) => {
    const stats = getRiderStats(r.id);
    return stats.unpaidAmount > 0;
  });

  const activeRidersCount = riders.filter((r) => r.active !== false).length;
  const inactiveRidersCount = riders.filter((r) => r.active === false).length;

  // Filter riders by search query AND statusFilter ('unpaid', 'all', 'active', 'inactive')
  const filteredRiders = riders.filter((r) => {
    const matchesSearch =
      r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.phone.includes(searchQuery);

    if (!matchesSearch) return false;

    if (statusFilter === 'unpaid') {
      const stats = getRiderStats(r.id);
      return stats.unpaidAmount > 0;
    }

    if (statusFilter === 'active') {
      return r.active !== false;
    }

    if (statusFilter === 'inactive') {
      return r.active === false;
    }

    return true; // 'all' shows all riders
  });

  // Sort filtered riders by chosen sort criterion
  const sortedFilteredRiders = [...filteredRiders].sort((a, b) => {
    if (sortBy === 'name-asc') {
      return a.name.localeCompare(b.name);
    }
    if (sortBy === 'name-desc') {
      return b.name.localeCompare(a.name);
    }
    if (sortBy === 'unpaid-desc') {
      const unpaidA = getRiderStats(a.id).unpaidAmount;
      const unpaidB = getRiderStats(b.id).unpaidAmount;
      return unpaidB - unpaidA;
    }
    if (sortBy === 'parcels-desc') {
      const parcelsA = getRiderStats(a.id).totalParcels;
      const parcelsB = getRiderStats(b.id).totalParcels;
      return parcelsB - parcelsA;
    }
    if (sortBy === 'newest') {
      return (b.joinedDate || '').localeCompare(a.joinedDate || '');
    }
    // Default 'order' (sequence index)
    const orderA = typeof a.order === 'number' ? a.order : 99999;
    const orderB = typeof b.order === 'number' ? b.order : 99999;
    return orderA - orderB;
  });

  return (
    <div className="space-y-5 max-w-5xl mx-auto pb-12">
      {/* Toast Notification */}
      {paidToast && (
        <div className="bg-emerald-600 text-white px-4 py-3 rounded-2xl shadow-xl flex items-center justify-between text-xs font-semibold animate-in slide-in-from-top duration-200">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-200 shrink-0" />
            <span>{paidToast}</span>
          </div>
          <button
            onClick={() => setPaidToast(null)}
            className="text-emerald-200 hover:text-white ml-2 text-sm"
          >
            ✕
          </button>
        </div>
      )}

      {/* Automated / One-Tap WhatsApp Festival Greetings Banner - strictly gated by Master Admin permission */}
      {canAccessFestivalGreetings && (
        <FestivalBannerCard riders={riders} hubSignature={hubSignature} />
      )}

      {/* Header & Controls */}
      <div className="bg-gradient-to-br from-blue-950/60 via-sky-900/35 to-slate-900/70 border border-blue-500/40 shadow-lg shadow-blue-950/25 rounded-2xl p-4 sm:p-6 backdrop-blur-md">
        <div className="flex flex-col gap-3">
          {/* Top Title & Subtitle */}
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 rounded-xl bg-blue-600/25 text-sky-300 border border-blue-400/40 shadow-sm">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white tracking-tight">
                Riders & Delivery Fleet
              </h2>
              <p className="text-xs text-slate-300">
                Track unpaid balances, settle payouts, call or WhatsApp riders directly & manage sequence
              </p>
            </div>
          </div>

          {/* Prominent Always-Visible 2-Column Summary Badges */}
          <div className="grid grid-cols-2 gap-3 my-3">
            {/* Card 1: Total Unpaid (Distinct glowing Red/Coral) */}
            <div className="bg-gradient-to-br from-rose-950/70 via-red-950/50 to-slate-900/80 border border-rose-500/50 rounded-xl p-3 flex flex-col justify-between shadow-md shadow-rose-950/30">
              <div className="flex items-center justify-between gap-1 flex-wrap">
                <span className="text-xs sm:text-sm font-bold text-rose-300 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                  <span>कुल बकाया (Total Unpaid)</span>
                </span>
                <span className="text-[10px] sm:text-[11px] font-semibold text-rose-200 bg-rose-500/25 px-2 py-0.5 rounded-md border border-rose-500/40">
                  {totalUnpaidParcels} pkts
                </span>
              </div>
              <div className="text-lg sm:text-2xl font-black text-rose-200 mt-1">
                {formatINR(totalUnpaidAmount)}
              </div>
              <div className="text-[10px] text-rose-300/80 mt-0.5 font-medium">
                {ridersWithUnpaid.length} राइडर पेंडिंग
              </div>
            </div>

            {/* Card 2: Total Advance (Deep Violet/Purple) */}
            <div className="bg-gradient-to-br from-purple-950/70 via-violet-950/50 to-slate-900/80 border border-purple-500/50 rounded-xl p-3 flex flex-col justify-between shadow-md shadow-purple-950/30">
              <div className="flex items-center justify-between gap-1 flex-wrap">
                <span className="text-xs sm:text-sm font-bold text-purple-300 flex items-center gap-1.5">
                  <IndianRupee className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                  <span>कुल एडवांस (Total Advance)</span>
                </span>
                <span className="text-[10px] sm:text-[11px] font-semibold text-purple-200 bg-purple-500/25 px-2 py-0.5 rounded-md border border-purple-500/40">
                  {riders.filter((r) => Number(r.totalAdvance || 0) > 0).length} active
                </span>
              </div>
              <div className="text-lg sm:text-2xl font-black text-purple-200 mt-1">
                {formatINR(totalAdvanceAmount)}
              </div>
              <div className="text-[10px] text-purple-300/80 mt-0.5 font-medium">
                कुल दिया गया एडवांस
              </div>
            </div>
          </div>

          {/* Action Buttons Row */}
          <div className="flex items-center gap-2 flex-wrap">
            {canAccessFestivalGreetings && (
              <button
                id="open-festival-greetings-top-btn"
                type="button"
                onClick={() => setIsFestivalModalOpen(true)}
                className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 hover:text-amber-200 text-xs font-bold rounded-xl active:scale-95 transition"
                title="Send automated festival greetings on WhatsApp"
              >
                <Sparkles className="w-4 h-4 text-amber-400" />
                <span>Festival Greetings</span>
              </button>
            )}

            {/* Prominent Easy Add New Rider Modal Button */}
            <button
              id="open-add-rider-modal-btn"
              type="button"
              onClick={() => {
                if (!isProUser && riders.length >= 3) {
                  onOpenSubscriptionModal?.('free_limit_reached');
                  return;
                }
                setName('');
                setPhone('');
                setVehicleType('Hero Splendor');
                setInitialStatus(true);
                setPhoneError('');
                setIsAddModalOpen(true);
              }}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl shadow-md active:scale-95 transition"
              title="Add a new rider with vehicle & active status"
            >
              <UserPlus className="w-4 h-4" />
              <span>+ Add New Rider</span>
            </button>

            {/* Khatabook Direct Pick from Contacts Button */}
            <button
              type="button"
              onClick={async () => {
                if (!isProUser && riders.length >= 3) {
                  onOpenSubscriptionModal?.('free_limit_reached');
                  return;
                }
                setName('');
                setPhone('');
                setVehicleType('Hero Splendor');
                setInitialStatus(true);
                setPhoneError('');
                setIsAddModalOpen(true);
                await handlePickContact();
              }}
              className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/30 text-xs font-bold rounded-xl active:scale-95 transition"
              title="सीधे फ़ोनबुक से नया राइडर जोड़ें"
            >
              <Phone className="w-4 h-4" />
              <span>फ़ोनबुक से जोड़ें</span>
            </button>

            {/* Dedicated COD हिसाब-किताब Entry Launcher Button */}
            {canViewCodModule && (
              <button
                type="button"
                id="open-cod-portal-top-btn"
                onClick={handleOpenStandalonePortal}
                className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 bg-gradient-to-r from-emerald-600/25 to-teal-600/25 hover:from-emerald-600/35 hover:to-teal-600/35 text-emerald-300 border border-emerald-500/40 text-xs font-bold rounded-xl active:scale-95 transition shadow-sm cursor-pointer"
                title="Open Multi-Company COD हिसाब-किताब & Staff PIN Portal"
              >
                <Table className="w-4 h-4 text-emerald-400" />
                <span>💰 COD हिसाब-किताब</span>
              </button>
            )}
          </div>

          {/* Dedicated COD हिसाब-किताब Sub-App Portal Card */}
          {canViewCodModule && (
            <div 
              id="cod-portal-banner-card"
              className="mt-3 p-3.5 sm:p-4 rounded-2xl bg-gradient-to-r from-emerald-950/70 via-slate-900/95 to-teal-950/70 border border-emerald-500/40 shadow-lg shadow-emerald-950/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in fade-in duration-200"
            >
              <div className="flex items-start sm:items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center justify-center text-xl shadow-md shrink-0">
                  📊
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm sm:text-base font-black text-white flex items-center gap-1.5">
                      <span>COD हिसाब-किताब</span>
                      <span className="text-[10px] uppercase font-extrabold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                        Standalone Sub-App
                      </span>
                    </h3>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold">
                      ✓ Public to Staff
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 mt-0.5">
                    Multi-Company Excel Grid ({codSettings.company1Name} / {codSettings.company2Name}), Daily Cash/UPI Deposits, Balance Tally & 4-Digit Staff PIN Security.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0 flex-wrap sm:flex-nowrap">
                <button
                  type="button"
                  id="open-cod-companion-banner-btn"
                  onClick={handleOpenCompanion}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-emerald-500/30 font-bold text-xs shadow-sm active:scale-95 transition cursor-pointer"
                  title="डिलीवरी बॉय साथी ऐप (COD Entry Companion)"
                >
                  <Bike className="w-4 h-4 text-emerald-400" />
                  <span>📲 साथी ऐप (Rider Entry)</span>
                </button>
                <button
                  type="button"
                  id="open-cod-portal-main-btn"
                  onClick={handleOpenStandalonePortal}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-xs shadow-md shadow-emerald-500/25 active:scale-95 transition cursor-pointer"
                  title="Open Admin Standalone COD Portal"
                >
                  <Table className="w-4 h-4 text-slate-950" />
                  <span>Open Standalone Portal</span>
                </button>
                <button
                  type="button"
                  id="share-cod-rider-url-btn"
                  onClick={async () => {
                    const copied = await copyAppShareLink('https://courier-rider-payout.vercel.app/#cod-entry');
                    if (copied) {
                      setCopiedRiderUrl(true);
                      setTimeout(() => setCopiedRiderUrl(false), 2500);
                    }
                  }}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold text-xs shadow-sm active:scale-95 transition cursor-pointer"
                  title="साथी ऐप लिंक कॉपी करें (WhatsApp Share)"
                >
                  {copiedRiderUrl ? (
                    <>
                      <Check className="w-4 h-4 text-emerald-400" />
                      <span className="text-emerald-400">कॉपी हो गया!</span>
                    </>
                  ) : (
                    <>
                      <Share2 className="w-4 h-4 text-blue-400" />
                      <span>शेयर लिंक</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Freemium Limit Status Banner for Free Tier Users */}
          {!isProUser && (
            <div 
              id="free-tier-rider-limit-banner"
              className="mt-3 p-3 rounded-2xl bg-gradient-to-r from-blue-950/70 via-slate-900 to-indigo-950/70 border border-blue-500/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs shadow-md"
            >
              <div className="flex items-center gap-2.5">
                <span className="p-1.5 rounded-xl bg-blue-500/20 text-blue-300 border border-blue-500/30">
                  <Users className="w-4 h-4" />
                </span>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white">
                      Free Tier: {riders.length}/3 Riders Used
                    </span>
                    <span className="text-[10px] px-2 py-0.2 rounded-md bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30">
                      Local Device Only
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-300 mt-0.5">
                    मुफ़्त में 3 राइडर तक लोकल स्टोरेज में उपयोग करें। असीमित राइडर व क्लाउड सिंक हेतु प्रो हब में अपग्रेड करें।
                  </p>
                </div>
              </div>

              <button
                type="button"
                id="upgrade-pro-hub-free-limit-btn"
                onClick={() => onOpenSubscriptionModal?.('free_limit_reached')}
                className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 text-xs font-black shadow-md transition active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
              >
                <Sparkles className="w-3.5 h-3.5 text-slate-950" />
                <span>Upgrade to Pro Hub</span>
              </button>
            </div>
          )}
          {/* Date Range Payout Summary & Bulk SMS Control Bar */}
          <div className="mt-3 p-3.5 sm:p-4 rounded-2xl bg-gradient-to-r from-sky-950/50 via-slate-900/90 to-blue-950/50 border border-sky-500/35 shadow-md flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1.5 text-xs font-bold text-sky-300">
                <Calendar className="w-4 h-4 text-sky-400 shrink-0" />
                <span>Date Range:</span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={rangeStartDate}
                  onChange={(e) => setRangeStartDate(e.target.value)}
                  className="bg-slate-950 border border-slate-700 rounded-xl px-2.5 py-1 text-xs text-white focus:outline-none focus:border-sky-500"
                />
                <span className="text-slate-400 text-xs font-semibold">to</span>
                <input
                  type="date"
                  value={rangeEndDate}
                  onChange={(e) => setRangeEndDate(e.target.value)}
                  className="bg-slate-950 border border-slate-700 rounded-xl px-2.5 py-1 text-xs text-white focus:outline-none focus:border-sky-500"
                />
              </div>

              {/* Quick Presets */}
              <div className="flex items-center gap-1 flex-wrap">
                <button
                  type="button"
                  onClick={() => handleSetPreset('this_month')}
                  className="px-2 py-0.5 rounded-lg bg-slate-800 hover:bg-slate-750 text-[11px] font-medium text-slate-300 hover:text-white transition"
                >
                  This Month
                </button>
                <button
                  type="button"
                  onClick={() => handleSetPreset('last_7_days')}
                  className="px-2 py-0.5 rounded-lg bg-slate-800 hover:bg-slate-750 text-[11px] font-medium text-slate-300 hover:text-white transition"
                >
                  7 Days
                </button>
                <button
                  type="button"
                  onClick={() => handleSetPreset('last_30_days')}
                  className="px-2 py-0.5 rounded-lg bg-slate-800 hover:bg-slate-750 text-[11px] font-medium text-slate-300 hover:text-white transition"
                >
                  30 Days
                </button>
                <button
                  type="button"
                  onClick={() => handleSetPreset('all_time')}
                  className="px-2 py-0.5 rounded-lg bg-slate-800 hover:bg-slate-750 text-[11px] font-medium text-slate-300 hover:text-white transition"
                >
                  All Time
                </button>
              </div>
            </div>

            {/* Range Metrics & 1-Click Bulk Background SMS Action */}
            <div className="flex items-center gap-2.5 flex-wrap justify-between sm:justify-end border-t lg:border-t-0 pt-2 lg:pt-0 border-slate-800">
              <div className="flex items-center gap-2.5 bg-slate-950/80 px-3 py-1.5 rounded-xl border border-slate-800 text-xs">
                <div>
                  <span className="text-slate-400 text-[11px]">Range Total: </span>
                  <span className="font-bold text-sky-300">{formatINR(totalRangeEarnings)}</span>
                </div>
                <span className="text-slate-600">•</span>
                <span className="font-semibold text-white">{totalRangeParcels} pkts</span>
              </div>

              <button
                id="bulk-date-range-sms-btn"
                type="button"
                onClick={() => setIsBulkSmsModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-500 hover:to-blue-500 text-white text-xs font-bold shadow-md shadow-sky-950/40 active:scale-95 transition"
                title="Send personalized earnings summary SMS to all riders for this date range"
              >
                <MessageCircle className="w-3.5 h-3.5" />
                <span>Send Date Range SMS to All Riders</span>
              </button>
            </div>
          </div>
        </div>

        {/* Toolbar: Unpaid Only Toggle, Status Tabs, Sorting & Search */}
        <div className="mt-5 pt-4 border-t border-slate-700/60 flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setStatusFilter('unpaid')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
                statusFilter === 'unpaid'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                  : 'bg-slate-800 text-slate-400 hover:text-white border border-slate-700'
              }`}
            >
              Unpaid Balances ({ridersWithUnpaid.length})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
                statusFilter === 'all'
                  ? 'bg-blue-600/20 text-blue-300 border border-blue-500/40'
                  : 'bg-slate-800 text-slate-400 hover:text-white border border-slate-700'
              }`}
            >
              All ({riders.length})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('active')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
                statusFilter === 'active'
                  ? 'bg-emerald-600/20 text-emerald-300 border border-emerald-500/40'
                  : 'bg-slate-800 text-slate-400 hover:text-white border border-slate-700'
              }`}
            >
              Active ({activeRidersCount})
            </button>
            {inactiveRidersCount > 0 && (
              <button
                type="button"
                onClick={() => setStatusFilter('inactive')}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
                  statusFilter === 'inactive'
                    ? 'bg-rose-600/20 text-rose-300 border border-rose-500/40'
                    : 'bg-slate-800 text-slate-400 hover:text-white border border-slate-700'
                }`}
              >
                Inactive ({inactiveRidersCount})
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 flex-1 max-w-md">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search rider name or phone..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
              />
            </div>

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="bg-slate-900 border border-slate-700 text-xs text-slate-300 rounded-xl px-2.5 py-1.5 focus:outline-none focus:border-blue-500"
            >
              <option value="order">Custom Order</option>
              <option value="unpaid-desc">Highest Unpaid</option>
              <option value="parcels-desc">Most Parcels</option>
              <option value="name-asc">Name (A-Z)</option>
              <option value="name-desc">Name (Z-A)</option>
              <option value="newest">Newest Added</option>
            </select>
          </div>
        </div>
      </div>

      {/* Riders List / Cards */}
      <div className="space-y-3">
        {riders.length === 0 ? (
          <div className="bg-slate-850/60 border border-dashed border-slate-750 rounded-2xl p-10 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-blue-500/10 text-blue-400 border border-blue-500/20 flex items-center justify-center mx-auto">
              <Bike className="w-6 h-6" />
            </div>
            <h4 className="text-sm font-bold text-white">No delivery riders registered yet</h4>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              Add your delivery riders to track daily parcel dispatches, calculate incentives, and manage salary settlements.
            </p>
            <button
              type="button"
              onClick={() => setIsAddModalOpen(true)}
              className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-md shadow-blue-600/20 active:scale-95 transition"
            >
              <Plus className="w-4 h-4" />
              <span>Add First Rider</span>
            </button>
          </div>
        ) : sortedFilteredRiders.length === 0 ? (
          <div className="bg-slate-850 border border-slate-755 rounded-2xl p-8 text-center text-slate-400 text-sm">
            No riders match the current filter or search query.
          </div>
        ) : (
          sortedFilteredRiders.map((rider, index) => {
            const stats = getRiderStats(rider.id);
            const rangeStats = getRiderRangeStats(rider.id);
            const isExpanded = !!expandedRiderIds[rider.id];
            const hasAdvance = Number(rider.totalAdvance || 0) > 0;

            return (
              <div
                key={rider.id}
                draggable
                onDragStart={(e) => handleDragStart(e, rider.id)}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, rider.id)}
                className={`rounded-2xl p-4 sm:p-5 shadow-md backdrop-blur-sm transition border ${
                  rider.active === false
                    ? 'bg-slate-950/60 border-slate-800/80 opacity-70 ring-1 ring-slate-800'
                    : 'bg-slate-900/80 border-slate-800/90 hover:border-blue-500/40 hover:shadow-blue-950/20'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  {/* Left: Info & Contacts */}
                  <div className="flex items-center gap-3">
                    <div className="cursor-grab text-slate-500 hover:text-slate-300">
                      <GripVertical className="w-5 h-5" />
                    </div>
                    <div className={`w-10 h-10 rounded-xl border flex items-center justify-center font-bold text-sm ${
                      rider.active === false
                        ? 'bg-slate-800/70 text-slate-500 border-slate-700/60'
                        : 'bg-blue-600/15 border-blue-500/20 text-blue-400'
                    }`}>
                      {rider.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`font-bold text-sm ${rider.active === false ? 'text-slate-300' : 'text-white'}`}>{rider.name}</span>
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700 flex items-center gap-1">
                          <Bike className="w-3 h-3 text-slate-400" />
                          {rider.vehicleType || 'Bike'}
                        </span>
                        {/* Subtle Inactive Badge indicator */}
                        {rider.active === false && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800/90 text-slate-400 border border-slate-700 font-semibold flex items-center gap-1">
                            <span>⏸️</span>
                            <span>Inactive (काम पर नहीं)</span>
                          </span>
                        )}
                        {/* Interactive 1-Click Active / Inactive Status Toggle */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleRiderActive(rider);
                          }}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold border transition active:scale-95 cursor-pointer ${
                            rider.active !== false
                              ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/35 hover:bg-emerald-500/25'
                              : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white hover:border-slate-600'
                          }`}
                          title={`Click to switch to ${rider.active !== false ? 'Inactive' : 'Active'}`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${rider.active !== false ? 'bg-slate-500' : 'bg-emerald-400 animate-pulse'}`} />
                          <span>{rider.active !== false ? 'Active' : 'Inactive'}</span>
                        </button>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-slate-400 mt-1">
                        <span>{rider.phone}</span>
                        <div className="flex items-center gap-2 ml-1">
                          <a
                            href={`tel:${rider.phone}`}
                            className="p-1 text-slate-400 hover:text-emerald-400 transition"
                            title="Call Rider"
                          >
                            <Phone className="w-3.5 h-3.5" />
                          </a>
                          <a
                            href={getWhatsAppUrl(rider.phone, `Hi ${rider.name}, Hub admin here.`)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1 text-slate-400 hover:text-emerald-400 transition"
                            title="WhatsApp Rider"
                          >
                            <MessageCircle className="w-3.5 h-3.5" />
                          </a>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Middle: Earnings / Unpaid Badges */}
                  <div className="flex items-center gap-3 sm:gap-4 flex-wrap sm:justify-end">
                    {/* Filtered Date Range Earnings */}
                    <div className="text-right bg-slate-950/70 px-2.5 py-1 rounded-xl border border-sky-500/25">
                      <div className="text-[10px] text-sky-400 font-bold uppercase tracking-wider">Range Earnings</div>
                      <div className="text-sm sm:text-base font-extrabold text-sky-300">
                        {formatINR(rangeStats.earnings)}
                      </div>
                      <div className="text-[10px] text-slate-400 font-medium">
                        {rangeStats.parcels} pkts
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-xs text-slate-400">Unpaid Payout</div>
                      <div className={`text-base font-bold ${stats.unpaidAmount > 0 ? 'text-amber-400' : 'text-slate-400'}`}>
                        {formatINR(stats.unpaidAmount)}
                      </div>
                    </div>

                    {hasAdvance && (
                      <div className="text-right">
                        <div className="text-xs text-rose-400">Advance Balance</div>
                        <div className="text-sm font-bold text-rose-400 font-mono">
                          {formatINR(Number(rider.totalAdvance) || 0)}
                        </div>
                      </div>
                    )}

                    {Number(rider.totalIncentive) > 0 && (
                      <div className="text-right">
                        <div className="text-xs text-emerald-400">Incentive Total</div>
                        <div className="text-sm font-bold text-emerald-400 font-mono">
                          +{formatINR(Number(rider.totalIncentive) || 0)}
                        </div>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {/* Prominent Advance Button [Prompt Requirement] */}
                      <button
                        type="button"
                        onClick={() => setAdvanceModalRider(rider)}
                        className="px-2.5 py-1.5 sm:px-3 sm:py-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 hover:text-amber-200 border border-amber-500/40 hover:border-amber-400 rounded-xl text-xs font-bold flex items-center gap-1 transition active:scale-95 shadow-sm shadow-amber-500/10 cursor-pointer"
                        title="एडवांस जोड़ें / देखें (+ Advance)"
                      >
                        <IndianRupee className="w-3.5 h-3.5 text-amber-400" />
                        <span>+ एडवांस</span>
                      </button>

                      {/* Matching Prominent Incentive Button [Prompt Requirement] */}
                      <button
                        type="button"
                        onClick={() => setIncentiveModalRider(rider)}
                        className="px-2.5 py-1.5 sm:px-3 sm:py-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 hover:text-emerald-200 border border-emerald-500/40 hover:border-emerald-400 rounded-xl text-xs font-bold flex items-center gap-1 transition active:scale-95 shadow-sm shadow-emerald-500/10 cursor-pointer"
                        title="इंसेंटिव जोड़ें / देखें (+ Incentive)"
                      >
                        <Gift className="w-3.5 h-3.5 text-emerald-400" />
                        <span>+ इंसेंटिव</span>
                      </button>

                      {/* Single-Page Khatabook Statement Button */}
                      {onViewLedger && (
                        <button
                          type="button"
                          onClick={() => onViewLedger(rider.id)}
                          className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white border border-slate-700/80 rounded-xl text-xs font-semibold flex items-center gap-1 transition active:scale-95 cursor-pointer"
                          title="खाता लेजर देखें (Khatabook Statement)"
                        >
                          <Receipt className="w-3.5 h-3.5 text-blue-400" />
                          <span className="hidden sm:inline">खाता</span>
                        </button>
                      )}

                      {stats.unpaidAmount > 0 && (
                        <button
                          type="button"
                          onClick={() => handleOpenMarkPaid(rider)}
                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl active:scale-95 transition"
                        >
                          Settle
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => setEditingRider(rider)}
                        className="p-2 text-slate-400 hover:text-blue-400 hover:bg-slate-800 rounded-xl transition"
                        title="Edit Rider"
                      >
                        <Edit className="w-4 h-4" />
                      </button>

                      <button
                        type="button"
                        onClick={() => setDeletingRider(rider)}
                        className="p-2 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-xl transition"
                        title="Delete Rider"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>

                      <button
                        type="button"
                        onClick={() => toggleExpandRider(rider.id)}
                        className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition"
                        title="View Deliveries"
                      >
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Expanded Entries Drawer */}
                {isExpanded && (
                  <div className="mt-4 pt-4 border-t border-slate-700/60 space-y-2">
                    <div className="text-xs font-semibold text-slate-300 mb-2 flex items-center justify-between">
                      <span>Delivery History ({stats.entriesCount} days)</span>
                      <span>Total Delivered: {stats.totalParcels} parcels</span>
                    </div>

                    {stats.allEntries.length === 0 ? (
                      <p className="text-xs text-slate-500 italic py-2">No delivery entries recorded yet.</p>
                    ) : (
                      <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1">
                        {stats.allEntries.map((e) => (
                          <div
                            key={e.id}
                            className="flex items-center justify-between text-xs bg-slate-900/60 p-2.5 rounded-xl border border-slate-800"
                          >
                            <div className="flex items-center gap-3">
                              <span className="text-slate-400">{formatDateDisplay(e.date)}</span>
                              <span className="text-white font-medium">{e.parcels} parcels</span>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="font-semibold text-white">{formatINR(e.totalEarnings)}</span>
                              <button
                                type="button"
                                onClick={() => handleToggleEntry(e.id, rider.name)}
                                className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                  e.status === 'Paid'
                                    ? 'bg-emerald-500/20 text-emerald-400'
                                    : 'bg-amber-500/20 text-amber-400'
                                }`}
                              >
                                {e.status}
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Settle / Mark Paid Modal */}
      {payingRiderData && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-850 border border-slate-750 w-full max-w-md rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white">Settle Payout for {payingRiderData.rider.name}</h3>
              <button
                type="button"
                onClick={() => setPayingRiderData(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-slate-900 p-4 rounded-xl space-y-2 border border-slate-800 text-xs">
              <div className="flex justify-between text-slate-400">
                <span>Unpaid Deliveries</span>
                <span className="text-white font-semibold">{payingRiderData.stats.unpaidCount} entries</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Gross Unpaid Amount</span>
                <span className="text-emerald-400 font-bold text-sm">
                  {formatINR(payingRiderData.stats.unpaidAmount)}
                </span>
              </div>
              {Number(payingRiderData.rider.totalAdvance || 0) > 0 && (
                <div className="flex justify-between text-rose-400 pt-2 border-t border-slate-800">
                  <span>Available Advance</span>
                  <span>{formatINR(Number(payingRiderData.rider.totalAdvance) || 0)}</span>
                </div>
              )}
            </div>

            {Number(payingRiderData.rider.totalAdvance || 0) > 0 && (
              <div className="space-y-1.5">
                <label className="text-xs text-slate-300 font-medium">Deduct Advance from Payout (₹)</label>
                <input
                  type="number"
                  value={advanceDeduction}
                  onChange={(e) => setAdvanceDeduction(e.target.value)}
                  max={Math.min(
                    payingRiderData.stats.unpaidAmount,
                    Number(payingRiderData.rider.totalAdvance) || 0
                  )}
                  min={0}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-sm text-white focus:outline-none focus:border-blue-500"
                />
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setPayingRiderData(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmMarkPaid}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow-lg active:scale-95 transition"
              >
                Confirm Settlement
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Rider Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-850 border border-slate-750 w-full max-w-md rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-blue-400" />
                Add New Rider
              </h3>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs text-slate-300 font-medium">Full Name</label>
                  <button
                    type="button"
                    onClick={handlePickContact}
                    className="text-xs text-emerald-400 hover:underline flex items-center gap-1 font-semibold"
                  >
                    <Phone className="w-3 h-3" />
                    फ़ोनबुक से पिक करें
                  </button>
                </div>
                <input
                  type="text"
                  placeholder="e.g. Ramesh Kumar"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-sm text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs text-slate-300 font-medium">10-Digit Mobile Number</label>
                <input
                  type="tel"
                  placeholder="e.g. 9876543210"
                  value={phone}
                  onChange={(e) => handlePhoneChange(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-sm text-white focus:outline-none focus:border-blue-500"
                />
                {phoneError && <p className="text-xs text-rose-400 mt-1">{phoneError}</p>}
              </div>

              <div className="space-y-1.5">
                <label className="text-xs text-slate-300 font-medium">Vehicle / Bike Model</label>
                <input
                  type="text"
                  placeholder="e.g. Hero Splendor, Bajaj Pulsar"
                  value={vehicleType}
                  onChange={(e) => setVehicleType(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-sm text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              {/* Status Toggle Row */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-900 border border-slate-750">
                <div>
                  <div className="text-xs font-bold text-white flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full ${initialStatus ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
                    <span>Status: {initialStatus ? 'Active (सक्रिय)' : 'Inactive (निष्क्रिय)'}</span>
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    {initialStatus ? 'Active in delivery fleet & festival greetings' : 'Excluded from festival greetings SMS'}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setInitialStatus(!initialStatus)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition active:scale-95 cursor-pointer ${
                    initialStatus
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30'
                      : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white hover:border-slate-600'
                  }`}
                >
                  {initialStatus ? 'Active' : 'Inactive'}
                </button>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl shadow-lg active:scale-95 transition"
                >
                  Save Rider
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Rider Modal */}
      {editingRider && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-850 border border-slate-755 w-full max-w-md rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Edit className="w-5 h-5 text-blue-400" />
                Edit Rider Details
              </h3>
              <button
                type="button"
                onClick={() => setEditingRider(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs text-slate-300 font-medium">Full Name</label>
                <input
                  type="text"
                  value={editingRider.name}
                  onChange={(e) => setEditingRider({ ...editingRider, name: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-sm text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs text-slate-300 font-medium">10-Digit Mobile Number</label>
                <input
                  type="tel"
                  value={editingRider.phone}
                  onChange={(e) => setEditingRider({ ...editingRider, phone: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-sm text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs text-slate-300 font-medium">Vehicle / Bike Model</label>
                <input
                  type="text"
                  value={editingRider.vehicleType || ''}
                  onChange={(e) => setEditingRider({ ...editingRider, vehicleType: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-sm text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-900 border border-slate-750">
                <div>
                  <div className="text-xs font-bold text-white flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full ${editingRider.active !== false ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                    <span>Status: {editingRider.active !== false ? 'Active (सक्रिय)' : 'Inactive (निष्क्रिय)'}</span>
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    {editingRider.active !== false ? 'Receives festival SMS & active duty allocations' : 'Excluded from festival greetings SMS'}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingRider({ ...editingRider, active: editingRider.active === false ? true : false })}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition active:scale-95 cursor-pointer ${
                    editingRider.active !== false
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30'
                      : 'bg-rose-500/20 text-rose-300 border-rose-500/40 hover:bg-rose-500/30'
                  }`}
                >
                  {editingRider.active !== false ? 'Switch to Inactive' : 'Switch to Active'}
                </button>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setEditingRider(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl shadow-lg active:scale-95 transition"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingRider && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-850 border border-slate-755 w-full max-w-sm rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-rose-400">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <h3 className="text-base font-bold text-white">Delete Rider?</h3>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Are you sure you want to delete <span className="font-semibold text-white">{deletingRider.name}</span>? 
              This will remove the rider from the roster.
            </p>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDeletingRider(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  onDeleteRider(deletingRider.id);
                  setDeletingRider(null);
                  setPaidToast(`Deleted rider "${deletingRider.name}".`);
                  setTimeout(() => setPaidToast(null), 3000);
                }}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-xl active:scale-95 transition"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Advance Modal */}
      {advanceModalRider && (
        <RiderAdvanceModal
          rider={riders.find((r) => r.id === advanceModalRider.id) || advanceModalRider}
          onClose={() => setAdvanceModalRider(null)}
          onSaveAdvance={async (updatedRider, newAdv) => {
            if (onSaveAdvance) await onSaveAdvance(updatedRider, newAdv);
            setAdvanceModalRider(updatedRider);
          }}
          onDeleteAdvance={async (updatedRider, advId) => {
            if (onDeleteAdvance) await onDeleteAdvance(updatedRider, advId);
            setAdvanceModalRider(updatedRider);
          }}
          onViewLedger={onViewLedger}
          hubSignature={hubSignature}
          hubName={hubName}
        />
      )}

      {/* Incentive Modal */}
      {incentiveModalRider && (
        <RiderIncentiveModal
          rider={riders.find((r) => r.id === incentiveModalRider.id) || incentiveModalRider}
          onClose={() => setIncentiveModalRider(null)}
          onSaveIncentive={async (rId, incData) => {
            if (onSaveIncentive) await onSaveIncentive(rId, incData);
            const ref = riders.find((r) => r.id === rId);
            if (ref) setIncentiveModalRider(ref);
          }}
          onDeleteIncentive={async (rId, incId) => {
            if (onDeleteIncentive) await onDeleteIncentive(rId, incId);
            const ref = riders.find((r) => r.id === rId);
            if (ref) setIncentiveModalRider(ref);
          }}
          onViewLedger={onViewLedger}
          hubSignature={hubSignature}
          hubName={hubName}
        />
      )}

      {/* Festival Greetings Modal */}
      {isFestivalModalOpen && canAccessFestivalGreetings && (
        <FestivalGreetingsModal
          isOpen={isFestivalModalOpen}
          riders={riders}
          onClose={() => setIsFestivalModalOpen(false)}
          hubSignature={hubSignature}
        />
      )}

      {/* Bulk Date Range Background SMS Modal */}
      {isBulkSmsModalOpen && (
        <BulkDateRangeSmsModal
          isOpen={isBulkSmsModalOpen}
          onClose={() => setIsBulkSmsModalOpen(false)}
          startDate={rangeStartDate}
          endDate={rangeEndDate}
          riders={riders}
          entries={entries}
          hubSignature={hubSignature}
          onSuccess={(msg) => {
            setPaidToast(msg);
            setTimeout(() => setPaidToast(null), 4000);
          }}
        />
      )}

      {/* COD हिसाब-किताब Excel Grid & PIN Sub-Module Modal */}
      {isCodModalOpen && (
        <CodManagementModal
          isOpen={isCodModalOpen}
          onClose={() => setIsCodModalOpen(false)}
          riders={riders}
          userId={userId || 'guest'}
          isSuperAdmin={Boolean(isSuperAdmin)}
          hubName={hubName}
        />
      )}
    </div>
  );
};
