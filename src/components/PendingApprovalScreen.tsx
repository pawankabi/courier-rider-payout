import React, { useState } from 'react';
import { 
  Clock, 
  ShieldAlert, 
  Mail, 
  LogOut, 
  RefreshCw, 
  CheckCircle2, 
  User, 
  Sparkles,
  ExternalLink
} from 'lucide-react';
import { SUPER_ADMIN_EMAIL } from '../services/firestoreSync';

interface PendingApprovalScreenProps {
  userEmail?: string | null;
  userName?: string | null;
  createdAt?: string | null;
  onSignOut: () => void;
  onRefreshStatus?: () => Promise<void> | void;
}

export const PendingApprovalScreen: React.FC<PendingApprovalScreenProps> = ({
  userEmail,
  userName,
  createdAt,
  onSignOut,
  onRefreshStatus,
}) => {
  const [isChecking, setIsChecking] = useState(false);
  const [checkedMessage, setCheckedMessage] = useState<string | null>(null);

  const handleManualCheck = async () => {
    setIsChecking(true);
    setCheckedMessage(null);
    try {
      if (onRefreshStatus) {
        await onRefreshStatus();
      } else {
        await new Promise((resolve) => setTimeout(resolve, 800));
      }
      setCheckedMessage('Real-time listener is active. As soon as the Admin approves, your screen will unlock automatically.');
    } catch {
      setCheckedMessage('Status checked. Still pending approval by the Admin.');
    } finally {
      setIsChecking(false);
      setTimeout(() => setCheckedMessage(null), 5000);
    }
  };

  const formattedDate = createdAt
    ? new Date(createdAt).toLocaleString('en-IN', {
        dateStyle: 'medium',
        timeStyle: 'short',
      })
    : new Date().toLocaleString('en-IN', {
        dateStyle: 'medium',
        timeStyle: 'short',
      });

  return (
    <div className="min-h-[80vh] flex items-center justify-center p-4">
      <div 
        id="pending-approval-card"
        className="max-w-lg w-full bg-slate-900 border border-amber-500/30 rounded-2xl p-6 sm:p-8 shadow-2xl shadow-amber-950/20 text-center relative overflow-hidden animate-in fade-in zoom-in-95 duration-200"
      >
        {/* Subtle accent glow in background */}
        <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-64 h-64 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Status Icon */}
        <div className="mx-auto w-16 h-16 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 mb-5 shadow-lg relative">
          <Clock className="w-8 h-8 animate-pulse" />
          <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-amber-400 rounded-full ring-4 ring-slate-900 animate-ping" />
        </div>

        {/* Main Status Badge */}
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-amber-500/15 text-amber-300 border border-amber-500/30 mb-3">
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
          Access Request Pending Approval
        </div>

        {/* Required Message */}
        <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
          App Access Restricted
        </h1>
        <p className="text-sm text-amber-300 font-semibold mt-1.5">
          Your access request has been sent to the Master Admin.
        </p>
        <p className="text-xs text-slate-300 mt-2 font-medium">
          Please wait until your account is approved. Once approved by {SUPER_ADMIN_EMAIL}, this screen will unlock automatically in real-time.
        </p>

        {/* Explanatory note */}
        <p className="text-xs text-slate-400 mt-2 max-w-md mx-auto leading-relaxed">
          For security and data isolation, new courier rider accounts require 
          Master Admin verification before full access to daily entries, rider directories, 
          and payment settlements is granted.
        </p>

        {/* User Request Details Box */}
        <div className="mt-6 bg-slate-950/80 border border-slate-800 rounded-xl p-4 text-left space-y-2.5">
          <div className="flex items-center justify-between text-xs border-b border-slate-800/80 pb-2">
            <span className="text-slate-400 flex items-center gap-1.5 font-medium">
              <User className="w-3.5 h-3.5 text-blue-400" />
              Requester Name:
            </span>
            <span className="text-white font-bold truncate max-w-[200px]">
              {userName || 'New User'}
            </span>
          </div>

          <div className="flex items-center justify-between text-xs border-b border-slate-800/80 pb-2">
            <span className="text-slate-400 flex items-center gap-1.5 font-medium">
              <Mail className="w-3.5 h-3.5 text-blue-400" />
              Signed In Email:
            </span>
            <span className="text-slate-200 font-mono font-medium truncate max-w-[220px]" title={userEmail || ''}>
              {userEmail || 'Unknown Email'}
            </span>
          </div>

          <div className="flex items-center justify-between text-xs border-b border-slate-800/80 pb-2">
            <span className="text-slate-400 flex items-center gap-1.5 font-medium">
              <Clock className="w-3.5 h-3.5 text-amber-400" />
              Request Submitted:
            </span>
            <span className="text-slate-300 font-medium">
              {formattedDate}
            </span>
          </div>

          <div className="flex items-center justify-between text-xs pt-0.5">
            <span className="text-slate-400 flex items-center gap-1.5 font-medium">
              <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
              Real-Time Sync:
            </span>
            <span className="text-emerald-400 font-bold flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Listening for Admin Approval
            </span>
          </div>
        </div>

        {/* Feedback notification if refreshed */}
        {checkedMessage && (
          <div className="mt-3 p-2.5 rounded-lg bg-blue-950/60 border border-blue-800 text-blue-200 text-xs flex items-center justify-center gap-2 animate-in fade-in">
            <CheckCircle2 className="w-3.5 h-3.5 text-blue-400 shrink-0" />
            <span>{checkedMessage}</span>
          </div>
        )}

        {/* Action Buttons */}
        <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
          <button
            id="refresh-approval-status-btn"
            type="button"
            onClick={handleManualCheck}
            disabled={isChecking}
            className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-lg shadow-blue-600/20 flex items-center justify-center gap-2 transition active:scale-95 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isChecking ? 'animate-spin' : ''}`} />
            <span>{isChecking ? 'Checking...' : 'Check Status Now'}</span>
          </button>

          <a
            id="contact-admin-btn"
            href={`mailto:${SUPER_ADMIN_EMAIL}?subject=Access%20Request%20Approval%20for%20${encodeURIComponent(userEmail || '')}&body=Hello%20Admin,%0A%0AI%20have%20registered%20for%20the%20Courier%20Rider%20Payout%20Manager%20with%20email:%20${encodeURIComponent(userEmail || '')}.%0APlease%20approve%20my%20access%20request.%0A%0AThank%20you.`}
            className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-200 font-semibold text-xs border border-slate-700 flex items-center justify-center gap-2 transition"
          >
            <Mail className="w-3.5 h-3.5 text-slate-400" />
            <span>Contact Admin</span>
            <ExternalLink className="w-3 h-3 text-slate-500" />
          </a>

          <button
            id="sign-out-pending-btn"
            type="button"
            onClick={onSignOut}
            className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-rose-950/40 text-slate-300 hover:text-rose-300 font-semibold text-xs border border-slate-750 hover:border-rose-800/60 flex items-center justify-center gap-2 transition"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </div>

        <div className="mt-5 text-[11px] text-slate-500">
          Master Administrator: <span className="font-mono text-slate-400">{SUPER_ADMIN_EMAIL}</span>
        </div>
      </div>
    </div>
  );
};
