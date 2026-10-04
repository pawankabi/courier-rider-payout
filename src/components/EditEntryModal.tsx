import React, { useState, useEffect } from 'react';
import { X, Check, Calculator, Calendar, Package } from 'lucide-react';
import { DeliveryEntry, Rider } from '../types';
import { BASE_RATE, INCENTIVE_RATE, formatINR } from '../utils/formatters';

interface Props {
  entry: DeliveryEntry;
  riders: Rider[];
  onSave: (updatedEntry: DeliveryEntry) => void;
  onClose: () => void;
  canAccessIncentives?: boolean;
}

export const EditEntryModal: React.FC<Props> = ({ entry, riders, onSave, onClose, canAccessIncentives = true }) => {
  const [riderId, setRiderId] = useState(entry.riderId);
  const [date, setDate] = useState(entry.date);
  const [parcels, setParcels] = useState<number | ''>(entry.parcels);
  const [hasIncentive, setHasIncentive] = useState(entry.hasIncentive);
  const [status, setStatus] = useState<'Unpaid' | 'Paid'>(entry.status);
  const [notes, setNotes] = useState(entry.notes || '');

  // Smooth Escape key handler to return smoothly without freeze
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const selectedRider = riders.find((r) => r.id === riderId);
  const currentBaseRate = selectedRider?.baseRate ?? entry.baseRate ?? BASE_RATE;
  const currentIncentiveRate = selectedRider?.incentiveRate ?? entry.incentiveRate ?? INCENTIVE_RATE;
  const incentiveAllowed = canAccessIncentives && (selectedRider?.incentiveEnabled !== false);

  const parcelNum = typeof parcels === 'number' ? parcels : 0;
  const effectiveIncentive = incentiveAllowed && hasIncentive;
  const baseAmount = parcelNum * currentBaseRate;
  const incentiveAmount = parcelNum * (effectiveIncentive ? currentIncentiveRate : 0);
  const totalEarnings = baseAmount + incentiveAmount;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (parcelNum <= 0) return;

    const riderObj = selectedRider || {
      id: entry.riderId,
      name: entry.riderName,
      phone: entry.riderPhone,
    };

    onSave({
      ...entry,
      riderId,
      riderName: riderObj.name,
      riderPhone: riderObj.phone,
      date,
      parcels: parcelNum,
      baseRate: currentBaseRate,
      hasIncentive: effectiveIncentive,
      incentiveRate: currentIncentiveRate,
      baseAmount,
      incentiveAmount,
      totalEarnings,
      status,
      notes: notes.trim(),
    });
    onClose();
  };

  return (
    <div
      id="edit-entry-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm animate-in fade-in"
    >
      <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-700 p-5 shadow-2xl text-slate-100 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-blue-600/20 text-blue-400 border border-blue-500/30">
              <Calculator className="w-4 h-4" />
            </div>
            <h3 className="font-semibold text-base">Edit Delivery Entry</h3>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {/* Rider Selector */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Courier Rider
            </label>
            <select
              value={riderId}
              onChange={(e) => setRiderId(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
              required
            >
              {riders.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} ({r.phone})
                </option>
              ))}
            </select>
          </div>

          {/* Date Picker */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Delivery Date
            </label>
            <div className="relative">
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
                required
              />
            </div>
          </div>

          {/* Parcels Delivered */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Parcels Delivered
            </label>
            <input
              type="number"
              min="1"
              value={parcels}
              onChange={(e) => setParcels(e.target.value === '' ? '' : parseInt(e.target.value, 10))}
              className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-base font-semibold text-white focus:outline-none focus:border-blue-500"
              required
            />
          </div>

          {/* Incentive Toggle */}
          {incentiveAllowed && (
            <div className="p-3 rounded-xl bg-slate-800/80 border border-slate-700/80">
              <label className="flex items-center justify-between cursor-pointer">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={hasIncentive}
                    onChange={(e) => setHasIncentive(e.target.checked)}
                    className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 bg-slate-900 border-slate-700"
                  />
                  <span className="text-xs font-medium text-slate-200">
                    Add ₹{currentIncentiveRate} Incentive (₹{currentBaseRate + currentIncentiveRate} total/pkt)
                  </span>
                </div>
                <span
                  className={`text-xs px-2 py-0.5 rounded font-semibold ${
                    hasIncentive
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                      : 'bg-slate-700 text-slate-400'
                  }`}
                >
                  {hasIncentive
                    ? `₹${currentBaseRate + currentIncentiveRate}/pkt`
                    : `₹${currentBaseRate}/pkt`}
                </span>
              </label>
            </div>
          )}

          {/* Payment Status */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Payment Settlement Status
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setStatus('Unpaid')}
                className={`py-2 px-3 text-xs font-medium rounded-xl border transition ${
                  status === 'Unpaid'
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/50'
                    : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-750'
                }`}
              >
                ⏳ Unpaid
              </button>
              <button
                type="button"
                onClick={() => setStatus('Paid')}
                className={`py-2 px-3 text-xs font-medium rounded-xl border transition ${
                  status === 'Paid'
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50'
                    : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-750'
                }`}
              >
                ✅ Paid
              </button>
            </div>
          </div>

          {/* Optional Notes */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Notes / Route (Optional)
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Morning route / Heavy packages"
              className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Live Calculation Summary */}
          <div className="p-3.5 rounded-xl bg-gradient-to-br from-slate-800 to-slate-850 border border-slate-700 space-y-2">
            <div className="flex justify-between text-xs text-slate-400">
              <span>Base Amount ({parcelNum} × ₹{currentBaseRate})</span>
              <span className="font-semibold text-slate-200">{formatINR(baseAmount)}</span>
            </div>
            {incentiveAllowed && (
              <div className="flex justify-between text-xs text-slate-400">
                <span>Incentive Amount ({hasIncentive ? `${parcelNum} × ₹${currentIncentiveRate}` : 'Disabled'})</span>
                <span className="font-semibold text-emerald-400">+{formatINR(incentiveAmount)}</span>
              </div>
            )}
            <div className="pt-2 border-t border-slate-700/80 flex justify-between items-center">
              <span className="text-xs font-bold text-slate-200">Total Updated Payout:</span>
              <span className="text-base font-extrabold text-blue-400">{formatINR(totalEarnings)}</span>
            </div>
          </div>

          <div className="flex gap-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-slate-300 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 py-2.5 px-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white shadow-md flex items-center justify-center gap-1.5 transition"
            >
              <Check className="w-4 h-4" />
              <span>Save Changes</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
