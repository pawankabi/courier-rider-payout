import React from 'react';
import { 
  CreditCard, 
  AlertTriangle,
  Clock, 
  Sparkles
} from 'lucide-react';
import { UserSubscription } from '../types';

interface SubscriptionAlertBannerProps {
  userSubscription?: UserSubscription;
  validUntil?: string;
  userId?: string;
  userEmail?: string | null;
  masterQrCodeUrl?: string;
  isSuperAdmin?: boolean;
  onSubscriptionUpdated?: (updated: UserSubscription) => void;
  onOpenPayModal?: () => void;
}

export const SubscriptionAlertBanner: React.FC<SubscriptionAlertBannerProps> = ({
  userSubscription,
  validUntil: propValidUntil,
  isSuperAdmin = false,
  onOpenPayModal,
}) => {
  // Super admin never sees subscription alert banners
  if (isSuperAdmin) {
    return null;
  }

  const effectiveValidUntil = propValidUntil || userSubscription?.validUntil;
  if (!effectiveValidUntil) {
    return null;
  }

  const now = Date.now();
  const expiryTime = new Date(effectiveValidUntil).getTime();
  if (isNaN(expiryTime)) {
    return null;
  }

  // If user is active (validUntil > now), calculate remaining days:
  const daysLeft = Math.ceil((expiryTime - now) / (1000 * 60 * 60 * 24));

  // If daysLeft <= 3 and daysLeft > 0:
  if (daysLeft <= 3 && daysLeft > 0) {
    const formattedDate = new Date(expiryTime).toLocaleDateString('hi-IN', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });

    return (
      <div 
        id="subscription-banner-expiring-3days"
        className="sticky top-0 z-50 bg-gradient-to-r from-amber-950 via-amber-900 to-amber-950 border-b-2 border-amber-500 px-4 py-2.5 text-xs text-amber-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xl animate-in fade-in"
      >
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-amber-500/20 border border-amber-400/40 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-4 h-4 text-amber-400 animate-bounce" />
          </div>
          <span className="leading-snug">
            <strong>⚠️ आपकी सदस्यता की वैधता केवल {daysLeft} दिन में समाप्त हो रही है ({formattedDate})। निर्बाध सेवा के लिए कृपया समय पर नवीनीकरण करें।</strong>
          </span>
        </div>

        <button
          type="button"
          id="subscription-renew-now-btn"
          onClick={onOpenPayModal}
          className="px-4 py-1.5 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 font-black text-xs shadow-md shadow-amber-500/20 transition shrink-0 cursor-pointer flex items-center gap-1.5 active:scale-95 self-end sm:self-center"
        >
          <CreditCard className="w-3.5 h-3.5" />
          <span>अभी रिन्यू करें / Pay Now</span>
        </button>
      </div>
    );
  }

  // Free trial notice if free plan has freeUntilDate within 3 days
  if (userSubscription?.planType === 'free' && userSubscription.freeUntilDate) {
    const freeUntilTime = userSubscription.freeUntilDate.length === 10
      ? new Date(`${userSubscription.freeUntilDate}T23:59:59.999Z`).getTime()
      : new Date(userSubscription.freeUntilDate).getTime();
    const trialDaysLeft = Math.ceil((freeUntilTime - now) / (1000 * 60 * 60 * 24));

    if (trialDaysLeft <= 3 && trialDaysLeft > 0) {
      const formattedDate = new Date(freeUntilTime).toLocaleDateString('hi-IN');
      return (
        <div 
          id="subscription-banner-free-trial"
          className="sticky top-0 z-50 bg-indigo-950/90 border-b border-indigo-800 px-4 py-2 text-xs text-indigo-100 flex items-center justify-between gap-3 shadow-md"
        >
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-indigo-400 shrink-0" />
            <span>
              <strong>निःशुल्क परीक्षण:</strong> आपका फ्री ट्रायल {formattedDate} तक सक्रिय है ({trialDaysLeft} दिन शेष)।
            </span>
          </div>
          <button
            type="button"
            onClick={onOpenPayModal}
            className="px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs"
          >
            अभी रिन्यू करें / Pay Now
          </button>
        </div>
      );
    }
  }

  return null;
};
