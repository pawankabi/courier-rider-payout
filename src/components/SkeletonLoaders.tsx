import React from 'react';

/**
 * Modern animated shimmer skeleton pulse for Daily Delivery Entry
 */
export const DailyEntrySkeleton: React.FC = () => {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Top Quick Stats Strip Skeleton */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="p-4 rounded-2xl bg-slate-850/80 border border-slate-750/60 space-y-2">
            <div className="h-3 w-16 bg-slate-700/60 rounded" />
            <div className="h-6 w-24 bg-slate-700/80 rounded" />
            <div className="h-2 w-20 bg-slate-800 rounded" />
          </div>
        ))}
      </div>

      {/* Entry Form Skeleton Card */}
      <div className="p-5 sm:p-6 rounded-2xl bg-slate-850/80 border border-slate-750/70 space-y-5">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
          <div className="space-y-1.5">
            <div className="h-5 w-44 bg-slate-700/80 rounded-md" />
            <div className="h-3 w-64 bg-slate-750 rounded" />
          </div>
          <div className="h-6 w-24 bg-slate-800 rounded-full" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <div className="h-3.5 w-20 bg-slate-750 rounded" />
            <div className="h-11 bg-slate-800/80 border border-slate-700/50 rounded-xl" />
          </div>
          <div className="space-y-2">
            <div className="h-3.5 w-16 bg-slate-750 rounded" />
            <div className="h-11 bg-slate-800/80 border border-slate-700/50 rounded-xl" />
          </div>
          <div className="space-y-2 sm:col-span-2 md:col-span-1">
            <div className="h-3.5 w-24 bg-slate-750 rounded" />
            <div className="h-11 bg-slate-800/80 border border-slate-700/50 rounded-xl" />
          </div>
        </div>

        <div className="pt-2 flex justify-end">
          <div className="h-12 w-full sm:w-48 bg-blue-700/40 border border-blue-600/30 rounded-xl" />
        </div>
      </div>

      {/* Recent Deliveries Table Skeleton */}
      <div className="p-5 sm:p-6 rounded-2xl bg-slate-850/80 border border-slate-750/70 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
          <div className="space-y-1">
            <div className="h-4 w-40 bg-slate-700/80 rounded" />
            <div className="h-2.5 w-56 bg-slate-800 rounded" />
          </div>
          <div className="h-6 w-20 bg-slate-800 rounded-full" />
        </div>

        <div className="space-y-2.5 pt-1">
          {[1, 2, 3, 4, 5].map((row) => (
            <div
              key={row}
              className="flex items-center justify-between p-3.5 rounded-xl bg-slate-800/40 border border-slate-750/40 gap-3"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-slate-750/70 shrink-0" />
                <div className="space-y-1.5">
                  <div className="h-3.5 w-28 bg-slate-700/70 rounded" />
                  <div className="h-2.5 w-20 bg-slate-800 rounded" />
                </div>
              </div>
              <div className="h-4 w-16 bg-slate-750/70 rounded hidden sm:block" />
              <div className="h-4 w-14 bg-blue-600/30 rounded" />
              <div className="h-6 w-16 bg-slate-750/50 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

/**
 * Modern animated shimmer skeleton for Riders Tab
 */
export const RidersTabSkeleton: React.FC = () => {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Top Action Bar Skeleton */}
      <div className="p-4 rounded-2xl bg-slate-850/80 border border-slate-750/60 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="h-10 w-full sm:w-72 bg-slate-800 border border-slate-700/50 rounded-xl" />
        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          <div className="h-10 w-28 bg-slate-800 border border-slate-700/50 rounded-xl" />
          <div className="h-10 w-32 bg-blue-700/40 border border-blue-600/30 rounded-xl" />
        </div>
      </div>

      {/* Rider Cards Skeleton */}
      <div className="space-y-3">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="p-4 sm:p-5 rounded-2xl bg-slate-850/80 border border-slate-750/60 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
          >
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-slate-750/80 shrink-0" />
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <div className="h-4 w-32 bg-slate-700/80 rounded" />
                  <div className="h-4 w-16 bg-slate-800 rounded-full" />
                </div>
                <div className="h-3 w-24 bg-slate-750/60 rounded" />
              </div>
            </div>

            <div className="flex items-center gap-4 justify-between sm:justify-end">
              <div className="space-y-1 text-right">
                <div className="h-2.5 w-16 bg-slate-800 rounded ml-auto" />
                <div className="h-4 w-20 bg-slate-700/70 rounded" />
              </div>
              <div className="flex items-center gap-2">
                <div className="h-8 w-20 bg-slate-800 rounded-lg" />
                <div className="h-8 w-8 bg-slate-800 rounded-lg" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

/**
 * Modern animated shimmer skeleton for Analytics / Reports Tab
 */
export const AnalyticsReportsSkeleton: React.FC = () => {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Top Filter Bar Skeleton */}
      <div className="p-4 rounded-2xl bg-slate-850/80 border border-slate-750/60 flex flex-wrap items-center justify-between gap-3">
        <div className="h-9 w-48 bg-slate-800 rounded-xl" />
        <div className="flex items-center gap-2">
          <div className="h-9 w-32 bg-slate-800 rounded-xl" />
          <div className="h-9 w-28 bg-emerald-700/40 rounded-xl" />
        </div>
      </div>

      {/* 4 KPI Metric Cards Skeleton */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="p-4 sm:p-5 rounded-2xl bg-slate-850/80 border border-slate-750/60 space-y-2">
            <div className="h-3 w-20 bg-slate-750 rounded" />
            <div className="h-7 w-28 bg-slate-700/80 rounded" />
            <div className="h-2.5 w-16 bg-slate-800 rounded" />
          </div>
        ))}
      </div>

      {/* Chart / Table Skeleton */}
      <div className="p-5 sm:p-6 rounded-2xl bg-slate-850/80 border border-slate-750/60 space-y-4">
        <div className="h-5 w-40 bg-slate-700/80 rounded" />
        <div className="h-48 sm:h-64 bg-slate-800/40 rounded-xl border border-slate-750/40" />
      </div>
    </div>
  );
};

/**
 * Modern animated shimmer skeleton for Settlements Tab
 */
export const SettlementTabSkeleton: React.FC = () => {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Top Filter Skeleton */}
      <div className="p-4 rounded-2xl bg-slate-850/80 border border-slate-750/60 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="h-10 w-full sm:w-64 bg-slate-800 rounded-xl" />
        <div className="h-10 w-full sm:w-40 bg-slate-800 rounded-xl" />
      </div>

      {/* Settlement Cards Skeleton */}
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="p-5 rounded-2xl bg-slate-850/80 border border-slate-750/60 space-y-3"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-5 h-5 rounded bg-slate-750" />
                <div className="h-4 w-32 bg-slate-700/80 rounded" />
              </div>
              <div className="h-5 w-24 bg-slate-750 rounded-full" />
            </div>
            <div className="h-10 bg-slate-800/40 rounded-xl border border-slate-750/30" />
          </div>
        ))}
      </div>
    </div>
  );
};
