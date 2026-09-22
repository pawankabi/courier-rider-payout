import React, { useState, useEffect, useMemo } from 'react';
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
  Sparkles
} from 'lucide-react';
import { copyAppShareLink, SHARE_SUCCESS_MESSAGE } from './utils/shareLink';
import { User, onAuthStateChanged } from 'firebase/auth';
import { auth } from './firebase';
import { 
  syncUserProfile, 
  subscribeToUserData, 
  subscribeToCurrentUserDoc,
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
  isEntityOwnedByUser
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
  DEFAULT_USER_SUBSCRIPTION
} from './types';
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

export default function App() {
  const [activeTab, setActiveTab] = useState<TabType>('entry');
  
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
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'info' } | null>(null);
  const [connectionBanner, setConnectionBanner] = useState<{ text: string; type: 'connecting' | 'connected' | 'offline' } | null>(null);
  const [isFestivalModalOpen, setIsFestivalModalOpen] = useState(false);

  // User Permissions & Dynamic Rate Config (Admin Overrides)
  const [userPermissions, setUserPermissions] = useState<UserPermissions>(DEFAULT_USER_PERMISSIONS);
  const [userRateConfig, setUserRateConfig] = useState<UserRateConfig>(DEFAULT_USER_RATE_CONFIG);
  const [userSubscription, setUserSubscription] = useState<UserSubscription>(DEFAULT_USER_SUBSCRIPTION);

  // Strict Master Admin Verification
  const isSuperAdminUser = Boolean(currentUser?.email && isSuperAdmin(currentUser.email));
  const isAdmin = isSuperAdminUser;

  // Derived capability flags
  const canAccessDailyEntry = isSuperAdminUser || Boolean(userPermissions.dailyEntry ?? userPermissions.canAccessDailyEntry);
  const canAccessRiders = isSuperAdminUser || Boolean(userPermissions.riders ?? userPermissions.canAccessRiders);
  const canAccessReports = isSuperAdminUser || Boolean(userPermissions.reports ?? userPermissions.canAccessReports);
  const canAccessIncentives = isSuperAdminUser || Boolean(userPermissions.incentives ?? userPermissions.canAccessIncentives);
  const canAccessFestivalGreetings = isSuperAdminUser || Boolean(userPermissions.festivalGreetings ?? userPermissions.canAccessFestivalGreetings);
  const canExportData = isSuperAdminUser || Boolean(userPermissions.canExportData);

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
        // Automatically ensure local state is refreshed upon device wake-up
        if (currentUser) {
          const cachedR = loadRidersFromStorage(currentUser.uid);
          setRiders(cachedR);
          setEntries(loadDeliveriesFromStorage(cachedR, currentUser.uid));
        }
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

  // Initialize data and listen to Firebase Auth & Firestore changes
  useEffect(() => {
    let unsubscribeFirestore: (() => void) | null = null;
    let unsubscribeUserDoc: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
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
          if (docData.isPending) {
            setIsPending(true);
            setIsDeactivated(false);
            setRiders([]);
            setEntries([]);
            setSettlements([]);
          } else if (docData.isBlocked) {
            setIsPending(false);
            setIsDeactivated(true);
            setRiders([]);
            setEntries([]);
            setSettlements([]);
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
          if (profileResult.subscription) {
            setUserSubscription(normalizeUserSubscription(profileResult.subscription));
          }
          if (profileResult.isPending) {
            setIsPending(true);
            setIsDeactivated(false);
            setRiders([]);
            setEntries([]);
            setSettlements([]);
          } else if (profileResult.isDeactivated || profileResult.isBlocked) {
            setIsPending(false);
            setIsDeactivated(true);
            setSyncStatus('offline');
            setRiders([]);
            setEntries([]);
            setSettlements([]);
          } else {
            setIsPending(false);
            setIsDeactivated(false);
          }
        }).catch((err) => {
          console.error('Error in syncUserProfile background task:', err);
        });

        // 4. Migrate only this specific user's pending offline data in background
        migrateLocalStorageToFirestore(user.uid).catch((migErr) => {
          console.error('Migration error:', migErr);
        });

        // 5. Subscribe to real-time Firestore updates strictly scoped to users/{user.uid}/*
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
        // Logged out / Local mode
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

    if (targetUid) {
      setSyncStatus('syncing');
      try {
        await saveDeliveryToFirestore(targetUid, newEntry, currentOwnerEmail);
        setSyncStatus('synced');
      } catch (err) {
        console.error('Error saving delivery to Firestore', err);
      }
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

    if (targetUid) {
      setSyncStatus('syncing');
      try {
        await saveDeliveryToFirestore(targetUid, entryWithOwnership, currentOwnerEmail);
        setSyncStatus('synced');
      } catch (err) {
        console.error('Error updating delivery to Firestore', err);
      }
    }
  };

  // Delete Delivery Entry
  const handleDeleteEntry = async (id: string) => {
    const updated = entries.filter((e) => e.id !== id);
    updateEntries(updated);

    if (targetUid) {
      setSyncStatus('syncing');
      try {
        await deleteDeliveryFromFirestore(targetUid, id);
        setSyncStatus('synced');
      } catch (err) {
        console.error('Error deleting delivery from Firestore', err);
      }
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

    if (targetUid) {
      setSyncStatus('syncing');
      try {
        await saveRiderToFirestore(targetUid, newRider, currentOwnerEmail);
        setSyncStatus('synced');
      } catch (err) {
        console.error('Error saving rider to Firestore', err);
      }
    }
  };

  // Reorder Riders
  const handleReorderRiders = async (reorderedRiders: Rider[]) => {
    const indexedRiders = reorderedRiders.map((r, index) => ({
      ...r,
      order: index,
    }));
    updateRiders(indexedRiders);

    if (targetUid) {
      setSyncStatus('syncing');
      try {
        await updateRidersOrderInFirestore(targetUid, indexedRiders);
        setSyncStatus('synced');
      } catch (err) {
        console.error('Error saving reordered riders to Firestore', err);
      }
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

    if (targetUid) {
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
    }
  };

  // Delete Rider
  const handleDeleteRider = async (id: string) => {
    const updated = riders.filter((r) => r.id !== id);
    updateRiders(updated);

    if (targetUid) {
      setSyncStatus('syncing');
      try {
        await deleteRiderFromFirestore(targetUid, id);
        setSyncStatus('synced');
      } catch (err) {
        console.error('Error deleting rider from Firestore', err);
      }
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
        netTotal: Math.max(0, settlementDetails.grossTotal - advanceAmount),
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
    }

    if (targetUid) {
      setSyncStatus('syncing');
      try {
        await batchUpdateDeliveriesAndSettlement(targetUid, changedEntries, newSettlement, currentOwnerEmail);
        setSyncStatus('synced');
      } catch (err) {
        console.error('Error batch updating deliveries in Firestore', err);
      }
    }
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

  // Deactivated state immediately locks down user access
  if (isDeactivated && !isSuperAdminUser) {
    return <DeactivatedScreen userEmail={currentUser?.email} userId={currentUser?.uid} />;
  }

  // Pending Approval state locks down user access until Admin approval!
  if (isPending && currentUser && !isSuperAdminUser) {
    return (
      <PendingApprovalScreen
        userEmail={currentUser.email}
        userName={currentUser.displayName}
        onSignOut={() => auth.signOut()}
        onRefreshStatus={async () => {
          if (currentUser) {
            const res = await syncUserProfile(currentUser);
            if (!res.isPending && !res.isBlocked && !res.isDeactivated) {
              setIsPending(false);
            }
          }
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

      {/* Subscription Alert & Renewal Banner - Strictly hidden for Free users and Master Admin */}
      <SubscriptionAlertBanner
        userSubscription={userSubscription}
        userId={currentUser?.uid}
        userEmail={currentUser?.email}
        isSuperAdmin={isSuperAdminUser}
      />

      {/* Top Application Header */}
      <header className="sticky top-0 z-40 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          {/* Brand Logo & Name */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 p-0.5 shadow-md flex items-center justify-center">
              <img src="/icon.svg" alt="Courier App Logo" className="w-7 h-7 rounded-lg" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h1 className="font-extrabold text-sm sm:text-base text-white tracking-tight leading-none">
                  Courier Payout Pro
                </h1>
                <span className="text-[10px] uppercase font-black px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30">
                  PWA
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-medium mt-0.5 hidden sm:block">
                ₹13 Base + ₹2 Incentive Payout & Delivery Hub
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

            {/* User Account & Cloud Sync Menu */}
            <UserAccountMenu
              user={currentUser}
              syncStatus={syncStatus}
              onOpenAuth={(mode) => {
                setAuthModalMode(mode || 'signin');
                setIsAuthModalOpen(true);
              }}
              onDownloadBackup={isAdmin ? handleDownloadBackup : undefined}
              onOpenSyncOldApp={isAdmin ? () => setIsSyncOldAppModalOpen(true) : undefined}
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
            isSuperAdmin={isSuperAdminUser}
            onSubscriptionUpdated={(updated) => setUserSubscription(updated)}
          />
        )}

        {/* Desktop / Tablet Navigation Tabs */}
        <div className="hidden sm:block border-t border-slate-800/80 bg-slate-900/60">
          <div className="max-w-6xl mx-auto px-4 flex space-x-1">
            {canAccessDailyEntry && (
              <button
                id="desktop-tab-entry"
                onClick={() => setActiveTab('entry')}
                className={`py-3 px-4 text-xs font-bold flex items-center gap-2 border-b-2 transition ${
                  activeTab === 'entry'
                    ? 'border-blue-500 text-blue-400 bg-blue-500/5'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
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
                    ? 'border-blue-500 text-blue-400 bg-blue-500/5'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
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
                    ? 'border-blue-500 text-blue-400 bg-blue-500/5'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
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
                    ? 'border-blue-500 text-blue-400 bg-blue-500/5'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
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
                    : 'border-transparent text-slate-400 hover:text-slate-200'
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
                    ? 'border-amber-500 text-amber-400 bg-amber-500/10'
                    : 'border-transparent text-amber-400/80 hover:text-amber-300 hover:bg-amber-500/5'
                }`}
              >
                <Shield className="w-4 h-4 text-amber-400" />
                <span>Admin Dashboard</span>
                <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 tracking-wider">
                  MASTER
                </span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-3.5 sm:px-6 py-5 pb-24 sm:pb-12">
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
            onAddRider={handleAddRider}
            onUpdateRider={handleUpdateRider}
            onDeleteRider={handleDeleteRider}
            onReorderRiders={handleReorderRiders}
            onMarkEntriesPaid={handleMarkEntriesPaid}
            onToggleEntryStatus={handleToggleEntryStatus}
            canAccessFestivalGreetings={canAccessFestivalGreetings}
            hubSignature={userRateConfig?.hubSignature}
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
            onMarkEntriesPaid={handleMarkEntriesPaid}
            onToggleEntryStatus={handleToggleEntryStatus}
            onNavigateToRiders={() => setActiveTab('riders')}
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
          />
        )}
      </main>

      {/* Mobile-First App Bottom Navigation Bar */}
      <nav
        id="mobile-bottom-nav"
        className="sm:hidden fixed bottom-0 left-0 right-0 z-50 bg-slate-900/95 backdrop-blur-lg border-t border-slate-800 px-2 py-1.5 shadow-2xl"
      >
        <div className="flex items-center justify-around max-w-md mx-auto">
          {/* Daily Entry */}
          {canAccessDailyEntry && (
            <button
              id="mobile-nav-entry"
              onClick={() => setActiveTab('entry')}
              className={`flex-1 flex flex-col items-center justify-center py-1.5 px-1 rounded-xl transition ${
                activeTab === 'entry'
                  ? 'text-blue-400 bg-blue-500/10 font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <PackagePlus className="w-5 h-5 mb-0.5" />
              <span className="text-[10px] leading-tight">Daily Entry</span>
            </button>
          )}

          {/* Riders */}
          {canAccessRiders && (
            <button
              id="mobile-nav-riders"
              onClick={() => setActiveTab('riders')}
              className={`flex-1 flex flex-col items-center justify-center py-1.5 px-1 rounded-xl transition ${
                activeTab === 'riders'
                  ? 'text-blue-400 bg-blue-500/10 font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Users className="w-5 h-5 mb-0.5" />
              <span className="text-[10px] leading-tight">Riders</span>
            </button>
          )}

          {/* Reports */}
          {canAccessReports && (
            <button
              id="mobile-nav-reports"
              onClick={() => setActiveTab('reports')}
              className={`flex-1 flex flex-col items-center justify-center py-1.5 px-1 rounded-xl transition ${
                activeTab === 'reports'
                  ? 'text-blue-400 bg-blue-500/10 font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <BarChart3 className="w-5 h-5 mb-0.5" />
              <span className="text-[10px] leading-tight">Reports</span>
            </button>
          )}

          {/* Settlement */}
          {canAccessReports && (
            <button
              id="mobile-nav-settlement"
              onClick={() => setActiveTab('settlement')}
              className={`flex-1 flex flex-col items-center justify-center py-1.5 px-1 rounded-xl transition relative ${
                activeTab === 'settlement'
                  ? 'text-blue-400 bg-blue-500/10 font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Receipt className="w-5 h-5 mb-0.5" />
              <span className="text-[10px] leading-tight">Settlement</span>
              {unpaidCount > 0 && (
                <span className="absolute top-1 right-2.5 w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              )}
            </button>
          )}

          {/* Festivals */}
          {canAccessFestivalGreetings && (
            <button
              id="mobile-nav-festivals"
              onClick={() => setActiveTab('festivals')}
              className={`flex-1 flex flex-col items-center justify-center py-1.5 px-1 rounded-xl transition ${
                activeTab === 'festivals'
                  ? 'text-amber-400 bg-amber-500/15 font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Sparkles className="w-5 h-5 mb-0.5 text-amber-400" />
              <span className="text-[10px] leading-tight">त्योहार</span>
            </button>
          )}

          {/* Admin Tab - Only visible to Super Admin */}
          {isSuperAdminUser && (
            <button
              id="mobile-nav-admin"
              onClick={() => setActiveTab('admin')}
              className={`flex-1 flex flex-col items-center justify-center py-1.5 px-1 rounded-xl transition ${
                activeTab === 'admin'
                  ? 'text-amber-400 bg-amber-500/15 font-bold'
                  : 'text-amber-400/70 hover:text-amber-300'
              }`}
            >
              <Shield className="w-5 h-5 mb-0.5 text-amber-400" />
              <span className="text-[10px] leading-tight font-semibold">Admin</span>
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
    </div>
  );
}
