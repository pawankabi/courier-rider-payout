import React, { useState } from 'react';
import { 
  X, 
  Phone, 
  MessageCircle, 
  Download, 
  FileText, 
  FileSpreadsheet, 
  Edit3, 
  Trash2, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  Calendar, 
  Bike, 
  Sparkles, 
  Package, 
  CreditCard, 
  Save, 
  RefreshCw,
  Check,
  TrendingUp,
  IndianRupee
} from 'lucide-react';
import { Rider, DeliveryEntry, SettlementRecord, AppUser, RiderAdvanceEntry } from '../types';
import { formatINR, formatDateDisplay, formatPhoneNumber, getCleanPhoneDigits } from '../utils/formatters';
import { generatePayoutPDF } from '../utils/pdfGenerator';
import { exportSingleRiderToCSV } from '../utils/csvExport';
import { saveRiderToFirestore, deleteRiderFromFirestore, saveDeliveryToFirestore, syncPublicRiderStatement } from '../services/firestoreSync';
import { RiderAdvanceModal } from './RiderAdvanceModal';

interface SingleRiderDetailModalProps {
  rider: Rider;
  user: AppUser;
  entries: DeliveryEntry[];
  settlements?: SettlementRecord[];
  onClose: () => void;
  onRiderUpdated: (updatedRider: Rider) => void;
  onRiderDeleted: (riderId: string) => void;
  onEntryUpdated?: (updatedEntry: DeliveryEntry) => void;
  onSaveAdvance?: (updatedRider: Rider, newAdvance: RiderAdvanceEntry) => Promise<void>;
  onDeleteAdvance?: (updatedRider: Rider, advanceId: string) => Promise<void>;
  onViewLedger?: (riderId: string) => void;
}

export const SingleRiderDetailModal: React.FC<SingleRiderDetailModalProps> = ({
  rider,
  user,
  entries,
  settlements = [],
  onClose,
  onRiderUpdated,
  onRiderDeleted,
  onEntryUpdated,
  onSaveAdvance,
  onDeleteAdvance,
  onViewLedger,
}) => {
  // Filter deliveries for this specific rider
  const riderEntries = entries
    .filter((e) => e.riderId === rider.id)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // Edit Mode state
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(rider.name);
  const [editPhone, setEditPhone] = useState(rider.phone);
  const [editVehicle, setEditVehicle] = useState(rider.vehicleType || 'Hero Splendor (Bike)');
  const [editBaseRate, setEditBaseRate] = useState(rider.baseRate ?? 13);
  const [editIncentiveRate, setEditIncentiveRate] = useState(rider.incentiveRate ?? 2);
  const [editActive, setEditActive] = useState(rider.active !== false);
  const [isSaving, setIsSaving] = useState(false);

  // Deletion confirm
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Feedback Toast
  const [toast, setToast] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Advance Management Modal
  const [isAdvanceModalOpen, setIsAdvanceModalOpen] = useState(false);

  // Smooth Escape key handler to return smoothly without freeze
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isAdvanceModalOpen) {
          setIsAdvanceModalOpen(false);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, isAdvanceModalOpen]);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToast({ text, type });
    setTimeout(() => setToast(null), 3500);
  };

  // Metrics
  const totalParcels = riderEntries.reduce((sum, e) => sum + (e.parcels || 0), 0);
  const totalBase = riderEntries.reduce((sum, e) => sum + (e.baseAmount || 0), 0);
  const totalIncentives = riderEntries.reduce((sum, e) => sum + (e.incentiveAmount || 0), 0);
  const totalGross = riderEntries.reduce((sum, e) => sum + (e.totalEarnings || 0), 0);
  const totalPaid = riderEntries
    .filter((e) => e.status === 'Paid')
    .reduce((sum, e) => sum + (e.totalEarnings || 0), 0);
  const totalUnpaid = riderEntries
    .filter((e) => e.status === 'Unpaid')
    .reduce((sum, e) => sum + (e.totalEarnings || 0), 0);
  const unpaidCount = riderEntries.filter((e) => e.status === 'Unpaid').length;

  // Phone numbers
  const cleanPhone = getCleanPhoneDigits(rider.phone);
  const hasPhone = Boolean(cleanPhone && cleanPhone.length >= 10);
  const waUrl = hasPhone
    ? `https://wa.me/91${cleanPhone.slice(-10)}?text=${encodeURIComponent(
        `Namaste ${rider.name}, this is regarding your courier payout records with ${user.displayName || user.name || 'our Hub'}. You have ${totalParcels} delivered packets on file.`
      )}`
    : '#';

  // Save Rider Master Edit
  const handleSaveRiderEdit = async () => {
    if (!editName.trim()) {
      showToast('Rider name is required.', 'error');
      return;
    }
    setIsSaving(true);
    try {
      const updated: Rider = {
        ...rider,
        name: editName.trim(),
        phone: editPhone.trim(),
        vehicleType: editVehicle.trim(),
        baseRate: Number(editBaseRate) || 13,
        incentiveRate: Number(editIncentiveRate) || 2,
        active: editActive,
      };

      await saveRiderToFirestore(user.uid, updated);
      onRiderUpdated(updated);
      setIsEditing(false);
      showToast('Rider details saved directly to cloud workspace!', 'success');
    } catch (err) {
      console.error('Failed to save rider master edit:', err);
      showToast('Failed to update rider in Firestore.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // Delete Rider
  const handleDeleteRider = async () => {
    setIsDeleting(true);
    try {
      await deleteRiderFromFirestore(user.uid, rider.id);
      onRiderDeleted(rider.id);
      showToast(`Rider ${rider.name} deleted from workspace.`, 'success');
      onClose();
    } catch (err) {
      console.error('Failed to delete rider:', err);
      showToast('Failed to delete rider from Firestore.', 'error');
      setIsDeleting(false);
    }
  };

  // Toggle Entry Status (Paid / Unpaid)
  const handleToggleEntry = async (entry: DeliveryEntry) => {
    const nextStatus = entry.status === 'Paid' ? 'Unpaid' : 'Paid';
    const updated: DeliveryEntry = {
      ...entry,
      status: nextStatus,
      paidAt: nextStatus === 'Paid' ? new Date().toISOString() : undefined,
    };
    try {
      await saveDeliveryToFirestore(user.uid, updated);
      if (onEntryUpdated) {
        onEntryUpdated(updated);
      }
      showToast(`Delivery on ${entry.date} marked as ${nextStatus}.`, 'success');
    } catch (err) {
      console.error('Error toggling entry:', err);
      showToast('Failed to update entry status.', 'error');
    }
  };

  // Download Single Rider PDF
  const handleDownloadPDF = () => {
    if (riderEntries.length === 0) {
      showToast('No delivery entries found to generate PDF.', 'error');
      return;
    }
    const dates = riderEntries.map((e) => e.date).sort();
    const startDate = dates[0] || new Date().toISOString().split('T')[0];
    const endDate = dates[dates.length - 1] || startDate;

    generatePayoutPDF({
      title: `Rider Payout Statement - ${rider.name}`,
      riderFilterName: rider.name,
      startDate,
      endDate,
      entries: riderEntries,
      riders: [rider],
    });
    showToast(`PDF Statement generated for ${rider.name}!`, 'success');
  };

  // Download Single Rider CSV/Excel
  const handleDownloadCSV = () => {
    exportSingleRiderToCSV({
      userName: user.displayName || user.name || user.email,
      userEmail: user.email,
      rider,
      entries: riderEntries,
      settlements,
    });
    showToast(`Excel/CSV Statement downloaded for ${rider.name}!`, 'success');
  };

  return (
    <div 
      id="single-rider-detail-modal-backdrop"
      className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div 
        id="single-rider-detail-modal-card"
        className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Toast Alert */}
        {toast && (
          <div className={`px-4 py-2 text-xs font-semibold flex items-center justify-between gap-2 border-b ${
            toast.type === 'error' ? 'bg-rose-900/80 border-rose-700 text-rose-100' : 'bg-emerald-900/80 border-emerald-700 text-emerald-100'
          }`}>
            <span>{toast.text}</span>
            <button onClick={() => setToast(null)} className="p-0.5 hover:opacity-80">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Modal Top Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 bg-slate-950/70 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-12 h-12 rounded-xl bg-blue-600/20 text-blue-400 border border-blue-500/30 flex items-center justify-center font-bold text-lg shrink-0">
              {rider.name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg sm:text-xl font-bold text-white truncate">
                  {rider.name}
                </h2>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                  rider.active !== false
                    ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                    : 'bg-slate-800 text-slate-400 border-slate-700'
                }`}>
                  {rider.active !== false ? 'Active' : 'Inactive'}
                </span>
                <span className="text-xs text-slate-400 font-mono">
                  ID: {rider.id}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-2 flex-wrap">
                <span>Workspace: <strong className="text-slate-200">{user.displayName || user.email}</strong></span>
                <span>•</span>
                <span>Vehicle: <strong className="text-slate-200">{rider.vehicleType || 'Bike'}</strong></span>
                <span>•</span>
                <span>Joined: {rider.joinedDate ? formatDateDisplay(rider.joinedDate) : 'N/A'}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              id="rider-modal-edit-toggle-btn"
              type="button"
              onClick={() => setIsEditing(!isEditing)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold border flex items-center gap-1.5 transition ${
                isEditing
                  ? 'bg-amber-600 text-white border-amber-500'
                  : 'bg-slate-800 hover:bg-slate-750 text-slate-200 border-slate-700'
              }`}
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>{isEditing ? 'Cancel Edit' : 'Master Edit'}</span>
            </button>
            <button
              id="rider-modal-close-btn"
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body (Scrollable) */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-5 flex-1">
          {/* Quick Action & Contact Row */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-slate-950/60 border border-slate-800">
            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-400 font-medium">Quick Communication:</span>
              {hasPhone ? (
                <div className="flex items-center gap-2">
                  {/* Direct Calling Button (tel:) */}
                  <a
                    id="rider-call-direct-btn"
                    href={`tel:${rider.phone}`}
                    className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 shadow transition active:scale-95"
                    title={`Direct Phone Call to ${rider.phone}`}
                  >
                    <Phone className="w-3.5 h-3.5" />
                    <span>Call ({formatPhoneNumber(rider.phone)})</span>
                  </a>

                  {/* Direct WhatsApp Button */}
                  <a
                    id="rider-whatsapp-direct-btn"
                    href={waUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1.5 rounded-lg bg-[#25D366] hover:bg-[#20bd5a] text-slate-950 text-xs font-bold flex items-center gap-1.5 shadow transition active:scale-95"
                    title="Send WhatsApp message"
                  >
                    <MessageCircle className="w-3.5 h-3.5" />
                    <span>WhatsApp</span>
                  </a>
                </div>
              ) : (
                <span className="text-xs text-amber-400 italic">No phone number registered</span>
              )}
            </div>

            {/* Export Suite & Advance Management Buttons for Single Rider */}
            <div className="flex items-center gap-2 flex-wrap">
              <button
                id="single-rider-advance-btn"
                type="button"
                onClick={() => setIsAdvanceModalOpen(true)}
                className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-slate-950 text-xs font-bold flex items-center gap-1.5 shadow transition active:scale-95 cursor-pointer"
                title="Manage rider advance & loan balance"
              >
                <IndianRupee className="w-3.5 h-3.5" />
                <span>एडवांस खाता ({formatINR(rider.totalAdvance || 0)})</span>
              </button>

              <button
                id="single-rider-ledger-link"
                type="button"
                onClick={() => {
                  if (onViewLedger) onViewLedger(rider.id);
                  else window.open(`/statement/${rider.id}`, '_blank');
                }}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-slate-700 text-xs font-semibold flex items-center gap-1.5 transition active:scale-95 cursor-pointer"
                title="Open public Excel-style rider ledger sheet"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
                <span>Online Sheet</span>
              </button>

              <button
                id="single-rider-download-pdf-btn"
                type="button"
                onClick={handleDownloadPDF}
                className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold flex items-center gap-1.5 shadow transition active:scale-95 cursor-pointer"
                title="Download single rider PDF payout statement"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Download PDF</span>
              </button>

              <button
                id="single-rider-download-csv-btn"
                type="button"
                onClick={handleDownloadCSV}
                className="px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-bold flex items-center gap-1.5 shadow transition active:scale-95 cursor-pointer"
                title="Download single rider Excel/CSV report"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>Download Excel/CSV</span>
              </button>
            </div>
          </div>

          {/* Master Edit Form (when isEditing is true) */}
          {isEditing && (
            <div className="p-4 rounded-xl bg-amber-950/20 border border-amber-500/40 space-y-4 animate-in fade-in">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Edit3 className="w-4 h-4 text-amber-400" />
                  <h3 className="text-sm font-bold text-amber-300 uppercase tracking-wider">
                    Master Edit Rider Profile & Rates
                  </h3>
                </div>
                <span className="text-[11px] text-slate-400">
                  Direct edits sync to <code className="text-amber-300">workspaces/{user.uid}/riders</code>
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-slate-300 block mb-1">Rider Full Name</label>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500"
                    placeholder="e.g. Rahul Sharma"
                  />
                </div>

                <div>
                  <label className="text-xs text-slate-300 block mb-1">Phone Number</label>
                  <input
                    type="text"
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500"
                    placeholder="e.g. 9876543210"
                  />
                </div>

                <div>
                  <label className="text-xs text-slate-300 block mb-1">Vehicle Type</label>
                  <input
                    type="text"
                    value={editVehicle}
                    onChange={(e) => setEditVehicle(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500"
                    placeholder="e.g. Hero Splendor (Bike)"
                  />
                </div>

                <div>
                  <label className="text-xs text-slate-300 block mb-1">Base Rate (₹ per parcel)</label>
                  <input
                    type="number"
                    step="any"
                    value={editBaseRate}
                    onChange={(e) => setEditBaseRate(Number(e.target.value))}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="text-xs text-slate-300 block mb-1">Incentive Rate (₹ per parcel)</label>
                  <input
                    type="number"
                    step="any"
                    value={editIncentiveRate}
                    onChange={(e) => setEditIncentiveRate(Number(e.target.value))}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div className="flex items-center gap-3 pt-5">
                  <label className="text-xs text-slate-300 flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editActive}
                      onChange={(e) => setEditActive(e.target.checked)}
                      className="rounded border-slate-700 text-amber-500 focus:ring-amber-500"
                    />
                    <span>Active Status</span>
                  </label>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-slate-800">
                {!isConfirmingDelete ? (
                  <button
                    type="button"
                    onClick={() => setIsConfirmingDelete(true)}
                    className="px-3 py-1.5 rounded-lg bg-rose-950 text-rose-400 hover:bg-rose-900 text-xs font-semibold border border-rose-800 flex items-center gap-1 transition"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete Rider</span>
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-rose-300 font-semibold">Confirm delete?</span>
                    <button
                      type="button"
                      onClick={handleDeleteRider}
                      disabled={isDeleting}
                      className="px-2.5 py-1 rounded bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition"
                    >
                      {isDeleting ? 'Deleting...' : 'Yes, Delete'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsConfirmingDelete(false)}
                      className="px-2 py-1 rounded bg-slate-800 text-slate-300 text-xs transition"
                    >
                      Cancel
                    </button>
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsEditing(false)}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs font-medium hover:bg-slate-700 transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveRiderEdit}
                    disabled={isSaving}
                    className="px-4 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold shadow flex items-center gap-1.5 transition active:scale-95 disabled:opacity-50"
                  >
                    {isSaving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                    <span>Save Changes</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Financial Overview 4-Stat Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3.5">
              <div className="flex items-center justify-between text-slate-400 text-xs">
                <span>Total Parcels</span>
                <Package className="w-3.5 h-3.5 text-blue-400" />
              </div>
              <div className="text-xl font-bold text-white mt-1">
                {totalParcels.toLocaleString('en-IN')} pkts
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                {riderEntries.length} delivery records
              </div>
            </div>

            <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3.5">
              <div className="flex items-center justify-between text-slate-400 text-xs">
                <span>Gross Earnings</span>
                <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
              </div>
              <div className="text-xl font-bold text-emerald-400 mt-1">
                {formatINR(totalGross)}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                Base {formatINR(totalBase)} + Inc {formatINR(totalIncentives)}
              </div>
            </div>

            <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3.5">
              <div className="flex items-center justify-between text-slate-400 text-xs">
                <span>Total Settled / Paid</span>
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              </div>
              <div className="text-xl font-bold text-slate-200 mt-1">
                {formatINR(totalPaid)}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                Marked as Paid
              </div>
            </div>

            <div className="bg-slate-950/70 border border-amber-500/30 rounded-xl p-3.5">
              <div className="flex items-center justify-between text-amber-400 text-xs">
                <span>Pending Dues</span>
                <Clock className="w-3.5 h-3.5 text-amber-400" />
              </div>
              <div className="text-xl font-bold text-amber-400 mt-1">
                {formatINR(totalUnpaid)}
              </div>
              <div className="text-[11px] text-amber-400/80 mt-0.5">
                {unpaidCount} unpaid deliveries
              </div>
            </div>
          </div>

          {/* Full Delivery Breakdown Table */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Calendar className="w-4 h-4 text-blue-400" />
                <span>Full Delivery Breakdown ({riderEntries.length})</span>
              </h3>
              <span className="text-xs text-slate-400">
                Click any status badge to toggle Paid / Unpaid
              </span>
            </div>

            {riderEntries.length === 0 ? (
              <div className="py-8 text-center bg-slate-950/40 rounded-xl border border-slate-800 text-slate-400 text-xs">
                No delivery entries recorded for this rider yet.
              </div>
            ) : (
              <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950/60">
                <div className="overflow-x-auto max-h-72">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-800 bg-slate-900/90 text-slate-400 font-semibold sticky top-0 z-10">
                        <th className="py-2.5 px-3">Date</th>
                        <th className="py-2.5 px-3 text-right">Parcels</th>
                        <th className="py-2.5 px-3 text-right">Base</th>
                        <th className="py-2.5 px-3 text-right">Incentive</th>
                        <th className="py-2.5 px-3 text-right">Day Earnings</th>
                        <th className="py-2.5 px-3 text-center">Status</th>
                        <th className="py-2.5 px-3">Settlement Ref</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {riderEntries.map((entry) => {
                        const isPaid = entry.status === 'Paid';
                        return (
                          <tr key={entry.id} className="hover:bg-slate-800/30 transition">
                            <td className="py-2 px-3 font-mono text-slate-200">
                              {entry.date}
                            </td>
                            <td className="py-2 px-3 text-right font-bold text-white">
                              {entry.parcels} pkts
                            </td>
                            <td className="py-2 px-3 text-right text-slate-300">
                              {formatINR(entry.baseAmount)}
                              <span className="text-[10px] text-slate-500 block">
                                (@ ₹{entry.appliedBaseRate ?? 13})
                              </span>
                            </td>
                            <td className="py-2 px-3 text-right text-slate-300">
                              {formatINR(entry.incentiveAmount)}
                              {entry.hasIncentive && (
                                <span className="text-[10px] text-amber-400 block">
                                  (@ ₹{entry.appliedIncentiveRate ?? 2})
                                </span>
                              )}
                            </td>
                            <td className="py-2 px-3 text-right font-bold text-emerald-400">
                              {formatINR(entry.totalEarnings)}
                            </td>
                            <td className="py-2 px-3 text-center">
                              <button
                                type="button"
                                onClick={() => handleToggleEntry(entry)}
                                className={`px-2 py-0.5 rounded-full text-[10px] font-bold border transition active:scale-95 cursor-pointer ${
                                  isPaid
                                    ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/25'
                                    : 'bg-amber-500/15 text-amber-300 border-amber-500/30 hover:bg-amber-500/25'
                                }`}
                                title="Click to toggle status"
                              >
                                {entry.status}
                              </button>
                            </td>
                            <td className="py-2 px-3 text-slate-400 font-mono text-[11px]">
                              {entry.settlementId ? (
                                <span className="text-indigo-300 truncate block max-w-[120px]" title={entry.settlementId}>
                                  {entry.settlementId}
                                </span>
                              ) : (
                                <span className="text-slate-600">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-3 sm:p-4 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between gap-3 text-xs">
          <div className="text-slate-400">
            Total Deliveries: <strong className="text-white">{riderEntries.length}</strong> • Unpaid: <strong className="text-amber-400">{unpaidCount}</strong> • Advance: <strong className="text-amber-300">{formatINR(rider.totalAdvance || 0)}</strong>
          </div>
          <button
            type="button"
            id="close-single-rider-modal-bottom-btn"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition cursor-pointer"
          >
            Back / Cancel (वापस जाएं)
          </button>
        </div>
      </div>

      {/* Embedded Rider Advance Modal */}
      {isAdvanceModalOpen && (
        <RiderAdvanceModal
          rider={rider}
          settlements={settlements}
          deliveries={riderEntries}
          hubName={user.displayName || user.name || 'सरायकेला कूरियर हब'}
          hubSignature={user.hubSignature}
          onClose={() => setIsAdvanceModalOpen(false)}
          onSaveAdvance={async (updatedRider, newAdvance) => {
            if (onSaveAdvance) {
              await onSaveAdvance(updatedRider, newAdvance);
            } else {
              await saveRiderToFirestore(user.uid, updatedRider);
              onRiderUpdated(updatedRider);
              await syncPublicRiderStatement(
                updatedRider,
                updatedRider.advances || [],
                settlements,
                riderEntries,
                user.displayName || user.name,
                user.hubSignature
              );
            }
            showToast(`₹${newAdvance.amount} का एडवांस सुरक्षित किया गया!`, 'success');
          }}
          onDeleteAdvance={async (updatedRider, advId) => {
            if (onDeleteAdvance) {
              await onDeleteAdvance(updatedRider, advId);
            } else {
              await saveRiderToFirestore(user.uid, updatedRider);
              onRiderUpdated(updatedRider);
              await syncPublicRiderStatement(
                updatedRider,
                updatedRider.advances || [],
                settlements,
                riderEntries,
                user.displayName || user.name,
                user.hubSignature
              );
            }
            showToast('एडवांस एंट्री सफलतापूर्वक हटाई गई!', 'success');
          }}
          onViewLedger={onViewLedger}
        />
      )}
    </div>
  );
};
