import React, { useState } from 'react';
import { 
  X, 
  MessageCircle, 
  Send, 
  CheckCircle2, 
  AlertCircle, 
  Calendar, 
  Users, 
  Package, 
  IndianRupee,
  Loader2,
  PhoneCall
} from 'lucide-react';
import { Rider, DeliveryEntry } from '../types';
import { 
  formatINR, 
  formatDateDisplay, 
  cleanPhoneNumber, 
  isValidIndianPhone 
} from '../utils/formatters';
import { isNativeAndroid, sendNativeBackgroundSms } from '../services/nativeSms';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  riders: Rider[];
  entries: DeliveryEntry[];
  hubSignature?: string;
  onSuccess: (message: string) => void;
}

interface RiderSummaryItem {
  rider: Rider;
  parcels: number;
  earnings: number;
  phone: string;
  isValidPhone: boolean;
  entriesCount: number;
}

export const BulkDateRangeSmsModal: React.FC<Props> = ({
  isOpen,
  onClose,
  startDate,
  endDate,
  riders,
  entries,
  hubSignature = 'Saraikela Courier Team',
  onSuccess,
}) => {
  const [isSending, setIsSending] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, currentName: '' });
  const [sendResults, setSendResults] = useState<{
    successCount: number;
    failCount: number;
    errors: string[];
  } | null>(null);
  const [onlyWithDeliveries, setOnlyWithDeliveries] = useState(true);

  if (!isOpen) return null;

  // Filter entries in date range
  const filteredEntries = entries.filter((e) => {
    if (startDate && e.date < startDate) return false;
    if (endDate && e.date > endDate) return false;
    return true;
  });

  // Calculate per-rider statistics within the date range
  const riderSummaries: RiderSummaryItem[] = riders.map((r) => {
    const riderEntries = filteredEntries.filter((e) => e.riderId === r.id);
    const parcels = riderEntries.reduce((sum, e) => sum + e.parcels, 0);
    const earnings = riderEntries.reduce((sum, e) => sum + e.totalEarnings, 0);
    const cleanPhone = cleanPhoneNumber(r.phone);
    const isValidPhone = isValidIndianPhone(cleanPhone);

    return {
      rider: r,
      parcels,
      earnings,
      phone: cleanPhone,
      isValidPhone,
      entriesCount: riderEntries.length,
    };
  });

  // Eligible riders based on filter
  const eligibleRiders = riderSummaries.filter((item) => {
    if (!item.isValidPhone) return false;
    if (onlyWithDeliveries && item.parcels === 0 && item.earnings === 0) return false;
    return true;
  });

  const totalRangeParcels = eligibleRiders.reduce((sum, r) => sum + r.parcels, 0);
  const totalRangeEarnings = eligibleRiders.reduce((sum, r) => sum + r.earnings, 0);

  // Format sample SMS message
  const startStr = formatDateDisplay(startDate) || startDate;
  const endStr = formatDateDisplay(endDate) || endDate;
  const effectiveHubName = (hubSignature || 'Saraikela Courier Team').trim();

  const getSmsText = (riderName: string, parcels: number, earnings: number) => {
    return `Namaste ${riderName}, your earnings from ${startStr} to ${endStr} for ${parcels} parcels is Rs. ${earnings}. - ${effectiveHubName}`;
  };

  const sampleRider = eligibleRiders[0] || riderSummaries[0];
  const sampleMessage = sampleRider
    ? getSmsText(sampleRider.rider.name, sampleRider.parcels, sampleRider.earnings)
    : `Namaste [Rider Name], your earnings from ${startStr} to ${endStr} for 0 parcels is Rs. 0. - ${effectiveHubName}`;

  // Execute Bulk SIM SMS Sending
  const handleStartSending = async () => {
    if (eligibleRiders.length === 0) return;

    setIsSending(true);
    setProgress({ current: 0, total: eligibleRiders.length, currentName: '' });

    let successCount = 0;
    let failCount = 0;
    const errors: string[] = [];

    for (let i = 0; i < eligibleRiders.length; i++) {
      const item = eligibleRiders[i];
      setProgress({
        current: i + 1,
        total: eligibleRiders.length,
        currentName: item.rider.name,
      });

      const message = getSmsText(item.rider.name, item.parcels, item.earnings);

      try {
        const res = await sendNativeBackgroundSms(item.phone, message);
        if (res.success) {
          successCount++;
        } else {
          failCount++;
          errors.push(`${item.rider.name}: ${res.error || 'Failed'}`);
        }
      } catch (err: any) {
        failCount++;
        errors.push(`${item.rider.name}: ${err?.message || 'Error'}`);
      }

      // Small throttle delay for native cellular modem to process each SMS cleanly
      if (isNativeAndroid() && i < eligibleRiders.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 350));
      }
    }

    setIsSending(false);
    setSendResults({ successCount, failCount, errors });

    if (successCount > 0) {
      onSuccess(`✅ Successfully dispatched date range SMS to ${successCount} riders!`);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-750 w-full max-w-xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="bg-gradient-to-r from-sky-950/70 via-blue-950/60 to-slate-900/90 border-b border-sky-500/30 p-4 sm:p-5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-sky-500/20 text-sky-400 border border-sky-500/30">
              <MessageCircle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-white text-base sm:text-lg flex items-center gap-2">
                <span>Send Date Range SMS to All Riders</span>
              </h3>
              <p className="text-xs text-sky-300/80 mt-0.5">
                Bulk background SIM SMS notification for payout period
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSending}
            className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1">
          {/* Active Period & Metrics Card */}
          <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3 sm:p-4 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2 text-xs">
              <div className="flex items-center gap-1.5 text-slate-300 font-semibold">
                <Calendar className="w-4 h-4 text-sky-400" />
                <span>Period: {startStr} — {endStr}</span>
              </div>
              <span className="text-[11px] px-2 py-0.5 rounded-md bg-sky-500/15 text-sky-300 border border-sky-500/30 font-bold">
                {isNativeAndroid() ? 'Direct SIM SMS (Background)' : 'Web SMS Service'}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-850 text-center">
              <div className="bg-slate-900/90 rounded-lg p-2 border border-slate-800">
                <div className="text-[10px] text-slate-400">Recipients</div>
                <div className="text-sm sm:text-base font-extrabold text-white mt-0.5">
                  {eligibleRiders.length} Riders
                </div>
              </div>
              <div className="bg-slate-900/90 rounded-lg p-2 border border-slate-800">
                <div className="text-[10px] text-slate-400">Range Parcels</div>
                <div className="text-sm sm:text-base font-extrabold text-sky-300 mt-0.5">
                  {totalRangeParcels} pkts
                </div>
              </div>
              <div className="bg-slate-900/90 rounded-lg p-2 border border-slate-800">
                <div className="text-[10px] text-slate-400">Range Payout</div>
                <div className="text-sm sm:text-base font-extrabold text-emerald-400 mt-0.5">
                  {formatINR(totalRangeEarnings)}
                </div>
              </div>
            </div>
          </div>

          {/* SMS Template Preview */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
              <span>SMS Message Template:</span>
              <span className="text-[10px] text-slate-400">Auto-formatted for each rider</span>
            </label>
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-sky-200/90 font-mono leading-relaxed whitespace-pre-wrap select-all">
              {sampleMessage}
            </div>
          </div>

          {/* Filter Option */}
          <div className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              id="onlyWithDeliveriesCheckbox"
              checked={onlyWithDeliveries}
              onChange={(e) => setOnlyWithDeliveries(e.target.checked)}
              disabled={isSending}
              className="w-4 h-4 rounded border-slate-700 bg-slate-800 text-sky-600 focus:ring-0 focus:outline-none cursor-pointer"
            />
            <label
              htmlFor="onlyWithDeliveriesCheckbox"
              className="text-xs text-slate-300 cursor-pointer select-none"
            >
              Only send to riders with deliveries in this date range ({eligibleRiders.length} of {riders.length})
            </label>
          </div>

          {/* Real-time Sending Progress */}
          {isSending && (
            <div className="p-3.5 rounded-xl bg-sky-950/40 border border-sky-500/40 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-sky-300 flex items-center gap-1.5">
                  <Loader2 className="w-4 h-4 animate-spin text-sky-400" />
                  <span>Sending SMS: {progress.currentName}...</span>
                </span>
                <span className="font-semibold text-sky-200">
                  {progress.current} / {progress.total}
                </span>
              </div>
              <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-sky-500 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${(progress.current / progress.total) * 100}%` }}
                />
              </div>
            </div>
          )}

          {/* Send Results Summary */}
          {sendResults && (
            <div className={`p-3.5 rounded-xl border ${
              sendResults.failCount === 0 
                ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300' 
                : 'bg-amber-950/40 border-amber-500/40 text-amber-300'
            }`}>
              <div className="flex items-center gap-2 text-xs font-bold">
                <CheckCircle2 className="w-4 h-4" />
                <span>
                  Dispatched {sendResults.successCount} of {eligibleRiders.length} SMS successfully!
                  {sendResults.failCount > 0 && ` (${sendResults.failCount} failed)`}
                </span>
              </div>
            </div>
          )}

          {/* List of Eligible Riders to Receive SMS */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="font-semibold">Recipients Queue:</span>
              <span>{eligibleRiders.length} eligible</span>
            </div>

            <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
              {eligibleRiders.length === 0 ? (
                <div className="p-4 rounded-xl bg-slate-950 text-center text-xs text-slate-500">
                  No riders have deliveries or valid phone numbers in this date range.
                </div>
              ) : (
                eligibleRiders.map((item) => (
                  <div
                    key={item.rider.id}
                    className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-850 flex items-center justify-between gap-2 text-xs"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-7 h-7 rounded-lg bg-sky-600/20 text-sky-400 font-bold flex items-center justify-center shrink-0 text-xs">
                        {item.rider.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="truncate">
                        <div className="font-bold text-white truncate">{item.rider.name}</div>
                        <div className="text-[11px] text-slate-400 font-mono">{item.phone}</div>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="font-bold text-sky-300">{formatINR(item.earnings)}</div>
                      <div className="text-[10px] text-slate-400">{item.parcels} pkts</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-950/90 border-t border-slate-800 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            disabled={isSending}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 transition disabled:opacity-50"
          >
            {sendResults ? 'Close' : 'Cancel'}
          </button>

          {!sendResults ? (
            <button
              type="button"
              onClick={handleStartSending}
              disabled={isSending || eligibleRiders.length === 0}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-500 hover:to-blue-500 text-white text-xs font-bold shadow-lg shadow-sky-950/50 active:scale-95 transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {isSending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Sending ({progress.current}/{progress.total})...</span>
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  <span>Confirm & Send ({eligibleRiders.length} SMS)</span>
                </>
              )}
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold transition"
            >
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
