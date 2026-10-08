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
  DailyCodSheetData 
} from '../types';
import { 
  authenticateCodStaffCompanion, 
  getStoredCodCompanionUser, 
  clearCodCompanionSession,
  subscribeToDailyCodSheet,
  updateSingleRiderEntryInSheet,
  toggleDayEndLockForSheet,
  checkHubCodAccess
} from '../services/codService';
import { getTodayDateString, formatINR } from '../utils/formatters';

interface CodCompanionAppProps {
  onBackToMainApp?: () => void;
  initialPhone?: string;
}

export function CodCompanionApp({ onBackToMainApp }: CodCompanionAppProps) {
  // Authentication State
  const [authUser, setAuthUser] = useState<CodStaffUser | null>(() => getStoredCodCompanionUser());
  const [phoneInput, setPhoneInput] = useState('');
  const [pinInput, setPinInput] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [showDemoLogins, setShowDemoLogins] = useState(false);
  const [isHubAccessBlocked, setIsHubAccessBlocked] = useState<boolean>(false);

  const currentHubId = authUser?.hubId || authUser?.ownerUid || authUser?.workspaceId;

  // Real-time Super Admin Feature Gate Check for logged in Hub
  useEffect(() => {
    if (!authUser) {
      setIsHubAccessBlocked(false);
      return;
    }
    const verifyHubAccess = async () => {
      const allowed = await checkHubCodAccess(currentHubId);
      if (!allowed) {
        setIsHubAccessBlocked(true);
      } else {
        setIsHubAccessBlocked(false);
      }
    };
    verifyHubAccess();
  }, [authUser, currentHubId]);

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

  // 1. Subscribe to Firebase Firestore real-time listener (0s zero-delay synchronization scoped to this hub)
  useEffect(() => {
    if (!authUser || isHubAccessBlocked) return;

    setIsRealtimeConnected(true);
    const unsubscribe = subscribeToDailyCodSheet(
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
      currentHubId
    );

    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [selectedDate, authUser, currentHubId, isHubAccessBlocked]);

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

  // 2. Handle Login
  const handleLogin = async (overridePhone?: string, overridePin?: string) => {
    const targetPhone = overridePhone || phoneInput;
    const targetPin = overridePin || pinInput;
    setLoginError('');
    setIsLoggingIn(true);

    try {
      const res = await authenticateCodStaffCompanion(targetPhone, targetPin);
      if (res.success && res.user) {
        setAuthUser(res.user);
        showToast(`✅ ${res.message}`, 'success');
      } else {
        setLoginError(res.message);
        showToast(`❌ ${res.message}`, 'error');
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
  const myRiderRow = useMemo(() => {
    if (!isRider) return null;
    return sheetData.entries.find((e) => isMatchingRiderRow(e)) || null;
  }, [sheetData.entries, isRider, authUser]);

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

  // Filtered rows for display
  const filteredEntries = useMemo(() => {
    if (!searchQuery.trim()) return sheetData.entries;
    const q = searchQuery.toLowerCase();
    return sheetData.entries.filter(
      (e) => e.riderName.toLowerCase().includes(q) || (e.riderPhone && e.riderPhone.includes(q))
    );
  }, [sheetData.entries, searchQuery]);

  // Overall Statistics
  const stats = useMemo(() => {
    const entries = sheetData.entries;
    const totalCod = entries.reduce((s, e) => s + (e.totalCod || 0), 0);
    const totalDeposit = entries.reduce((s, e) => s + (e.totalDeposit || 0), 0);
    const totalBalance = entries.reduce((s, e) => s + (e.balance || 0), 0);
    const totalShortage = entries.reduce((s, e) => 
      s + ((e.company1Shortage || 0) + (e.company2Shortage || 0) + (e.cashShortage || 0) + (e.onlineShortage || 0)), 0
    );
    return { totalCod, totalDeposit, totalBalance, totalShortage, count: entries.length };
  }, [sheetData.entries]);

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

    // 1. Optimistic Local UI Update
    setSheetData((prev) => {
      const entries = prev.entries || [];
      const idx = entries.findIndex((e) => isMatchingRiderRow(e) || e.riderId === updated.riderId);
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
    setEditingEntry(null);

    // 2. Direct Firestore Write and Background Sync
    try {
      await updateSingleRiderEntryInSheet(selectedDate, updated, {
        name: authUser.name,
        role: authUser.role,
      }, currentHubId);
      showToast(`✅ ${editingEntry.riderName} की COD एंट्री सफलतापूर्वक सेव व सिंक हो गई!`, 'success');
    } catch {
      showToast('एंट्री सेव करने में समस्या आई।', 'error');
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
  // VIEW 0: SUPER ADMIN GATE BLOCKED SCREEN
  // =========================================================================
  if (authUser && isHubAccessBlocked) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center items-center px-4 py-8 font-sans selection:bg-amber-500 selection:text-white">
        <div className="w-full max-w-md bg-slate-900 border border-amber-500/40 rounded-3xl p-6 sm:p-8 text-center shadow-2xl relative overflow-hidden backdrop-blur-xl">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center mx-auto mb-5 shadow-lg shadow-amber-500/10">
            <Lock className="w-8 h-8" />
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-white mb-2">
            सेवा सक्रिय नहीं है
          </h2>
          <p className="text-sm sm:text-base text-amber-300 font-medium mb-5 leading-relaxed">
            यह सेवा आपके हब के लिए अभी सक्रिय नहीं है। कृपया व्यवस्थापक से संपर्क करें।
          </p>
          <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4 mb-6 text-xs text-slate-400 space-y-2 text-left">
            <div className="flex items-center justify-between text-slate-300">
              <span className="font-semibold">लॉगिन उपयोगकर्ता:</span>
              <span className="font-medium text-white">{authUser.name}</span>
            </div>
            <div className="flex items-center justify-between text-slate-300">
              <span className="font-semibold">मोबाइल नंबर:</span>
              <span className="font-mono">{authUser.phone || 'N/A'}</span>
            </div>
            {currentHubId && (
              <div className="flex items-center justify-between text-slate-300">
                <span className="font-semibold">हब आईडी:</span>
                <span className="font-mono text-[11px] text-slate-400">{currentHubId.slice(0, 14)}...</span>
              </div>
            )}
            <p className="text-[11px] text-slate-500 pt-2 border-t border-slate-800/80">
              मुख्य व्यवस्थापक द्वारा इस हब के लिए 'COD Entry & Companion App Access' अनुमति चालू करने के उपरांत यह स्क्रीन स्वतः सक्रिय हो जाएगी।
            </p>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="w-full py-3 px-4 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-sm font-bold transition flex items-center justify-center gap-2 cursor-pointer shadow active:scale-95"
          >
            <LogOut className="w-4 h-4" />
            <span>लॉगआउट करें (Switch Account)</span>
          </button>
        </div>
      </div>
    );
  }

  // =========================================================================
  // VIEW 1: CLEAN SIMPLE LOGIN SCREEN (NO Hub Code)
  // =========================================================================
  if (!authUser) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center items-center px-4 py-8 font-sans selection:bg-emerald-500 selection:text-white">
        {/* Background glow styling */}
        <div className="fixed inset-0 pointer-events-none opacity-20">
          <div className="absolute -top-40 -left-40 w-96 h-96 bg-emerald-600 rounded-full blur-3xl" />
          <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-cyan-600 rounded-full blur-3xl" />
        </div>

        {/* Card Container */}
        <div className="relative w-full max-w-md bg-slate-900/90 border border-slate-800 rounded-2xl shadow-2xl p-6 sm:p-8 backdrop-blur-xl z-10">
          {/* Logo & Title */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white shadow-lg shadow-emerald-500/20 mb-4 animate-in zoom-in-95">
              <Bike className="w-8 h-8" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white flex items-center justify-center gap-2">
              <span>COD Entry</span>
              <span className="text-emerald-400 font-hindi">(हिसाब किताब)</span>
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 mt-1">
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
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                रजिस्टर्ड मोबाइल नंबर <span className="text-emerald-400 font-normal">(10 अंक)</span>
              </label>
              <div className="relative rounded-xl shadow-inner">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 text-sm font-semibold">
                  <Phone className="w-4 h-4 mr-1 text-slate-500" />
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
                    const clean = e.target.value.replace(/\D/g, '').slice(0, 10);
                    setPhoneInput(clean);
                    if (loginError) setLoginError('');
                  }}
                  autoFocus
                  required
                  className="w-full pl-20 pr-4 py-3 bg-slate-800/80 border border-slate-700 rounded-xl text-white placeholder-slate-500 text-base font-mono tracking-wider focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition"
                />
              </div>
            </div>

            {/* Input 2: 4-Digit Security PIN */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                4-अंकों का सिक्योरिटी PIN <span className="text-emerald-400 font-normal">(Security PIN)</span>
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
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
                  className="w-full pl-10 pr-4 py-3 bg-slate-800/80 border border-slate-700 rounded-xl text-white placeholder-slate-500 text-xl font-mono tracking-widest text-center focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition"
                />
              </div>
            </div>

            {/* Error Message in Hindi */}
            {loginError && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/40 rounded-xl text-rose-300 text-xs flex items-center gap-2 animate-in fade-in">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{loginError}</span>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoggingIn || phoneInput.length !== 10 || pinInput.length !== 4}
              className="w-full py-3.5 px-4 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl shadow-lg shadow-emerald-600/30 transition transform active:scale-98 flex items-center justify-center gap-2"
            >
              {isLoggingIn ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>सत्यापन हो रहा है...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-5 h-5 text-emerald-200" />
                  <span>लॉगिन करें (Sign In)</span>
                </>
              )}
            </button>
          </form>

          {/* Quick Demo Login Switcher */}
          <div className="mt-6 pt-6 border-t border-slate-800/80">
            <button
              type="button"
              onClick={() => setShowDemoLogins(!showDemoLogins)}
              className="w-full flex items-center justify-between text-xs text-slate-400 hover:text-emerald-400 py-1 transition"
            >
              <span className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>त्वरित परीक्षण / डेमो खाते (Instant 1-Click Test)</span>
              </span>
              <span className="text-[11px] bg-slate-800 px-2 py-0.5 rounded text-slate-300">
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
                    className="p-2.5 bg-slate-800/90 hover:bg-slate-700/80 border border-slate-700 rounded-lg text-left transition"
                  >
                    <div className="font-semibold text-emerald-300">🏍️ राइडर खाता</div>
                    <div className="text-[11px] text-slate-400 font-mono">9876543210 / 1234</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPhoneInput('9876543211');
                      setPinInput('4321');
                      handleLogin('9876543211', '4321');
                    }}
                    className="p-2.5 bg-slate-800/90 hover:bg-slate-700/80 border border-slate-700 rounded-lg text-left transition"
                  >
                    <div className="font-semibold text-sky-300">🎖️ टीम लीडर</div>
                    <div className="text-[11px] text-slate-400 font-mono">9876543211 / 4321</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPhoneInput('9876543212');
                      setPinInput('5678');
                      handleLogin('9876543212', '5678');
                    }}
                    className="p-2.5 bg-slate-800/90 hover:bg-slate-700/80 border border-slate-700 rounded-lg text-left transition"
                  >
                    <div className="font-semibold text-purple-300">📋 सुपरवाइजर</div>
                    <div className="text-[11px] text-slate-400 font-mono">9876543212 / 5678</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPhoneInput('9876543213');
                      setPinInput('9999');
                      handleLogin('9876543213', '9999');
                    }}
                    className="p-2.5 bg-slate-800/90 hover:bg-slate-700/80 border border-slate-700 rounded-lg text-left transition"
                  >
                    <div className="font-semibold text-amber-300">👑 हब इंचार्ज</div>
                    <div className="text-[11px] text-slate-400 font-mono">9876543213 / 9999</div>
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
                className="text-xs text-slate-400 hover:text-slate-200 transition underline underline-offset-4"
              >
                ← मुख्य कूरियर ऐप पर वापस जाएं (Back to Hub App)
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // =========================================================================
  // VIEW 2: AUTHENTICATED COMPANION MOBILE WEB APP
  // =========================================================================
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans pb-16 selection:bg-emerald-500 selection:text-white">
      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl shadow-2xl text-xs sm:text-sm font-semibold flex items-center gap-2 backdrop-blur-md animate-in slide-in-from-top-4 ${
            toast.type === 'success'
              ? 'bg-emerald-600/90 text-white border border-emerald-400/50'
              : toast.type === 'error'
              ? 'bg-rose-600/90 text-white border border-rose-400/50'
              : 'bg-indigo-600/90 text-white border border-indigo-400/50'
          }`}
        >
          {toast.type === 'success' && <CheckCircle2 className="w-4 h-4 shrink-0" />}
          {toast.type === 'error' && <AlertCircle className="w-4 h-4 shrink-0" />}
          {toast.type === 'info' && <RefreshCw className="w-4 h-4 shrink-0" />}
          <span>{toast.text}</span>
        </div>
      )}

      {/* 1. STICKY TOP APP BAR */}
      <header className="sticky top-0 z-40 bg-slate-900/95 border-b border-slate-800 backdrop-blur-md px-3 sm:px-6 py-3 shadow-md">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-2">
          {/* Brand & Active User Info */}
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white flex items-center justify-center shrink-0 shadow-md">
              <Bike className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-sm sm:text-base font-bold text-white tracking-tight truncate">
                  COD Entry <span className="text-emerald-400 font-hindi">(हिसाब किताब)</span>
                </h1>
                {/* Role Badge */}
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider shrink-0 ${
                    authUser.role === 'rider'
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                      : authUser.role === 'team_leader'
                      ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                      : authUser.role === 'supervisor'
                      ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                      : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                  }`}
                >
                  {authUser.role === 'rider' && '🏍️ राइडर'}
                  {authUser.role === 'team_leader' && '🎖️ TL'}
                  {authUser.role === 'supervisor' && '📋 सुपरवाइजर'}
                  {authUser.role === 'hub_incharge' && '👑 हब इंचार्ज'}
                </span>
              </div>
              <div className="text-[11px] text-slate-400 truncate flex items-center gap-1.5">
                <span className="font-medium text-slate-300">{authUser.name}</span>
                {authUser.phone && <span>• {authUser.phone}</span>}
              </div>
            </div>
          </div>

          {/* Right Controls: Real-time Indicator & Logout */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Live Synced Indicator */}
            <div
              className={`hidden sm:flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full border ${
                isRealtimeConnected
                  ? 'bg-emerald-950/40 text-emerald-300 border-emerald-800/60'
                  : 'bg-amber-950/40 text-amber-300 border-amber-800/60'
              }`}
              title="Firebase Firestore onSnapshot Live Sync"
            >
              {isRealtimeConnected ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping inline-block" />
                  <span>0s लाइव सिंक</span>
                </>
              ) : (
                <>
                  <WifiOff className="w-3 h-3 text-amber-400" />
                  <span>ऑफ़लाइन</span>
                </>
              )}
            </div>

            {/* Logout Button */}
            <button
              type="button"
              onClick={handleLogout}
              className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold flex items-center gap-1 transition"
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
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3 sm:p-4 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-md">
          {/* Date Navigator */}
          <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-start">
            <button
              type="button"
              onClick={() => handleDateStep(-1)}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
              title="पिछला दिन"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-emerald-400 shrink-0" />
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1 text-sm font-semibold text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
              {!isToday && (
                <button
                  type="button"
                  onClick={() => setSelectedDate(todayStr)}
                  className="px-2 py-1 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 text-xs rounded font-medium transition"
                >
                  आज (Today)
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => handleDateStep(1)}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
              title="अगला दिन"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Date Status Badges & Incharge Controls */}
          <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
            {isPastDate && (
              <span className="text-xs bg-slate-800 border border-slate-700 text-amber-300 px-2.5 py-1 rounded-lg flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-amber-400" />
                <span>पुराना रिकॉर्ड (Read-Only)</span>
              </span>
            )}

            {isDayEndLocked ? (
              <span className="text-xs bg-rose-500/10 border border-rose-500/30 text-rose-300 px-2.5 py-1 rounded-lg flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-rose-400" />
                <span>दिन का हिसाब लॉक (Locked)</span>
              </span>
            ) : isToday ? (
              <span className="text-xs bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 px-2.5 py-1 rounded-lg flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>आज का दिन (Active)</span>
              </span>
            ) : null}

            {/* Hub Incharge Toggle Lock Button */}
            {canToggleLock && (
              <button
                type="button"
                onClick={handleToggleDayEndLock}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 shadow ${
                  isDayEndLocked
                    ? 'bg-amber-600 hover:bg-amber-500 text-white'
                    : 'bg-rose-600 hover:bg-rose-500 text-white'
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
          <div className="bg-gradient-to-r from-rose-950/80 to-amber-950/80 border-2 border-rose-500/60 rounded-2xl p-4 shadow-xl animate-in zoom-in-95">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-xl bg-rose-600/30 border border-rose-500 text-rose-300 shrink-0">
                <AlertTriangle className="w-6 h-6 animate-pulse" />
              </div>
              <div className="space-y-1.5 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-rose-200">
                    ⚠️ हिसाब में शॉर्टेज पाई गई है! (Shortage Flagged by Hub)
                  </h3>
                  <span className="text-xs bg-rose-600 text-white font-extrabold px-2 py-0.5 rounded-full font-mono">
                    कुल कमी: {formatINR(myShortageAlert.totalShort)}
                  </span>
                </div>
                <p className="text-xs text-rose-300/90">
                  हब सुपरवाइजर/इंचार्ज द्वारा आपके आज के जमा में निम्नलिखित अंतर दर्ज किया गया है:
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                  {myShortageAlert.items.map((item, idx) => (
                    <div
                      key={idx}
                      className="bg-slate-900/80 border border-rose-700/50 rounded-xl px-3 py-1.5 text-xs flex items-center justify-between"
                    >
                      <span className="font-medium text-slate-300">{item.label}:</span>
                      <span className="font-bold text-rose-400 font-mono">-{formatINR(item.amount)}</span>
                      {item.notes && <span className="text-[10px] text-slate-400 truncate max-w-[120px]">({item.notes})</span>}
                    </div>
                  ))}
                </div>
                <div className="text-[11px] text-amber-300/90 pt-1">
                  💡 कृपया तुरंत हब कैश काउंटर पर संपर्क कर अपनी रसीद या बैंक UPI यूटीआर दिखाएं।
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 4. SUMMARY STATS CARDS */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
          {/* Card 1: Total COD */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-3 sm:p-4 shadow-md">
            <div className="text-[11px] font-semibold text-slate-400 flex items-center gap-1.5 mb-1">
              <Building2 className="w-3.5 h-3.5 text-sky-400" />
              <span>{isRider ? 'मेरी कुल COD' : 'हब कुल COD'}</span>
            </div>
            <div className="text-lg sm:text-2xl font-extrabold text-white font-mono">
              {formatINR(isRider && myRiderRow ? myRiderRow.totalCod : stats.totalCod)}
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">
              {sheetData.company1Name} + {sheetData.company2Name}
            </div>
          </div>

          {/* Card 2: Total Deposit */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-3 sm:p-4 shadow-md">
            <div className="text-[11px] font-semibold text-slate-400 flex items-center gap-1.5 mb-1">
              <Coins className="w-3.5 h-3.5 text-emerald-400" />
              <span>{isRider ? 'मेरी कुल जमा' : 'कुल जमा (Deposit)'}</span>
            </div>
            <div className="text-lg sm:text-2xl font-extrabold text-emerald-400 font-mono">
              {formatINR(isRider && myRiderRow ? myRiderRow.totalDeposit : stats.totalDeposit)}
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">
              कैश + ऑनलाइन UPI
            </div>
          </div>

          {/* Card 3: Difference / Balance */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-3 sm:p-4 shadow-md">
            <div className="text-[11px] font-semibold text-slate-400 flex items-center gap-1.5 mb-1">
              <Clock className="w-3.5 h-3.5 text-amber-400" />
              <span>अंतर / बकाया (Due)</span>
            </div>
            {(() => {
              const bal = isRider && myRiderRow ? myRiderRow.balance : stats.totalBalance;
              return (
                <div
                  className={`text-lg sm:text-2xl font-extrabold font-mono ${
                    bal === 0
                      ? 'text-emerald-400'
                      : bal > 0
                      ? 'text-amber-400'
                      : 'text-purple-400'
                  }`}
                >
                  {formatINR(bal)}
                </div>
              );
            })()}
            <div className="text-[10px] text-slate-500 mt-0.5">
              कुल COD - कुल जमा
            </div>
          </div>

          {/* Card 4: Shortages Flagged */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-3 sm:p-4 shadow-md">
            <div className="text-[11px] font-semibold text-slate-400 flex items-center gap-1.5 mb-1">
              <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
              <span>शॉर्टेज (Shortage)</span>
            </div>
            <div className="text-lg sm:text-2xl font-extrabold text-rose-400 font-mono">
              {formatINR(isRider && myRiderRow ? (myShortageAlert?.totalShort || 0) : stats.totalShortage)}
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">
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
            className="cursor-pointer bg-gradient-to-r from-emerald-950/60 to-slate-900 border border-emerald-500/40 hover:border-emerald-400 rounded-2xl p-4 shadow-lg flex flex-col sm:flex-row items-center justify-between gap-3 transition active:scale-[0.99]"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 border border-emerald-500/30">
                <Edit3 className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  <span>आपकी दैनिक COD शीट ({selectedDate})</span>
                  <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full font-bold">
                    क्लिक कर भरें
                  </span>
                </h4>
                <p className="text-xs text-slate-400">
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
                className="w-full sm:w-auto px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-sm rounded-xl shadow-lg shadow-emerald-600/30 transition flex items-center justify-center gap-2"
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
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="राइडर नाम या फोन से खोजें..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          {/* View Mode Toggle: Cards vs Table */}
          <div className="flex items-center gap-1.5 self-end sm:self-auto bg-slate-900 border border-slate-800 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => setViewMode('cards')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
                viewMode === 'cards'
                  ? 'bg-emerald-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>कार्ड दृश्य (Mobile Touch)</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
                viewMode === 'table'
                  ? 'bg-emerald-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>एक्सेल शीट (Spreadsheet)</span>
            </button>
          </div>
        </div>

        {/* 7. RENDERING ENTRIES: CARDS VIEW */}
        {viewMode === 'cards' && (
          <div className="space-y-3">
            {filteredEntries.length === 0 ? (
              <div className="text-center py-10 bg-slate-900/60 border border-slate-800 rounded-2xl p-6 text-slate-400 space-y-3">
                <Bike className="w-10 h-10 mx-auto text-slate-600 mb-2" />
                <p className="text-sm font-semibold">कोई राइडर एंट्री नहीं मिली।</p>
                <p className="text-xs text-slate-500">
                  इस तारीख के लिए अभी तक कोई रिकॉर्ड उपलब्ध नहीं है।
                </p>
                {!isPastDate && !isDayEndLocked && (
                  <button
                    type="button"
                    onClick={() => handleOpenEditRow(null)}
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-emerald-600/30 transition transform active:scale-95"
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
                    className={`bg-slate-900 border rounded-2xl p-4 shadow-md transition ${
                      canEditThis ? 'cursor-pointer hover:border-emerald-500/80 active:scale-[0.99]' : ''
                    } ${
                      isMyRow
                        ? 'border-emerald-500/70 ring-1 ring-emerald-500/30'
                        : hasShortage
                        ? 'border-rose-700/60 bg-rose-950/20'
                        : 'border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    {/* Top Row: Rider Name, Role badge, and Edit button */}
                    <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-800/80">
                      <div className="flex items-center gap-2 min-w-0">
                        <div
                          className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 font-bold text-xs ${
                            isMyRow
                              ? 'bg-emerald-600 text-white'
                              : 'bg-slate-800 text-slate-300'
                          }`}
                        >
                          {row.riderName.charAt(0)}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm text-white truncate">
                              {row.riderName}
                            </span>
                            {isMyRow && (
                              <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-1.5 py-0.2 rounded font-bold">
                                मेरी एंट्री
                              </span>
                            )}
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
                            className="px-3 py-1.5 bg-emerald-600/90 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-1 shadow"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            <span>एडिट करें</span>
                          </button>
                        ) : (
                          <span className="text-[11px] text-slate-500 flex items-center gap-1">
                            <Eye className="w-3 h-3" />
                            <span>केवल देखें</span>
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Financial Values Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-3">
                      {/* Co 1: Valmo COD */}
                      <div className="bg-slate-800/60 rounded-xl p-2.5 border border-slate-800">
                        <div className="text-[10px] font-semibold text-slate-400 flex items-center justify-between mb-0.5">
                          <span>{sheetData.company1Name}</span>
                          {/* Verification Checkmark */}
                          <button
                            type="button"
                            onClick={() => handleToggleVerification(row, 'company1')}
                            disabled={!canVerifyField('company1')}
                            className={`p-0.5 rounded transition ${
                              row.company1Verified
                                ? 'text-emerald-400 bg-emerald-500/20'
                                : canVerifyField('company1')
                                ? 'text-slate-600 hover:text-slate-300'
                                : 'text-slate-700 cursor-not-allowed'
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
                        <div className="text-sm font-bold text-white font-mono">
                          {formatINR(row.company1Amount)}
                        </div>
                        {row.company1Shortage ? (
                          <div className="text-[10px] text-rose-400 font-bold mt-0.5 flex items-center gap-0.5">
                            <AlertTriangle className="w-2.5 h-2.5" />
                            <span>शॉर्ट: -₹{row.company1Shortage}</span>
                          </div>
                        ) : null}
                      </div>

                      {/* Co 2: Xpressbees COD */}
                      <div className="bg-slate-800/60 rounded-xl p-2.5 border border-slate-800">
                        <div className="text-[10px] font-semibold text-slate-400 flex items-center justify-between mb-0.5">
                          <span>{sheetData.company2Name}</span>
                          {/* Verification Checkmark */}
                          <button
                            type="button"
                            onClick={() => handleToggleVerification(row, 'company2')}
                            disabled={!canVerifyField('company2')}
                            className={`p-0.5 rounded transition ${
                              row.company2Verified
                                ? 'text-emerald-400 bg-emerald-500/20'
                                : canVerifyField('company2')
                                ? 'text-slate-600 hover:text-slate-300'
                                : 'text-slate-700 cursor-not-allowed'
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
                        <div className="text-sm font-bold text-white font-mono">
                          {formatINR(row.company2Amount)}
                        </div>
                        {row.company2Shortage ? (
                          <div className="text-[10px] text-rose-400 font-bold mt-0.5 flex items-center gap-0.5">
                            <AlertTriangle className="w-2.5 h-2.5" />
                            <span>शॉर्ट: -₹{row.company2Shortage}</span>
                          </div>
                        ) : null}
                      </div>

                      {/* Cash Deposit */}
                      <div className="bg-slate-800/60 rounded-xl p-2.5 border border-slate-800">
                        <div className="text-[10px] font-semibold text-slate-400 flex items-center justify-between mb-0.5">
                          <span>कैश जमा (Cash)</span>
                          {/* Verification Checkmark */}
                          <button
                            type="button"
                            onClick={() => handleToggleVerification(row, 'cash')}
                            disabled={!canVerifyField('cash')}
                            className={`p-0.5 rounded transition ${
                              row.cashVerified
                                ? 'text-emerald-400 bg-emerald-500/20'
                                : canVerifyField('cash')
                                ? 'text-slate-600 hover:text-slate-300'
                                : 'text-slate-700 cursor-not-allowed'
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
                        <div className="text-sm font-bold text-emerald-400 font-mono">
                          {formatINR(row.cashDeposit)}
                        </div>
                        {row.cashShortage ? (
                          <div className="text-[10px] text-rose-400 font-bold mt-0.5 flex items-center gap-0.5">
                            <AlertTriangle className="w-2.5 h-2.5" />
                            <span>कम कैश: -₹{row.cashShortage}</span>
                          </div>
                        ) : null}
                      </div>

                      {/* Online Deposit */}
                      <div className="bg-slate-800/60 rounded-xl p-2.5 border border-slate-800">
                        <div className="text-[10px] font-semibold text-slate-400 flex items-center justify-between mb-0.5">
                          <span>ऑनलाइन (UPI/QR)</span>
                          {/* Verification Checkmark */}
                          <button
                            type="button"
                            onClick={() => handleToggleVerification(row, 'online')}
                            disabled={!canVerifyField('online')}
                            className={`p-0.5 rounded transition ${
                              row.onlineVerified
                                ? 'text-emerald-400 bg-emerald-500/20'
                                : canVerifyField('online')
                                ? 'text-slate-600 hover:text-slate-300'
                                : 'text-slate-700 cursor-not-allowed'
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
                        <div className="text-sm font-bold text-sky-400 font-mono">
                          {formatINR(row.onlineDeposit)}
                        </div>
                        {row.onlineShortage ? (
                          <div className="text-[10px] text-rose-400 font-bold mt-0.5 flex items-center gap-0.5">
                            <AlertTriangle className="w-2.5 h-2.5" />
                            <span>कम ऑनलाइन: -₹{row.onlineShortage}</span>
                          </div>
                        ) : null}
                      </div>
                    </div>

                    {/* Bottom Summary Pill: Total COD, Total Deposit, Balance */}
                    <div className="mt-3 pt-2.5 border-t border-slate-800/60 flex items-center justify-between text-xs font-mono">
                      <div className="flex items-center gap-3">
                        <span className="text-slate-400">
                          कुल COD: <strong className="text-white">{formatINR(row.totalCod)}</strong>
                        </span>
                        <span className="text-slate-400">
                          कुल जमा: <strong className="text-emerald-400">{formatINR(row.totalDeposit)}</strong>
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-slate-400">अंतर:</span>
                        <span
                          className={`font-extrabold px-2 py-0.5 rounded ${
                            row.balance === 0
                              ? 'bg-emerald-500/20 text-emerald-300'
                              : row.balance > 0
                              ? 'bg-amber-500/20 text-amber-300'
                              : 'bg-purple-500/20 text-purple-300'
                          }`}
                        >
                          {formatINR(row.balance)}
                        </span>

                        {/* Incharge Flag Shortage Action */}
                        {(isHubIncharge || isSupervisor) && (
                          <button
                            type="button"
                            onClick={() => handleOpenShortageModal(row, 'cash')}
                            className="text-[11px] text-rose-400 hover:text-rose-300 underline font-sans ml-1"
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

        {/* 8. RENDERING ENTRIES: EXCEL SPREADSHEET TABLE VIEW */}
        {viewMode === 'table' && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-md overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-sans whitespace-nowrap">
                <thead className="bg-slate-800/90 text-slate-300 text-[11px] uppercase tracking-wider font-semibold border-b border-slate-700">
                  <tr>
                    <th className="py-3 px-3">राइडर नाम (Rider)</th>
                    <th className="py-3 px-3 text-right">{sheetData.company1Name} (₹)</th>
                    <th className="py-3 px-3 text-right">{sheetData.company2Name} (₹)</th>
                    <th className="py-3 px-3 text-right text-sky-300 font-bold">कुल COD (₹)</th>
                    <th className="py-3 px-3 text-right text-emerald-300">कैश जमा (₹)</th>
                    <th className="py-3 px-3 text-right text-teal-300">ऑनलाइन (₹)</th>
                    <th className="py-3 px-3 text-right text-emerald-400 font-bold">कुल जमा (₹)</th>
                    <th className="py-3 px-3 text-right font-bold">बकाया / अंतर (₹)</th>
                    <th className="py-3 px-3 text-center">एक्शन</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 font-mono">
                  {filteredEntries.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-10 px-4 text-center text-slate-400 font-sans">
                        <div className="space-y-2.5">
                          <p className="text-sm font-semibold">कोई राइडर एंट्री नहीं मिली।</p>
                          <p className="text-xs text-slate-500">इस तारीख के लिए अभी तक कोई रिकॉर्ड उपलब्ध नहीं है।</p>
                          {!isPastDate && !isDayEndLocked && (
                            <button
                              type="button"
                              onClick={() => handleOpenEditRow(null)}
                              className="inline-flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs rounded-xl shadow transition"
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
                              ? 'bg-emerald-950/30 hover:bg-emerald-950/50'
                              : 'hover:bg-slate-800/50'
                          }`}
                        >
                          <td className="py-3 px-3 font-sans">
                            <div className="font-bold text-white flex items-center gap-1.5">
                              <span>{row.riderName}</span>
                              {isMyRow && (
                                <span className="text-[9px] bg-emerald-500/20 text-emerald-300 px-1 rounded font-bold">
                                  You
                                </span>
                              )}
                            </div>
                            {row.riderPhone && (
                              <span className="text-[10px] text-slate-500 font-mono">
                                {row.riderPhone}
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-3 text-right">
                            <span>{formatINR(row.company1Amount)}</span>
                            {row.company1Verified && <span className="text-emerald-400 ml-1">✓</span>}
                          </td>
                          <td className="py-3 px-3 text-right">
                            <span>{formatINR(row.company2Amount)}</span>
                            {row.company2Verified && <span className="text-emerald-400 ml-1">✓</span>}
                          </td>
                          <td className="py-3 px-3 text-right font-bold text-white">
                            {formatINR(row.totalCod)}
                          </td>
                          <td className="py-3 px-3 text-right text-emerald-300">
                            <span>{formatINR(row.cashDeposit)}</span>
                            {row.cashVerified && <span className="text-emerald-400 ml-1">✓</span>}
                          </td>
                          <td className="py-3 px-3 text-right text-teal-300">
                            <span>{formatINR(row.onlineDeposit)}</span>
                            {row.onlineVerified && <span className="text-emerald-400 ml-1">✓</span>}
                          </td>
                          <td className="py-3 px-3 text-right font-bold text-emerald-400">
                            {formatINR(row.totalDeposit)}
                          </td>
                          <td className="py-3 px-3 text-right font-bold">
                            <span
                              className={
                                row.balance === 0
                                  ? 'text-emerald-400'
                                  : row.balance > 0
                                  ? 'text-amber-400'
                                  : 'text-purple-400'
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
                                className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold"
                              >
                                एडिट
                              </button>
                            ) : (
                              <span className="text-slate-600 text-xs">—</span>
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
          MODAL 1: RIDER ROW EDIT MODAL (Mobile Touch Friendly)
      ===================================================================== */}
      {editingEntry && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in">
          <div className="w-full sm:max-w-lg bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-2xl p-5 sm:p-6 shadow-2xl max-h-[90vh] overflow-y-auto space-y-4">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400">
                  <Edit3 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">
                    COD एंट्री दर्ज करें ({editingEntry.riderName})
                  </h3>
                  <p className="text-xs text-slate-400">
                    तारीख: {selectedDate} • तुरंत 0s लाइव सिंक
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingEntry(null)}
                className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Inputs */}
            <div className="space-y-3.5">
              {/* Co 1 COD */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  {sheetData.company1Name} (₹ COD कलेक्शन)
                </label>
                <input
                  type="number"
                  inputMode="numeric"
                  min="0"
                  placeholder="0"
                  value={editCompany1}
                  onChange={(e) => setEditCompany1(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white font-mono text-lg font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {/* Co 2 COD */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  {sheetData.company2Name} (₹ COD कलेक्शन)
                </label>
                <input
                  type="number"
                  inputMode="numeric"
                  min="0"
                  placeholder="0"
                  value={editCompany2}
                  onChange={(e) => setEditCompany2(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white font-mono text-lg font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {/* Cash Deposit */}
              <div>
                <label className="block text-xs font-semibold text-emerald-300 uppercase tracking-wider mb-1">
                  कैश जमा (Physical Cash Handed In ₹)
                </label>
                <input
                  type="number"
                  inputMode="numeric"
                  min="0"
                  placeholder="0"
                  value={editCash}
                  onChange={(e) => setEditCash(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-800 border border-emerald-600/60 rounded-xl text-emerald-300 font-mono text-lg font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {/* Online Deposit */}
              <div>
                <label className="block text-xs font-semibold text-sky-300 uppercase tracking-wider mb-1">
                  ऑनलाइन जमा (UPI / QR Payment ₹)
                </label>
                <input
                  type="number"
                  inputMode="numeric"
                  min="0"
                  placeholder="0"
                  value={editOnline}
                  onChange={(e) => setEditOnline(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-800 border border-sky-600/60 rounded-xl text-sky-300 font-mono text-lg font-bold focus:outline-none focus:ring-2 focus:ring-sky-500"
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
                  <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3 space-y-1.5 font-mono text-xs">
                    <div className="flex justify-between text-slate-300">
                      <span>कुल COD (Co1 + Co2):</span>
                      <strong className="text-white">{formatINR(totCod)}</strong>
                    </div>
                    <div className="flex justify-between text-emerald-300">
                      <span>कुल जमा (कैश + ऑनलाइन):</span>
                      <strong>{formatINR(totDep)}</strong>
                    </div>
                    <div className="flex justify-between border-t border-slate-800 pt-1.5 font-bold">
                      <span className="text-slate-300">अंतर / बैलेंस (COD - जमा):</span>
                      <span
                        className={
                          diff === 0
                            ? 'text-emerald-400'
                            : diff > 0
                            ? 'text-amber-400'
                            : 'text-purple-400'
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
                <label className="block text-xs font-semibold text-slate-400 mb-1">
                  टिप्पणी / Notes (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. 500 का नोट बाद में दिया..."
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>
            </div>

            {/* Modal Actions */}
            <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingEntry(null)}
                className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition"
              >
                रद्द करें
              </button>
              <button
                type="button"
                onClick={handleSaveEditRow}
                disabled={isSavingEntry}
                className="px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-lg shadow-emerald-600/30"
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
          MODAL 2: INCHARGE SHORTAGE MARKING MODAL
      ===================================================================== */}
      {shortageModal.isOpen && shortageModal.row && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="w-full max-w-md bg-slate-900 border border-rose-500/50 rounded-2xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-rose-400" />
                <h3 className="text-sm font-bold text-white">
                  शॉर्टेज मार्क करें ({shortageModal.row.riderName})
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShortageModal((prev) => ({ ...prev, isOpen: false }))}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                <div className="text-slate-400">रिपोर्टेड रकम:</div>
                <div className="text-base font-bold text-white font-mono">
                  {formatINR(shortageModal.reportedAmount)}
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-300 mb-1">
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
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white font-mono text-base font-bold focus:outline-none focus:ring-1 focus:ring-rose-500"
                />
              </div>

              {shortageModal.actualReceived !== '' && (
                <div className="bg-rose-500/10 border border-rose-500/30 p-2.5 rounded-xl text-rose-300 font-mono font-bold">
                  शॉर्टेज रकम: {formatINR(Math.max(0, shortageModal.reportedAmount - Number(shortageModal.actualReceived)))}
                </div>
              )}

              <div>
                <label className="block font-semibold text-slate-300 mb-1">
                  कारण / टिप्पणी (Notes):
                </label>
                <input
                  type="text"
                  placeholder="e.g. 200 रुपये कम जमा किए..."
                  value={shortageModal.notes}
                  onChange={(e) =>
                    setShortageModal((prev) => ({ ...prev, notes: e.target.value }))
                  }
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setShortageModal((prev) => ({ ...prev, isOpen: false }))}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs"
              >
                रद्द करें
              </button>
              <button
                type="button"
                onClick={handleSaveShortage}
                className="px-4 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-bold"
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
