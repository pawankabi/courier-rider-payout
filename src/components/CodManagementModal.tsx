import React, { useState, useEffect, useMemo } from 'react';
import { 
  X, 
  Table, 
  Lock, 
  Unlock, 
  ShieldCheck, 
  Users, 
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
  ArrowLeft, 
  ArrowRight, 
  Filter, 
  Sparkles, 
  IndianRupee, 
  Settings2, 
  Edit3, 
  AlertTriangle, 
  ChevronRight,
  LogOut,
  Smartphone
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
  loadCodDailyEntries, 
  saveCodDailyEntries, 
  loadCodAuditLogs, 
  recordCodAuditLog, 
  exportCodGridToCSV,
  subscribeToDailyCodSheet
} from '../services/codService';
import { formatINR, formatDateDisplay, getTodayDateString, getDaysAgoDateString } from '../utils/formatters';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  riders: Rider[];
  userId: string;
  isSuperAdmin: boolean;
  hubName?: string;
}

export const CodManagementModal: React.FC<Props> = ({
  isOpen,
  onClose,
  riders,
  userId,
  isSuperAdmin,
  hubName = 'सरायकेला कूरियर हब',
}) => {
  // Navigation Tabs: 'grid' | 'access_control' | 'audit_logs'
  const [activeTab, setActiveTab] = useState<'grid' | 'access_control' | 'audit_logs'>('grid');

  // Selected Date for COD Grid (defaults to Today)
  const [selectedDate, setSelectedDate] = useState<string>(getTodayDateString());

  // Settings state (Company names, feature flag)
  const [settings, setSettings] = useState<CodSettings>({
    isEnabled: false,
    company1Name: 'Valmo COD',
    company2Name: 'Xpressbees COD',
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

  // PIN Login / Persona Switcher Modal
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const [inputPin, setInputPin] = useState('');
  const [pinError, setPinError] = useState('');

  // Company Name Config Popover
  const [isCompanyConfigOpen, setIsCompanyConfigOpen] = useState(false);
  const [tempCompany1, setTempCompany1] = useState('');
  const [tempCompany2, setTempCompany2] = useState('');

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
    if (!isOpen) return;

    let mounted = true;
    const initialize = async () => {
      setIsLoading(true);
      try {
        const [loadedSettings, loadedStaff, loadedLogs] = await Promise.all([
          loadCodSettings(userId),
          loadCodStaffUsers(userId, riders),
          loadCodAuditLogs(userId),
        ]);

        if (mounted) {
          setSettings(loadedSettings);
          setTempCompany1(loadedSettings.company1Name);
          setTempCompany2(loadedSettings.company2Name);
          setStaffUsers(loadedStaff);
          setAuditLogs(loadedLogs);
        }

        // Load Grid for Selected Date
        const entries = await loadCodDailyEntries(userId, selectedDate, riders);
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
  }, [isOpen, userId, riders]);

  // 2. Real-Time bi-directional synchronization on daily_cod_sheets/{selectedDate}
  useEffect(() => {
    if (!isOpen) return;

    let mounted = true;

    // Cache-first fast initialization
    loadCodDailyEntries(userId, selectedDate, riders).then((entries) => {
      if (mounted) {
        setGridEntries(entries);
      }
    });

    // Zero-second Firestore onSnapshot listener scoped to this hub
    const unsubscribe = subscribeToDailyCodSheet(
      selectedDate,
      (sheetData) => {
        if (!mounted) return;
        if (sheetData && Array.isArray(sheetData.entries) && sheetData.entries.length > 0) {
          const entryMap = new Map<string, CodDailyEntry>();
          sheetData.entries.forEach((e) => {
            if (e.riderId) entryMap.set(e.riderId, e);
            const cleanPhone = (e.riderPhone || '').replace(/\D/g, '').slice(-10);
            if (cleanPhone) entryMap.set(cleanPhone, e);
          });

          const merged: CodDailyEntry[] = riders.map((r) => {
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

          // Also include any rider rows present in sheet that aren't in riders list
          sheetData.entries.forEach((e) => {
            const cleanPhone = (e.riderPhone || '').replace(/\D/g, '').slice(-10);
            const alreadyInMerged = merged.some((m) => 
              m.riderId === e.riderId ||
              ((m.riderPhone || '').replace(/\D/g, '').slice(-10) === cleanPhone && cleanPhone)
            );
            if (!alreadyInMerged) {
              merged.push(e);
            }
          });

          setGridEntries(merged);
        }
      },
      (err) => {
        console.warn('Real-time sheet subscription notice in modal:', err);
      },
      userId
    );

    return () => {
      mounted = false;
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [selectedDate, userId, riders, isOpen]);

  // Smooth Escape key handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isPinModalOpen) setIsPinModalOpen(false);
        else if (isCompanyConfigOpen) setIsCompanyConfigOpen(false);
        else onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, isPinModalOpen, isCompanyConfigOpen]);

  // Check if today is day-locked by Hub Incharge
  const isDayLocked = useMemo(() => {
    return gridEntries.length > 0 && gridEntries.every((e) => e.status === 'locked');
  }, [gridEntries]);

  // Handle cell edit in Excel Grid
  const handleCellChange = (
    riderId: string,
    field: 'company1Amount' | 'company2Amount' | 'cashDeposit' | 'onlineDeposit' | 'notes',
    value: string
  ) => {
    // Permission check
    const isOwnerOrIncharge = activeUser.role === 'hub_incharge' || activeUser.role === 'owner';
    const isRiderEditingSelf = activeUser.role === 'rider' && activeUser.riderId === riderId;

    if (!isOwnerOrIncharge && !isRiderEditingSelf) {
      showToast('You can only edit your own assigned row.', 'error');
      return;
    }

    if (isDayLocked && !isOwnerOrIncharge) {
      showToast('This day has been locked by the Hub Incharge.', 'error');
      return;
    }

    setGridEntries((prev) =>
      prev.map((row) => {
        if (row.riderId !== riderId) return row;

        const updatedRow = { ...row };
        const prevValue = row[field];

        if (field === 'notes') {
          updatedRow.notes = value;
        } else {
          const num = Math.max(0, parseFloat(value) || 0);
          updatedRow[field] = num;
        }

        // Auto-calculate Total COD & Total Deposit & Balance
        const totalCod = (Number(updatedRow.company1Amount) || 0) + (Number(updatedRow.company2Amount) || 0);
        const totalDeposit = (Number(updatedRow.cashDeposit) || 0) + (Number(updatedRow.onlineDeposit) || 0);
        const balance = totalCod - totalDeposit;

        updatedRow.totalCod = totalCod;
        updatedRow.totalDeposit = totalDeposit;
        updatedRow.balance = balance;
        updatedRow.updatedAt = new Date().toISOString();
        updatedRow.updatedBy = activeUser.name;

        // If previously submitted, record audit log for discrepancy tracking
        if (row.status === 'submitted' || row.status === 'verified') {
          if (prevValue !== value) {
            recordCodAuditLog(userId, {
              changedBy: activeUser.name,
              role: activeUser.role,
              riderId: row.riderId,
              riderName: row.riderName,
              date: row.date,
              field,
              previousValue: prevValue ?? 0,
              newValue: value,
              notes: `Edited by ${activeUser.role.toUpperCase()}`,
            }).then(() => {
              loadCodAuditLogs(userId).then(setAuditLogs);
            });
          }
        }

        return updatedRow;
      })
    );
  };

  // Save current grid changes to storage & Firestore
  const handleSaveGrid = async () => {
    setIsSaving(true);
    try {
      await saveCodDailyEntries(userId, selectedDate, gridEntries);
      showToast('COD grid changes saved successfully!', 'success');
    } catch (err) {
      console.error('Failed to save COD grid:', err);
      showToast('Failed to save COD grid.', 'error');
    } finally {
      setIsSaving(false);
    }
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

  // Verify Rider Row (Team Leader / Supervisor / Hub Incharge)
  const handleVerifyRow = async (riderId: string) => {
    if (activeUser.role === 'rider') {
      showToast('Riders cannot verify submissions.', 'error');
      return;
    }

    const updated = gridEntries.map((row) => {
      if (row.riderId !== riderId) return row;
      return {
        ...row,
        status: 'verified' as const,
        verifiedBy: activeUser.name,
        verifiedAt: new Date().toISOString(),
      };
    });
    setGridEntries(updated);
    await saveCodDailyEntries(userId, selectedDate, updated);
    showToast(`Verified rider submission!`, 'success');
  };

  // Day-End Lock (Hub Incharge only)
  const handleToggleDayLock = async () => {
    if (activeUser.role !== 'hub_incharge' && activeUser.role !== 'owner') {
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

    // Owner master bypass (Owner PIN: 9999 or any match)
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

  // Save Staff & Rider Access Control List
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
  const handleSaveCompanyConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    const updated: CodSettings = {
      ...settings,
      company1Name: tempCompany1.trim() || 'Valmo COD',
      company2Name: tempCompany2.trim() || 'Xpressbees COD',
    };
    setSettings(updated);
    await saveCodSettings(userId, updated);
    setIsCompanyConfigOpen(false);
    showToast('Company column names updated!', 'success');
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

    return { c1, c2, totalCod, cash, online, totalDeposit, balance };
  }, [filteredRows]);

  if (!isOpen) return null;

  return (
    <div 
      id="cod-management-modal-backdrop"
      className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 overflow-y-auto animate-in fade-in duration-150"
    >
      <div 
        id="cod-management-modal-window"
        className="bg-slate-900 border border-emerald-500/30 w-full max-w-7xl rounded-2xl shadow-2xl flex flex-col my-auto max-h-[96vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top App Header */}
        <div className="bg-gradient-to-r from-emerald-950 via-slate-900 to-sky-950 p-3.5 sm:p-4 border-b border-emerald-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center justify-center shadow-lg shrink-0">
              <Table className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-lg font-black text-white tracking-tight flex items-center gap-2">
                  <span>COD हिसाब-किताब</span>
                  <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                    Excel Grid & PIN Portal
                  </span>
                </h2>
                {isDayLocked && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30">
                    <Lock className="w-3 h-3" /> Day Locked
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                {hubName} • Multi-company parcel collections, daily deposits, cash-counter reconciliation & RBAC
              </p>
            </div>
          </div>

          {/* Persona Switcher & Feature Flag Controls */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Active Persona Pill / Quick PIN Switch */}
            <button
              type="button"
              id="switch-cod-persona-btn"
              onClick={() => setIsPinModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-750 text-emerald-300 border border-emerald-500/30 text-xs font-bold transition active:scale-95 cursor-pointer"
              title="Click to authenticate via 4-digit PIN"
            >
              <Key className="w-3.5 h-3.5 text-emerald-400" />
              <span>Persona: {activeUser.name} ({activeUser.role.toUpperCase()})</span>
            </button>

            {/* Super Admin Feature Flag Toggle */}
            {isSuperAdmin && (
              <button
                type="button"
                id="toggle-cod-feature-flag-btn"
                onClick={handleToggleFeatureFlag}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-bold border transition active:scale-95 cursor-pointer ${
                  settings.isEnabled
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30'
                    : 'bg-amber-500/15 text-amber-300 border-amber-500/30 hover:bg-amber-500/25'
                }`}
                title="Super Admin Flag: Toggle visibility for non-admin users"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Portal: {settings.isEnabled ? 'Public to Staff' : 'Admin Only'}</span>
              </button>
            )}

            <button
              type="button"
              id="close-cod-modal-btn"
              onClick={onClose}
              className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition"
              title="Close Portal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Toast Alert */}
        {toastMessage && (
          <div className={`px-4 py-2 text-xs font-bold flex items-center justify-between border-b ${
            toastMessage.type === 'error'
              ? 'bg-rose-950/80 text-rose-200 border-rose-800'
              : toastMessage.type === 'info'
              ? 'bg-sky-950/80 text-sky-200 border-sky-800'
              : 'bg-emerald-950/80 text-emerald-200 border-emerald-800'
          }`}>
            <span>{toastMessage.text}</span>
            <button onClick={() => setToastMessage(null)} className="p-0.5 hover:opacity-80">
              ✕
            </button>
          </div>
        )}

        {/* Sub-Module Navigation Bar */}
        <div className="bg-slate-950/90 px-4 py-2 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              id="cod-nav-grid-tab"
              onClick={() => setActiveTab('grid')}
              className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition ${
                activeTab === 'grid'
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-950/50'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <Table className="w-3.5 h-3.5" />
              <span>Multi-Company Excel Grid</span>
            </button>

            <button
              type="button"
              id="cod-nav-access-tab"
              onClick={() => setActiveTab('access_control')}
              className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition ${
                activeTab === 'access_control'
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-950/50'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <Key className="w-3.5 h-3.5" />
              <span>Staff & Rider PINs ({staffUsers.length})</span>
            </button>

            <button
              type="button"
              id="cod-nav-audit-tab"
              onClick={() => setActiveTab('audit_logs')}
              className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition ${
                activeTab === 'audit_logs'
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-950/50'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>Audit Trail ({auditLogs.length})</span>
            </button>
          </div>

          {/* Quick Actions in Tab Bar */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsCompanyConfigOpen(true)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-850 hover:bg-slate-800 text-slate-300 border border-slate-700 text-xs font-semibold transition"
              title="Configure Company 1 and Company 2 column names"
            >
              <Settings2 className="w-3.5 h-3.5 text-amber-400" />
              <span>Configure Companies</span>
            </button>

            <button
              type="button"
              onClick={() => exportCodGridToCSV(selectedDate, gridEntries, settings.company1Name, settings.company2Name, hubName)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-bold shadow transition active:scale-95"
              title="Download Excel / CSV Statement for this date"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export Excel</span>
            </button>
          </div>
        </div>

        {/* Main Tab Content */}
        <div className="p-3 sm:p-4 overflow-y-auto flex-1 space-y-4">
          
          {/* TAB 1: EXCEL COD GRID */}
          {activeTab === 'grid' && (
            <div className="space-y-3">
              {/* Date Selector & Search Toolbar */}
              <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-300">
                    <Calendar className="w-4 h-4 text-emerald-400" />
                    <span>Reconciliation Date:</span>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setSelectedDate(getDaysAgoDateString(1))}
                      className="p-1 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-300 text-xs font-medium"
                      title="Yesterday"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                    </button>
                    <input
                      type="date"
                      value={selectedDate}
                      onChange={(e) => setSelectedDate(e.target.value)}
                      className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none focus:border-emerald-500 font-medium"
                    />
                    <button
                      type="button"
                      onClick={() => setSelectedDate(getTodayDateString())}
                      className="px-2 py-1 rounded-lg bg-emerald-600/20 text-emerald-300 border border-emerald-500/40 text-[11px] font-bold hover:bg-emerald-600/30"
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
                      className="pl-8 pr-3 py-1 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 w-36 sm:w-44"
                    />
                  </div>

                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as any)}
                    className="bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1 text-xs text-slate-300 focus:outline-none focus:border-emerald-500"
                  >
                    <option value="all">All ({gridEntries.length})</option>
                    <option value="due">Pending Due</option>
                    <option value="balanced">Balanced (₹0)</option>
                    <option value="submitted">Submitted</option>
                    <option value="verified">Verified</option>
                  </select>

                  {/* Day-End Lock Toggle (Incharge only) */}
                  {(activeUser.role === 'hub_incharge' || activeUser.role === 'owner') && (
                    <button
                      type="button"
                      id="toggle-day-end-lock-btn"
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

                  <button
                    type="button"
                    onClick={handleSaveGrid}
                    disabled={isSaving}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black shadow-md active:scale-95 transition cursor-pointer disabled:opacity-50"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>{isSaving ? 'Saving...' : 'Save All'}</span>
                  </button>
                </div>
              </div>

              {/* Responsive Excel-Style Table */}
              <div className="overflow-x-auto rounded-xl border border-slate-750 bg-slate-950/80 shadow-xl scrollbar-thin">
                <table className="w-full text-left text-xs border-collapse min-w-[950px]">
                  <thead>
                    <tr className="bg-slate-850/90 text-slate-200 border-b border-slate-750 text-[11px] font-bold uppercase tracking-wider">
                      <th className="p-3 sticky left-0 z-20 bg-slate-850 shadow-sm min-w-[170px]">
                        Rider Name
                      </th>
                      <th className="p-3 min-w-[130px] text-sky-300">
                        {settings.company1Name} (₹)
                      </th>
                      <th className="p-3 min-w-[130px] text-amber-300">
                        {settings.company2Name} (₹)
                      </th>
                      <th className="p-3 min-w-[110px] bg-slate-800/50 text-emerald-300">
                        Total COD (₹)
                      </th>
                      <th className="p-3 min-w-[120px] text-emerald-400">
                        Cash Deposit (₹)
                      </th>
                      <th className="p-3 min-w-[120px] text-purple-400">
                        Online Deposit (₹)
                      </th>
                      <th className="p-3 min-w-[110px] bg-slate-800/50 text-indigo-300">
                        Total Deposit (₹)
                      </th>
                      <th className="p-3 min-w-[120px] text-center">
                        Difference / Balance
                      </th>
                      <th className="p-3 min-w-[90px] text-slate-400">
                        Status
                      </th>
                      <th className="p-3 min-w-[110px] text-right">
                        Action
                      </th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-800">
                    {filteredRows.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="p-8 text-center text-slate-400">
                          No rider COD records found for this date.
                        </td>
                      </tr>
                    ) : (
                      filteredRows.map((row, idx) => {
                        const isSelfRider = activeUser.role === 'rider' && activeUser.riderId === row.riderId;
                        const canEditRow = 
                          (activeUser.role === 'hub_incharge' || activeUser.role === 'owner' || isSelfRider) &&
                          (!isDayLocked || activeUser.role === 'hub_incharge' || activeUser.role === 'owner');

                        return (
                          <tr
                            key={row.riderId}
                            className={`transition hover:bg-slate-800/40 ${
                              isSelfRider ? 'bg-emerald-950/20 ring-1 ring-emerald-500/30' : ''
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

                            {/* 2. Company 1 COD */}
                            <td className="p-2.5">
                              <input
                                type="number"
                                min="0"
                                step="any"
                                disabled={!canEditRow}
                                value={row.company1Amount || ''}
                                onChange={(e) => handleCellChange(row.riderId, 'company1Amount', e.target.value)}
                                placeholder="0"
                                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-sky-200 font-mono font-bold focus:outline-none focus:border-sky-500 disabled:opacity-60"
                              />
                            </td>

                            {/* 3. Company 2 COD */}
                            <td className="p-2.5">
                              <input
                                type="number"
                                min="0"
                                step="any"
                                disabled={!canEditRow}
                                value={row.company2Amount || ''}
                                onChange={(e) => handleCellChange(row.riderId, 'company2Amount', e.target.value)}
                                placeholder="0"
                                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-amber-200 font-mono font-bold focus:outline-none focus:border-amber-500 disabled:opacity-60"
                              />
                            </td>

                            {/* 4. Total COD (Auto-calculated) */}
                            <td className="p-3 font-mono font-black text-emerald-300 bg-slate-900/60 text-xs">
                              {formatINR(row.totalCod)}
                            </td>

                            {/* 5. Cash Deposit */}
                            <td className="p-2.5">
                              <input
                                type="number"
                                min="0"
                                step="any"
                                disabled={!canEditRow}
                                value={row.cashDeposit || ''}
                                onChange={(e) => handleCellChange(row.riderId, 'cashDeposit', e.target.value)}
                                placeholder="0"
                                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-emerald-200 font-mono font-bold focus:outline-none focus:border-emerald-500 disabled:opacity-60"
                              />
                            </td>

                            {/* 6. Online Deposit */}
                            <td className="p-2.5">
                              <input
                                type="number"
                                min="0"
                                step="any"
                                disabled={!canEditRow}
                                value={row.onlineDeposit || ''}
                                onChange={(e) => handleCellChange(row.riderId, 'onlineDeposit', e.target.value)}
                                placeholder="0"
                                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-purple-200 font-mono font-bold focus:outline-none focus:border-purple-500 disabled:opacity-60"
                              />
                            </td>

                            {/* 7. Total Deposit (Auto-calculated) */}
                            <td className="p-3 font-mono font-black text-indigo-300 bg-slate-900/60 text-xs">
                              {formatINR(row.totalDeposit)}
                            </td>

                            {/* 8. Difference / Balance */}
                            <td className="p-3 text-center">
                              {row.balance === 0 ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                                  ✓ Tally / ₹0
                                </span>
                              ) : row.balance > 0 ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-black bg-rose-500/20 text-rose-300 border border-rose-500/40">
                                  ⚠️ Due: {formatINR(row.balance)}
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/40">
                                  🔵 Surplus: {formatINR(Math.abs(row.balance))}
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

                            {/* 10. Actions */}
                            <td className="p-2.5 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                {isSelfRider && row.status === 'draft' && (
                                  <button
                                    type="button"
                                    onClick={() => handleSubmitRow(row.riderId)}
                                    className="px-2.5 py-1 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg text-[11px] transition shadow"
                                    title="Submit my daily collection"
                                  >
                                    Submit
                                  </button>
                                )}

                                {activeUser.role !== 'rider' && row.status !== 'verified' && row.status !== 'locked' && (
                                  <button
                                    type="button"
                                    onClick={() => handleVerifyRow(row.riderId)}
                                    className="px-2 py-1 bg-emerald-600/30 hover:bg-emerald-600 text-emerald-200 hover:text-white border border-emerald-500/40 font-bold rounded-lg text-[11px] transition"
                                    title="Verify collection numbers"
                                  >
                                    Verify
                                  </button>
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
                      <td colSpan={2} className="p-3 text-right text-slate-400 text-[11px]">
                        Auto-Tallied by Hub System
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {/* TAB 2: STAFF & RIDER ACCESS CONTROL (PIN MANAGEMENT) */}
          {activeTab === 'access_control' && (
            <div className="space-y-4 max-w-4xl mx-auto">
              <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Key className="w-4 h-4 text-emerald-400" />
                    <span>Staff & Rider Access Control (4-Digit PIN Security)</span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Assign individual 4-digit PINs and roles. Riders can only edit their own assigned row.
                  </p>
                </div>

                <button
                  type="button"
                  id="save-staff-access-btn"
                  onClick={handleSaveStaffAccess}
                  disabled={isSaving}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black shadow-md active:scale-95 transition cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  <span>{isSaving ? 'Saving...' : 'Save All PINs'}</span>
                </button>
              </div>

              {/* Roles Breakdown Info Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5 text-xs">
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="font-bold text-sky-400">🚴 Rider</span>
                  <p className="text-[11px] text-slate-400 mt-1">Can edit only their own daily row; read-only for others.</p>
                </div>
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="font-bold text-amber-400">⭐ Team Leader</span>
                  <p className="text-[11px] text-slate-400 mt-1">Can review and verify rider submissions.</p>
                </div>
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="font-bold text-purple-400">🛡️ Supervisor</span>
                  <p className="text-[11px] text-slate-400 mt-1">Can review team balances & flag discrepancies.</p>
                </div>
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="font-bold text-emerald-400">👑 Hub Incharge</span>
                  <p className="text-[11px] text-slate-400 mt-1">Full edit, audit review & day-end lock permissions.</p>
                </div>
              </div>

              {/* Staff & Rider List */}
              <div className="rounded-xl border border-slate-800 bg-slate-950 divide-y divide-slate-850 overflow-hidden">
                {staffUsers.map((staff, index) => {
                  const isRevealed = !!revealedPins[staff.id];

                  return (
                    <div
                      key={staff.id}
                      className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-900/60 transition"
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
                          <span className={`text-[10px] font-bold uppercase px-2 py-0.2 rounded-full border mt-0.5 inline-block ${
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
                          className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                        >
                          <option value="rider">Rider</option>
                          <option value="team_leader">Team Leader</option>
                          <option value="supervisor">Supervisor</option>
                          <option value="hub_incharge">Hub Incharge</option>
                        </select>

                        {/* 4-Digit PIN */}
                        <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1">
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

          {/* TAB 3: AUDIT TRAIL / EDIT LOGS */}
          {activeTab === 'audit_logs' && (
            <div className="space-y-3 max-w-4xl mx-auto">
              <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Clock className="w-4 h-4 text-emerald-400" />
                    <span>Audit Trail Foundation (Discrepancy & Alteration Log)</span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Tracks post-submission edits with exact timestamps, previous vs new values & authorized personnel.
                  </p>
                </div>
                <span className="text-xs font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-lg border border-emerald-500/20">
                  {auditLogs.length} Events Logged
                </span>
              </div>

              {auditLogs.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400 rounded-xl bg-slate-950 border border-slate-800">
                  No post-submission edits or discrepancies recorded yet. Pristine audit trail!
                </div>
              ) : (
                <div className="divide-y divide-slate-850 rounded-xl bg-slate-950 border border-slate-800 overflow-hidden text-xs">
                  {auditLogs.map((log) => (
                    <div key={log.id} className="p-3 flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-white">{log.riderName}</span>
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-300 font-mono">
                            Field: {log.field}
                          </span>
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 font-bold uppercase">
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

        </div>

        {/* Modal Footer */}
        <div className="p-3.5 bg-slate-950 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400 shrink-0">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Active Persona: <strong className="text-white">{activeUser.name}</strong> ({activeUser.role.toUpperCase()})</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-200 font-semibold transition cursor-pointer"
          >
            Close / Return to Dashboard
          </button>
        </div>
      </div>

      {/* 4-DIGIT PIN AUTHENTICATION / PERSONA SWITCHER MODAL */}
      {isPinModalOpen && (
        <div className="fixed inset-0 z-60 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
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
                <X className="w-5 h-5" />
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
                  className="w-full text-center text-2xl font-mono tracking-widest py-2 bg-slate-950 border border-slate-700 rounded-xl text-amber-300 focus:outline-none focus:border-emerald-500"
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

      {/* CONFIGURE COMPANIES MODAL */}
      {isCompanyConfigOpen && (
        <div className="fixed inset-0 z-60 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-amber-500/40 w-full max-w-sm rounded-2xl p-5 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400">
                  <Settings2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Configure Company Names</h3>
                  <p className="text-[11px] text-slate-400">Rename columns for your hub contracts</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsCompanyConfigOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveCompanyConfig} className="space-y-3">
              <div>
                <label className="text-xs text-slate-300 block mb-1">Company 1 Column Name</label>
                <input
                  type="text"
                  value={tempCompany1}
                  onChange={(e) => setTempCompany1(e.target.value)}
                  placeholder="e.g. Valmo COD"
                  className="w-full px-3 py-1.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500 font-bold"
                />
              </div>

              <div>
                <label className="text-xs text-slate-300 block mb-1">Company 2 Column Name</label>
                <input
                  type="text"
                  value={tempCompany2}
                  onChange={(e) => setTempCompany2(e.target.value)}
                  placeholder="e.g. Xpressbees COD"
                  className="w-full px-3 py-1.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500 font-bold"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCompanyConfigOpen(false)}
                  className="px-3 py-1.5 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-slate-950 text-xs font-bold shadow"
                >
                  Save Names
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
