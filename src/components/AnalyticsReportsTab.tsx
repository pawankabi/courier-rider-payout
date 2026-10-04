import React, { useState, useMemo } from 'react';
import { 
  BarChart3, 
  Download, 
  Calendar, 
  Users, 
  Package, 
  TrendingUp, 
  Coins, 
  Sparkles, 
  CheckSquare, 
  Square,
  FileSpreadsheet,
  Filter,
  Phone
} from 'lucide-react';
import { DeliveryEntry, Rider, UserRateConfig } from '../types';
import { 
  formatINR, 
  formatDateDisplay, 
  getTodayDateString, 
  getDaysAgoDateString, 
  BASE_RATE, 
  INCENTIVE_RATE 
} from '../utils/formatters';
import { generatePayoutPDF } from '../utils/pdfGenerator';
import { exportBulkRidersToCSV } from '../utils/csvExport';

interface Props {
  riders: Rider[];
  entries: DeliveryEntry[];
  onDownloadBackup?: () => void;
  userRateConfig?: UserRateConfig;
  hubName?: string;
  isVerifiedHub?: boolean;
}

export const AnalyticsReportsTab: React.FC<Props> = ({ 
  riders, 
  entries, 
  onDownloadBackup, 
  userRateConfig,
  hubName,
  isVerifiedHub = false 
}) => {
  const effBaseRate = userRateConfig?.defaultBaseRate ?? BASE_RATE;
  const effIncentiveRate = userRateConfig?.defaultIncentiveRate ?? INCENTIVE_RATE;

  // Filter States
  const [selectedRiderIds, setSelectedRiderIds] = useState<string[]>([]); // empty = all riders
  const [startDate, setStartDate] = useState<string>(getDaysAgoDateString(14)); // default 15 days
  const [endDate, setEndDate] = useState<string>(getTodayDateString());
  const [isMultiSelectOpen, setIsMultiSelectOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // Quick Date Range Presets
  const handlePresetDate = (days: number) => {
    setStartDate(getDaysAgoDateString(days - 1));
    setEndDate(getTodayDateString());
  };

  const handleCurrentMonth = () => {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const y = firstDay.getFullYear();
    const m = String(firstDay.getMonth() + 1).padStart(2, '0');
    const d = String(firstDay.getDate()).padStart(2, '0');
    setStartDate(`${y}-${m}-${d}`);
    setEndDate(getTodayDateString());
  };

  const handleAllTime = () => {
    if (entries.length === 0) return;
    const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
    setStartDate(sorted[0].date);
    setEndDate(getTodayDateString());
  };

  // Toggle single rider in multi-select
  const toggleRiderSelection = (id: string) => {
    if (selectedRiderIds.includes(id)) {
      setSelectedRiderIds(selectedRiderIds.filter((item) => item !== id));
    } else {
      setSelectedRiderIds([...selectedRiderIds, id]);
    }
  };

  const selectAllRiders = () => {
    setSelectedRiderIds([]);
  };

  // Map assigned rider sequence
  const riderOrderMap = useMemo(() => {
    const map = new Map<string, number>();
    riders.forEach((r, idx) => {
      map.set(r.id, idx);
    });
    return map;
  }, [riders]);

  // Filtered entries strictly grouped by assigned Rider sequence, then sorted in ascending chronological order (Oldest to Newest)
  const filteredEntries = useMemo(() => {
    const matches = entries.filter((entry) => {
      // Rider match
      const riderMatches =
        selectedRiderIds.length === 0 || selectedRiderIds.includes(entry.riderId);
      if (!riderMatches) return false;

      // Date match
      const entryDate = entry.date;
      if (startDate && entryDate < startDate) return false;
      if (endDate && entryDate > endDate) return false;

      return true;
    });

    return matches.sort((a, b) => {
      // 1. Group by assigned rider sequence
      const orderA = riderOrderMap.has(a.riderId) ? riderOrderMap.get(a.riderId)! : 999999;
      const orderB = riderOrderMap.has(b.riderId) ? riderOrderMap.get(b.riderId)! : 999999;
      if (orderA !== orderB) {
        return orderA - orderB;
      }
      // 2. Sort chronologically from Start Date to End Date (Oldest to Newest)
      return a.date.localeCompare(b.date);
    });
  }, [entries, selectedRiderIds, startDate, endDate, riderOrderMap]);

  // Aggregations
  const totalParcels = filteredEntries.reduce((sum, e) => sum + e.parcels, 0);
  const totalBasePayout = filteredEntries.reduce((sum, e) => sum + e.baseAmount, 0);
  const totalIncentive = filteredEntries.reduce((sum, e) => sum + e.incentiveAmount, 0);
  const grandTotal = filteredEntries.reduce((sum, e) => sum + e.totalEarnings, 0);
  const paidAmount = filteredEntries.filter((e) => e.status === 'Paid').reduce((sum, e) => sum + e.totalEarnings, 0);
  const unpaidAmount = filteredEntries.filter((e) => e.status === 'Unpaid').reduce((sum, e) => sum + e.totalEarnings, 0);

  // Rider label for summary/PDF
  const riderFilterLabel = useMemo(() => {
    if (selectedRiderIds.length === 0) return 'All Riders';
    if (selectedRiderIds.length === 1) {
      const r = riders.find((item) => item.id === selectedRiderIds[0]);
      return r ? r.name : '1 Rider';
    }
    return `${selectedRiderIds.length} Selected Riders`;
  }, [selectedRiderIds, riders]);

  // PDF Export trigger
  const handleDownloadPDF = async () => {
    setIsExporting(true);
    try {
      await generatePayoutPDF({
        riderFilterName: riderFilterLabel,
        startDate,
        endDate,
        entries: filteredEntries,
        riders,
        userRateConfig,
        hubName,
        isVerifiedHub,
      });
    } catch (err) {
      console.error('Error generating PDF', err);
      alert('Could not export PDF. Please check data entries.');
    } finally {
      setTimeout(() => setIsExporting(false), 800);
    }
  };

  const handleDownloadCSV = () => {
    if (filteredEntries.length === 0) return;
    try {
      const exportRiders = selectedRiderIds.length === 0
        ? riders
        : riders.filter((r) => selectedRiderIds.includes(r.id));

      exportBulkRidersToCSV({
        userName: riderFilterLabel,
        userEmail: 'Workspace Export',
        riders: exportRiders,
        entries: filteredEntries,
      });
    } catch (err) {
      console.error('Error generating CSV', err);
      alert('Could not export CSV. Please check data entries.');
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      {/* Header & Controls Card */}
      <div className="bg-gradient-to-br from-purple-950/60 via-fuchsia-950/35 to-slate-900/70 border border-purple-500/40 shadow-lg shadow-purple-950/25 rounded-2xl p-4 sm:p-6 backdrop-blur-md space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 rounded-xl bg-purple-600/25 text-fuchsia-300 border border-purple-400/40 shadow-sm">
              <BarChart3 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white tracking-tight">
                Analytics & Date Range Reports
              </h2>
              <p className="text-xs text-slate-300">
                Filter by rider, custom date ranges, audit base + incentive, and export PDF statements
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {onDownloadBackup && (
              <button
                id="download-backup-report-btn"
                onClick={onDownloadBackup}
                className="inline-flex items-center justify-center gap-2 px-3.5 py-2.5 bg-slate-800 hover:bg-slate-750 border border-slate-700 text-slate-200 text-xs font-bold rounded-xl shadow active:scale-95 transition"
                title="Download full JSON backup of all riders, deliveries, and settlements"
              >
                <Download className="w-4 h-4 text-blue-400" />
                <span>Download Backup</span>
              </button>
            )}

            <button
              id="download-csv-report-btn"
              onClick={handleDownloadCSV}
              disabled={filteredEntries.length === 0 || isExporting}
              className="inline-flex items-center justify-center gap-2 px-3.5 py-2.5 bg-slate-800 hover:bg-slate-750 border border-slate-700 text-emerald-400 hover:text-emerald-300 text-xs font-bold rounded-xl shadow active:scale-95 transition cursor-pointer"
              title="Download clean Excel/CSV report of filtered records"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Export CSV/Excel</span>
            </button>

            <button
              id="download-pdf-report-btn"
              onClick={handleDownloadPDF}
              disabled={filteredEntries.length === 0 || isExporting}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold rounded-xl shadow-lg shadow-emerald-600/20 active:scale-95 transition cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>{isExporting ? 'Generating PDF...' : 'Download PDF Report'}</span>
            </button>
          </div>
        </div>

        {/* Filter Toolbar */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3.5 pt-2 border-t border-slate-800">
          {/* Rider Selector */}
          <div className="md:col-span-5">
            <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center justify-between">
              <span>Filter Riders:</span>
              <span className="text-[11px] text-blue-400 font-medium">
                {riderFilterLabel}
              </span>
            </label>

            <div className="relative">
              <button
                type="button"
                onClick={() => setIsMultiSelectOpen(!isMultiSelectOpen)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-left text-xs font-semibold text-slate-200 flex items-center justify-between hover:border-slate-600 transition"
              >
                <span className="truncate">
                  {selectedRiderIds.length === 0
                    ? '👥 All Riders Included'
                    : selectedRiderIds.length === 1
                    ? `👤 ${riders.find((r) => r.id === selectedRiderIds[0])?.name || '1 Rider'}`
                    : `👥 ${selectedRiderIds.length} Riders Selected`}
                </span>
                <Filter className="w-3.5 h-3.5 text-slate-400 shrink-0 ml-2" />
              </button>

              {/* Multi-Select Dropdown Popover */}
              {isMultiSelectOpen && (
                <div className="absolute left-0 right-0 top-full mt-1.5 z-30 rounded-2xl bg-slate-900 border border-slate-700 p-3 shadow-2xl space-y-2 animate-in fade-in">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-800 text-xs">
                    <span className="font-bold text-slate-300">Select Scope</span>
                    <div className="flex gap-2">
                      <button
                        onClick={selectAllRiders}
                        className="text-[11px] text-blue-400 hover:underline font-semibold"
                      >
                        Select All
                      </button>
                      <button
                        onClick={() => setSelectedRiderIds([])}
                        className="text-[11px] text-slate-400 hover:text-white"
                      >
                        Reset
                      </button>
                    </div>
                  </div>

                  <div className="max-h-48 overflow-y-auto space-y-1">
                    <button
                      onClick={selectAllRiders}
                      className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs text-left transition ${
                        selectedRiderIds.length === 0
                          ? 'bg-blue-600/20 text-blue-300 font-semibold'
                          : 'text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      {selectedRiderIds.length === 0 ? (
                        <CheckSquare className="w-3.5 h-3.5 text-blue-400" />
                      ) : (
                        <Square className="w-3.5 h-3.5 text-slate-500" />
                      )}
                      <span>All Riders</span>
                    </button>

                    {riders.map((r) => {
                      const isSelected = selectedRiderIds.includes(r.id);
                      return (
                        <button
                          key={r.id}
                          onClick={() => toggleRiderSelection(r.id)}
                          className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs text-left transition ${
                            isSelected
                              ? 'bg-blue-600/20 text-blue-300 font-semibold'
                              : 'text-slate-300 hover:bg-slate-800'
                          }`}
                        >
                          {isSelected ? (
                            <CheckSquare className="w-3.5 h-3.5 text-blue-400" />
                          ) : (
                            <Square className="w-3.5 h-3.5 text-slate-500" />
                          )}
                          <span className="truncate">{r.name}</span>
                        </button>
                      );
                    })}
                  </div>

                  <button
                    onClick={() => setIsMultiSelectOpen(false)}
                    className="w-full py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg text-center"
                  >
                    Done
                  </button>
                </div>
              )}

              {/* Single Selected Rider Quick Call Pill */}
              {selectedRiderIds.length === 1 && (() => {
                const singleRider = riders.find((r) => r.id === selectedRiderIds[0]);
                if (!singleRider) return null;
                return (
                  <div className="mt-1.5 flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-slate-900/90 border border-slate-800 text-xs">
                    <span className="text-slate-300 font-mono text-[11px] truncate">
                      +91 {singleRider.phone}
                    </span>
                    <a
                      id="call-filter-rider-btn"
                      href={`tel:${singleRider.phone}`}
                      className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/40 text-blue-300 hover:text-white text-[11px] font-bold shadow-sm transition active:scale-95"
                      title={`Direct Call ${singleRider.name}`}
                    >
                      <Phone className="w-3 h-3" />
                      <span>Call Rider</span>
                    </a>
                  </div>
                );
              })()}
            </div>
          </div>

          {/* Date Range Inputs */}
          <div className="md:col-span-7 space-y-1.5">
            <label className="block text-xs font-semibold text-slate-300">
              Date Range (From - To):
            </label>
            <div className="grid grid-cols-2 gap-2">
              <input
                id="analytics-start-date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs font-medium text-slate-100 focus:outline-none focus:border-blue-500"
              />
              <input
                id="analytics-end-date"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs font-medium text-slate-100 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Quick Date Presets Row */}
        <div className="flex items-center gap-1.5 overflow-x-auto pt-1 pb-1">
          <span className="text-[11px] font-semibold text-slate-400 shrink-0 mr-1">
            Presets:
          </span>
          {[
            { label: '7 Days', days: 7 },
            { label: '15 Days', days: 15 },
            { label: '30 Days', days: 30 },
            { label: '60 Days', days: 60 },
          ].map((preset) => (
            <button
              key={preset.days}
              type="button"
              onClick={() => handlePresetDate(preset.days)}
              className="px-2.5 py-1 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-300 border border-slate-700 shrink-0 transition"
            >
              {preset.label}
            </button>
          ))}
          <button
            type="button"
            onClick={handleCurrentMonth}
            className="px-2.5 py-1 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-300 border border-slate-700 shrink-0 transition"
          >
            This Month
          </button>
          <button
            type="button"
            onClick={handleAllTime}
            className="px-2.5 py-1 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-300 border border-slate-700 shrink-0 transition"
          >
            All Time
          </button>
        </div>
      </div>

      {/* Summary KPI Cards Grid (Total Parcels, Base Payout, Incentive, Grand Total) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Total Parcels Delivered */}
        <div className="bg-slate-850 border border-slate-750 rounded-2xl p-4 shadow-lg flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Total Parcels
            </span>
            <div className="p-2 rounded-xl bg-blue-500/10 text-blue-400">
              <Package className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-xl sm:text-2xl font-black text-white">
              {totalParcels.toLocaleString('en-IN')}
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Across {filteredEntries.length} delivery shifts
            </p>
          </div>
        </div>

        {/* Total Base Payout */}
        <div className="bg-slate-850 border border-slate-750 rounded-2xl p-4 shadow-lg flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Base Payout (₹{effBaseRate})
            </span>
            <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400">
              <Coins className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-xl sm:text-2xl font-black text-slate-200">
              {formatINR(totalBasePayout)}
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {totalParcels} pkts × ₹{effBaseRate}
            </p>
          </div>
        </div>

        {/* Total Incentive */}
        <div className="bg-slate-850 border border-slate-750 rounded-2xl p-4 shadow-lg flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Total Incentive (+₹{effIncentiveRate})
            </span>
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400">
              <Sparkles className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-xl sm:text-2xl font-black text-amber-400">
              +{formatINR(totalIncentive)}
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Performance extra pay
            </p>
          </div>
        </div>

        {/* Grand Total */}
        <div className="bg-gradient-to-br from-blue-900/40 via-slate-850 to-emerald-950/40 border border-emerald-500/40 rounded-2xl p-4 shadow-lg flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-emerald-300 uppercase tracking-wider">
              Grand Total Payout
            </span>
            <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-300">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-xl sm:text-2xl font-black text-emerald-300">
              {formatINR(grandTotal)}
            </div>
            <div className="flex items-center gap-2 text-[11px] text-slate-300 mt-0.5 font-medium">
              <span>Paid: {formatINR(paidAmount)}</span>
              <span>•</span>
              <span className="text-amber-400 font-semibold">Unpaid: {formatINR(unpaidAmount)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Day-Wise Breakdown Table */}
      <div className="bg-gradient-to-br from-purple-950/40 via-slate-900/80 to-slate-900/90 border border-purple-500/30 rounded-2xl p-4 sm:p-6 shadow-xl backdrop-blur-md">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
          <div>
            <h3 className="text-sm sm:text-base font-bold text-white">
              Day-Wise Delivery & Payout Breakdown
            </h3>
            <p className="text-xs text-slate-400">
              Detailed audit trail for period: {formatDateDisplay(startDate)} to {formatDateDisplay(endDate)}
            </p>
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span>Showing {filteredEntries.length} entries</span>
          </div>
        </div>

        {filteredEntries.length === 0 ? (
          <div className="text-center py-12 text-slate-500 text-xs">
            No deliveries found for the selected rider and date filter.
          </div>
        ) : (
          <div className="overflow-x-auto -mx-4 sm:mx-0">
            <div className="inline-block min-w-full align-middle">
              <table className="min-w-full divide-y divide-slate-800">
                <thead>
                  <tr className="bg-slate-900/80 text-slate-400 text-[11px] font-semibold uppercase tracking-wider">
                    <th className="py-2.5 px-3 text-left">Date</th>
                    <th className="py-2.5 px-3 text-left">Rider Name</th>
                    <th className="py-2.5 px-3 text-center">Delivered Parcels</th>
                    <th className="py-2.5 px-3 text-right">Base Pay (₹{effBaseRate})</th>
                    <th className="py-2.5 px-3 text-center">Incentive (+₹{effIncentiveRate})</th>
                    <th className="py-2.5 px-3 text-right">Total Earnings</th>
                    <th className="py-2.5 px-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-xs">
                  {filteredEntries.map((entry, index) => {
                    const isFirstOfRider = index === 0 || filteredEntries[index - 1].riderId !== entry.riderId;
                    const isMultiRider = selectedRiderIds.length !== 1;
                    const rEntries = isFirstOfRider && isMultiRider
                      ? filteredEntries.filter((e) => e.riderId === entry.riderId)
                      : [];
                    const rParcels = rEntries.reduce((sum, e) => sum + e.parcels, 0);
                    const rTotal = rEntries.reduce((sum, e) => sum + e.totalEarnings, 0);

                    return (
                      <React.Fragment key={entry.id}>
                        {isFirstOfRider && isMultiRider && (
                          <tr className="bg-slate-900/90 text-blue-300 font-bold border-t-2 border-slate-700/80">
                            <td colSpan={7} className="py-2.5 px-3">
                              <div className="flex items-center justify-between">
                                <span className="flex items-center gap-2 text-xs font-bold text-white">
                                  <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                                  <span>{entry.riderName}</span>
                                  {entry.riderPhone && (
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-[11px] text-slate-400 font-mono">
                                        (+91 {entry.riderPhone})
                                      </span>
                                      <a
                                        id={`call-report-subtotal-rider-${entry.riderId}`}
                                        href={`tel:${entry.riderPhone}`}
                                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/40 text-blue-300 hover:text-white text-[10px] font-bold transition active:scale-95"
                                        title={`Direct Call ${entry.riderName}`}
                                      >
                                        <Phone className="w-2.5 h-2.5" />
                                        <span>Call</span>
                                      </a>
                                    </div>
                                  )}
                                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-300 font-normal border border-blue-500/20">
                                    {rEntries.length} Active Days
                                  </span>
                                </span>
                                <span className="text-[11px] text-emerald-400 font-bold">
                                  Rider Subtotal: {rParcels} pkts • {formatINR(rTotal)}
                                </span>
                              </div>
                            </td>
                          </tr>
                        )}
                        <tr className="hover:bg-slate-800/40 transition">
                          <td className="py-2.5 px-3 text-slate-300 font-medium whitespace-nowrap">
                            {formatDateDisplay(entry.date)}
                          </td>
                          <td className="py-2.5 px-3 text-white font-semibold whitespace-nowrap">
                            <div className="flex items-center gap-1.5">
                              <span>{entry.riderName}</span>
                              {entry.riderPhone && (
                                <a
                                  id={`call-report-entry-rider-${entry.id}`}
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
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                                Yes (+{formatINR(entry.incentiveAmount)})
                              </span>
                            ) : (
                              <span className="text-[10px] text-slate-500">No (₹0)</span>
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
                        </tr>
                      </React.Fragment>
                    );
                  })}
                </tbody>

                {/* Table Footer with Bold Column Totals */}
                <tfoot>
                  <tr className="bg-slate-900/95 font-bold text-xs border-t-2 border-slate-700">
                    <td colSpan={2} className="py-3 px-3 text-white uppercase tracking-wider text-[11px]">
                      Filter Period Total
                    </td>
                    <td className="py-3 px-3 text-center text-blue-400 font-extrabold text-sm">
                      {totalParcels.toLocaleString('en-IN')} pkts
                    </td>
                    <td className="py-3 px-3 text-right text-slate-200 font-extrabold">
                      {formatINR(totalBasePayout)}
                    </td>
                    <td className="py-3 px-3 text-center text-amber-400 font-extrabold">
                      +{formatINR(totalIncentive)}
                    </td>
                    <td className="py-3 px-3 text-right text-emerald-300 font-black text-sm">
                      {formatINR(grandTotal)}
                    </td>
                    <td className="py-3 px-3 text-center text-[11px] text-slate-400">
                      {unpaidAmount > 0 ? `Unpaid: ${formatINR(unpaidAmount)}` : 'All Settled'}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
