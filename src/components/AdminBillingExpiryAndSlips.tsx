import React, { useState, useMemo } from 'react';
import { 
  AlertTriangle, 
  Clock, 
  CheckCircle2, 
  Receipt, 
  Calendar, 
  CreditCard, 
  ExternalLink, 
  Eye, 
  Check, 
  X, 
  RefreshCw, 
  Copy, 
  QrCode, 
  ArrowRight,
  ShieldCheck,
  FileText
} from 'lucide-react';
import { AppUser } from '../types';

interface AdminBillingExpiryAndSlipsProps {
  users: AppUser[];
  onApproveSlip: (user: AppUser) => Promise<void>;
  onRejectSlip: (user: AppUser) => Promise<void>;
  onExtendDays: (user: AppUser, days?: number) => Promise<void>;
  onOpenQrModal: (user: AppUser) => void;
  onOpenSlipReviewModal: (user: AppUser) => void;
  onManageUser: (user: AppUser) => void;
  actionLoadingId: string | null;
}

export const AdminBillingExpiryAndSlips: React.FC<AdminBillingExpiryAndSlipsProps> = ({
  users,
  onApproveSlip,
  onRejectSlip,
  onExtendDays,
  onOpenQrModal,
  onOpenSlipReviewModal,
  onManageUser,
  actionLoadingId,
}) => {
  const [copiedText, setCopiedText] = useState<string | null>(null);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(id);
    setTimeout(() => setCopiedText(null), 2000);
  };

  // 1. Calculate 48-Hour Expiry Users (Paid plans expiring within the next 48h or expired within last 24h)
  const expiring48hUsers = useMemo(() => {
    const now = Date.now();
    const threshold48h = 48 * 60 * 60 * 1000;

    return users.filter((u) => {
      const sub = u.subscription;
      if (!sub || sub.planType !== 'paid' || !sub.validUntil) return false;
      const expiryTime = new Date(sub.validUntil).getTime();
      if (isNaN(expiryTime)) return false;
      const diff = expiryTime - now;
      // Expires within next 48 hours OR expired today (within last 24 hours)
      return diff <= threshold48h && diff >= -24 * 60 * 60 * 1000;
    }).sort((a, b) => {
      const timeA = new Date(a.subscription!.validUntil).getTime();
      const timeB = new Date(b.subscription!.validUntil).getTime();
      return timeA - timeB;
    });
  }, [users]);

  // 2. Calculate Pending Slips (where paymentStatus === 'verification_pending')
  const pendingSlipUsers = useMemo(() => {
    return users.filter((u) => {
      const sub = u.subscription;
      if (!sub) return false;
      return sub.paymentStatus === 'verification_pending' || 
        (Boolean(sub.lastSubmittedSlip) && sub.paymentStatus !== 'active' && sub.planType === 'paid');
    }).sort((a, b) => {
      const timeA = a.subscription?.lastSubmittedSlip?.submittedAt 
        ? new Date(a.subscription.lastSubmittedSlip.submittedAt).getTime() 
        : 0;
      const timeB = b.subscription?.lastSubmittedSlip?.submittedAt 
        ? new Date(b.subscription.lastSubmittedSlip.submittedAt).getTime() 
        : 0;
      return timeB - timeA; // newest submissions first
    });
  }, [users]);

  const formatTimeRemaining = (validUntil: string) => {
    const now = Date.now();
    const diff = new Date(validUntil).getTime() - now;
    if (diff < 0) {
      if (diff > -24 * 3600 * 1000) return { label: 'Expired Today', isUrgent: true };
      const daysAgo = Math.abs(Math.round(diff / (24 * 3600 * 1000)));
      return { label: `Expired ${daysAgo}d ago`, isUrgent: true };
    }
    const hours = Math.round(diff / (3600 * 1000));
    if (hours <= 1) {
      const mins = Math.max(1, Math.round(diff / (60 * 1000)));
      return { label: `Expires in ${mins}m`, isUrgent: true };
    }
    if (hours <= 24) {
      return { label: `Expires in ${hours}h`, isUrgent: true };
    }
    const days = Math.ceil(hours / 24);
    return { label: `Expires in ${days} day${days > 1 ? 's' : ''}`, isUrgent: false };
  };

  return (
    <div className="space-y-5">
      {/* ========================================================================= */}
      {/* SECTION 1: 48-HOUR EXPIRY ALERT CARD                                       */}
      {/* ========================================================================= */}
      <div 
        id="admin-billing-48h-alert-card"
        className={`rounded-2xl border transition-all shadow-md overflow-hidden ${
          expiring48hUsers.length > 0
            ? 'bg-amber-950/20 border-amber-500/40 shadow-amber-950/20'
            : 'bg-slate-900/80 border-slate-800'
        }`}
      >
        <div className="p-4 sm:p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 border-b border-amber-500/20">
          <div className="flex items-start gap-3">
            <div className={`p-2.5 rounded-xl shrink-0 ${
              expiring48hUsers.length > 0 
                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' 
                : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
            }`}>
              {expiring48hUsers.length > 0 ? (
                <AlertTriangle className="w-5 h-5 animate-pulse" />
              ) : (
                <ShieldCheck className="w-5 h-5" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                  <span>48-Hour Subscription Expiry Alert</span>
                  {expiring48hUsers.length > 0 && (
                    <span className="px-2 py-0.5 rounded-full text-xs font-extrabold bg-amber-500 text-slate-950 shadow-sm animate-pulse">
                      {expiring48hUsers.length} DUE
                    </span>
                  )}
                </h3>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                {expiring48hUsers.length > 0
                  ? 'Paid tenant subscriptions expiring within the next 48 hours. Verify their renewal readiness or extend validity.'
                  : 'All active paid subscriptions have more than 48 hours of validity remaining.'}
              </p>
            </div>
          </div>

          {expiring48hUsers.length > 0 && (
            <div className="text-xs text-amber-300 font-semibold flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-950/50 border border-amber-800/50 shrink-0">
              <Clock className="w-3.5 h-3.5 text-amber-400" />
              <span>{expiring48hUsers.length} account{expiring48hUsers.length !== 1 ? 's' : ''} expiring in &lt; 48 hrs</span>
            </div>
          )}
        </div>

        {/* Expiring Users List */}
        {expiring48hUsers.length > 0 ? (
          <div className="divide-y divide-amber-500/10">
            {expiring48hUsers.map((user) => {
              const sub = user.subscription!;
              const countdown = formatTimeRemaining(sub.validUntil);
              const isExtending = actionLoadingId === `extend-${user.uid}`;
              const monthlyFee = sub.monthlyFee ?? 499;

              return (
                <div 
                  key={user.uid}
                  className="p-4 sm:px-5 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3 bg-slate-900/40 hover:bg-slate-900/80 transition"
                >
                  {/* User Profile info */}
                  <div className="flex items-center gap-3 min-w-0">
                    {user.photoURL ? (
                      <img
                        src={user.photoURL}
                        alt={user.displayName || user.email}
                        className="w-10 h-10 rounded-full object-cover border border-amber-500/40 shrink-0"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-amber-500/20 text-amber-300 font-bold flex items-center justify-center text-sm border border-amber-500/30 shrink-0">
                        {(user.displayName || user.name || user.email || 'U').charAt(0).toUpperCase()}
                      </div>
                    )}

                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold text-white truncate max-w-[200px]">
                          {user.displayName || user.name || 'Courier Hub Owner'}
                        </span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-extrabold uppercase tracking-wide bg-amber-500/20 text-amber-300 border border-amber-500/30">
                          {countdown.label}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 truncate max-w-[240px]">
                        {user.email}
                      </div>
                      <div className="text-[10px] text-slate-500 font-mono flex items-center gap-1 mt-0.5">
                        <span>Fee: ₹{monthlyFee}/mo</span>
                        <span>•</span>
                        <span>Valid Until: {new Date(sub.validUntil).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                    </div>
                  </div>

                  {/* QR & Quick Action Buttons */}
                  <div className="flex items-center gap-2.5 flex-wrap w-full lg:w-auto justify-end">
                    {/* QR Preview Status */}
                    {sub.qrCodeUrl ? (
                      <button
                        type="button"
                        onClick={() => onOpenQrModal(user)}
                        className="px-2.5 py-1.5 rounded-xl bg-slate-950 hover:bg-slate-800 text-slate-300 text-xs font-medium border border-slate-800 flex items-center gap-1.5 transition cursor-pointer"
                        title="Click to view tenant's active payment QR"
                      >
                        <QrCode className="w-3.5 h-3.5 text-amber-400" />
                        <span>UPI QR Ready</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onManageUser(user)}
                        className="px-2.5 py-1.5 rounded-xl bg-rose-950/40 text-rose-300 hover:bg-rose-900/40 text-xs font-medium border border-rose-800/40 flex items-center gap-1.5 transition cursor-pointer"
                        title="Configure custom payment QR code"
                      >
                        <QrCode className="w-3.5 h-3.5 text-rose-400" />
                        <span>No QR Configured</span>
                      </button>
                    )}

                    {/* 1-Click Extend 30 Days */}
                    <button
                      type="button"
                      disabled={isExtending}
                      onClick={() => onExtendDays(user, 30)}
                      className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-sm shadow-emerald-600/30 cursor-pointer disabled:opacity-50"
                      title="Add 30 days validity immediately"
                    >
                      {isExtending ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Extending...</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>+30 Days Extension</span>
                        </>
                      )}
                    </button>

                    {/* Manage Button */}
                    <button
                      type="button"
                      onClick={() => onManageUser(user)}
                      className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition cursor-pointer"
                    >
                      <span>Manage</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="p-4 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>All paid subscriptions are healthy. None are expiring within the next 48 hours.</span>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* SECTION 2: PENDING PAYMENT SLIPS APPROVAL SECTION                          */}
      {/* ========================================================================= */}
      <div 
        id="admin-billing-pending-slips-section"
        className={`rounded-2xl border transition-all shadow-md overflow-hidden ${
          pendingSlipUsers.length > 0 
            ? 'bg-slate-900 border-blue-500/50 shadow-blue-950/20' 
            : 'bg-slate-900/80 border-slate-800'
        }`}
      >
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between gap-3 bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl shrink-0 ${
              pendingSlipUsers.length > 0 
                ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' 
                : 'bg-slate-800 text-slate-400'
            }`}>
              <Receipt className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm sm:text-base font-bold text-white">
                  Pending Payment Slips Awaiting Approval
                </h3>
                {pendingSlipUsers.length > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-xs font-extrabold bg-blue-600 text-white shadow-sm animate-pulse">
                    {pendingSlipUsers.length} PENDING
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Review submitted UPI payment screenshots, verify UTR reference numbers, and extend valid access with 1 click.
              </p>
            </div>
          </div>

          {pendingSlipUsers.length > 0 && (
            <div className="hidden sm:flex items-center gap-1.5 text-xs text-blue-300 font-semibold px-3 py-1.5 rounded-lg bg-blue-950/50 border border-blue-800/50">
              <Clock className="w-3.5 h-3.5 text-blue-400 animate-pulse" />
              <span>Requires Master Admin Verification</span>
            </div>
          )}
        </div>

        {/* Pending Slips List */}
        {pendingSlipUsers.length > 0 ? (
          <div className="divide-y divide-slate-800">
            {pendingSlipUsers.map((user) => {
              const sub = user.subscription!;
              const slip = sub.lastSubmittedSlip;
              const isApproving = actionLoadingId === `slip-${user.uid}`;
              const isRejecting = actionLoadingId === `slip-reject-${user.uid}`;
              const amount = slip?.amountPaid || sub.monthlyFee || 499;
              const utr = slip?.utrNumber || 'N/A';

              return (
                <div 
                  key={user.uid}
                  className="p-4 sm:p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-slate-900/60 hover:bg-slate-900 transition"
                >
                  {/* Left: User & Slip Details */}
                  <div className="flex items-start gap-3.5 min-w-0 flex-1">
                    {/* Slip Image Thumbnail / Preview Link */}
                    {slip?.slipUrl ? (
                      <div 
                        className="relative group cursor-pointer shrink-0"
                        onClick={() => onOpenSlipReviewModal(user)}
                        title="Click to view full receipt screenshot"
                      >
                        <img
                          src={slip.slipUrl}
                          alt="Payment Receipt Screenshot"
                          referrerPolicy="no-referrer"
                          className="w-16 h-16 sm:w-20 sm:h-20 object-cover rounded-xl border border-slate-700 bg-slate-950 group-hover:border-blue-500 transition shadow"
                        />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 rounded-xl flex items-center justify-center transition">
                          <Eye className="w-5 h-5 text-white" />
                        </div>
                      </div>
                    ) : (
                      <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl bg-slate-950 border border-slate-800 flex flex-col items-center justify-center text-slate-500 text-[10px] shrink-0">
                        <Receipt className="w-6 h-6 mb-1 text-slate-600" />
                        <span>No image</span>
                      </div>
                    )}

                    {/* Metadata */}
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-white truncate">
                          {user.displayName || user.name || 'Tenant User'}
                        </span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-blue-500/20 text-blue-300 border border-blue-500/30">
                          Verification Pending
                        </span>
                      </div>

                      {/* User Email */}
                      <div className="text-xs text-slate-300 flex items-center gap-1.5">
                        <span className="text-slate-400">Email:</span>
                        <span className="font-medium text-white truncate">{user.email}</span>
                      </div>

                      {/* Amount and UTR */}
                      <div className="flex items-center gap-3 flex-wrap text-xs pt-0.5">
                        <div className="flex items-center gap-1">
                          <span className="text-slate-400">Amount:</span>
                          <span className="font-extrabold text-emerald-400 text-sm">₹{amount}</span>
                        </div>

                        <div className="flex items-center gap-1 bg-slate-950 px-2 py-0.5 rounded-lg border border-slate-800">
                          <span className="text-slate-400 text-[11px]">UTR:</span>
                          <span className="font-mono font-bold text-amber-300 text-xs select-all">
                            {utr}
                          </span>
                          {utr !== 'N/A' && (
                            <button
                              type="button"
                              onClick={() => handleCopy(utr, `utr-${user.uid}`)}
                              className="text-slate-400 hover:text-white ml-1 cursor-pointer"
                              title="Copy UTR Reference Number"
                            >
                              {copiedText === `utr-${user.uid}` ? (
                                <Check className="w-3 h-3 text-emerald-400" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                            </button>
                          )}
                        </div>

                        {slip?.submittedAt && (
                          <div className="text-[11px] text-slate-500">
                            Submitted: {new Date(slip.submittedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                          </div>
                        )}
                      </div>

                      {/* Full receipt preview trigger */}
                      {slip?.slipUrl && (
                        <div className="pt-1">
                          <button
                            type="button"
                            onClick={() => onOpenSlipReviewModal(user)}
                            className="text-[11px] text-blue-400 hover:text-blue-300 underline flex items-center gap-1 cursor-pointer"
                          >
                            <ExternalLink className="w-3 h-3" />
                            <span>View Full Receipt Screenshot</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right: Actions */}
                  <div className="flex items-center gap-2 sm:gap-2.5 w-full md:w-auto justify-end pt-2 md:pt-0 border-t md:border-t-0 border-slate-800">
                    {/* Reject Button */}
                    <button
                      type="button"
                      disabled={isRejecting || isApproving}
                      onClick={() => onRejectSlip(user)}
                      className="px-3 py-2 rounded-xl bg-rose-950/40 hover:bg-rose-900/40 text-rose-300 border border-rose-800/40 text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      title="Reject payment slip and mark expired"
                    >
                      {isRejecting ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <X className="w-3.5 h-3.5 text-rose-400" />
                      )}
                      <span>Reject</span>
                    </button>

                    {/* 1-Click Approve & Extend by 30 Days */}
                    <button
                      type="button"
                      disabled={isApproving || isRejecting}
                      onClick={() => onApproveSlip(user)}
                      className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition flex items-center gap-2 shadow-md shadow-emerald-600/30 cursor-pointer disabled:opacity-50"
                      title="Approve slip, add 30 days validity, and mark plan active"
                    >
                      {isApproving ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Approving...</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-4 h-4 text-emerald-200" />
                          <span>Approve & Extend by 30 Days</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="p-6 text-center space-y-1">
            <CheckCircle2 className="w-7 h-7 text-emerald-400 mx-auto mb-2" />
            <div className="text-xs font-bold text-white">No Pending Payment Slips</div>
            <p className="text-[11px] text-slate-400">
              All submitted payment slips have been verified. Any new tenant slip submissions will automatically appear here for 1-click approval.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
