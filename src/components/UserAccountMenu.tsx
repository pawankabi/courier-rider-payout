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
  CreditCard,
  Scale,
  Fingerprint
} from 'lucide-react';
import { auth } from '../firebase';
import { AppLockSettingRow } from './AppLockSettingRow';
import { VerifiedBadge } from './VerifiedBadge';
import { isNativeAndroid } from '../services/nativeSms';

interface Props {
  user: FirebaseUser | null;
  syncStatus: 'synced' | 'syncing' | 'offline' | 'local';
  isProUser?: boolean;
  isVerifiedHub?: boolean;
  hubName?: string;
  onOpenAuth: (mode?: 'signin' | 'signup') => void;
  onDownloadBackup?: () => void;
  onOpenSyncOldApp?: () => void;
  onOpenSubscription?: () => void;
  onEnableCloudBackup?: () => void;
  onOpenLegalPolicies?: () => void;
  onOpenProfileSettings?: () => void;
}

export const UserAccountMenu: React.FC<Props> = ({ 
  user, 
  syncStatus, 
  isProUser = false,
  isVerifiedHub = false,
  hubName,
  onOpenAuth, 
  onDownloadBackup, 
  onOpenSyncOldApp,
  onOpenSubscription,
  onEnableCloudBackup,
  onOpenLegalPolicies,
  onOpenProfileSettings
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

  const initial = user?.displayName
    ? user.displayName.charAt(0).toUpperCase()
    : user?.email
    ? user.email.charAt(0).toUpperCase()
    : 'P';

  return (
    <div className="relative" ref={menuRef}>
      {/* Account trigger: Always a prominent round Profile Avatar Button */}
      <button
        id="user-account-menu-btn"
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 p-1 sm:px-2.5 sm:py-1 rounded-full bg-slate-800 hover:bg-slate-750 border border-slate-700 hover:border-blue-500/50 text-slate-200 transition active:scale-95 shadow-md relative shrink-0 cursor-pointer"
        title="प्रोफाइल एवं अकाउंट सेटिंग्स (Profile & Settings)"
      >
        {/* Circular Avatar / Profile Icon */}
        <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-gradient-to-tr from-blue-600 via-indigo-600 to-cyan-500 flex items-center justify-center text-white font-black text-xs shadow shrink-0 overflow-hidden">
          {user?.photoURL ? (
            <img
              src={user.photoURL}
              alt={user.displayName || 'User'}
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
            />
          ) : user ? (
            initial
          ) : (
            <UserIcon className="w-4 h-4 text-white" />
          )}
        </div>

        {/* User name / label */}
        <span className="hidden sm:inline font-bold text-white text-xs max-w-[105px] truncate">
          {user ? (user.displayName || user.email?.split('@')[0]) : 'प्रोफाइल'}
        </span>

        {/* Sync or Status Dot */}
        <div className="flex items-center gap-1">
          {user && isVerifiedHub && <VerifiedBadge size={13} className="inline-block" />}
          {syncStatus === 'syncing' ? (
            <RefreshCw className="w-2.5 h-2.5 text-amber-400 animate-spin" />
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

        <ChevronDown className="w-3 h-3 text-slate-400 hidden sm:inline" />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-76 bg-slate-850 border border-slate-755 rounded-2xl shadow-2xl z-50 p-3.5 space-y-3 animate-in fade-in zoom-in-95 duration-150">
          {/* User Info Header */}
          <div className="flex items-center gap-3 pb-3 border-b border-slate-800">
            {user?.photoURL ? (
              <img
                src={user.photoURL}
                alt={user.displayName || 'User'}
                className="w-10 h-10 rounded-full object-cover border border-slate-600 shrink-0"
                referrerPolicy="no-referrer"
              />
            ) : user ? (
              <div className="w-10 h-10 rounded-full bg-blue-600 text-white font-black text-base flex items-center justify-center shrink-0">
                {initial}
              </div>
            ) : (
              <div className="w-10 h-10 rounded-full bg-slate-800 text-blue-400 border border-blue-500/30 flex items-center justify-center shrink-0">
                <UserIcon className="w-5 h-5 text-blue-400" />
              </div>
            )}
            <div className="overflow-hidden min-w-0">
              <div className="font-bold text-white text-xs truncate flex items-center gap-1">
                <span>{user ? (user.displayName || 'हब प्रबंधक') : 'हब प्रबंधक (Local Mode)'}</span>
                {isVerifiedHub && <VerifiedBadge size={13} className="inline-block shrink-0" />}
              </div>
              <div className="text-[11px] text-slate-400 truncate">
                {user ? user.email : 'ऑफ़लाइन मोड • डेटा इस डिवाइस में सुरक्षित'}
              </div>
              {hubName && (
                <div className="text-[10px] text-emerald-400 font-medium truncate mt-0.5 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0"></span>
                  <span className="truncate">{hubName}</span>
                </div>
              )}
            </div>
          </div>

          {/* If user is not logged in, prompt sign in */}
          {!user && (
            <button
              type="button"
              id="dropdown-sign-in-btn"
              onClick={() => {
                setIsOpen(false);
                onOpenAuth('signin');
              }}
              className="w-full py-2 px-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-md shadow-blue-600/25 transition active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>साइन इन / क्लाउड सिंक (Sign In)</span>
            </button>
          )}

          {/* Sync Status Info for logged-in user */}
          {user && (
            <div className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800 text-[11px] space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-slate-400 font-semibold flex items-center gap-1.5">
                  <Cloud className="w-3.5 h-3.5 text-blue-400" />
                  Cloud Firestore Sync:
                </span>
                {isProUser && syncStatus === 'synced' ? (
                  <span className="text-emerald-400 font-bold flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    Live Active (Pro)
                  </span>
                ) : isProUser && syncStatus === 'syncing' ? (
                  <span className="text-amber-400 font-bold flex items-center gap-1">
                    <RefreshCw className="w-3 h-3 animate-spin" />
                    Syncing...
                  </span>
                ) : isProUser && syncStatus === 'offline' ? (
                  <span className="text-amber-400 font-bold flex items-center gap-1">
                    <CloudOff className="w-3 h-3" />
                    Offline Cache
                  </span>
                ) : (
                  <span className="text-amber-300 font-bold flex items-center gap-1">
                    <CloudOff className="w-3 h-3 text-amber-400" />
                    Local Device Only
                  </span>
                )}
              </div>
              <div className="text-slate-400 text-[10px] leading-relaxed flex items-start gap-1.5 pt-1">
                <Smartphone className="w-3 h-3 text-slate-400 shrink-0 mt-0.5" />
                <span>
                  {isProUser
                    ? 'सभी राइडर्स, पार्सल और सेटलमेंट रिकॉर्ड्स सभी डिवाइसों में रियल-टाइम सिंक होते हैं।'
                    : 'फ्री टियर: राइडर और डिलीवरी डेटा इस डिवाइस में लोकली सुरक्षित है।'}
                </span>
              </div>

              {!isProUser && onEnableCloudBackup && (
                <button
                  type="button"
                  id="enable-cloud-backup-menu-btn"
                  onClick={() => {
                    setIsOpen(false);
                    onEnableCloudBackup();
                  }}
                  className="w-full mt-2 py-2 px-3 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-black shadow-md shadow-blue-600/25 transition active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Cloud className="w-3.5 h-3.5" />
                  <span>Enable Firebase Cloud Backup (Pro)</span>
                </button>
              )}
            </div>
          )}

          {/* App Lock (Fingerprint / Face ID / PIN) Setting Toggle - Available to All Users on Android */}
          {isNativeAndroid() && (
            <AppLockSettingRow userId={user?.uid} />
          )}

          {/* User Security info */}
          <div className="px-1 text-[10px] text-slate-400 flex items-center gap-1.5">
            <Shield className="w-3 h-3 text-emerald-400 shrink-0" />
            <span>सुरक्षित एवं एन्क्रिप्टेड डेटाबेस</span>
          </div>

          {/* Profile & Security Settings action */}
          {onOpenProfileSettings && (
            <button
              onClick={() => {
                setIsOpen(false);
                onOpenProfileSettings();
              }}
              className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-blue-500/15 hover:bg-blue-500/25 text-blue-300 border border-blue-500/30 text-xs font-semibold shadow-sm transition active:scale-95 cursor-pointer"
            >
              <UserIcon className="w-3.5 h-3.5 text-blue-400" />
              <span>Profile & Security Settings</span>
            </button>
          )}

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

          {/* Legal Policies & Compliance action */}
          {onOpenLegalPolicies && (
            <button
              onClick={() => {
                setIsOpen(false);
                onOpenLegalPolicies();
              }}
              className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 text-xs font-semibold transition cursor-pointer"
            >
              <Scale className="w-3.5 h-3.5 text-amber-400" />
              <span>नीतियां (Policies)</span>
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

          {/* Sign Out Button (Only when user is signed in) */}
          {user && (
            <button
              type="button"
              onClick={handleSignOut}
              className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-slate-800 hover:bg-red-500/20 text-slate-300 hover:text-red-300 border border-slate-700 hover:border-red-500/40 text-xs font-semibold transition cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign Out</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
};
