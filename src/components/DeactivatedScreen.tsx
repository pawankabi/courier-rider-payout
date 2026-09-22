import React, { useState } from 'react';
import { ShieldAlert, Mail, LogOut, Copy, Check, HelpCircle } from 'lucide-react';
import { auth } from '../firebase';
import { SUPER_ADMIN_EMAIL } from '../services/firestoreSync';

interface DeactivatedScreenProps {
  userEmail?: string | null;
  userId?: string;
}

export const DeactivatedScreen: React.FC<DeactivatedScreenProps> = ({ userEmail, userId }) => {
  const [copied, setCopied] = useState(false);

  const handleCopyEmail = () => {
    navigator.clipboard.writeText(SUPER_ADMIN_EMAIL);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleSignOut = async () => {
    try {
      await auth.signOut();
    } catch (err) {
      console.error('Error signing out:', err);
    }
  };

  return (
    <div id="deactivated-screen-container" className="min-h-screen bg-slate-950 flex items-center justify-center p-4 text-slate-100 selection:bg-rose-500 selection:text-white">
      {/* Subtle background glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-96 h-96 bg-rose-900/20 rounded-full blur-3xl" />
        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 w-80 h-80 bg-amber-900/15 rounded-full blur-3xl" />
      </div>

      <div id="deactivated-card" className="relative z-10 w-full max-w-md bg-slate-900 border border-slate-800/80 rounded-2xl shadow-2xl p-6 sm:p-8 text-center">
        {/* Warning Icon Badge */}
        <div className="mx-auto w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 mb-6 shadow-inner">
          <ShieldAlert className="w-8 h-8" />
        </div>

        {/* Main Status Badge */}
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-rose-500/15 text-rose-300 border border-rose-500/30 mb-3">
          <span className="w-2 h-2 rounded-full bg-rose-400" />
          Access Revoked / Blocked
        </div>

        {/* Title */}
        <h1 className="text-2xl font-bold text-white tracking-tight mb-2">
          App Access Restricted
        </h1>

        {/* Explicit Required Message */}
        <div className="bg-rose-950/40 border border-rose-800/40 rounded-xl p-4 mb-6 text-rose-200 text-sm leading-relaxed font-medium">
          Your account has been blocked by the Master Admin. Please contact support ({SUPER_ADMIN_EMAIL}) to request access reinstatement.
        </div>

        {/* User identification info */}
        <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3.5 mb-6 text-left text-xs space-y-1.5">
          <div className="flex justify-between text-slate-400">
            <span>Signed In As:</span>
            <span className="font-mono text-slate-200 font-medium truncate max-w-[200px]">
              {userEmail || 'User'}
            </span>
          </div>
          {userId && (
            <div className="flex justify-between text-slate-500 text-[11px]">
              <span>User ID:</span>
              <span className="font-mono truncate max-w-[180px]">{userId}</span>
            </div>
          )}
        </div>

        {/* Support Contact Box */}
        <div className="bg-slate-800/50 border border-slate-700/60 rounded-xl p-4 mb-6 text-left">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
            <HelpCircle className="w-3.5 h-3.5 text-blue-400" />
            Support Contact
          </div>
          <p className="text-xs text-slate-400 mb-3">
            To appeal this status or reactivate your workspace, contact the master administrator:
          </p>
          <div className="flex items-center justify-between gap-2 bg-slate-900 px-3 py-2 rounded-lg border border-slate-700 text-xs">
            <span className="font-mono text-blue-300 truncate">{SUPER_ADMIN_EMAIL}</span>
            <button
              id="copy-admin-email-btn"
              type="button"
              onClick={handleCopyEmail}
              className="inline-flex items-center gap-1 text-slate-300 hover:text-white px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 transition"
              title="Copy email address"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>
          </div>
        </div>

        {/* Actions */}
        <div className="space-y-2.5">
          <a
            id="mailto-admin-btn"
            href={`mailto:${SUPER_ADMIN_EMAIL}?subject=Account%20Reactivation%20Request%20(${encodeURIComponent(userEmail || '')})`}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium text-sm transition shadow-sm"
          >
            <Mail className="w-4 h-4" />
            <span>Email Admin Support</span>
          </a>

          <button
            id="signout-deactivated-btn"
            type="button"
            onClick={handleSignOut}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-medium text-sm border border-slate-700 transition"
          >
            <LogOut className="w-4 h-4" />
            <span>Sign Out</span>
          </button>
        </div>
      </div>
    </div>
  );
};
