import React from 'react';
import { 
  CreditCard, 
  Clock, 
  Sparkles
} from 'lucide-react';
import { UserSubscription, checkSubscriptionLock } from '../types';

interface SubscriptionAlertBannerProps {
  userSubscription?: UserSubscription;
  userId?: string;
  userEmail?: string | null;
  masterQrCodeUrl?: string;
  isSuperAdmin?: boolean;
  onSubscriptionUpdated?: (updated: UserSubscription) => void;
  onOpenPayModal?: () => void;
}

export const SubscriptionAlertBanner: React.FC<SubscriptionAlertBannerProps> = ({
  userSubscription,
  isSuperAdmin = false,
  onOpenPayModal,
}) => {
  // Super admin never sees subscription alert banners
  if (isSuperAdmin || !userSubscription) {
    return null;
  }

  // Check strict lock: when locked, the hard lockout modal takes over the entire viewport
  const lockStatus = checkSubscriptionLock(userSubscription, isSuperAdmin);
  if (lockStatus.isLocked) {
    return null;
  }

  const { planType, validUntil, monthlyFee = 499, freeUntilDate } = userSubscription;

  // Format Hindi date
  const formatHindiDate = (isoStr?: string) => {
    if (!isoStr) return 'शीघ्र';
    try {
      const d = new Date(isoStr);
      if (isNaN(d.getTime())) return isoStr;
      return d.toLocaleDateString('hi-IN', { day: 'numeric', month: 'long', year: 'numeric' });
    } catch {
      return isoStr;
    }
  };

  // Case 1: Active Paid Plan - Check if expiring within 2 days
  if (planType === 'paid' && validUntil) {
    const diffMs = new Date(validUntil).getTime() - Date.now();
    const daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    if (daysRemaining > 0 && daysRemaining <= 2) {
      const formattedHindi = formatHindiDate(validUntil);
      return (
        <div 
          id="subscription-banner-expiring"
          className="bg-amber-950/90 border-b border-amber-800 px-4 py-2.5 text-xs text-amber-100 flex items-center justify-between gap-3 shadow-md animate-in fade-in"
        >
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              <strong>आपका सब्सक्रिप्शन {formattedHindi} को समाप्त हो रहा है।</strong> ({daysRemaining === 1 ? '1 दिन शेष' : `${daysRemaining} दिन शेष`} • मासिक शुल्क: ₹{monthlyFee})
            </span>
          </div>
          <button
            type="button"
            id="subscription-renew-now-btn"
            onClick={onOpenPayModal}
            className="px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs shadow transition shrink-0 cursor-pointer flex items-center gap-1.5 active:scale-95"
          >
            <CreditCard className="w-3.5 h-3.5" />
            <span>Renew Now</span>
          </button>
        </div>
      );
    }
  }

  // Case 2: Free Trial expiring within 2 days
  if (planType === 'free' && freeUntilDate && freeUntilDate.trim().length > 0) {
    const freeUntilTime = freeUntilDate.length === 10
      ? new Date(`${freeUntilDate}T23:59:59.999Z`).getTime()
      : new Date(freeUntilDate).getTime();
    const diffMs = freeUntilTime - Date.now();
    const daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    if (daysRemaining > 0 && daysRemaining <= 3) {
      const formattedHindi = formatHindiDate(freeUntilDate);
      return (
        <div 
          id="subscription-banner-free-trial"
          className="bg-indigo-950/90 border-b border-indigo-800 px-4 py-2 text-xs text-indigo-100 flex items-center justify-between gap-3 shadow-md"
        >
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-indigo-400 shrink-0" />
            <span>
              <strong>निःशुल्क परीक्षण:</strong> आपका फ्री ट्रायल {formattedHindi} तक सक्रिय है ({daysRemaining} दिन शेष)।
            </span>
          </div>
        </div>
      );
    }
  }

  return null;
};
