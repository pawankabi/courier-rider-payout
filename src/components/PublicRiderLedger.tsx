import React, { useState, useEffect } from 'react';
import { RiderLedgerStatement } from './RiderLedgerStatement';
import { PublicRiderStatement } from '../types';
import { fetchPublicRiderStatement } from '../services/firestoreSync';
import { loadRidersFromStorage, loadDeliveriesFromStorage, loadSettlementsFromStorage } from '../utils/storage';

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
 * - Print / PDF and Excel CSV options
 */
export const PublicRiderLedger: React.FC<PublicRiderLedgerProps> = ({ riderId }) => {
  const cleanId = decodeURIComponent(riderId || '').trim();

  // Instant local-cache fallback if opened in same device
  const initialStatement = React.useMemo<PublicRiderStatement | null>(() => {
    try {
      const cachedRiders = loadRidersFromStorage();
      const localRider = cachedRiders.find((r) => r.id === riderId || r.id === cleanId);
      if (localRider) {
        const cachedDeliveries = loadDeliveriesFromStorage(cachedRiders);
        const cachedSettlements = loadSettlementsFromStorage();
        return {
          riderId: localRider.id,
          riderName: localRider.name,
          riderPhone: localRider.phone,
          vehicleType: localRider.vehicleType,
          hubName: 'सरायकेला कूरियर डिलीवरी हब',
          totalAdvance: typeof localRider.totalAdvance === 'number' ? localRider.totalAdvance : 0,
          advances: localRider.advances || [],
          salaries: cachedSettlements
            .filter((s) => s.riderId === localRider.id)
            .map((s) => ({
              id: s.id,
              startDate: s.startDate,
              endDate: s.endDate,
              totalParcels: s.totalParcels,
              baseAmount: s.baseAmount,
              incentiveAmount: s.incentiveAmount,
              grossTotal: s.grossTotal,
              advanceAmount: s.advanceAmount || 0,
              netTotal: s.netTotal,
              paidAt: s.paidAt,
              status: s.status || 'PAID',
            })),
          recentDeliveries: cachedDeliveries
            .filter((e) => e.riderId === localRider.id)
            .slice(0, 50)
            .map((e) => ({
              id: e.id,
              date: e.date,
              parcels: e.parcels,
              totalEarnings: e.totalEarnings,
              status: e.status,
            })),
          updatedAt: new Date().toISOString(),
        };
      }
    } catch {}
    return null;
  }, [cleanId, riderId]);

  return (
    <RiderLedgerStatement
      riderId={cleanId}
      initialStatement={initialStatement}
      // Strictly NO onBackToApp to isolate from the hub management dashboard
    />
  );
};

export default PublicRiderLedger;
