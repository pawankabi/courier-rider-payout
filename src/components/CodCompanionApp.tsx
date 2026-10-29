import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Bike, 
  ShieldCheck, 
  CheckCircle2, 
  AlertTriangle, 
  Lock, 
  Unlock, 
  Calendar, 
  ChevronLeft, 
  ChevronRight, 
  RefreshCw, 
  LogOut, 
  Phone, 
  KeyRound, 
  Coins, 
  QrCode, 
  Search, 
  Edit3, 
  Save, 
  X, 
  Wifi, 
  WifiOff, 
  Check, 
  FileSpreadsheet, 
  Layers, 
  Eye, 
  Sparkles, 
  Clock, 
  HelpCircle,
  Building2,
  AlertCircle,
  Plus,
  Package,
  Receipt,
  Banknote,
  Smartphone
} from 'lucide-react';
import { 
  CodDailyEntry, 
  CodStaffUser, 
  CodStaffRole,
  DailyCodSheetData,
  Rider,
  RiderAdvanceEntry,
  RiderIncentiveEntry,
  UserPermissions,
  CashDenomination
} from '../types';
import { RiderLedgerStatement } from './RiderLedgerStatement';
import { CashDenominationModal } from './cod/CashDenominationModal';
import { DailyConsolidatedDenominationSummary } from './cod/DailyConsolidatedDenominationSummary';
import { isRiderBuild, getRiderStatementUrl } from '../utils/shareLink';
import { collection, query, where, getDocs, onSnapshot, doc } from 'firebase/firestore';
import { signInAnonymously } from 'firebase/auth';
import { auth, db } from '../firebase';
import { 
  authenticateCodStaffCompanion, 
  getActiveCompanionHubId,
  getStoredCodCompanionUser, 
  clearCodCompanionSession,
  subscribeToDailyCodSheet,
  subscribeToHubRiders,
  updateSingleRiderEntryInSheet,
  toggleDayEndLockForSheet,
  normalizePhoneNumber,
  resolveHubIdFromPhone
} from '../services/codService';
import { getTodayDateString, formatINR } from '../utils/formatters';
import { purgeLegacyMockStorage } from '../utils/storage';
import { formatAdvanceSmsText, formatIncentiveSmsText, dispatchAutomatedSms } from '../services/smsService';
import { sendNativeBackgroundSms, isNativeAndroid } from '../services/nativeSms';
import {
  writeAdvanceEntryToFirestore,
  writeIncentiveEntryToFirestore,
  saveRiderToFirestore,
  syncPublicRiderStatement,
} from '../services/firestoreSync';
import { liveUpdateService, CURRENT_LOCAL_VERSION } from '../services/liveUpdateService';

interface CodCompanionAppProps {
  onBackToMainApp?: () => void;
  initialPhone?: string;
}

export function CodCompanionApp({ onBackToMainApp, initialPhone }: CodCompanionAppProps) {
  // Authentication State
  const [authUser, setAuthUser] = useState<CodStaffUser | null>(() => getStoredCodCompanionUser());
  const [authenticatedHubId, setAuthenticatedHubId] = useState<string | null>(() => getActiveCompanionHubId());
  const [loginPortalMode, setLoginPortalMode] = useState<'rider' | 'staff'>(() => {
    try {
      const saved = localStorage.getItem('cp_login_portal_mode');
      if (saved === 'rider' || saved === 'staff') return saved;
    } catch {}
    return 'rider';
  });
  const [phoneInput, setPhoneInput] = useState(() => normalizePhoneNumber(initialPhone || ''));
  const [pinInput, setPinInput] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [showDemoLogins, setShowDemoLogins] = useState(false);
  const [hubRiders, setHubRiders] = useState<Rider[]>([]);
  const [resolvedPreviewHub, setResolvedPreviewHub] = useState<string | null>(null);
  const [isResolvingHub, setIsResolvingHub] = useState(false);
  const [recentlySubmittedRiderId, setRecentlySubmittedRiderId] = useState<string | null>(null);

  // Sync initialPhone prop if updated externally
  useEffect(() => {
    if (initialPhone) {
      const clean = normalizePhoneNumber(initialPhone);
      if (clean) setPhoneInput(clean);
    }
  }, [initialPhone]);

  // Instant Hub Resolution as soon as 10 valid digits are typed/pasted
  useEffect(() => {
    const clean = normalizePhoneNumber(phoneInput);
    if (clean.length === 10) {
      setIsResolvingHub(true);
      resolveHubIdFromPhone(clean).then((hub) => {
        if (hub) {
          setResolvedPreviewHub(hub);
          try {
            localStorage.setItem('active_hub_id', hub);
            localStorage.setItem('active_companion_hub_id', hub);
          } catch {}
        }
      }).finally(() => {
        setIsResolvingHub(false);
      });
    } else {
      setResolvedPreviewHub(null);
    }
  }, [phoneInput]);

  // Purge any legacy cached keys in localStorage/sessionStorage related to mock riders on mount
  useEffect(() => {
    purgeLegacyMockStorage();

    // Dynamically set Rider Companion favicon, PWA manifest, and page title
    const iconLink = document.querySelector("link[rel*='icon']") as HTMLLinkElement;
    const manifestLink = document.querySelector("link[rel='manifest']") as HTMLLinkElement;
    const prevIcon = iconLink?.href;
    const prevManifest = manifestLink?.href;
    const prevTitle = document.title;

    if (iconLink) iconLink.href = '/rider-logo.svg';
    if (manifestLink) manifestLink.href = '/manifest-rider.json';
    document.title = 'Rider Companion (COD Entry & हिसाब किताब)';

    return () => {
      if (iconLink && prevIcon) iconLink.href = prevIcon;
      if (manifestLink && prevManifest) manifestLink.href = prevManifest;
      document.title = prevTitle;
    };
  }, []);

  // 1. INDEPENDENT FIREBASE AUTH & SESSION LIFECYCLE:
  // Establish dedicated Firebase session using Firebase Anonymous Authentication (signInAnonymously(auth)) on app mount
  // to guarantee a live, authenticated connection with Firestore security rules.
  useEffect(() => {
    let isMounted = true;
    const initAuth = async () => {
      try {
        if (auth && !auth.currentUser) {
          const userCred = await signInAnonymously(auth);
          if (isMounted) {
            console.log('⚡ [Firebase Auth] Standalone companion anonymous session established:', userCred.user?.uid);
          }
        }
      } catch (authErr) {
        console.warn('Anonymous Firebase auth notice:', authErr);
      }
    };
    initAuth();
    return () => {
      isMounted = false;
    };
  }, []);

  // Strict Locked Hub ID: Derived exclusively from authenticated user profile or locked companion session
  const currentHubId = (
    authenticatedHubId ||
    authUser?.hubId ||
    authUser?.workspaceId ||
    authUser?.ownerUid ||
    getActiveCompanionHubId() ||
    ''
  ).trim();

  // Real-time Hub Tenant Permissions Listener (Master Super Admin Controlled Access Gates)
  const [hubPermissions, setHubPermissions] = useState<UserPermissions | null>(null);
  const [hubCodCompanies, setHubCodCompanies] = useState<string[]>(['Valmo', 'Xpressbees']);

  useEffect(() => {
    if (!currentHubId || !db) return;
    try {
      const unsub = onSnapshot(doc(db, 'all_users', currentHubId), (snap) => {
        if (snap.exists()) {
          const d = snap.data();
          if (d && d.permissions) {
            setHubPermissions(d.permissions as UserPermissions);
          }
          if (d && Array.isArray(d.codCompanies) && d.codCompanies.length > 0) {
            setHubCodCompanies(d.codCompanies);
          }
        }
      }, (err) => {
        console.warn('Hub permissions listener notice:', err);
      });
      return () => unsub();
    } catch (e) {
      console.warn('Error setting up hub permissions listener:', e);
    }
  }, [currentHubId]);

  const isCodCompanionBlocked = hubPermissions ? hubPermissions.codCompanionAccess === false : false;
  const allowDeliveryCountInput = Boolean(hubPermissions?.allowRiderDeliveryCountInput);

  // Sheet & Active Date State
  const [selectedDate, setSelectedDate] = useState<string>(() => getTodayDateString());
  const todayStr = useMemo(() => getTodayDateString(), []);
  const isToday = selectedDate === todayStr;
  const isPastDate = selectedDate < todayStr;

  // Real-time Sheet Data
  const [sheetData, setSheetData] = useState<DailyCodSheetData>({
    date: selectedDate,
    entries: [],
    isLocked: false,
    company1Name: 'Valmo COD',
    company2Name: 'Xpressbees COD',
    hubId: currentHubId,
  });
  const [isRealtimeConnected, setIsRealtimeConnected] = useState<boolean>(true);
  const [lastSyncTime, setLastSyncTime] = useState<string>('0s पहले');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');

  // Rider Row Edit Modal State
  const [editingEntry, setEditingEntry] = useState<CodDailyEntry | null>(null);
  const [editDeliveryCount, setEditDeliveryCount] = useState<number | string>('');
  const [editCompanyAmounts, setEditCompanyAmounts] = useState<Record<string, number | string>>({});
  const [editCompany1, setEditCompany1] = useState<number | string>(0);
  const [editCompany2, setEditCompany2] = useState<number | string>(0);
  const [editCash, setEditCash] = useState<number | string>(0);
  const [editOnline, setEditOnline] = useState<number | string>(0);
  const [editNotes, setEditNotes] = useState('');
  const [isSavingEntry, setIsSavingEntry] = useState(false);
  const [isDenominationModalOpen, setIsDenominationModalOpen] = useState(false);
  const [editCashDenomination, setEditCashDenomination] = useState<CashDenomination | null>(null);
  const [auditDenominationEntry, setAuditDenominationEntry] = useState<CodDailyEntry | null>(null);

  // Hub Collection UPI ID & 1-Click Payment Tracker
  const [syncedHubUpiId, setSyncedHubUpiId] = useState<string>('');
  const [onlinePaymentSent, setOnlinePaymentSent] = useState<boolean>(false);

  // Rider Active Portal Tab: Daily Delivery / COD Submission vs Khatabook Passbook
  const [riderActiveTab, setRiderActiveTab] = useState<'cod_entry' | 'khatabook'>('cod_entry');
  const isRiderFlavor = isRiderBuild();

  // Incharge / Supervisor Shortage Modal
  const [shortageModal, setShortageModal] = useState<{
    isOpen: boolean;
    row: CodDailyEntry | null;
    field: 'company1' | 'company2' | 'cash' | 'online';
    reportedAmount: number;
    actualReceived: number | string;
    notes: string;
  }>({
    isOpen: false,
    row: null,
    field: 'cash',
    reportedAmount: 0,
    actualReceived: '',
    notes: '',
  });

  // In-App Confirm Day-End Lock (Android WebView safe, zero window.confirm)
  const [dayEndLockConfirmOpen, setDayEndLockConfirmOpen] = useState(false);
  const [isTogglingDayEndLock, setIsTogglingDayEndLock] = useState(false);

  // UI Toasts
  const [toast, setToast] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

  const showToast = (text: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ text, type });
    setTimeout(() => {
      setToast(null);
    }, 3800);
  };

  // Hybrid Live Cloud Sync & OTA State
  const [isLiveUpdateAvailable, setIsLiveUpdateAvailable] = useState<boolean>(() => liveUpdateService.isUpdateAvailable());
  const [updateDetails, setUpdateDetails] = useState<{ version?: string; releaseNotes?: string }>({});
  const [isSyncingLiveCloud, setIsSyncingLiveCloud] = useState<boolean>(false);

  useEffect(() => {
    const unsubscribe = liveUpdateService.subscribe((available, details) => {
      setIsLiveUpdateAvailable(available);
      if (details) setUpdateDetails(details);
    });
    return () => unsubscribe();
  }, []);

  const handleManualCloudSync = async () => {
    setIsSyncingLiveCloud(true);
    try {
      const hasUpdate = await liveUpdateService.checkForUpdate(true);
      if (hasUpdate) {
        showToast('⚡ नया लाइव क्लाउड अपडेट उपलब्ध है! लागू किया जा रहा है...', 'success');
        setTimeout(() => {
          liveUpdateService.applyUpdate();
        }, 800);
      } else {
        showToast(`✅ आप पहले से नवीनतम क्लाउड वर्शन v${CURRENT_LOCAL_VERSION} पर हैं! (लाइव सिंक 0s)`, 'success');
      }
    } catch {
      showToast('क्लाउड सर्वर से संपर्क नहीं हो सका। कृपया इंटरनेट जांचें।', 'error');
    } finally {
      setIsSyncingLiveCloud(false);
    }
  };

  // 1. Subscribe to Firebase Firestore real-time listener (0s zero-delay synchronization strictly scoped to authenticatedHubId)
  useEffect(() => {
    if (!authUser || !authenticatedHubId) return;

    setIsRealtimeConnected(true);
    const unsubscribeSheet = subscribeToDailyCodSheet(
      selectedDate,
      (data) => {
        setSheetData(data);
        setIsRealtimeConnected(true);
        setLastSyncTime(new Date().toLocaleTimeString('hi-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      },
      (err) => {
        console.warn('Realtime sync fallback notice:', err);
        setIsRealtimeConnected(false);
      },
      authenticatedHubId
    );

    // Bind real-time listener (onSnapshot) to ONLY that hub's riders:
    // query(collection(db, "riders"), where("workspaceId", "==", active_hub_id))
    const unsubscribeRiders = subscribeToHubRiders(
      authenticatedHubId,
      (riders) => {
        const cleanRiders = (riders || []).filter(
          (r) => r.name !== 'Akash Mahato' && 
                 r.phone !== '6207262418' && 
                 (r.status ? r.status === 'active' : r.active !== false) && 
                 r.status !== 'inactive' && 
                 r.active !== false
        );
        setHubRiders(cleanRiders);
      },
      (err) => {
        console.warn('Realtime hub riders notice:', err);
      }
    );

    return () => {
      if (typeof unsubscribeSheet === 'function') {
        unsubscribeSheet();
      }
      if (typeof unsubscribeRiders === 'function') {
        unsubscribeRiders();
      }
    };
  }, [selectedDate, authUser, authenticatedHubId]);

  // Online / Offline window monitor
  useEffect(() => {
    const handleOnline = () => setIsRealtimeConnected(true);
    const handleOffline = () => setIsRealtimeConnected(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Real-time synchronization of Hub's collection UPI ID
  useEffect(() => {
    if (!authenticatedHubId || !db) return;
    try {
      const unsub = onSnapshot(doc(db, 'hubs', authenticatedHubId), (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          if (data?.hubUpiId) {
            setSyncedHubUpiId(data.hubUpiId);
          }
        }
      });
      return () => unsub();
    } catch {}
  }, [authenticatedHubId]);

  const activeHubUpiId = (syncedHubUpiId || sheetData?.hubUpiId || '').trim();

  // Auto-detect return from UPI payment app (GPay / PhonePe / Paytm)
  useEffect(() => {
    const checkUpiReturn = () => {
      const raw = sessionStorage.getItem('cp_pending_upi_transfer');
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (Date.now() - parsed.time < 600000) {
            setOnlinePaymentSent(true);
            showToast(`✅ ₹${Number(parsed.amount).toLocaleString('en-IN')} का UPI ट्रांसफर प्रोसेस हुआ! अब एंट्री सेव करें।`, 'success');
          }
        } catch {}
        sessionStorage.removeItem('cp_pending_upi_transfer');
      }
    };

    window.addEventListener('focus', checkUpiReturn);
    const handleVis = () => {
      if (document.visibilityState === 'visible') {
        checkUpiReturn();
      }
    };
    document.addEventListener('visibilitychange', handleVis);

    return () => {
      window.removeEventListener('focus', checkUpiReturn);
      document.removeEventListener('visibilitychange', handleVis);
    };
  }, []);

  // Launch GPay / PhonePe / Paytm with exact amount and Hub UPI ID
  const handleLaunchUpiApp = () => {
    const amt = Number(editOnline);
    if (!amt || amt <= 0) {
      showToast('कृपया पहले सही ऑनलाइन रकम (Online ₹) दर्ज करें।', 'error');
      return;
    }
    if (!activeHubUpiId) {
      showToast('हब एडमिन द्वारा UPI ID सेट नहीं किया गया है।', 'error');
      return;
    }

    const payeeName = sheetData?.hubName || 'Courier Hub';
    const riderName = editingEntry?.riderName || authUser?.name || 'Rider';
    const note = `COD Collection - ${riderName}`;
    const cleanUpi = activeHubUpiId.trim();

    // Universal UPI Deep Link:
    const upiUri = `upi://pay?pa=${encodeURIComponent(cleanUpi)}&pn=${encodeURIComponent(payeeName)}&am=${amt}&cu=INR&tn=${encodeURIComponent(note)}`;

    sessionStorage.setItem('cp_pending_upi_transfer', JSON.stringify({
      amount: amt,
      riderId: editingEntry?.riderId,
      time: Date.now(),
    }));

    showToast('🚀 Google Pay / PhonePe / Paytm खोला जा रहा है...', 'info');
    window.location.href = upiUri;
  };

  // 2. Handle Login: Exact Hub Lookup on Login directly via authenticateCodStaffCompanion
  const handleLogin = async (overridePhone?: string, overridePin?: string) => {
    const targetPhone = overridePhone || phoneInput;
    const targetPin = overridePin || pinInput;
    setLoginError('');
    setIsLoggingIn(true);

    try {
      const res = await authenticateCodStaffCompanion(targetPhone, targetPin);
      if (res.success && res.user) {
        const finalHubId = (res.resolvedHubId || res.user.hubId || res.user.workspaceId || res.user.ownerUid || '').trim();
        if (!finalHubId) {
          const errMsg = 'हब की पहचान नहीं हो सकी। कृपया एडमिन से संपर्क करें।';
          setLoginError(errMsg);
          showToast(`❌ ${errMsg}`, 'error');
          return;
        }

        // Save resolved hubId in companion app session (localStorage: active_hub_id & active_companion_hub_id)
        try {
          localStorage.setItem('active_hub_id', finalHubId);
          sessionStorage.setItem('active_hub_id', finalHubId);
          localStorage.setItem('active_companion_hub_id', finalHubId);
          sessionStorage.setItem('active_companion_hub_id', finalHubId);
          localStorage.setItem('cp_authenticated_hub_id', finalHubId);
          sessionStorage.setItem('cp_authenticated_hub_id', finalHubId);
        } catch {}

        setAuthenticatedHubId(finalHubId);
        setResolvedPreviewHub(finalHubId);
        setAuthUser(res.user);
        showToast(`✅ ${res.message}`, 'success');
      } else {
        const errMsg = res.message || 'हब की पहचान नहीं हो सकी। कृपया एडमिन से संपर्क करें।';
        setLoginError(errMsg);
        showToast(`❌ ${errMsg}`, 'error');
      }
    } catch {
      setLoginError('लॉगिन करने में त्रुटि हुई। कृपया पुनः प्रयास करें।');
    } finally {
      setIsLoggingIn(false);
    }
  };

  // Handle Logout
  const handleLogout = () => {
    clearCodCompanionSession();
    try {
      localStorage.removeItem('active_hub_id');
      sessionStorage.removeItem('active_hub_id');
      localStorage.removeItem('active_companion_hub_id');
      sessionStorage.removeItem('active_companion_hub_id');
      sessionStorage.removeItem('cp_authenticated_hub_id');
      localStorage.removeItem('cp_authenticated_hub_id');
    } catch {}
    setAuthenticatedHubId(null);
    setAuthUser(null);
    setPhoneInput('');
    setPinInput('');
    showToast('लॉगआउट सफल।', 'info');
  };

  // 3. User Role & Permissions helpers
  const isRider = authUser?.role === 'rider';
  const isTeamLeader = authUser?.role === 'team_leader';
  const isSupervisor = authUser?.role === 'supervisor';
  const isHubIncharge = authUser?.role === 'hub_incharge';

  const canToggleLock = isHubIncharge;
  const isDayEndLocked = Boolean(sheetData.isLocked);

  // Helper to match a rider row by riderId, clean phone number, or rider name
  const isMatchingRiderRow = (row?: CodDailyEntry | null): boolean => {
    if (!row || !authUser) return false;
    const authRiderId = authUser.riderId || authUser.id;
    if (authRiderId && (row.riderId === authRiderId || row.id?.includes(authRiderId))) {
      return true;
    }
    const cleanUserPhone = (authUser.phone || '').replace(/\D/g, '').slice(-10);
    const cleanRowPhone = (row.riderPhone || '').replace(/\D/g, '').slice(-10);
    if (cleanUserPhone && cleanRowPhone && cleanUserPhone === cleanRowPhone) {
      return true;
    }
    if (authUser.name && row.riderName && authUser.name.trim().toLowerCase() === row.riderName.trim().toLowerCase()) {
      return true;
    }
    return false;
  };

  // Can the current user edit the given row?
  // Strict Security Rule: Office Staff can ONLY inspect & tick (✓) for tallying collections.
  // All editing features are strictly disabled for Office Staff.
  const canEditRow = (row: CodDailyEntry): boolean => {
    if (isPastDate) return false; // Fail-Safe Auto Midnight Lock: All past dates are strictly READ-ONLY
    if (isDayEndLocked) return false; // Day-End Lock engages absolute lockdown
    
    // Riders can ONLY edit their own assigned row
    if (isRider) {
      return isMatchingRiderRow(row);
    }

    // Office Staff Login: All editing features are strictly disabled!
    // Staff can only inspect and tick (✓) to verify / tally entries.
    return false;
  };

  // Can verify specific field: Office staff is fully authorized to inspect and tick (✓) for tally verification
  const canVerifyField = (_field: 'company1' | 'company2' | 'cash' | 'online'): boolean => {
    if (isPastDate || isDayEndLocked) return false;
    if (isRider) return false; // Riders can never verify themselves
    // Office staff (supervisor, team leader, incharge) is fully authorized to inspect & tick (✓)
    if (!isRider) {
      return true;
    }
    return false;
  };

  // 4. Find Active Rider's Own Row & Alert
  const currentRiderId = authUser?.riderId || authUser?.id || '';

  // Strict Hub Data Isolation: Reconcile ONLY riders belonging to this exact active_hub_id
  const displayEntries: CodDailyEntry[] = useMemo(() => {
    if (!currentHubId) return [];

    const entryMap = new Map<string, CodDailyEntry>();
    (sheetData.entries || []).forEach((e) => {
      if (e.riderId) entryMap.set(e.riderId, e);
      const cleanPhone = (e.riderPhone || '').replace(/\D/g, '').slice(-10);
      if (cleanPhone) entryMap.set(cleanPhone, e);
    });

    if (hubRiders.length > 0) {
      const merged: CodDailyEntry[] = hubRiders.map((r) => {
        const cleanPhone = (r.phone || '').replace(/\D/g, '').slice(-10);
        const ex = entryMap.get(r.id) || (cleanPhone ? entryMap.get(cleanPhone) : undefined);
        if (ex) {
          const totalCod = (Number(ex.company1Amount) || 0) + (Number(ex.company2Amount) || 0);
          const totalDeposit = (Number(ex.cashDeposit) || 0) + (Number(ex.onlineDeposit) || 0);
          const balance = totalCod - totalDeposit;
          return {
            ...ex,
            riderId: r.id,
            riderName: r.name,
            riderPhone: r.phone,
            totalCod,
            totalDeposit,
            balance,
          };
        }
        return {
          id: `cod_${selectedDate}_${r.id}`,
          date: selectedDate,
          riderId: r.id,
          riderName: r.name,
          riderPhone: r.phone,
          company1Amount: 0,
          company2Amount: 0,
          totalCod: 0,
          cashDeposit: 0,
          onlineDeposit: 0,
          totalDeposit: 0,
          balance: 0,
          status: 'draft',
          updatedAt: new Date().toISOString(),
        };
      });

      // Ensure logged-in rider's own card is always present
      if (isRider && authUser) {
        const cleanUserPhone = (authUser.phone || '').replace(/\D/g, '').slice(-10);
        const myId = authUser.riderId || authUser.id;
        const exists = merged.some(
          (m) => m.riderId === myId || ((m.riderPhone || '').replace(/\D/g, '').slice(-10) === cleanUserPhone && cleanUserPhone)
        );
        if (!exists) {
          const ex = entryMap.get(myId) || (cleanUserPhone ? entryMap.get(cleanUserPhone) : undefined);
          if (ex) {
            merged.unshift(ex);
          } else {
            merged.unshift({
              id: `cod_${selectedDate}_${myId}`,
              date: selectedDate,
              riderId: myId,
              riderName: authUser.name,
              riderPhone: authUser.phone,
              company1Amount: 0,
              company2Amount: 0,
              totalCod: 0,
              cashDeposit: 0,
              onlineDeposit: 0,
              totalDeposit: 0,
              balance: 0,
              status: 'draft',
              updatedAt: new Date().toISOString(),
            });
          }
        }
      }

      // Hub-Wide Daily Entry Feed: Logged-in rider can view daily entry list of ALL active riders in the hub for that date.
      // Peer entries are strictly read-only (enforced via canEditRow & canVerifyField).
      // The logged-in rider's own entry is sorted to the very top for effortless editing.
      if (isRider && authUser) {
        return [...merged].sort((a, b) => {
          const aIsMe = isMatchingRiderRow(a);
          const bIsMe = isMatchingRiderRow(b);
          if (aIsMe && !bIsMe) return -1;
          if (!aIsMe && bIsMe) return 1;
          return a.riderName.localeCompare(b.riderName);
        });
      }

      return merged;
    }

    // Fallback if hubRiders is loading: Return all hub entries for selected date, prioritizing own entry
    if (sheetData.entries && sheetData.entries.length > 0) {
      if (isRider && authUser) {
        return [...sheetData.entries].sort((a, b) => {
          const aIsMe = isMatchingRiderRow(a);
          const bIsMe = isMatchingRiderRow(b);
          if (aIsMe && !bIsMe) return -1;
          if (!aIsMe && bIsMe) return 1;
          return a.riderName.localeCompare(b.riderName);
        });
      }
      return sheetData.entries;
    }

    return [];
  }, [currentHubId, hubRiders, sheetData.entries, selectedDate, isRider, authUser]);

  const myRiderRow = useMemo(() => {
    if (!isRider) return null;
    return displayEntries.find((e) => isMatchingRiderRow(e)) || null;
  }, [displayEntries, isRider, authUser]);

  // Active Rider Shortage Warning (Rider App Visibility)
  const myShortageAlert = useMemo(() => {
    if (!isRider || !myRiderRow) return null;
    const items: { label: string; amount: number; notes?: string }[] = [];
    if (myRiderRow.company1Shortage && myRiderRow.company1Shortage > 0) {
      items.push({ label: `${sheetData.company1Name || 'Company 1'} शॉर्टेज`, amount: myRiderRow.company1Shortage, notes: myRiderRow.company1ShortageNotes });
    }
    if (myRiderRow.company2Shortage && myRiderRow.company2Shortage > 0) {
      items.push({ label: `${sheetData.company2Name || 'Company 2'} शॉर्टेज`, amount: myRiderRow.company2Shortage, notes: myRiderRow.company2ShortageNotes });
    }
    if (myRiderRow.cashShortage && myRiderRow.cashShortage > 0) {
      items.push({ label: 'कम कैश जमा (Cash Short)', amount: myRiderRow.cashShortage, notes: myRiderRow.cashShortageNotes });
    }
    if (myRiderRow.onlineShortage && myRiderRow.onlineShortage > 0) {
      items.push({ label: 'कम ऑनलाइन जमा (Online Short)', amount: myRiderRow.onlineShortage, notes: myRiderRow.onlineShortageNotes });
    }
    const totalShort = items.reduce((s, i) => s + i.amount, 0);
    return items.length > 0 ? { items, totalShort } : null;
  }, [isRider, myRiderRow, sheetData.company1Name, sheetData.company2Name]);

  // Filtered rows for display (Strict Hub Isolation: If currentHubId is missing/invalid, return empty array [])
  const filteredEntries = useMemo(() => {
    if (!currentHubId) return [];
    if (!searchQuery.trim()) return displayEntries;
    const q = searchQuery.toLowerCase();
    return displayEntries.filter(
      (e) => e.riderName.toLowerCase().includes(q) || (e.riderPhone && e.riderPhone.includes(q))
    );
  }, [displayEntries, searchQuery, currentHubId]);

  // Overall Statistics
  const stats = useMemo(() => {
    const entries = displayEntries;
    const totalCod = entries.reduce((s, e) => s + (e.totalCod || 0), 0);
    const totalDeposit = entries.reduce((s, e) => s + (e.totalDeposit || 0), 0);
    const totalBalance = entries.reduce((s, e) => s + (e.balance || 0), 0);
    const totalShortage = entries.reduce((s, e) => 
      s + ((e.company1Shortage || 0) + (e.company2Shortage || 0) + (e.cashShortage || 0) + (e.onlineShortage || 0)), 0
    );
    return { totalCod, totalDeposit, totalBalance, totalShortage, count: entries.length };
  }, [displayEntries]);

  // 5. Open Modal to Edit Row (Auto-creates row on demand if not yet present)
  const handleOpenEditRow = (row?: CodDailyEntry | null) => {
    let targetRow = row;

    if (!targetRow && authUser) {
      targetRow = myRiderRow;
    }

    if (!targetRow && authUser) {
      // Find my row, or create a brand new template entry for the logged-in user
      const cleanUserPhone = (authUser.phone || '').replace(/\D/g, '').slice(-10);
      const targetId = authUser.riderId || authUser.id || (cleanUserPhone ? `rider_${cleanUserPhone}` : `rider_${Date.now()}`);
      targetRow = {
        id: `cod_${selectedDate}_${targetId}`,
        date: selectedDate,
        riderId: targetId,
        riderName: authUser.name || 'राइडर',
        riderPhone: authUser.phone || '',
        company1Amount: 0,
        company2Amount: 0,
        totalCod: 0,
        cashDeposit: 0,
        onlineDeposit: 0,
        totalDeposit: 0,
        balance: 0,
        status: 'draft',
        updatedAt: new Date().toISOString(),
      };
    }

    if (!targetRow) {
      showToast('⚠️ कोई मान्य राइडर एंट्री उपलब्ध नहीं है।', 'error');
      return;
    }

    if (!isRider) {
      showToast('🔒 ऑफिस स्टाफ के लिए एडिट बंद है। आप केवल जांच कर (✓) टिक कर सकते हैं।', 'info');
      return;
    }

    if (!canEditRow(targetRow)) {
      if (isPastDate) {
        showToast('🔒 पुरानी तारीख का हिसाब केवल पढ़ने के लिए है (Read-Only)', 'error');
      } else if (isDayEndLocked) {
        showToast('🔒 आज का हिसाब हब इंचार्ज द्वारा लॉक किया जा चुका है।', 'error');
      } else {
        showToast('⚠️ आप केवल अपनी खुद की असाइन की गई रो एडिट कर सकते हैं।', 'error');
      }
      return;
    }

    setEditingEntry(targetRow);
    setEditDeliveryCount(targetRow.deliveryCount && targetRow.deliveryCount > 0 ? String(targetRow.deliveryCount) : '');
    
    // Dynamic per-company initial amounts
    const initialCompanyAmounts: Record<string, string> = {};
    hubCodCompanies.forEach((comp, idx) => {
      let val = 0;
      if (targetRow.companyAmounts && targetRow.companyAmounts[comp] !== undefined) {
        val = targetRow.companyAmounts[comp];
      } else if (idx === 0) {
        val = targetRow.company1Amount;
      } else if (idx === 1) {
        val = targetRow.company2Amount;
      }
      initialCompanyAmounts[comp] = val > 0 ? String(val) : '';
    });
    setEditCompanyAmounts(initialCompanyAmounts);

    setEditCompany1(targetRow.company1Amount > 0 ? String(targetRow.company1Amount) : '');
    setEditCompany2(targetRow.company2Amount > 0 ? String(targetRow.company2Amount) : '');
    setEditCash(targetRow.cashDeposit > 0 ? String(targetRow.cashDeposit) : '');
    setEditCashDenomination(targetRow.cashDenomination || null);
    setEditOnline(targetRow.onlineDeposit > 0 ? String(targetRow.onlineDeposit) : '');
    setEditNotes(targetRow.notes || '');
    setOnlinePaymentSent(false);
  };

  // Save Row with instant optimistic UI update + direct Firestore write
  const handleSaveEditRow = async () => {
    if (!editingEntry || !authUser) return;
    if (!isRider) {
      showToast('🔒 ऑफिस स्टाफ के लिए एडिट बंद है। केवल (✓) टिक सत्यापन की अनुमति है।', 'error');
      setEditingEntry(null);
      return;
    }
    if (isRider && !isMatchingRiderRow(editingEntry)) {
      showToast('⚠️ आप केवल अपनी खुद की एंट्री सेव कर सकते हैं।', 'error');
      return;
    }
    setIsSavingEntry(true);

    const deliveryCount = allowDeliveryCountInput
      ? (Number(editDeliveryCount) || 0)
      : (Number(editingEntry.deliveryCount) || 0);

    // Sum dynamic company fields
    const numericCompanyAmounts: Record<string, number> = {};
    let totalCod = 0;
    hubCodCompanies.forEach((comp) => {
      const amt = Number(editCompanyAmounts[comp]) || 0;
      numericCompanyAmounts[comp] = amt;
      totalCod += amt;
    });

    const c1 = Number(numericCompanyAmounts[hubCodCompanies[0]]) || 0;
    const c2 = Number(numericCompanyAmounts[hubCodCompanies[1]]) || 0;

    // Strict Cash & Denomination Lock for Rider Submission:
    // If cash is locked for this rider, retain the locked cash & denomination so no alteration can occur
    const isLockedForThisRider = isRider && Boolean(editingEntry.isCashLocked);
    const cash = isLockedForThisRider
      ? (Number(editingEntry.cashDeposit) || 0)
      : (Number(editCash) || 0);
    const denominationToSave = isLockedForThisRider
      ? editingEntry.cashDenomination
      : (editCashDenomination || editingEntry.cashDenomination);
    const online = Number(editOnline) || 0;
    const totalDeposit = cash + online;
    const balance = totalCod - totalDeposit;

    // Automatic Submission Lock:
    // As soon as the rider submits/saves the entry for the day:
    // Automatically set isCashLocked: true in Firestore under that rider's daily COD record.
    // If rider was temporarily unlocked and submits again, it must IMMEDIATELY AUTO-LOCK again (isCashLocked: true).
    const willLockCash = isRider ? true : Boolean(editingEntry.isCashLocked);

    const updated: CodDailyEntry = {
      ...editingEntry,
      deliveryCount,
      company1Amount: c1,
      company2Amount: c2,
      companyAmounts: numericCompanyAmounts,
      totalCod,
      cashDeposit: cash,
      cashDenomination: denominationToSave,
      isCashLocked: willLockCash,
      cashLockedAt: willLockCash ? (editingEntry.cashLockedAt || new Date().toISOString()) : undefined,
      cashLockedBy: willLockCash ? (editingEntry.cashLockedBy || authUser.name) : undefined,
      onlineDeposit: online,
      totalDeposit,
      balance,
      notes: editNotes.trim(),
      status: 'submitted',
      submittedAt: editingEntry.submittedAt || new Date().toISOString(),
      submittedBy: authUser.name,
      updatedAt: new Date().toISOString(),
      updatedBy: authUser.name,
    };

    // 1. Optimistic Local UI Update & Instant Visual Feedback
    setSheetData((prev) => {
      const entries = prev.entries || [];
      const cleanPhone = (updated.riderPhone || '').replace(/\D/g, '').slice(-10);
      const idx = entries.findIndex(
        (e) => (e.riderId && e.riderId === updated.riderId) ||
               (cleanPhone && (e.riderPhone || '').replace(/\D/g, '').slice(-10) === cleanPhone)
      );
      let nextEntries: CodDailyEntry[];
      if (idx >= 0) {
        nextEntries = [...entries];
        nextEntries[idx] = updated;
      } else {
        nextEntries = [...entries, updated];
      }
      return {
        ...prev,
        entries: nextEntries,
        updatedAt: new Date().toISOString(),
      };
    });

    // Close modal immediately with zero lag
    setEditingEntry(null);

    // Trigger instant optimistic feedback (green checkmark / highlight pulse)
    setRecentlySubmittedRiderId(updated.riderId);
    setTimeout(() => {
      setRecentlySubmittedRiderId((prev) => (prev === updated.riderId ? null : prev));
    }, 6000);

    const balMsg = balance === 0 
      ? 'हिसाब बराबर (शून्य बैलेंस ✓)' 
      : balance > 0 
      ? `बकाया: ${formatINR(balance)}` 
      : `अतिरिक्त जमा: ${formatINR(Math.abs(balance))}`;
    showToast(`✅ ${editingEntry.riderName} की एंट्री दर्ज! ${balMsg} (0s लाइव सिंक)`, 'success');

    // 2. Direct Firestore Write and Background Sync
    try {
      await updateSingleRiderEntryInSheet(selectedDate, updated, {
        name: authUser.name,
        role: authUser.role,
      }, currentHubId);
    } catch {
      showToast('⚠️ बैकग्राउंड सिंक में विलंब, ऑफलाइन डेटा सुरक्षित है।', 'info');
    } finally {
      setIsSavingEntry(false);
    }
  };

  // 6. Toggle Verification Checkmark
  const handleToggleVerification = async (
    row: CodDailyEntry, 
    field: 'company1' | 'company2' | 'cash' | 'online'
  ) => {
    if (!authUser) return;
    if (!canVerifyField(field)) {
      showToast(`⚠️ आपको इस फील्ड को सत्यापित करने की अनुमति नहीं है। हब इंचार्ज से संपर्क करें।`, 'error');
      return;
    }

    const fieldKey = `${field}Verified` as keyof CodDailyEntry;
    const byKey = `${field}VerifiedBy` as keyof CodDailyEntry;
    const atKey = `${field}VerifiedAt` as keyof CodDailyEntry;

    const currentVal = Boolean(row[fieldKey]);
    const nextVal = !currentVal;

    const updated: CodDailyEntry = {
      ...row,
      [fieldKey]: nextVal,
      [byKey]: nextVal ? authUser.name : undefined,
      [atKey]: nextVal ? new Date().toISOString() : undefined,
    };

    try {
      await updateSingleRiderEntryInSheet(selectedDate, updated, {
        name: authUser.name,
        role: authUser.role,
      }, currentHubId);
      showToast(
        nextVal
          ? `✓ ${field.toUpperCase()} सत्यापित किया गया (${row.riderName})`
          : `सत्यापन हटाया गया (${row.riderName})`,
        'success'
      );
    } catch {
      showToast('सत्यापन अपडेट विफल हुआ।', 'error');
    }
  };

  // 6b. Toggle Cash Lock Override (Admin & Staff Manual Override)
  const handleToggleCashLock = async (row: CodDailyEntry) => {
    if (isRider) {
      showToast('⚠️ केवल हब एडमिन या अधिकृत स्टाफ़ ही कैश लॉक/अनलॉक कर सकते हैं।', 'error');
      return;
    }
    if (!authUser) return;

    const nextLocked = !Boolean(row.isCashLocked);
    const updated: CodDailyEntry = {
      ...row,
      isCashLocked: nextLocked,
      cashLockedAt: nextLocked ? new Date().toISOString() : undefined,
      cashLockedBy: nextLocked ? authUser.name : undefined,
      updatedAt: new Date().toISOString(),
      updatedBy: authUser.name,
    };

    // 1. Optimistic local UI update
    setSheetData((prev) => {
      const entries = prev.entries || [];
      const cleanPhone = (updated.riderPhone || '').replace(/\D/g, '').slice(-10);
      const idx = entries.findIndex(
        (e) => (e.riderId && e.riderId === updated.riderId) ||
               (cleanPhone && (e.riderPhone || '').replace(/\D/g, '').slice(-10) === cleanPhone)
      );
      let nextEntries: CodDailyEntry[];
      if (idx >= 0) {
        nextEntries = [...entries];
        nextEntries[idx] = updated;
      } else {
        nextEntries = [...entries, updated];
      }
      return {
        ...prev,
        entries: nextEntries,
        updatedAt: new Date().toISOString(),
      };
    });

    showToast(
      nextLocked
        ? `🔒 ${row.riderName} का कैश एडिट लॉक किया गया।`
        : `🔓 ${row.riderName} का कैश एडिट अस्थायी रूप से अनलॉक किया गया (राइडर अब सुधार कर सकते हैं)।`,
      'success'
    );

    // 2. Direct Firestore update
    try {
      await updateSingleRiderEntryInSheet(selectedDate, updated, {
        name: authUser.name,
        role: authUser.role,
      }, currentHubId);
    } catch (err) {
      console.error('Failed to update cash lock in Firestore:', err);
      showToast('⚠️ कैश लॉक स्थिति सिंक करने में विलंब।', 'info');
    }
  };

  // 7. Toggle Day-End Lock (Android WebView safe, zero window.confirm)
  const handleToggleDayEndLock = () => {
    if (!isHubIncharge || !authUser) return;
    setDayEndLockConfirmOpen(true);
  };

  const handleConfirmToggleDayEndLock = async () => {
    if (!isHubIncharge || !authUser) return;
    const nextLocked = !isDayEndLocked;
    setIsTogglingDayEndLock(true);

    try {
      await toggleDayEndLockForSheet(selectedDate, nextLocked, authUser.name, currentHubId);
      showToast(
        nextLocked
          ? '🔒 आज का हिसाब लॉक कर दिया गया। सभी राइडर एडिट बंद हो गए।'
          : '🔓 आज का हिसाब अनलॉक कर दिया गया।',
        'success'
      );
      setDayEndLockConfirmOpen(false);
    } catch {
      showToast('लॉक स्थिति बदलने में त्रुटि हुई।', 'error');
    } finally {
      setIsTogglingDayEndLock(false);
    }
  };

  // 8. Incharge Shortage Flagging Modal
  const handleOpenShortageModal = (
    row: CodDailyEntry, 
    field: 'company1' | 'company2' | 'cash' | 'online'
  ) => {
    if (!isHubIncharge && !isSupervisor) {
      showToast('⚠️ केवल हब इंचार्ज और सुपरवाइजर ही शॉर्टेज मार्क कर सकते हैं।', 'error');
      return;
    }
    const reported = Number(
      field === 'company1' ? row.company1Amount : 
      field === 'company2' ? row.company2Amount : 
      field === 'cash' ? row.cashDeposit : row.onlineDeposit
    ) || 0;

    const existingActual = field === 'company1' ? row.company1ActualReceived :
      field === 'company2' ? row.company2ActualReceived :
      field === 'cash' ? row.cashActualReceived : row.onlineActualReceived;

    const existingNotes = field === 'company1' ? row.company1ShortageNotes :
      field === 'company2' ? row.company2ShortageNotes :
      field === 'cash' ? row.cashShortageNotes : row.onlineShortageNotes;

    setShortageModal({
      isOpen: true,
      row,
      field,
      reportedAmount: reported,
      actualReceived: existingActual !== undefined ? existingActual : '',
      notes: existingNotes || '',
    });
  };

  const handleSaveShortage = async () => {
    if (!shortageModal.row || !authUser) return;
    const { row, field, reportedAmount, actualReceived, notes } = shortageModal;
    const actual = actualReceived === '' ? reportedAmount : Math.max(0, Number(actualReceived) || 0);
    const shortAmount = Math.max(0, reportedAmount - actual);
    const surplusAmount = Math.max(0, actual - reportedAmount);

    const sProp = `${field}Shortage` as keyof CodDailyEntry;
    const aProp = `${field}ActualReceived` as keyof CodDailyEntry;
    const nProp = `${field}ShortageNotes` as keyof CodDailyEntry;
    const fProp = `${field}ShortageFlaggedBy` as keyof CodDailyEntry;
    const tProp = `${field}ShortageFlaggedAt` as keyof CodDailyEntry;

    const updated: CodDailyEntry = {
      ...row,
      [sProp]: shortAmount > 0 ? shortAmount : undefined,
      [aProp]: (shortAmount > 0 || surplusAmount > 0) ? actual : undefined,
      [nProp]: (shortAmount > 0 || surplusAmount > 0) ? notes.trim() : undefined,
      [fProp]: (shortAmount > 0 || surplusAmount > 0) ? authUser.name : undefined,
      [tProp]: (shortAmount > 0 || surplusAmount > 0) ? new Date().toISOString() : undefined,
    };

    try {
      await updateSingleRiderEntryInSheet(selectedDate, updated, {
        name: authUser.name,
        role: authUser.role,
      }, currentHubId);

      if (shortAmount > 0) {
        showToast(`⚠️ शॉर्टेज मार्क: ₹${shortAmount} (${row.riderName} - ${field.toUpperCase()})`, 'info');
      } else if (surplusAmount > 0) {
        showToast(`🎉 सरप्लस / एक्स्ट्रा जमा: ₹${surplusAmount} (${row.riderName} - ${field.toUpperCase()})`, 'success');
      } else {
        showToast('शॉर्टेज हटा दी गई।', 'success');
      }

      setShortageModal((prev) => ({ ...prev, isOpen: false }));

      const cleanPhone = (row.riderPhone || '').replace(/\D/g, '').slice(-10);
      const statementUrl = getRiderStatementUrl(row.riderId);
      const targetRider = hubRiders.find((r) => r.id === row.riderId);

      // FEATURE A: Auto-write Advance to Firestore on Shortage & Trigger Background SMS
      if (shortAmount > 0) {
        try {
          const totalAdvance = (Number(targetRider?.totalAdvance) || 0) + shortAmount;
          const description = `COD Shortage (${field.toUpperCase()} - ${selectedDate})`;
          const advReason = `COD Shortage (₹${shortAmount})`;

          let advId = '';
          if (currentHubId) {
            try {
              advId = await writeAdvanceEntryToFirestore(currentHubId, {
                riderId: row.riderId,
                riderName: row.riderName,
                riderPhone: row.riderPhone,
                amount: shortAmount,
                date: selectedDate,
                reason: advReason,
                runningBalance: totalAdvance,
              });
            } catch (wErr) {
              console.warn('Notice writing shortage advance to Firestore:', wErr);
            }
          }

          if (targetRider) {
            const newAdvEntry: RiderAdvanceEntry = {
              id: advId || `adv_${Date.now()}`,
              riderId: targetRider.id,
              amount: shortAmount,
              date: selectedDate,
              reason: advReason,
              runningBalance: totalAdvance,
              createdAt: new Date().toISOString(),
              createdBy: authUser.name,
            };
            const updatedAdvances = [newAdvEntry, ...(targetRider.advances || [])];
            const updatedRider: Rider = {
              ...targetRider,
              totalAdvance,
              advances: updatedAdvances,
            };
            if (currentHubId) {
              saveRiderToFirestore(currentHubId, updatedRider).catch((e) =>
                console.warn('Notice saving rider advance:', e)
              );
              syncPublicRiderStatement(updatedRider, updatedAdvances).catch((e) =>
                console.warn('Notice syncing statement for shortage advance:', e)
              );
            }
          }

          const smsText = formatAdvanceSmsText({
            riderName: row.riderName,
            amount: shortAmount,
            reason: description,
            totalAdvance,
            statementUrl,
          });

          dispatchAutomatedSms({
            riderName: row.riderName,
            riderPhone: cleanPhone,
            amount: shortAmount,
            message: smsText,
            type: 'advance',
            statementUrl,
          }).catch((e) => console.warn('COD companion shortage SMS notice:', e));
        } catch (smsErr) {
          console.warn('COD companion shortage SMS hook error:', smsErr);
        }
      }

      // FEATURE B: Auto-write Incentive to Firestore on Extra/Surplus Deposit & Trigger Background SMS
      if (surplusAmount > 0) {
        try {
          const incReason = `COD Extra Surplus (₹${surplusAmount})`;
          let incId = '';
          if (currentHubId) {
            try {
              incId = await writeIncentiveEntryToFirestore(currentHubId, {
                riderId: row.riderId,
                riderName: row.riderName,
                riderPhone: row.riderPhone,
                amount: surplusAmount,
                date: selectedDate,
                reason: incReason,
                source: 'surplus',
                createdBy: authUser.name,
              });
            } catch (wErr) {
              console.warn('Notice writing surplus incentive to Firestore:', wErr);
            }
          }

          const currentTotalInc = (Number(targetRider?.totalIncentive) || 0) + surplusAmount;

          if (targetRider) {
            const newIncEntry: RiderIncentiveEntry = {
              id: incId || `inc_${Date.now()}`,
              riderId: targetRider.id,
              riderName: targetRider.name,
              riderPhone: targetRider.phone,
              amount: surplusAmount,
              date: selectedDate,
              reason: incReason,
              source: 'surplus',
              createdAt: new Date().toISOString(),
              createdBy: authUser.name,
            };
            const updatedIncentives = [newIncEntry, ...(targetRider.incentives || [])];
            const updatedRider: Rider = {
              ...targetRider,
              totalIncentive: currentTotalInc,
              incentives: updatedIncentives,
            };
            if (currentHubId) {
              saveRiderToFirestore(currentHubId, updatedRider).catch((e) =>
                console.warn('Notice saving rider surplus incentive:', e)
              );
              syncPublicRiderStatement(updatedRider, updatedRider.advances || []).catch((e) =>
                console.warn('Notice syncing statement for surplus incentive:', e)
              );
            }
          }

          const smsText = formatIncentiveSmsText({
            riderName: row.riderName,
            amount: surplusAmount,
            reason: incReason,
            totalIncentive: currentTotalInc,
            statementUrl,
          });

          dispatchAutomatedSms({
            riderName: row.riderName,
            riderPhone: cleanPhone,
            amount: surplusAmount,
            message: smsText,
            type: 'general',
            statementUrl,
          }).catch((e) => console.warn('COD companion surplus SMS notice:', e));
        } catch (surplusErr) {
          console.warn('COD companion surplus sync error:', surplusErr);
        }
      }
    } catch {
      showToast('शॉर्टेज/सरप्लस अपडेट विफल हुआ।', 'error');
    }
  };

  // Helper date stepper
  const handleDateStep = (days: number) => {
    const cur = new Date(selectedDate);
    cur.setDate(cur.getDate() + days);
    const y = cur.getFullYear();
    const m = String(cur.getMonth() + 1).padStart(2, '0');
    const d = String(cur.getDate()).padStart(2, '0');
    setSelectedDate(`${y}-${m}-${d}`);
  };

  // =========================================================================
  // VIEW 0.5: UNRESOLVED / INVALID HUB ERROR (Strict Hub Isolation)
  // =========================================================================
  if (authUser && !currentHubId) {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col justify-center items-center px-4 py-8 font-sans selection:bg-rose-500 selection:text-white">
        <div className="w-full max-w-md bg-white border border-rose-200 rounded-3xl p-6 sm:p-8 text-center shadow-lg relative overflow-hidden">
          <div className="w-16 h-16 rounded-2xl bg-rose-50 text-rose-500 border border-rose-200 flex items-center justify-center mx-auto mb-5 shadow-sm">
            <AlertCircle className="w-8 h-8" />
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 mb-2">
            हब त्रुटि
          </h2>
          <p className="text-sm sm:text-base text-rose-600 font-medium mb-6 leading-relaxed">
            हब की पहचान नहीं हो सकी। कृपया एडमिन से संपर्क करें।
          </p>
          <button
            type="button"
            onClick={handleLogout}
            className="w-full py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-sm font-bold transition flex items-center justify-center gap-2 cursor-pointer shadow-sm active:scale-95"
          >
            <LogOut className="w-4 h-4" />
            <span>लॉगआउट करें (Switch Account)</span>
          </button>
          {onBackToMainApp && (
            <button
              type="button"
              onClick={onBackToMainApp}
              className="w-full mt-3 py-2.5 px-4 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer shadow-sm active:scale-95 border border-slate-700"
            >
              <ChevronLeft className="w-4 h-4 text-emerald-400" />
              <span>← वापस एडमिन डैशबोर्ड (Back to Admin)</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  // =========================================================================
  // VIEW 1: DUAL-PORTAL LOGIN SCREEN (Rider vs Distinct Multicolor Staff)
  // =========================================================================
  if (!authUser) {
    const isStaffPortal = loginPortalMode === 'staff';

    return (
      <div className={`min-h-screen flex flex-col justify-center items-center px-4 py-8 font-sans selection:bg-fuchsia-500 selection:text-white transition-colors duration-500 ${
        isStaffPortal ? 'bg-slate-950 text-white' : 'bg-slate-50 text-slate-900'
      }`}>
        {/* Ambient Glowing Orbs */}
        {isStaffPortal ? (
          <div className="fixed inset-0 pointer-events-none overflow-hidden">
            <div className="absolute -top-32 -left-32 w-96 h-96 bg-violet-600/30 rounded-full blur-3xl animate-pulse" />
            <div className="absolute top-1/4 -right-32 w-96 h-96 bg-fuchsia-600/25 rounded-full blur-3xl" />
            <div className="absolute -bottom-32 left-1/4 w-96 h-96 bg-cyan-500/25 rounded-full blur-3xl" />
            <div className="absolute -bottom-20 -right-20 w-80 h-80 bg-amber-500/20 rounded-full blur-3xl" />
          </div>
        ) : (
          <div className="fixed inset-0 pointer-events-none opacity-40">
            <div className="absolute -top-40 -left-40 w-96 h-96 bg-emerald-100/60 rounded-full blur-3xl" />
            <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-blue-100/60 rounded-full blur-3xl" />
          </div>
        )}

        {/* Clear & Prominent Back to Admin Dashboard Header Button */}
        {onBackToMainApp && (
          <div className="w-full max-w-md mb-3 z-20 animate-in fade-in slide-in-from-top-2">
            <button
              type="button"
              id="companion-login-top-back-to-admin-btn"
              onClick={onBackToMainApp}
              className={`w-full py-2.5 px-4 rounded-xl font-bold text-xs shadow-lg transition active:scale-95 flex items-center justify-center gap-2 cursor-pointer border ${
                isStaffPortal
                  ? 'bg-slate-900/90 hover:bg-slate-800 text-slate-200 border-slate-700/80 hover:border-violet-500/50'
                  : 'bg-slate-900 hover:bg-slate-800 text-white border-slate-700 hover:border-emerald-500/50'
              }`}
            >
              <ChevronLeft className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>← वापस एडमिन डैशबोर्ड (Back to Admin)</span>
            </button>
          </div>
        )}

        {/* Live Cloud OTA Update Notification Banner on Login */}
        {isLiveUpdateAvailable && (
          <div className="w-full max-w-md mb-3 z-30 p-3 bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 text-white rounded-2xl shadow-xl flex items-center justify-between gap-3 animate-in fade-in slide-in-from-top-2">
            <div className="flex items-center gap-2">
              <span className="flex h-2.5 w-2.5 relative shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-white"></span>
              </span>
              <span className="text-xs font-bold leading-tight">🚀 नया लाइव क्लाउड अपडेट उपलब्ध है ({updateDetails.version || `v${CURRENT_LOCAL_VERSION}`})</span>
            </div>
            <button
              type="button"
              onClick={() => {
                setIsLiveUpdateAvailable(false);
                liveUpdateService.applyUpdate();
              }}
              className="px-3 py-1.5 bg-white text-emerald-800 text-xs font-black rounded-xl shadow-sm hover:bg-emerald-50 active:scale-95 cursor-pointer whitespace-nowrap shrink-0"
            >
              तुरंत सिंक करें
            </button>
          </div>
        )}

        {/* Portal Switcher Tabs: 🏍️ राइडर लॉगिन vs 🏢 ऑफिस स्टाफ लॉगिन */}
        <div className="w-full max-w-md mb-4 z-20 animate-in fade-in slide-in-from-top-1">
          <div className={`grid grid-cols-2 p-1.5 rounded-2xl border shadow-xl backdrop-blur-md transition-all ${
            isStaffPortal
              ? 'bg-slate-900/90 border-slate-700/80 shadow-purple-950/40'
              : 'bg-white/90 border-slate-200 shadow-slate-200/50'
          }`}>
            <button
              type="button"
              onClick={() => {
                setLoginPortalMode('rider');
                setLoginError('');
                try { localStorage.setItem('cp_login_portal_mode', 'rider'); } catch {}
              }}
              className={`py-2.5 px-3 rounded-xl font-extrabold text-xs sm:text-sm transition flex items-center justify-center gap-2 cursor-pointer ${
                !isStaffPortal
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-950/40 ring-1 ring-emerald-400/50'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Bike className="w-4 h-4 shrink-0" />
              <span>🏍️ राइडर लॉगिन</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setLoginPortalMode('staff');
                setLoginError('');
                try { localStorage.setItem('cp_login_portal_mode', 'staff'); } catch {}
              }}
              className={`py-2.5 px-3 rounded-xl font-extrabold text-xs sm:text-sm transition flex items-center justify-center gap-2 cursor-pointer ${
                isStaffPortal
                  ? 'bg-gradient-to-r from-violet-600 via-fuchsia-600 to-cyan-500 text-white shadow-lg shadow-purple-950/60 ring-1 ring-fuchsia-400/50'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Building2 className="w-4 h-4 text-cyan-300 shrink-0" />
              <span>🏢 ऑफिस स्टाफ</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold uppercase tracking-wider ${
                isStaffPortal ? 'bg-white/20 text-white' : 'bg-violet-100 text-violet-800'
              }`}>
                New
              </span>
            </button>
          </div>
        </div>

        {/* ================================================================ */}
        {/* TAB 1: RIDER LOGIN SCREEN (Clean Emerald Theme)                   */}
        {/* ================================================================ */}
        {!isStaffPortal && (
          <div className="relative w-full max-w-md bg-white border border-slate-200/90 rounded-2xl shadow-xl p-6 sm:p-8 z-10 animate-in fade-in duration-200">
            {/* Logo & Title */}
            <div className="text-center mb-6">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-slate-950 border border-sky-500/40 p-1 shadow-lg shadow-sky-950/40 mb-3 animate-in zoom-in-95">
                <img src="/rider-logo.svg" alt="Rider Logo" className="w-14 h-14 rounded-xl object-contain" />
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 flex items-center justify-center gap-2">
                <span>COD Entry</span>
                <span className="text-emerald-600 font-hindi">(राइडर साथी)</span>
              </h1>
              <p className="text-xs sm:text-sm text-slate-500 mt-1 font-medium">
                डिलीवरी बॉय कलेक्शन एंट्री • 0s लाइव सिंक
              </p>
            </div>

            {/* Rider Form */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleLogin();
              }}
              className="space-y-4"
            >
              {/* Phone Input */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  रजिस्टर्ड मोबाइल नंबर <span className="text-emerald-600 font-normal">(10 अंक)</span>
                </label>
                <div className="relative rounded-xl shadow-inner">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500 text-sm font-semibold">
                    <Phone className="w-4 h-4 mr-1 text-slate-400" />
                    <span>+91</span>
                  </div>
                  <input
                    type="tel"
                    pattern="[0-9]*"
                    maxLength={10}
                    inputMode="numeric"
                    placeholder="9876543210"
                    value={phoneInput}
                    onChange={(e) => {
                      const clean = normalizePhoneNumber(e.target.value);
                      setPhoneInput(clean);
                      if (loginError) setLoginError('');
                    }}
                    autoFocus
                    required
                    className="w-full pl-20 pr-4 py-3 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 placeholder-slate-400 text-base font-mono tracking-wider focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition"
                  />
                </div>
              </div>

              {/* Security PIN */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  4-अंकों का सिक्योरिटी PIN <span className="text-emerald-600 font-normal">(Security PIN)</span>
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <KeyRound className="w-4 h-4" />
                  </div>
                  <input
                    type="password"
                    maxLength={4}
                    inputMode="numeric"
                    pattern="[0-9]*"
                    placeholder="••••"
                    value={pinInput}
                    onChange={(e) => {
                      const clean = e.target.value.replace(/\D/g, '').slice(0, 4);
                      setPinInput(clean);
                      if (loginError) setLoginError('');
                    }}
                    required
                    className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 placeholder-slate-400 text-xl font-mono tracking-widest text-center focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition"
                  />
                </div>
              </div>

              {/* Error Message */}
              {loginError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-center gap-2 animate-in fade-in">
                  <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
                  <span className="font-medium">{loginError}</span>
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isLoggingIn || phoneInput.length !== 10 || pinInput.length !== 4}
                className="w-full py-3.5 px-4 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl shadow-md shadow-emerald-600/20 transition transform active:scale-98 flex items-center justify-center gap-2 cursor-pointer"
              >
                {isLoggingIn ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>सत्यापन हो रहा है...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-5 h-5 text-emerald-100" />
                    <span>लॉगिन करें (Sign In Rider)</span>
                  </>
                )}
              </button>
            </form>

            {/* Rider Instant Demo Login */}
            <div className="mt-5 pt-4 border-t border-slate-200">
              <button
                type="button"
                onClick={() => {
                  setPhoneInput('9876543210');
                  setPinInput('1234');
                  handleLogin('9876543210', '1234');
                }}
                className="w-full p-2.5 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-xl text-left transition flex items-center justify-between"
              >
                <div>
                  <div className="font-bold text-emerald-800 text-xs">🏍️ 1-क्लिक राइडर टेस्ट खाता</div>
                  <div className="text-[11px] text-emerald-600 font-mono">सुरेश कुमार (9876543210 / 1234)</div>
                </div>
                <span className="text-[10px] bg-emerald-600 text-white font-bold px-2 py-1 rounded-lg">
                  लॉगिन करें ➔
                </span>
              </button>
            </div>

            {/* Switch to Staff Portal Link */}
            <div className="mt-4 text-center">
              <button
                type="button"
                onClick={() => {
                  setLoginPortalMode('staff');
                  setLoginError('');
                }}
                className="text-xs text-violet-700 hover:text-violet-900 font-bold transition inline-flex items-center gap-1.5"
              >
                <span>ऑफिस स्टाफ हैं? यहाँ से स्टाफ पोर्टल पर जाएँ ➔</span>
              </button>
            </div>

            {/* Live Cloud Sync Status Footer */}
            <div className="mt-4 pt-3 border-t border-slate-200/80 flex items-center justify-between text-[11px] text-slate-500">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                <span>हाइब्रिड क्लाउड सिंक: <b className="text-emerald-700">v{CURRENT_LOCAL_VERSION}</b></span>
              </div>
              <button
                type="button"
                onClick={handleManualCloudSync}
                disabled={isSyncingLiveCloud}
                className="text-emerald-700 hover:text-emerald-900 font-bold flex items-center gap-1 transition cursor-pointer"
                title="नया क्लाउड अपडेट जांचें"
              >
                <RefreshCw className={`w-3 h-3 ${isSyncingLiveCloud ? 'animate-spin' : ''}`} />
                <span>{isSyncingLiveCloud ? 'जांच जारी...' : 'अपडेट जांचें'}</span>
              </button>
            </div>
          </div>
        )}

        {/* ================================================================ */}
        {/* TAB 2: DISTINCT MULTICOLOR OFFICE STAFF LOGIN SCREEN (New Look)  */}
        {/* ================================================================ */}
        {isStaffPortal && (
          <div className="relative w-full max-w-md z-10 animate-in fade-in zoom-in-95 duration-200">
            {/* Outer Multicolor Gradient Glow Ring */}
            <div className="relative p-[2px] rounded-3xl bg-gradient-to-r from-violet-500 via-fuchsia-500 via-amber-400 to-cyan-400 shadow-2xl shadow-indigo-950/80">
              {/* Inner Frosted Dark Card */}
              <div className="bg-slate-900/95 backdrop-blur-2xl rounded-[22px] p-6 sm:p-8 text-white border border-white/10">
                {/* Header Insignia & Multicolor Badges */}
                <div className="text-center mb-6">
                  {/* Glowing 3D Insignia Badge */}
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500 via-fuchsia-500 to-cyan-400 p-[2px] shadow-xl shadow-fuchsia-950/60 mx-auto mb-3">
                    <div className="w-full h-full bg-slate-950 rounded-[14px] flex items-center justify-center">
                      <Building2 className="w-8 h-8 text-cyan-300" />
                    </div>
                  </div>

                  {/* Top Office Portal Pill */}
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-gradient-to-r from-violet-500/30 via-fuchsia-500/30 to-cyan-500/30 border border-violet-400/40 text-violet-200 mb-2 shadow-inner">
                    <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
                    <span>HUB OFFICE STAFF PORTAL • TALLY & AUDIT</span>
                  </div>

                  {/* Gradient Headline */}
                  <h1 className="text-2xl sm:text-3xl font-black tracking-tight bg-gradient-to-r from-violet-200 via-pink-200 to-cyan-200 bg-clip-text text-transparent">
                    हब ऑफिस स्टाफ लॉगिन
                  </h1>
                  <p className="text-xs sm:text-sm text-slate-300 font-medium mt-1">
                    निरीक्षण, कैश टैली एवं (✓) सत्यापन काउंटर
                  </p>

                  {/* 3 Multicolor Feature Badges */}
                  <div className="grid grid-cols-3 gap-1.5 mt-3 pt-2 border-t border-slate-800 text-[10px] font-bold">
                    <div className="bg-cyan-950/60 text-cyan-300 border border-cyan-500/30 py-1 px-1.5 rounded-lg flex items-center justify-center gap-1">
                      <Search className="w-3 h-3 text-cyan-400 shrink-0" />
                      <span>जांच (Audit)</span>
                    </div>
                    <div className="bg-emerald-950/60 text-emerald-300 border border-emerald-500/30 py-1 px-1.5 rounded-lg flex items-center justify-center gap-1">
                      <Check className="w-3 h-3 text-emerald-400 shrink-0" />
                      <span>(✓) टिक Tally</span>
                    </div>
                    <div className="bg-amber-950/60 text-amber-300 border border-amber-500/30 py-1 px-1.5 rounded-lg flex items-center justify-center gap-1">
                      <Lock className="w-3 h-3 text-amber-400 shrink-0" />
                      <span>नो एडिट सुरक्षित</span>
                    </div>
                  </div>
                </div>

                {/* Staff Form */}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleLogin();
                  }}
                  className="space-y-4"
                >
                  {/* Phone Input */}
                  <div>
                    <label className="block text-xs font-bold text-violet-300 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                      <span>स्टाफ रजिस्टर्ड मोबाइल नंबर</span>
                      <span className="text-cyan-400 font-normal">(10 अंक)</span>
                    </label>
                    <div className="relative rounded-xl">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 text-sm font-semibold">
                        <Phone className="w-4 h-4 mr-1 text-cyan-400" />
                        <span className="text-slate-400">+91</span>
                      </div>
                      <input
                        type="tel"
                        pattern="[0-9]*"
                        maxLength={10}
                        inputMode="numeric"
                        placeholder="9876543211"
                        value={phoneInput}
                        onChange={(e) => {
                          const clean = normalizePhoneNumber(e.target.value);
                          setPhoneInput(clean);
                          if (loginError) setLoginError('');
                        }}
                        autoFocus
                        required
                        className="w-full pl-20 pr-4 py-3 bg-slate-950/80 border border-slate-700 rounded-xl text-white placeholder-slate-500 text-base font-mono tracking-wider focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-cyan-400 transition"
                      />
                    </div>
                  </div>

                  {/* Security PIN */}
                  <div>
                    <label className="block text-xs font-bold text-violet-300 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                      <span>4-अंकों का स्टाफ सिक्योरिटी PIN</span>
                      <span className="text-fuchsia-400 font-normal">(Security PIN)</span>
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-fuchsia-400">
                        <KeyRound className="w-4 h-4" />
                      </div>
                      <input
                        type="password"
                        maxLength={4}
                        inputMode="numeric"
                        pattern="[0-9]*"
                        placeholder="••••"
                        value={pinInput}
                        onChange={(e) => {
                          const clean = e.target.value.replace(/\D/g, '').slice(0, 4);
                          setPinInput(clean);
                          if (loginError) setLoginError('');
                        }}
                        required
                        className="w-full pl-10 pr-4 py-3 bg-slate-950/80 border border-slate-700 rounded-xl text-white placeholder-slate-500 text-xl font-mono tracking-widest text-center focus:outline-none focus:ring-2 focus:ring-fuchsia-400 focus:border-fuchsia-400 transition"
                      />
                    </div>
                  </div>

                  {/* Error Message */}
                  {loginError && (
                    <div className="p-3 bg-rose-950/80 border border-rose-500/50 rounded-xl text-rose-200 text-xs flex items-center gap-2 animate-in fade-in">
                      <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                      <span className="font-medium">{loginError}</span>
                    </div>
                  )}

                  {/* Submit Button with Multicolor Gradient */}
                  <button
                    type="submit"
                    disabled={isLoggingIn || phoneInput.length !== 10 || pinInput.length !== 4}
                    className="w-full py-3.5 px-4 bg-gradient-to-r from-violet-600 via-fuchsia-600 to-cyan-500 hover:from-violet-500 hover:via-fuchsia-500 hover:to-cyan-400 disabled:opacity-50 disabled:cursor-not-allowed text-white font-black rounded-xl shadow-xl shadow-fuchsia-950/50 transition transform active:scale-98 flex items-center justify-center gap-2 cursor-pointer border border-white/20"
                  >
                    {isLoggingIn ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin text-cyan-200" />
                        <span>स्टाफ सत्यापन हो रहा है...</span>
                      </>
                    ) : (
                      <>
                        <Building2 className="w-5 h-5 text-cyan-200" />
                        <span>🏢 स्टाफ लॉगिन करें (Sign In Staff)</span>
                      </>
                    )}
                  </button>
                </form>

                {/* Important Security Notice Banner */}
                <div className="mt-4 p-3 rounded-xl bg-gradient-to-r from-violet-950/60 via-slate-950 to-cyan-950/60 border border-violet-500/30 text-[11px] text-slate-300 space-y-1">
                  <div className="flex items-center gap-1.5 font-bold text-amber-300">
                    <span>🔒 ऑडिट सुरक्षा नियम:</span>
                  </div>
                  <p className="leading-relaxed">
                    ऑफिस स्टाफ केवल राइडर के हिसाब की जांच कर सकते हैं और <strong>(✓) टिक</strong> कर सकते हैं। प्रविष्टियों में कोई बदलाव (Edit) नहीं किया जा सकता।
                  </p>
                </div>

                {/* Quick Staff Demo Accounts (Multicolor Cards) */}
                <div className="mt-5 pt-4 border-t border-slate-800">
                  <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center justify-between">
                    <span>त्वरित टेस्ट स्टाफ खाते (1-Click Test):</span>
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setPhoneInput('9876543211');
                        setPinInput('4321');
                        handleLogin('9876543211', '4321');
                      }}
                      className="p-2 rounded-xl bg-gradient-to-b from-cyan-950/60 to-slate-950 border border-cyan-500/40 hover:border-cyan-400 text-left transition active:scale-95 cursor-pointer"
                    >
                      <div className="font-extrabold text-cyan-300 text-[11px] truncate">🎖️ टीम लीडर</div>
                      <div className="text-[9px] text-slate-400 font-mono">9876543211</div>
                      <div className="text-[9px] text-cyan-400 font-mono">PIN: 4321</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPhoneInput('9876543212');
                        setPinInput('5678');
                        handleLogin('9876543212', '5678');
                      }}
                      className="p-2 rounded-xl bg-gradient-to-b from-purple-950/60 to-slate-950 border border-purple-500/40 hover:border-purple-400 text-left transition active:scale-95 cursor-pointer"
                    >
                      <div className="font-extrabold text-purple-300 text-[11px] truncate">📋 सुपरवाइजर</div>
                      <div className="text-[9px] text-slate-400 font-mono">9876543212</div>
                      <div className="text-[9px] text-purple-400 font-mono">PIN: 5678</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPhoneInput('9876543213');
                        setPinInput('9999');
                        handleLogin('9876543213', '9999');
                      }}
                      className="p-2 rounded-xl bg-gradient-to-b from-amber-950/60 to-slate-950 border border-amber-500/40 hover:border-amber-400 text-left transition active:scale-95 cursor-pointer"
                    >
                      <div className="font-extrabold text-amber-300 text-[11px] truncate">👑 हब इंचार्ज</div>
                      <div className="text-[9px] text-slate-400 font-mono">9876543213</div>
                      <div className="text-[9px] text-amber-400 font-mono">PIN: 9999</div>
                    </button>
                  </div>
                </div>

                {/* Switch to Rider Portal Link */}
                <div className="mt-4 text-center">
                  <button
                    type="button"
                    onClick={() => {
                      setLoginPortalMode('rider');
                      setLoginError('');
                    }}
                    className="text-xs text-cyan-400 hover:text-cyan-300 font-bold transition inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <span>राइडर हैं? यहाँ से राइडर लॉगिन पर जाएँ ➔</span>
                  </button>
                </div>

                {/* Live Cloud Sync Status Footer */}
                <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between text-[11px] text-slate-400">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></span>
                    <span>हाइब्रिड क्लाउड सिंक: <b className="text-cyan-300">v{CURRENT_LOCAL_VERSION}</b></span>
                  </div>
                  <button
                    type="button"
                    onClick={handleManualCloudSync}
                    disabled={isSyncingLiveCloud}
                    className="text-cyan-400 hover:text-cyan-200 font-bold flex items-center gap-1 transition cursor-pointer"
                    title="नया क्लाउड अपडेट जांचें"
                  >
                    <RefreshCw className={`w-3 h-3 ${isSyncingLiveCloud ? 'animate-spin' : ''}`} />
                    <span>{isSyncingLiveCloud ? 'जांच जारी...' : 'अपडेट जांचें'}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Hub Resolution Indicator */}
        <div className="mt-4 pt-3 text-center text-[10px] font-mono z-10">
          {currentHubId ? (
            <span className={isStaffPortal ? 'text-cyan-400 font-semibold' : 'text-emerald-700 font-semibold'}>
              Hub: {currentHubId.substring(0, 8)} (सत्यापित हब)
            </span>
          ) : resolvedPreviewHub ? (
            <span className={isStaffPortal ? 'text-cyan-400 font-semibold' : 'text-emerald-700 font-semibold'}>
              Hub: {resolvedPreviewHub.substring(0, 8)} (सत्यापित हब)
            </span>
          ) : isResolvingHub ? (
            <span className="text-violet-400 animate-pulse font-medium">
              हब खोज रहे हैं...
            </span>
          ) : (
            <span className="text-slate-500">
              सुरक्षित कूरियर हब लॉगिन • 0s लाइव सिंक
            </span>
          )}
        </div>
      </div>
    );
  }

  // =========================================================================
  // VIEW 2: AUTHENTICATED COMPANION MOBILE WEB APP (Clean White Theme)
  // =========================================================================
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans pb-16 selection:bg-emerald-500 selection:text-white w-full max-w-[100vw] overflow-x-hidden">
      {/* Prominent Admin Dashboard Return Top Bar */}
      {onBackToMainApp && !isRiderFlavor && !isRider && (
        <div 
          id="companion-authenticated-top-admin-banner"
          className="bg-slate-900 border-b border-slate-800 text-white px-3 sm:px-6 py-2.5 flex items-center justify-between text-xs sticky top-0 z-50 shadow-md"
        >
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="font-semibold text-slate-200">एडमिन मोड: साथी ऐप (Rider Entry) दृश्य खुला है</span>
          </div>
          <button
            type="button"
            id="top-banner-back-to-admin-btn"
            onClick={onBackToMainApp}
            className="px-3.5 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs transition active:scale-95 flex items-center gap-1.5 shadow cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4 text-slate-950 stroke-[3]" />
            <span>← वापस एडमिन डैशबोर्ड (Back to Admin)</span>
          </button>
        </div>
      )}

      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl shadow-xl text-xs sm:text-sm font-semibold flex items-center gap-2 backdrop-blur-md animate-in slide-in-from-top-4 ${
            toast.type === 'success'
              ? 'bg-emerald-600 text-white border border-emerald-500'
              : toast.type === 'error'
              ? 'bg-rose-600 text-white border border-rose-500'
              : 'bg-indigo-600 text-white border border-indigo-500'
          }`}
        >
          {toast.type === 'success' && <CheckCircle2 className="w-4 h-4 shrink-0" />}
          {toast.type === 'error' && <AlertCircle className="w-4 h-4 shrink-0" />}
          {toast.type === 'info' && <RefreshCw className="w-4 h-4 shrink-0" />}
          <span>{toast.text}</span>
        </div>
      )}

      {/* Super Admin Access Control Gate: If hub's codCompanionAccess is toggled OFF */}
      {isCodCompanionBlocked && (
        <div className="fixed inset-0 z-50 bg-slate-900 text-white flex flex-col items-center justify-center p-6 text-center animate-in fade-in">
          <div className="max-w-md w-full bg-slate-800 border border-rose-500/30 rounded-2xl p-6 sm:p-8 shadow-2xl space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-rose-500/20 text-rose-400 border border-rose-500/30 flex items-center justify-center mx-auto text-3xl shadow-inner">
              🔒
            </div>
            <h2 className="text-xl font-black text-white">
              COD साथी ऐप अनुमति बंद है
            </h2>
            <span className="inline-block px-3 py-1 rounded-full text-xs font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">
              Access Blocked by Master Admin
            </span>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed pt-2">
              इस हब के लिए मास्टर एडमिन द्वारा COD साथी ऐप (Companion Access) को बंद (Disabled) कर दिया गया है। कृपया अपने हब एडमिन या मास्टर एडमिन से संपर्क करें।
            </p>
            <div className="pt-4 flex flex-col sm:flex-row gap-2.5 justify-center">
              {onBackToMainApp && (
                <button
                  type="button"
                  onClick={onBackToMainApp}
                  className="px-4 py-2.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-white text-xs font-bold transition cursor-pointer"
                >
                  ← मुख्य ऐप पर लौटें
                </button>
              )}
              <button
                type="button"
                onClick={handleLogout}
                className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition cursor-pointer shadow-lg shadow-rose-950/40"
              >
                लॉगआउट करें
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Live Cloud OTA Update Notification Banner */}
      {isLiveUpdateAvailable && (
        <div className="bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 text-white px-4 py-2.5 shadow-md flex items-center justify-between gap-3 text-xs sm:text-sm animate-in slide-in-from-top duration-300 z-50 sticky top-0">
          <div className="flex items-center gap-2">
            <span className="flex h-2.5 w-2.5 relative shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-white"></span>
            </span>
            <span className="font-bold">🚀 नया लाइव क्लाउड अपडेट उपलब्ध है ({updateDetails.version || `v${CURRENT_LOCAL_VERSION}`})</span>
            <span className="hidden md:inline text-emerald-100 text-xs">
              • बिना APK डाउनलोड किए लाइव सिंक करें
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              setIsLiveUpdateAvailable(false);
              liveUpdateService.applyUpdate();
            }}
            className="px-3.5 py-1.5 bg-white hover:bg-slate-100 text-emerald-800 font-black text-xs rounded-lg shadow-sm transition transform active:scale-95 cursor-pointer whitespace-nowrap flex items-center gap-1.5 shrink-0"
          >
            <RefreshCw className="w-3.5 h-3.5 text-emerald-700" />
            <span>तुरंत लागू करें</span>
          </button>
        </div>
      )}

      {/* 1. STICKY TOP APP BAR (Crisp White with Indigo Header Accent) */}
      <header className="sticky top-0 z-40 bg-white/95 border-b border-slate-200 backdrop-blur-md px-3 sm:px-6 py-3 shadow-sm">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-2">
          {/* Brand & Active User Info */}
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-slate-950 border border-sky-500/40 p-0.5 flex items-center justify-center shrink-0 shadow-sm">
              <img src="/rider-logo.svg" alt="Rider App Logo" className="w-8 h-8 rounded-lg object-contain" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-sm sm:text-base font-extrabold text-slate-900 tracking-tight truncate">
                  COD Entry <span className="text-indigo-600 font-hindi">(हिसाब किताब)</span>
                </h1>
                {/* Role Badge */}
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider shrink-0 ${
                    authUser.role === 'rider'
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : authUser.role === 'team_leader'
                      ? 'bg-sky-50 text-sky-700 border border-sky-200'
                      : authUser.role === 'supervisor'
                      ? 'bg-purple-50 text-purple-700 border border-purple-200'
                      : 'bg-amber-50 text-amber-700 border border-amber-200'
                  }`}
                >
                  {authUser.role === 'rider' && '🏍️ राइडर'}
                  {authUser.role === 'team_leader' && '🎖️ TL'}
                  {authUser.role === 'supervisor' && '📋 सुपरवाइजर'}
                  {authUser.role === 'hub_incharge' && '👑 हब इंचार्ज'}
                </span>
              </div>
              <div className="text-[11px] text-slate-500 truncate flex items-center gap-1.5 flex-wrap">
                <span className="font-semibold text-slate-800">{authUser.name}</span>
                {authUser.phone && <span>• {authUser.phone}</span>}
                <span className="text-[10px] bg-emerald-50 text-emerald-800 px-2 py-0.5 rounded-full font-mono font-bold border border-emerald-200 flex items-center gap-1">
                  <Building2 className="w-3 h-3 text-emerald-600" />
                  <span>हब: {currentHubId.substring(0, 10)}{currentHubId.length > 10 ? '…' : ''}</span>
                  <span className="text-emerald-500">•</span>
                  <span>{hubRiders.length} राइडर्स</span>
                </span>
              </div>
            </div>
          </div>

          {/* Right Controls: Real-time Indicator & Logout */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Live Synced Indicator */}
            <div
              className={`hidden sm:flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full border ${
                isRealtimeConnected
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200 font-medium'
                  : 'bg-amber-50 text-amber-700 border-amber-200 font-medium'
              }`}
              title="Firebase Firestore onSnapshot Live Sync"
            >
              {isRealtimeConnected ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping inline-block" />
                  <span>0s लाइव सिंक</span>
                </>
              ) : (
                <>
                  <WifiOff className="w-3 h-3 text-amber-500" />
                  <span>ऑफ़लाइन</span>
                </>
              )}
            </div>

            {/* Live Cloud OTA Update / Sync Trigger */}
            <button
              type="button"
              onClick={handleManualCloudSync}
              disabled={isSyncingLiveCloud}
              className={`px-2.5 py-1.5 rounded-lg border text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-2xs active:scale-95 ${
                isLiveUpdateAvailable
                  ? 'bg-amber-500 hover:bg-amber-600 border-amber-600 text-white animate-bounce'
                  : 'bg-emerald-50 hover:bg-emerald-100 border-emerald-200 text-emerald-800'
              }`}
              title={isLiveUpdateAvailable ? 'नया क्लाउड अपडेट उपलब्ध है!' : 'क्लाउड लाइव सिंक जांचें'}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLiveUpdateAvailable ? 'text-white' : 'text-emerald-600'} ${isSyncingLiveCloud ? 'animate-spin' : ''}`} />
              <span className="inline-flex items-center gap-1">
                <span className={`w-1.5 h-1.5 rounded-full ${isLiveUpdateAvailable ? 'bg-white animate-ping' : 'bg-emerald-500 animate-pulse'}`}></span>
                <span className="hidden sm:inline">{isLiveUpdateAvailable ? 'अपडेट उपलब्ध!' : 'क्लाउड सिंक'}</span>
              </span>
            </button>

            {/* Back to Admin Dashboard if triggered */}
            {onBackToMainApp && !isRiderFlavor && !isRider && (
              <button
                type="button"
                id="header-back-to-admin-btn"
                onClick={onBackToMainApp}
                className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-1.5 transition cursor-pointer border border-slate-700 shadow-sm active:scale-95"
                title="वापस एडमिन डैशबोर्ड (Back to Admin)"
              >
                <ChevronLeft className="w-3.5 h-3.5 text-emerald-400" />
                <span>← वापस एडमिन डैशबोर्ड</span>
              </button>
            )}

            {/* Logout Button */}
            <button
              type="button"
              onClick={handleLogout}
              className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold flex items-center gap-1 transition cursor-pointer"
              title="लॉगआउट"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">लॉगआउट</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Body */}
      <main className="max-w-6xl mx-auto w-full px-3 sm:px-6 pt-4 space-y-4">

        {/* RIDER SPECIFIC PORTAL SWITCHER: Daily COD & Delivery vs My Khatabook Statement */}
        {isRider && (
          <div className="bg-white border border-slate-200 rounded-2xl p-1.5 flex items-center gap-2 shadow-xs">
            <button
              type="button"
              onClick={() => setRiderActiveTab('cod_entry')}
              className={`flex-1 py-2.5 px-3 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition cursor-pointer ${
                riderActiveTab === 'cod_entry'
                  ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-600/20'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <Bike className="w-4 h-4" />
              <span>📦 दैनिक डिलीवरी व COD प्रविष्टि</span>
            </button>
            <button
              type="button"
              onClick={() => setRiderActiveTab('khatabook')}
              className={`flex-1 py-2.5 px-3 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition cursor-pointer ${
                riderActiveTab === 'khatabook'
                  ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/20'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <Receipt className="w-4 h-4" />
              <span>📖 मेरा हिसाब किताब (Hisab Kitab)</span>
            </button>
          </div>
        )}

        {isRider && riderActiveTab === 'khatabook' ? (
          <div className="bg-white text-slate-900 rounded-2xl p-2 sm:p-4 shadow-sm border border-slate-200">
            <RiderLedgerStatement riderId={currentRiderId} isAdmin={false} />
          </div>
        ) : (
          <>
            {/* 2. DATE SELECTOR & STATUS TOOLBAR */}
            <div className="bg-white border border-slate-200 rounded-2xl p-3 sm:p-4 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-sm">
          {/* Date Navigator */}
          <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-start">
            <button
              type="button"
              onClick={() => handleDateStep(-1)}
              className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition cursor-pointer"
              title="पिछला दिन"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-emerald-600 shrink-0" />
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
              {!isToday && (
                <button
                  type="button"
                  onClick={() => setSelectedDate(todayStr)}
                  className="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs rounded font-semibold transition cursor-pointer"
                >
                  आज (Today)
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => handleDateStep(1)}
              className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition cursor-pointer"
              title="अगला दिन"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Date Status Badges & Incharge Controls */}
          <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
            {isPastDate && (
              <span className="text-xs bg-slate-100 border border-slate-200 text-amber-700 px-2.5 py-1 rounded-lg flex items-center gap-1.5 font-medium">
                <Lock className="w-3.5 h-3.5 text-amber-600" />
                <span>पुराना रिकॉर्ड (Read-Only)</span>
              </span>
            )}

            {isDayEndLocked ? (
              <span className="text-xs bg-rose-50 border border-rose-200 text-rose-700 px-2.5 py-1 rounded-lg flex items-center gap-1.5 font-medium">
                <Lock className="w-3.5 h-3.5 text-rose-600" />
                <span>दिन का हिसाब लॉक (Locked)</span>
              </span>
            ) : isToday ? (
              <span className="text-xs bg-emerald-50 border border-emerald-200 text-emerald-700 px-2.5 py-1 rounded-lg flex items-center gap-1.5 font-medium">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                <span>आज का दिन (Active)</span>
              </span>
            ) : null}

            {/* Hub Incharge Toggle Lock Button */}
            {canToggleLock && (
              <button
                type="button"
                onClick={handleToggleDayEndLock}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 shadow-sm cursor-pointer ${
                  isDayEndLocked
                    ? 'bg-amber-600 hover:bg-amber-700 text-white'
                    : 'bg-rose-600 hover:bg-rose-700 text-white'
                }`}
              >
                {isDayEndLocked ? (
                  <>
                    <Unlock className="w-3.5 h-3.5" />
                    <span>अनलॉक करें (Unlock Day)</span>
                  </>
                ) : (
                  <>
                    <Lock className="w-3.5 h-3.5" />
                    <span>दिन का हिसाब लॉक करें</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        {/* 3. RIDER SHORTAGE ALERT BANNER (Rider App Visibility) */}
        {myShortageAlert && (
          <div className="bg-rose-50 border-2 border-rose-200 rounded-2xl p-4 shadow-sm animate-in zoom-in-95">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-xl bg-rose-100 text-rose-600 shrink-0">
                <AlertTriangle className="w-6 h-6 animate-pulse" />
              </div>
              <div className="space-y-1.5 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-rose-800">
                    ⚠️ हिसाब में शॉर्टेज पाई गई है! (Shortage Flagged by Hub)
                  </h3>
                  <span className="text-xs bg-rose-600 text-white font-extrabold px-2 py-0.5 rounded-full font-mono">
                    कुल कमी: {formatINR(myShortageAlert.totalShort)}
                  </span>
                </div>
                <p className="text-xs text-rose-700">
                  हब सुपरवाइजर/इंचार्ज द्वारा आपके आज के जमा में निम्नलिखित अंतर दर्ज किया गया है:
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                  {myShortageAlert.items.map((item, idx) => (
                    <div
                      key={idx}
                      className="bg-white border border-rose-200 rounded-xl px-3 py-1.5 text-xs flex items-center justify-between shadow-xs"
                    >
                      <span className="font-medium text-slate-700">{item.label}:</span>
                      <span className="font-bold text-rose-600 font-mono">-{formatINR(item.amount)}</span>
                      {item.notes && <span className="text-[10px] text-slate-500 truncate max-w-[120px]">({item.notes})</span>}
                    </div>
                  ))}
                </div>
                <div className="text-[11px] text-amber-800 font-medium pt-1">
                  💡 कृपया तुरंत हब कैश काउंटर पर संपर्क कर अपनी रसीद या बैंक UPI यूटीआर दिखाएं।
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 4. SUMMARY STATS CARDS (Crisp White with Soft Borders) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
          {/* Card 1: Total COD */}
          <div className="bg-white border border-slate-200 rounded-2xl p-3 sm:p-4 shadow-sm">
            <div className="text-[11px] font-semibold text-slate-500 flex items-center gap-1.5 mb-1">
              <Building2 className="w-3.5 h-3.5 text-sky-600" />
              <span>{isRider ? 'मेरी कुल COD' : 'हब कुल COD'}</span>
            </div>
            <div className="text-lg sm:text-2xl font-extrabold text-slate-900 font-mono">
              {formatINR(isRider && myRiderRow ? myRiderRow.totalCod : stats.totalCod)}
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">
              {sheetData.company1Name} + {sheetData.company2Name}
            </div>
          </div>

          {/* Card 2: Total Deposit */}
          <div className="bg-white border border-slate-200 rounded-2xl p-3 sm:p-4 shadow-sm">
            <div className="text-[11px] font-semibold text-slate-500 flex items-center gap-1.5 mb-1">
              <Coins className="w-3.5 h-3.5 text-emerald-600" />
              <span>{isRider ? 'मेरी कुल जमा' : 'कुल जमा (Deposit)'}</span>
            </div>
            <div className="text-lg sm:text-2xl font-extrabold text-emerald-600 font-mono">
              {formatINR(isRider && myRiderRow ? myRiderRow.totalDeposit : stats.totalDeposit)}
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">
              कैश + ऑनलाइन UPI
            </div>
          </div>

          {/* Card 3: Difference / Balance */}
          <div className="bg-white border border-slate-200 rounded-2xl p-3 sm:p-4 shadow-sm">
            <div className="text-[11px] font-semibold text-slate-500 flex items-center gap-1.5 mb-1">
              <Clock className="w-3.5 h-3.5 text-amber-600" />
              <span>अंतर / बकाया (Due)</span>
            </div>
            {(() => {
              const bal = isRider && myRiderRow ? myRiderRow.balance : stats.totalBalance;
              return (
                <div
                  className={`text-lg sm:text-2xl font-extrabold font-mono ${
                    bal === 0
                      ? 'text-emerald-600'
                      : bal > 0
                      ? 'text-amber-600'
                      : 'text-purple-600'
                  }`}
                >
                  {formatINR(bal)}
                </div>
              );
            })()}
            <div className="text-[10px] text-slate-400 mt-0.5">
              कुल COD - कुल जमा
            </div>
          </div>

          {/* Card 4: Shortages Flagged */}
          <div className="bg-white border border-slate-200 rounded-2xl p-3 sm:p-4 shadow-sm">
            <div className="text-[11px] font-semibold text-slate-500 flex items-center gap-1.5 mb-1">
              <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
              <span>शॉर्टेज (Shortage)</span>
            </div>
            <div className="text-lg sm:text-2xl font-extrabold text-rose-600 font-mono">
              {formatINR(isRider && myRiderRow ? (myShortageAlert?.totalShort || 0) : stats.totalShortage)}
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">
              पेंडिंग रिकवरी
            </div>
          </div>
        </div>

        {/* 5. RIDER HIGHLIGHT & DIRECT EDIT CTA (If logged in as Rider) */}
        {isRider && (
          <div 
            onClick={() => {
              if (myRiderRow && canEditRow(myRiderRow)) {
                handleOpenEditRow(myRiderRow);
              } else if (!isPastDate && !isDayEndLocked) {
                handleOpenEditRow(null);
              }
            }}
            className="cursor-pointer bg-white border border-emerald-200 hover:border-emerald-400 rounded-2xl p-4 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3 transition active:scale-[0.99]"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 border border-emerald-200">
                <Edit3 className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <span>आपकी दैनिक COD शीट ({selectedDate})</span>
                  <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-bold">
                    क्लिक कर भरें
                  </span>
                </h4>
                <p className="text-xs text-slate-500">
                  {myRiderRow && (Number(myRiderRow.totalCod) > 0 || Number(myRiderRow.totalDeposit) > 0 || Number(myRiderRow.deliveryCount) > 0)
                    ? (() => {
                        const compStr = hubCodCompanies.map((c, i) => {
                          const a = myRiderRow.companyAmounts && myRiderRow.companyAmounts[c] !== undefined
                            ? myRiderRow.companyAmounts[c]
                            : i === 0 ? myRiderRow.company1Amount : i === 1 ? myRiderRow.company2Amount : 0;
                          return `${c}: ₹${a}`;
                        }).join(' | ');
                        return `दर्ज: 📦 डिलीवरी: ${myRiderRow.deliveryCount || 0} pkts | ${compStr} | कैश: ₹${myRiderRow.cashDeposit} | UPI: ₹${myRiderRow.onlineDeposit}`;
                      })()
                    : 'आज की एंट्री अभी खाली है। तुरंत टैप कर दर्ज करें।'}
                </p>
              </div>
            </div>
            {!isPastDate && !isDayEndLocked && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleOpenEditRow(myRiderRow);
                }}
                className="w-full sm:w-auto px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm rounded-xl shadow-md shadow-emerald-600/20 transition flex items-center justify-center gap-2 cursor-pointer"
              >
                <Edit3 className="w-4 h-4" />
                <span>✍️ अपनी COD एंट्री भरें / एडिट करें</span>
              </button>
            )}
          </div>
        )}

        {/* 6. GRID / CARDS SEARCH & VIEW SWITCHER */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
          {/* Search Input */}
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="राइडर नाम या फोन से खोजें..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-500 shadow-xs"
            />
          </div>

          {/* View Mode Toggle: Cards vs Table */}
          <div className="flex items-center gap-1.5 self-end sm:self-auto bg-slate-100 p-1 rounded-xl border border-slate-200">
            <button
              type="button"
              onClick={() => setViewMode('cards')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
                viewMode === 'cards'
                  ? 'bg-white text-emerald-700 shadow-xs border border-slate-200'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>कार्ड दृश्य (Mobile Touch)</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
                viewMode === 'table'
                  ? 'bg-white text-emerald-700 shadow-xs border border-slate-200'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>एक्सेल शीट (Spreadsheet)</span>
            </button>
          </div>
        </div>

        {/* 7. RENDERING ENTRIES: CARDS VIEW (Clean White UI) */}
        {viewMode === 'cards' && (
          <div className="space-y-3">
            {/* Hub Daily Feed Banner for Riders */}
            {isRider && (
              <div className="bg-slate-50 border border-slate-200 rounded-2xl px-3.5 py-2.5 flex items-center justify-between text-xs text-slate-600 flex-wrap gap-2 shadow-xs">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0"></span>
                  <span className="font-bold text-slate-800">हब दैनिक प्रविष्टि फीड (Hub Daily Summary)</span>
                  <span className="text-slate-300">•</span>
                  <span className="font-semibold text-slate-600">{filteredEntries.length} सक्रिय राइडर्स</span>
                </div>
                <span className="text-[11px] text-slate-500 font-medium">
                  पारदर्शिता हेतु सभी सक्रिय राइडर्स की एंट्री दृश्यमान (अन्य राइडर्स: Read-Only)
                </span>
              </div>
            )}

            {filteredEntries.length === 0 ? (
              <div className="text-center py-10 bg-white border border-slate-200 rounded-2xl p-6 text-slate-500 space-y-3 shadow-sm">
                <Bike className="w-10 h-10 mx-auto text-slate-400 mb-2" />
                <p className="text-sm font-semibold text-slate-800">कोई राइडर एंट्री नहीं मिली।</p>
                <p className="text-xs text-slate-500">
                  इस तारीख के लिए अभी तक कोई रिकॉर्ड उपलब्ध नहीं है।
                </p>
                {!isPastDate && !isDayEndLocked && (
                  <button
                    type="button"
                    onClick={() => handleOpenEditRow(null)}
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-md shadow-emerald-600/20 transition transform active:scale-95 cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>+ आज की COD एंट्री शुरू करें</span>
                  </button>
                )}
              </div>
            ) : (
              filteredEntries.map((row) => {
                const isMyRow = isRider && isMatchingRiderRow(row);
                const canEditThis = canEditRow(row);
                const hasShortage =
                  (row.company1Shortage || 0) +
                  (row.company2Shortage || 0) +
                  (row.cashShortage || 0) +
                  (row.onlineShortage || 0) >
                  0;

                return (
                  <div
                    key={row.id || row.riderId}
                    onClick={() => {
                      if (canEditThis) {
                        handleOpenEditRow(row);
                      }
                    }}
                    className={`bg-white border rounded-2xl p-4 shadow-sm transition ${
                      canEditThis ? 'cursor-pointer hover:border-emerald-500 hover:shadow-md active:scale-[0.99]' : ''
                    } ${
                      recentlySubmittedRiderId === row.riderId
                        ? 'border-emerald-500 ring-2 ring-emerald-500/30 bg-emerald-50/30 shadow-md'
                        : isMyRow
                        ? 'border-emerald-400 ring-2 ring-emerald-400/20 bg-emerald-50/20'
                        : hasShortage
                        ? 'border-rose-300 bg-rose-50/20'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    {/* Top Row: Rider Name, Role badge, Packet count, and Edit button */}
                    <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-100">
                      <div className="flex items-center gap-2 min-w-0">
                        <div
                          className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 font-bold text-xs ${
                            recentlySubmittedRiderId === row.riderId
                              ? 'bg-emerald-600 text-white animate-bounce'
                              : isMyRow
                              ? 'bg-emerald-600 text-white'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {row.riderName.charAt(0)}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-bold text-sm text-slate-900 truncate">
                              {row.riderName}
                            </span>
                            {isMyRow && (
                              <span className="text-[10px] bg-emerald-100 text-emerald-800 border border-emerald-200 px-1.5 py-0.2 rounded font-bold">
                                मेरी एंट्री (You)
                              </span>
                            )}
                            {recentlySubmittedRiderId === row.riderId ? (
                              <span className="inline-flex items-center gap-1 text-[10px] bg-emerald-100 text-emerald-800 border border-emerald-300 px-2 py-0.5 rounded-full font-bold shadow-xs animate-pulse">
                                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                <span>सिंक हुआ ✓ (0s लाइव)</span>
                              </span>
                            ) : (row.status === 'submitted' || (Number(row.totalDeposit) > 0 && row.balance === 0)) ? (
                              <span className="inline-flex items-center gap-1 text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded-full font-semibold">
                                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                <span>दर्ज व सिंक ✓</span>
                              </span>
                            ) : null}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                            {row.riderPhone && (
                              <span className="text-xs text-slate-500 font-mono">
                                {row.riderPhone}
                              </span>
                            )}
                            <span className="inline-flex items-center gap-1 text-[10px] bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-md font-semibold">
                              <Package className="w-3 h-3 text-blue-600" />
                              <span>डिलीवरी: <strong>{row.deliveryCount || 0} pkts</strong></span>
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Right Action: Edit Button (if allowed) or Read-Only / Tally pill */}
                      <div className="flex items-center gap-2 shrink-0">
                        {canEditThis ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenEditRow(row);
                            }}
                            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1 shadow-xs cursor-pointer"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            <span>एडिट करें</span>
                          </button>
                        ) : !isRider ? (
                          <span className="text-[11px] text-violet-700 bg-violet-50 border border-violet-200 px-2.5 py-1 rounded-lg flex items-center gap-1 font-semibold">
                            <Check className="w-3.5 h-3.5 text-violet-600" />
                            <span>जांच व (✓) Tally</span>
                          </span>
                        ) : (
                          <span className="text-[11px] text-slate-400 bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-lg flex items-center gap-1 font-medium">
                            <Eye className="w-3 h-3" />
                            <span>केवल देखें</span>
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Financial Values Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-3">
                      {/* Dynamic Companies COD Cards */}
                      {hubCodCompanies.map((comp, idx) => {
                        const amt = row.companyAmounts && row.companyAmounts[comp] !== undefined
                          ? row.companyAmounts[comp]
                          : idx === 0
                          ? row.company1Amount
                          : idx === 1
                          ? row.company2Amount
                          : 0;
                        const isVerified = idx === 0 ? row.company1Verified : idx === 1 ? row.company2Verified : false;
                        const verifiedBy = idx === 0 ? row.company1VerifiedBy : idx === 1 ? row.company2VerifiedBy : undefined;
                        const shortage = idx === 0 ? row.company1Shortage : idx === 1 ? row.company2Shortage : undefined;

                        return (
                          <div key={comp} className="bg-slate-50 rounded-xl p-2.5 border border-slate-200">
                            <div className="text-[10px] font-semibold text-slate-500 flex items-center justify-between mb-0.5">
                              <span>{comp} COD</span>
                              {idx < 2 && (
                                <button
                                  type="button"
                                  onClick={() => handleToggleVerification(row, idx === 0 ? 'company1' : 'company2')}
                                  disabled={!canVerifyField(idx === 0 ? 'company1' : 'company2')}
                                  className={`p-0.5 rounded transition ${
                                    isVerified
                                      ? 'text-emerald-600 bg-emerald-100'
                                      : canVerifyField(idx === 0 ? 'company1' : 'company2')
                                      ? 'text-slate-400 hover:text-slate-700 cursor-pointer'
                                      : 'text-slate-300 cursor-not-allowed'
                                  }`}
                                  title={
                                    isVerified
                                      ? `सत्यापित द्वारा: ${verifiedBy || 'Staff'}`
                                      : 'सत्यापित करें'
                                  }
                                >
                                  <Check className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                            <div className="text-sm font-bold text-slate-900 font-mono">
                              {formatINR(amt)}
                            </div>
                            {shortage ? (
                              <div className="text-[10px] text-rose-600 font-bold mt-0.5 flex items-center gap-0.5">
                                <AlertTriangle className="w-2.5 h-2.5" />
                                <span>शॉर्ट: -₹{shortage}</span>
                              </div>
                            ) : null}
                          </div>
                        );
                      })}

                      {/* Cash Deposit */}
                      <div className="bg-slate-50 rounded-xl p-2.5 border border-slate-200">
                        <div className="text-[10px] font-semibold text-slate-500 flex items-center justify-between mb-0.5">
                          <div className="flex items-center gap-1.5">
                            <span>कैश जमा (Cash)</span>
                            {/* 🔒 / 🔓 Cash Lock Indicator & Admin Manual Override */}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleToggleCashLock(row);
                              }}
                              disabled={isRider}
                              className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold transition ${
                                row.isCashLocked
                                  ? 'bg-amber-100 text-amber-800 border border-amber-300 hover:bg-amber-200'
                                  : 'bg-emerald-100 text-emerald-800 border border-emerald-300 hover:bg-emerald-200'
                              } ${isRider ? 'cursor-default opacity-90' : 'cursor-pointer active:scale-95'}`}
                              title={
                                isRider
                                  ? row.isCashLocked
                                    ? '🔒 कैश सबमिट होकर लॉक है (अनलॉक हेतु एडमिन से संपर्क करें)'
                                    : '🔓 कैश खुला है'
                                  : row.isCashLocked
                                  ? '🔒 कैश लॉक है - राइडर को सुधारने देने के लिए अनलॉक करें'
                                  : '🔓 कैश अनलॉक है - लॉक करने के लिए क्लिक करें'
                              }
                            >
                              <span>{row.isCashLocked ? '🔒' : '🔓'}</span>
                              <span className="text-[9px]">{row.isCashLocked ? 'Locked' : 'Open'}</span>
                            </button>
                          </div>
                          {/* Verification Checkmark */}
                          <button
                            type="button"
                            onClick={() => handleToggleVerification(row, 'cash')}
                            disabled={!canVerifyField('cash')}
                            className={`p-0.5 rounded transition ${
                              row.cashVerified
                                ? 'text-emerald-600 bg-emerald-100'
                                : canVerifyField('cash')
                                ? 'text-slate-400 hover:text-slate-700 cursor-pointer'
                                : 'text-slate-300 cursor-not-allowed'
                            }`}
                            title={
                              row.cashVerified
                                ? `सत्यापित द्वारा: ${row.cashVerifiedBy || 'Staff'}`
                                : 'सत्यापित करें'
                            }
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <div className="flex items-center justify-between">
                          <div className="text-sm font-bold text-emerald-600 font-mono">
                            {formatINR(row.cashDeposit)}
                          </div>
                          {row.cashDenomination && (row.cashDenomination.totalNotes || row.cashDenomination.total) ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setAuditDenominationEntry(row);
                              }}
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-emerald-100 hover:bg-emerald-200 text-emerald-800 text-[10px] font-bold border border-emerald-300 transition cursor-pointer"
                              title="कैश नोट विवरण देखें (Denomination Audit)"
                            >
                              <Banknote className="w-3 h-3 text-emerald-700" />
                              <span>{row.cashDenomination.totalNotes || 0} नोट</span>
                            </button>
                          ) : null}
                        </div>
                        {row.cashShortage ? (
                          <div className="text-[10px] text-rose-600 font-bold mt-0.5 flex items-center gap-0.5">
                            <AlertTriangle className="w-2.5 h-2.5" />
                            <span>कम कैश: -₹{row.cashShortage}</span>
                          </div>
                        ) : null}
                      </div>

                      {/* Online Deposit */}
                      <div className="bg-slate-50 rounded-xl p-2.5 border border-slate-200">
                        <div className="text-[10px] font-semibold text-slate-500 flex items-center justify-between mb-0.5">
                          <span>ऑनलाइन (UPI/QR)</span>
                          {/* Verification Checkmark */}
                          <button
                            type="button"
                            onClick={() => handleToggleVerification(row, 'online')}
                            disabled={!canVerifyField('online')}
                            className={`p-0.5 rounded transition ${
                              row.onlineVerified
                                ? 'text-emerald-600 bg-emerald-100'
                                : canVerifyField('online')
                                ? 'text-slate-400 hover:text-slate-700 cursor-pointer'
                                : 'text-slate-300 cursor-not-allowed'
                            }`}
                            title={
                              row.onlineVerified
                                ? `सत्यापित द्वारा: ${row.onlineVerifiedBy || 'Staff'}`
                                : 'सत्यापित करें'
                            }
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <div className="text-sm font-bold text-sky-600 font-mono">
                          {formatINR(row.onlineDeposit)}
                        </div>
                        {row.onlineShortage ? (
                          <div className="text-[10px] text-rose-600 font-bold mt-0.5 flex items-center gap-0.5">
                            <AlertTriangle className="w-2.5 h-2.5" />
                            <span>कम ऑनलाइन: -₹{row.onlineShortage}</span>
                          </div>
                        ) : null}
                      </div>
                    </div>

                    {/* Bottom Summary Pill: Total COD, Total Deposit, Balance */}
                    <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs font-mono">
                      <div className="flex items-center gap-3">
                        <span className="text-slate-500">
                          कुल COD: <strong className="text-slate-900">{formatINR(row.totalCod)}</strong>
                        </span>
                        <span className="text-slate-500">
                          कुल जमा: <strong className="text-emerald-600">{formatINR(row.totalDeposit)}</strong>
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-slate-500">अंतर:</span>
                        <span
                          className={`font-extrabold px-2 py-0.5 rounded ${
                            row.balance === 0
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : row.balance > 0
                              ? 'bg-amber-50 text-amber-700 border border-amber-200'
                              : 'bg-purple-50 text-purple-700 border border-purple-200'
                          }`}
                        >
                          {formatINR(row.balance)}
                        </span>

                        {/* Incharge Flag Shortage Action */}
                        {(isHubIncharge || isSupervisor) && (
                          <button
                            type="button"
                            onClick={() => handleOpenShortageModal(row, 'cash')}
                            className="text-[11px] text-rose-600 hover:text-rose-700 underline font-sans ml-1 cursor-pointer"
                          >
                            ⚠️ शॉर्टेज
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* 8. RENDERING ENTRIES: EXCEL SPREADSHEET TABLE VIEW (Clean White UI) */}
        {viewMode === 'table' && (
          <div className="space-y-3">
            {/* Hub Daily Feed Banner for Riders */}
            {isRider && (
              <div className="bg-slate-50 border border-slate-200 rounded-2xl px-3.5 py-2.5 flex items-center justify-between text-xs text-slate-600 flex-wrap gap-2 shadow-xs">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0"></span>
                  <span className="font-bold text-slate-800">हब दैनिक प्रविष्टि फीड (Hub Daily Summary)</span>
                  <span className="text-slate-300">•</span>
                  <span className="font-semibold text-slate-600">{filteredEntries.length} सक्रिय राइडर्स</span>
                </div>
                <span className="text-[11px] text-slate-500 font-medium">
                  पारदर्शिता हेतु सभी सक्रिय राइडर्स की एंट्री दृश्यमान (अन्य राइडर्स: Read-Only)
                </span>
              </div>
            )}

            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-sans whitespace-nowrap">
                  <thead className="bg-slate-100 text-slate-700 text-[11px] uppercase tracking-wider font-bold border-b border-slate-200">
                    <tr>
                      <th className="py-3 px-3">राइडर नाम (Rider)</th>
                      <th className="py-3 px-3 text-center">डिलीवरी (Pkts)</th>
                      {hubCodCompanies.map((comp) => (
                        <th key={comp} className="py-3 px-3 text-right">{comp} (₹)</th>
                      ))}
                      <th className="py-3 px-3 text-right text-indigo-700 font-bold">कुल COD (₹)</th>
                      <th className="py-3 px-3 text-right text-emerald-700">कैश जमा (₹)</th>
                      <th className="py-3 px-3 text-right text-sky-700">ऑनलाइन (₹)</th>
                      <th className="py-3 px-3 text-right text-emerald-700 font-bold">कुल जमा (₹)</th>
                      <th className="py-3 px-3 text-right font-bold">बकाया / अंतर (₹)</th>
                      <th className="py-3 px-3 text-center">एक्शन</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono">
                    {filteredEntries.length === 0 ? (
                      <tr>
                        <td colSpan={8 + hubCodCompanies.length} className="py-10 px-4 text-center text-slate-500 font-sans">
                          <div className="space-y-2.5">
                            <p className="text-sm font-semibold text-slate-800">कोई राइडर एंट्री नहीं मिली।</p>
                            <p className="text-xs text-slate-500">इस तारीख के लिए अभी तक कोई रिकॉर्ड उपलब्ध नहीं है।</p>
                            {!isPastDate && !isDayEndLocked && (
                              <button
                                type="button"
                                onClick={() => handleOpenEditRow(null)}
                                className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-sm transition cursor-pointer"
                              >
                                <Plus className="w-3.5 h-3.5" />
                                <span>+ आज की COD एंट्री शुरू करें</span>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ) : (
                      filteredEntries.map((row) => {
                        const isMyRow = isRider && isMatchingRiderRow(row);
                        const canEditThis = canEditRow(row);

                        return (
                          <tr
                            key={row.id || row.riderId}
                            onClick={() => {
                              if (canEditThis) {
                                handleOpenEditRow(row);
                              }
                            }}
                            className={`transition ${
                              canEditThis ? 'cursor-pointer' : ''
                            } ${
                              isMyRow
                                ? 'bg-emerald-50/60 hover:bg-emerald-50'
                                : 'hover:bg-slate-50'
                            }`}
                          >
                            <td className="py-3 px-3 font-sans">
                              <div className="font-bold text-slate-900 flex items-center gap-1.5 flex-wrap">
                                <span>{row.riderName}</span>
                                {isMyRow && (
                                  <span className="text-[9px] bg-emerald-100 text-emerald-800 px-1 rounded font-bold">
                                    You
                                  </span>
                                )}
                                {recentlySubmittedRiderId === row.riderId ? (
                                  <span className="text-[9px] bg-emerald-100 text-emerald-800 px-1.5 py-0.2 rounded font-bold animate-pulse">
                                    सिंक हुआ ✓
                                  </span>
                                ) : row.status === 'submitted' ? (
                                  <span className="text-[9px] bg-emerald-50 text-emerald-700 px-1 rounded font-medium">
                                    दर्ज ✓
                                  </span>
                                ) : null}
                              </div>
                              {row.riderPhone && (
                                <span className="text-[10px] text-slate-500 font-mono">
                                  {row.riderPhone}
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-3 text-center font-sans">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 text-xs font-semibold border border-blue-200">
                                <Package className="w-3 h-3 text-blue-600" />
                                <span>{row.deliveryCount || 0}</span>
                              </span>
                            </td>
                          {hubCodCompanies.map((comp, idx) => {
                            const amt = row.companyAmounts && row.companyAmounts[comp] !== undefined
                              ? row.companyAmounts[comp]
                              : idx === 0
                              ? row.company1Amount
                              : idx === 1
                              ? row.company2Amount
                              : 0;
                            const isVerified = idx === 0 ? row.company1Verified : idx === 1 ? row.company2Verified : false;
                            return (
                              <td key={comp} className="py-3 px-3 text-right">
                                <span>{formatINR(amt)}</span>
                                {isVerified && <span className="text-emerald-600 ml-1">✓</span>}
                              </td>
                            );
                          })}
                          <td className="py-3 px-3 text-right font-bold text-slate-900">
                            {formatINR(row.totalCod)}
                          </td>
                          <td className="py-3 px-3 text-right text-emerald-700 font-semibold">
                            <div className="inline-flex items-center justify-end gap-1.5">
                              {/* 🔒 / 🔓 Cash Lock Indicator & Admin Manual Override */}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleToggleCashLock(row);
                                }}
                                disabled={isRider}
                                className={`inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[10px] font-bold transition ${
                                  row.isCashLocked
                                    ? 'bg-amber-100 text-amber-800 border border-amber-300 hover:bg-amber-200'
                                    : 'bg-emerald-100 text-emerald-800 border border-emerald-300 hover:bg-emerald-200'
                                } ${isRider ? 'cursor-default opacity-90' : 'cursor-pointer active:scale-95'}`}
                                title={
                                  isRider
                                    ? row.isCashLocked
                                      ? '🔒 कैश सबमिट होकर लॉक है (अनलॉक हेतु एडमिन से संपर्क करें)'
                                      : '🔓 कैश खुला है'
                                    : row.isCashLocked
                                    ? '🔒 कैश लॉक है - राइडर को सुधारने देने के लिए अनलॉक करें'
                                    : '🔓 कैश अनलॉक है - लॉक करने के लिए क्लिक करें'
                                }
                              >
                                <span>{row.isCashLocked ? '🔒' : '🔓'}</span>
                              </button>
                              <span>{formatINR(row.cashDeposit)}</span>
                              {row.cashVerified && <span className="text-emerald-600">✓</span>}
                              {row.cashDenomination && (row.cashDenomination.totalNotes || row.cashDenomination.total) ? (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setAuditDenominationEntry(row);
                                  }}
                                  className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-emerald-100 hover:bg-emerald-200 text-emerald-800 text-[10px] font-bold border border-emerald-300 transition cursor-pointer"
                                  title="कैश नोट विवरण देखें (Denomination Audit)"
                                >
                                  <Banknote className="w-3 h-3 text-emerald-700" />
                                  <span>{row.cashDenomination.totalNotes || ''}</span>
                                </button>
                              ) : null}
                            </div>
                          </td>
                          <td className="py-3 px-3 text-right text-sky-700 font-semibold">
                            <span>{formatINR(row.onlineDeposit)}</span>
                            {row.onlineVerified && <span className="text-emerald-600 ml-1">✓</span>}
                          </td>
                          <td className="py-3 px-3 text-right font-bold text-emerald-700">
                            {formatINR(row.totalDeposit)}
                          </td>
                          <td className="py-3 px-3 text-right font-bold">
                            <span
                              className={
                                row.balance === 0
                                  ? 'text-emerald-700'
                                  : row.balance > 0
                                  ? 'text-amber-700'
                                  : 'text-purple-700'
                              }
                            >
                              {formatINR(row.balance)}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-center font-sans">
                            {canEditThis ? (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleOpenEditRow(row);
                                }}
                                className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold cursor-pointer"
                              >
                                एडिट
                              </button>
                            ) : !isRider ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-violet-50 text-violet-700 border border-violet-200 text-xs font-semibold">
                                <Check className="w-3 h-3 text-violet-600" />
                                <span>जांच (✓)</span>
                              </span>
                            ) : (
                              <span className="text-slate-400 text-xs">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* 4. DAILY CONSOLIDATED HUB DENOMINATION SUMMARY */}
          <div className="mt-5">
            <DailyConsolidatedDenominationSummary
              entries={filteredEntries}
              selectedDate={selectedDate}
              hubName={currentHubId || 'सरायकेला कूरियर हब'}
              isDarkTheme={false}
              hubId={currentHubId}
              adminName={authUser?.name || 'हब एडमिन'}
            />
          </div>
        </div>
      )}
    </>
  )}
</main>

      {/* =====================================================================
          MODAL 1: RIDER ROW EDIT MODAL (Clean White Theme)
      ===================================================================== */}
      {editingEntry && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in">
          <div className="w-full sm:max-w-lg bg-white border border-slate-200 rounded-t-3xl sm:rounded-2xl p-5 sm:p-6 shadow-2xl max-h-[90vh] overflow-y-auto space-y-4">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <Edit3 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    COD एंट्री दर्ज करें ({editingEntry.riderName})
                  </h3>
                  <p className="text-xs text-slate-500">
                    तारीख: {selectedDate} • तुरंत 0s लाइव सिंक
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingEntry(null)}
                className="p-1.5 rounded-lg bg-slate-100 text-slate-500 hover:text-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Inputs */}
            <div className="space-y-3.5">
              {/* Optional Delivery Count (Controlled dynamically by Master Admin Tenant Flag) */}
              {allowDeliveryCountInput && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    कुल डिलीवर पार्सल (DELIVERY COUNT)
                  </label>
                  <input
                    type="number"
                    inputMode="numeric"
                    min="0"
                    placeholder="e.g. 65"
                    value={editDeliveryCount}
                    onChange={(e) => setEditDeliveryCount(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-amber-50/50 border border-amber-300 rounded-xl text-slate-900 font-mono text-lg font-bold focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white"
                  />
                </div>
              )}

              {/* Dynamic Hub Courier Companies COD Fields */}
              {hubCodCompanies.map((comp) => (
                <div key={comp}>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    {comp} COD (₹ COD कलेक्शन)
                  </label>
                  <input
                    type="number"
                    inputMode="numeric"
                    min="0"
                    placeholder="0"
                    value={editCompanyAmounts[comp] !== undefined ? editCompanyAmounts[comp] : ''}
                    onChange={(e) =>
                      setEditCompanyAmounts((prev) => ({
                        ...prev,
                        [comp]: e.target.value,
                      }))
                    }
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-mono text-lg font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
                  />
                </div>
              ))}

              {/* Cash Deposit */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-emerald-700 uppercase tracking-wider flex items-center gap-1.5">
                    <span>कैश जमा (Physical Cash Handed In ₹)</span>
                    {isRider && Boolean(editingEntry.isCashLocked) && (
                      <span className="px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 text-[10px] font-bold border border-amber-300">
                        🔒 Locked
                      </span>
                    )}
                  </label>
                  {/* 💵 Calculator / Cash Denomination Icon Button */}
                  <button
                    type="button"
                    onClick={() => setIsDenominationModalOpen(true)}
                    disabled={isRider && Boolean(editingEntry.isCashLocked)}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-bold text-xs shadow-2xs border transition ${
                      isRider && Boolean(editingEntry.isCashLocked)
                        ? 'bg-slate-100 text-slate-400 border-slate-300 cursor-not-allowed opacity-60'
                        : 'bg-emerald-100 hover:bg-emerald-200 text-emerald-800 border-emerald-300 cursor-pointer active:scale-95'
                    }`}
                    title={
                      isRider && Boolean(editingEntry.isCashLocked)
                        ? '🔒 कैश लॉक है (सुधार हेतु हब एडमिन/स्टाफ़ से अनलॉक कराएं)'
                        : 'कैश नोटों का विवरण (Cash Denomination Breakdown)'
                    }
                  >
                    <Banknote className="w-3.5 h-3.5 text-emerald-700" />
                    <span>💵 नोट विवरण (Denomination)</span>
                  </button>
                </div>
                <div className="relative">
                  <input
                    type="number"
                    inputMode="numeric"
                    min="0"
                    placeholder="0"
                    disabled={isRider && Boolean(editingEntry.isCashLocked)}
                    readOnly={isRider}
                    value={editCash}
                    onClick={() => {
                      if (isRider && !editingEntry.isCashLocked) {
                        setIsDenominationModalOpen(true);
                      }
                    }}
                    onChange={(e) => {
                      if (!isRider) {
                        setEditCash(e.target.value);
                      }
                    }}
                    className={`w-full px-3.5 py-2.5 rounded-xl font-mono text-lg font-bold focus:outline-none transition ${
                      isRider && Boolean(editingEntry.isCashLocked)
                        ? 'bg-slate-100 border border-slate-300 text-slate-500 cursor-not-allowed opacity-90'
                        : isRider
                        ? 'bg-emerald-50 border border-emerald-300 text-emerald-800 cursor-pointer hover:bg-emerald-100/60'
                        : 'bg-emerald-50/50 border border-emerald-300 text-emerald-700 focus:ring-2 focus:ring-emerald-500 focus:bg-white'
                    }`}
                  />
                  {isRider && !editingEntry.isCashLocked && (
                    <button
                      type="button"
                      onClick={() => setIsDenominationModalOpen(true)}
                      className="absolute right-2 top-2.5 px-2 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold flex items-center gap-1 shadow-sm cursor-pointer"
                    >
                      <Banknote className="w-3.5 h-3.5" />
                      <span>नोट भरें</span>
                    </button>
                  )}
                </div>

                {/* Rider Mandated Denomination Helper Notice */}
                {isRider && !editingEntry.isCashLocked && (
                  <p className="mt-1.5 text-[11px] text-emerald-700 font-semibold flex items-center gap-1 bg-emerald-50/80 p-1.5 rounded-lg border border-emerald-200">
                    <Banknote className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span>कैश डायरेक्ट टाइपिंग बंद है। नोट विवरण (500, 200, 100...) भरकर ही कैश जमा करें।</span>
                  </p>
                )}

                {/* Warning notice when Cash is auto-locked */}
                {isRider && Boolean(editingEntry.isCashLocked) && (
                  <div className="mt-2 p-2.5 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-xs flex items-start gap-2 shadow-2xs">
                    <Lock className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                    <span className="font-semibold leading-relaxed">
                      🔒 कैश सबमिट हो चुका है और अपने-आप लॉक हो गया है। इसमें सुधार के लिए हब एडमिन/स्टाफ़ से अनलॉक कराएं।
                    </span>
                  </div>
                )}

                {editCashDenomination && (editCashDenomination.totalNotes || editCashDenomination.total) ? (
                  <div className="text-[11px] text-emerald-700 font-semibold mt-1.5 flex items-center justify-between bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
                    <span className="flex items-center gap-1">
                      <Banknote className="w-3 h-3 text-emerald-600" />
                      नोट विवरण दर्ज: <strong>{editCashDenomination.totalNotes || 0} नोट</strong> (₹{formatINR(editCashDenomination.total)})
                    </span>
                    {isRider && Boolean(editingEntry.isCashLocked) ? (
                      <span className="text-slate-500 font-bold text-[10px] flex items-center gap-0.5">
                        <Lock className="w-3 h-3" />
                        सुरक्षित लॉक
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setIsDenominationModalOpen(true)}
                        className="text-emerald-800 underline font-bold text-[10px] cursor-pointer"
                      >
                        संशोधित करें
                      </button>
                    )}
                  </div>
                ) : null}
              </div>

              {/* Online Deposit with 1-Click Direct UPI (GPay/PhonePe/Paytm) Transfer */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-sky-700 uppercase tracking-wider">
                    ऑनलाइन जमा (UPI / QR Payment ₹)
                  </label>
                  {activeHubUpiId && (
                    <span className="text-[10px] text-sky-700 font-mono bg-sky-100 px-2 py-0.5 rounded-full border border-sky-300 font-semibold truncate max-w-[190px]" title={`हब कलेक्शन खाता: ${activeHubUpiId}`}>
                      हब UPI: {activeHubUpiId}
                    </span>
                  )}
                </div>
                <input
                  type="number"
                  inputMode="numeric"
                  min="0"
                  placeholder="0"
                  value={editOnline}
                  onChange={(e) => {
                    setEditOnline(e.target.value);
                    setOnlinePaymentSent(false);
                  }}
                  className="w-full px-3.5 py-2.5 bg-sky-50/50 border border-sky-300 rounded-xl text-sky-700 font-mono text-lg font-bold focus:outline-none focus:ring-2 focus:ring-sky-500 focus:bg-white"
                />

                {/* ⚡ 1-Click Direct GPay / PhonePe / Paytm Transfer Button for Rider */}
                {isRider && Number(editOnline) > 0 && (
                  <div className="mt-2.5 space-y-2">
                    {activeHubUpiId ? (
                      <button
                        type="button"
                        onClick={handleLaunchUpiApp}
                        className="w-full py-2.5 px-3 bg-gradient-to-r from-sky-600 via-indigo-600 to-blue-600 hover:from-sky-500 hover:to-blue-500 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 shadow-md cursor-pointer active:scale-95"
                      >
                        <Smartphone className="w-4 h-4 text-sky-200" />
                        <span>⚡ ₹{Number(editOnline).toLocaleString('en-IN')} सीधे GPay / PhonePe / Paytm से भेजें</span>
                      </button>
                    ) : (
                      <div className="p-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-[11px] flex items-center gap-1.5">
                        <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                        <span>हब एडमिन द्वारा कलेक्शन UPI ID सेट नहीं किया गया है।</span>
                      </div>
                    )}

                    {onlinePaymentSent && (
                      <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-800 text-xs font-bold flex items-center justify-between animate-in fade-in shadow-xs">
                        <span className="flex items-center gap-1.5">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                          <span>पेमेंट ऐप से वापस आ गए ✓ (ट्रांसफर प्रोसेस हुआ)</span>
                        </span>
                        <span className="text-[10px] text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-md font-semibold">
                          नो UTR झंझट
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Live Auto-Calculated Summary Box */}
              {(() => {
                let totCod = 0;
                hubCodCompanies.forEach((comp) => {
                  totCod += Number(editCompanyAmounts[comp]) || 0;
                });
                const cash = Number(editCash) || 0;
                const online = Number(editOnline) || 0;
                const totDep = cash + online;
                const diff = totCod - totDep;

                return (
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-1.5 font-mono text-xs">
                    <div className="flex justify-between text-slate-700">
                      <span>कुल COD ({hubCodCompanies.map((c) => `${c} COD`).join(' + ')}):</span>
                      <strong className="text-slate-900">{formatINR(totCod)}</strong>
                    </div>
                    <div className="flex justify-between text-emerald-700">
                      <span>कुल जमा (कैश + ऑनलाइन):</span>
                      <strong>{formatINR(totDep)}</strong>
                    </div>
                    <div className="flex justify-between border-t border-slate-200 pt-1.5 font-bold">
                      <span className="text-slate-700">अंतर / बैलेंस (COD - जमा):</span>
                      <span
                        className={
                          diff === 0
                            ? 'text-emerald-600'
                            : diff > 0
                            ? 'text-amber-600'
                            : 'text-purple-600'
                        }
                      >
                        {formatINR(diff)} {diff === 0 ? '(हिसाब बराबर ✓)' : diff > 0 ? '(बकाया Due)' : '(अधिक जमा)'}
                      </span>
                    </div>
                  </div>
                );
              })()}

              {/* Notes */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  टिप्पणी / Notes (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. 500 का नोट बाद में दिया..."
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:bg-white"
                />
              </div>
            </div>

            {/* Modal Actions */}
            <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingEntry(null)}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition cursor-pointer"
              >
                रद्द करें
              </button>
              <button
                type="button"
                onClick={handleSaveEditRow}
                disabled={isSavingEntry}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-md shadow-emerald-600/20 cursor-pointer"
              >
                {isSavingEntry ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>सेव हो रहा है...</span>
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    <span>💾 एंट्री सेव करें (0s Live Sync)</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL 1.5: CASH DENOMINATION INPUT MODAL (Rider App Screen)
      ===================================================================== */}
      <CashDenominationModal
        isOpen={isDenominationModalOpen}
        onClose={() => setIsDenominationModalOpen(false)}
        initialDenomination={editCashDenomination || editingEntry?.cashDenomination}
        targetCashAmount={Number(editCash) || undefined}
        riderName={editingEntry?.riderName}
        date={selectedDate}
        onConfirm={(denom) => {
          setEditCashDenomination(denom);
          setEditCash(denom.total > 0 ? String(denom.total) : '0');
          showToast(`💵 कुल ₹${formatINR(denom.total)} (${denom.totalNotes || 0} नोट) कैश में दर्ज हुआ!`, 'success');
        }}
      />

      {/* =====================================================================
          MODAL 1.6: INDIVIDUAL RIDER DENOMINATION AUDIT MODAL (Read-Only)
      ===================================================================== */}
      {auditDenominationEntry && (
        <CashDenominationModal
          isOpen={Boolean(auditDenominationEntry)}
          onClose={() => setAuditDenominationEntry(null)}
          initialDenomination={auditDenominationEntry.cashDenomination}
          targetCashAmount={auditDenominationEntry.cashDeposit}
          riderName={auditDenominationEntry.riderName}
          date={auditDenominationEntry.date || selectedDate}
          readOnly={true}
        />
      )}

      {/* =====================================================================
          MODAL 2: INCHARGE SHORTAGE MARKING MODAL (Clean White Theme)
      ===================================================================== */}
      {shortageModal.isOpen && shortageModal.row && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="w-full max-w-md bg-white border border-rose-200 rounded-2xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-rose-600" />
                <h3 className="text-sm font-bold text-slate-900">
                  शॉर्टेज मार्क करें ({shortageModal.row.riderName})
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShortageModal((prev) => ({ ...prev, isOpen: false }))}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                <div className="text-slate-500 font-medium">रिपोर्टेड रकम:</div>
                <div className="text-base font-bold text-slate-900 font-mono">
                  {formatINR(shortageModal.reportedAmount)}
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  वास्तविक प्राप्त रकम (Actual Received ₹):
                </label>
                <input
                  type="number"
                  inputMode="numeric"
                  placeholder="0"
                  value={shortageModal.actualReceived}
                  onChange={(e) =>
                    setShortageModal((prev) => ({ ...prev, actualReceived: e.target.value }))
                  }
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-mono text-base font-bold focus:outline-none focus:ring-1 focus:ring-rose-500 focus:bg-white"
                />
              </div>

              {shortageModal.actualReceived !== '' && (
                Number(shortageModal.actualReceived) > shortageModal.reportedAmount ? (
                  <div className="bg-emerald-50 border border-emerald-200 p-2.5 rounded-xl text-emerald-800 font-mono font-bold flex items-center justify-between">
                    <span>सरप्लस / एक्स्ट्रा जमा (इंसेंटिव):</span>
                    <span className="text-emerald-600 font-extrabold">+{formatINR(Number(shortageModal.actualReceived) - shortageModal.reportedAmount)}</span>
                  </div>
                ) : Number(shortageModal.actualReceived) < shortageModal.reportedAmount ? (
                  <div className="bg-rose-50 border border-rose-200 p-2.5 rounded-xl text-rose-800 font-mono font-bold flex items-center justify-between">
                    <span>शॉर्टेज रकम (एडवांस खाता):</span>
                    <span className="text-rose-600 font-extrabold">{formatINR(shortageModal.reportedAmount - Number(shortageModal.actualReceived))}</span>
                  </div>
                ) : (
                  <div className="bg-slate-100 border border-slate-200 p-2.5 rounded-xl text-slate-700 font-mono font-bold flex items-center justify-between">
                    <span>हिसाब बराबर:</span>
                    <span>₹0 (कोई शॉर्टेज नहीं)</span>
                  </div>
                )
              )}

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  कारण / टिप्पणी (Notes):
                </label>
                <input
                  type="text"
                  placeholder="e.g. 200 रुपये कम जमा किए..."
                  value={shortageModal.notes}
                  onChange={(e) =>
                    setShortageModal((prev) => ({ ...prev, notes: e.target.value }))
                  }
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:ring-1 focus:ring-rose-500 focus:bg-white"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setShortageModal((prev) => ({ ...prev, isOpen: false }))}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold cursor-pointer"
              >
                रद्द करें
              </button>
              <button
                type="button"
                onClick={handleSaveShortage}
                className={`px-4 py-1.5 text-white rounded-lg text-xs font-bold cursor-pointer transition ${
                  shortageModal.actualReceived !== '' && Number(shortageModal.actualReceived) > shortageModal.reportedAmount
                    ? 'bg-emerald-600 hover:bg-emerald-700'
                    : 'bg-rose-600 hover:bg-rose-700'
                }`}
              >
                {shortageModal.actualReceived !== '' && Number(shortageModal.actualReceived) > shortageModal.reportedAmount
                  ? 'कन्फर्म सरप्लस (इंसेंटिव)'
                  : 'कन्फर्म शॉर्टेज'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* In-App Confirm Day-End Lock Modal (Android WebView safe, zero window.confirm) */}
      {dayEndLockConfirmOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
          <div 
            className="w-full max-w-sm bg-white rounded-2xl p-5 shadow-2xl space-y-4 border border-slate-200 animate-in zoom-in-95 text-slate-800"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <div className={`p-2.5 rounded-xl ${isDayEndLocked ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'}`}>
                {isDayEndLocked ? <Unlock className="w-5 h-5" /> : <Lock className="w-5 h-5" />}
              </div>
              <div>
                <h3 className="font-bold text-base text-slate-900">
                  {isDayEndLocked ? 'दिन का हिसाब अनलॉक करें?' : 'दिन का हिसाब लॉक करें?'}
                </h3>
                <p className="text-xs text-slate-500">
                  {isDayEndLocked ? 'राइडर दोबारा एडिट कर सकेंगे' : 'इसके बाद कोई राइडर एडिट नहीं कर सकेगा'}
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed bg-slate-50 p-3 rounded-xl border border-slate-200">
              {isDayEndLocked
                ? `क्या आप ${selectedDate} के दिन के हिसाब को दोबारा अनलॉक करना चाहते हैं?`
                : `क्या आप ${selectedDate} के पूरे दिन के COD हिसाब को लॉक करना चाहते हैं? इसके बाद केवल हब इंचार्ज ही बदलाव कर सकेंगे।`}
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setDayEndLockConfirmOpen(false)}
                disabled={isTogglingDayEndLock}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition cursor-pointer"
              >
                रद्द करें
              </button>
              <button
                type="button"
                onClick={handleConfirmToggleDayEndLock}
                disabled={isTogglingDayEndLock}
                className={`px-4 py-2 rounded-xl text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-md ${
                  isDayEndLocked
                    ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20'
                    : 'bg-amber-600 hover:bg-amber-700 shadow-amber-600/20'
                }`}
              >
                {isTogglingDayEndLock ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>अपडेट हो रहा है...</span>
                  </>
                ) : (
                  <>
                    {isDayEndLocked ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                    <span>{isDayEndLocked ? 'हाँ, अनलॉक करें' : 'हाँ, लॉक करें'}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
