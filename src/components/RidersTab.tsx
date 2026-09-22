import React, { useState } from 'react';
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
  Sparkles
} from 'lucide-react';
import { Rider, DeliveryEntry } from '../types';
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
  canAccessFestivalGreetings?: boolean;
  hubSignature?: string;
}

export const RidersTab: React.FC<Props> = ({
  riders,
  entries,
  onAddRider,
  onUpdateRider,
  onDeleteRider,
  onReorderRiders,
  onMarkEntriesPaid,
  onToggleEntryStatus,
  canAccessFestivalGreetings = false,
  hubSignature,
}) => {
  // Status Filter State: 'unpaid' (Default) or 'all'
  const [statusFilter, setStatusFilter] = useState<'unpaid' | 'all'>('unpaid');

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
          </div>
        </div>

        {/* Toolbar: Unpaid Only Toggle, Status Tabs, Sorting Controls & Search Bar */}
        <div className="mt-5 pt-4 border-t border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 flex-wrap">
            {/* Dedicated Unpaid Only Toggle */}
            <label
              id="unpaid-only-toggle-label"
              className="inline-flex items-center gap-2.5 cursor-pointer bg-slate-900/90 hover:bg-slate-800 px-3.5 py-2 rounded-xl border border-slate-750 select-none transition shadow-sm"
              title="Toggle to view only riders with pending unpaid dues"
            >
              <input
                type="checkbox"
                id="unpaid-only-checkbox"
                checked={statusFilter === 'unpaid'}
                onChange={(e) => setStatusFilter(e.target.checked ? 'unpaid' : 'all')}
                className="sr-only peer"
              />
              <div className="relative w-8 h-4 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-amber-500"></div>
              <span className="text-xs font-bold text-slate-200">Unpaid Only</span>
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                  statusFilter === 'unpaid'
                    ? 'bg-amber-500 text-slate-950 font-black'
                    : 'bg-amber-500/20 text-amber-300'
                }`}
              >
                {ridersWithUnpaid.length}
              </span>
            </label>

            {/* Status Filter Toggle Tabs */}
            <div className="flex items-center gap-1 bg-slate-900/90 p-1 rounded-xl border border-slate-750">
              <button
                id="filter-unpaid-tab-btn"
                type="button"
                onClick={() => setStatusFilter('unpaid')}
                className={`flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                  statusFilter === 'unpaid'
                    ? 'bg-amber-500 text-slate-950 shadow-sm'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                }`}
              >
                <Clock className="w-3.5 h-3.5" />
                <span>Unpaid</span>
              </button>

              <button
                id="filter-all-history-tab-btn"
                type="button"
                onClick={() => setStatusFilter('all')}
                className={`flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                  statusFilter === 'all'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                }`}
              >
                <History className="w-3.5 h-3.5" />
                <span>All ({riders.length})</span>
              </button>
            </div>

            {/* Sorting Controls */}
            <div className="flex items-center gap-1.5 bg-slate-900/90 px-3 py-2 rounded-xl border border-slate-750">
              <ArrowUpDown className="w-3.5 h-3.5 text-blue-400 shrink-0" />
              <label htmlFor="rider-sort-select" className="text-xs text-slate-400 font-medium hidden sm:inline">
                Sort:
              </label>
              <select
                id="rider-sort-select"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="bg-transparent text-xs font-bold text-slate-200 focus:outline-none cursor-pointer pr-1"
              >
                <option value="order" className="bg-slate-850 text-white">Default Sequence (#1, #2...)</option>
                <option value="unpaid-desc" className="bg-slate-850 text-white">Highest Unpaid (₹ High → Low)</option>
                <option value="name-asc" className="bg-slate-850 text-white">Name (A → Z)</option>
                <option value="name-desc" className="bg-slate-850 text-white">Name (Z → A)</option>
                <option value="parcels-desc" className="bg-slate-850 text-white">Most Parcels</option>
                <option value="newest" className="bg-slate-850 text-white">Recently Joined</option>
              </select>
            </div>
          </div>

          {/* Search Box */}
          <div className="relative flex-1 max-w-xs">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search rider by name or phone..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-blue-500"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-xs"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Status Summary Banner */}
        <div className="mt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-slate-400 bg-slate-900/40 p-2.5 rounded-xl border border-slate-800/80">
          <div className="flex items-center gap-2">
            <span
              className={`w-2 h-2 rounded-full ${
                statusFilter === 'unpaid' ? 'bg-amber-400 animate-pulse' : 'bg-blue-400'
              }`}
            />
            {statusFilter === 'unpaid' ? (
              <span>
                Showing <strong>{sortedFilteredRiders.length}</strong> rider{sortedFilteredRiders.length === 1 ? '' : 's'} with pending unpaid dues • Total Unpaid: <strong className="text-amber-400">{formatINR(totalUnpaidAmount)}</strong> ({totalUnpaidParcels} pkts)
              </span>
            ) : (
              <span>
                Showing <strong>all {sortedFilteredRiders.length}</strong> riders with lifetime delivery records & past settlements.
              </span>
            )}
          </div>

          <div className="text-[11px] text-slate-500">
            {sortBy === 'order' && statusFilter === 'all'
              ? 'Drag or use ▲ / ▼ to reorder sequence'
              : `Sorted by: ${
                  sortBy === 'unpaid-desc'
                    ? 'Highest Unpaid'
                    : sortBy === 'name-asc'
                    ? 'Name (A-Z)'
                    : sortBy === 'name-desc'
                    ? 'Name (Z-A)'
                    : sortBy === 'parcels-desc'
                    ? 'Most Parcels'
                    : sortBy === 'newest'
                    ? 'Recently Joined'
                    : 'Default Sequence'
                }`}
          </div>
        </div>
      </div>

      {/* Rider List Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {sortedFilteredRiders.map((rider) => {
          const stats = getRiderStats(rider.id);
          const masterIndex = riders.findIndex((r) => r.id === rider.id);
          const isFirst = masterIndex === 0;
          const isLast = masterIndex === riders.length - 1;
          const isExpanded = !!expandedRiderIds[rider.id];
          const cleanPhone = cleanPhoneNumber(rider.phone);

          const whatsappMessage = stats.unpaidAmount > 0
            ? `Hello ${rider.name},\n\nHere is your Courier Delivery Payout Summary:\n• Unpaid Balance: ₹${stats.unpaidAmount}\n• Delivered Parcels: ${stats.unpaidParcels} pkts\n• Pending Delivery Days: ${stats.unpaidCount}\n\nPlease check and let us know if you have any questions.`
            : `Hello ${rider.name},\n\nAll your courier delivery payout accounts are fully settled. Thank you for your hard work!`;

          return (
            <div
              key={rider.id}
              draggable={!searchQuery && statusFilter === 'all' && sortBy === 'order'}
              onDragStart={(e) => handleDragStart(e, rider.id)}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, rider.id)}
              className={`bg-slate-850 border rounded-2xl p-4 sm:p-5 shadow-lg flex flex-col justify-between transition ${
                stats.unpaidAmount > 0
                  ? 'border-amber-500/40 hover:border-amber-500/60'
                  : 'border-slate-750 hover:border-slate-600'
              } ${
                draggedRiderId === rider.id
                  ? 'opacity-50 border-dashed border-blue-500'
                  : ''
              }`}
            >
              <div>
                {/* Rider Top Info & Sequence Controls */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3">
                    {/* Sequence Badge */}
                    <div className="flex flex-col items-center justify-center gap-0.5 shrink-0">
                      <span className="px-2 py-0.5 rounded-lg bg-blue-500/20 text-blue-300 border border-blue-500/30 text-[11px] font-bold font-mono">
                        #{masterIndex + 1}
                      </span>
                      {statusFilter === 'all' && sortBy === 'order' && (
                        <GripVertical className="w-3.5 h-3.5 text-slate-600 cursor-grab active:cursor-grabbing hidden sm:block mt-0.5" />
                      )}
                    </div>

                    <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white font-black text-sm flex items-center justify-center shadow-md shrink-0">
                      {rider.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-bold text-sm text-white">{rider.name}</h4>
                        {stats.unpaidAmount > 0 ? (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40">
                            Unpaid Dues
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                            Settled
                          </span>
                        )}
                        {!rider.active && (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-750 text-slate-400">
                            Inactive
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-slate-400 mt-1 flex-wrap">
                        <div className="flex items-center gap-1 font-medium">
                          <Phone className="w-3 h-3 text-slate-500" />
                          <span>+91 {cleanPhone}</span>
                        </div>

                        {/* Top Direct Call Link */}
                        <a
                          id={`call-rider-top-${rider.id}`}
                          href={`tel:${cleanPhone}`}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-blue-500/15 hover:bg-blue-500/25 border border-blue-500/30 text-blue-300 hover:text-white text-[11px] font-bold shadow-sm transition active:scale-95"
                          title={`Direct call ${rider.name} on phone`}
                        >
                          <Phone className="w-3 h-3" />
                          <span>Call</span>
                        </a>

                        {/* Top Direct WhatsApp Link */}
                        <a
                          id={`whatsapp-rider-top-${rider.id}`}
                          href={`https://wa.me/91${cleanPhone}?text=${encodeURIComponent(whatsappMessage)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 hover:text-white text-[11px] font-bold shadow-sm transition active:scale-95"
                          title={`Send WhatsApp message to ${rider.name}`}
                        >
                          <MessageCircle className="w-3 h-3" />
                          <span>WhatsApp</span>
                        </a>
                      </div>
                    </div>
                  </div>

                  {/* Move Up / Move Down Sequence Controls */}
                  <div className="flex items-center gap-1 bg-slate-900/90 p-1 rounded-xl border border-slate-750 shrink-0">
                    <button
                      id={`move-up-rider-${rider.id}`}
                      onClick={() => handleMoveRider(rider.id, 'up')}
                      disabled={isFirst}
                      className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 disabled:opacity-25 disabled:hover:bg-transparent disabled:cursor-not-allowed rounded-lg transition"
                      title={isFirst ? 'Already at top' : 'Move Up in sequence'}
                      aria-label="Move Up"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <span className="text-[10px] text-slate-500 font-mono font-bold px-0.5">
                      #{masterIndex + 1}
                    </span>
                    <button
                      id={`move-down-rider-${rider.id}`}
                      onClick={() => handleMoveRider(rider.id, 'down')}
                      disabled={isLast}
                      className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 disabled:opacity-25 disabled:hover:bg-transparent disabled:cursor-not-allowed rounded-lg transition"
                      title={isLast ? 'Already at bottom' : 'Move Down in sequence'}
                      aria-label="Move Down"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="mt-3 flex items-center gap-2 text-[11px] text-slate-400">
                  <Bike className="w-3.5 h-3.5 text-blue-400" />
                  <span>{rider.vehicleType || 'Hero Splendor'}</span>
                  <span className="text-slate-600">•</span>
                  <span>Joined: {rider.joinedDate || '2026'}</span>
                </div>

                {/* Status-Adaptive Earnings Metrics */}
                {statusFilter === 'unpaid' ? (
                  /* UNPAID DEFAULT VIEW: Exclusively highlights unpaid earnings */
                  <div className="mt-3.5 p-3.5 rounded-xl bg-gradient-to-br from-slate-900 via-slate-900 to-amber-950/20 border border-amber-500/30">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-1.5 text-[11px] uppercase font-bold tracking-wider text-amber-400">
                          <Clock className="w-3.5 h-3.5" />
                          <span>Active Unpaid Balance</span>
                        </div>
                        <div className="text-2xl font-black text-amber-300 mt-1">
                          {formatINR(stats.unpaidAmount)}
                        </div>
                      </div>

                      {/* Primary Mark As Paid Action Button */}
                      <button
                        id={`mark-paid-rider-${rider.id}-btn`}
                        onClick={() => handleOpenMarkPaid(rider)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-emerald-600/25 active:scale-95 transition"
                        title="Mark all pending deliveries as Paid and remove from unpaid view"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Mark as Paid</span>
                      </button>
                    </div>

                    <div className="mt-3 pt-2.5 border-t border-slate-800/80 grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-slate-400 text-[11px]">Unpaid Parcels:</span>
                        <p className="font-bold text-slate-200 mt-0.5">
                          {stats.unpaidParcels} delivered packets
                        </p>
                      </div>
                      <div>
                        <span className="text-slate-400 text-[11px]">Pending Dates:</span>
                        <p className="font-bold text-slate-200 mt-0.5">
                          {stats.unpaidCount} daily delivery log{stats.unpaidCount === 1 ? '' : 's'}
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* ALL HISTORY VIEW: Comprehensive lifetime overview */
                  <div className="mt-3.5 space-y-2.5">
                    <div className="grid grid-cols-3 gap-2 p-2.5 rounded-xl bg-slate-900/70 border border-slate-800 text-center">
                      <div>
                        <div className="text-[10px] text-slate-400 uppercase font-semibold">
                          Total Parcels
                        </div>
                        <div className="text-xs font-black text-white mt-0.5">
                          {stats.totalParcels} pkts
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-slate-400 uppercase font-semibold">
                          Total Earned
                        </div>
                        <div className="text-xs font-black text-blue-400 mt-0.5">
                          {formatINR(stats.totalEarned)}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-slate-400 uppercase font-semibold">
                          Paid Settled
                        </div>
                        <div className="text-xs font-black text-emerald-400 mt-0.5">
                          {formatINR(stats.paidAmount)}
                        </div>
                      </div>
                    </div>

                    {stats.unpaidAmount > 0 ? (
                      <div className="flex items-center justify-between p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30">
                        <div>
                          <span className="text-[11px] text-amber-300 font-semibold">
                            Pending Unpaid:
                          </span>
                          <span className="ml-1.5 text-xs font-black text-amber-400">
                            {formatINR(stats.unpaidAmount)}
                          </span>
                          <span className="text-[10px] text-slate-400 ml-1">
                            ({stats.unpaidParcels} pkts)
                          </span>
                        </div>
                        <button
                          id={`mark-paid-rider-allview-${rider.id}-btn`}
                          onClick={() => handleOpenMarkPaid(rider)}
                          className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] rounded-lg shadow transition"
                        >
                          Mark as Paid
                        </button>
                      </div>
                    ) : (
                      <div className="p-2 text-center rounded-xl bg-slate-900/40 border border-slate-800 text-[11px] text-emerald-400 font-medium">
                        ✓ All balances settled in full
                      </div>
                    )}
                  </div>
                )}

                {/* Expand / View Delivery Dates Breakdown */}
                <div className="mt-3">
                  <button
                    type="button"
                    onClick={() => toggleExpandRider(rider.id)}
                    className="w-full flex items-center justify-between px-3 py-1.5 text-xs font-semibold text-slate-300 hover:text-white bg-slate-900/60 hover:bg-slate-900 border border-slate-800 rounded-xl transition"
                  >
                    <span className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-blue-400" />
                      <span>
                        {statusFilter === 'unpaid'
                          ? `View ${stats.unpaidCount} Unpaid Date Breakdown`
                          : `View All ${stats.entriesCount} Delivery Entries`}
                      </span>
                    </span>
                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4 text-slate-400" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-slate-400" />
                    )}
                  </button>

                  {/* Expanded Entries Drawer */}
                  {isExpanded && (
                    <div className="mt-2 space-y-1.5 max-h-56 overflow-y-auto pr-1">
                      {(statusFilter === 'unpaid'
                        ? stats.unpaidEntries
                        : stats.allEntries
                      ).length === 0 ? (
                        <p className="text-[11px] text-slate-500 text-center py-2">
                          No records found.
                        </p>
                      ) : (
                        (statusFilter === 'unpaid'
                          ? stats.unpaidEntries
                          : stats.allEntries
                        ).map((entry) => (
                          <div
                            key={entry.id}
                            className="flex items-center justify-between p-2 rounded-xl bg-slate-900/90 border border-slate-800 text-xs"
                          >
                            <div>
                              <span className="font-semibold text-white">
                                {formatDateDisplay(entry.date)}
                              </span>
                              <div className="text-[11px] text-slate-400 flex items-center gap-1.5 mt-0.5">
                                <span>{entry.parcels} pkts</span>
                                <span>•</span>
                                <span className="text-emerald-400 font-semibold">
                                  {formatINR(entry.totalEarnings)}
                                </span>
                                {entry.hasIncentive && (
                                  <span className="text-[9px] px-1 rounded bg-amber-500/20 text-amber-300">
                                    +₹2
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              {entry.status === 'Paid' ? (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                  Paid
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleToggleEntry(entry.id, rider.name)
                                  }
                                  className="inline-flex items-center gap-1 px-2 py-1 bg-amber-500/20 hover:bg-emerald-600 text-amber-300 hover:text-white border border-amber-500/40 rounded-lg text-[10px] font-bold transition"
                                  title="Mark this single date as Paid in Firestore"
                                >
                                  <Check className="w-3 h-3" />
                                  <span>Pay Day</span>
                                </button>
                              )}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Rider Footer Actions */}
              <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <a
                    id={`call-rider-footer-${rider.id}`}
                    href={`tel:${cleanPhone}`}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-blue-300 bg-blue-500/15 hover:bg-blue-500/25 border border-blue-500/30 rounded-xl transition active:scale-95 shadow-sm"
                    title={`Call ${rider.name} directly on phone`}
                  >
                    <Phone className="w-3.5 h-3.5" />
                    <span>Call</span>
                  </a>

                  <a
                    id={`whatsapp-rider-footer-${rider.id}`}
                    href={`https://wa.me/91${cleanPhone}?text=${encodeURIComponent(whatsappMessage)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-emerald-300 bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 rounded-xl transition active:scale-95 shadow-sm"
                    title={`Send WhatsApp message to ${rider.name}`}
                  >
                    <MessageCircle className="w-3.5 h-3.5" />
                    <span>WhatsApp</span>
                  </a>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setEditingRider(rider)}
                    className="p-2 text-slate-400 hover:text-blue-400 hover:bg-slate-800 rounded-xl transition"
                    title="Edit Delivery Boy Details"
                  >
                    <Edit className="w-4 h-4" />
                  </button>

                  {/* Delete Button */}
                  <button
                    id={`delete-rider-${rider.id}-btn`}
                    onClick={() => setDeletingRider(rider)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-red-400 hover:text-red-300 hover:bg-red-500/10 border border-red-500/20 rounded-xl transition active:scale-95"
                    title="Delete Delivery Boy"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete</span>
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Add New Rider Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-lg rounded-2xl bg-slate-900 border border-blue-500/40 p-6 shadow-2xl text-white space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 rounded-xl bg-blue-600/20 text-blue-400 border border-blue-500/30">
                  <UserPlus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-white">Add New Rider</h3>
                  <p className="text-xs text-slate-400">
                    Register courier rider details, vehicle, and initial status
                  </p>
                </div>
              </div>
              <button
                type="button"
                id="close-add-rider-modal-btn"
                onClick={() => setIsAddModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddSubmit} className="space-y-4 pt-1">
              {/* Full Name */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Full Name <span className="text-red-400">*</span>
                </label>
                <input
                  id="modal-rider-name"
                  type="text"
                  placeholder="e.g. Rahul Sharma"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  required
                  autoFocus
                />
              </div>

              {/* Phone Number */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Phone Number <span className="text-red-400">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                    +91
                  </span>
                  <input
                    id="modal-rider-phone"
                    type="tel"
                    maxLength={10}
                    placeholder="9876543210"
                    value={phone}
                    onChange={(e) => handlePhoneChange(e.target.value)}
                    className="w-full pl-12 pr-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-sm font-semibold text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    required
                  />
                </div>
                {phoneError ? (
                  <p className="text-[11px] text-red-400 mt-1">{phoneError}</p>
                ) : (
                  <p className="text-[11px] text-slate-500 mt-1">
                    Enter standard 10-digit Indian mobile number for calls & WhatsApp alerts
                  </p>
                )}
              </div>

              {/* Vehicle (e.g. Hero Splendor) */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-slate-300">
                    Vehicle (e.g. Hero Splendor) <span className="text-red-400">*</span>
                  </label>
                  <span className="text-[11px] text-slate-500">Quick select below</span>
                </div>
                <input
                  id="modal-rider-vehicle"
                  type="text"
                  placeholder="e.g. Hero Splendor"
                  value={vehicleType}
                  onChange={(e) => setVehicleType(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  required
                />
                {/* Vehicle Quick Chips */}
                <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                  {[
                    'Hero Splendor',
                    'Honda Activa',
                    'Bajaj Pulsar',
                    'Ather EV',
                    'TVS Apache',
                    'Bicycle',
                  ].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setVehicleType(preset)}
                      className={`text-[11px] px-2.5 py-1 rounded-lg border font-medium transition ${
                        vehicleType === preset
                          ? 'bg-blue-600 text-white border-blue-500 shadow-sm'
                          : 'bg-slate-800 text-slate-300 border-slate-700 hover:border-slate-600'
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>

              {/* Initial Status */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Initial Status
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    id="modal-rider-status-active"
                    onClick={() => setInitialStatus(true)}
                    className={`flex items-center justify-center gap-2 p-2.5 rounded-xl border text-xs font-bold transition ${
                      initialStatus
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500 shadow-sm'
                        : 'bg-slate-800/80 text-slate-400 border-slate-700 hover:text-white'
                    }`}
                  >
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>Active (Ready for Orders)</span>
                  </button>

                  <button
                    type="button"
                    id="modal-rider-status-inactive"
                    onClick={() => setInitialStatus(false)}
                    className={`flex items-center justify-center gap-2 p-2.5 rounded-xl border text-xs font-bold transition ${
                      !initialStatus
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500 shadow-sm'
                        : 'bg-slate-800/80 text-slate-400 border-slate-700 hover:text-white'
                    }`}
                  >
                    <Clock className="w-4 h-4 text-amber-400" />
                    <span>Inactive (On Leave / Standby)</span>
                  </button>
                </div>
              </div>

              <div className="pt-3 flex items-center justify-end gap-3 border-t border-slate-800">
                <button
                  type="button"
                  id="cancel-add-rider-modal-btn"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-750 text-xs font-semibold text-slate-300 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  id="submit-modal-rider-btn"
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-lg shadow-blue-600/25 active:scale-95 transition"
                >
                  <Check className="w-4 h-4" />
                  <span>Save & Add Rider</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Empty State when no riders match filter */}
      {filteredRiders.length === 0 && (
        <div className="text-center py-12 bg-slate-850 rounded-2xl border border-slate-750 p-6 shadow-xl">
          {statusFilter === 'unpaid' ? (
            <div>
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center mx-auto mb-3">
                <CheckCircle2 className="w-7 h-7" />
              </div>
              <h3 className="text-base font-bold text-white">
                All Delivery Boys Settled!
              </h3>
              <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                There are currently zero pending unpaid balances. All delivery boy payments have been cleared.
              </p>
              <button
                onClick={() => setStatusFilter('all')}
                className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-750 text-blue-400 border border-slate-700 text-xs font-bold rounded-xl transition"
              >
                <History className="w-3.5 h-3.5" />
                <span>View Paid / All History</span>
              </button>
            </div>
          ) : (
            <div>
              <AlertCircle className="w-8 h-8 text-slate-500 mx-auto mb-2" />
              <p className="text-sm font-semibold text-slate-300">
                No matching delivery boys found
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Try searching for a different name or add a new delivery boy.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Mark As Paid Confirmation Modal */}
      {payingRiderData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-emerald-500/40 p-6 shadow-2xl text-white space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-white">
                    Settle &amp; Mark as Paid
                  </h3>
                  <p className="text-xs text-slate-400">
                    Syncs status to Cloud Firestore
                  </p>
                </div>
              </div>
              <button
                onClick={() => setPayingRiderData(null)}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Rider & Amount Details */}
            <div className="p-4 rounded-xl bg-slate-850 border border-slate-750 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-sm text-white">
                    {payingRiderData.rider.name}
                  </h4>
                  <p className="text-xs text-slate-400">
                    +91 {payingRiderData.rider.phone}
                  </p>
                </div>
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30">
                  {payingRiderData.stats.unpaidCount} Pending Days
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800 text-xs">
                <div>
                  <span className="text-slate-400 text-[11px]">Unpaid Parcels:</span>
                  <p className="font-bold text-white mt-0.5">
                    {payingRiderData.stats.unpaidParcels} pkts
                  </p>
                </div>
                <div>
                  <span className="text-slate-400 text-[11px]">Gross Earnings:</span>
                  <p className="font-bold text-emerald-400 mt-0.5 text-sm">
                    {formatINR(payingRiderData.stats.unpaidAmount)}
                  </p>
                </div>
              </div>

              {/* Advance payment deduction option */}
              <div className="pt-2 border-t border-slate-800">
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                  Deduct Advance Cash Paid (₹) <span className="text-slate-500">(Optional)</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                    ₹
                  </span>
                  <input
                    type="number"
                    min={0}
                    max={payingRiderData.stats.unpaidAmount}
                    value={advanceDeduction}
                    onChange={(e) =>
                      setAdvanceDeduction(
                        e.target.value === '' ? '' : parseFloat(e.target.value) || 0
                      )
                    }
                    className="w-full pl-7 pr-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs font-bold text-white focus:outline-none focus:border-blue-500"
                    placeholder="0"
                  />
                </div>
              </div>

              {/* Net Payout preview */}
              <div className="flex items-center justify-between pt-2 border-t border-slate-800 text-xs font-bold">
                <span className="text-slate-300">Net Amount to Handover:</span>
                <span className="text-base text-emerald-400">
                  {formatINR(
                    Math.max(
                      0,
                      payingRiderData.stats.unpaidAmount -
                        (typeof advanceDeduction === 'number'
                          ? advanceDeduction
                          : parseFloat(advanceDeduction) || 0)
                    )
                  )}
                </span>
              </div>
            </div>

            <p className="text-[11px] text-slate-400 leading-relaxed">
              Once marked as Paid, this delivery boy will immediately be removed from the active <strong>Unpaid</strong> queue and saved to Firestore. You can review all records anytime in <strong>Paid / All History</strong>.
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setPayingRiderData(null)}
                className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-750 text-xs font-semibold text-slate-300 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                id="confirm-mark-paid-btn"
                onClick={handleConfirmMarkPaid}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-lg shadow-emerald-600/30 active:scale-95 transition"
              >
                <Check className="w-4 h-4" />
                <span>Confirm &amp; Mark as Paid</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Rider Modal */}
      {editingRider && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-sm rounded-2xl bg-slate-900 border border-slate-700 p-5 shadow-2xl text-white">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="font-bold text-sm">Edit Delivery Boy</h3>
              <button
                onClick={() => setEditingRider(null)}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="mt-4 space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Delivery Boy Name
                </label>
                <input
                  type="text"
                  value={editingRider.name}
                  onChange={(e) =>
                    setEditingRider({ ...editingRider, name: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-sm text-white focus:outline-none focus:border-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  10-Digit WhatsApp Number
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                    +91
                  </span>
                  <input
                    type="tel"
                    maxLength={10}
                    value={editingRider.phone}
                    onChange={(e) =>
                      setEditingRider({ ...editingRider, phone: e.target.value })
                    }
                    className="w-full pl-11 pr-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-sm font-semibold text-white focus:outline-none focus:border-blue-500"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Vehicle Type
                </label>
                <input
                  type="text"
                  value={editingRider.vehicleType || ''}
                  onChange={(e) =>
                    setEditingRider({ ...editingRider, vehicleType: e.target.value })
                  }
                  placeholder="e.g. Honda Activa"
                  className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setEditingRider(null)}
                  className="flex-1 py-2 rounded-xl bg-slate-800 text-xs font-semibold text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white shadow"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Popup Modal */}
      {deletingRider && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-red-500/40 p-6 shadow-2xl text-white space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-2xl bg-red-500/15 text-red-400 border border-red-500/30 shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-base text-white">Delete Delivery Boy</h3>
                <p className="text-xs text-slate-400">Confirmation required</p>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-850 border border-slate-750 space-y-2">
              <p className="text-sm font-semibold text-white">
                Are you sure you want to delete this delivery boy?
              </p>
              <div className="flex items-center gap-2 text-xs text-slate-300 bg-slate-900/80 p-2.5 rounded-lg border border-slate-800">
                <div className="w-7 h-7 rounded-lg bg-blue-600 text-white font-bold text-xs flex items-center justify-center shrink-0">
                  {deletingRider.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="font-bold text-white">{deletingRider.name}</div>
                  <div className="text-[11px] text-slate-400">
                    +91 {deletingRider.phone} • {deletingRider.vehicleType || 'Bike'}
                  </div>
                </div>
              </div>
              <p className="text-[11px] text-slate-400 pt-1 leading-relaxed">
                Once deleted, they will be immediately removed from the screen and permanently deleted from Cloud Firestore so they never appear again unless you manually add them back.
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                id="cancel-delete-rider-btn"
                onClick={() => setDeletingRider(null)}
                className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-750 text-xs font-semibold text-slate-300 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                id="confirm-delete-rider-btn"
                onClick={() => {
                  const idToDelete = deletingRider.id;
                  setDeletingRider(null);
                  onDeleteRider(idToDelete);
                }}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold shadow-lg shadow-red-600/20 active:scale-95 transition"
              >
                <Trash2 className="w-4 h-4" />
                <span>Yes, Delete Delivery Boy</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Festival Greetings Broadcast Modal */}
      {canAccessFestivalGreetings && isFestivalModalOpen && (
        <FestivalGreetingsModal
          isOpen={isFestivalModalOpen}
          onClose={() => setIsFestivalModalOpen(false)}
          riders={riders}
          hubSignature={hubSignature}
        />
      )}
    </div>
  );
};
