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
  FileSpreadsheet
} from 'lucide-react';
import { Rider, DeliveryEntry, SettlementRecord, RiderAdvanceEntry } from '../types';
import { RiderAdvanceModal } from './RiderAdvanceModal';
import { generateStatementUrl, formatSalarySmsText, dispatchAutomatedSms, getWhatsAppUrl, getNativeSmsUrl } from '../services/smsService';
import { 
  formatINR, 
  isValidIndianPhone, 
  cleanPhoneNumber, 
  formatDateDisplay, 
  getTodayDateString 
} from '../utils/formatters';
import { FestivalBannerCard } from './FestivalBannerCard';
import { FestivalGreetingsModal } from './FestivalGreetingsModal';

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
  onViewLedger?: (riderId: string) => void;
  settlements?: SettlementRecord[];
  canAccessFestivalGreetings?: boolean;
  hubSignature?: string;
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
  onViewLedger,
  canAccessFestivalGreetings = false,
  hubSignature,
}) => {
  // Status Filter State: 'unpaid' (Default) or 'all'
  const [statusFilter, setStatusFilter] = useState<'unpaid' | 'all'>(() => {
    try {
      const saved = localStorage.getItem('cp_riders_status_filter');
      if (saved === 'all' || saved === 'unpaid') return saved;
    } catch {}
    return 'unpaid';
  });

  useEffect(() => {
    try {
      localStorage.setItem('cp_riders_status_filter', statusFilter);
    } catch {}
  }, [statusFilter]);

  // Advance Management Modal state
  const [advanceModalRider, setAdvanceModalRider] = useState<Rider | null>(null);

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
        else if (isAddModalOpen) setIsAddModalOpen(false);
        else if (editingRider) setEditingRider(null);
        else if (deletingRider) setDeletingRider(null);
        else if (payingRiderData) setPayingRiderData(null);
        else if (isFestivalModalOpen) setIsFestivalModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [advanceModalRider, isAddModalOpen, editingRider, deletingRider, payingRiderData, isFestivalModalOpen]);

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

    setPaidToast(
      `Marked ${formatINR(stats.unpaidAmount)} as Paid for ${
        rider.name
      }. Balance updated in Firestore!`
    );
    setTimeout(() => setPaidToast(null), 4500);

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

  // Filter riders by search query AND statusFilter ('unpaid' vs 'all')
  const filteredRiders = riders.filter((r) => {
    const matchesSearch =
      r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.phone.includes(searchQuery);

    if (!matchesSearch) return false;

    if (statusFilter === 'unpaid') {
      const stats = getRiderStats(r.id);
      return stats.unpaidAmount > 0;
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
      <div className="bg-slate-850 border border-slate-755 rounded-2xl p-4 sm:p-6 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 rounded-xl bg-blue-600/20 text-blue-400 border border-blue-500/30">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white tracking-tight">
                Riders & Delivery Fleet
              </h2>
              <p className="text-xs text-slate-400">
                Track unpaid balances, settle payouts, call or WhatsApp riders directly & manage sequence
              </p>
            </div>
          </div>

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

              type="button"
              onClick={async () => {
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
          </div>
        </div>
