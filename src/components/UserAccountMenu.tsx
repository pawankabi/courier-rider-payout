import React, { useState, useRef, useEffect } from 'react';
import { 
  User as FirebaseUser, 
  signOut 
} from 'firebase/auth';
import { 
  Cloud, 
  CloudOff, 
  CheckCircle2, 
  RefreshCw, 
  LogOut, 
  LogIn, 
  User as UserIcon,
  Shield,
  Smartphone,
  ChevronDown,
  Download,
  CloudDownload,
  CreditCard
} from 'lucide-react';
import { auth } from '../firebase';

interface Props {
  user: FirebaseUser | null;
  syncStatus: 'synced' | 'syncing' | 'offline' | 'local';
  onOpenAuth: (mode?: 'signin' | 'signup') => void;
  onDownloadBackup?: () => void;
  onOpenSyncOldApp?: () => void;
  onOpenSubscription?: () => void;
}

export const UserAccountMenu: React.FC<Props> = ({ 
  user, 
  syncStatus, 
  onOpenAuth, 
  onDownloadBackup, 
  onOpenSyncOldApp,
  onOpenSubscription
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSignOut = async () => {
    setIsOpen(false);
    try {
      await signOut(auth);
    } catch (err) {
      console.error('Error signing out', err);
    }
  };

  if (!user) {
    return (
      <div className="flex items-center gap-2">
        <button
          id="header-sign-in-btn"
          onClick={() => onOpenAuth('signin')}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-md shadow-blue-600/20 active:scale-95 transition"
        >
          <LogIn className="w-3.5 h-3.5" />
          <span>Sign In / Sync</span>
        </button>
      </div>
    );
  }

  const initial = user.displayName
    ? user.displayName.charAt(0).toUpperCase()
    : user.email
    ? user.email.charAt(0).toUpperCase()
    : 'U';

  return (
    <div className="relative" ref={menuRef}>
      {/* Account trigger pill */}
      <button
        id="user-account-menu-btn"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-750 border border-slate-700 text-xs font-medium text-slate-200 transition"
      >
        {/* Avatar or Initial */}
        {user.photoURL ? (
          <img
            src={user.photoURL}
            alt={user.displayName || 'User'}
            className="w-5 h-5 rounded-full object-cover border border-slate-600"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="w-5 h-5 rounded-full bg-blue-600 text-white font-bold text-[10px] flex items-center justify-center">
            {initial}
          </div>
        )}

        {/* Sync Dot */}
        <div className="flex items-center gap-1.5">
          <span className="hidden sm:inline font-bold text-white max-w-[110px] truncate">
            {user.displayName || user.email?.split('@')[0]}
          </span>
          {syncStatus === 'syncing' ? (
            <RefreshCw className="w-3 h-3 text-amber-400 animate-spin" />
          ) : syncStatus === 'offline' ? (
            <span className="relative flex h-2 w-2" title="Offline cache active">
              <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-400"></span>
            </span>
          ) : (
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
          )}
        </div>

        <ChevronDown className="w-3 h-3 text-slate-400" />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-72 bg-slate-850 border border-slate-750 rounded-2xl shadow-2xl z-50 p-3 space-y-3 animate-fade-in">
          {/* User Info Header */}
          <div className="flex items-center gap-3 pb-3 border-b border-slate-800">
            {user.photoURL ? (
              <img
                src={user.photoURL}
                alt={user.displayName || 'User'}
                className="w-10 h-10 rounded-full object-cover border border-slate-600 shrink-0"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-blue-600 text-white font-bold text-base flex items-center justify-center shrink-0">
                {initial}
              </div>
            )}
            <div className="overflow-hidden">
              <div className="font-bold text-white text-xs truncate">
                {user.displayName || 'Depot Manager'}
              </div>
              <div className="text-[11px] text-slate-400 truncate">
                {user.email}
              </div>
            </div>
          </div>

          {/* Sync Status Info */}
          <div className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800 text-[11px] space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-slate-400 font-semibold flex items-center gap-1.5">
                <Cloud className="w-3.5 h-3.5 text-blue-400" />
                Cloud Firestore Sync:
              </span>
              {syncStatus === 'synced' ? (
                <span className="text-emerald-400 font-bold flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  Live Active
                </span>
              ) : syncStatus === 'syncing' ? (
                <span className="text-amber-400 font-bold flex items-center gap-1">
                  <RefreshCw className="w-3 h-3 animate-spin" />
                  Syncing...
                </span>
              ) : (
                <span className="text-amber-400 font-bold flex items-center gap-1">
                  <CloudOff className="w-3 h-3" />
                  Local Cache Active
                </span>
              )}
            </div>
            <div className="text-slate-400 text-[10px] leading-relaxed flex items-start gap-1.5 pt-1">
              <Smartphone className="w-3 h-3 text-slate-400 shrink-0 mt-0.5" />
              <span>
                {syncStatus === 'offline'
                  ? 'Device is temporarily operating in local offline cache. Changes will automatically sync when network re-establishes.'
                  : 'All riders, daily parcels, and settlement records sync instantly across your phones and laptops.'}
              </span>
            </div>
          </div>

          {/* User Security info */}
          <div className="px-1 text-[10px] text-slate-400 flex items-center gap-1.5">
            <Shield className="w-3 h-3 text-emerald-400 shrink-0" />
            <span>Only you can access this database.</span>
          </div>

          {/* Subscription & Billing action */}
          {onOpenSubscription && (
            <button
              onClick={() => {
                setIsOpen(false);
                onOpenSubscription();
              }}
              className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 text-xs font-semibold shadow-sm transition active:scale-95 cursor-pointer"
            >
              <CreditCard className="w-3.5 h-3.5 text-amber-400" />
              <span>Subscription & Billing</span>
            </button>
          )}

          {/* Sync from Old App URL action */}
          {onOpenSyncOldApp && (
            <button
              onClick={() => {
                setIsOpen(false);
                onOpenSyncOldApp();
              }}
              className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/40 text-xs font-semibold shadow-sm transition active:scale-95 cursor-pointer"
            >
              <CloudDownload className="w-3.5 h-3.5 text-amber-400" />
              <span>Sync from Old App URL</span>
            </button>
          )}

          {/* Download Backup action */}
          {onDownloadBackup && (
            <button
              onClick={() => {
                setIsOpen(false);
                onDownloadBackup();
              }}
              className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 text-xs font-semibold transition"
            >
              <Download className="w-3.5 h-3.5 text-blue-400" />
              <span>Download Backup (.JSON)</span>
            </button>
          )}

          {/* Sign Out Button */}
          <button
            onClick={handleSignOut}
            className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-slate-800 hover:bg-red-500/20 text-slate-300 hover:text-red-300 border border-slate-700 hover:border-red-500/40 text-xs font-semibold transition"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      )}
    </div>
  );
};
