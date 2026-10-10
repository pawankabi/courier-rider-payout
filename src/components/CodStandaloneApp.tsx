import React, { useState, useEffect, useMemo } from 'react';
import { 
  ArrowLeft, 
  Table, 
  Lock, 
  Unlock, 
  ShieldCheck, 
  Users, 
  UserPlus,
  FileSpreadsheet, 
  Download, 
  Check, 
  AlertCircle, 
  Search, 
  Calendar, 
  Save, 
  Key, 
  Eye, 
  EyeOff, 
  RotateCcw, 
  CheckCircle2, 
  Clock, 
  ArrowRight, 
  Filter, 
  Sparkles, 
  IndianRupee, 
  Settings2, 
  Edit3, 
  AlertTriangle, 
  ChevronRight,
  LogOut,
  Smartphone,
  Sliders,
  Building,
  HelpCircle,
  X,
  Plus,
  Bike
} from 'lucide-react';
import { 
  Rider, 
  CodDailyEntry, 
  CodStaffUser, 
  CodAuditLog, 
  CodSettings, 
  CodStaffRole 
} from '../types';
import { 
  loadCodSettings, 
  saveCodSettings, 
  loadCodStaffUsers, 
  saveCodStaffUsers, 
  createNewStaffUser,
  loadCodDailyEntries, 
  saveCodDailyEntries, 
  loadCodAuditLogs, 
  recordCodAuditLog, 
  exportCodGridToCSV,
  subscribeToDailyCodSheet,
  fetchCodRiders
} from '../services/codService';
import { isEntityOwnedByUser } from '../services/firestoreSync';
import { getRiderAppUrl } from '../utils/shareLink';
import { 
  formatINR, 
  formatDateDisplay, 
  getTodayDateString, 
  getDaysAgoDateString,
  isValidIndianPhone,
  cleanPhoneNumber
} from '../utils/formatters';

interface Props {
  onExit: () => void;
  riders: Rider[];
  userId: string;
  isSuperAdmin: boolean;
  hubName?: string;
}

export const CodStandaloneApp: React.FC<Props> = ({
  onExit,
  riders,
  userId,
  isSuperAdmin,
  hubName = 'सरायकेला कूरियर हब',
}) => {
  // Dedicated Bottom Navigation Tabs: 'grid' | 'access_control' | 'audit_logs' | 'settings'
  const [activeTab, setActiveTab] = useState<'grid' | 'access_control' | 'audit_logs' | 'settings'>('grid');

  // Strict Multi-Tenant Rider Isolation:
  // The riders displayed in this COD sheet MUST be 100% IDENTICAL to the riders list in the Main App's "Riders" tab.
  // Filters out riders belonging to other hubs (such as "Akash Mahato") completely from memory and display.
  const activeTenantRiders = useMemo(() => {
    if (!riders || !Array.isArray(riders)) return [];
    const cleanUid = (userId || '').trim();
    if (!cleanUid || cleanUid === 'guest') {
      return riders.filter((r) => !r.createdBy || r.createdBy === 'guest' || r.workspaceId === 'guest');
    }
    return riders.filter((r) => {
      const owner = (r.workspaceId || r.userId || r.hubId || r.ownerUid || r.createdBy || '').trim();
      if (owner) {
        return owner === cleanUid;
      }
      return isEntityOwnedByUser(r, cleanUid);
    });
  }, [riders, userId]);

  // Selected Date for COD Grid (defaults to Today)
  const [selectedDate, setSelectedDate] = useState<string>(getTodayDateString());

  // Settings state (Company names, feature flag, lock rules)
  const [settings, setSettings] = useState<CodSettings>({
    isEnabled: false,
    company1Name: 'Valmo COD',
    company2Name: 'Xpressbees COD',
    defaultLockTime: '23:00',
    updatedAt: new Date().toISOString(),
  });

  // Staff & Rider PIN Users
  const [staffUsers, setStaffUsers] = useState<CodStaffUser[]>([]);

  // Daily Grid Entries
  const [gridEntries, setGridEntries] = useState<CodDailyEntry[]>([]);

  // Audit Logs
  const [auditLogs, setAuditLogs] = useState<CodAuditLog[]>([]);

  // Loading & Sync states
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Active Session / Persona (Default is Hub Incharge / Owner for Super Admin / Hub Manager)
  const [activeUser, setActiveUser] = useState<{
    id: string;
    name: string;
    role: CodStaffRole | 'owner';
    riderId?: string;
  }>({
    id: 'owner',
    name: 'Hub Incharge (Owner)',
    role: 'hub_incharge',
  });

  // 1. View-First Grid State: Editing Row ID
  const [editingRiderId, setEditingRiderId] = useState<string | null>(null);
  const [editRowForm, setEditRowForm] = useState<{
    company1Amount: number;
    company2Amount: number;
    cashDeposit: number;
    onlineDeposit: number;
    notes: string;
  } | null>(null);

  // 3. Automated Date Lock & Historical Read-Only Safeguard
  const [ownerTemporaryUnlock, setOwnerTemporaryUnlock] = useState<boolean>(false);

  // 4. Add Staff Modal State
  const [isAddStaffModalOpen, setIsAddStaffModalOpen] = useState<boolean>(false);
  const [newStaffName, setNewStaffName] = useState('');
  const [newStaffPhone, setNewStaffPhone] = useState('');
  const [newStaffRole, setNewStaffRole] = useState<'supervisor' | 'team_leader' | 'hub_incharge'>('supervisor');
  const [newStaffPin, setNewStaffPin] = useState('');
  const [newStaffCanVerifyCod, setNewStaffCanVerifyCod] = useState(true);
  const [newStaffCanVerifyCash, setNewStaffCanVerifyCash] = useState(true);
  const [newStaffCanVerifyOnline, setNewStaffCanVerifyOnline] = useState(true);
  const [newStaffError, setNewStaffError] = useState('');

  // Shortage Marking Modal State
  const [shortageModal, setShortageModal] = useState<{
    isOpen: boolean;
    riderId: string;
    riderName: string;
    field: 'company1' | 'company2' | 'cash' | 'online';
    fieldLabel: string;
    reportedAmount: number;
    actualReceived: number;
    shortageAmount: number;
    notes: string;
  } | null>(null);

  // PIN Login / Persona Switcher Modal
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const [inputPin, setInputPin] = useState('');
  const [pinError, setPinError] = useState('');

  // Settings form temp state
  const [tempCompany1, setTempCompany1] = useState('');
  const [tempCompany2, setTempCompany2] = useState('');
  const [tempLockTime, setTempLockTime] = useState('23:00');

  // Grid search & filter
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'due' | 'balanced' | 'submitted' | 'verified'>('all');

  // PIN visibility toggle in Access Control
  const [revealedPins, setRevealedPins] = useState<Record<string, boolean>>({});

  const showToast = (text: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 3500);
  };

  // 1. Initial Load of Settings, Staff, and Today's Grid
  useEffect(() => {
    let mounted = true;
    const initialize = async () => {
      setIsLoading(true);
      try {
        const [loadedSettings, loadedStaff, loadedLogs] = await Promise.all([
          loadCodSettings(userId),
          loadCodStaffUsers(userId, activeTenantRiders),
          loadCodAuditLogs(userId),
        ]);

        if (mounted) {
          setSettings(loadedSettings);
          setTempCompany1(loadedSettings.company1Name);
          setTempCompany2(loadedSettings.company2Name);
          setTempLockTime(loadedSettings.defaultLockTime || '23:00');
          setStaffUsers(loadedStaff);
          setAuditLogs(loadedLogs);
        }

        // Load Grid for Selected Date strictly with active tenant riders
        const entries = await loadCodDailyEntries(userId, selectedDate, activeTenantRiders);
        if (mounted) {
          setGridEntries(entries);
        }
      } catch (err) {
        console.error('Error initializing COD module:', err);
      } finally {
        if (mounted) setIsLoading(false);
      }
    };

    initialize();
    return () => {
      mounted = false;
    };
  }, [userId, activeTenantRiders]);

  // 2. Real-Time bi-directional synchronization on daily_cod_sheets/{selectedDate}
  // Immediately syncs whenever a rider saves in companion app without needing page reload
  useEffect(() => {
    let mounted = true;
    setEditingRiderId(null);
    setEditRowForm(null);
    setOwnerTemporaryUnlock(false);

    // Initial cache-first load
    loadCodDailyEntries(userId, selectedDate, activeTenantRiders).then((entries) => {
      if (mounted) {
        setGridEntries(entries);
      }
    });

    // Active real-time Firestore onSnapshot listener on daily_cod_sheets/{selectedDate}
    const unsubscribe = subscribeToDailyCodSheet(
      selectedDate,
      (sheetData) => {
        if (!mounted) return;
        if (sheetData && Array.isArray(sheetData.entries) && sheetData.entries.length > 0) {
          // Reconcile entries strictly with active tenant riders list
          const entryMap = new Map<string, CodDailyEntry>();
          sheetData.entries.forEach((e) => {
            if (e.riderId) entryMap.set(e.riderId, e);
            const cleanPhone = (e.riderPhone || '').replace(/\D/g, '').slice(-10);
            if (cleanPhone) entryMap.set(cleanPhone, e);
          });

          // The riders displayed in this COD sheet MUST be 100% IDENTICAL to the riders list in the Main App's "Riders" tab
          const merged: CodDailyEntry[] = activeTenantRiders.map((r) => {
            const cleanPhone = (r.phone || '').replace(/\D/g, '').slice(-10);
            const ex = entryMap.get(r.id) || (cleanPhone ? entryMap.get(cleanPhone) : undefined);
            if (ex) {
              const totalCod = (Number(ex.company1Amount) || 0) + (Number(ex.company2Amount) || 0);
              const totalDeposit = (Number(ex.cashDeposit) || 0) + (Number(ex.onlineDeposit) || 0);
              const balance = totalCod - totalDeposit;
              return {
                ...ex,
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

          // STRICT PRIVACY PROTECTION: Any entry not in activeTenantRiders is completely excluded!
          setGridEntries(merged);
        }
      },
      (err) => {
        console.warn('Real-time sheet subscription notice in admin app:', err);
      },
      userId
    );

    return () => {
      mounted = false;
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [selectedDate, userId, activeTenantRiders]);

  // Fail-Safe Midnight / Historical Date Check
  const todayDateStr = getTodayDateString();
  const isHistoricalDate = selectedDate < todayDateStr;

  // Check if today is manually day-locked by Hub Incharge
  const isDayLocked = useMemo(() => {
    return gridEntries.length > 0 && gridEntries.every((e) => e.status === 'locked');
  }, [gridEntries]);

  // Master / Owner privilege check
  const isOwnerOrMasterAdmin = useMemo(() => {
    return activeUser.role === 'hub_incharge' || activeUser.role === 'owner' || isSuperAdmin;
  }, [activeUser.role, isSuperAdmin]);

  // Effective Lock state against editing
  const isGridLocked = useMemo(() => {
    if (isHistoricalDate && !ownerTemporaryUnlock) return true;
    if (isDayLocked && !isOwnerOrMasterAdmin) return true;
    return false;
  }, [isHistoricalDate, ownerTemporaryUnlock, isDayLocked, isOwnerOrMasterAdmin]);

  // View-First: Start editing a specific row
  const handleStartEditRow = (row: CodDailyEntry) => {
    // Permission checks
    const isSelfRider = activeUser.role === 'rider' && activeUser.riderId === row.riderId;
    if (!isOwnerOrMasterAdmin && !isSelfRider) {
      showToast('You can only edit your own assigned row.', 'error');
      return;
    }

    if (isGridLocked && !isOwnerOrMasterAdmin) {
      showToast(isHistoricalDate ? 'Past dates are locked in read-only mode.' : 'Day-End Lock is active.', 'error');
      return;
    }

    setEditingRiderId(row.riderId);
    setEditRowForm({
      company1Amount: row.company1Amount,
      company2Amount: row.company2Amount,
      cashDeposit: row.cashDeposit,
      onlineDeposit: row.onlineDeposit,
      notes: row.notes || '',
    });
  };

  // View-First: Save edits for currently editing row
  const handleSaveRowEdit = async (riderId: string) => {
    if (!editRowForm) return;

    const targetRow = gridEntries.find((r) => r.riderId === riderId);
    if (!targetRow) return;

    const numC1 = Math.max(0, editRowForm.company1Amount || 0);
    const numC2 = Math.max(0, editRowForm.company2Amount || 0);
    const numCash = Math.max(0, editRowForm.cashDeposit || 0);
    const numOnline = Math.max(0, editRowForm.onlineDeposit || 0);

    const totalCod = numC1 + numC2;
    const totalDeposit = numCash + numOnline;
    const balance = totalCod - totalDeposit;

    // Check if any value changed for audit log tracking
    const changes: string[] = [];
    if (targetRow.company1Amount !== numC1) changes.push(`${settings.company1Name}: ${targetRow.company1Amount}➔${numC1}`);
    if (targetRow.company2Amount !== numC2) changes.push(`${settings.company2Name}: ${targetRow.company2Amount}➔${numC2}`);
    if (targetRow.cashDeposit !== numCash) changes.push(`Cash: ${targetRow.cashDeposit}➔${numCash}`);
    if (targetRow.onlineDeposit !== numOnline) changes.push(`Online: ${targetRow.onlineDeposit}➔${numOnline}`);

    const updatedEntries = gridEntries.map((row) => {
      if (row.riderId !== riderId) return row;
      return {
        ...row,
        company1Amount: numC1,
        company2Amount: numC2,
        totalCod,
        cashDeposit: numCash,
        onlineDeposit: numOnline,
        totalDeposit,
        balance,
        notes: editRowForm.notes,
        updatedAt: new Date().toISOString(),
        updatedBy: activeUser.name,
      };
    });

    setGridEntries(updatedEntries);
    setEditingRiderId(null);
    setEditRowForm(null);

    await saveCodDailyEntries(userId, selectedDate, updatedEntries);

    // Audit event logging if values were altered
    if (changes.length > 0 && (targetRow.status === 'submitted' || targetRow.status === 'verified')) {
      recordCodAuditLog(userId, {
        changedBy: activeUser.name,
        role: activeUser.role,
        riderId: targetRow.riderId,
        riderName: targetRow.riderName,
        date: targetRow.date,
        field: 'Amount Edits',
        previousValue: `Total COD: ${targetRow.totalCod}`,
        newValue: `Total COD: ${totalCod}`,
        notes: changes.join(', '),
      }).then(() => {
        loadCodAuditLogs(userId).then(setAuditLogs);
      });
    }

    showToast(`✅ Saved changes for ${targetRow.riderName}!`, 'success');
  };

  // Helper: check granular verification permission for a column field
  const checkFieldVerificationPermission = (field: 'company1' | 'company2' | 'cash' | 'online'): boolean => {
    if (isOwnerOrMasterAdmin) return true;
    const currentStaff = staffUsers.find((s) => s.id === activeUser.id);
    if (field === 'company1' || field === 'company2') return Boolean(currentStaff?.canVerifyCod);
    if (field === 'cash') return Boolean(currentStaff?.canVerifyCash);
    if (field === 'online') return Boolean(currentStaff?.canVerifyOnline);
    return false;
  };

  // 2. Amount Verification Checkmark Toggle with Granular Permissions
  const handleToggleVerifyAmount = async (
    riderId: string, 
    field: 'company1' | 'company2' | 'cash' | 'online'
  ) => {
    const hasPerm = checkFieldVerificationPermission(field);
    const fieldLabel = field === 'company1' ? settings.company1Name : field === 'company2' ? settings.company2Name : field === 'cash' ? 'Cash' : 'Online';

    if (!hasPerm) {
      showToast(`⚠️ Permission Denied: You do not have permission to verify ${fieldLabel}. Contact Hub Incharge.`, 'error');
      return;
    }

    if (isHistoricalDate && !ownerTemporaryUnlock && !isOwnerOrMasterAdmin) {
      showToast('Past dates are locked in read-only mode.', 'error');
      return;
    }

    const targetRow = gridEntries.find((r) => r.riderId === riderId);
    if (!targetRow) return;

    const verifiedProp = `${field}Verified` as keyof CodDailyEntry;
    const verifiedByProp = `${field}VerifiedBy` as keyof CodDailyEntry;
    const verifiedAtProp = `${field}VerifiedAt` as keyof CodDailyEntry;

    const currentVal = Boolean(targetRow[verifiedProp]);
    const nextVal = !currentVal;

    const updatedEntries = gridEntries.map((row) => {
      if (row.riderId !== riderId) return row;
      return {
        ...row,
        [verifiedProp]: nextVal,
        [verifiedByProp]: nextVal ? activeUser.name : undefined,
        [verifiedAtProp]: nextVal ? new Date().toISOString() : undefined,
        updatedAt: new Date().toISOString(),
        updatedBy: activeUser.name,
      };
    });

    setGridEntries(updatedEntries);
    await saveCodDailyEntries(userId, selectedDate, updatedEntries);

    // Record verification event in Audit Log
    recordCodAuditLog(userId, {
      changedBy: activeUser.name,
      role: activeUser.role,
      riderId: targetRow.riderId,
      riderName: targetRow.riderName,
      date: targetRow.date,
      field: `${field}Verification`,
      previousValue: currentVal ? 'Verified ✓' : 'Unverified',
      newValue: nextVal ? 'Verified ✓' : 'Unverified',
      notes: `${field.toUpperCase()} marked as ${nextVal ? 'VERIFIED' : 'UNVERIFIED'} by ${activeUser.name}`,
    }).then(() => {
      loadCodAuditLogs(userId).then(setAuditLogs);
    });

    showToast(
      nextVal
        ? `✅ Verified ${field.toUpperCase()} for ${targetRow.riderName}`
        : `Unchecked ${field.toUpperCase()} verification for ${targetRow.riderName}`,
      'success'
    );
  };

  // 3. Open Shortage Modal for Per-Field Discrepancy Marking
  const handleOpenShortageModal = (
    row: CodDailyEntry, 
    field: 'company1' | 'company2' | 'cash' | 'online'
  ) => {
    const fieldLabel = field === 'company1' ? settings.company1Name : field === 'company2' ? settings.company2Name : field === 'cash' ? 'Cash Deposit' : 'Online Deposit';

    if (!checkFieldVerificationPermission(field)) {
      showToast(`⚠️ Permission Denied: You do not have permission to flag shortage on ${fieldLabel}. Contact Hub Incharge.`, 'error');
      return;
    }

    if (isHistoricalDate && !ownerTemporaryUnlock && !isOwnerOrMasterAdmin) {
      showToast('Past dates are locked in read-only mode.', 'error');
      return;
    }

    const reportedProp = (field === 'company1' ? 'company1Amount' : field === 'company2' ? 'company2Amount' : field === 'cash' ? 'cashDeposit' : 'onlineDeposit') as keyof CodDailyEntry;
    const reportedAmount = Number(row[reportedProp]) || 0;

    const actualProp = `${field}ActualReceived` as keyof CodDailyEntry;
    const shortageProp = `${field}Shortage` as keyof CodDailyEntry;
    const notesProp = `${field}ShortageNotes` as keyof CodDailyEntry;

    const existingShortage = Number(row[shortageProp]) || 0;
    const existingActual = row[actualProp] !== undefined ? Number(row[actualProp]) : (existingShortage > 0 ? Math.max(0, reportedAmount - existingShortage) : reportedAmount);
    const existingNotes = (row[notesProp] as string) || '';

    setShortageModal({
      isOpen: true,
      riderId: row.riderId,
      riderName: row.riderName,
      field,
      fieldLabel,
      reportedAmount,
      actualReceived: existingActual,
      shortageAmount: existingShortage,
      notes: existingNotes,
    });
  };

  // Save Shortage Amount & Actual Received for Field
  const handleSaveShortage = async () => {
    if (!shortageModal) return;
    const { riderId, field, fieldLabel, reportedAmount, actualReceived, notes } = shortageModal;

    const targetRow = gridEntries.find((r) => r.riderId === riderId);
    if (!targetRow) return;

    const safeActual = Math.max(0, actualReceived || 0);
    const safeShortage = Math.max(0, reportedAmount - safeActual);

    const shortageProp = `${field}Shortage` as keyof CodDailyEntry;
    const actualProp = `${field}ActualReceived` as keyof CodDailyEntry;
    const notesProp = `${field}ShortageNotes` as keyof CodDailyEntry;
    const flaggedByProp = `${field}ShortageFlaggedBy` as keyof CodDailyEntry;
    const flaggedAtProp = `${field}ShortageFlaggedAt` as keyof CodDailyEntry;

    const previousShortage = Number(targetRow[shortageProp]) || 0;

    const updatedEntries = gridEntries.map((row) => {
      if (row.riderId !== riderId) return row;
      return {
        ...row,
        [shortageProp]: safeShortage,
        [actualProp]: safeActual,
        [notesProp]: notes.trim() || undefined,
        [flaggedByProp]: safeShortage > 0 ? activeUser.name : undefined,
        [flaggedAtProp]: safeShortage > 0 ? new Date().toISOString() : undefined,
        updatedAt: new Date().toISOString(),
        updatedBy: activeUser.name,
      };
    });

    setGridEntries(updatedEntries);
    await saveCodDailyEntries(userId, selectedDate, updatedEntries);

    // Audit Log
    recordCodAuditLog(userId, {
      changedBy: activeUser.name,
      role: activeUser.role,
      riderId: targetRow.riderId,
      riderName: targetRow.riderName,
      date: targetRow.date,
      field: `${field.toUpperCase()} Shortage Flagged`,
      previousValue: previousShortage > 0 ? `Short: ₹${previousShortage}` : 'No Shortage',
      newValue: safeShortage > 0 ? `Short: ₹${safeShortage} (Actual Recv: ₹${safeActual})` : 'Cleared / No Shortage',
      notes: notes.trim() || `Shortage flagged on ${fieldLabel}`,
    }).then(() => {
      loadCodAuditLogs(userId).then(setAuditLogs);
    });

    setShortageModal(null);
    showToast(
      safeShortage > 0
        ? `⚠️ Flagged ₹${safeShortage} shortage in ${fieldLabel} for ${targetRow.riderName}`
        : `✅ Full ₹${reportedAmount} received confirmed for ${targetRow.riderName}`,
      safeShortage > 0 ? 'info' : 'success'
    );
  };

  // Clear Shortage for Field
  const handleClearShortage = async (riderId: string, field: 'company1' | 'company2' | 'cash' | 'online') => {
    const targetRow = gridEntries.find((r) => r.riderId === riderId);
    if (!targetRow) return;

    const fieldLabel = field === 'company1' ? settings.company1Name : field === 'company2' ? settings.company2Name : field === 'cash' ? 'Cash Deposit' : 'Online Deposit';

    if (!checkFieldVerificationPermission(field)) {
      showToast(`⚠️ Permission Denied: You cannot clear shortage for ${fieldLabel}.`, 'error');
      return;
    }

    const shortageProp = `${field}Shortage` as keyof CodDailyEntry;
    const actualProp = `${field}ActualReceived` as keyof CodDailyEntry;
    const notesProp = `${field}ShortageNotes` as keyof CodDailyEntry;
    const flaggedByProp = `${field}ShortageFlaggedBy` as keyof CodDailyEntry;
    const flaggedAtProp = `${field}ShortageFlaggedAt` as keyof CodDailyEntry;

    const previousShortage = Number(targetRow[shortageProp]) || 0;

    const updatedEntries = gridEntries.map((row) => {
      if (row.riderId !== riderId) return row;
      return {
        ...row,
        [shortageProp]: 0,
        [actualProp]: undefined,
        [notesProp]: undefined,
        [flaggedByProp]: undefined,
        [flaggedAtProp]: undefined,
        updatedAt: new Date().toISOString(),
        updatedBy: activeUser.name,
      };
    });

    setGridEntries(updatedEntries);
    await saveCodDailyEntries(userId, selectedDate, updatedEntries);

    // Audit Log
    recordCodAuditLog(userId, {
      changedBy: activeUser.name,
      role: activeUser.role,
      riderId: targetRow.riderId,
      riderName: targetRow.riderName,
      date: targetRow.date,
      field: `${field.toUpperCase()} Shortage Cleared`,
      previousValue: `Short: ₹${previousShortage}`,
      newValue: 'Shortage Cleared (₹0)',
      notes: `Shortage resolved/cleared by ${activeUser.name}`,
    }).then(() => {
      loadCodAuditLogs(userId).then(setAuditLogs);
    });

    if (shortageModal) setShortageModal(null);
    showToast(`✅ Shortage cleared for ${fieldLabel}!`, 'success');
  };

  // Submit Rider Row
  const handleSubmitRow = async (riderId: string) => {
    const updated = gridEntries.map((row) => {
      if (row.riderId !== riderId) return row;
      return {
        ...row,
        status: 'submitted' as const,
        submittedAt: new Date().toISOString(),
        submittedBy: activeUser.name,
      };
    });
    setGridEntries(updated);
    await saveCodDailyEntries(userId, selectedDate, updated);
    showToast(`COD submitted for rider row!`, 'success');
  };

  // Day-End Lock (Hub Incharge only)
  const handleToggleDayLock = async () => {
    if (!isOwnerOrMasterAdmin) {
      showToast('Only the Hub Incharge / Owner can lock or unlock the day.', 'error');
      return;
    }

    const nextStatus = isDayLocked ? ('verified' as const) : ('locked' as const);
    const updated = gridEntries.map((row) => ({
      ...row,
      status: nextStatus,
      lockedAt: nextStatus === 'locked' ? new Date().toISOString() : undefined,
    }));

    setGridEntries(updated);
    await saveCodDailyEntries(userId, selectedDate, updated);
    showToast(
      nextStatus === 'locked'
        ? `🔒 Day ${formatDateDisplay(selectedDate)} successfully locked!`
        : `🔓 Day ${formatDateDisplay(selectedDate)} unlocked for edits.`,
      'info'
    );
  };

  // Switch Persona by 4-digit PIN verification
  const handlePinLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setPinError('');

    const cleanPin = inputPin.trim();
    if (cleanPin.length !== 4) {
      setPinError('Please enter a valid 4-digit numeric PIN.');
      return;
    }

    // Owner master bypass (Owner PIN: 9999 or any match for Super Admin)
    if (cleanPin === '9999' || isSuperAdmin) {
      setActiveUser({
        id: 'owner',
        name: 'Hub Incharge (Master Admin)',
        role: 'hub_incharge',
      });
      setIsPinModalOpen(false);
      setInputPin('');
      showToast('Logged in as Hub Incharge (Master Admin)', 'success');
      return;
    }

    const found = staffUsers.find((s) => s.pin === cleanPin && s.isActive);
    if (found) {
      setActiveUser({
        id: found.id,
        name: found.name,
        role: found.role,
        riderId: found.riderId,
      });
      setIsPinModalOpen(false);
      setInputPin('');
      showToast(`Welcome ${found.name}! Active role: ${found.role.replace('_', ' ').toUpperCase()}`, 'success');
    } else {
      setPinError('Invalid 4-digit PIN. Please contact Hub Incharge.');
    }
  };

  // 4. Handle Add Staff Member Form Submission
  const handleAddStaffSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setNewStaffError('');

    if (!newStaffName.trim()) {
      setNewStaffError('Please enter the full name.');
      return;
    }

    const cleanPhone = cleanPhoneNumber(newStaffPhone);
    if (!isValidIndianPhone(cleanPhone)) {
      setNewStaffError('Please enter a valid 10-digit Indian mobile number (e.g. 9876543210)');
      return;
    }

    if (newStaffPin.trim().length !== 4 || !/^\d{4}$/.test(newStaffPin.trim())) {
      setNewStaffError('Please enter a 4-digit numeric PIN.');
      return;
    }

    const createdStaff = createNewStaffUser({
      name: newStaffName,
      phone: cleanPhone,
      role: newStaffRole,
      pin: newStaffPin.trim(),
      canVerifyCod: newStaffCanVerifyCod,
      canVerifyCash: newStaffCanVerifyCash,
      canVerifyOnline: newStaffCanVerifyOnline,
    });

    const updatedList = [createdStaff, ...staffUsers];
    setStaffUsers(updatedList);
    await saveCodStaffUsers(userId, updatedList);

    // Reset Form
    setNewStaffName('');
    setNewStaffPhone('');
    setNewStaffPin('');
    setIsAddStaffModalOpen(false);
    showToast(`✅ Added ${createdStaff.name} as ${createdStaff.role.replace('_', ' ').toUpperCase()}!`, 'success');
  };

  // Save Staff Permissions List
  const handleSaveStaffAccess = async () => {
    setIsSaving(true);
    try {
      await saveCodStaffUsers(userId, staffUsers);
      showToast('Staff & Rider PIN access permissions saved!', 'success');
    } catch (err) {
      showToast('Failed to save staff permissions.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // Save Company Configurations
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    const updated: CodSettings = {
      ...settings,
      company1Name: tempCompany1.trim() || 'Valmo COD',
      company2Name: tempCompany2.trim() || 'Xpressbees COD',
      defaultLockTime: tempLockTime.trim() || '23:00',
    };
    setSettings(updated);
    await saveCodSettings(userId, updated);
    showToast('COD Settings & Company names updated successfully!', 'success');
  };

  // Toggle Feature Flag (Super Admin / Owner)
  const handleToggleFeatureFlag = async () => {
    const nextState = !settings.isEnabled;
    const updated: CodSettings = {
      ...settings,
      isEnabled: nextState,
    };
    setSettings(updated);
    await saveCodSettings(userId, updated);
    showToast(
      nextState
        ? '✅ COD Module enabled for all workspace riders & staff!'
        : '⏸️ COD Module restricted to Super Admin only.',
      'info'
    );
  };

  // Filtered rows for Excel Grid
  const filteredRows = useMemo(() => {
    return gridEntries.filter((row) => {
      const matchesSearch =
        row.riderName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (row.riderPhone || '').includes(searchQuery);

      if (!matchesSearch) return false;

      if (statusFilter === 'due') return row.balance > 0;
      if (statusFilter === 'balanced') return row.balance === 0 && row.totalCod > 0;
      if (statusFilter === 'submitted') return row.status === 'submitted';
      if (statusFilter === 'verified') return row.status === 'verified' || row.status === 'locked';

      return true;
    });
  }, [gridEntries, searchQuery, statusFilter]);

  // Aggregate Totals for Grid Footer
  const gridTotals = useMemo(() => {
    const c1 = filteredRows.reduce((sum, r) => sum + (Number(r.company1Amount) || 0), 0);
    const c2 = filteredRows.reduce((sum, r) => sum + (Number(r.company2Amount) || 0), 0);
    const totalCod = filteredRows.reduce((sum, r) => sum + (Number(r.totalCod) || 0), 0);
    const cash = filteredRows.reduce((sum, r) => sum + (Number(r.cashDeposit) || 0), 0);
    const online = filteredRows.reduce((sum, r) => sum + (Number(r.onlineDeposit) || 0), 0);
    const totalDeposit = filteredRows.reduce((sum, r) => sum + (Number(r.totalDeposit) || 0), 0);
    const balance = filteredRows.reduce((sum, r) => sum + (Number(r.balance) || 0), 0);
    const shortage = filteredRows.reduce(
      (sum, r) =>
        sum +
        ((Number(r.company1Shortage) || 0) +
          (Number(r.company2Shortage) || 0) +
          (Number(r.cashShortage) || 0) +
          (Number(r.onlineShortage) || 0)),
      0
    );

    return { c1, c2, totalCod, cash, online, totalDeposit, balance, shortage };
  }, [filteredRows]);

  // Selected Date Shortage Breakdown & Grand Total Outstanding Calculation
  const dateShortageSummary = useMemo(() => {
    const ridersWithShortage: Array<{
      row: CodDailyEntry;
      items: Array<{
        field: 'company1' | 'company2' | 'cash' | 'online';
        fieldLabel: string;
        reported: number;
        received: number;
        shortage: number;
        notes?: string;
        flaggedBy?: string;
        flaggedAt?: string;
      }>;
      totalShort: number;
    }> = [];

    let grandTotalShortage = 0;

    gridEntries.forEach((row) => {
      const items: Array<{
        field: 'company1' | 'company2' | 'cash' | 'online';
        fieldLabel: string;
        reported: number;
        received: number;
        shortage: number;
        notes?: string;
        flaggedBy?: string;
        flaggedAt?: string;
      }> = [];

      if (row.company1Shortage && row.company1Shortage > 0) {
        items.push({
          field: 'company1',
          fieldLabel: settings.company1Name,
          reported: row.company1Amount,
          received: row.company1ActualReceived ?? Math.max(0, row.company1Amount - row.company1Shortage),
          shortage: row.company1Shortage,
          notes: row.company1ShortageNotes,
          flaggedBy: row.company1ShortageFlaggedBy,
          flaggedAt: row.company1ShortageFlaggedAt,
        });
      }

      if (row.company2Shortage && row.company2Shortage > 0) {
        items.push({
          field: 'company2',
          fieldLabel: settings.company2Name,
          reported: row.company2Amount,
          received: row.company2ActualReceived ?? Math.max(0, row.company2Amount - row.company2Shortage),
          shortage: row.company2Shortage,
          notes: row.company2ShortageNotes,
          flaggedBy: row.company2ShortageFlaggedBy,
          flaggedAt: row.company2ShortageFlaggedAt,
        });
      }

      if (row.cashShortage && row.cashShortage > 0) {
        items.push({
          field: 'cash',
          fieldLabel: 'Cash Deposit',
          reported: row.cashDeposit,
          received: row.cashActualReceived ?? Math.max(0, row.cashDeposit - row.cashShortage),
          shortage: row.cashShortage,
          notes: row.cashShortageNotes,
          flaggedBy: row.cashShortageFlaggedBy,
          flaggedAt: row.cashShortageFlaggedAt,
        });
      }

      if (row.onlineShortage && row.onlineShortage > 0) {
        items.push({
          field: 'online',
          fieldLabel: 'Online Deposit',
          reported: row.onlineDeposit,
          received: row.onlineActualReceived ?? Math.max(0, row.onlineDeposit - row.onlineShortage),
          shortage: row.onlineShortage,
          notes: row.onlineShortageNotes,
          flaggedBy: row.onlineShortageFlaggedBy,
          flaggedAt: row.onlineShortageFlaggedAt,
        });
      }

      if (items.length > 0) {
        const totalShort = items.reduce((sum, item) => sum + item.shortage, 0);
        grandTotalShortage += totalShort;
        ridersWithShortage.push({
          row,
          items,
          totalShort,
        });
      }
    });

    return {
      ridersWithShortage,
      grandTotalShortage,
    };
  }, [gridEntries, settings.company1Name, settings.company2Name]);

  // Active Rider Shortage Alert (Rider App Visibility)
  const activeRiderShortage = useMemo(() => {
    if (activeUser.role !== 'rider' || !activeUser.riderId) return null;
    return dateShortageSummary.ridersWithShortage.find(
      (r) => r.row.riderId === activeUser.riderId
    );
  }, [activeUser, dateShortageSummary]);

  return (
    <div 
      id="cod-standalone-subapp-root"
      className="fixed inset-0 z-[100] h-screen w-screen bg-slate-950 text-slate-100 flex flex-col font-sans overflow-hidden select-none sm:select-auto"
    >
      {/* 1. DEDICATED TOP APP BAR FOR COD SUB-APP */}
      <header className="bg-gradient-to-r from-emerald-950 via-slate-900 to-sky-950 px-3 py-2.5 sm:px-5 sm:py-3 border-b border-emerald-500/30 flex items-center justify-between gap-3 shrink-0 shadow-lg shadow-emerald-950/40 z-30">
        <div className="flex items-center gap-3">
          {/* Prominent Exit Button to Admin Dashboard */}
          <button
            type="button"
            id="exit-to-main-app-btn"
            onClick={onExit}
            className="inline-flex items-center gap-2 px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-xl bg-slate-800/90 hover:bg-slate-750 text-emerald-300 hover:text-white border border-emerald-500/30 text-xs sm:text-sm font-bold shadow-md transition active:scale-95 cursor-pointer"
            title="वापस एडमिन डैशबोर्ड (Back to Admin)"
          >
            <ArrowLeft className="w-4 h-4 text-emerald-400" />
            <span>← वापस एडमिन डैशबोर्ड (Back to Admin)</span>
          </button>

          <div className="h-6 w-px bg-slate-700 hidden sm:block" />

          {/* Title & Live Date & Role */}
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-sm sm:text-base font-black text-white tracking-tight flex items-center gap-1.5">
                <span>COD हिसाब-किताब Portal</span>
              </h1>
              <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                Standalone Sub-App
              </span>
              {isDayLocked && (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30">
                  <Lock className="w-3 h-3" /> Day Locked
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-0.5">
              <span className="text-emerald-300/90 font-medium">
                {new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
              </span>
              <span>•</span>
              <span className="truncate max-w-[140px] sm:max-w-none">{hubName}</span>
            </div>
          </div>
        </div>

        {/* Top App Bar Right: Active Persona Switcher & Controls */}
        <div className="flex items-center gap-2">
          {/* Launch / Switch to Companion App (Delivery Boys & Staff) */}
          <button
            type="button"
            id="open-companion-app-top-btn"
            onClick={() => {
              const companionUrl = getRiderAppUrl();
              if (navigator.clipboard) {
                navigator.clipboard.writeText(companionUrl);
                showToast('📋 राइडर ऐप लिंक कॉपी हो गया! डिलीवरी बॉय को WhatsApp पर भेजें।', 'success');
              }
              window.location.hash = '/cod-entry';
            }}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold shadow-md transition active:scale-95 cursor-pointer"
            title="डिलीवरी बॉय & स्टाफ मोबाइल ऐप खोलें / लिंक कॉपी करें"
          >
            <Bike className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">📱 राइडर ऐप (Companion)</span>
            <span className="sm:hidden">📱 साथी ऐप</span>
          </button>

          {/* Active Persona Pill / Quick PIN Switch */}
          <button
            type="button"
            id="switch-cod-persona-top-btn"
            onClick={() => setIsPinModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-750 text-emerald-300 border border-emerald-500/30 text-xs font-bold transition active:scale-95 cursor-pointer"
            title="Click to authenticate via 4-digit PIN"
          >
            <Key className="w-3.5 h-3.5 text-emerald-400" />
            <span className="hidden md:inline">User: {activeUser.name}</span>
            <span className="text-[10px] uppercase font-mono px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
              {activeUser.role.replace('_', ' ')}
            </span>
          </button>

          {/* Super Admin Feature Flag Toggle */}
          {isSuperAdmin && (
            <button
              type="button"
              id="standalone-toggle-feature-flag-btn"
              onClick={handleToggleFeatureFlag}
              className={`hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-bold border transition active:scale-95 cursor-pointer ${
                settings.isEnabled
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30'
                  : 'bg-amber-500/15 text-amber-300 border-amber-500/30 hover:bg-amber-500/25'
              }`}
              title="Super Admin Flag: Toggle visibility for non-admin users"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>{settings.isEnabled ? 'Public to Staff' : 'Admin Only'}</span>
            </button>
          )}

          {/* Quick Export in Top Bar */}
          <button
            type="button"
            onClick={() => exportCodGridToCSV(selectedDate, gridEntries, settings.company1Name, settings.company2Name, hubName)}
            className="p-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white transition active:scale-95 cursor-pointer"
            title="Export Excel / CSV Sheet"
          >
            <Download className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Toast Alert */}
      {toastMessage && (
        <div className={`px-4 py-2 text-xs font-bold flex items-center justify-between border-b shrink-0 z-40 ${
          toastMessage.type === 'error'
            ? 'bg-rose-950/90 text-rose-200 border-rose-800'
            : toastMessage.type === 'info'
            ? 'bg-sky-950/90 text-sky-200 border-sky-800'
            : 'bg-emerald-950/90 text-emerald-200 border-emerald-800'
        }`}>
          <span>{toastMessage.text}</span>
          <button onClick={() => setToastMessage(null)} className="p-0.5 hover:opacity-80">
            ✕
          </button>
        </div>
      )}

      {/* 2. SUB-APP MAIN VIEWPORT */}
      <main className="flex-1 overflow-y-auto p-3 sm:p-5 space-y-4">
        
        {/* TAB 1: [📊 दैनिक COD शीट] VIEW-FIRST MULTI-COMPANY EXCEL GRID */}
        {activeTab === 'grid' && (
          <div className="space-y-3 max-w-7xl mx-auto">
            
            {/* 3. Fail-Safe Automated Historical Date Lock Banner */}
            {isHistoricalDate && (
              <div className="p-3.5 rounded-2xl bg-amber-950/50 border border-amber-500/50 shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2.5">
                  <Lock className="w-4 h-4 text-amber-400 shrink-0" />
                  <div>
                    <span className="font-bold text-amber-300">
                      📅 Historical Date Safeguard: {formatDateDisplay(selectedDate)} (Read-Only Mode)
                    </span>
                    <p className="text-[11px] text-slate-300 mt-0.5">
                      All past dates are strictly locked against edits for riders and staff. Only the Hub Owner can grant a temporary unlock.
                    </p>
                  </div>
                </div>

                {isOwnerOrMasterAdmin && (
                  <button
                    type="button"
                    onClick={() => {
                      setOwnerTemporaryUnlock(!ownerTemporaryUnlock);
                      showToast(
                        !ownerTemporaryUnlock
                          ? `🔓 Owner Temporary Unlock active for ${formatDateDisplay(selectedDate)}`
                          : `🔒 Historical read-only safeguard re-engaged.`,
                        'info'
                      );
                    }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition shrink-0 cursor-pointer ${
                      ownerTemporaryUnlock
                        ? 'bg-rose-500/20 text-rose-300 border-rose-500/40 hover:bg-rose-500/30'
                        : 'bg-amber-500/20 text-amber-300 border-amber-500/40 hover:bg-amber-500/30'
                    }`}
                  >
                    {ownerTemporaryUnlock ? 'Re-Lock Past Date' : 'Grant Temporary Unlock (Owner)'}
                  </button>
                )}
              </div>
            )}

            {/* 2. Rider App Visibility: Real-Time Shortage Alert Banner for Authenticated Rider */}
            {activeRiderShortage && (
              <div 
                id="rider-shortage-alert-banner"
                className="p-3.5 sm:p-4 rounded-2xl bg-gradient-to-r from-rose-950/90 via-slate-900 to-amber-950/90 border-2 border-rose-500/70 shadow-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in fade-in"
              >
                <div className="flex items-start gap-3">
                  <div className="p-2.5 rounded-xl bg-rose-500/20 text-rose-400 shrink-0 border border-rose-500/40">
                    <AlertTriangle className="w-5 h-5 sm:w-6 sm:h-6" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-black text-rose-200">
                        🚨 ध्यान दें: आपके दैनिक हिसाब में शॉर्टेज दर्ज की गई है! (Shortage Notice)
                      </h3>
                      <span className="text-xs font-black px-2.5 py-0.5 rounded-full bg-rose-500/30 text-rose-300 border border-rose-500/60 font-mono">
                        कुल कमी: -{formatINR(activeRiderShortage.totalShort)}
                      </span>
                    </div>
                    <p className="text-xs text-slate-300 mt-1">
                      हब प्रबंधन द्वारा सत्यापन के दौरान निम्नलिखित राशि कम प्राप्त हुई है। कृपया तुरंत हब काउंटर पर संपर्क करें:
                    </p>
                    <div className="flex items-center gap-2 flex-wrap mt-2">
                      {activeRiderShortage.items.map((item, idx) => (
                        <span key={idx} className="text-[11px] font-bold px-2 py-1 rounded-lg bg-slate-950/90 text-rose-300 border border-rose-500/40 flex items-center gap-1.5 font-mono">
                          <span className="text-slate-400 font-sans">{item.fieldLabel}:</span>
                          <span>-₹{item.shortage}</span>
                          <span className="text-slate-500 text-[10px] font-sans font-normal">
                            (जमा होना था: ₹{item.reported} | मिला: ₹{item.received})
                          </span>
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Date Selector & Search Toolbar */}
            <div className="p-3 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-md flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-300">
                  <Calendar className="w-4 h-4 text-emerald-400" />
                  <span>Reconciliation Date:</span>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setSelectedDate(getDaysAgoDateString(1))}
                    className="p-1 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-300 text-xs font-medium cursor-pointer"
                    title="Yesterday"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                  </button>
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none focus:border-emerald-500 font-medium"
                  />
                  <button
                    type="button"
                    onClick={() => setSelectedDate(getTodayDateString())}
                    className="px-2 py-1 rounded-lg bg-emerald-600/20 text-emerald-300 border border-emerald-500/40 text-[11px] font-bold hover:bg-emerald-600/30 cursor-pointer"
                  >
                    Today
                  </button>
                </div>
              </div>

              {/* Filter and Lock Buttons */}
              <div className="flex items-center gap-2 flex-wrap">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search rider..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-8 pr-3 py-1 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 w-36 sm:w-44"
                  />
                </div>

                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as any)}
                  className="bg-slate-950 border border-slate-700 rounded-xl px-2.5 py-1 text-xs text-slate-300 focus:outline-none focus:border-emerald-500"
                >
                  <option value="all">All ({gridEntries.length})</option>
                  <option value="due">Pending Due</option>
                  <option value="balanced">Balanced (₹0)</option>
                  <option value="submitted">Submitted</option>
                  <option value="verified">Verified</option>
                </select>

                {/* Day-End Lock Toggle (Incharge only) */}
                {isOwnerOrMasterAdmin && (
                  <button
                    type="button"
                    id="standalone-toggle-day-lock-btn"
                    onClick={handleToggleDayLock}
                    className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold transition active:scale-95 cursor-pointer ${
                      isDayLocked
                        ? 'bg-amber-600 hover:bg-amber-500 text-slate-950 font-black shadow-md'
                        : 'bg-rose-600 hover:bg-rose-500 text-white shadow-md'
                    }`}
                    title={isDayLocked ? 'Click to Unlock Day' : 'Lock entire day from edits'}
                  >
                    {isDayLocked ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                    <span>{isDayLocked ? 'Unlock Day' : 'Day-End Lock'}</span>
                  </button>
                )}
              </div>
            </div>

            {/* Responsive View-First Excel Table with Verification Checkmarks */}
            <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900/95 shadow-2xl scrollbar-thin">
              <table className="w-full text-left text-xs border-collapse min-w-[1020px]">
                <thead>
                  <tr className="bg-slate-850 text-slate-200 border-b border-slate-750 text-[11px] font-bold uppercase tracking-wider">
                    <th className="p-3 sticky left-0 z-20 bg-slate-850 shadow-sm min-w-[170px]">
                      Rider Name
                    </th>
                    <th className="p-3 min-w-[145px] text-sky-300">
                      {settings.company1Name} (₹)
                    </th>
                    <th className="p-3 min-w-[145px] text-amber-300">
                      {settings.company2Name} (₹)
                    </th>
                    <th className="p-3 min-w-[115px] bg-slate-800/60 text-emerald-300">
                      Total COD (₹)
                    </th>
                    <th className="p-3 min-w-[135px] text-emerald-400">
                      Cash Deposit (₹)
                    </th>
                    <th className="p-3 min-w-[135px] text-purple-400">
                      Online Deposit (₹)
                    </th>
                    <th className="p-3 min-w-[115px] bg-slate-800/60 text-indigo-300">
                      Total Deposit (₹)
                    </th>
                    <th className="p-3 min-w-[130px] text-center">
                      Difference / Balance
                    </th>
                    <th className="p-3 min-w-[85px] text-slate-400">
                      Status
                    </th>
                    <th className="p-3 min-w-[125px] text-right">
                      Action
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-800/80">
                  {filteredRows.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="p-10 text-center text-slate-400">
                        No rider COD records found for this date.
                      </td>
                    </tr>
                  ) : (
                    filteredRows.map((row) => {
                      const isSelfRider = activeUser.role === 'rider' && activeUser.riderId === row.riderId;
                      const isEditingThisRow = editingRiderId === row.riderId;
                      
                      // Row Edit Permissions:
                      // Riders can only edit their own row on today's date if Day-End lock is not active.
                      // Hub Owner can edit any date if temporary unlock is granted or day is not locked.
                      const canEditThisRow = !isGridLocked && (
                        isOwnerOrMasterAdmin ||
                        (isSelfRider && !isHistoricalDate)
                      );

                      // Display values when editing vs viewing
                      const displayC1 = isEditingThisRow && editRowForm ? editRowForm.company1Amount : row.company1Amount;
                      const displayC2 = isEditingThisRow && editRowForm ? editRowForm.company2Amount : row.company2Amount;
                      const displayCash = isEditingThisRow && editRowForm ? editRowForm.cashDeposit : row.cashDeposit;
                      const displayOnline = isEditingThisRow && editRowForm ? editRowForm.onlineDeposit : row.onlineDeposit;
                      const computedTotalCod = displayC1 + displayC2;
                      const computedTotalDeposit = displayCash + displayOnline;
                      const computedBalance = computedTotalCod - computedTotalDeposit;

                      return (
                        <tr
                          key={row.riderId}
                          className={`transition ${
                            isEditingThisRow
                              ? 'bg-slate-850/90 ring-1 ring-emerald-500/50'
                              : isSelfRider
                              ? 'bg-emerald-950/25'
                              : 'hover:bg-slate-800/40'
                          }`}
                        >
                          {/* 1. Rider Name */}
                          <td className="p-3 sticky left-0 z-10 bg-slate-900 shadow-sm">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-lg bg-blue-600/20 text-blue-400 border border-blue-500/30 flex items-center justify-center font-bold text-xs shrink-0">
                                {row.riderName.charAt(0).toUpperCase()}
                              </div>
                              <div className="min-w-0">
                                <div className="font-bold text-white truncate text-xs flex items-center gap-1.5">
                                  <span>{row.riderName}</span>
                                  {isSelfRider && (
                                    <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 font-extrabold">
                                      YOU
                                    </span>
                                  )}
                                </div>
                                <span className="text-[10px] text-slate-400 font-mono">
                                  {row.riderPhone || 'No Phone'}
                                </span>
                              </div>
                            </div>
                          </td>

                          {/* 2. Company 1 COD (Clean Text or Input when editing, with Checkmark & Shortage Flag) */}
                          <td className={`p-2.5 transition ${row.company1Shortage && row.company1Shortage > 0 ? 'bg-rose-950/30 ring-1 ring-rose-500/40' : ''}`}>
                            {isEditingThisRow ? (
                              <div>
                                <input
                                  type="number"
                                  min="0"
                                  step="any"
                                  value={editRowForm?.company1Amount || ''}
                                  onChange={(e) =>
                                    setEditRowForm((prev) => prev && { ...prev, company1Amount: Math.max(0, parseFloat(e.target.value) || 0) })
                                  }
                                  placeholder="0"
                                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-sky-200 font-mono font-bold focus:outline-none focus:border-sky-500"
                                />
                                {row.company1Shortage && row.company1Shortage > 0 && (
                                  <span className="text-[9px] text-rose-400 font-mono mt-0.5 block">
                                    ⚠️ Short: ₹{row.company1Shortage}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <div className="flex items-center justify-between gap-1.5">
                                <div className="flex flex-col min-w-0">
                                  <span className="font-mono font-bold text-sky-200 text-xs">
                                    {formatINR(row.company1Amount)}
                                  </span>
                                  {row.company1Shortage && row.company1Shortage > 0 && (
                                    <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                                      <span className="inline-flex items-center gap-0.5 text-[9px] font-black text-rose-300 bg-rose-500/25 px-1 py-0.2 rounded border border-rose-500/40">
                                        <AlertTriangle className="w-2.5 h-2.5 text-rose-400 shrink-0" />
                                        <span>Short: ₹{row.company1Shortage}</span>
                                      </span>
                                      <span className="text-[9px] text-slate-400 font-mono hidden sm:inline">
                                        (Recv: ₹{row.company1ActualReceived ?? Math.max(0, row.company1Amount - row.company1Shortage)})
                                      </span>
                                    </div>
                                  )}
                                </div>

                                <div className="flex items-center gap-1 shrink-0">
                                  {/* Verification Checkmark */}
                                  <button
                                    type="button"
                                    onClick={() => handleToggleVerifyAmount(row.riderId, 'company1')}
                                    className={`p-1 rounded-lg text-xs font-bold transition active:scale-90 cursor-pointer ${
                                      row.company1Verified
                                        ? 'bg-emerald-500/25 text-emerald-300 border border-emerald-500/50 hover:bg-emerald-500/35'
                                        : 'bg-slate-800 text-slate-500 border border-slate-700 hover:text-emerald-400 hover:border-emerald-500/40'
                                    }`}
                                    title={
                                      row.company1Verified
                                        ? `✓ Verified by ${row.company1VerifiedBy || 'Staff'} on ${row.company1VerifiedAt ? new Date(row.company1VerifiedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}`
                                        : `Click to verify ${settings.company1Name}`
                                    }
                                  >
                                    <Check className="w-3.5 h-3.5" />
                                  </button>

                                  {/* Shortage Flag Button */}
                                  <button
                                    type="button"
                                    onClick={() => handleOpenShortageModal(row, 'company1')}
                                    className={`p-1 rounded-lg text-xs font-bold transition active:scale-90 cursor-pointer ${
                                      row.company1Shortage && row.company1Shortage > 0
                                        ? 'bg-rose-500/25 text-rose-300 border border-rose-500/60 hover:bg-rose-500/35'
                                        : 'bg-slate-800 text-slate-500 border border-slate-700 hover:text-amber-400 hover:border-amber-500/40'
                                    }`}
                                    title={
                                      row.company1Shortage && row.company1Shortage > 0
                                        ? `⚠️ Short: ₹${row.company1Shortage} in ${settings.company1Name} (Received: ₹${row.company1ActualReceived ?? (row.company1Amount - row.company1Shortage)}). Click to update/clear.`
                                        : `Flag Shortage in ${settings.company1Name}`
                                    }
                                  >
                                    <AlertTriangle className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            )}
                          </td>

                          {/* 3. Company 2 COD */}
                          <td className={`p-2.5 transition ${row.company2Shortage && row.company2Shortage > 0 ? 'bg-rose-950/30 ring-1 ring-rose-500/40' : ''}`}>
                            {isEditingThisRow ? (
                              <div>
                                <input
                                  type="number"
                                  min="0"
                                  step="any"
                                  value={editRowForm?.company2Amount || ''}
                                  onChange={(e) =>
                                    setEditRowForm((prev) => prev && { ...prev, company2Amount: Math.max(0, parseFloat(e.target.value) || 0) })
                                  }
                                  placeholder="0"
                                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-amber-200 font-mono font-bold focus:outline-none focus:border-amber-500"
                                />
                                {row.company2Shortage && row.company2Shortage > 0 && (
                                  <span className="text-[9px] text-rose-400 font-mono mt-0.5 block">
                                    ⚠️ Short: ₹{row.company2Shortage}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <div className="flex items-center justify-between gap-1.5">
                                <div className="flex flex-col min-w-0">
                                  <span className="font-mono font-bold text-amber-200 text-xs">
                                    {formatINR(row.company2Amount)}
                                  </span>
                                  {row.company2Shortage && row.company2Shortage > 0 && (
                                    <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                                      <span className="inline-flex items-center gap-0.5 text-[9px] font-black text-rose-300 bg-rose-500/25 px-1 py-0.2 rounded border border-rose-500/40">
                                        <AlertTriangle className="w-2.5 h-2.5 text-rose-400 shrink-0" />
                                        <span>Short: ₹{row.company2Shortage}</span>
                                      </span>
                                      <span className="text-[9px] text-slate-400 font-mono hidden sm:inline">
                                        (Recv: ₹{row.company2ActualReceived ?? Math.max(0, row.company2Amount - row.company2Shortage)})
                                      </span>
                                    </div>
                                  )}
                                </div>

                                <div className="flex items-center gap-1 shrink-0">
                                  {/* Verification Checkmark */}
                                  <button
                                    type="button"
                                    onClick={() => handleToggleVerifyAmount(row.riderId, 'company2')}
                                    className={`p-1 rounded-lg text-xs font-bold transition active:scale-90 cursor-pointer ${
                                      row.company2Verified
                                        ? 'bg-emerald-500/25 text-emerald-300 border border-emerald-500/50 hover:bg-emerald-500/35'
                                        : 'bg-slate-800 text-slate-500 border border-slate-700 hover:text-emerald-400 hover:border-emerald-500/40'
                                    }`}
                                    title={
                                      row.company2Verified
                                        ? `✓ Verified by ${row.company2VerifiedBy || 'Staff'} on ${row.company2VerifiedAt ? new Date(row.company2VerifiedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}`
                                        : `Click to verify ${settings.company2Name}`
                                    }
                                  >
                                    <Check className="w-3.5 h-3.5" />
                                  </button>

                                  {/* Shortage Flag Button */}
                                  <button
                                    type="button"
                                    onClick={() => handleOpenShortageModal(row, 'company2')}
                                    className={`p-1 rounded-lg text-xs font-bold transition active:scale-90 cursor-pointer ${
                                      row.company2Shortage && row.company2Shortage > 0
                                        ? 'bg-rose-500/25 text-rose-300 border border-rose-500/60 hover:bg-rose-500/35'
                                        : 'bg-slate-800 text-slate-500 border border-slate-700 hover:text-amber-400 hover:border-amber-500/40'
                                    }`}
                                    title={
                                      row.company2Shortage && row.company2Shortage > 0
                                        ? `⚠️ Short: ₹${row.company2Shortage} in ${settings.company2Name} (Received: ₹${row.company2ActualReceived ?? (row.company2Amount - row.company2Shortage)}). Click to update/clear.`
                                        : `Flag Shortage in ${settings.company2Name}`
                                    }
                                  >
                                    <AlertTriangle className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            )}
                          </td>

                          {/* 4. Total COD (Auto-calculated) */}
                          <td className="p-3 font-mono font-black text-emerald-300 bg-slate-950/70 text-xs">
                            {formatINR(computedTotalCod)}
                          </td>

                          {/* 5. Cash Deposit */}
                          <td className={`p-2.5 transition ${row.cashShortage && row.cashShortage > 0 ? 'bg-rose-950/30 ring-1 ring-rose-500/40' : ''}`}>
                            {isEditingThisRow ? (
                              <div>
                                <input
                                  type="number"
                                  min="0"
                                  step="any"
                                  value={editRowForm?.cashDeposit || ''}
                                  onChange={(e) =>
                                    setEditRowForm((prev) => prev && { ...prev, cashDeposit: Math.max(0, parseFloat(e.target.value) || 0) })
                                  }
                                  placeholder="0"
                                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-emerald-200 font-mono font-bold focus:outline-none focus:border-emerald-500"
                                />
                                {row.cashShortage && row.cashShortage > 0 && (
                                  <span className="text-[9px] text-rose-400 font-mono mt-0.5 block">
                                    ⚠️ Short: ₹{row.cashShortage}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <div className="flex items-center justify-between gap-1.5">
                                <div className="flex flex-col min-w-0">
                                  <span className="font-mono font-bold text-emerald-200 text-xs">
                                    {formatINR(row.cashDeposit)}
                                  </span>
                                  {row.cashShortage && row.cashShortage > 0 && (
                                    <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                                      <span className="inline-flex items-center gap-0.5 text-[9px] font-black text-rose-300 bg-rose-500/25 px-1 py-0.2 rounded border border-rose-500/40">
                                        <AlertTriangle className="w-2.5 h-2.5 text-rose-400 shrink-0" />
                                        <span>Short: ₹{row.cashShortage}</span>
                                      </span>
                                      <span className="text-[9px] text-slate-400 font-mono hidden sm:inline">
                                        (Recv: ₹{row.cashActualReceived ?? Math.max(0, row.cashDeposit - row.cashShortage)})
                                      </span>
                                    </div>
                                  )}
                                </div>

                                <div className="flex items-center gap-1 shrink-0">
                                  {/* Verification Checkmark */}
                                  <button
                                    type="button"
                                    onClick={() => handleToggleVerifyAmount(row.riderId, 'cash')}
                                    className={`p-1 rounded-lg text-xs font-bold transition active:scale-90 cursor-pointer ${
                                      row.cashVerified
                                        ? 'bg-emerald-500/25 text-emerald-300 border border-emerald-500/50 hover:bg-emerald-500/35'
                                        : 'bg-slate-800 text-slate-500 border border-slate-700 hover:text-emerald-400 hover:border-emerald-500/40'
                                    }`}
                                    title={
                                      row.cashVerified
                                        ? `✓ Verified by ${row.cashVerifiedBy || 'Staff'} on ${row.cashVerifiedAt ? new Date(row.cashVerifiedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}`
                                        : 'Click to verify Cash Deposit'
                                    }
                                  >
                                    <Check className="w-3.5 h-3.5" />
                                  </button>

                                  {/* Shortage Flag Button */}
                                  <button
                                    type="button"
                                    onClick={() => handleOpenShortageModal(row, 'cash')}
                                    className={`p-1 rounded-lg text-xs font-bold transition active:scale-90 cursor-pointer ${
                                      row.cashShortage && row.cashShortage > 0
                                        ? 'bg-rose-500/25 text-rose-300 border border-rose-500/60 hover:bg-rose-500/35'
                                        : 'bg-slate-800 text-slate-500 border border-slate-700 hover:text-amber-400 hover:border-amber-500/40'
                                    }`}
                                    title={
                                      row.cashShortage && row.cashShortage > 0
                                        ? `⚠️ Short: ₹${row.cashShortage} in Cash Deposit (Received: ₹${row.cashActualReceived ?? (row.cashDeposit - row.cashShortage)}). Click to update/clear.`
                                        : 'Flag Shortage in Cash Deposit'
                                    }
                                  >
                                    <AlertTriangle className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            )}
                          </td>

                          {/* 6. Online Deposit */}
                          <td className={`p-2.5 transition ${row.onlineShortage && row.onlineShortage > 0 ? 'bg-rose-950/30 ring-1 ring-rose-500/40' : ''}`}>
                            {isEditingThisRow ? (
                              <div>
                                <input
                                  type="number"
                                  min="0"
                                  step="any"
                                  value={editRowForm?.onlineDeposit || ''}
                                  onChange={(e) =>
                                    setEditRowForm((prev) => prev && { ...prev, onlineDeposit: Math.max(0, parseFloat(e.target.value) || 0) })
                                  }
                                  placeholder="0"
                                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-purple-200 font-mono font-bold focus:outline-none focus:border-purple-500"
                                />
                                {row.onlineShortage && row.onlineShortage > 0 && (
                                  <span className="text-[9px] text-rose-400 font-mono mt-0.5 block">
                                    ⚠️ Short: ₹{row.onlineShortage}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <div className="flex items-center justify-between gap-1.5">
                                <div className="flex flex-col min-w-0">
                                  <span className="font-mono font-bold text-purple-200 text-xs">
                                    {formatINR(row.onlineDeposit)}
                                  </span>
                                  {row.onlineShortage && row.onlineShortage > 0 && (
                                    <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                                      <span className="inline-flex items-center gap-0.5 text-[9px] font-black text-rose-300 bg-rose-500/25 px-1 py-0.2 rounded border border-rose-500/40">
                                        <AlertTriangle className="w-2.5 h-2.5 text-rose-400 shrink-0" />
                                        <span>Short: ₹{row.onlineShortage}</span>
                                      </span>
                                      <span className="text-[9px] text-slate-400 font-mono hidden sm:inline">
                                        (Recv: ₹{row.onlineActualReceived ?? Math.max(0, row.onlineDeposit - row.onlineShortage)})
                                      </span>
                                    </div>
                                  )}
                                </div>

                                <div className="flex items-center gap-1 shrink-0">
                                  {/* Verification Checkmark */}
                                  <button
                                    type="button"
                                    onClick={() => handleToggleVerifyAmount(row.riderId, 'online')}
                                    className={`p-1 rounded-lg text-xs font-bold transition active:scale-90 cursor-pointer ${
                                      row.onlineVerified
                                        ? 'bg-emerald-500/25 text-emerald-300 border border-emerald-500/50 hover:bg-emerald-500/35'
                                        : 'bg-slate-800 text-slate-500 border border-slate-700 hover:text-emerald-400 hover:border-emerald-500/40'
                                    }`}
                                    title={
                                      row.onlineVerified
                                        ? `✓ Verified by ${row.onlineVerifiedBy || 'Staff'} on ${row.onlineVerifiedAt ? new Date(row.onlineVerifiedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}`
                                        : 'Click to verify Online UPI/QR Deposit'
                                    }
                                  >
                                    <Check className="w-3.5 h-3.5" />
                                  </button>

                                  {/* Shortage Flag Button */}
                                  <button
                                    type="button"
                                    onClick={() => handleOpenShortageModal(row, 'online')}
                                    className={`p-1 rounded-lg text-xs font-bold transition active:scale-90 cursor-pointer ${
                                      row.onlineShortage && row.onlineShortage > 0
                                        ? 'bg-rose-500/25 text-rose-300 border border-rose-500/60 hover:bg-rose-500/35'
                                        : 'bg-slate-800 text-slate-500 border border-slate-700 hover:text-amber-400 hover:border-amber-500/40'
                                    }`}
                                    title={
                                      row.onlineShortage && row.onlineShortage > 0
                                        ? `⚠️ Short: ₹${row.onlineShortage} in Online Deposit (Received: ₹${row.onlineActualReceived ?? (row.onlineDeposit - row.onlineShortage)}). Click to update/clear.`
                                        : 'Flag Shortage in Online Deposit'
                                    }
                                  >
                                    <AlertTriangle className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            )}
                          </td>

                          {/* 7. Total Deposit (Auto-calculated) */}
                          <td className="p-3 font-mono font-black text-indigo-300 bg-slate-950/70 text-xs">
                            {formatINR(computedTotalDeposit)}
                          </td>

                          {/* 8. Difference / Balance */}
                          <td className="p-3 text-center">
                            {computedBalance === 0 ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                                ✓ Tally / ₹0
                              </span>
                            ) : computedBalance > 0 ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-black bg-rose-500/20 text-rose-300 border border-rose-500/40">
                                ⚠️ Due: {formatINR(computedBalance)}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/40">
                                🔵 Surplus: {formatINR(Math.abs(computedBalance))}
                              </span>
                            )}
                          </td>

                          {/* 9. Status */}
                          <td className="p-3">
                            <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${
                              row.status === 'locked'
                                ? 'bg-slate-800 text-slate-300 border-slate-700'
                                : row.status === 'verified'
                                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                                : row.status === 'submitted'
                                ? 'bg-blue-500/20 text-blue-300 border-blue-500/40'
                                : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                            }`}>
                              {row.status}
                            </span>
                          </td>

                          {/* 10. Actions (Edit vs Save/Cancel) */}
                          <td className="p-2.5 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {isEditingThisRow ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => handleSaveRowEdit(row.riderId)}
                                    className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold flex items-center gap-1 shadow transition cursor-pointer"
                                    title="Save row changes"
                                  >
                                    <Check className="w-3.5 h-3.5" />
                                    <span>Save</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingRiderId(null);
                                      setEditRowForm(null);
                                    }}
                                    className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition cursor-pointer"
                                    title="Cancel editing"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                </>
                              ) : (
                                <>
                                  {canEditThisRow && (
                                    <button
                                      type="button"
                                      onClick={() => handleStartEditRow(row)}
                                      className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded-lg text-xs font-semibold flex items-center gap-1 border border-slate-700 transition cursor-pointer"
                                      title="Click to edit values"
                                    >
                                      <Edit3 className="w-3.5 h-3.5 text-amber-400" />
                                      <span>Edit</span>
                                    </button>
                                  )}

                                  {isSelfRider && row.status === 'draft' && (
                                    <button
                                      type="button"
                                      onClick={() => handleSubmitRow(row.riderId)}
                                      className="px-2.5 py-1 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg text-[11px] transition shadow cursor-pointer"
                                      title="Submit my daily collection"
                                    >
                                      Submit
                                    </button>
                                  )}
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>

                {/* Summary Totals Footer Row */}
                <tfoot>
                  <tr className="bg-slate-900 border-t-2 border-emerald-500/40 font-black text-xs">
                    <td className="p-3.5 sticky left-0 z-10 bg-slate-900 text-white">
                      TOTAL SUMMARY ({filteredRows.length} Riders)
                    </td>
                    <td className="p-3 text-sky-300 font-mono">
                      {formatINR(gridTotals.c1)}
                    </td>
                    <td className="p-3 text-amber-300 font-mono">
                      {formatINR(gridTotals.c2)}
                    </td>
                    <td className="p-3 text-emerald-300 bg-slate-850 font-mono text-sm">
                      {formatINR(gridTotals.totalCod)}
                    </td>
                    <td className="p-3 text-emerald-400 font-mono">
                      {formatINR(gridTotals.cash)}
                    </td>
                    <td className="p-3 text-purple-400 font-mono">
                      {formatINR(gridTotals.online)}
                    </td>
                    <td className="p-3 text-indigo-300 bg-slate-850 font-mono text-sm">
                      {formatINR(gridTotals.totalDeposit)}
                    </td>
                    <td className="p-3 text-center font-mono">
                      <span className={`px-2.5 py-1 rounded-xl text-xs ${
                        gridTotals.balance === 0
                          ? 'bg-emerald-500/20 text-emerald-300 font-black'
                          : gridTotals.balance > 0
                          ? 'bg-rose-500/20 text-rose-300 font-black'
                          : 'bg-blue-500/20 text-blue-300 font-black'
                      }`}>
                        Net: {formatINR(gridTotals.balance)}
                      </span>
                    </td>
                    <td colSpan={2} className="p-3 text-right text-slate-300 text-[11px]">
                      {gridTotals.shortage > 0 ? (
                        <div className="flex items-center justify-end gap-1.5">
                          <span className="text-slate-400">Total Shortage:</span>
                          <span className="font-mono text-rose-400 font-black text-xs bg-rose-500/20 px-2 py-0.5 rounded border border-rose-500/40">
                            -{formatINR(gridTotals.shortage)}
                          </span>
                        </div>
                      ) : (
                        <span>Auto-Calculated Reconciliation</span>
                      )}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* 3. DAILY SHORTAGE & OUTSTANDING LEDGER SUMMARY PANEL */}
            <div 
              id="daily-shortage-ledger-panel"
              className="mt-4 rounded-2xl bg-slate-900/95 border border-slate-800 p-4 sm:p-5 shadow-2xl space-y-4"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3.5">
                <div className="flex items-center gap-2.5">
                  <div className="p-2.5 rounded-xl bg-rose-500/20 text-rose-400 border border-rose-500/40 shrink-0">
                    <AlertTriangle className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                      <span>Daily Shortage & Outstanding Ledger</span>
                      <span className="text-xs font-medium text-slate-400">(दैनिक शॉर्टेज व वसूली लेज़र)</span>
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Breakdown of short cash, online, and company collections for <strong className="text-amber-300">{formatDateDisplay(selectedDate)}</strong>
                    </p>
                  </div>
                </div>

                {/* Grand Total Shortage / Pending Recovery Badge */}
                <div className="flex items-center gap-2 shrink-0">
                  <div className="px-4 py-2 rounded-xl bg-gradient-to-r from-rose-950 via-slate-900 to-amber-950 border border-rose-500/50 shadow-md">
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
                      कुल दैनिक शॉर्टेज बकाया (Total Pending Recovery)
                    </span>
                    <span className="text-base sm:text-lg font-black text-rose-300 font-mono">
                      {formatINR(dateShortageSummary.grandTotalShortage)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Riders with Shortages Breakdown */}
              {dateShortageSummary.ridersWithShortage.length === 0 ? (
                <div className="p-6 text-center rounded-xl bg-slate-950/60 border border-emerald-500/30 text-xs text-emerald-400 flex items-center justify-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span className="font-bold">
                    इस तारीख के लिए कोई शॉर्टेज नहीं है! सभी कलेक्शन 100% पूर्ण व टैली हैं। (Zero Shortages on {formatDateDisplay(selectedDate)})
                  </span>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs text-slate-400 px-1">
                    <span>
                      Discrepancies found across <strong className="text-rose-400">{dateShortageSummary.ridersWithShortage.length}</strong> rider(s):
                    </span>
                    <span className="text-[11px] text-amber-300">
                      Rider can view specific component short notices directly on their portal.
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {dateShortageSummary.ridersWithShortage.map(({ row, items, totalShort }) => (
                      <div
                        key={row.riderId}
                        className="p-3.5 rounded-xl bg-slate-950 border border-rose-500/40 shadow-md flex flex-col justify-between gap-3 hover:border-rose-500/60 transition"
                      >
                        <div>
                          <div className="flex items-center justify-between gap-2 border-b border-slate-900 pb-2">
                            <div className="flex items-center gap-2.5">
                              <div className="w-7 h-7 rounded-lg bg-rose-500/20 text-rose-300 border border-rose-500/30 flex items-center justify-center font-bold text-xs shrink-0">
                                {row.riderName.charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <h4 className="font-bold text-white text-xs flex items-center gap-1.5">
                                  <span>{row.riderName}</span>
                                  {activeUser.role === 'rider' && activeUser.riderId === row.riderId && (
                                    <span className="text-[9px] px-1.5 py-0.2 rounded bg-rose-500/20 text-rose-300 font-black">
                                      YOU
                                    </span>
                                  )}
                                </h4>
                                <span className="text-[10px] text-slate-400 font-mono">
                                  {row.riderPhone || 'No Phone'}
                                </span>
                              </div>
                            </div>

                            <span className="text-xs font-black text-rose-300 font-mono bg-rose-500/20 px-2 py-0.5 rounded-lg border border-rose-500/40">
                              कुल कमी: -{formatINR(totalShort)}
                            </span>
                          </div>

                          {/* Component breakdown */}
                          <div className="mt-2.5 space-y-1.5">
                            {items.map((item, idx) => (
                              <div
                                key={idx}
                                className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-[11px] flex items-center justify-between gap-2"
                              >
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="font-bold text-amber-300">{item.fieldLabel}:</span>
                                    <span className="text-slate-300 font-mono">
                                      Reported ₹{item.reported} ➔ Recv ₹{item.received}
                                    </span>
                                  </div>
                                  {item.notes && (
                                    <p className="text-[10px] text-slate-400 italic truncate mt-0.5">
                                      विवरण: "{item.notes}"
                                    </p>
                                  )}
                                </div>
                                
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <span className="font-mono font-black text-rose-400 text-xs bg-rose-950/60 px-1.5 py-0.5 rounded border border-rose-500/30">
                                    -₹{item.shortage} Short
                                  </span>
                                  {checkFieldVerificationPermission(item.field) && (
                                    <button
                                      type="button"
                                      onClick={() => handleOpenShortageModal(row, item.field)}
                                      className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition cursor-pointer"
                                      title="Edit or Clear Shortage"
                                    >
                                      <Edit3 className="w-3 h-3 text-amber-400" />
                                    </button>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="text-[10px] text-slate-500 flex items-center justify-between pt-1 border-t border-slate-900">
                          <span>
                            Flagged By: <strong className="text-slate-400">{items[0]?.flaggedBy || 'Staff'}</strong>
                          </span>
                          <span>
                            {items[0]?.flaggedAt ? new Date(items[0].flaggedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: [🔑 स्टाफ & राइडर PIN] ACCESS CONTROL & ADD STAFF MEMBER */}
        {activeTab === 'access_control' && (
          <div className="space-y-4 max-w-4xl mx-auto">
            <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <Key className="w-5 h-5 text-emerald-400" />
                  <span>स्टाफ & राइडर PIN (Role & Security Setup)</span>
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Designate individual 4-digit PINs, verification check permissions, and staff roles.
                </p>
              </div>

              <div className="flex items-center gap-2">
                {/* 4. Add Staff Member Button */}
                <button
                  type="button"
                  id="open-add-staff-modal-btn"
                  onClick={() => {
                    setNewStaffName('');
                    setNewStaffPhone('');
                    setNewStaffRole('supervisor');
                    setNewStaffPin(String(Math.floor(1000 + Math.random() * 9000)));
                    setNewStaffCanVerifyCod(true);
                    setNewStaffCanVerifyCash(true);
                    setNewStaffCanVerifyOnline(true);
                    setNewStaffError('');
                    setIsAddStaffModalOpen(true);
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-md transition active:scale-95 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>+ Add Staff Member</span>
                </button>

                <button
                  type="button"
                  id="standalone-save-staff-access-btn"
                  onClick={handleSaveStaffAccess}
                  disabled={isSaving}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black shadow-md active:scale-95 transition cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  <span>{isSaving ? 'Saving...' : 'Save All PINs'}</span>
                </button>
              </div>
            </div>

            {/* Companion Mobile App Share & Launcher Card */}
            <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-950/70 via-slate-900 to-teal-950/70 border border-emerald-500/40 shadow-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 border border-emerald-500/30">
                  <Bike className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <span>राइडर & स्टाफ साथी ऐप (COD Entry Companion)</span>
                    <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full font-bold">बिना हब कोड के लॉगिन</span>
                  </h3>
                  <p className="text-xs text-slate-300 mt-0.5">
                    डिलीवरी बॉय और स्टाफ सीधे अपने 10-अंकों के मोबाइल नंबर और 4-अंकों के सिक्योरिटी PIN से लॉगिन कर सकते हैं।
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => {
                    const url = getRiderAppUrl();
                    if (navigator.clipboard) {
                      navigator.clipboard.writeText(url);
                      showToast('📋 लिंक कॉपी हो गया! डिलीवरी बॉय को WhatsApp पर भेजें।', 'success');
                    }
                  }}
                  className="flex-1 sm:flex-initial px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition flex items-center justify-center gap-1.5"
                >
                  <span>📋 कॉपी लिंक</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const riderUrl = getRiderAppUrl();
                    try {
                      window.open(riderUrl, '_blank');
                    } catch {
                      window.location.hash = '/cod-entry';
                    }
                  }}
                  className="flex-1 sm:flex-initial px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition flex items-center justify-center gap-1.5 shadow"
                >
                  <Bike className="w-4 h-4" />
                  <span>ऐप खोलें</span>
                </button>
              </div>
            </div>

            {/* Roles Breakdown Info Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5 text-xs">
              <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                <span className="font-bold text-sky-400">🚴 Rider</span>
                <p className="text-[11px] text-slate-400 mt-1">Can edit only their own daily row; read-only for others.</p>
              </div>
              <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                <span className="font-bold text-amber-400">⭐ Team Leader</span>
                <p className="text-[11px] text-slate-400 mt-1">Can review and verify rider submissions.</p>
              </div>
              <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                <span className="font-bold text-purple-400">🛡️ Supervisor</span>
                <p className="text-[11px] text-slate-400 mt-1">Can review team balances & verify collections.</p>
              </div>
              <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                <span className="font-bold text-emerald-400">👑 Hub Incharge</span>
                <p className="text-[11px] text-slate-400 mt-1">Full edit, audit review & day-end lock permissions.</p>
              </div>
            </div>

            {/* Staff & Rider List */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900 divide-y divide-slate-850 overflow-hidden shadow-xl">
              {staffUsers.map((staff, index) => {
                const isRevealed = !!revealedPins[staff.id];

                return (
                  <div
                    key={staff.id}
                    className="p-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3 hover:bg-slate-850/60 transition"
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-6 h-6 rounded bg-slate-800 text-slate-400 text-xs font-mono flex items-center justify-center font-bold">
                        #{index + 1}
                      </span>
                      <div>
                        <div className="font-bold text-white text-xs flex items-center gap-2">
                          <span>{staff.name}</span>
                          <span className="text-[10px] text-slate-400 font-mono">({staff.phone || 'No phone'})</span>
                        </div>
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          <span className={`text-[10px] font-bold uppercase px-2 py-0.2 rounded-full border inline-block ${
                            staff.role === 'hub_incharge'
                              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                              : staff.role === 'supervisor'
                              ? 'bg-purple-500/20 text-purple-300 border-purple-500/40'
                              : staff.role === 'team_leader'
                              ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                              : 'bg-sky-500/20 text-sky-300 border-sky-500/40'
                          }`}>
                            {staff.role.replace('_', ' ')}
                          </span>

                          {/* Verification Checkmark Permissions Badges */}
                          {staff.role !== 'rider' && (
                            <div className="flex items-center gap-1 text-[10px]">
                              <label className="flex items-center gap-1 text-slate-400 cursor-pointer bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800">
                                <input
                                  type="checkbox"
                                  checked={staff.canVerifyCod ?? true}
                                  onChange={(e) => {
                                    setStaffUsers((prev) =>
                                      prev.map((s) => (s.id === staff.id ? { ...s, canVerifyCod: e.target.checked } : s))
                                    );
                                  }}
                                  className="rounded border-slate-700 text-emerald-500 focus:ring-0"
                                />
                                <span>COD</span>
                              </label>

                              <label className="flex items-center gap-1 text-slate-400 cursor-pointer bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800">
                                <input
                                  type="checkbox"
                                  checked={staff.canVerifyCash ?? (staff.role === 'hub_incharge' || staff.role === 'supervisor')}
                                  onChange={(e) => {
                                    setStaffUsers((prev) =>
                                      prev.map((s) => (s.id === staff.id ? { ...s, canVerifyCash: e.target.checked } : s))
                                    );
                                  }}
                                  className="rounded border-slate-700 text-emerald-500 focus:ring-0"
                                />
                                <span>Cash</span>
                              </label>

                              <label className="flex items-center gap-1 text-slate-400 cursor-pointer bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800">
                                <input
                                  type="checkbox"
                                  checked={staff.canVerifyOnline ?? true}
                                  onChange={(e) => {
                                    setStaffUsers((prev) =>
                                      prev.map((s) => (s.id === staff.id ? { ...s, canVerifyOnline: e.target.checked } : s))
                                    );
                                  }}
                                  className="rounded border-slate-700 text-emerald-500 focus:ring-0"
                                />
                                <span>Online</span>
                              </label>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Controls: Role selector & 4-digit PIN */}
                    <div className="flex items-center gap-3">
                      {/* Role Selector */}
                      <select
                        value={staff.role}
                        onChange={(e) => {
                          const newRole = e.target.value as CodStaffRole;
                          setStaffUsers((prev) =>
                            prev.map((s) => (s.id === staff.id ? { ...s, role: newRole } : s))
                          );
                        }}
                        className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                      >
                        <option value="rider">Rider</option>
                        <option value="team_leader">Team Leader</option>
                        <option value="supervisor">Supervisor</option>
                        <option value="hub_incharge">Hub Incharge</option>
                      </select>

                      {/* 4-Digit PIN */}
                      <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1">
                        <input
                          type={isRevealed ? 'text' : 'password'}
                          maxLength={4}
                          value={staff.pin}
                          onChange={(e) => {
                            const val = e.target.value.replace(/\D/g, '').slice(0, 4);
                            setStaffUsers((prev) =>
                              prev.map((s) => (s.id === staff.id ? { ...s, pin: val } : s))
                            );
                          }}
                          className="w-14 bg-transparent text-xs font-mono font-bold text-amber-300 tracking-widest text-center focus:outline-none"
                          placeholder="0000"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setRevealedPins((prev) => ({ ...prev, [staff.id]: !prev[staff.id] }))
                          }
                          className="text-slate-400 hover:text-white"
                        >
                          {isRevealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>

                      {/* Quick PIN Regenerator */}
                      <button
                        type="button"
                        onClick={() => {
                          const randomPin = String(Math.floor(1000 + Math.random() * 9000));
                          setStaffUsers((prev) =>
                            prev.map((s) => (s.id === staff.id ? { ...s, pin: randomPin } : s))
                          );
                        }}
                        className="p-1 rounded text-slate-400 hover:text-amber-400"
                        title="Generate random 4-digit PIN"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 3: [📜 ऑडिट लॉग] AUDIT TRAIL */}
        {activeTab === 'audit_logs' && (
          <div className="space-y-3 max-w-4xl mx-auto">
            <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 shadow-md flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <Clock className="w-5 h-5 text-emerald-400" />
                  <span>ऑडिट लॉग (Audit Trail & Discrepancies)</span>
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Tracks all post-submission edits and amount checkmark verifications with timestamps & authorized personnel.
                </p>
              </div>
              <span className="text-xs font-bold text-emerald-400 bg-emerald-500/10 px-3 py-1.5 rounded-xl border border-emerald-500/30">
                {auditLogs.length} Events Logged
              </span>
            </div>

            {auditLogs.length === 0 ? (
              <div className="p-12 text-center text-xs text-slate-400 rounded-2xl bg-slate-900 border border-slate-800">
                No post-submission edits or discrepancies recorded yet. Pristine audit trail!
              </div>
            ) : (
              <div className="divide-y divide-slate-800/80 rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden text-xs shadow-xl">
                {auditLogs.map((log) => (
                  <div key={log.id} className="p-3.5 flex items-start justify-between gap-3 hover:bg-slate-850/50 transition">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-white text-xs">{log.riderName}</span>
                        <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
                          Field: {log.field}
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold uppercase">
                          By: {log.changedBy} ({log.role})
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-1 flex items-center gap-2">
                        <span>Old: <strong className="text-rose-400">{log.previousValue}</strong></span>
                        <span>➔</span>
                        <span>New: <strong className="text-emerald-400">{log.newValue}</strong></span>
                        {log.notes && <span className="text-slate-500 italic">({log.notes})</span>}
                      </div>
                    </div>

                    <span className="text-[10px] text-slate-500 font-mono shrink-0">
                      {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • {formatDateDisplay(log.date)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 4: [⚙️ COD सेटिंग्स] COMPANY MANAGEMENT & RULES */}
        {activeTab === 'settings' && (
          <div className="space-y-4 max-w-3xl mx-auto">
            <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 shadow-md">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Sliders className="w-5 h-5 text-emerald-400" />
                <span>COD सेटिंग्स (Company Management & Rules)</span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Configure company columns, day-end cutoffs and access permissions for this hub workspace.
              </p>
            </div>

            <form onSubmit={handleSaveSettings} className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-slate-300 font-bold block mb-1">Company 1 Column Name</label>
                  <input
                    type="text"
                    value={tempCompany1}
                    onChange={(e) => setTempCompany1(e.target.value)}
                    placeholder="e.g. Valmo COD"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-750 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500 font-bold"
                  />
                  <span className="text-[10px] text-slate-400 mt-1 block">Primary logistics company client</span>
                </div>

                <div>
                  <label className="text-xs text-slate-300 font-bold block mb-1">Company 2 Column Name</label>
                  <input
                    type="text"
                    value={tempCompany2}
                    onChange={(e) => setTempCompany2(e.target.value)}
                    placeholder="e.g. Xpressbees COD"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-750 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500 font-bold"
                  />
                  <span className="text-[10px] text-slate-400 mt-1 block">Secondary logistics company client</span>
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-300 font-bold block mb-1">Day-End Auto Lock Time</label>
                <input
                  type="time"
                  value={tempLockTime}
                  onChange={(e) => setTempLockTime(e.target.value)}
                  className="w-48 px-3 py-2 bg-slate-950 border border-slate-750 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500 font-mono"
                />
                <span className="text-[10px] text-slate-400 mt-1 block">Rider daily entry submission cutoff time</span>
              </div>

              {/* Super Admin Feature Flag in Settings */}
              {isSuperAdmin && (
                <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-white">Public Portal Access</span>
                    <p className="text-[11px] text-slate-400">Allow regular hub staff & riders to access the COD sub-app.</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleToggleFeatureFlag}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition cursor-pointer ${
                      settings.isEnabled
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                        : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                    }`}
                  >
                    {settings.isEnabled ? 'Enabled (Public)' : 'Disabled (Admin Only)'}
                  </button>
                </div>
              )}

              <div className="pt-2 flex justify-end">
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-emerald-950/40 transition active:scale-95 cursor-pointer"
                >
                  Save Settings
                </button>
              </div>
            </form>
          </div>
        )}

      </main>

      {/* 3. INDEPENDENT NEW BOTTOM NAVIGATION BAR (Exclusively for COD Sub-App) */}
      <nav 
        id="cod-standalone-bottom-navbar"
        className="bg-slate-900 border-t border-emerald-500/25 px-2 py-1.5 sm:px-4 sm:py-2 shrink-0 z-30 shadow-2xl"
      >
        <div className="max-w-xl mx-auto flex items-center justify-around gap-1">
          {/* Tab 1: [📊 दैनिक COD शीट] */}
          <button
            type="button"
            id="cod-bottom-tab-grid"
            onClick={() => setActiveTab('grid')}
            className={`flex-1 flex flex-col items-center justify-center py-1.5 px-1 rounded-xl transition-all duration-150 cursor-pointer ${
              activeTab === 'grid'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold shadow-md shadow-emerald-950/50'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Table className={`w-4 h-4 mb-0.5 ${activeTab === 'grid' ? 'text-emerald-400 scale-110' : 'text-slate-400'}`} />
            <span className="text-[10px] leading-tight font-medium">दैनिक COD शीट</span>
          </button>

          {/* Tab 2: [🔑 स्टाफ & राइडर PIN] */}
          <button
            type="button"
            id="cod-bottom-tab-access"
            onClick={() => setActiveTab('access_control')}
            className={`flex-1 flex flex-col items-center justify-center py-1.5 px-1 rounded-xl transition-all duration-150 cursor-pointer ${
              activeTab === 'access_control'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold shadow-md shadow-emerald-950/50'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Key className={`w-4 h-4 mb-0.5 ${activeTab === 'access_control' ? 'text-emerald-400 scale-110' : 'text-slate-400'}`} />
            <span className="text-[10px] leading-tight font-medium">स्टाफ & राइडर PIN</span>
          </button>

          {/* Tab 3: [📜 ऑडिट लॉग] */}
          <button
            type="button"
            id="cod-bottom-tab-audit"
            onClick={() => setActiveTab('audit_logs')}
            className={`flex-1 flex flex-col items-center justify-center py-1.5 px-1 rounded-xl transition-all duration-150 cursor-pointer ${
              activeTab === 'audit_logs'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold shadow-md shadow-emerald-950/50'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Clock className={`w-4 h-4 mb-0.5 ${activeTab === 'audit_logs' ? 'text-emerald-400 scale-110' : 'text-slate-400'}`} />
            <span className="text-[10px] leading-tight font-medium">ऑडिट लॉग</span>
          </button>

          {/* Tab 4: [⚙️ COD सेटिंग्स] */}
          <button
            type="button"
            id="cod-bottom-tab-settings"
            onClick={() => setActiveTab('settings')}
            className={`flex-1 flex flex-col items-center justify-center py-1.5 px-1 rounded-xl transition-all duration-150 cursor-pointer ${
              activeTab === 'settings'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold shadow-md shadow-emerald-950/50'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sliders className={`w-4 h-4 mb-0.5 ${activeTab === 'settings' ? 'text-emerald-400 scale-110' : 'text-slate-400'}`} />
            <span className="text-[10px] leading-tight font-medium">COD सेटिंग्स</span>
          </button>
        </div>
      </nav>

      {/* 5. PER-FIELD SHORTAGE & DISCREPANCY MARKING MODAL */}
      {shortageModal && (
        <div className="fixed inset-0 z-[125] bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-rose-500/50 w-full max-w-md rounded-2xl p-5 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 rounded-xl bg-rose-500/20 text-rose-400 border border-rose-500/40">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                    <span>Shortage / Discrepancy Marking</span>
                  </h3>
                  <p className="text-[11px] text-slate-400 font-medium">
                    {shortageModal.riderName} • <span className="text-amber-300 font-bold">{shortageModal.fieldLabel}</span>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShortageModal(null)}
                className="text-slate-400 hover:text-white p-1 text-sm font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3.5">
              {/* Reported / Due Amount Display */}
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
                    Reported / Due Amount (दर्ज राशि)
                  </span>
                  <span className="text-xs text-slate-300 font-medium">
                    As reported by rider
                  </span>
                </div>
                <span className="text-base font-black text-white font-mono">
                  {formatINR(shortageModal.reportedAmount)}
                </span>
              </div>

              {/* Actual Received Amount Input */}
              <div>
                <label className="text-xs text-slate-300 font-bold block mb-1">
                  Actual Received Amount (वास्तविक प्राप्त राशि ₹)
                </label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  autoFocus
                  value={shortageModal.actualReceived === 0 ? '' : shortageModal.actualReceived}
                  onChange={(e) => {
                    const val = Math.max(0, parseFloat(e.target.value) || 0);
                    const calcShortage = Math.max(0, shortageModal.reportedAmount - val);
                    setShortageModal({
                      ...shortageModal,
                      actualReceived: val,
                      shortageAmount: calcShortage,
                    });
                  }}
                  placeholder="0"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-sm text-emerald-300 font-mono font-bold focus:outline-none focus:border-rose-500"
                />
                <span className="text-[10px] text-slate-400 mt-1 block">
                  Enter physical cash or verified online amount handed in by rider.
                </span>
              </div>

              {/* Auto-Calculated Shortage Amount Alert Card */}
              <div className={`p-3.5 rounded-xl border flex items-center justify-between ${
                shortageModal.shortageAmount > 0
                  ? 'bg-rose-950/40 border-rose-500/50 text-rose-200'
                  : 'bg-emerald-950/30 border-emerald-500/40 text-emerald-200'
              }`}>
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider block">
                    {shortageModal.shortageAmount > 0 ? '⚠️ Calculated Shortage (कमी राशि)' : '✓ Verification Status'}
                  </span>
                  <span className="text-xs text-slate-300 font-medium">
                    {shortageModal.shortageAmount > 0
                      ? `Reported ${formatINR(shortageModal.reportedAmount)} - Received ${formatINR(shortageModal.actualReceived)}`
                      : 'No Shortage (Full amount received)'}
                  </span>
                </div>
                <span className={`text-base font-black font-mono ${
                  shortageModal.shortageAmount > 0 ? 'text-rose-300' : 'text-emerald-300'
                }`}>
                  {shortageModal.shortageAmount > 0 ? `-${formatINR(shortageModal.shortageAmount)}` : '₹0 Short'}
                </span>
              </div>

              {/* Optional Discrepancy Reason / Note */}
              <div>
                <label className="text-xs text-slate-300 font-bold block mb-1">
                  Shortage Reason / Remark (कारण / विवरण - Optional)
                </label>
                <input
                  type="text"
                  value={shortageModal.notes}
                  onChange={(e) => setShortageModal({ ...shortageModal, notes: e.target.value })}
                  placeholder="e.g. ₹500 short in cash handoff, rider to clear tomorrow"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-rose-500"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-between gap-2 pt-2">
                {shortageModal.shortageAmount > 0 || Number(gridEntries.find(r => r.riderId === shortageModal.riderId)?.[`${shortageModal.field}Shortage` as keyof CodDailyEntry] || 0) > 0 ? (
                  <button
                    type="button"
                    onClick={() => handleClearShortage(shortageModal.riderId, shortageModal.field)}
                    className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-rose-300 hover:text-rose-200 text-xs font-bold transition border border-rose-500/30 cursor-pointer"
                  >
                    Clear Shortage
                  </button>
                ) : (
                  <div />
                )}

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShortageModal(null)}
                    className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 text-xs font-semibold cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveShortage}
                    className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-lg shadow-rose-950/50 transition cursor-pointer"
                  >
                    Confirm Shortage
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4. ADD STAFF MEMBER MODAL (Supervisor, Hub Incharge, Team Leader) */}
      {isAddStaffModalOpen && (
        <div className="fixed inset-0 z-[120] bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-emerald-500/40 w-full max-w-md rounded-2xl p-5 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-blue-500/20 text-blue-400">
                  <UserPlus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">+ Add New Staff Member</h3>
                  <p className="text-[11px] text-slate-400">Create login profile & assign check permissions</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsAddStaffModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddStaffSubmit} className="space-y-3.5">
              <div>
                <label className="text-xs text-slate-300 font-bold block mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  value={newStaffName}
                  onChange={(e) => setNewStaffName(e.target.value)}
                  placeholder="e.g. Vikas Singh"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-750 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="text-xs text-slate-300 font-bold block mb-1">10-Digit Mobile Number</label>
                <input
                  type="tel"
                  required
                  maxLength={10}
                  value={newStaffPhone}
                  onChange={(e) => setNewStaffPhone(e.target.value)}
                  placeholder="e.g. 9876543210"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-750 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500 font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-300 font-bold block mb-1">Assigned Role</label>
                  <select
                    value={newStaffRole}
                    onChange={(e) => {
                      const r = e.target.value as any;
                      setNewStaffRole(r);
                      // Auto pre-check permissions based on role
                      if (r === 'hub_incharge' || r === 'supervisor') {
                        setNewStaffCanVerifyCod(true);
                        setNewStaffCanVerifyCash(true);
                        setNewStaffCanVerifyOnline(true);
                      } else if (r === 'team_leader') {
                        setNewStaffCanVerifyCod(true);
                        setNewStaffCanVerifyCash(false);
                        setNewStaffCanVerifyOnline(true);
                      }
                    }}
                    className="w-full px-2.5 py-2 bg-slate-950 border border-slate-750 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="supervisor">Supervisor (सुपरवाइज़र)</option>
                    <option value="team_leader">Team Leader (टीम लीडर)</option>
                    <option value="hub_incharge">Hub Incharge (हब इंचार्ज)</option>
                  </select>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs text-slate-300 font-bold">4-Digit PIN</label>
                    <button
                      type="button"
                      onClick={() => setNewStaffPin(String(Math.floor(1000 + Math.random() * 9000)))}
                      className="text-[10px] text-amber-400 hover:underline"
                    >
                      Random
                    </button>
                  </div>
                  <input
                    type="text"
                    required
                    maxLength={4}
                    value={newStaffPin}
                    onChange={(e) => setNewStaffPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    placeholder="0000"
                    className="w-full px-2.5 py-2 bg-slate-950 border border-slate-750 rounded-xl text-xs text-amber-300 font-mono font-bold tracking-widest text-center focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              {/* 2. Granular Verification Permission Toggles */}
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                <span className="text-[11px] font-bold text-slate-300 block">
                  Checkmark Verification Permissions (सत्यापन अधिकार):
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                  <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newStaffCanVerifyCod}
                      onChange={(e) => setNewStaffCanVerifyCod(e.target.checked)}
                      className="rounded border-slate-700 text-emerald-500 focus:ring-0"
                    />
                    <span>Verify COD</span>
                  </label>

                  <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newStaffCanVerifyCash}
                      onChange={(e) => setNewStaffCanVerifyCash(e.target.checked)}
                      className="rounded border-slate-700 text-emerald-500 focus:ring-0"
                    />
                    <span>Verify Cash</span>
                  </label>

                  <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newStaffCanVerifyOnline}
                      onChange={(e) => setNewStaffCanVerifyOnline(e.target.checked)}
                      className="rounded border-slate-700 text-emerald-500 focus:ring-0"
                    />
                    <span>Verify Online</span>
                  </label>
                </div>
              </div>

              {newStaffError && (
                <p className="text-xs text-rose-400 font-bold">{newStaffError}</p>
              )}

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setIsAddStaffModalOpen(false)}
                  className="px-3.5 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow"
                >
                  Save Staff Member
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 4-DIGIT PIN AUTHENTICATION / PERSONA SWITCHER MODAL */}
      {isPinModalOpen && (
        <div className="fixed inset-0 z-[120] bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-emerald-500/40 w-full max-w-sm rounded-2xl p-5 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400">
                  <Key className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Staff / Rider PIN Login</h3>
                  <p className="text-[11px] text-slate-400">Enter your 4-digit numeric access PIN</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsPinModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handlePinLogin} className="space-y-3">
              <div>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  autoFocus
                  value={inputPin}
                  onChange={(e) => {
                    setInputPin(e.target.value.replace(/\D/g, '').slice(0, 4));
                    if (pinError) setPinError('');
                  }}
                  placeholder="• • • •"
                  className="w-full text-center text-3xl font-mono tracking-widest py-2 bg-slate-950 border border-slate-700 rounded-xl text-amber-300 focus:outline-none focus:border-emerald-500"
                />
                {pinError && <p className="text-xs text-rose-400 mt-1 text-center font-bold">{pinError}</p>}
              </div>

              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <span>Riders can edit only their row.</span>
                <span>Owner Master PIN: 9999</span>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsPinModalOpen(false)}
                  className="px-3 py-1.5 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow"
                >
                  Verify PIN
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
