import React, { useState, useEffect } from 'react';
import { RiderLedgerStatement } from './RiderLedgerStatement';
import { PublicRiderStatement, Rider } from '../types';
import { fetchPublicRiderStatement } from '../services/firestoreSync';
import { loadRidersFromStorage, loadDeliveriesFromStorage, loadSettlementsFromStorage } from '../utils/storage';
import { Receipt, RefreshCw, WifiOff } from 'lucide-react';

interface PublicRiderLedgerProps {
  riderId: string;
}

/**
 * PublicRiderLedger
 * 
 * Completely isolated public view for riders and third parties:
 * - NO Firebase Auth login required
 * - NO App Header (Courier Payout Pro)
 * - NO navigation bars, tabs, PWA buttons, or sync menus
 * - Standalone Khatabook-style ledger statement
 * - Fetches profile, advances, and delivery payouts from Firestore
 * - Safe state initialization for all arrays ([])
 * - Resilient fallback UI with animated loading skeleton ("विवरण लोड हो रहा है...")
 * - Bulletproof against Firestore auth permissions & offline unavailability
 */
export const PublicRiderLedger: React.FC<PublicRiderLedgerProps> = ({ riderId }) => {
  const cleanId = decodeURIComponent(riderId || '').trim();

  // 1. Safe instant local-cache fallback if opened in same device/browser
  const cachedSnapshot = React.useMemo<PublicRiderStatement | null>(() => {
    try {
      const cachedRiders = loadRidersFromStorage();
      const localRider = (cachedRiders || []).find((r) => r && (r.id === riderId || r.id === cleanId));
      if (localRider) {
        const cachedDeliveries = loadDeliveriesFromStorage(cachedRiders);
        const cachedSettlements = loadSettlementsFromStorage();
        return {
          riderId: localRider.id || cleanId,
          riderName: localRider.name || 'कूरियर डिलीवरी राइडर',
          riderPhone: localRider.phone || '',
          vehicleType: localRider.vehicleType || 'Hero Splendor (Bike)',
          hubName: 'सरायकेला कूरियर डिलीवरी हब',
          hubSignature: 'सरायकेला कूरियर डिलीवरी हब',
          totalAdvance: typeof localRider.totalAdvance === 'number' ? localRider.totalAdvance : 0,
          advances: Array.isArray(localRider.advances) ? localRider.advances : [],
          salaries: (cachedSettlements || [])
            .filter((s) => s && s.riderId === localRider.id)
            .map((s) => ({
              id: s.id,
              startDate: s.startDate,
              endDate: s.endDate,
              totalParcels: s.totalParcels || 0,
              baseAmount: s.baseAmount || 0,
              incentiveAmount: s.incentiveAmount || 0,
              grossTotal: s.grossTotal || 0,
              advanceAmount: s.advanceAmount || 0,
              netTotal: s.netTotal || 0,
              paidAt: s.paidAt,
              status: s.status || 'PAID',
            })),
          recentDeliveries: (cachedDeliveries || [])
            .filter((e) => e && e.riderId === localRider.id)
            .slice(0, 50)
            .map((e) => ({
              id: e.id,
              date: e.date,
              parcels: e.parcels || 0,
              totalEarnings: e.totalEarnings || 0,
              status: e.status || 'Verified',
            })),
          updatedAt: new Date().toISOString(),
        };
      }
    } catch (e) {
      console.warn('Local storage snapshot fallback exception:', e);
    }
    return null;
  }, [cleanId, riderId]);

  // Safe fallback statement if Firestore is restricted, offline, or returns empty
  const defaultFallbackStatement: PublicRiderStatement = React.useMemo(() => ({
    riderId: cleanId,
    riderName: cachedSnapshot?.riderName || `राइडर (${cleanId})`,
    riderPhone: cachedSnapshot?.riderPhone || '',
    vehicleType: cachedSnapshot?.vehicleType || 'Hero Splendor (Bike)',
    hubName: 'सरायकेला कूरियर डिलीवरी हब',
    hubSignature: 'सरायकेला कूरियर डिलीवरी हब',
    totalAdvance: cachedSnapshot?.totalAdvance || 0,
    advances: cachedSnapshot?.advances || [],
    salaries: cachedSnapshot?.salaries || [],
    recentDeliveries: cachedSnapshot?.recentDeliveries || [],
    updatedAt: new Date().toISOString(),
  }), [cleanId, cachedSnapshot]);

  const [statement, setStatement] = useState<PublicRiderStatement>(
    cachedSnapshot || defaultFallbackStatement
  );
  const [loading, setLoading] = useState<boolean>(!cachedSnapshot);
  const [isOfflineMode, setIsOfflineMode] = useState<boolean>(false);

  useEffect(() => {
    let isMounted = true;

    async function loadStatement() {
      if (!cleanId) {
        if (isMounted) setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const data = await fetchPublicRiderStatement(cleanId);
        if (isMounted) {
          if (data) {
            // Guarantee all arrays are non-null and safely initialized
            setStatement({
              riderId: data.riderId || cleanId,
              riderName: data.riderName || 'राइडर',
              riderPhone: data.riderPhone || '',
              vehicleType: data.vehicleType || 'Hero Splendor (Bike)',
              hubName: data.hubName || 'सरायकेला कूरियर डिलीवरी हब',
              hubSignature: data.hubSignature || 'सरायकेला कूरियर डिलीवरी हब',
              totalAdvance: typeof data.totalAdvance === 'number' ? data.totalAdvance : 0,
              advances: Array.isArray(data.advances) ? data.advances : [],
              salaries: Array.isArray(data.salaries) ? data.salaries : [],
              recentDeliveries: Array.isArray(data.recentDeliveries) ? data.recentDeliveries : [],
              updatedAt: data.updatedAt || new Date().toISOString(),
            });
            setIsOfflineMode(false);
          } else {
            // Keep default fallback statement
            setStatement((prev) => prev || defaultFallbackStatement);
          }
        }
      } catch (err) {
        console.warn('Public statement fetch notice (switched to styled offline statement):', err);
        if (isMounted) {
          setIsOfflineMode(true);
          setStatement((prev) => prev || defaultFallbackStatement);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    loadStatement();

    return () => {
      isMounted = false;
    };
  }, [cleanId, defaultFallbackStatement]);

  // Loading Skeleton UI ("विवरण लोड हो रहा है...")
  if (loading && !statement.riderName) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-2xl space-y-6 animate-pulse">
          {/* Header skeleton */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center text-emerald-400">
                <Receipt className="w-5 h-5 animate-pulse" />
              </div>
              <div className="space-y-1.5">
                <div className="h-4 w-40 bg-slate-800 rounded"></div>
                <div className="h-3 w-28 bg-slate-800/60 rounded"></div>
              </div>
            </div>
            <div className="h-8 w-24 bg-slate-800 rounded-lg"></div>
          </div>

          {/* Balance card skeleton */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="h-24 bg-slate-900 border border-slate-800 rounded-2xl p-4"></div>
            <div className="h-24 bg-slate-900 border border-slate-800 rounded-2xl p-4"></div>
            <div className="h-24 bg-slate-900 border border-slate-800 rounded-2xl p-4"></div>
          </div>

          {/* Central loading prompt */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center space-y-3">
            <RefreshCw className="w-8 h-8 text-emerald-400 animate-spin mx-auto" />
            <h2 className="text-lg font-bold text-white">विवरण लोड हो रहा है...</h2>
            <p className="text-slate-400 text-sm">
              खाता लेजर व लेन-देन का विवरण सुरक्षित लोड किया जा रहा है।
            </p>
          </div>

          {/* Table rows skeleton */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
            <div className="h-10 bg-slate-800/70 rounded-xl"></div>
            <div className="h-12 bg-slate-800/40 rounded-xl"></div>
            <div className="h-12 bg-slate-800/40 rounded-xl"></div>
            <div className="h-12 bg-slate-800/40 rounded-xl"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-slate-950">
      {isOfflineMode && (
        <div className="bg-amber-950/80 border-b border-amber-800/50 text-amber-200 text-xs px-4 py-2 flex items-center justify-between print:hidden">
          <div className="flex items-center gap-2">
            <WifiOff className="w-3.5 h-3.5 text-amber-400" />
            <span>ऑफ़लाइन / कैश्ड विवरण प्रदर्शित है। नवीनतम स्थिति देखने के लिए रीफ़्रेश करें।</span>
          </div>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="underline font-semibold hover:text-white cursor-pointer ml-3"
          >
            पुनः रीफ़्रेश करें
          </button>
        </div>
      )}

      <RiderLedgerStatement
        riderId={cleanId}
        initialStatement={statement}
        // Strictly NO onBackToApp to isolate from the hub management dashboard
      />
    </div>
  );
};

export default PublicRiderLedger;
