import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  PackagePlus, 
  Users, 
  BarChart3, 
  Receipt, 
  Bike, 
  ShieldCheck, 
  RefreshCw, 
  Info,
  Calendar,
  Layers,
  ChevronRight,
  TrendingUp,
  Download,
  Upload,
  CloudDownload,
  Cloud,
  CloudOff,
  CheckCircle2,
  Shield,
  ShieldAlert,
  X,
  Eye,
  Share2,
  Sparkles,
  CreditCard,
  Scale
} from 'lucide-react';
import { copyAppShareLink, SHARE_SUCCESS_MESSAGE } from './utils/shareLink';
import { User, onAuthStateChanged } from 'firebase/auth';
import { auth } from './firebase';
import { 
  syncUserProfile, 
  subscribeToUserData, 
  subscribeToCurrentUserDoc,
  subscribeToDefaultSubscriptionConfig,
  migrateLocalStorageToFirestore,
  saveRiderToFirestore, 
  deleteRiderFromFirestore,
  updateRidersOrderInFirestore,
  saveDeliveryToFirestore, 
  deleteDeliveryFromFirestore,
  batchUpdateDeliveriesAndSettlement,
  batchImportBackupToFirestore,
  isSuperAdmin,
  SUPER_ADMIN_EMAIL,
  normalizeUserPermissions,
  normalizeUserSubscription,
  isEntityOwnedByUser,
  syncPublicRiderStatement
} from './services/firestoreSync';
import { 
  Rider, 
  DeliveryEntry, 
  SettlementRecord, 
  TabType,
  UserPermissions,
  UserRateConfig,
  AppUser,
  DEFAULT_USER_PERMISSIONS,
  DEFAULT_USER_RATE_CONFIG,
  UserSubscription,
  DEFAULT_USER_SUBSCRIPTION,
  checkSubscriptionLock,
  RiderAdvanceEntry,
  PublicRiderStatement
} from './types';
import { RiderLedgerStatement } from './components/RiderLedgerStatement';
import { PublicRiderLedger } from './components/PublicRiderLedger';
import { StatementErrorBoundary } from './components/StatementErrorBoundary';
import { 
  loadRidersFromStorage, 
  saveRidersToStorage, 
  loadDeliveriesFromStorage, 
  saveDeliveriesToStorage,
  loadSettlementsFromStorage,
  saveSettlementsToStorage,
  saveSettingsToStorage,
  loadSettingsFromStorage,
  INITIAL_RIDERS 
} from './utils/storage';
import { downloadJsonBackup, parseBackupFile } from './utils/backup';
import { initKeepAlive } from './utils/keepAlive';
import { PWAInstallBanner } from './components/PWAInstallBanner';
import { DailyEntryTab } from './components/DailyEntryTab';
import { RidersTab } from './components/RidersTab';
import { AnalyticsReportsTab } from './components/AnalyticsReportsTab';
import { SettlementTab } from './components/SettlementTab';
import { AdminDashboardTab } from './components/AdminDashboardTab';
import { DeactivatedScreen } from './components/DeactivatedScreen';
import { PendingApprovalScreen } from './components/PendingApprovalScreen';
import { UserAccountMenu } from './components/UserAccountMenu';
import { AuthModal } from './components/AuthModal';
import { SyncOldAppModal } from './components/SyncOldAppModal';
import { SyncExtractedData } from './services/oldAppSync';
import { getTodayDateString, formatINR } from './utils/formatters';
import { FestivalBannerCard } from './components/FestivalBannerCard';
import { FestivalGreetingsModal } from './components/FestivalGreetingsModal';
import { SubscriptionAlertBanner } from './components/SubscriptionAlertBanner';
import { UserPaymentModal } from './components/UserPaymentModal';
import { PaywallLockScreen } from './components/PaywallLockScreen';
import { LegalPoliciesModal, PolicyTab } from './components/LegalPoliciesModal';
import { PublicComplianceFooter } from './components/PublicComplianceFooter';
import { activateUserPlanImmediately } from './services/razorpayCheckout';

/**
 * Robust Route Resolver for Public Read-Only Rider Statement / Ledger:
 * Supports:
 * - /statement/:riderId
 * - /ledger/:riderId
 * - #statement/:riderId or #/statement/:riderId
 * - ?statement=:riderId or ?riderId=:riderId
 */
function parseRiderStatementRoute(): string | null {
  if (typeof window === 'undefined') return null;

  const hash = window.location.hash || '';
  const pathname = window.location.pathname || '';
  const isStatement = hash.includes('/statement/') || pathname.includes('/statement/');

  if (isStatement) {
    const rawRiderId = hash.includes('/statement/')
      ? hash.split('/statement/')[1]?.split('?')[0]?.split('#')[0]
      : pathname.split('/statement/')[1]?.split('?')[0]?.split('#')[0];
    if (rawRiderId) {
      return decodeURIComponent(rawRiderId).replace(/\/+$/, '').trim() || null;
    }
  }

  // Also support /ledger/ or #/ledger/ fallback
  if (hash.includes('/ledger/') || pathname.includes('/ledger/')) {
    const rawRiderId = hash.includes('/ledger/')
      ? hash.split('/ledger/')[1]?.split('?')[0]?.split('#')[0]
      : pathname.split('/ledger/')[1]?.split('?')[0]?.split('#')[0];
    if (rawRiderId) {
      return decodeURIComponent(rawRiderId).replace(/\/+$/, '').trim() || null;
    }
  }

  // Search query parameter check: ?statement=:riderId or ?ledger=:riderId or ?riderId=:riderId
  const params = new URLSearchParams(window.location.search);
  const query = params.get('statement') || params.get('ledger') || params.get('riderStatement') || params.get('riderId');
  if (query) {
    return decodeURIComponent(query).trim();
  }

  return null;
}

function MainCourierApp() {
  const [activeTab, setActiveTab] = useState<TabType>(() => {
    try {
      const saved = localStorage.getItem('cp_active_tab');
      if (saved && ['entry', 'riders', 'reports', 'settlement', 'festivals', 'admin'].includes(saved)) {
        return saved as TabType;
      }
    } catch {}
    return 'entry';
  });

  // Persist activeTab across refreshes, app switching, and lock/unlock
  useEffect(() => {
    try {
      localStorage.setItem('cp_active_tab', activeTab);
    } catch {}
  }, [activeTab]);

  // Session Stability: Keep active tab in localStorage so screen lock or incoming phone calls do not force a hard reload
  useEffect(() => {
    const handleRestoreTab = () => {
      try {
        const saved = localStorage.getItem('cp_active_tab');
        if (saved && ['entry', 'riders', 'reports', 'settlement', 'festivals', 'admin'].includes(saved)) {
          setActiveTab((prev) => (prev === saved ? prev : (saved as TabType)));
        }
      } catch {}
    };
    window.addEventListener('visibilitychange', handleRestoreTab);
    window.addEventListener('pageshow', handleRestoreTab);
    return () => {
      window.removeEventListener('visibilitychange', handleRestoreTab);
      window.removeEventListener('pageshow', handleRestoreTab);
    };
  }, []);

  const [viewingLedgerRiderId, setViewingLedgerRiderId] = useState<string | null>(null);

  const handleViewLedger = (riderId: string) => {
    setViewingLedgerRiderId(riderId);
  };
  
  // Instant Cache-First initialization: load directly from localStorage in < 50ms!
  const [riders, setRiders] = useState<Rider[]>(() => loadRidersFromStorage());
  const [entries, setEntries] = useState<DeliveryEntry[]>(() => {
    const cachedRiders = loadRidersFromStorage();
    return loadDeliveriesFromStorage(cachedRiders);
  });
  const [settlements, setSettlements] = useState<SettlementRecord[]>(() => loadSettlementsFromStorage());
  const [isInitialized, setIsInitialized] = useState(true);

  // Authentication & Cloud Sync state
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isDeactivated, setIsDeactivated] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [inspectedUser, setInspectedUser] = useState<AppUser | null>(null);
  const [syncStatus, setSyncStatus] = useState<'synced' | 'syncing' | 'offline' | 'local'>('local');
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<'signin' | 'signup'>('signin');
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'info' | 'error' } | null>(null);
  const [connectionBanner, setConnectionBanner] = useState<{ text: string; type: 'connecting' | 'connected' | 'offline' } | null>(null);
  const [isFestivalModalOpen, setIsFestivalModalOpen] = useState(false);
  const [isLegalPoliciesModalOpen, setIsLegalPoliciesModalOpen] = useState(false);
  const [legalPoliciesInitialTab, setLegalPoliciesInitialTab] = useState<PolicyTab>('about');

  const handleOpenLegalPolicies = (tab: PolicyTab = 'about') => {
    setLegalPoliciesInitialTab(tab);
    setIsLegalPoliciesModalOpen(true);
  };

  // User Permissions & Dynamic Rate Config (Admin Overrides)
  const [userPermissions, setUserPermissions] = useState<UserPermissions>(DEFAULT_USER_PERMISSIONS);
  const [userRateConfig, setUserRateConfig] = useState<UserRateConfig>(DEFAULT_USER_RATE_CONFIG);
  const [userSubscription, setUserSubscription] = useState<UserSubscription>(DEFAULT_USER_SUBSCRIPTION);
  const [isUserPaymentModalOpen, setIsUserPaymentModalOpen] = useState(false);
  const [paymentModalReason, setPaymentModalReason] = useState<string | undefined>(undefined);
  const [masterQrCodeUrl, setMasterQrCodeUrl] = useState<string>('');
  const [hasAutoOpenedPaymentModal, setHasAutoOpenedPaymentModal] = useState<string | null>(null);

  const openSubscriptionModal = (reason?: string) => {
    setPaymentModalReason(reason);
    setIsUserPaymentModalOpen(true);
  };

  // Real-time in-app statement compilation for instant 0ms Khatabook view
  const inAppLedgerInitialStatement = useMemo<PublicRiderStatement | null>(() => {
    if (!viewingLedgerRiderId) return null;
    const r = riders.find((x) => x.id === viewingLedgerRiderId);
    if (!r) return null;
    return {
      riderId: r.id,
      riderName: r.name,
      riderPhone: r.phone,
      vehicleType: r.vehicleType,
      hubName: userRateConfig.hubSignature || 'सरायकेला कूरियर डिलीवरी हब',
      hubSignature: userRateConfig.hubSignature || '',
      totalAdvance: typeof r.totalAdvance === 'number' ? r.totalAdvance : 0,
      advances: r.advances || [],
      salaries: settlements
        .filter((s) => s.riderId === r.id)
        .map((s) => ({
          id: s.id,
          startDate: s.startDate,
          endDate: s.endDate,
          totalParcels: s.totalParcels,
          baseAmount: s.baseAmount,
          incentiveAmount: s.incentiveAmount,
          grossTotal: s.grossTotal,
          advanceAmount: s.advanceAmount || 0,
          netTotal: s.netTotal,
          paidAt: s.paidAt,
          status: s.status || 'PAID',
        })),
      recentDeliveries: entries
        .filter((e) => e.riderId === r.id)
        .slice(0, 100)
        .map((e) => ({
          id: e.id,
          date: e.date,
          parcels: e.parcels,
          totalEarnings: e.totalEarnings,
          status: e.status,
          settlementId: e.settlementId,
        })),
      updatedAt: new Date().toISOString(),
    };
  }, [viewingLedgerRiderId, riders, settlements, entries, userRateConfig]);

  // Subscribe to system default subscription config to obtain Master Admin's UPI QR Code
  useEffect(() => {
    const unsubscribe = subscribeToDefaultSubscriptionConfig((config) => {
      if (config.qrCodeUrl) {
        setMasterQrCodeUrl(config.qrCodeUrl);
      }
    });
    return () => unsubscribe();
  }, []);

  // Reset auto-popup tracker when user logs out
  useEffect(() => {
    if (!currentUser) {
      setHasAutoOpenedPaymentModal(null);
    }
  }, [currentUser]);

  // User Profile from Firestore all_users collection
  const [userProfile, setUserProfile] = useState<{
    status: 'pending' | 'active' | 'approved' | 'deactivated' | 'blocked' | 'rejected';
    validUntil?: string;
    displayName?: string;
    name?: string;
    isPro?: boolean;
  } | null>(null);

  // Automatic Expiry Cut-Off ticker: ticks every 5 seconds to ensure instant automatic cut-off
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(Date.now());
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  // Strict Master Admin Verification (Requirement 1)
  const isSuperAdminUser = Boolean(
    currentUser?.email && currentUser.email.trim().toLowerCase() === 'pawankabiseraikella@gmail.com'
  );
  const isAdmin = isSuperAdminUser;

  // Strict Validity Calculation & Hard Paywall Gate (Requirement 1):
  // const now = new Date().getTime();
  // const expiryTime = userProfile?.validUntil ? new Date(userProfile.validUntil).getTime() : 0;
  // const isExpired = !expiryTime || now > expiryTime;
  // const isPendingApproval = userProfile?.status !== 'approved';
  // const isSuperAdminUser = currentUser.email === 'pawankabiseraikella@gmail.com';
  const now = currentTime;
  const expiryTime = userProfile?.validUntil
    ? new Date(userProfile.validUntil).getTime()
    : (userProfile as any)?.planExpiresAt
    ? new Date((userProfile as any).planExpiresAt).getTime()
    : userSubscription?.validUntil
    ? new Date(userSubscription.validUntil).getTime()
    : (typeof window !== 'undefined' && localStorage.getItem('cp_plan_expires_at')
    ? new Date(localStorage.getItem('cp_plan_expires_at')!).getTime()
    : 0);

  // Freemium / Pro Status Evaluator
  const isProUser = Boolean(
    isSuperAdminUser ||
    userProfile?.isPro === true ||
    userSubscription?.isPro === true ||
    (userSubscription?.planType === 'paid' &&
      userSubscription?.paymentStatus === 'active' &&
      (!userSubscription.validUntil || new Date(userSubscription.validUntil).getTime() > now)) ||
    (typeof window !== 'undefined' && (
      localStorage.getItem('isPro') === 'true' ||
      localStorage.getItem('subscriptionStatus') === 'active' ||
      localStorage.getItem('cp_current_is_pro') === 'true' ||
      (currentUser && localStorage.getItem(`cp_is_pro_${currentUser.uid}`) === 'true')
    ))
  );

  const isExpired = isProUser ? (expiryTime > 0 && now > expiryTime) : (!expiryTime || now > expiryTime);
  const isPendingApproval = isProUser ? false : (userProfile ? (userProfile.status !== 'approved' && userProfile.status !== 'active') : true);

  // 3-Day Expiry Warning Banner Calculation (Requirement 2):
  // const daysLeft = Math.ceil((expiryTime - now) / (1000 * 60 * 60 * 24));
  const daysLeft = expiryTime > now ? Math.ceil((expiryTime - now) / (1000 * 60 * 60 * 24)) : 0;

  // Strict Subscription Lock Check: Only blocks paid users who have expired or need verification
  const subscriptionLock = useMemo(() => {
    return checkSubscriptionLock(userSubscription, isSuperAdminUser);
  }, [userSubscription, isSuperAdminUser]);

  const isPaywallLocked = Boolean(
    currentUser &&
    !isSuperAdminUser &&
    !isProUser &&
    userSubscription?.planType === 'paid' &&
    subscriptionLock.isLocked
  );

  // Automatic Popup on Login for Expiring Soon warnings (if not locked)
  useEffect(() => {
    if (!currentUser || isSuperAdminUser || !userSubscription) return;
    if (userSubscription.planType === 'paid' && (userSubscription.paymentStatus === 'expiring_soon' || (daysLeft <= 3 && daysLeft > 0))) {
      if (hasAutoOpenedPaymentModal !== currentUser.uid) {
        setIsUserPaymentModalOpen(true);
        setHasAutoOpenedPaymentModal(currentUser.uid);
      }
    }
  }, [currentUser?.uid, userSubscription?.paymentStatus, userSubscription?.planType, isSuperAdminUser, hasAutoOpenedPaymentModal, daysLeft]);

  // Derived capability flags
  const canAccessDailyEntry = isSuperAdminUser || Boolean(userPermissions.dailyEntry ?? userPermissions.canAccessDailyEntry);
  const canAccessRiders = isSuperAdminUser || Boolean(userPermissions.riders ?? userPermissions.canAccessRiders);
  const canAccessReports = isSuperAdminUser || Boolean(userPermissions.reports ?? userPermissions.canAccessReports);
  const canAccessIncentives = isSuperAdminUser || Boolean(userPermissions.incentives ?? userPermissions.canAccessIncentives);
  const canAccessFestivalGreetings = isSuperAdminUser || Boolean(userPermissions.festivalGreetings ?? userPermissions.canAccessFestivalGreetings);
  const canExportData = isSuperAdminUser || Boolean(userPermissions.canExportData);

  // Derived active hub name (Admin configured or fallback)
  const activeHubName = useMemo(() => {
    const raw =
      (currentUser as any)?.hubName ||
      userRateConfig?.hubSignature ||
      (userProfile as any)?.hubSignature ||
      (userProfile as any)?.displayName ||
      inspectedUser?.hubSignature ||
      currentUser?.displayName ||
      '';
    const trimmed = (raw || '').trim();
    return trimmed.length > 0 ? trimmed : 'सरायकेला कूरियर हब';
  }, [currentUser, userRateConfig?.hubSignature, userProfile, inspectedUser?.hubSignature]);

  // Auto-redirect if current tab becomes restricted or if non-superadmin tries to access admin
  useEffect(() => {
    if (!isSuperAdminUser && activeTab === 'admin') {
      setActiveTab('entry');
      return;
    }

    if (isSuperAdminUser) return;
    if (activeTab === 'entry' && !canAccessDailyEntry) {
      if (canAccessRiders) setActiveTab('riders');
      else if (canAccessReports) setActiveTab('reports');
    } else if (activeTab === 'riders' && !canAccessRiders) {
      if (canAccessDailyEntry) setActiveTab('entry');
      else if (canAccessReports) setActiveTab('reports');
    } else if ((activeTab === 'reports' || activeTab === 'settlement') && !canAccessReports) {
      if (canAccessDailyEntry) setActiveTab('entry');
      else if (canAccessRiders) setActiveTab('riders');
    } else if (activeTab === 'festivals' && !canAccessFestivalGreetings) {
      if (canAccessDailyEntry) setActiveTab('entry');
      else if (canAccessRiders) setActiveTab('riders');
      else if (canAccessReports) setActiveTab('reports');
    }
  }, [activeTab, canAccessDailyEntry, canAccessRiders, canAccessReports, canAccessFestivalGreetings, isSuperAdminUser]);

  // KeepAlive initialization for cold start resilience and background recovery
  useEffect(() => {
    const cleanup = initKeepAlive({
      auth,
      onStateChange: (state) => {
        if (state === 'connecting') {
          setSyncStatus('syncing');
          setConnectionBanner({ text: 'Connecting to live server...', type: 'connecting' });
        } else if (state === 'connected') {
          setSyncStatus('synced');
          setConnectionBanner({ text: 'Connected to live server', type: 'connected' });
          setTimeout(() => {
            setConnectionBanner((prev) => (prev?.type === 'connected' ? null : prev));
          }, 2500);
        } else if (state === 'offline') {
          setSyncStatus('offline');
          setConnectionBanner({ text: 'Operating in local offline cache', type: 'offline' });
        }
      },
      onWakeup: () => {
        // Safe background reconnection: do not wipe or overwrite active in-memory state or open modals
      },
    });

    return () => cleanup();
  }, [currentUser]);

  // Auto-dismiss toast
  useEffect(() => {
    if (!toastMessage) return;
    const timer = setTimeout(() => {
      setToastMessage(null);
    }, 5000);
    return () => clearTimeout(timer);
  }, [toastMessage]);

  // Force-refresh counter for instantly re-mounting/populating components on backup restore
  const [restoreRefreshKey, setRestoreRefreshKey] = useState(0);

  // Download Backup handler
  const handleDownloadBackup = () => {
    downloadJsonBackup({
      userEmail: currentUser?.email,
      riders,
      entries,
      settlements,
      settings: userRateConfig,
    });
    setToastMessage({
      text: `Backup downloaded: ${entries.length} deliveries, ${riders.length} riders, ${settlements.length} settlements saved to your device.`,
      type: 'success',
    });
  };

  // Direct Restore Backup handler (file picker -> load riders & entries -> sync to Firestore & local storage)
  const restoreFileInputRef = React.useRef<HTMLInputElement>(null);
  const [isRestoringBackup, setIsRestoringBackup] = useState(false);
  const [isSyncOldAppModalOpen, setIsSyncOldAppModalOpen] = useState(false);

  const handleRestoreBackupFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset input so same file can be re-selected if needed
    e.target.value = '';

    setIsRestoringBackup(true);
    try {
      const parsed = await parseBackupFile(file);
      const targetUserId = inspectedUser ? inspectedUser.uid : (currentUser?.uid || 'guest');
      const targetUserEmail = inspectedUser ? inspectedUser.email : (currentUser?.email || null);

      // Explicitly stamp all imported entities with active workspace ownership
      const stampedRiders = parsed.riders.map((r, i) => ({
        ...r,
        createdBy: targetUserId,
        createdByEmail: targetUserEmail || '',
        workspaceId: targetUserId,
        userId: targetUserId,
        order: typeof r.order === 'number' ? r.order : i,
      }));

      const stampedEntries = parsed.entries.map((entry) => ({
        ...entry,
        createdBy: targetUserId,
        createdByEmail: targetUserEmail || '',
        workspaceId: targetUserId,
        userId: targetUserId,
      }));

      const stampedSettlements = parsed.settlements.map((s) => ({
        ...s,
        createdBy: targetUserId,
        createdByEmail: targetUserEmail || '',
        workspaceId: targetUserId,
        userId: targetUserId,
      }));

      const importedSettings = parsed.settings;

      // 1. Immediately parse riders, entries, and settings directly into localStorage
      saveRidersToStorage(stampedRiders, targetUserId);
      saveDeliveriesToStorage(stampedEntries, targetUserId);
      saveSettlementsToStorage(stampedSettlements, targetUserId);

      // Also ensure generic key is updated for offline access
      saveRidersToStorage(stampedRiders);
      saveDeliveriesToStorage(stampedEntries);
      saveSettlementsToStorage(stampedSettlements);

      if (importedSettings) {
        saveSettingsToStorage(importedSettings, targetUserId);
        saveSettingsToStorage(importedSettings);
      }

      // Clear any prior temporary draft so the Daily Entry dropdown immediately picks up the new restored rider
      try {
        localStorage.removeItem('courier_daily_entry_draft_v1');
      } catch {}

      // 2. Immediately update current React state & force-refresh so Riders tab and Daily Entry dropdown immediately populate
      setRiders([...stampedRiders]);
      setEntries([...stampedEntries]);
      setSettlements([...stampedSettlements]);
      if (importedSettings) {
        setUserRateConfig((prev) => ({ ...prev, ...importedSettings }));
      }

      // Trigger re-mount/re-evaluation key
      setRestoreRefreshKey((prev) => prev + 1);

      // 3. If authenticated, directly import all riders, entries, and settlements into Firestore database in background
      let dbNotice = '';
      if (targetUserId && targetUserId !== 'guest') {
        setSyncStatus('syncing');
        await batchImportBackupToFirestore(
          targetUserId,
          stampedRiders,
          stampedEntries,
          stampedSettlements,
          importedSettings,
          targetUserEmail
        );
        setSyncStatus('synced');
        dbNotice = ' & synced to cloud database';
      }

      // 4. Show success toast with exact count of restored riders
      const entriesNotice = stampedEntries.length > 0 ? `, ${stampedEntries.length} entries` : '';
      const settlementsNotice = stampedSettlements.length > 0 ? `, and ${stampedSettlements.length} settlements` : '';
      setToastMessage({
        text: `Successfully restored ${stampedRiders.length} riders${entriesNotice}${settlementsNotice}${dbNotice}!`,
        type: 'success',
      });
    } catch (err: any) {
      console.warn('Backup restore info:', err);
      setToastMessage({
        text: err?.message || 'Failed to restore backup file. Please select a valid Courier Rider Payout JSON backup file.',
        type: 'error',
      });
    } finally {
      setIsRestoringBackup(false);
    }
  };

  /**
   * Sync from Old App URL Handler:
   * Takes extracted 13+ riders, delivery entries, and settlements, stamps them with current workspace
   * ownership, updates React state, saves locally, and syncs atomically to Firestore.
   */
  const handleConfirmSyncOldApp = async (data: SyncExtractedData) => {
    const targetUserId = inspectedUser ? inspectedUser.uid : (currentUser?.uid || 'guest');
    const targetUserEmail = inspectedUser ? inspectedUser.email : (currentUser?.email || null);

    // 1. Stamp all extracted entities with active workspace ownership
    const stampedRiders = data.riders.map((r, i) => ({
      ...r,
      createdBy: targetUserId,
      createdByEmail: targetUserEmail || '',
      workspaceId: targetUserId,
      userId: targetUserId,
      order: typeof r.order === 'number' ? r.order : i,
    }));

    const stampedEntries = data.entries.map((entry) => ({
      ...entry,
      createdBy: targetUserId,
      createdByEmail: targetUserEmail || '',
      workspaceId: targetUserId,
      userId: targetUserId,
    }));

    const stampedSettlements = data.settlements.map((s) => ({
      ...s,
      createdBy: targetUserId,
      createdByEmail: targetUserEmail || '',
      workspaceId: targetUserId,
      userId: targetUserId,
    }));

    // 2. Persist locally to storage immediately (both scoped and fallback)
    saveRidersToStorage(stampedRiders, targetUserId);
    saveDeliveriesToStorage(stampedEntries, targetUserId);
    saveSettlementsToStorage(stampedSettlements, targetUserId);

    saveRidersToStorage(stampedRiders);
    saveDeliveriesToStorage(stampedEntries);
    saveSettlementsToStorage(stampedSettlements);

    if (data.settings) {
      saveSettingsToStorage(data.settings, targetUserId);
      saveSettingsToStorage(data.settings);
    }

    try {
      localStorage.removeItem('courier_daily_entry_draft_v1');
    } catch {}

    // 3. Immediately update React state & trigger immediate view re-render
    setRiders([...stampedRiders]);
    setEntries([...stampedEntries]);
    setSettlements([...stampedSettlements]);
    if (data.settings) {
      setUserRateConfig((prev) => ({ ...prev, ...data.settings }));
    }

    // Force re-mount of Daily Entry dropdown & tables
    setRestoreRefreshKey((prev) => prev + 1);

    // 4. If authenticated, permanently save to Firestore database
    let cloudNotice = '';
    if (targetUserId && targetUserId !== 'guest') {
      setSyncStatus('syncing');
      await batchImportBackupToFirestore(
        targetUserId,
        stampedRiders,
        stampedEntries,
        stampedSettlements,
        data.settings,
        targetUserEmail
      );
      setSyncStatus('synced');
      cloudNotice = ' & permanently saved to database';
    }

    setToastMessage({
      text: `Successfully imported ${stampedRiders.length} riders and ${stampedEntries.length} delivery history logs${cloudNotice}!`,
      type: 'success',
    });
  };

  const lastAuthUidRef = useRef<string | null | undefined>(undefined);

  // Initialize data and listen to Firebase Auth & Firestore changes
  useEffect(() => {
    let unsubscribeFirestore: (() => void) | null = null;
    let unsubscribeUserDoc: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      const newUid = user ? user.uid : null;

      // Prevent full app unmounting or state resets when auth callback fires for the SAME user
      // (e.g. phone lock/unlock, network reconnect, background tab resume, or token refresh)
      if (lastAuthUidRef.current !== undefined && lastAuthUidRef.current === newUid) {
        setCurrentUser(user);
        return;
      }

      lastAuthUidRef.current = newUid;
      setCurrentUser(user);

      if (unsubscribeFirestore) {
        unsubscribeFirestore();
        unsubscribeFirestore = null;
      }
      if (unsubscribeUserDoc) {
        unsubscribeUserDoc();
        unsubscribeUserDoc = null;
      }

      if (user) {
        setSyncStatus('syncing');

        // 1. Immediately load user-specific cached local data (0ms latency, no blocking)
        // Strictly filter out any records created by external Gmail accounts
        const rawCachedRiders = loadRidersFromStorage(user.uid);
        const cachedRiders = rawCachedRiders.filter((r) => isEntityOwnedByUser(r, user.uid, user.email));
        const allowedRiderIds = new Set(cachedRiders.map((r) => r.id));

        const rawCachedDeliveries = loadDeliveriesFromStorage(cachedRiders, user.uid);
        const cachedDeliveries = rawCachedDeliveries.filter((d) => {
          if (d.riderId && !allowedRiderIds.has(d.riderId)) return false;
          return isEntityOwnedByUser(d, user.uid, user.email);
        });

        const rawCachedSettlements = loadSettlementsFromStorage(user.uid);
        const cachedSettlements = rawCachedSettlements.filter((s) => {
          if (s.riderId && !allowedRiderIds.has(s.riderId)) return false;
          return isEntityOwnedByUser(s, user.uid, user.email);
        });

        setRiders(cachedRiders);
        setEntries(cachedDeliveries);
        setSettlements(cachedSettlements);
        setIsInitialized(true);

        // 2. Real-time subscription to user document in all_users (immediate status, rateConfig, and permissions)
        unsubscribeUserDoc = subscribeToCurrentUserDoc(user.uid, user.email, (docData) => {
          setUserProfile({
            status: docData.status,
            validUntil: docData.validUntil,
            displayName: user.displayName || undefined,
            name: user.displayName || undefined,
          });

          if (docData.isPending) {
            setIsPending(true);
            setIsDeactivated(false);
          } else if (docData.isBlocked) {
            setIsPending(false);
            setIsDeactivated(true);
          } else {
            setIsPending(false);
            setIsDeactivated(false);
          }

          if (docData.permissions) {
            setUserPermissions(normalizeUserPermissions(docData.permissions));
          }
          if (docData.rateConfig) {
            setUserRateConfig({ ...DEFAULT_USER_RATE_CONFIG, ...docData.rateConfig });
          }
          if (docData.subscription) {
            setUserSubscription(normalizeUserSubscription(docData.subscription));
          }
        });

        // 3. Sync user profile with Firestore in background & check status
        syncUserProfile(user).then((profileResult) => {
          setUserProfile({
            status: profileResult.status,
            validUntil: profileResult.validUntil,
            displayName: user.displayName || undefined,
            name: user.displayName || undefined,
          });

          if (profileResult.subscription) {
            setUserSubscription(normalizeUserSubscription(profileResult.subscription));
          }
          if (profileResult.isPending) {
            setIsPending(true);
            setIsDeactivated(false);
          } else if (profileResult.isDeactivated || profileResult.isBlocked) {
            setIsPending(false);
            setIsDeactivated(true);
            setSyncStatus('offline');
          } else {
            setIsPending(false);
            setIsDeactivated(false);
          }

          // 4. Pro vs Freemium Gate:
          // Free tier users store riders & parcels locally only (NO Firebase cloud sync for free tier).
          // Pro users unlock full Firebase cloud synchronization and multi-device backup.
          const isCurrentPro = Boolean(
            profileResult.isPro === true ||
            profileResult.subscription?.isPro === true ||
            (profileResult.subscription?.planType === 'paid' && profileResult.subscription?.paymentStatus === 'active') ||
            (typeof window !== 'undefined' && (localStorage.getItem('cp_current_is_pro') === 'true' || localStorage.getItem(`cp_is_pro_${user.uid}`) === 'true'))
          );

          if (isCurrentPro) {
            migrateLocalStorageToFirestore(user.uid).catch((migErr) => {
              console.error('Migration error:', migErr);
            });

            unsubscribeFirestore = subscribeToUserData(
              user.uid,
              {
                onRiders: (newRiders) => {
                  const userRiders = newRiders.filter((r) => isEntityOwnedByUser(r, user.uid, user.email));
                  setRiders(userRiders);
                  saveRidersToStorage(userRiders, user.uid);
                  setSyncStatus('synced');
                },
                onDeliveries: (newDeliveries) => {
                  const userDeliveries = newDeliveries.filter((d) => isEntityOwnedByUser(d, user.uid, user.email));
                  setEntries(userDeliveries);
                  saveDeliveriesToStorage(userDeliveries, user.uid);
                  setSyncStatus('synced');
                },
                onSettlements: (newSettlements) => {
                  const userSettlements = newSettlements.filter((s) => isEntityOwnedByUser(s, user.uid, user.email));
                  setSettlements(userSettlements);
                  saveSettlementsToStorage(userSettlements, user.uid);
                  setSyncStatus('synced');
                },
                onError: (err) => {
                  console.error('Firestore sync error:', err);
                  setSyncStatus('offline');
                },
              },
              user.email
            );
          } else {
            setSyncStatus('local');
          }
        }).catch((err) => {
          console.error('Error in syncUserProfile background task:', err);
        });
      } else {
        // Logged out / Local mode
        setUserProfile(null);
        setIsDeactivated(false);
        setIsPending(false);
        setInspectedUser(null);
        setUserPermissions(DEFAULT_USER_PERMISSIONS);
        setUserRateConfig(DEFAULT_USER_RATE_CONFIG);
        setActiveTab((prev) => (prev === 'admin' ? 'entry' : prev));
        setSyncStatus('local');
        const loadedRiders = loadRidersFromStorage();
        const loadedDeliveries = loadDeliveriesFromStorage(loadedRiders);
        const loadedSettlements = loadSettlementsFromStorage();
        setRiders(loadedRiders);
        setEntries(loadedDeliveries);
        setSettlements(loadedSettlements);
      }
      setIsInitialized(true);
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeFirestore) {
        unsubscribeFirestore();
      }
      if (unsubscribeUserDoc) {
        unsubscribeUserDoc();
      }
    };
  }, []);

  // Global listener for instant Razorpay plan activation event
  useEffect(() => {
    const handlePlanActivated = (e: any) => {
      const detail = e.detail;
      if (!detail) return;
      if (detail.subscription) {
        setUserSubscription(detail.subscription);
      }
      setUserProfile((prev) => ({
        ...(prev || {}),
        status: 'approved',
        validUntil: detail.validUntil,
        isPro: true,
        displayName: currentUser?.displayName || prev?.displayName,
        name: currentUser?.displayName || prev?.name,
      }));
      setIsPending(false);
      setIsDeactivated(false);
      setActiveTab('entry');
    };

    window.addEventListener('courier-payout:plan-activated', handlePlanActivated);
    return () => {
      window.removeEventListener('courier-payout:plan-activated', handlePlanActivated);
    };
  }, [currentUser]);

  // Check URL parameters for return from mobile UPI app upon WebView reload
  useEffect(() => {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const hashParams = new URLSearchParams(window.location.hash.substring(1));
      const urlPaymentId = urlParams.get('razorpay_payment_id') || hashParams.get('razorpay_payment_id');

      if (urlPaymentId && currentUser) {
        console.log('App detected razorpay_payment_id from return URL:', urlPaymentId);
        const pendingRaw = localStorage.getItem('cp_pending_checkout');
        const pending = pendingRaw ? JSON.parse(pendingRaw) : null;
        const targetPlanId = pending?.planId || 'growth';

        activateUserPlanImmediately(
          currentUser.uid,
          targetPlanId,
          urlPaymentId,
          currentUser.email
        ).then((res) => {
          setUserSubscription(res.subscription);
          setUserProfile((prev) => ({
            ...(prev || {}),
            status: 'approved',
            validUntil: res.validUntil,
            isPro: true,
            displayName: currentUser?.displayName || prev?.displayName,
            name: currentUser?.displayName || prev?.name,
          }));
          setIsPending(false);
          setIsDeactivated(false);
          setActiveTab('entry');

          const cleanUrl = window.location.pathname;
          window.history.replaceState({}, document.title, cleanUrl);
        }).catch((err) => {
          console.error('Error auto-activating from return URL parameter:', err);
        });
      }
    } catch (e) {
      console.warn('URL parameter check warning:', e);
    }
  }, [currentUser]);

  // Target user id: regular user's UID or the inspected user's UID when Super Admin is in inspection mode
  const targetUid = inspectedUser ? inspectedUser.uid : currentUser?.uid;

  // Save changes locally (user-scoped)
  const updateRiders = (newRiders: Rider[]) => {
    setRiders(newRiders);
    saveRidersToStorage(newRiders, targetUid);
  };

  const updateEntries = (newEntries: DeliveryEntry[]) => {
    setEntries(newEntries);
    saveDeliveriesToStorage(newEntries, targetUid);
  };

  // Add Delivery Entry
  const handleAddEntry = async (entryData: Omit<DeliveryEntry, 'id' | 'createdAt'>) => {
    const currentOwnerId = inspectedUser ? inspectedUser.uid : (currentUser?.uid || 'guest');
    const currentOwnerEmail = inspectedUser ? (inspectedUser.email || '') : (currentUser?.email || '');
    const newEntry: DeliveryEntry = {
      ...entryData,
      id: `del_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      createdAt: new Date().toISOString(),
      createdBy: currentOwnerId,
      createdByEmail: currentOwnerEmail,
      workspaceId: currentOwnerId,
      userId: currentOwnerId,
    };
    const updated = [newEntry, ...entries];
    updateEntries(updated);

    if (isProUser && targetUid) {
      setSyncStatus('syncing');
      try {
        await saveDeliveryToFirestore(targetUid, newEntry, currentOwnerEmail);
        setSyncStatus('synced');
      } catch (err) {
        console.error('Error saving delivery to Firestore', err);
      }
    } else {
      setSyncStatus('local');
    }
  };

  // Update Delivery Entry
  const handleUpdateEntry = async (updatedEntry: DeliveryEntry) => {
    const currentOwnerId = inspectedUser ? inspectedUser.uid : (currentUser?.uid || 'guest');
    const currentOwnerEmail = inspectedUser ? (inspectedUser.email || '') : (currentUser?.email || '');
    const entryWithOwnership: DeliveryEntry = {
      ...updatedEntry,
      createdBy: updatedEntry.createdBy || currentOwnerId,
      createdByEmail: updatedEntry.createdByEmail || currentOwnerEmail,
      workspaceId: updatedEntry.workspaceId || currentOwnerId,
      userId: updatedEntry.userId || currentOwnerId,
    };
    const updated = entries.map((e) => (e.id === updatedEntry.id ? entryWithOwnership : e));
    updateEntries(updated);

    if (isProUser && targetUid) {
      setSyncStatus('syncing');
      try {
        await saveDeliveryToFirestore(targetUid, entryWithOwnership, currentOwnerEmail);
        setSyncStatus('synced');
      } catch (err) {
        console.error('Error updating delivery to Firestore', err);
      }
    } else {
      setSyncStatus('local');
    }
  };

  // Delete Delivery Entry
  const handleDeleteEntry = async (id: string) => {
    const updated = entries.filter((e) => e.id !== id);
    updateEntries(updated);

    if (isProUser && targetUid) {
      setSyncStatus('syncing');
      try {
        await deleteDeliveryFromFirestore(targetUid, id);
        setSyncStatus('synced');
      } catch (err) {
        console.error('Error deleting delivery from Firestore', err);
      }
    } else {
      setSyncStatus('local');
    }
  };

  // Add Rider
  const handleAddRider = async (riderData: Omit<Rider, 'id' | 'joinedDate'>) => {
    const nextOrder = riders.length > 0 
      ? Math.max(...riders.map((r, idx) => (typeof r.order === 'number' ? r.order : idx))) + 1 
      : 0;
    const currentOwnerId = inspectedUser ? inspectedUser.uid : (currentUser?.uid || 'guest');
    const currentOwnerEmail = inspectedUser ? (inspectedUser.email || '') : (currentUser?.email || '');
    const newRider: Rider = {
      ...riderData,
      id: `rider_${Date.now()}`,
      joinedDate: getTodayDateString(),
      order: nextOrder,
      createdBy: currentOwnerId,
      createdByEmail: currentOwnerEmail,
      workspaceId: currentOwnerId,
      userId: currentOwnerId,
    };
    const updated = [...riders, newRider];
    updateRiders(updated);

    if (isProUser && targetUid) {
      setSyncStatus('syncing');
      try {
        await saveRiderToFirestore(targetUid, newRider, currentOwnerEmail);
        setSyncStatus('synced');
      } catch (err) {
        console.error('Error saving rider to Firestore', err);
      }
    } else {
      setSyncStatus('local');
    }
  };

  // Reorder Riders
  const handleReorderRiders = async (reorderedRiders: Rider[]) => {
    const indexedRiders = reorderedRiders.map((r, index) => ({
      ...r,
      order: index,
    }));
    updateRiders(indexedRiders);

    if (isProUser && targetUid) {
      setSyncStatus('syncing');
      try {
        await updateRidersOrderInFirestore(targetUid, indexedRiders);
        setSyncStatus('synced');
      } catch (err) {
        console.error('Error saving reordered riders to Firestore', err);
      }
    } else {
      setSyncStatus('local');
    }
  };

  // Update Rider
  const handleUpdateRider = async (updatedRider: Rider) => {
    const currentOwnerId = inspectedUser ? inspectedUser.uid : (currentUser?.uid || 'guest');
    const currentOwnerEmail = inspectedUser ? (inspectedUser.email || '') : (currentUser?.email || '');
    const riderWithOwnership: Rider = {
      ...updatedRider,
      createdBy: updatedRider.createdBy || currentOwnerId,
      createdByEmail: updatedRider.createdByEmail || currentOwnerEmail,
      workspaceId: updatedRider.workspaceId || currentOwnerId,
      userId: updatedRider.userId || currentOwnerId,
    };
    const updated = riders.map((r) => (r.id === updatedRider.id ? riderWithOwnership : r));
    updateRiders(updated);

    // Also update rider name in entries
    const updatedEntries = entries.map((e) =>
      e.riderId === updatedRider.id
        ? { ...e, riderName: updatedRider.name, riderPhone: updatedRider.phone }
        : e
    );
    updateEntries(updatedEntries);

    if (isProUser && targetUid) {
      setSyncStatus('syncing');
      try {
        await saveRiderToFirestore(targetUid, riderWithOwnership, currentOwnerEmail);
        const affectedEntries = updatedEntries.filter((e) => e.riderId === updatedRider.id);
        if (affectedEntries.length > 0) {
          await batchUpdateDeliveriesAndSettlement(targetUid, affectedEntries, undefined, currentOwnerEmail);
        }
        setSyncStatus('synced');
      } catch (err) {
        console.error('Error updating rider in Firestore', err);
      }
    } else {
      setSyncStatus('local');
    }
  };

  // Delete Rider
  const handleDeleteRider = async (id: string) => {
    const updated = riders.filter((r) => r.id !== id);
    updateRiders(updated);

    if (isProUser && targetUid) {
      setSyncStatus('syncing');
      try {
        await deleteRiderFromFirestore(targetUid, id);
        setSyncStatus('synced');
      } catch (err) {
        console.error('Error deleting rider from Firestore', err);
      }
    } else {
      setSyncStatus('local');
    }
  };

  // Mark all entries as Paid with optional advance deduction
  const handleMarkEntriesPaid = async (
    entryIds: string[],
    advanceAmount: number = 0,
    advanceDate?: string,
    settlementDetails?: {
      riderId: string;
      riderName: string;
      riderPhone: string;
      startDate: string;
      endDate: string;
      totalParcels: number;
      baseAmount: number;
      incentiveAmount: number;
      grossTotal: number;
    }
  ) => {
    const nowIso = new Date().toISOString();
    const settlementId = `settle_${Date.now()}`;
    const currentOwnerId = inspectedUser ? inspectedUser.uid : (currentUser?.uid || 'guest');
    const currentOwnerEmail = inspectedUser ? (inspectedUser.email || '') : (currentUser?.email || '');

    const changedEntries: DeliveryEntry[] = [];
    const updated = entries.map((e) => {
      if (entryIds.includes(e.id)) {
        const changed: DeliveryEntry = {
          ...e,
          status: 'Paid' as const,
          paidAt: nowIso,
          advanceAmount: advanceAmount,
          advanceDate: advanceDate || undefined,
          settlementId: settlementId,
          createdBy: e.createdBy || currentOwnerId,
          createdByEmail: e.createdByEmail || currentOwnerEmail,
          workspaceId: e.workspaceId || currentOwnerId,
          userId: e.userId || currentOwnerId,
        };
        changedEntries.push(changed);
        return changed;
      }
      return e;
    });
    updateEntries(updated);

    let newSettlement: SettlementRecord | undefined;
    if (settlementDetails) {
      newSettlement = {
        id: settlementId,
        riderId: settlementDetails.riderId,
        riderName: settlementDetails.riderName,
        riderPhone: settlementDetails.riderPhone,
        startDate: settlementDetails.startDate,
        endDate: settlementDetails.endDate,
        entryIds,
        totalParcels: settlementDetails.totalParcels,
        baseAmount: settlementDetails.baseAmount,
        incentiveAmount: settlementDetails.incentiveAmount,
        grossTotal: settlementDetails.grossTotal,
        advanceAmount: advanceAmount,
        advanceDate: advanceDate || undefined,
        advanceReason: (settlementDetails as any).advanceReason || undefined,
        netTotal: settlementDetails.grossTotal - advanceAmount,
        paidAt: nowIso,
        status: 'PAID',
        createdBy: currentOwnerId,
        createdByEmail: currentOwnerEmail,
        workspaceId: currentOwnerId,
        userId: currentOwnerId,
      };
      const updatedSettlements = [newSettlement, ...settlements];
      setSettlements(updatedSettlements);
      saveSettlementsToStorage(updatedSettlements, targetUid);

      // Auto-deduct advance from rider running total if advance was deducted in settlement
      if (advanceAmount > 0) {
        const targetRider = riders.find((r) => r.id === settlementDetails.riderId);
        if (targetRider) {
          const currentAdv = Number(targetRider.totalAdvance) || 0;
          const gross = Number(settlementDetails.grossTotal) || 0;
          // If gross >= advanceAmount: entire advance deducted, remaining is Math.max(0, currentAdv - advanceAmount)
          // If gross < advanceAmount: advance exceeds gross, recovery due remains (advanceAmount - gross)
          const remainingAdv = gross >= advanceAmount
            ? Math.max(0, currentAdv - advanceAmount)
            : Math.max(0, advanceAmount - gross);

          const deductedPortion = Math.min(advanceAmount, gross);
          const advanceLogs = targetRider.advances ? [...targetRider.advances] : [];
          if (deductedPortion > 0) {
            advanceLogs.unshift({
              id: `settle_adj_${Date.now()}`,
              riderId: targetRider.id,
              amount: -deductedPortion,
              date: advanceDate || settlementDetails.endDate,
              reason: (settlementDetails as any).advanceReason
                ? `सेटलमेंट समायोजन: ${(settlementDetails as any).advanceReason}`
                : `सेटलमेंट समायोजन (${settlementDetails.startDate} से ${settlementDetails.endDate})`,
              runningBalance: remainingAdv,
              createdAt: nowIso,
              createdBy: currentOwnerId,
              settlementId: settlementId,
            });
          }

          const updatedRider: Rider = {
            ...targetRider,
            totalAdvance: remainingAdv,
            advances: advanceLogs,
          };
          const updatedRiders = riders.map((r) => (r.id === targetRider.id ? updatedRider : r));
          setRiders(updatedRiders);
          saveRidersToStorage(updatedRiders, targetUid);
          if (isProUser && targetUid) {
            saveRiderToFirestore(targetUid, updatedRider, currentOwnerEmail).catch(() => {});
          }
        }
      }

      // Sync public statement ledger for this rider
      const currentRider = riders.find((r) => r.id === settlementDetails.riderId);
      if (currentRider) {
        syncPublicRiderStatement(
          currentRider,
          currentRider.advances || [],
          updatedSettlements,
          updated,
          userRateConfig.hubSignature || 'सरायकेला कूरियर डिलीवरी हब',
          userRateConfig.hubSignature
        ).catch(() => {});
      }
    }

    if (isProUser && targetUid) {
      setSyncStatus('syncing');
      try {
        await batchUpdateDeliveriesAndSettlement(targetUid, changedEntries, newSettlement, currentOwnerEmail);
        setSyncStatus('synced');
      } catch (err) {
        console.error('Error batch updating deliveries in Firestore', err);
      }
    } else {
      setSyncStatus('local');
    }
  };

  // Save Rider Advance Entry and sync public ledger sheet
  const handleSaveRiderAdvance = async (updatedRider: Rider, newAdvance: RiderAdvanceEntry) => {
    const currentOwnerId = inspectedUser ? inspectedUser.uid : (currentUser?.uid || 'guest');
    const currentOwnerEmail = inspectedUser ? (inspectedUser.email || '') : (currentUser?.email || '');

    const updatedRiders = riders.map((r) => (r.id === updatedRider.id ? updatedRider : r));
    setRiders(updatedRiders);
    saveRidersToStorage(updatedRiders, targetUid);

    if (isProUser && targetUid) {
      try {
        await saveRiderToFirestore(targetUid, updatedRider, currentOwnerEmail);
      } catch (err) {
        console.warn('Error saving rider advance to Firestore:', err);
      }
    } else {
      setSyncStatus('local');
    }

    try {
      await syncPublicRiderStatement(
        updatedRider,
        updatedRider.advances || [],
        settlements,
        entries,
        userRateConfig.hubSignature || 'सरायकेला कूरियर डिलीवरी हब',
        userRateConfig.hubSignature
      );
    } catch (err) {
      console.warn('Error syncing public statement:', err);
    }

    setToastMessage({
      text: `₹${newAdvance.amount} का एडवांस सुरक्षित किया गया एवं SMS डिस्पैच सक्रिय!`,
      type: 'success',
    });
  };

  // Delete Rider Advance Entry
  const handleDeleteRiderAdvance = async (updatedRider: Rider, advanceId: string) => {
    const currentOwnerId = inspectedUser ? inspectedUser.uid : (currentUser?.uid || 'guest');
    const currentOwnerEmail = inspectedUser ? (inspectedUser.email || '') : (currentUser?.email || '');

    const updatedRiders = riders.map((r) => (r.id === updatedRider.id ? updatedRider : r));
    setRiders(updatedRiders);
    saveRidersToStorage(updatedRiders, targetUid);

    if (isProUser && targetUid) {
      try {
        await saveRiderToFirestore(targetUid, updatedRider, currentOwnerEmail);
      } catch (err) {
        console.warn('Error updating rider after advance delete:', err);
      }
    } else {
      setSyncStatus('local');
    }

    try {
      await syncPublicRiderStatement(
        updatedRider,
        updatedRider.advances || [],
        settlements,
        entries,
        userRateConfig.hubSignature || 'सरायकेला कूरियर डिलीवरी हब',
        userRateConfig.hubSignature
      );
    } catch (err) {
      console.warn('Error syncing public statement:', err);
    }

    setToastMessage({
      text: `एडवांस एंट्री सफलतापूर्वक हटाई गई।`,
      type: 'info',
    });
  };

  // Toggle single entry status
  const handleToggleEntryStatus = async (entryId: string) => {
    const currentOwnerId = inspectedUser ? inspectedUser.uid : (currentUser?.uid || 'guest');
    const currentOwnerEmail = inspectedUser ? (inspectedUser.email || '') : (currentUser?.email || '');
    let toggledEntry: DeliveryEntry | null = null;
    const updated = entries.map((e) => {
      if (e.id === entryId) {
        const nextStatus = e.status === 'Paid' ? ('Unpaid' as const) : ('Paid' as const);
        toggledEntry = {
          ...e,
          status: nextStatus,
          paidAt: nextStatus === 'Paid' ? new Date().toISOString() : undefined,
          createdBy: e.createdBy || currentOwnerId,
          createdByEmail: e.createdByEmail || currentOwnerEmail,
          workspaceId: e.workspaceId || currentOwnerId,
          userId: e.userId || currentOwnerId,
        };
        return toggledEntry;
      }
      return e;
    });
    updateEntries(updated);

    if (targetUid && toggledEntry) {
      setSyncStatus('syncing');
      try {
        await saveDeliveryToFirestore(targetUid, toggledEntry, currentOwnerEmail);
        setSyncStatus('synced');
      } catch (err) {
        console.error('Error toggling entry in Firestore', err);
      }
    }
  };

  // Listen to inspected user's data if active in admin inspection mode
  useEffect(() => {
    if (!inspectedUser) return;
    setSyncStatus('syncing');
    const unsubscribe = subscribeToUserData(
      inspectedUser.uid,
      {
        onRiders: (newRiders) => {
          const inspectedRiders = newRiders.filter((r) => isEntityOwnedByUser(r, inspectedUser.uid, inspectedUser.email));
          setRiders(inspectedRiders);
          setSyncStatus('synced');
        },
        onDeliveries: (newDeliveries) => {
          const inspectedDeliveries = newDeliveries.filter((d) => isEntityOwnedByUser(d, inspectedUser.uid, inspectedUser.email));
          setEntries(inspectedDeliveries);
          setSyncStatus('synced');
        },
        onSettlements: (newSettlements) => {
          const inspectedSettlements = newSettlements.filter((s) => isEntityOwnedByUser(s, inspectedUser.uid, inspectedUser.email));
          setSettlements(inspectedSettlements);
          setSyncStatus('synced');
        },
        onError: (err) => {
          console.error('Inspected user sync error:', err);
          setSyncStatus('offline');
        },
      },
      inspectedUser.email
    );

    return () => unsubscribe();
  }, [inspectedUser]);

  // Strict Multi-Tenant Isolation for Main Dashboard & Operational Tabs:
  // On the main "Daily Entry" dropdown, "Riders" tab, "Reports" and "Settlement",
  // ONLY display data that belongs to the currently authenticated user (or currently inspected user in Admin mode).
  // Immediately hides and purges any riders or entries created by other external Gmail accounts!
  const dashboardRiders = useMemo(() => {
    if (!currentUser && !inspectedUser) {
      return riders.filter((r) => !r.createdBy || r.createdBy === 'guest' || r.workspaceId === 'guest');
    }

    const currentOwnerId = inspectedUser ? inspectedUser.uid : currentUser!.uid;
    const currentOwnerEmail = inspectedUser ? (inspectedUser.email || '') : (currentUser?.email || '');

    return riders.filter((rider) => isEntityOwnedByUser(rider, currentOwnerId, currentOwnerEmail));
  }, [riders, currentUser, inspectedUser]);

  // Ensure entries on the main dashboard only belong to visible dashboard riders and user ownership
  const dashboardEntries = useMemo(() => {
    if (!currentUser && !inspectedUser) return entries;
    const currentOwnerId = inspectedUser ? inspectedUser.uid : currentUser!.uid;
    const currentOwnerEmail = inspectedUser ? (inspectedUser.email || '') : (currentUser?.email || '');
    const allowedRiderIds = new Set(dashboardRiders.map((r) => r.id));

    return entries.filter((e) => {
      if (e.riderId && !allowedRiderIds.has(e.riderId)) {
        return false;
      }
      return isEntityOwnedByUser(e, currentOwnerId, currentOwnerEmail);
    });
  }, [entries, dashboardRiders, currentUser, inspectedUser]);

  // Ensure settlements on the main dashboard only belong to visible dashboard riders and user ownership
  const dashboardSettlements = useMemo(() => {
    if (!currentUser && !inspectedUser) return settlements;
    const currentOwnerId = inspectedUser ? inspectedUser.uid : currentUser!.uid;
    const currentOwnerEmail = inspectedUser ? (inspectedUser.email || '') : (currentUser?.email || '');
    const allowedRiderIds = new Set(dashboardRiders.map((r) => r.id));

    return settlements.filter((s) => {
      if (s.riderId && !allowedRiderIds.has(s.riderId)) {
        return false;
      }
      return isEntityOwnedByUser(s, currentOwnerId, currentOwnerEmail);
    });
  }, [settlements, dashboardRiders, currentUser, inspectedUser]);

  // Today stats for quick header badge
  const todayDate = getTodayDateString();
  const todayEntries = dashboardEntries.filter((e) => e.date === todayDate);
  const todayParcels = todayEntries.reduce((sum, e) => sum + e.parcels, 0);
  const todayEarnings = todayEntries.reduce((sum, e) => sum + e.totalEarnings, 0);
  const unpaidCount = dashboardEntries.filter((e) => e.status === 'Unpaid').length;
  const totalUnpaidAmount = useMemo(() => {
    return dashboardEntries
      .filter((e) => e.status === 'Unpaid')
      .reduce((sum, e) => sum + (e.totalEarnings || 0), 0);
  }, [dashboardEntries]);
  const totalAdvanceAmount = useMemo(() => {
    return dashboardRiders.reduce((sum, r) => sum + (Number(r.totalAdvance) || 0), 0);
  }, [dashboardRiders]);

  if (!isInitialized) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center text-slate-400">
        <div className="flex items-center gap-2">
          <RefreshCw className="w-5 h-5 animate-spin text-blue-500" />
          <span>Loading Courier Manager...</span>
        </div>
      </div>
    );
  }

  // ENFORCE HARD PAYWALL GATE IN App.tsx (DO NOT ALLOW ACCESS TO DASHBOARD IF EXPIRED OR PENDING):
  // IF USER IS NOT SUPER ADMIN AND (isPendingApproval OR isExpired):
  // - DO NOT render Dashboard, Daily Delivery Entry, Riders, Reports, or Navigation Bar.
  // - RENDER ONLY the standalone <PaywallLockScreen />.
  if (currentUser && !isSuperAdminUser && (isPendingApproval || isExpired || isDeactivated || isPaywallLocked)) {
    return (
      <PaywallLockScreen
        currentUser={currentUser}
        userProfile={userProfile}
        userSubscription={userSubscription}
        masterQrCodeUrl={masterQrCodeUrl}
        onSignOut={() => auth.signOut()}
        onRefreshStatus={async () => {
          if (currentUser) {
            const res = await syncUserProfile(currentUser);
            const isNowPro = Boolean(res.isPro || res.subscription?.isPro || localStorage.getItem('isPro') === 'true');
            setUserProfile({
              status: isNowPro ? 'approved' : res.status,
              validUntil: res.validUntil,
              displayName: currentUser.displayName || undefined,
              name: currentUser.displayName || undefined,
              isPro: isNowPro,
            });
            if (res.subscription) {
              setUserSubscription(res.subscription);
            }
            if (isNowPro) {
              setIsPending(false);
              setIsDeactivated(false);
              setActiveTab('entry');
            }
          }
        }}
        onSubscriptionUpdated={(updated) => {
          setUserSubscription(updated);
          setUserProfile((prev) => ({
            ...(prev || {}),
            status: 'approved',
            validUntil: updated.validUntil,
            isPro: true,
            displayName: currentUser?.displayName || prev?.displayName,
            name: currentUser?.displayName || prev?.name,
          }));
          setIsPending(false);
          setIsDeactivated(false);
          setActiveTab('entry');
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col font-sans">
      {/* Admin Inspection Banner */}
      {inspectedUser && (
        <div 
          id="admin-inspection-banner" 
          className="bg-indigo-950 border-b border-indigo-700/80 px-4 py-2 flex items-center justify-between text-xs text-indigo-100 z-50 sticky top-0 shadow-lg"
        >
          <div className="flex items-center gap-2">
            <Eye className="w-4 h-4 text-indigo-400 animate-pulse" />
            <span>
              <strong>Master Admin Inspection:</strong> Viewing workspace of <strong>{inspectedUser.displayName || inspectedUser.name || inspectedUser.email}</strong> ({inspectedUser.email})
            </span>
          </div>
          <button
            id="exit-inspection-btn"
            type="button"
            onClick={() => {
              setInspectedUser(null);
              if (currentUser) {
                const cachedR = loadRidersFromStorage(currentUser.uid);
                setRiders(cachedR);
                setEntries(loadDeliveriesFromStorage(cachedR, currentUser.uid));
                setSettlements(loadSettlementsFromStorage(currentUser.uid));
              }
            }}
            className="px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow transition active:scale-95 flex items-center gap-1"
          >
            <X className="w-3.5 h-3.5" />
            <span>Exit Inspection</span>
          </button>
        </div>
      )}

      {/* PWA Install Banner - Only visible to Master Admin */}
      {isAdmin && <PWAInstallBanner variant="banner" />}

      {/* Subscription Alert & Renewal Banner - 3-day Expiry Alert */}
      <SubscriptionAlertBanner
        userSubscription={userSubscription}
        validUntil={userProfile?.validUntil || userSubscription?.validUntil}
        userId={currentUser?.uid}
        userEmail={currentUser?.email}
        isSuperAdmin={isSuperAdminUser}
        onOpenPayModal={() => setIsUserPaymentModalOpen(true)}
      />

      {/* Top Application Header with Balanced Top Spacing for Notch/Camera/Safe Area */}
      <header
        className="sticky top-0 z-40 bg-gradient-to-r from-indigo-950/80 via-purple-950/60 to-slate-900/80 border-b border-indigo-700/40 shadow-lg shadow-indigo-950/30 backdrop-blur-md pt-7 sm:pt-4"
        style={{ paddingTop: 'max(1.75rem, env(safe-area-inset-top, 1.75rem))' }}
      >
        <div className="max-w-6xl mx-auto px-4 py-2.5 sm:py-3 flex items-center justify-between gap-3">
          {/* Brand Logo & Name */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 p-0.5 shadow-md flex items-center justify-center shrink-0">
              <img src="/icon.svg" alt="Courier App Logo" className="w-7 h-7 rounded-lg" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h1 className="font-extrabold text-sm sm:text-base text-white tracking-tight leading-none">
                  Courier Payout Pro
                </h1>
              </div>
              <p className="text-[11px] text-slate-400 font-medium mt-0.5 hidden sm:block">
                ₹13 Base + ₹2 Incentive Payout & Delivery Hub • <span className="text-slate-300 font-semibold">{activeHubName}</span>
              </p>
            </div>
          </div>

          {/* Header Action Items */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Today Quick Metric Badge */}
            <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-800/80 border border-slate-700/80 text-xs">
              <span className="text-slate-400">Today:</span>
              <span className="font-bold text-white">{todayParcels} pkts</span>
              <span className="text-slate-600">•</span>
              <span className="font-bold text-emerald-400">{formatINR(todayEarnings)}</span>
            </div>

            {/* Dedicated Share App Link Header Button - Restricted strictly to Master Admin */}
            {isSuperAdminUser && (
              <button
                id="header-share-app-link-btn"
                onClick={async () => {
                  await copyAppShareLink();
                  setToastMessage({
                    text: SHARE_SUCCESS_MESSAGE,
                    type: 'success',
                  });
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-bold shadow-md shadow-blue-600/20 transition active:scale-95 cursor-pointer"
                title="Copy web app preview link to share with riders and team"
              >
                <Share2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Share App Link</span>
                <span className="sm:hidden">Share</span>
              </button>
            )}

            {/* सिर्फ Master Admin को ही Backup, Restore, PWA और Sync दिखेगा */}
            {isAdmin && (
              <div className="flex items-center gap-2">
                {/* PWA Button */}
                <div className="btn-pwa">
                  <PWAInstallBanner variant="button" />
                </div>

                {/* Backup Button */}
                <button
                  id="header-download-backup-btn"
                  onClick={handleDownloadBackup}
                  className="btn-backup flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 text-xs font-semibold shadow-sm transition active:scale-95 cursor-pointer"
                  title="Download full JSON backup of all riders, deliveries, and settlements"
                >
                  <Download className="w-3.5 h-3.5 text-blue-400" />
                  <span className="hidden sm:inline">Backup</span>
                  <span className="sm:hidden">Backup</span>
                </button>

                {/* Restore Button */}
                <input
                  type="file"
                  id="header-restore-file-input"
                  ref={restoreFileInputRef}
                  onChange={handleRestoreBackupFile}
                  accept=".json,application/json"
                  className="hidden"
                />
                <button
                  id="header-restore-backup-btn"
                  onClick={() => restoreFileInputRef.current?.click()}
                  disabled={isRestoringBackup}
                  className="btn-restore flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 text-xs font-semibold shadow-sm transition active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  title="Upload JSON backup file to load all riders and entries directly into the database"
                >
                  {isRestoringBackup ? (
                    <RefreshCw className="w-3.5 h-3.5 text-emerald-400 animate-spin" />
                  ) : (
                    <Upload className="w-3.5 h-3.5 text-emerald-400" />
                  )}
                  <span className="hidden sm:inline">{isRestoringBackup ? 'Restoring...' : 'Restore'}</span>
                  <span className="sm:hidden">{isRestoringBackup ? '...' : 'Restore'}</span>
                </button>

                {/* Sync Button */}
                <button
                  id="header-sync-old-app-btn"
                  onClick={() => setIsSyncOldAppModalOpen(true)}
                  className="btn-sync flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white text-xs font-bold shadow-sm shadow-amber-600/20 border border-amber-500/40 transition active:scale-95 cursor-pointer"
                  title="Sync from Old App URL: Import all 13+ riders, delivery entries, and dues from your previous app"
                >
                  <CloudDownload className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Sync Old App</span>
                  <span className="sm:hidden">Sync</span>
                </button>
              </div>
            )}

            {/* Free Tier: Enable Cloud Backup & Upgrade Button */}
            {!isProUser && (
              <button
                id="header-enable-cloud-sync-btn"
                type="button"
                onClick={() => openSubscriptionModal('cloud_backup')}
                className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-black shadow-md shadow-blue-600/25 border border-blue-400/40 transition active:scale-95 cursor-pointer shrink-0"
                title="Enable Realtime Firebase Cloud Backup & Multi-Device Sync (Pro)"
              >
                <Cloud className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">☁️ Enable Cloud Sync</span>
                <span className="sm:hidden">Cloud Sync</span>
              </button>
            )}

            {/* Regular User Persistent Header Shortcut Button: "💳 Subscription / Pay & Slip" */}
            {currentUser && !isSuperAdminUser && (
              <button
                id="header-user-subscription-btn"
                type="button"
                onClick={() => openSubscriptionModal('manual')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 text-white text-xs font-bold shadow-md shadow-amber-600/20 border border-amber-500/40 transition active:scale-95 cursor-pointer shrink-0"
                title="💳 Subscription / Pay & Slip: View fee, scan QR code, or submit payment slip"
              >
                <CreditCard className="w-3.5 h-3.5 text-amber-200" />
                <span className="hidden sm:inline">💳 Subscription / Pay & Slip</span>
                <span className="sm:hidden">💳 Pay & Slip</span>
              </button>
            )}

            {/* Universally Accessible Legal & Compliance Policies Header Button */}
            <button
              id="header-legal-policies-btn"
              type="button"
              onClick={() => handleOpenLegalPolicies('about')}
              className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-200 hover:text-white border border-slate-700 text-xs font-semibold shadow-sm transition active:scale-95 cursor-pointer shrink-0"
              title="About Us, Pricing, Privacy Policy & Refund Terms (PayU & Play Store Compliance)"
            >
              <Scale className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden sm:inline">About & Policies</span>
              <span className="sm:hidden">Policies</span>
            </button>

            {/* User Account & Cloud Sync Menu */}
            <UserAccountMenu
              user={currentUser}
              syncStatus={syncStatus}
              isProUser={isProUser}
              onOpenAuth={(mode) => {
                setAuthModalMode(mode || 'signin');
                setIsAuthModalOpen(true);
              }}
              onDownloadBackup={isAdmin ? handleDownloadBackup : undefined}
              onOpenSyncOldApp={isAdmin ? () => setIsSyncOldAppModalOpen(true) : undefined}
              onOpenSubscription={!isSuperAdminUser ? () => openSubscriptionModal('manual') : undefined}
              onEnableCloudBackup={() => openSubscriptionModal('cloud_backup')}
              onOpenLegalPolicies={() => handleOpenLegalPolicies('about')}
            />
          </div>
        </div>

        {/* Live Server Connection Banner (instant PWA cold-start feedback) */}
        {connectionBanner && (
          <div
            id="live-connection-banner"
            className={`px-4 py-1.5 text-xs font-medium flex items-center justify-center gap-2 transition-all border-b ${
              connectionBanner.type === 'connecting'
                ? 'bg-blue-950/80 border-blue-800 text-blue-200'
                : connectionBanner.type === 'connected'
                ? 'bg-emerald-950/80 border-emerald-800 text-emerald-200'
                : 'bg-amber-950/80 border-amber-800 text-amber-200'
            }`}
          >
            {connectionBanner.type === 'connecting' ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-400" />
            ) : connectionBanner.type === 'connected' ? (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <CloudOff className="w-3.5 h-3.5 text-amber-400" />
            )}
            <span>{connectionBanner.text}</span>
          </div>
        )}

        {/* Global Toast Notification for Sync and Backup */}
        {toastMessage && (
          <div className="bg-slate-850 border-t border-emerald-500/30 px-4 py-2 text-xs flex items-center justify-between gap-2 shadow-lg">
            <div className="max-w-6xl mx-auto w-full flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-emerald-300 font-medium">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{toastMessage.text}</span>
              </div>
              <button
                onClick={() => setToastMessage(null)}
                className="text-slate-400 hover:text-white p-0.5 rounded transition shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Cloud Sync prompt banner for logged-out / guest users */}
        {!currentUser && (
          <div className="bg-gradient-to-r from-blue-950/60 via-slate-900 to-indigo-950/50 border-t border-slate-800/80 px-4 py-2">
            <div className="max-w-6xl mx-auto flex items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2 text-slate-300">
                <Cloud className="w-4 h-4 text-blue-400 shrink-0" />
                <span className="text-[11px] sm:text-xs">
                  <strong className="text-white">Cloud Firestore:</strong> Sign in with Google or Email to auto-sync riders and payout records across all your phones and computers.
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => {
                    setAuthModalMode('signin');
                    setIsAuthModalOpen(true);
                  }}
                  className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow transition active:scale-95"
                >
                  Sign In
                </button>
                <button
                  onClick={() => {
                    setAuthModalMode('signup');
                    setIsAuthModalOpen(true);
                  }}
                  className="hidden sm:inline px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs border border-slate-750 transition"
                >
                  Create Account
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Paid Subscription Renewal Banner, Alerts, and Expiry Lock */}
        {currentUser && (
          <SubscriptionAlertBanner
            userSubscription={userSubscription || undefined}
            userId={currentUser.uid}
            userEmail={currentUser.email}
            masterQrCodeUrl={masterQrCodeUrl}
            isSuperAdmin={isSuperAdminUser}
            onSubscriptionUpdated={(updated) => setUserSubscription(updated)}
            onOpenPayModal={() => setIsUserPaymentModalOpen(true)}
          />
        )}

        {/* Desktop / Tablet Navigation Tabs */}
        <div className="hidden sm:block border-t border-indigo-900/40 bg-indigo-950/30 backdrop-blur-md">
          <div className="max-w-6xl mx-auto px-4 flex space-x-1">
            {canAccessDailyEntry && (
              <button
                id="desktop-tab-entry"
                onClick={() => setActiveTab('entry')}
                className={`py-3 px-4 text-xs font-bold flex items-center gap-2 border-b-2 transition ${
                  activeTab === 'entry'
                    ? 'border-cyan-500 text-cyan-400 bg-cyan-500/10'
                    : 'border-transparent text-slate-400 hover:text-cyan-300'
                }`}
              >
                <PackagePlus className="w-4 h-4" />
                <span>Daily Delivery Entry</span>
              </button>
            )}

            {canAccessRiders && (
              <button
                id="desktop-tab-riders"
                onClick={() => setActiveTab('riders')}
                className={`py-3 px-4 text-xs font-bold flex items-center gap-2 border-b-2 transition ${
                  activeTab === 'riders'
                    ? 'border-indigo-500 text-indigo-400 bg-indigo-500/10'
                    : 'border-transparent text-slate-400 hover:text-indigo-300'
                }`}
              >
                <Users className="w-4 h-4" />
                <span>Riders Directory ({dashboardRiders.length})</span>
              </button>
            )}

            {canAccessReports && (
              <button
                id="desktop-tab-reports"
                onClick={() => setActiveTab('reports')}
                className={`py-3 px-4 text-xs font-bold flex items-center gap-2 border-b-2 transition ${
                  activeTab === 'reports'
                    ? 'border-purple-500 text-purple-400 bg-purple-500/10'
                    : 'border-transparent text-slate-400 hover:text-purple-300'
                }`}
              >
                <BarChart3 className="w-4 h-4" />
                <span>Analytics & PDF Reports</span>
              </button>
            )}

            {canAccessReports && (
              <button
                id="desktop-tab-settlement"
                onClick={() => setActiveTab('settlement')}
                className={`py-3 px-4 text-xs font-bold flex items-center gap-2 border-b-2 transition relative ${
                  activeTab === 'settlement'
                    ? 'border-emerald-500 text-emerald-400 bg-emerald-500/10'
                    : 'border-transparent text-slate-400 hover:text-emerald-300'
                }`}
              >
                <Receipt className="w-4 h-4" />
                <span>15-Day Settlement & WhatsApp Slip</span>
                {unpaidCount > 0 && (
                  <span className="ml-1 text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    {unpaidCount}
                  </span>
                )}
              </button>
            )}

            {/* Festival Greetings Tab - Strictly Gated by Master Admin permission */}
            {canAccessFestivalGreetings && (
              <button
                id="desktop-tab-festivals"
                onClick={() => setActiveTab('festivals')}
                className={`py-3 px-4 text-xs font-bold flex items-center gap-2 border-b-2 transition ${
                  activeTab === 'festivals'
                    ? 'border-amber-500 text-amber-400 bg-amber-500/10'
                    : 'border-transparent text-slate-400 hover:text-amber-300'
                }`}
              >
                <Sparkles className="w-4 h-4 text-amber-400" />
                <span>Festival Greetings</span>
                <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  त्योहार
                </span>
              </button>
            )}

            {/* Master Admin Dashboard Tab - Visible ONLY to Super Admin */}
            {isSuperAdminUser && (
              <button
                id="desktop-tab-admin"
                onClick={() => setActiveTab('admin')}
                className={`py-3 px-4 text-xs font-bold flex items-center gap-2 border-b-2 transition ml-auto ${
                  activeTab === 'admin'
                    ? 'border-rose-500 text-rose-400 bg-rose-500/10'
                    : 'border-transparent text-rose-400/80 hover:text-rose-300 hover:bg-rose-500/5'
                }`}
              >
                <Shield className="w-4 h-4 text-rose-400" />
                <span>Admin Dashboard</span>
                <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/40 tracking-wider">
                  MASTER
                </span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-3.5 sm:px-6 py-5 pb-24 sm:pb-12">
        {/* Hub Name Headline (Prominent & Multi-Color Gradient) */}
        <div className="mb-6 pb-4 border-b border-slate-800/80 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight bg-gradient-to-r from-blue-400 via-indigo-300 to-amber-300 bg-clip-text text-transparent drop-shadow">
              {activeHubName}
            </h2>
            <p className="text-xs sm:text-sm text-slate-400 font-medium mt-1 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block shadow-sm shadow-emerald-400 animate-pulse"></span>
              <span>Authorized Dispatch & Payout Center</span>
            </p>
          </div>
        </div>

        {activeTab === 'entry' && canAccessDailyEntry && (
          <DailyEntryTab
            key={`daily-entry-tab-${restoreRefreshKey}`}
            riders={dashboardRiders}
            entries={dashboardEntries}
            onAddEntry={handleAddEntry}
            onUpdateEntry={handleUpdateEntry}
            onDeleteEntry={handleDeleteEntry}
            onNavigateToRiders={() => setActiveTab('riders')}
            userRateConfig={userRateConfig}
            canAccessIncentives={canAccessIncentives}
            canAccessFestivalGreetings={canAccessFestivalGreetings}
          />
        )}

        {activeTab === 'riders' && canAccessRiders && (
          <RidersTab
            key={`riders-tab-${restoreRefreshKey}`}
            riders={dashboardRiders}
            entries={dashboardEntries}
            settlements={dashboardSettlements}
            onAddRider={handleAddRider}
            onUpdateRider={handleUpdateRider}
            onDeleteRider={handleDeleteRider}
            onReorderRiders={handleReorderRiders}
            onMarkEntriesPaid={handleMarkEntriesPaid}
            onToggleEntryStatus={handleToggleEntryStatus}
            onSaveAdvance={handleSaveRiderAdvance}
            onDeleteAdvance={handleDeleteRiderAdvance}
            onViewLedger={handleViewLedger}
            canAccessFestivalGreetings={canAccessFestivalGreetings}
            hubSignature={userRateConfig?.hubSignature}
            isProUser={isProUser}
            onOpenSubscriptionModal={openSubscriptionModal}
          />
        )}

        {activeTab === 'reports' && canAccessReports && (
          <AnalyticsReportsTab
            riders={dashboardRiders}
            entries={dashboardEntries}
            onDownloadBackup={isAdmin ? handleDownloadBackup : undefined}
          />
        )}

        {activeTab === 'settlement' && canAccessReports && (
          <SettlementTab
            riders={dashboardRiders}
            entries={dashboardEntries}
            settlements={dashboardSettlements}
            hubName={activeHubName}
            onMarkEntriesPaid={handleMarkEntriesPaid}
            onToggleEntryStatus={handleToggleEntryStatus}
            onNavigateToRiders={() => setActiveTab('riders')}
            onViewLedger={handleViewLedger}
          />
        )}

        {activeTab === 'festivals' && canAccessFestivalGreetings && (
          <div className="space-y-6">
            <FestivalBannerCard riders={dashboardRiders} hubSignature={userRateConfig?.hubSignature} />
            <div className="bg-slate-850 border border-slate-755 rounded-2xl p-6 shadow-xl text-center space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-amber-500/15 text-amber-400 border border-amber-500/30 flex items-center justify-center mx-auto text-2xl">
                🪔
              </div>
              <h2 className="text-lg sm:text-xl font-black text-white">सरायकेला व राष्ट्रीय पावन पर्व शुभकामना केंद्र</h2>
              <p className="text-xs sm:text-sm text-slate-300 max-w-xl mx-auto">
                सरायकेला और कोल्हान के सभी पारंपरिक लोक पर्वों तथा राष्ट्रीय उत्सवों पर अपने कर्मठ कूरियर राइडर्स को एक क्लिक में व्यक्तिगत WhatsApp एवं SMS संदेश भेजें।
              </p>
              <div className="pt-2">
                <button
                  type="button"
                  id="open-full-festival-modal-btn"
                  onClick={() => setIsFestivalModalOpen(true)}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-black text-xs sm:text-sm rounded-xl shadow-lg active:scale-95 transition"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>सभी त्योहार व राइडर सूची खोलें (Send WhatsApp Greetings)</span>
                </button>
              </div>
            </div>
            {isFestivalModalOpen && (
              <FestivalGreetingsModal
                isOpen={isFestivalModalOpen}
                onClose={() => setIsFestivalModalOpen(false)}
                riders={dashboardRiders}
                hubSignature={userRateConfig?.hubSignature}
              />
            )}
          </div>
        )}

        {activeTab === 'admin' && isSuperAdminUser && (
          <AdminDashboardTab 
            currentAdminEmail={currentUser?.email} 
            onInspectUser={(userToInspect) => {
              setInspectedUser(userToInspect);
              setActiveTab('entry');
              setToastMessage({
                text: `Switched to workspace for ${userToInspect.displayName || userToInspect.name || userToInspect.email}.`,
                type: 'info'
              });
            }}
            inspectedUserId={inspectedUser?.uid}
            onOpenSyncOldApp={() => setIsSyncOldAppModalOpen(true)}
            hubName={activeHubName}
          />
        )}
      </main>

      {/* Fixed Public Compliance Footer across all views (Accessible on main page without login) */}
      <PublicComplianceFooter
        onOpenPolicy={handleOpenLegalPolicies}
        platformName="Courier Rider Payout"
        merchantName="Pawan Kabi"
        supportPhone="+91 9110913070"
        supportEmail="pawankabiseraikella@gmail.com"
        supportAddress="Saraikela, Jharkhand, India"
        operatingHours="Mon - Sat, 10:00 AM - 07:00 PM IST"
      />

      {/* Mobile-First App Bottom Navigation Bar - Permanent Vibrant Colors */}
      <nav
        id="mobile-bottom-nav"
        className="sm:hidden fixed bottom-0 left-0 right-0 z-50 bg-slate-950/90 backdrop-blur-2xl border-t border-indigo-900/40 px-1.5 py-1.5 shadow-2xl"
      >
        <div className="flex items-center justify-between gap-1 max-w-lg mx-auto">
          {/* 1. Daily Entry: Always Sky Blue / Cyan */}
          {canAccessDailyEntry && (
            <button
              id="mobile-nav-entry"
              onClick={() => setActiveTab('entry')}
              className={`flex-1 flex flex-col items-center justify-center py-1.5 px-1 rounded-xl transition-all duration-200 text-cyan-400 ${
                activeTab === 'entry'
                  ? 'bg-cyan-500/20 border border-cyan-400/50 shadow-md shadow-cyan-500/25 ring-1 ring-cyan-400/40 font-black'
                  : 'border border-transparent hover:bg-cyan-500/10 font-semibold'
              }`}
            >
              <PackagePlus className={`w-5 h-5 mb-0.5 text-cyan-400 transition-transform ${activeTab === 'entry' ? 'scale-110 drop-shadow-[0_0_8px_rgba(34,211,238,0.7)]' : 'drop-shadow-[0_0_3px_rgba(34,211,238,0.3)]'}`} />
              <span className={`text-[10px] leading-tight text-cyan-400 ${activeTab === 'entry' ? 'font-black' : 'font-semibold'}`}>Daily Entry</span>
            </button>
          )}

          {/* 2. Riders: Always Electric Blue / Indigo */}
          {canAccessRiders && (
            <button
              id="mobile-nav-riders"
              onClick={() => setActiveTab('riders')}
              className={`flex-1 flex flex-col items-center justify-center py-1.5 px-1 rounded-xl transition-all duration-200 text-indigo-400 ${
                activeTab === 'riders'
                  ? 'bg-indigo-500/20 border border-indigo-400/50 shadow-md shadow-indigo-500/25 ring-1 ring-indigo-400/40 font-black'
                  : 'border border-transparent hover:bg-indigo-500/10 font-semibold'
              }`}
            >
              <Users className={`w-5 h-5 mb-0.5 text-indigo-400 transition-transform ${activeTab === 'riders' ? 'scale-110 drop-shadow-[0_0_8px_rgba(129,140,248,0.7)]' : 'drop-shadow-[0_0_3px_rgba(129,140,248,0.3)]'}`} />
              <span className={`text-[10px] leading-tight text-indigo-400 ${activeTab === 'riders' ? 'font-black' : 'font-semibold'}`}>Riders</span>
            </button>
          )}

          {/* 3. Reports: Always Purple / Violet */}
          {canAccessReports && (
            <button
              id="mobile-nav-reports"
              onClick={() => setActiveTab('reports')}
              className={`flex-1 flex flex-col items-center justify-center py-1.5 px-1 rounded-xl transition-all duration-200 text-purple-400 ${
                activeTab === 'reports'
                  ? 'bg-purple-500/20 border border-purple-400/50 shadow-md shadow-purple-500/25 ring-1 ring-purple-400/40 font-black'
                  : 'border border-transparent hover:bg-purple-500/10 font-semibold'
              }`}
            >
              <BarChart3 className={`w-5 h-5 mb-0.5 text-purple-400 transition-transform ${activeTab === 'reports' ? 'scale-110 drop-shadow-[0_0_8px_rgba(192,132,252,0.7)]' : 'drop-shadow-[0_0_3px_rgba(192,132,252,0.3)]'}`} />
              <span className={`text-[10px] leading-tight text-purple-400 ${activeTab === 'reports' ? 'font-black' : 'font-semibold'}`}>Reports</span>
            </button>
          )}

          {/* 4. Settlement: Always Emerald Green with bright golden alert dot */}
          {canAccessReports && (
            <button
              id="mobile-nav-settlement"
              onClick={() => setActiveTab('settlement')}
              className={`flex-1 flex flex-col items-center justify-center py-1.5 px-1 rounded-xl transition-all duration-200 relative text-emerald-400 ${
                activeTab === 'settlement'
                  ? 'bg-emerald-500/20 border border-emerald-400/50 shadow-md shadow-emerald-500/25 ring-1 ring-emerald-400/40 font-black'
                  : 'border border-transparent hover:bg-emerald-500/10 font-semibold'
              }`}
            >
              <Receipt className={`w-5 h-5 mb-0.5 text-emerald-400 transition-transform ${activeTab === 'settlement' ? 'scale-110 drop-shadow-[0_0_8px_rgba(52,211,153,0.7)]' : 'drop-shadow-[0_0_3px_rgba(52,211,153,0.3)]'}`} />
              <span className={`text-[10px] leading-tight text-emerald-400 ${activeTab === 'settlement' ? 'font-black' : 'font-semibold'}`}>Settlement</span>
              {unpaidCount > 0 && (
                <span className="absolute top-1 right-2 w-2.5 h-2.5 rounded-full bg-amber-400 ring-2 ring-slate-950 shadow-md shadow-amber-400 animate-pulse" />
              )}
            </button>
          )}

          {/* 5. त्योहार: Always Warm Golden / Amber */}
          {canAccessFestivalGreetings && (
            <button
              id="mobile-nav-festivals"
              onClick={() => setActiveTab('festivals')}
              className={`flex-1 flex flex-col items-center justify-center py-1.5 px-1 rounded-xl transition-all duration-200 text-amber-400 ${
                activeTab === 'festivals'
                  ? 'bg-amber-500/20 border border-amber-400/50 shadow-md shadow-amber-500/25 ring-1 ring-amber-400/40 font-black'
                  : 'border border-transparent hover:bg-amber-500/10 font-semibold'
              }`}
            >
              <Sparkles className={`w-5 h-5 mb-0.5 text-amber-400 transition-transform ${activeTab === 'festivals' ? 'scale-110 drop-shadow-[0_0_8px_rgba(251,191,36,0.7)]' : 'drop-shadow-[0_0_3px_rgba(251,191,36,0.3)]'}`} />
              <span className={`text-[10px] leading-tight text-amber-400 ${activeTab === 'festivals' ? 'font-black' : 'font-semibold'}`}>त्योहार</span>
            </button>
          )}

          {/* 6. Admin: Always Rose Gold / Crimson */}
          {isSuperAdminUser && (
            <button
              id="mobile-nav-admin"
              onClick={() => setActiveTab('admin')}
              className={`flex-1 flex flex-col items-center justify-center py-1.5 px-1 rounded-xl transition-all duration-200 text-rose-400 ${
                activeTab === 'admin'
                  ? 'bg-rose-500/20 border border-rose-400/50 shadow-md shadow-rose-500/25 ring-1 ring-rose-400/40 font-black'
                  : 'border border-transparent hover:bg-rose-500/10 font-semibold'
              }`}
            >
              <Shield className={`w-5 h-5 mb-0.5 text-rose-400 transition-transform ${activeTab === 'admin' ? 'scale-110 drop-shadow-[0_0_8px_rgba(251,113,133,0.7)]' : 'drop-shadow-[0_0_3px_rgba(251,113,133,0.3)]'}`} />
              <span className={`text-[10px] leading-tight text-rose-400 ${activeTab === 'admin' ? 'font-black' : 'font-semibold'}`}>Admin</span>
            </button>
          )}
        </div>
      </nav>

      {/* Firebase Authentication Modal */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        initialMode={authModalMode}
      />

      {/* Sync from Old App URL Modal - Strictly for Master Admin */}
      {isAdmin && isSyncOldAppModalOpen && (
        <SyncOldAppModal
          isOpen={isSyncOldAppModalOpen}
          onClose={() => setIsSyncOldAppModalOpen(false)}
          onImportComplete={handleConfirmSyncOldApp}
          currentOwnerEmail={inspectedUser ? inspectedUser.email : (currentUser?.email || null)}
        />
      )}

      {/* Regular User Subscription / Payment Slip Modal */}
      {!isSuperAdminUser && (
        <UserPaymentModal
          isOpen={isUserPaymentModalOpen}
          onClose={() => setIsUserPaymentModalOpen(false)}
          userSubscription={userSubscription}
          userId={currentUser?.uid || 'local_user'}
          userEmail={currentUser?.email || null}
          userName={currentUser?.displayName || userProfile?.name || 'Hub Manager'}
          userPhone={currentUser?.phoneNumber || ''}
          masterQrCodeUrl={masterQrCodeUrl}
          isSuperAdmin={isSuperAdminUser}
          reason={paymentModalReason}
          onSubscriptionUpdated={(updated) => {
            setUserSubscription(updated);
            if (updated.paymentStatus === 'active') {
              setIsPending(false);
              setIsDeactivated(false);
              try {
                localStorage.setItem('cp_current_is_pro', 'true');
              } catch (e) {}
              if (currentUser) {
                setSyncStatus('syncing');
                migrateLocalStorageToFirestore(currentUser.uid)
                  .then(() => setSyncStatus('synced'))
                  .catch(console.error);
              }
            }
          }}
          onSuccessToast={(msg) => setToastMessage({ text: msg, type: 'success' })}
        />
      )}

      {/* Universal Legal & Compliance Policies Modal (PayU, Google Play & Regulatory compliance) */}
      <LegalPoliciesModal
        isOpen={isLegalPoliciesModalOpen}
        onClose={() => setIsLegalPoliciesModalOpen(false)}
        initialTab={legalPoliciesInitialTab}
        platformName="Courier Rider Payout"
        merchantName="Pawan Kabi"
        supportEmail="pawankabiseraikella@gmail.com"
        supportPhone="+91 9110913070"
        supportAddress="Saraikela, Jharkhand, India"
        operatingHours="Mon - Sat, 10:00 AM - 07:00 PM IST"
      />

      {/* In-App Khatabook Statement / Ledger Screen Overlay with sticky top Close/Back button */}
      {viewingLedgerRiderId && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950 animate-in fade-in">
          <RiderLedgerStatement
            riderId={viewingLedgerRiderId}
            initialStatement={inAppLedgerInitialStatement}
            onBackToApp={() => setViewingLedgerRiderId(null)}
          />
        </div>
      )}
    </div>
  );
}

/**
 * Immediate Route Interception in App.tsx (Top-Level Check):
 * At the very top of App.tsx (before rendering any Header, Auth check, Daily Entry screen, or Navigation bars):
 * Check the current URL pathname and hash:
 * const hash = window.location.hash;
 * const path = window.location.pathname;
 * const isStatementRoute = hash.includes('/statement/') || path.includes('/statement/');
 * If isStatementRoute is true:
 * Extract the riderId parameter from the URL.
 * RETURN ONLY <PublicRiderLedger riderId={riderId}/>.
 * Do NOT render the main layout, do NOT render the Header (Courier Payout Pro), do NOT show Sign In / Sync, and do NOT show Daily Delivery Entry.
 */
export default function App() {
  const [statementRiderId, setStatementRiderId] = useState<string | null>(() => parseRiderStatementRoute());

  useEffect(() => {
    const handleUrlChange = () => {
      setStatementRiderId(parseRiderStatementRoute());
    };
    window.addEventListener('hashchange', handleUrlChange);
    window.addEventListener('popstate', handleUrlChange);
    return () => {
      window.removeEventListener('hashchange', handleUrlChange);
      window.removeEventListener('popstate', handleUrlChange);
    };
  }, []);

  if (statementRiderId) {
    return (
      <StatementErrorBoundary>
        <PublicRiderLedger riderId={statementRiderId} />
      </StatementErrorBoundary>
    );
  }

  return <MainCourierApp />;
}

