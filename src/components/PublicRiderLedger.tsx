import React from 'react';
import { RiderLedgerStatement } from './RiderLedgerStatement';

export interface PublicRiderLedgerProps {
  riderId: string;
}

/**
 * PublicRiderLedger
 * 
 * Clean 100% Read-Only Khatabook Ledger Statement for Riders:
 * Strictly delegates to RiderLedgerStatement with isAdmin={false}
 * - Admin delete buttons / actions are strictly hidden
 * - Account reset button is strictly hidden
 * - Header shows Rider Name, Phone, and Net Balance (⚪ हिसाब चुकता: ₹0 / लेना बाकी / देना बाकी)
 * - Clean Khatabook columns: तारीख व विवरण, आपने दिया, बना / मिला
 * - Grand Totals and Net Status at the bottom
 * - Download PDF / Print & WhatsApp share
 */
export const PublicRiderLedger: React.FC<PublicRiderLedgerProps> = ({ riderId }) => {
  return <RiderLedgerStatement riderId={riderId} isAdmin={false} />;
};

export default PublicRiderLedger;
