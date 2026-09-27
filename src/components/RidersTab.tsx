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
              All Riders ({riders.length})
            </button>
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
        {sortedFilteredRiders.length === 0 ? (
          <div className="bg-slate-850 border border-slate-755 rounded-2xl p-8 text-center text-slate-400 text-sm">
            No riders match the current filter or search query.
          </div>
        ) : (
          sortedFilteredRiders.map((rider, index) => {
            const stats = getRiderStats(rider.id);
            const isExpanded = !!expandedRiderIds[rider.id];
            const hasAdvance = Number(rider.totalAdvance || 0) > 0;

            return (
              <div
                key={rider.id}
                draggable
                onDragStart={(e) => handleDragStart(e, rider.id)}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, rider.id)}
                className="bg-slate-850 border border-slate-755 rounded-2xl p-4 sm:p-5 shadow-lg hover:border-slate-600 transition"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  {/* Left: Info & Contacts */}
                  <div className="flex items-center gap-3">
                    <div className="cursor-grab text-slate-500 hover:text-slate-300">
                      <GripVertical className="w-5 h-5" />
                    </div>
                    <div className="w-10 h-10 rounded-xl bg-blue-600/15 border border-blue-500/20 text-blue-400 flex items-center justify-center font-bold text-sm">
                      {rider.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-white text-sm">{rider.name}</span>
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700 flex items-center gap-1">
                          <Bike className="w-3 h-3 text-slate-400" />
                          {rider.vehicleType || 'Bike'}
                        </span>
                        {!rider.active && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-rose-500/10 text-rose-400 border border-rose-500/20 rounded">
                            Inactive
                          </span>
                        )}
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
                  <div className="flex items-center gap-4 flex-wrap sm:justify-end">
                    <div className="text-right">
                      <div className="text-xs text-slate-400">Unpaid Payout</div>
                      <div className={`text-base font-bold ${stats.unpaidAmount > 0 ? 'text-amber-400' : 'text-slate-400'}`}>
                        {formatINR(stats.unpaidAmount)}
                      </div>
                    </div>

                    {hasAdvance && (
                      <div className="text-right">
                        <div className="text-xs text-rose-400">Advance Balance</div>
                        <div className="text-sm font-bold text-rose-400">
                          {formatINR(Number(rider.totalAdvance) || 0)}
                        </div>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex items-center gap-1.5">
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
                        onClick={() => setAdvanceModalRider(rider)}
                        className="p-2 text-slate-400 hover:text-amber-400 hover:bg-slate-800 rounded-xl transition"
                        title="Manage Advance"
                      >
                        <Coins className="w-4 h-4" />
                      </button>

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

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="rider-active-checkbox"
                  checked={editingRider.active !== false}
                  onChange={(e) => setEditingRider({ ...editingRider, active: e.target.checked })}
                  className="w-4 h-4 rounded text-blue-600 focus:ring-0 bg-slate-900 border-slate-700"
                />
                <label htmlFor="rider-active-checkbox" className="text-xs text-slate-300 font-medium">
                  Active (Working currently)
                </label>
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
          rider={advanceModalRider}
          onClose={() => setAdvanceModalRider(null)}
          onSaveAdvance={onSaveAdvance}
          onDeleteAdvance={onDeleteAdvance}
          hubSignature={hubSignature}
        />
      )}

      {/* Festival Greetings Modal */}
      {isFestivalModalOpen && canAccessFestivalGreetings && (
        <FestivalGreetingsModal
          riders={riders}
          onClose={() => setIsFestivalModalOpen(false)}
          hubSignature={hubSignature}
        />
      )}
    </div>
  );
};
