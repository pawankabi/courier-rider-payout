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
  Plus
} from 'lucide-react';
import { 
  CodDailyEntry, 
  CodStaffUser, 
  CodStaffRole,
  DailyCodSheetData,
  Rider
} from '../types';
import { collection, query, where, getDocs, onSnapshot } from 'firebase/firestore';
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

interface CodCompanionAppProps {
  onBackToMainApp?: () => void;
  initialPhone?: string;
}

export function CodCompanionApp({ onBackToMainApp, initialPhone }: CodCompanionAppProps) {
  // Authentication State
  const [authUser, setAuthUser] = useState<CodStaffUser | null>(() => getStoredCodCompanionUser());
  const [authenticatedHubId, setAuthenticatedHubId] = useState<string | null>(() => getActiveCompanionHubId());
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
  const [editCompany1, setEditCompany1] = useState<number | string>(0);
  const [editCompany2, setEditCompany2] = useState<number | string>(0);
  const [editCash, setEditCash] = useState<number | string>(0);
  const [editOnline, setEditOnline] = useState<number | string>(0);
  const [editNotes, setEditNotes] = useState('');
  const [isSavingEntry, setIsSavingEntry] = useState(false);

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

  // UI Toasts
  const [toast, setToast] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

  const showToast = (text: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ text, type });
    setTimeout(() => {
      setToast(null);
    }, 3800);
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
          (r) => r.name !== 'Akash Mahato' && r.phone !== '6207262418'
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
  const canEditRow = (row: CodDailyEntry): boolean => {
    if (isPastDate) return false; // Fail-Safe Auto Midnight Lock: All past dates are strictly READ-ONLY
    if (isDayEndLocked) return false; // Day-End Lock engages absolute lockdown
    
    // Riders can ONLY edit their own assigned row
    if (isRider) {
      return isMatchingRiderRow(row);
    }

    // Hub Incharge can edit any row
    if (isHubIncharge) return true;

    // Team Leader & Supervisor can review, but primary entry is rider's or incharge's
    return isSupervisor;
  };

  // Can verify specific field
  const canVerifyField = (field: 'company1' | 'company2' | 'cash' | 'online'): boolean => {
    if (isPastDate || isDayEndLocked) return false;
    if (isRider) return false; // Riders can never verify themselves
    if (isHubIncharge) return true;

    if (field === 'company1' || field === 'company2') {
      return Boolean(authUser?.canVerifyCod);
    }
    if (field === 'cash') {
      return Boolean(authUser?.canVerifyCash);
    }
    if (field === 'online') {
      return Boolean(authUser?.canVerifyOnline);
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

      return merged;
    }

    // Fallback: If logged-in as rider, display ONLY their own record - NEVER leak full sheetData.entries
    if (isRider && authUser) {
      const cleanUserPhone = (authUser.phone || '').replace(/\D/g, '').slice(-10);
      const myId = authUser.riderId || authUser.id;
      const myEntry = (sheetData.entries || []).find((e) => {
        const cleanPhone = (e.riderPhone || '').replace(/\D/g, '').slice(-10);
        return e.riderId === myId || (cleanUserPhone && cleanPhone === cleanUserPhone);
      });
      if (myEntry) return [myEntry];
      const fallbackEntry: CodDailyEntry = {
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
      };
      return [fallbackEntry];
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
    setEditCompany1(targetRow.company1Amount > 0 ? String(targetRow.company1Amount) : '');
    setEditCompany2(targetRow.company2Amount > 0 ? String(targetRow.company2Amount) : '');
    setEditCash(targetRow.cashDeposit > 0 ? String(targetRow.cashDeposit) : '');
    setEditOnline(targetRow.onlineDeposit > 0 ? String(targetRow.onlineDeposit) : '');
    setEditNotes(targetRow.notes || '');
  };

  // Save Row with instant optimistic UI update + direct Firestore write
  const handleSaveEditRow = async () => {
    if (!editingEntry || !authUser) return;
    setIsSavingEntry(true);

    const c1 = Number(editCompany1) || 0;
    const c2 = Number(editCompany2) || 0;
    const cash = Number(editCash) || 0;
    const online = Number(editOnline) || 0;
    const totalCod = c1 + c2;
    const totalDeposit = cash + online;
    const balance = totalCod - totalDeposit;

    const updated: CodDailyEntry = {
      ...editingEntry,
      company1Amount: c1,
      company2Amount: c2,
      totalCod,
      cashDeposit: cash,
      onlineDeposit: online,
      totalDeposit,
      balance,
      notes: editNotes.trim(),
      status: 'submitted',
      submittedAt: new Date().toISOString(),
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

  // 7. Toggle Day-End Lock
  const handleToggleDayEndLock = async () => {
    if (!isHubIncharge || !authUser) return;
    const nextLocked = !isDayEndLocked;
    const confirmMsg = nextLocked
      ? `क्या आप ${selectedDate} के पूरे दिन के COD हिसाब को लॉक करना चाहते हैं? इसके बाद कोई भी राइडर बदलाव नहीं कर सकेगा।`
      : `क्या आप ${selectedDate} के दिन के हिसाब को दोबारा अनलॉक करना चाहते हैं?`;

    if (!window.confirm(confirmMsg)) return;

    try {
      await toggleDayEndLockForSheet(selectedDate, nextLocked, authUser.name, currentHubId);
      showToast(
        nextLocked
          ? '🔒 आज का हिसाब लॉक कर दिया गया। सभी राइडर एडिट बंद हो गए।'
          : '🔓 आज का हिसाब अनलॉक कर दिया गया।',
        'success'
      );
    } catch {
      showToast('लॉक स्थिति बदलने में त्रुटि हुई।', 'error');
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

    const sProp = `${field}Shortage` as keyof CodDailyEntry;
    const aProp = `${field}ActualReceived` as keyof CodDailyEntry;
    const nProp = `${field}ShortageNotes` as keyof CodDailyEntry;
    const fProp = `${field}ShortageFlaggedBy` as keyof CodDailyEntry;
    const tProp = `${field}ShortageFlaggedAt` as keyof CodDailyEntry;

    const updated: CodDailyEntry = {
      ...row,
      [sProp]: shortAmount > 0 ? shortAmount : undefined,
      [aProp]: shortAmount > 0 ? actual : undefined,
      [nProp]: shortAmount > 0 ? notes.trim() : undefined,
      [fProp]: shortAmount > 0 ? authUser.name : undefined,
      [tProp]: shortAmount > 0 ? new Date().toISOString() : undefined,
    };

    try {
      await updateSingleRiderEntryInSheet(selectedDate, updated, {
        name: authUser.name,
        role: authUser.role,
      }, currentHubId);
      showToast(
        shortAmount > 0
          ? `⚠️ शॉर्टेज मार्क: ₹${shortAmount} (${row.riderName} - ${field.toUpperCase()})`
          : `शॉर्टेज हटा दी गई।`,
        'success'
      );
      setShortageModal((prev) => ({ ...prev, isOpen: false }));
    } catch {
      showToast('शॉर्टेज अपडेट विफल हुआ।', 'error');
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
  // VIEW 1: CLEAN SIMPLE LOGIN SCREEN (White / Light Theme)
  // =========================================================================
  if (!authUser) {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col justify-center items-center px-4 py-8 font-sans selection:bg-emerald-500 selection:text-white">
        {/* Subtle Background Glow */}
        <div className="fixed inset-0 pointer-events-none opacity-40">
          <div className="absolute -top-40 -left-40 w-96 h-96 bg-emerald-100/60 rounded-full blur-3xl" />
          <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-blue-100/60 rounded-full blur-3xl" />
        </div>

        {/* Clear & Prominent Back to Admin Dashboard Header Button */}
        {onBackToMainApp && (
          <div className="w-full max-w-md mb-4 z-20 animate-in fade-in slide-in-from-top-2">
            <button
              type="button"
              id="companion-login-top-back-to-admin-btn"
              onClick={onBackToMainApp}
              className="w-full py-3 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-black text-xs sm:text-sm shadow-lg transition active:scale-95 flex items-center justify-center gap-2 cursor-pointer border border-slate-700 hover:border-emerald-500/50"
            >
              <ChevronLeft className="w-5 h-5 text-emerald-400 shrink-0" />
              <span>← वापस एडमिन डैशबोर्ड (Back to Admin)</span>
            </button>
          </div>
        )}

        {/* Card Container */}
        <div className="relative w-full max-w-md bg-white border border-slate-200/90 rounded-2xl shadow-xl p-6 sm:p-8 z-10">
          {/* Logo & Title */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-emerald-600 text-white shadow-md shadow-emerald-600/20 mb-4 animate-in zoom-in-95">
              <Bike className="w-8 h-8" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 flex items-center justify-center gap-2">
              <span>COD Entry</span>
              <span className="text-emerald-600 font-hindi">(हिसाब किताब)</span>
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-1 font-medium">
              डिलीवरी बॉय & हब स्टाफ साथी ऐप • 0s लाइव सिंक
            </p>
          </div>

          {/* Form */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleLogin();
            }}
            className="space-y-5"
          >
            {/* Input 1: Registered Mobile Number (10 digits) */}
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
                  onPaste={(e) => {
                    const pasted = e.clipboardData?.getData('text') || '';
                    const clean = normalizePhoneNumber(pasted);
                    if (clean) {
                      e.preventDefault();
                      setPhoneInput(clean);
                      if (loginError) setLoginError('');
                    }
                  }}
                  autoFocus
                  required
                  className="w-full pl-20 pr-4 py-3 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 placeholder-slate-400 text-base font-mono tracking-wider focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition"
                />
              </div>
            </div>

            {/* Input 2: 4-Digit Security PIN */}
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

            {/* Error Message in Hindi */}
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
                  <span>लॉगिन करें (Sign In)</span>
                </>
              )}
            </button>
          </form>

          {/* Quick Demo Login Switcher */}
          <div className="mt-6 pt-6 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setShowDemoLogins(!showDemoLogins)}
              className="w-full flex items-center justify-between text-xs text-slate-500 hover:text-emerald-600 py-1 transition"
            >
              <span className="flex items-center gap-1.5 font-medium">
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                <span>त्वरित परीक्षण / डेमो खाते (Instant 1-Click Test)</span>
              </span>
              <span className="text-[11px] bg-slate-100 px-2 py-0.5 rounded text-slate-600 font-semibold">
                {showDemoLogins ? 'छिपाएं' : 'दिखाएं'}
              </span>
            </button>

            {showDemoLogins && (
              <div className="mt-3 space-y-2 text-xs animate-in slide-in-from-top-2">
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setPhoneInput('9876543210');
                      setPinInput('1234');
                      handleLogin('9876543210', '1234');
                    }}
                    className="p-2.5 bg-slate-50 hover:bg-emerald-50 border border-slate-200 hover:border-emerald-200 rounded-xl text-left transition"
                  >
                    <div className="font-bold text-emerald-700">🏍️ राइडर खाता</div>
                    <div className="text-[11px] text-slate-500 font-mono">9876543210 / 1234</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPhoneInput('9876543211');
                      setPinInput('4321');
                      handleLogin('9876543211', '4321');
                    }}
                    className="p-2.5 bg-slate-50 hover:bg-sky-50 border border-slate-200 hover:border-sky-200 rounded-xl text-left transition"
                  >
                    <div className="font-bold text-sky-700">🎖️ टीम लीडर</div>
                    <div className="text-[11px] text-slate-500 font-mono">9876543211 / 4321</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPhoneInput('9876543212');
                      setPinInput('5678');
                      handleLogin('9876543212', '5678');
                    }}
                    className="p-2.5 bg-slate-50 hover:bg-purple-50 border border-slate-200 hover:border-purple-200 rounded-xl text-left transition"
                  >
                    <div className="font-bold text-purple-700">📋 सुपरवाइजर</div>
                    <div className="text-[11px] text-slate-500 font-mono">9876543212 / 5678</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPhoneInput('9876543213');
                      setPinInput('9999');
                      handleLogin('9876543213', '9999');
                    }}
                    className="p-2.5 bg-slate-50 hover:bg-amber-50 border border-slate-200 hover:border-amber-200 rounded-xl text-left transition"
                  >
                    <div className="font-bold text-amber-700">👑 हब इंचार्ज</div>
                    <div className="text-[11px] text-slate-500 font-mono">9876543213 / 9999</div>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Exit to Main Hub App if triggered */}
          {onBackToMainApp && (
            <div className="mt-6 text-center">
              <button
                type="button"
                onClick={onBackToMainApp}
                className="text-xs text-slate-600 hover:text-slate-900 transition underline underline-offset-4 font-bold flex items-center justify-center gap-1 mx-auto"
              >
                <ChevronLeft className="w-3.5 h-3.5 text-slate-500" />
                <span>← वापस एडमिन डैशबोर्ड (Back to Admin)</span>
              </button>
            </div>
          )}

          {/* Hub Resolution Indicator - Eliminates Not Resolved once valid digits are entered */}
          <div className="mt-4 pt-3 border-t border-slate-200 text-center text-[10px] text-slate-500 font-mono">
            {currentHubId ? (
              <span className="text-emerald-700 font-semibold">
                Hub: {currentHubId.substring(0, 8)} (सत्यापित हब)
              </span>
            ) : resolvedPreviewHub ? (
              <span className="text-emerald-700 font-semibold">
                Hub: {resolvedPreviewHub.substring(0, 8)} (सत्यापित हब)
              </span>
            ) : isResolvingHub ? (
              <span className="text-indigo-600 animate-pulse font-medium">
                हब खोज रहे हैं...
              </span>
            ) : phoneInput.length === 10 ? (
              <span className="text-emerald-600 font-medium">
                हब: स्वचालित पहचान सक्रिय
              </span>
            ) : (
              <span className="text-slate-400">
                सुरक्षित कूरियर हब लॉगिन
              </span>
            )}
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // VIEW 2: AUTHENTICATED COMPANION MOBILE WEB APP (Clean White Theme)
  // =========================================================================
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans pb-16 selection:bg-emerald-500 selection:text-white">
      {/* Prominent Admin Dashboard Return Top Bar */}
      {onBackToMainApp && (
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

      {/* 1. STICKY TOP APP BAR (Crisp White with Indigo Header Accent) */}
      <header className="sticky top-0 z-40 bg-white/95 border-b border-slate-200 backdrop-blur-md px-3 sm:px-6 py-3 shadow-sm">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-2">
          {/* Brand & Active User Info */}
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-sm">
              <Bike className="w-5 h-5" />
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

            {/* Back to Admin Dashboard if triggered */}
            {onBackToMainApp && (
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
                  {myRiderRow && (Number(myRiderRow.totalCod) > 0 || Number(myRiderRow.totalDeposit) > 0)
                    ? `दर्ज: Co 1: ₹${myRiderRow.company1Amount} | Co 2: ₹${myRiderRow.company2Amount} | कैश: ₹${myRiderRow.cashDeposit} | UPI: ₹${myRiderRow.onlineDeposit}`
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
                    {/* Top Row: Rider Name, Role badge, and Edit button */}
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
                                मेरी एंट्री
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
                          {row.riderPhone && (
                            <span className="text-xs text-slate-500 font-mono">
                              {row.riderPhone}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Right Action: Edit Button (if allowed) */}
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
                        ) : (
                          <span className="text-[11px] text-slate-400 flex items-center gap-1">
                            <Eye className="w-3 h-3" />
                            <span>केवल देखें</span>
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Financial Values Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-3">
                      {/* Co 1: Valmo COD */}
                      <div className="bg-slate-50 rounded-xl p-2.5 border border-slate-200">
                        <div className="text-[10px] font-semibold text-slate-500 flex items-center justify-between mb-0.5">
                          <span>{sheetData.company1Name}</span>
                          {/* Verification Checkmark */}
                          <button
                            type="button"
                            onClick={() => handleToggleVerification(row, 'company1')}
                            disabled={!canVerifyField('company1')}
                            className={`p-0.5 rounded transition ${
                              row.company1Verified
                                ? 'text-emerald-600 bg-emerald-100'
                                : canVerifyField('company1')
                                ? 'text-slate-400 hover:text-slate-700 cursor-pointer'
                                : 'text-slate-300 cursor-not-allowed'
                            }`}
                            title={
                              row.company1Verified
                                ? `सत्यापित द्वारा: ${row.company1VerifiedBy || 'Staff'}`
                                : 'सत्यापित करें'
                            }
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <div className="text-sm font-bold text-slate-900 font-mono">
                          {formatINR(row.company1Amount)}
                        </div>
                        {row.company1Shortage ? (
                          <div className="text-[10px] text-rose-600 font-bold mt-0.5 flex items-center gap-0.5">
                            <AlertTriangle className="w-2.5 h-2.5" />
                            <span>शॉर्ट: -₹{row.company1Shortage}</span>
                          </div>
                        ) : null}
                      </div>

                      {/* Co 2: Xpressbees COD */}
                      <div className="bg-slate-50 rounded-xl p-2.5 border border-slate-200">
                        <div className="text-[10px] font-semibold text-slate-500 flex items-center justify-between mb-0.5">
                          <span>{sheetData.company2Name}</span>
                          {/* Verification Checkmark */}
                          <button
                            type="button"
                            onClick={() => handleToggleVerification(row, 'company2')}
                            disabled={!canVerifyField('company2')}
                            className={`p-0.5 rounded transition ${
                              row.company2Verified
                                ? 'text-emerald-600 bg-emerald-100'
                                : canVerifyField('company2')
                                ? 'text-slate-400 hover:text-slate-700 cursor-pointer'
                                : 'text-slate-300 cursor-not-allowed'
                            }`}
                            title={
                              row.company2Verified
                                ? `सत्यापित द्वारा: ${row.company2VerifiedBy || 'Staff'}`
                                : 'सत्यापित करें'
                            }
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <div className="text-sm font-bold text-slate-900 font-mono">
                          {formatINR(row.company2Amount)}
                        </div>
                        {row.company2Shortage ? (
                          <div className="text-[10px] text-rose-600 font-bold mt-0.5 flex items-center gap-0.5">
                            <AlertTriangle className="w-2.5 h-2.5" />
                            <span>शॉर्ट: -₹{row.company2Shortage}</span>
                          </div>
                        ) : null}
                      </div>

                      {/* Cash Deposit */}
                      <div className="bg-slate-50 rounded-xl p-2.5 border border-slate-200">
                        <div className="text-[10px] font-semibold text-slate-500 flex items-center justify-between mb-0.5">
                          <span>कैश जमा (Cash)</span>
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
                        <div className="text-sm font-bold text-emerald-600 font-mono">
                          {formatINR(row.cashDeposit)}
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
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-sans whitespace-nowrap">
                <thead className="bg-slate-100 text-slate-700 text-[11px] uppercase tracking-wider font-bold border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-3">राइडर नाम (Rider)</th>
                    <th className="py-3 px-3 text-right">{sheetData.company1Name} (₹)</th>
                    <th className="py-3 px-3 text-right">{sheetData.company2Name} (₹)</th>
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
                      <td colSpan={9} className="py-10 px-4 text-center text-slate-500 font-sans">
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
                          <td className="py-3 px-3 text-right">
                            <span>{formatINR(row.company1Amount)}</span>
                            {row.company1Verified && <span className="text-emerald-600 ml-1">✓</span>}
                          </td>
                          <td className="py-3 px-3 text-right">
                            <span>{formatINR(row.company2Amount)}</span>
                            {row.company2Verified && <span className="text-emerald-600 ml-1">✓</span>}
                          </td>
                          <td className="py-3 px-3 text-right font-bold text-slate-900">
                            {formatINR(row.totalCod)}
                          </td>
                          <td className="py-3 px-3 text-right text-emerald-700 font-semibold">
                            <span>{formatINR(row.cashDeposit)}</span>
                            {row.cashVerified && <span className="text-emerald-600 ml-1">✓</span>}
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
              {/* Co 1 COD */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  {sheetData.company1Name} (₹ COD कलेक्शन)
                </label>
                <input
                  type="number"
                  inputMode="numeric"
                  min="0"
                  placeholder="0"
                  value={editCompany1}
                  onChange={(e) => setEditCompany1(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-mono text-lg font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
                />
              </div>

              {/* Co 2 COD */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  {sheetData.company2Name} (₹ COD कलेक्शन)
                </label>
                <input
                  type="number"
                  inputMode="numeric"
                  min="0"
                  placeholder="0"
                  value={editCompany2}
                  onChange={(e) => setEditCompany2(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-mono text-lg font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
                />
              </div>

              {/* Cash Deposit */}
              <div>
                <label className="block text-xs font-bold text-emerald-700 uppercase tracking-wider mb-1">
                  कैश जमा (Physical Cash Handed In ₹)
                </label>
                <input
                  type="number"
                  inputMode="numeric"
                  min="0"
                  placeholder="0"
                  value={editCash}
                  onChange={(e) => setEditCash(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-emerald-50/50 border border-emerald-300 rounded-xl text-emerald-700 font-mono text-lg font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
                />
              </div>

              {/* Online Deposit */}
              <div>
                <label className="block text-xs font-bold text-sky-700 uppercase tracking-wider mb-1">
                  ऑनलाइन जमा (UPI / QR Payment ₹)
                </label>
                <input
                  type="number"
                  inputMode="numeric"
                  min="0"
                  placeholder="0"
                  value={editOnline}
                  onChange={(e) => setEditOnline(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-sky-50/50 border border-sky-300 rounded-xl text-sky-700 font-mono text-lg font-bold focus:outline-none focus:ring-2 focus:ring-sky-500 focus:bg-white"
                />
              </div>

              {/* Live Auto-Calculated Summary Box */}
              {(() => {
                const c1 = Number(editCompany1) || 0;
                const c2 = Number(editCompany2) || 0;
                const cash = Number(editCash) || 0;
                const online = Number(editOnline) || 0;
                const totCod = c1 + c2;
                const totDep = cash + online;
                const diff = totCod - totDep;

                return (
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-1.5 font-mono text-xs">
                    <div className="flex justify-between text-slate-700">
                      <span>कुल COD (Co1 + Co2):</span>
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
                <div className="bg-rose-50 border border-rose-200 p-2.5 rounded-xl text-rose-700 font-mono font-bold">
                  शॉर्टेज रकम: {formatINR(Math.max(0, shortageModal.reportedAmount - Number(shortageModal.actualReceived)))}
                </div>
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
                className="px-4 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold cursor-pointer"
              >
                कन्फर्म शॉर्टेज
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
