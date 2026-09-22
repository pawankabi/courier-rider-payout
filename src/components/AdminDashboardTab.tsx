import React, { useState, useEffect, useMemo } from 'react';
import { 
  ShieldCheck, 
  Users, 
  UserCheck, 
  UserX, 
  Search, 
  RefreshCw, 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  Mail, 
  Shield, 
  Bike, 
  FileSpreadsheet, 
  Key, 
  Copy, 
  Check, 
  Filter, 
  Sliders, 
  Sparkles, 
  Coins, 
  Package, 
  Ban, 
  Unlock, 
  Layers, 
  Eye, 
  CheckCircle, 
  XCircle, 
  Bell, 
  ArrowRight,
  Share2,
  Phone,
  MessageCircle,
  Download,
  FileText,
  ChevronDown,
  ExternalLink,
  CloudDownload,
  CreditCard,
  QrCode,
  Upload,
  Image as ImageIcon,
  Trash2,
  Calendar,
  DollarSign,
  Receipt,
  X
} from 'lucide-react';
import { 
  AppUser, 
  UserPermissions, 
  DEFAULT_USER_PERMISSIONS, 
  Rider, 
  DeliveryEntry, 
  SettlementRecord,
  DefaultSubscriptionConfig,
  DEFAULT_SUBSCRIPTION_CONFIG,
  UserPlanType,
  UserPaymentStatus,
  UserSubscription
} from '../types';
import { 
  subscribeToAllUsers, 
  setUserStatus, 
  toggleUserStatus, 
  toggleUserPermission, 
  approveUser, 
  rejectUser, 
  blockUser,
  unblockUser,
  fetchUserCounts,
  fetchUserWorkspaceData,
  saveDefaultSubscriptionConfig,
  subscribeToDefaultSubscriptionConfig,
  updateUserSubscription,
  SUPER_ADMIN_EMAIL, 
  isSuperAdmin 
} from '../services/firestoreSync';
import { validateImageFile, compressAndEncodeImage } from '../utils/imageUpload';
import { getAppShareUrl, copyAppShareLink, SHARE_SUCCESS_MESSAGE } from '../utils/shareLink';
import { exportBulkRidersToCSV, exportSingleRiderToCSV } from '../utils/csvExport';
import { generatePayoutPDF } from '../utils/pdfGenerator';
import { formatINR, formatDateDisplay, formatPhoneNumber, getCleanPhoneDigits } from '../utils/formatters';
import { UserManagementModal } from './UserManagementModal';
import { SingleRiderDetailModal } from './SingleRiderDetailModal';
import { AdminBillingExpiryAndSlips } from './AdminBillingExpiryAndSlips';
import { FreeToPaidConversionModal } from './FreeToPaidConversionModal';

interface AdminDashboardTabProps {
  currentAdminEmail?: string | null;
  onInspectUser?: (user: AppUser) => void;
  inspectedUserId?: string | null;
  onOpenSyncOldApp?: () => void;
}

export const AdminDashboardTab: React.FC<AdminDashboardTabProps> = ({ 
  currentAdminEmail,
  onInspectUser,
  inspectedUserId,
  onOpenSyncOldApp
}) => {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'active' | 'blocked'>('all');
  
  // Managing user (opens UserManagementModal for full rider & rate controls)
  const [managingUser, setManagingUser] = useState<AppUser | null>(null);

  // Configurable Default Subscription for New Users
  const [defaultSubConfig, setDefaultSubConfig] = useState<DefaultSubscriptionConfig>(DEFAULT_SUBSCRIPTION_CONFIG);
  const [tempSubConfig, setTempSubConfig] = useState<DefaultSubscriptionConfig>(DEFAULT_SUBSCRIPTION_CONFIG);
  const [showSubConfigModal, setShowSubConfigModal] = useState(false);
  const [savingSubConfig, setSavingSubConfig] = useState(false);

  // Navigation between User Management and Subscription & Billing Management
  const [activeAdminSection, setActiveAdminSection] = useState<'users' | 'subscriptions'>('users');

  // Subscription filters & search
  const [subFilter, setSubFilter] = useState<'all' | 'paid' | 'free' | 'verification_pending' | 'expired'>('all');
  const [subSearchQuery, setSubSearchQuery] = useState('');

  // Draft monthly fee per user for typing before saving
  const [feeDrafts, setFeeDrafts] = useState<Record<string, number | string>>({});
  // Loading state when uploading QR per user
  const [uploadingQrUserId, setUploadingQrUserId] = useState<string | null>(null);

  // QR Preview Modal
  const [qrModalUser, setQrModalUser] = useState<AppUser | null>(null);
  // Slip Review Modal
  const [slipReviewUser, setSlipReviewUser] = useState<AppUser | null>(null);
  // Free to Paid Conversion Modal
  const [convertingToPaidUser, setConvertingToPaidUser] = useState<AppUser | null>(null);

  // Action loading state (per user uid or per permission)
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [permLoadingKey, setPermLoadingKey] = useState<string | null>(null); // e.g. `${uid}-dailyEntry`
  
  // Toast feedback
  const [feedbackToast, setFeedbackToast] = useState<{ text: string; type: 'success' | 'info' | 'error' } | null>(null);
  const [copiedUid, setCopiedUid] = useState<string | null>(null);

  // Master Admin User Workspace Inspector & Export Suite State
  const [selectedInspectorUserId, setSelectedInspectorUserId] = useState<string>(inspectedUserId || '');
  const [workspaceData, setWorkspaceData] = useState<{
    riders: Rider[];
    entries: DeliveryEntry[];
    settlements: SettlementRecord[];
  } | null>(null);
  const [loadingWorkspace, setLoadingWorkspace] = useState(false);
  const [workspaceRiderSearch, setWorkspaceRiderSearch] = useState('');
  const [inspectingRider, setInspectingRider] = useState<Rider | null>(null);

  // Strict Super Admin Access Gate
  const isAuthorizedAdmin = isSuperAdmin(currentAdminEmail);

  useEffect(() => {
    if (!isAuthorizedAdmin) return;
    setLoading(true);
    const unsubscribe = subscribeToAllUsers(
      (loadedUsers) => {
        setUsers(loadedUsers);
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.error('Error in subscribeToAllUsers:', err);
        setError('Failed to load user list from Firestore. Please verify admin privileges.');
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [isAuthorizedAdmin]);

  // Subscribe to real-time default subscription settings
  useEffect(() => {
    const unsubSub = subscribeToDefaultSubscriptionConfig((config) => {
      setDefaultSubConfig(config);
    });
    return () => unsubSub();
  }, []);

  const handleOpenSubConfigModal = () => {
    setTempSubConfig({ ...defaultSubConfig });
    setShowSubConfigModal(true);
  };

  const handleSaveSubConfig = async () => {
    setSavingSubConfig(true);
    try {
      await saveDefaultSubscriptionConfig(tempSubConfig);
      setDefaultSubConfig(tempSubConfig);
      setShowSubConfigModal(false);
      showToast('Default subscription settings for new users saved successfully!', 'success');
    } catch (err) {
      console.error('Failed to save default subscription config:', err);
      showToast('Failed to save subscription configuration.', 'error');
    } finally {
      setSavingSubConfig(false);
    }
  };

  const showToast = (text: string, type: 'success' | 'info' | 'error' = 'success') => {
    setFeedbackToast({ text, type });
    setTimeout(() => setFeedbackToast(null), 4000);
  };

  const handleCopyUid = (uid: string) => {
    navigator.clipboard.writeText(uid);
    setCopiedUid(uid);
    setTimeout(() => setCopiedUid(null), 2000);
  };

  // Auto-sync selectedInspectorUserId with prop if it changes
  useEffect(() => {
    if (inspectedUserId) {
      setSelectedInspectorUserId(inspectedUserId);
    }
  }, [inspectedUserId]);

  // Load workspace data when selectedInspectorUserId changes
  const loadWorkspaceData = async (uid: string) => {
    if (!uid) {
      setWorkspaceData(null);
      return;
    }
    setLoadingWorkspace(true);
    try {
      const data = await fetchUserWorkspaceData(uid);
      setWorkspaceData(data);
    } catch (err) {
      console.error('Error fetching workspace data:', err);
      showToast('Could not load workspace data from Firestore.', 'error');
    } finally {
      setLoadingWorkspace(false);
    }
  };

  useEffect(() => {
    if (selectedInspectorUserId) {
      loadWorkspaceData(selectedInspectorUserId);
    } else {
      setWorkspaceData(null);
    }
  }, [selectedInspectorUserId]);

  const selectedUser = useMemo(
    () => users.find((u) => u.uid === selectedInspectorUserId) || null,
    [users, selectedInspectorUserId]
  );

  const workspaceStats = useMemo(() => {
    if (!workspaceData) return null;
    const totalParcels = workspaceData.entries.reduce((sum, e) => sum + (e.parcels || 0), 0);
    const totalGross = workspaceData.entries.reduce((sum, e) => sum + (e.totalEarnings || 0), 0);
    const totalUnpaid = workspaceData.entries
      .filter((e) => e.status === 'Unpaid')
      .reduce((sum, e) => sum + (e.totalEarnings || 0), 0);
    const totalPaid = workspaceData.entries
      .filter((e) => e.status === 'Paid')
      .reduce((sum, e) => sum + (e.totalEarnings || 0), 0);
    const unpaidCount = workspaceData.entries.filter((e) => e.status === 'Unpaid').length;
    return {
      totalParcels,
      totalGross,
      totalUnpaid,
      totalPaid,
      unpaidCount,
      riderCount: workspaceData.riders.length,
      entryCount: workspaceData.entries.length,
    };
  }, [workspaceData]);

  const filteredWorkspaceRiders = useMemo(() => {
    if (!workspaceData) return [];
    if (!workspaceRiderSearch.trim()) return workspaceData.riders;
    const q = workspaceRiderSearch.toLowerCase();
    return workspaceData.riders.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        (r.phone && r.phone.includes(q)) ||
        (r.vehicleType && r.vehicleType.toLowerCase().includes(q))
    );
  }, [workspaceData, workspaceRiderSearch]);

  const handleBulkExportCSV = () => {
    if (!selectedUser || !workspaceData) {
      showToast('Please select a user workspace first.', 'info');
      return;
    }
    if (workspaceData.riders.length === 0) {
      showToast('No riders in this workspace to export.', 'info');
      return;
    }
    exportBulkRidersToCSV({
      userName: selectedUser.displayName || selectedUser.name || selectedUser.email,
      userEmail: selectedUser.email,
      riders: workspaceData.riders,
      entries: workspaceData.entries,
      settlements: workspaceData.settlements,
    });
    showToast(`Bulk Excel/CSV exported for ${selectedUser.displayName || selectedUser.email}!`, 'success');
  };

  const handleBulkExportPDF = () => {
    if (!selectedUser || !workspaceData) {
      showToast('Please select a user workspace first.', 'info');
      return;
    }
    if (workspaceData.riders.length === 0 || workspaceData.entries.length === 0) {
      showToast('No entries or riders available to generate PDF.', 'info');
      return;
    }
    const dates = workspaceData.entries.map((e) => e.date).sort();
    const startDate = dates[0] || new Date().toISOString().split('T')[0];
    const endDate = dates[dates.length - 1] || startDate;

    generatePayoutPDF({
      title: `Hub Payout Audit - ${selectedUser.displayName || selectedUser.email}`,
      riderFilterName: 'All Riders',
      startDate,
      endDate,
      entries: workspaceData.entries,
      riders: workspaceData.riders,
    });
    showToast(`Bulk PDF Payout Report generated for ${selectedUser.displayName || selectedUser.email}!`, 'success');
  };

  const handleWorkspaceRiderUpdated = (updated: Rider) => {
    setWorkspaceData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        riders: prev.riders.map((r) => (r.id === updated.id ? updated : r)),
      };
    });
    setInspectingRider(updated);
  };

  const handleWorkspaceRiderDeleted = (riderId: string) => {
    setWorkspaceData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        riders: prev.riders.filter((r) => r.id !== riderId),
      };
    });
    setInspectingRider(null);
  };

  const handleWorkspaceEntryUpdated = (updatedEntry: DeliveryEntry) => {
    setWorkspaceData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        entries: prev.entries.map((e) => (e.id === updatedEntry.id ? updatedEntry : e)),
      };
    });
  };

  // Subscription Statistics
  const subStats = useMemo(() => {
    const total = users.length;
    let freeCount = 0;
    let paidCount = 0;
    let activePaidCount = 0;
    let slipPendingCount = 0;
    let expiredCount = 0;
    let projectedMonthlyRevenue = 0;

    const now = Date.now();

    users.forEach((u) => {
      const sub = u.subscription;
      if (!sub || sub.planType === 'free') {
        freeCount++;
      } else {
        paidCount++;
        projectedMonthlyRevenue += (sub.monthlyFee || 0);

        const isDateExpired = sub.validUntil ? new Date(sub.validUntil).getTime() < now : false;

        if (sub.paymentStatus === 'verification_pending') {
          slipPendingCount++;
        } else if (sub.paymentStatus === 'expired' || isDateExpired) {
          expiredCount++;
        } else if (sub.paymentStatus === 'active') {
          activePaidCount++;
        }
      }
    });

    return {
      total,
      freeCount,
      paidCount,
      activePaidCount,
      slipPendingCount,
      expiredCount,
      projectedMonthlyRevenue,
    };
  }, [users]);

  // Filtered Users for Subscription & Billing Table
  const filteredSubUsers = useMemo(() => {
    return users.filter((u) => {
      const sub = u.subscription;
      const isFree = !sub || sub.planType === 'free';
      const isPaid = sub?.planType === 'paid';
      const isSlipPending = sub?.paymentStatus === 'verification_pending';
      const isExpired = sub?.paymentStatus === 'expired' || 
        Boolean(isPaid && sub?.validUntil && new Date(sub.validUntil).getTime() < Date.now());

      if (subFilter === 'free' && !isFree) return false;
      if (subFilter === 'paid' && !isPaid) return false;
      if (subFilter === 'verification_pending' && !isSlipPending) return false;
      if (subFilter === 'expired' && !isExpired) return false;

      if (subSearchQuery.trim()) {
        const q = subSearchQuery.toLowerCase();
        const matchesName = (u.displayName || u.name || '').toLowerCase().includes(q);
        const matchesEmail = (u.email || '').toLowerCase().includes(q);
        const matchesUid = (u.uid || '').toLowerCase().includes(q);
        if (!matchesName && !matchesEmail && !matchesUid) return false;
      }

      return true;
    });
  }, [users, subFilter, subSearchQuery]);

  // Switch Plan Type ('free' vs 'paid')
  const handleToggleUserPlan = async (user: AppUser, targetPlan: 'free' | 'paid') => {
    if (targetPlan === 'paid') {
      // Open Free to Paid conversion modal to set monthly fee, QR code, and validity start date
      setConvertingToPaidUser(user);
      return;
    }

    // Switch back to FREE plan: Immediately clear all payment locks and alerts for that user
    setActionLoadingId(`plan-${user.uid}`);
    try {
      const updatedSub = await updateUserSubscription(user.uid, {
        planType: 'free',
        paymentStatus: 'active',
      });
      setUsers(prev => prev.map(u => u.uid === user.uid ? { ...u, subscription: updatedSub } : u));

      showToast(
        `Switched ${user.displayName || user.email} to FREE plan. All payment locks and alerts have been immediately cleared.`,
        'success'
      );
    } catch (err: any) {
      console.error('Failed to switch subscription plan to free:', err);
      alert('Failed to switch subscription plan in Firestore: ' + (err?.message || err));
      showToast('Failed to switch subscription plan to free.', 'error');
    } finally {
      setActionLoadingId(null);
    }
  };

  // Confirm Free-to-Paid Plan Conversion
  const handleConfirmFreeToPaid = async (
    targetUser: AppUser,
    config: { monthlyFee: number; validUntil: string; qrCodeUrl: string }
  ) => {
    setActionLoadingId(`plan-${targetUser.uid}`);
    try {
      const updatedSub = await updateUserSubscription(targetUser.uid, {
        planType: 'paid',
        monthlyFee: config.monthlyFee,
        validUntil: config.validUntil,
        qrCodeUrl: config.qrCodeUrl,
        paymentStatus: 'active',
      });
      setUsers(prev => prev.map(u => u.uid === targetUser.uid ? { ...u, subscription: updatedSub } : u));
      showToast(
        `Successfully converted ${targetUser.displayName || targetUser.email} to Paid Plan (₹${config.monthlyFee}/mo)!`,
        'success'
      );
    } catch (err: any) {
      console.error('Failed to convert user to paid plan:', err);
      alert('Failed to convert user to paid plan in Firestore: ' + (err?.message || err));
      showToast('Failed to convert user to paid plan.', 'error');
    } finally {
      setActionLoadingId(null);
    }
  };

  // Update Custom Monthly Fee (₹)
  const handleSaveMonthlyFee = async (user: AppUser, feeToSave?: number) => {
    const rawValue = feeToSave !== undefined ? feeToSave : feeDrafts[user.uid];
    const newFee = typeof rawValue === 'number' 
      ? Math.max(0, rawValue) 
      : typeof rawValue === 'string' && rawValue !== '' 
      ? Math.max(0, parseInt(rawValue, 10) || 0)
      : user.subscription?.monthlyFee || 499;

    setActionLoadingId(`fee-${user.uid}`);
    try {
      const updatedSub = await updateUserSubscription(user.uid, {
        monthlyFee: newFee,
      });
      setUsers(prev => prev.map(u => u.uid === user.uid ? { ...u, subscription: updatedSub } : u));
      // Clear draft
      setFeeDrafts(prev => {
        const copy = { ...prev };
        delete copy[user.uid];
        return copy;
      });
      showToast(`Saved monthly fee ₹${newFee} for ${user.displayName || user.email}!`, 'success');
    } catch (err: any) {
      console.error('Failed to update monthly fee:', err);
      alert('Failed to save monthly fee in Firestore: ' + (err?.message || err));
      showToast('Failed to save monthly fee in Firestore.', 'error');
    } finally {
      setActionLoadingId(null);
    }
  };

  // Upload Custom UPI QR Code file for user
  const handleUploadUserQrFile = async (user: AppUser, file: File) => {
    const validation = validateImageFile(file);
    if (!validation.valid) {
      showToast(validation.error || 'Please select a valid image file.', 'error');
      return;
    }

    setUploadingQrUserId(user.uid);
    try {
      const dataUrl = await compressAndEncodeImage(file, 500, 500, 0.88);
      const updatedSub = await updateUserSubscription(user.uid, {
        qrCodeUrl: dataUrl,
      });
      setUsers(prev => prev.map(u => u.uid === user.uid ? { ...u, subscription: updatedSub } : u));
      showToast(`Custom UPI QR Code saved for ${user.displayName || user.email}!`, 'success');
    } catch (err: any) {
      console.error('Failed to upload custom QR code:', err);
      alert('Failed to upload custom QR code in Firestore: ' + (err?.message || err));
      showToast('Failed to upload custom QR code. Please try another image.', 'error');
    } finally {
      setUploadingQrUserId(null);
    }
  };

  // Remove QR Code
  const handleRemoveUserQr = async (user: AppUser) => {
    setActionLoadingId(`qr-${user.uid}`);
    try {
      const updatedSub = await updateUserSubscription(user.uid, {
        qrCodeUrl: '',
      });
      setUsers(prev => prev.map(u => u.uid === user.uid ? { ...u, subscription: updatedSub } : u));
      showToast(`Removed custom QR code for ${user.displayName || user.email}`, 'info');
    } catch (err: any) {
      console.error('Failed to remove QR code:', err);
      alert('Failed to remove QR code in Firestore: ' + (err?.message || err));
      showToast('Failed to remove QR code.', 'error');
    } finally {
      setActionLoadingId(null);
    }
  };

  // Quick Extend Subscription by 30 days
  const handleExtendUserDays = async (user: AppUser, days = 30) => {
    setActionLoadingId(`extend-${user.uid}`);
    try {
      const currentValidUntil = user.subscription?.validUntil;
      const baseTime = currentValidUntil && new Date(currentValidUntil).getTime() > Date.now()
        ? new Date(currentValidUntil).getTime()
        : Date.now();
      const newValidUntil = new Date(baseTime + days * 24 * 60 * 60 * 1000).toISOString();

      const updatedSub = await updateUserSubscription(user.uid, {
        validUntil: newValidUntil,
        paymentStatus: 'active',
      });
      setUsers(prev => prev.map(u => u.uid === user.uid ? { ...u, subscription: updatedSub } : u));
      showToast(`Extended ${user.displayName || user.email}'s plan by +${days} days (Active)!`, 'success');
    } catch (err: any) {
      console.error('Failed to extend plan:', err);
      alert('Failed to extend subscription in Firestore: ' + (err?.message || err));
      showToast('Failed to extend subscription in Firestore.', 'error');
    } finally {
      setActionLoadingId(null);
    }
  };

  // Approve Payment Slip
  const handleApproveSlip = async (user: AppUser) => {
    setActionLoadingId(`slip-${user.uid}`);
    try {
      const currentValidUntil = user.subscription?.validUntil;
      const baseTime = currentValidUntil && new Date(currentValidUntil).getTime() > Date.now()
        ? new Date(currentValidUntil).getTime()
        : Date.now();
      const newValidUntil = new Date(baseTime + 30 * 24 * 60 * 60 * 1000).toISOString();

      const updatedSub = await updateUserSubscription(user.uid, {
        validUntil: newValidUntil,
        paymentStatus: 'active',
      });
      setUsers(prev => prev.map(u => u.uid === user.uid ? { ...u, subscription: updatedSub } : u));
      setSlipReviewUser(null);
      showToast(`Payment slip approved for ${user.displayName || user.email}! Plan active for +30 days.`, 'success');
    } catch (err: any) {
      console.error('Failed to approve slip:', err);
      alert('Failed to approve payment slip in Firestore: ' + (err?.message || err));
      showToast('Failed to approve payment slip in Firestore.', 'error');
    } finally {
      setActionLoadingId(null);
    }
  };

  // Reject Payment Slip
  const handleRejectSlip = async (user: AppUser) => {
    setActionLoadingId(`slip-reject-${user.uid}`);
    try {
      const updatedSub = await updateUserSubscription(user.uid, {
        paymentStatus: 'expired',
      });
      setUsers(prev => prev.map(u => u.uid === user.uid ? { ...u, subscription: updatedSub } : u));
      setSlipReviewUser(null);
      showToast(`Payment slip rejected. Status set to expired for ${user.displayName || user.email}`, 'info');
    } catch (err: any) {
      console.error('Failed to reject slip:', err);
      alert('Failed to reject payment slip in Firestore: ' + (err?.message || err));
      showToast('Failed to reject payment slip.', 'error');
    } finally {
      setActionLoadingId(null);
    }
  };

  // Instant 1-Click Approve User
  const handleApprove = async (user: AppUser, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setActionLoadingId(user.uid);
    try {
      await approveUser(user.uid);
      showToast(
        `User "${user.displayName || user.email}" is now APPROVED! Their app access is unlocked immediately.`,
        'success'
      );
    } catch (err) {
      console.error('Failed to approve user:', err);
      showToast('Failed to approve user in Firestore. Please try again.', 'error');
    } finally {
      setActionLoadingId(null);
    }
  };

  // Instant 1-Click Reject / Block User
  const handleReject = async (user: AppUser, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (isSuperAdmin(user.email)) {
      showToast('The Master Super Admin account cannot be blocked.', 'error');
      return;
    }
    setActionLoadingId(user.uid);
    try {
      await rejectUser(user.uid);
      showToast(
        `User "${user.displayName || user.email}" access request was REJECTED and BLOCKED.`,
        'info'
      );
    } catch (err) {
      console.error('Failed to reject user:', err);
      showToast('Failed to update user status in Firestore. Please try again.', 'error');
    } finally {
      setActionLoadingId(null);
    }
  };

  // Instant 1-Click Block User
  const handleBlock = async (user: AppUser, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (isSuperAdmin(user.email)) {
      showToast('The Master Super Admin account cannot be blocked.', 'error');
      return;
    }
    setActionLoadingId(user.uid);
    try {
      await blockUser(user.uid);
      showToast(
        `User "${user.displayName || user.email}" is now BLOCKED. Their app access is revoked immediately.`,
        'info'
      );
    } catch (err) {
      console.error('Failed to block user:', err);
      showToast('Failed to block user in Firestore. Please try again.', 'error');
    } finally {
      setActionLoadingId(null);
    }
  };

  // Instant 1-Click Unblock User
  const handleUnblock = async (user: AppUser, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setActionLoadingId(user.uid);
    try {
      await unblockUser(user.uid);
      showToast(
        `User "${user.displayName || user.email}" is now UNBLOCKED. Full app access is restored immediately.`,
        'success'
      );
    } catch (err) {
      console.error('Failed to unblock user:', err);
      showToast('Failed to unblock user in Firestore. Please try again.', 'error');
    } finally {
      setActionLoadingId(null);
    }
  };

  // Copy app share link with confirmation toast
  const handleCopyShareLink = async () => {
    await copyAppShareLink();
    showToast(SHARE_SUCCESS_MESSAGE, 'success');
  };

  // Bulk Approve all pending users
  const handleApproveAllPending = async () => {
    const pendingToApprove = users.filter((u) => u.status === 'pending');
    if (pendingToApprove.length === 0) return;

    setActionLoadingId('all-pending');
    try {
      for (const u of pendingToApprove) {
        await approveUser(u.uid);
      }
      showToast(`Successfully approved all ${pendingToApprove.length} pending access requests!`, 'success');
    } catch (err) {
      console.error('Failed to bulk approve:', err);
      showToast('Some access requests could not be approved.', 'error');
    } finally {
      setActionLoadingId(null);
    }
  };

  // Real-time Status Toggle (Active <-> Blocked)
  const handleToggleStatus = async (user: AppUser, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (isSuperAdmin(user.email)) {
      showToast('The Master Super Admin account cannot be blocked.', 'error');
      return;
    }

    setActionLoadingId(user.uid);
    try {
      const newStatus = await toggleUserStatus(user.uid, user.status);
      showToast(
        newStatus === 'blocked'
          ? `User "${user.displayName || user.email}" is now BLOCKED. Their app access is revoked.`
          : `User "${user.displayName || user.email}" is now ACTIVE with normal access.`,
        newStatus === 'blocked' ? 'info' : 'success'
      );
    } catch (err) {
      console.error('Failed to toggle status:', err);
      showToast('Failed to update status in Firestore. Please try again.', 'error');
    } finally {
      setActionLoadingId(null);
    }
  };

  // Real-time Permission Toggle for specific feature
  const handleToggleFeature = async (
    user: AppUser,
    key: 'dailyEntry' | 'riders' | 'incentives' | 'reports',
    e?: React.MouseEvent
  ) => {
    e?.stopPropagation();
    const loadingKey = `${user.uid}-${key}`;
    setPermLoadingKey(loadingKey);
    try {
      const currentPerms = user.permissions || DEFAULT_USER_PERMISSIONS;
      const updated = await toggleUserPermission(user.uid, currentPerms, key);
      const isEnabled = updated[key];
      const featureLabel = 
        key === 'dailyEntry' ? 'Daily Entry' :
        key === 'riders' ? 'Riders' :
        key === 'incentives' ? 'Incentives' : 'Reports';

      showToast(
        `${featureLabel} is now ${isEnabled ? 'ENABLED' : 'DISABLED'} for ${user.displayName || user.email}.`,
        isEnabled ? 'success' : 'info'
      );
    } catch (err) {
      console.error('Failed to toggle feature permission:', err);
      showToast('Failed to update permission in Firestore.', 'error');
    } finally {
      setPermLoadingKey(null);
    }
  };

  // Filtered & categorized users
  const pendingUsers = useMemo(() => users.filter((u) => u.status === 'pending'), [users]);
  const activeCount = useMemo(() => users.filter((u) => u.status === 'active' || u.status === 'approved').length, [users]);
  const blockedCount = useMemo(() => users.filter((u) => u.status === 'blocked' || u.status === 'deactivated').length, [users]);

  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const matchesSearch = 
        u.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (u.name && u.name.toLowerCase().includes(searchQuery.toLowerCase())) ||
        u.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        u.uid.toLowerCase().includes(searchQuery.toLowerCase());

      if (!matchesSearch) return false;

      if (statusFilter === 'all') return true;
      if (statusFilter === 'pending') return u.status === 'pending';
      if (statusFilter === 'active') return u.status === 'active' || u.status === 'approved';
      if (statusFilter === 'blocked') return u.status === 'blocked' || u.status === 'deactivated';

      return true;
    });
  }, [users, searchQuery, statusFilter]);

  // If user is not authorized, refuse rendering
  if (!isAuthorizedAdmin) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center text-center p-8 bg-slate-900 border border-slate-800 rounded-2xl">
        <Shield className="w-12 h-12 text-rose-500 mb-3" />
        <h2 className="text-xl font-bold text-white">Access Denied</h2>
        <p className="text-sm text-slate-400 mt-1 max-w-md">
          This administration dashboard is restricted strictly to the master account ({SUPER_ADMIN_EMAIL}).
        </p>
      </div>
    );
  }

  return (
    <div id="admin-dashboard-root" className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Toast Feedback */}
      {feedbackToast && (
        <div
          id="admin-toast"
          className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg border text-sm font-medium flex items-center gap-2.5 transition-all animate-in fade-in slide-in-from-top-2 ${
            feedbackToast.type === 'error'
              ? 'bg-rose-900 border-rose-700 text-rose-100'
              : feedbackToast.type === 'info'
              ? 'bg-amber-900 border-amber-700 text-amber-100'
              : 'bg-emerald-900 border-emerald-700 text-emerald-100'
          }`}
        >
          {feedbackToast.type === 'error' ? (
            <AlertTriangle className="w-4 h-4 text-rose-300" />
          ) : (
            <CheckCircle2 className="w-4 h-4 text-emerald-300" />
          )}
          <span>{feedbackToast.text}</span>
        </div>
      )}

      {/* Header Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <Shield className="w-3.5 h-3.5 text-amber-400" />
              Master Admin Panel
            </span>
            <span className="text-xs text-slate-400 font-mono">
              Restricted to: {SUPER_ADMIN_EMAIL}
            </span>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">
            User Registry & Access Approvals
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Review new user sign-up requests, approve or block access, inspect user workspaces, and configure rider rates.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="px-3.5 py-2 rounded-xl bg-slate-800/80 border border-slate-700/80 text-xs flex items-center gap-2 text-slate-300">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Real-Time Firestore Connected</span>
          </div>
        </div>
      </div>

      {/* SECTION: Admin Section Tab Switcher */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-2 bg-slate-900/90 border border-slate-800 rounded-2xl shadow-lg">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            id="admin-nav-users-tab"
            type="button"
            onClick={() => setActiveAdminSection('users')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs transition cursor-pointer ${
              activeAdminSection === 'users'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>User Accounts & Permissions</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono ${
              activeAdminSection === 'users' ? 'bg-blue-500 text-white' : 'bg-slate-800 text-slate-300'
            }`}>
              {users.length}
            </span>
          </button>

          <button
            id="admin-nav-subscriptions-tab"
            type="button"
            onClick={() => setActiveAdminSection('subscriptions')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs transition relative cursor-pointer ${
              activeAdminSection === 'subscriptions'
                ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md shadow-emerald-600/30'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <CreditCard className="w-4 h-4" />
            <span>Subscription & Billing Management</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono ${
              activeAdminSection === 'subscriptions' ? 'bg-emerald-500 text-white' : 'bg-slate-800 text-slate-300'
            }`}>
              {subStats.paidCount} Paid / {subStats.freeCount} Free
            </span>
            {subStats.slipPendingCount > 0 && (
              <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
              </span>
            )}
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            id="admin-quick-default-sub-btn"
            onClick={handleOpenSubConfigModal}
            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-750 border border-slate-700 text-xs font-semibold text-slate-300 hover:text-white transition flex items-center gap-1.5 cursor-pointer"
            title="Configure default subscription plan, fee, and status for newly registering users"
          >
            <Sliders className="w-3.5 h-3.5 text-amber-400" />
            <span>New User Default ({defaultSubConfig.planType === 'paid' ? `₹${defaultSubConfig.monthlyFee}/mo` : 'Free'})</span>
          </button>
        </div>
      </div>

      {activeAdminSection === 'users' ? (
        <div className="space-y-8">
          {/* SECTION: App Share Link on Display */}
          <div 
            id="admin-share-link-card"
        className="bg-gradient-to-r from-blue-950/40 via-slate-900 to-indigo-950/40 border border-blue-500/30 rounded-2xl p-5 sm:p-6 shadow-xl relative overflow-hidden"
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-blue-500/20 text-blue-400 border border-blue-500/30">
                <Share2 className="w-4 h-4" />
              </span>
              <h2 className="text-base font-bold text-white tracking-tight">
                Dedicated App Share Link
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-blue-600 text-white uppercase tracking-wider">
                Production Preview
              </span>
            </div>
            <p className="text-xs text-slate-300">
              Share this clean preview link with your courier riders, delivery boys, and staff. When they open the link and register, their access request will appear under <span className="text-amber-300 font-semibold">Pending Approvals</span> below for your instant 1-click review.
            </p>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap sm:flex-nowrap">
            <div className="relative flex-1 sm:w-84">
              <input
                type="text"
                readOnly
                value={getAppShareUrl()}
                className="w-full bg-slate-950/90 border border-slate-700/80 rounded-xl px-3 py-2 text-xs font-mono text-blue-300 select-all focus:outline-none focus:border-blue-500 pr-24"
              />
              <button
                type="button"
                id="admin-copy-link-inner-btn"
                onClick={handleCopyShareLink}
                className="absolute right-1 top-1/2 -translate-y-1/2 px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow transition active:scale-95 flex items-center gap-1 cursor-pointer"
              >
                <Copy className="w-3 h-3" />
                <span>Copy</span>
              </button>
            </div>
            <button
              type="button"
              id="admin-share-link-main-btn"
              onClick={handleCopyShareLink}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-bold shadow-lg shadow-blue-600/25 transition active:scale-95 flex items-center gap-2 shrink-0 cursor-pointer"
            >
              <Share2 className="w-4 h-4" />
              <span>Share App Link</span>
            </button>

            <button
              type="button"
              id="admin-default-subscription-btn"
              onClick={handleOpenSubConfigModal}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold shadow-lg shadow-emerald-600/25 transition active:scale-95 flex items-center gap-2 shrink-0 cursor-pointer"
              title="Configure default subscription plan, monthly fee, and trial duration for new users"
            >
              <CreditCard className="w-4 h-4" />
              <span>New User Subscription ({defaultSubConfig.planType === 'paid' ? `₹${defaultSubConfig.monthlyFee}/mo` : 'Free'})</span>
            </button>

            {onOpenSyncOldApp && (
              <button
                type="button"
                id="admin-sync-old-app-btn"
                onClick={onOpenSyncOldApp}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white text-xs font-bold shadow-lg shadow-amber-600/25 transition active:scale-95 flex items-center gap-2 shrink-0 cursor-pointer"
                title="Sync from Old App URL: Import all 13+ riders, delivery entries, and dues from your previous app"
              >
                <CloudDownload className="w-4 h-4" />
                <span>Sync Old App</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* SECTION 1: Prominent "Access Requests / Pending Approvals" Section */}
      <div 
        id="pending-approvals-section"
        className={`rounded-2xl border transition p-5 sm:p-6 shadow-xl ${
          pendingUsers.length > 0
            ? 'bg-gradient-to-br from-amber-950/40 via-slate-900 to-slate-900 border-amber-500/40'
            : 'bg-slate-900/90 border-slate-800'
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold ${
              pendingUsers.length > 0
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse'
                : 'bg-slate-800 text-slate-400 border border-slate-700'
            }`}>
              <Bell className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white tracking-tight">
                  Access Requests / Pending Approvals
                </h2>
                {pendingUsers.length > 0 && (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-amber-500 text-slate-950 shadow animate-pulse">
                    {pendingUsers.length} NEW
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                New accounts require Admin approval before accessing riders, entries, or payout calculations.
              </p>
            </div>
          </div>

          {pendingUsers.length > 0 && (
            <button
              id="bulk-approve-all-btn"
              type="button"
              onClick={handleApproveAllPending}
              disabled={actionLoadingId === 'all-pending'}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-1.5 transition active:scale-95 disabled:opacity-50"
            >
              {actionLoadingId === 'all-pending' ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="w-3.5 h-3.5" />
              )}
              <span>Approve All ({pendingUsers.length})</span>
            </button>
          )}
        </div>

        {/* Pending Requests Content */}
        {loading ? (
          <div className="py-8 text-center text-slate-400 flex items-center justify-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin text-amber-400" />
            <span className="text-xs">Checking for pending access requests...</span>
          </div>
        ) : pendingUsers.length === 0 ? (
          <div className="py-6 flex items-center justify-center gap-3 text-center">
            <CheckCircle className="w-5 h-5 text-emerald-400" />
            <span className="text-sm font-medium text-slate-300">
              No pending requests. All registered users have been reviewed.
            </span>
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {pendingUsers.map((user) => {
              const isActing = actionLoadingId === user.uid;
              const formattedDate = user.createdAt
                ? new Date(user.createdAt).toLocaleString('en-IN', {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })
                : 'Just now';

              return (
                <div
                  key={user.uid}
                  id={`pending-card-${user.uid}`}
                  className="bg-slate-950/80 border border-amber-500/30 hover:border-amber-500/60 rounded-xl p-4 flex flex-col justify-between gap-3 shadow-md transition"
                >
                  <div className="flex items-start gap-3">
                    {user.photoURL ? (
                      <img
                        src={user.photoURL}
                        alt={user.displayName}
                        referrerPolicy="no-referrer"
                        className="w-10 h-10 rounded-xl object-cover border border-amber-500/40 shrink-0"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300 flex items-center justify-center font-bold text-sm shrink-0">
                        {user.displayName?.charAt(0)?.toUpperCase() || user.email?.charAt(0)?.toUpperCase() || 'U'}
                      </div>
                    )}

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-sm font-bold text-white truncate">
                          {user.displayName || user.name || 'New User'}
                        </span>
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                          Pending
                        </span>
                      </div>

                      <div className="text-xs text-slate-300 font-mono flex items-center gap-1 mt-0.5 truncate" title={user.email}>
                        <Mail className="w-3 h-3 text-slate-500 shrink-0" />
                        <span className="truncate">{user.email}</span>
                      </div>

                      <div className="text-[11px] text-slate-400 flex items-center gap-1 mt-1">
                        <Clock className="w-3 h-3 text-amber-400 shrink-0" />
                        <span>Requested: {formattedDate}</span>
                      </div>
                    </div>
                  </div>

                  {/* Two Clear Action Buttons: "Approve" and "Reject/Block" */}
                  <div className="flex items-center gap-2 pt-2 border-t border-slate-800">
                    <button
                      id={`approve-btn-${user.uid}`}
                      type="button"
                      onClick={(e) => handleApprove(user, e)}
                      disabled={isActing}
                      className="flex-1 py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md shadow-emerald-600/20 flex items-center justify-center gap-1.5 transition active:scale-95 disabled:opacity-50"
                    >
                      {isActing ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-200" />
                      )}
                      <span>Approve Access</span>
                    </button>

                    <button
                      id={`reject-btn-${user.uid}`}
                      type="button"
                      onClick={(e) => handleReject(user, e)}
                      disabled={isActing}
                      className="py-2 px-3 rounded-lg bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 hover:text-rose-200 font-semibold text-xs border border-rose-500/30 flex items-center justify-center gap-1.5 transition active:scale-95 disabled:opacity-50"
                      title="Reject and Block account"
                    >
                      <Ban className="w-3.5 h-3.5 text-rose-400" />
                      <span>Reject/Block</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* SECTION 2: Master Admin Super-Inspector & Export Suite */}
      <div 
        id="user-workspace-inspector-section"
        className="bg-slate-900/95 border border-indigo-500/40 rounded-2xl p-5 sm:p-6 shadow-2xl space-y-5"
      >
        {/* Section Header */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-800">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 flex items-center justify-center font-bold shrink-0 mt-0.5">
              <Eye className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-bold text-white tracking-tight">
                  User Workspace Inspector & Export Suite
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 tracking-wider uppercase">
                  Super-Inspector Mode
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Directly audit, review, and modify any user's isolated riders and delivery history. Export full bulk Excel/PDF reports or click single riders to inspect statements.
              </p>
            </div>
          </div>

          {/* Bulk Export Suite Buttons */}
          <div className="flex items-center gap-2 flex-wrap shrink-0">
            <button
              id="inspector-bulk-download-csv-btn"
              type="button"
              onClick={handleBulkExportCSV}
              disabled={!selectedUser || !workspaceData || workspaceData.riders.length === 0}
              className="px-3 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold flex items-center gap-1.5 shadow transition active:scale-95 cursor-pointer"
              title="Bulk Download All Riders: Clean CSV/Excel with full performance and dues"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Bulk Download (CSV/Excel)</span>
            </button>

            <button
              id="inspector-bulk-download-pdf-btn"
              type="button"
              onClick={handleBulkExportPDF}
              disabled={!selectedUser || !workspaceData || workspaceData.entries.length === 0}
              className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold flex items-center gap-1.5 shadow transition active:scale-95 cursor-pointer"
              title="Bulk Download PDF: Payout statement report for all riders of selected user"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Bulk Download (PDF)</span>
            </button>

            {onInspectUser && (
              <button
                id="inspector-open-full-mode-btn"
                type="button"
                onClick={() => selectedUser && onInspectUser(selectedUser)}
                disabled={!selectedUser}
                className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold flex items-center gap-1.5 shadow transition active:scale-95 cursor-pointer"
                title="Open Global Inspection Mode across Daily Entry, Riders, Settlement, and Analytics tabs"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Open Full Workspace Mode</span>
              </button>
            )}
          </div>
        </div>

        {/* User Workspace Dropdown Selector Row */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 p-3.5 rounded-xl bg-slate-950/70 border border-slate-800">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-300 shrink-0">
            <Users className="w-4 h-4 text-indigo-400" />
            <span>Select Hub User Workspace:</span>
          </div>

          <select
            id="super-inspector-user-dropdown"
            value={selectedInspectorUserId}
            onChange={(e) => setSelectedInspectorUserId(e.target.value)}
            className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-xs font-medium text-white focus:outline-none focus:border-indigo-500 cursor-pointer"
          >
            <option value="">-- Choose a Registered User Workspace to Inspect --</option>
            {users.map((u) => (
              <option key={u.uid} value={u.uid}>
                {u.displayName || u.name || u.email} ({u.email}) — [{u.status.toUpperCase()}]
              </option>
            ))}
          </select>

          {selectedInspectorUserId && (
            <button
              id="super-inspector-reload-btn"
              type="button"
              onClick={() => loadWorkspaceData(selectedInspectorUserId)}
              disabled={loadingWorkspace}
              className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold flex items-center gap-1.5 transition active:scale-95 disabled:opacity-50"
              title="Refresh Workspace Documents"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingWorkspace ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
          )}
        </div>

        {/* Inspector Workspace Details Content */}
        {!selectedInspectorUserId ? (
          <div className="py-10 text-center rounded-xl bg-slate-950/50 border border-dashed border-slate-800 p-6 space-y-2">
            <Eye className="w-8 h-8 text-indigo-400/60 mx-auto" />
            <h3 className="text-sm font-bold text-slate-300">
              No User Workspace Selected
            </h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Choose any registered user from the dropdown above to inspect their isolated riders collection, delivery records, and pending dues with full Master Edit and Export Suite controls.
            </p>
          </div>
        ) : loadingWorkspace ? (
          <div className="py-12 text-center rounded-xl bg-slate-950/50 border border-slate-800 p-6 space-y-3">
            <RefreshCw className="w-7 h-7 text-indigo-400 animate-spin mx-auto" />
            <div className="text-xs font-semibold text-slate-300">
              Loading workspace documents from <code className="text-indigo-300 font-mono">/workspaces/{selectedInspectorUserId}/*</code>...
            </div>
          </div>
        ) : selectedUser && workspaceData ? (
          <div className="space-y-4 animate-in fade-in">
            {/* Selected User Identity Banner & Governance */}
            <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-600/20 text-blue-400 border border-blue-500/30 flex items-center justify-center font-bold text-sm shrink-0">
                  {(selectedUser.displayName || selectedUser.email).charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-bold text-white">
                      {selectedUser.displayName || selectedUser.name || 'User'}
                    </span>
                    <span className="text-xs text-slate-400">({selectedUser.email})</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                      selectedUser.status === 'active' || selectedUser.status === 'approved'
                        ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                        : selectedUser.status === 'pending'
                        ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                        : 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                    }`}>
                      {selectedUser.status.toUpperCase()}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                    UID: {selectedUser.uid} • Created: {formatDateDisplay(selectedUser.createdAt)}
                  </p>
                </div>
              </div>

              {/* User Governance Quick Controls */}
              <div className="flex items-center gap-2 shrink-0">
                {selectedUser.status === 'pending' ? (
                  <>
                    <button
                      type="button"
                      onClick={() => handleApprove(selectedUser)}
                      className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition flex items-center gap-1"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Approve</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleReject(selectedUser)}
                      className="px-3 py-1.5 rounded-lg bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 text-xs font-semibold border border-rose-500/30 transition flex items-center gap-1"
                    >
                      <Ban className="w-3.5 h-3.5" />
                      <span>Reject</span>
                    </button>
                  </>
                ) : selectedUser.status === 'blocked' ? (
                  <button
                    type="button"
                    onClick={() => handleUnblock(selectedUser)}
                    className="px-3 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 text-xs font-semibold border border-emerald-500/30 transition flex items-center gap-1"
                  >
                    <Unlock className="w-3.5 h-3.5" />
                    <span>Unblock User</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleBlock(selectedUser)}
                    className="px-3 py-1.5 rounded-lg bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 text-xs font-semibold border border-rose-500/30 transition flex items-center gap-1"
                  >
                    <Ban className="w-3.5 h-3.5" />
                    <span>Block Access</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setManagingUser(selectedUser)}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold border border-slate-700 transition flex items-center gap-1"
                >
                  <Sliders className="w-3.5 h-3.5" />
                  <span>Configure Rates & Perms</span>
                </button>
              </div>
            </div>

            {/* 4 Financial Metric Cards */}
            {workspaceStats && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3.5">
                  <div className="flex items-center justify-between text-slate-400 text-xs">
                    <span>Registered Riders</span>
                    <Bike className="w-3.5 h-3.5 text-blue-400" />
                  </div>
                  <div className="text-xl font-bold text-white mt-1">
                    {workspaceStats.riderCount}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    In workspace
                  </div>
                </div>

                <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3.5">
                  <div className="flex items-center justify-between text-slate-400 text-xs">
                    <span>Delivered Parcels</span>
                    <Package className="w-3.5 h-3.5 text-indigo-400" />
                  </div>
                  <div className="text-xl font-bold text-white mt-1">
                    {workspaceStats.totalParcels.toLocaleString('en-IN')}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    Across {workspaceStats.entryCount} shifts
                  </div>
                </div>

                <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3.5">
                  <div className="flex items-center justify-between text-slate-400 text-xs">
                    <span>Total Gross Payout</span>
                    <Coins className="w-3.5 h-3.5 text-emerald-400" />
                  </div>
                  <div className="text-xl font-bold text-emerald-400 mt-1">
                    {formatINR(workspaceStats.totalGross)}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    Paid: {formatINR(workspaceStats.totalPaid)}
                  </div>
                </div>

                <div className="bg-slate-950/70 border border-amber-500/30 rounded-xl p-3.5">
                  <div className="flex items-center justify-between text-amber-400 text-xs">
                    <span>Total Pending Dues</span>
                    <Clock className="w-3.5 h-3.5 text-amber-400" />
                  </div>
                  <div className="text-xl font-bold text-amber-400 mt-1">
                    {formatINR(workspaceStats.totalUnpaid)}
                  </div>
                  <div className="text-[11px] text-amber-400/80 mt-0.5">
                    {workspaceStats.unpaidCount} unpaid deliveries
                  </div>
                </div>
              </div>
            )}

            {/* Riders Directory within Selected Workspace */}
            <div className="space-y-3 pt-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Bike className="w-4 h-4 text-indigo-400" />
                  <h3 className="text-sm font-bold text-white">
                    Workspace Riders Directory ({filteredWorkspaceRiders.length})
                  </h3>
                  <span className="text-xs text-slate-400">
                    Click any rider to inspect delivery breakdown, dues, or trigger downloads
                  </span>
                </div>

                <div className="relative w-full sm:w-64">
                  <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={workspaceRiderSearch}
                    onChange={(e) => setWorkspaceRiderSearch(e.target.value)}
                    placeholder="Search riders or phone..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              {filteredWorkspaceRiders.length === 0 ? (
                <div className="py-8 text-center bg-slate-950/40 rounded-xl border border-slate-800 text-slate-400 text-xs">
                  {workspaceRiderSearch
                    ? 'No riders match your search query.'
                    : 'No riders found in this workspace yet. You can use Full Workspace Mode to register riders.'}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {filteredWorkspaceRiders.map((rider) => {
                    const riderEntries = workspaceData.entries.filter((e) => e.riderId === rider.id);
                    const rParcels = riderEntries.reduce((sum, e) => sum + (e.parcels || 0), 0);
                    const rGross = riderEntries.reduce((sum, e) => sum + (e.totalEarnings || 0), 0);
                    const rUnpaid = riderEntries
                      .filter((e) => e.status === 'Unpaid')
                      .reduce((sum, e) => sum + (e.totalEarnings || 0), 0);
                    const rUnpaidCount = riderEntries.filter((e) => e.status === 'Unpaid').length;

                    const cleanDigits = getCleanPhoneDigits(rider.phone);
                    const hasValidPhone = Boolean(cleanDigits && cleanDigits.length >= 10);
                    const waLink = hasValidPhone
                      ? `https://wa.me/91${cleanDigits.slice(-10)}?text=${encodeURIComponent(
                          `Namaste ${rider.name}, this is from courier management regarding your deliveries and dues.`
                        )}`
                      : '#';

                    return (
                      <div
                        key={rider.id}
                        id={`inspector-rider-card-${rider.id}`}
                        className="bg-slate-950/70 border border-slate-800 hover:border-indigo-500/50 rounded-xl p-4 flex flex-col justify-between gap-3 shadow transition"
                      >
                        <div>
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <h4 className="text-sm font-bold text-white truncate">
                                {rider.name}
                              </h4>
                              <p className="text-xs text-slate-400 mt-0.5">
                                {rider.vehicleType || 'Hero Splendor (Bike)'}
                              </p>
                            </div>

                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border shrink-0 ${
                              rider.active !== false
                                ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                                : 'bg-slate-800 text-slate-400 border-slate-700'
                            }`}>
                              {rider.active !== false ? 'Active' : 'Inactive'}
                            </span>
                          </div>

                          {/* Quick Communication Buttons */}
                          <div className="flex items-center gap-2 mt-2 pt-2 border-t border-slate-800/80">
                            {hasValidPhone ? (
                              <>
                                <a
                                  id={`call-rider-${rider.id}`}
                                  href={`tel:${rider.phone}`}
                                  className="px-2.5 py-1 rounded-md bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 text-[11px] font-semibold border border-emerald-500/30 flex items-center gap-1 transition active:scale-95"
                                  title={`Call +91 ${rider.phone}`}
                                >
                                  <Phone className="w-3 h-3" />
                                  <span>Call ({formatPhoneNumber(rider.phone)})</span>
                                </a>

                                <a
                                  id={`wa-rider-${rider.id}`}
                                  href={waLink}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="px-2 py-1 rounded-md bg-[#25D366]/20 hover:bg-[#25D366]/30 text-[#25D366] text-[11px] font-semibold border border-[#25D366]/30 flex items-center gap-1 transition active:scale-95"
                                  title="WhatsApp"
                                >
                                  <MessageCircle className="w-3 h-3" />
                                  <span>WhatsApp</span>
                                </a>
                              </>
                            ) : (
                              <span className="text-[11px] text-slate-500 italic">No phone registered</span>
                            )}
                          </div>

                          {/* Rider Financial Stats */}
                          <div className="grid grid-cols-2 gap-2 mt-3 p-2.5 rounded-lg bg-slate-900 border border-slate-800/80 text-xs">
                            <div>
                              <span className="text-[10px] text-slate-400 block">Parcels Delivered</span>
                              <span className="font-bold text-white">{rParcels} pkts</span>
                              <span className="text-[10px] text-slate-500 block">
                                Base: ₹{rider.baseRate ?? 13}
                              </span>
                            </div>
                            <div className="text-right">
                              <span className="text-[10px] text-slate-400 block">Pending Due</span>
                              <span className={`font-bold ${rUnpaid > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                                {formatINR(rUnpaid)}
                              </span>
                              <span className="text-[10px] text-slate-500 block">
                                {rUnpaidCount} unpaid
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Inspector & Download Actions */}
                        <div className="pt-2 border-t border-slate-800 flex items-center gap-2">
                          <button
                            id={`inspect-rider-btn-${rider.id}`}
                            type="button"
                            onClick={() => setInspectingRider(rider)}
                            className="flex-1 py-1.5 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow transition active:scale-95 cursor-pointer"
                            title="Inspect full delivery breakdown, rates, and dues"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>Inspect & Edit</span>
                          </button>

                          <button
                            id={`quick-pdf-rider-btn-${rider.id}`}
                            type="button"
                            onClick={() => {
                              if (riderEntries.length === 0) {
                                showToast(`No deliveries for ${rider.name}`, 'info');
                                return;
                              }
                              const dates = riderEntries.map((e) => e.date).sort();
                              generatePayoutPDF({
                                title: `Rider Payout Statement - ${rider.name}`,
                                riderFilterName: rider.name,
                                startDate: dates[0] || new Date().toISOString().split('T')[0],
                                endDate: dates[dates.length - 1] || dates[0],
                                entries: riderEntries,
                                riders: [rider],
                              });
                            }}
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition"
                            title="Download Single Rider PDF"
                          >
                            <FileText className="w-3.5 h-3.5 text-blue-400" />
                          </button>

                          <button
                            id={`quick-csv-rider-btn-${rider.id}`}
                            type="button"
                            onClick={() => {
                              exportSingleRiderToCSV({
                                userName: selectedUser.displayName || selectedUser.name || selectedUser.email,
                                userEmail: selectedUser.email,
                                rider,
                                entries: riderEntries,
                              });
                            }}
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition"
                            title="Download Single Rider Excel/CSV"
                          >
                            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        ) : null}
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div id="stat-card-total" className="bg-slate-900 border border-slate-800 rounded-xl p-4 sm:p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Total Users
            </span>
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-3xl font-extrabold text-white">
            {loading ? '...' : users.length}
          </div>
          <p className="text-xs text-slate-400 mt-1">Total registered in <code className="text-slate-400 font-mono">all_users</code></p>
        </div>

        <div id="stat-card-pending" className="bg-slate-900 border border-amber-500/30 rounded-xl p-4 sm:p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-amber-400 uppercase tracking-wider">
              Pending Requests
            </span>
            <div className="w-8 h-8 rounded-lg bg-amber-500/15 text-amber-400 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-3xl font-extrabold text-amber-400">
            {loading ? '...' : pendingUsers.length}
          </div>
          <p className="text-xs text-slate-400 mt-1">Awaiting admin review</p>
        </div>

        <div id="stat-card-active" className="bg-slate-900 border border-slate-800 rounded-xl p-4 sm:p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">
              Active / Approved
            </span>
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
              <UserCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-3xl font-extrabold text-emerald-400">
            {loading ? '...' : activeCount}
          </div>
          <p className="text-xs text-slate-400 mt-1">Full system access</p>
        </div>

        <div id="stat-card-blocked" className="bg-slate-900 border border-slate-800 rounded-xl p-4 sm:p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-rose-400 uppercase tracking-wider">
              Blocked Users
            </span>
            <div className="w-8 h-8 rounded-lg bg-rose-500/10 text-rose-400 flex items-center justify-center">
              <UserX className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-3xl font-extrabold text-rose-400">
            {loading ? '...' : blockedCount}
          </div>
          <p className="text-xs text-slate-400 mt-1">Access revoked by admin</p>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
        {/* Search */}
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            id="admin-user-search-input"
            type="text"
            placeholder="Search by name, email, or UID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-blue-500 transition"
          />
        </div>

        {/* Status Filter Tabs */}
        <div className="flex items-center gap-1.5 w-full sm:w-auto bg-slate-950 p-1 rounded-xl border border-slate-800 flex-wrap">
          <button
            id="filter-all-btn"
            type="button"
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
              statusFilter === 'all'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            All ({users.length})
          </button>
          <button
            id="filter-pending-btn"
            type="button"
            onClick={() => setStatusFilter('pending')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
              statusFilter === 'pending'
                ? 'bg-amber-600 text-white shadow-sm'
                : 'text-amber-400/80 hover:text-amber-300'
            }`}
          >
            Pending ({pendingUsers.length})
          </button>
          <button
            id="filter-active-btn"
            type="button"
            onClick={() => setStatusFilter('active')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
              statusFilter === 'active'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Active ({activeCount})
          </button>
          <button
            id="filter-blocked-btn"
            type="button"
            onClick={() => setStatusFilter('blocked')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
              statusFilter === 'blocked'
                ? 'bg-rose-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Blocked ({blockedCount})
          </button>
        </div>
      </div>

      {/* Clean User Registry Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        {loading ? (
          <div className="py-16 text-center text-slate-400 flex flex-col items-center justify-center gap-3">
            <RefreshCw className="w-6 h-6 animate-spin text-blue-400" />
            <p className="text-sm">Fetching user accounts from Firestore all_users...</p>
          </div>
        ) : error ? (
          <div className="py-12 px-6 text-center text-rose-400 flex flex-col items-center gap-2">
            <AlertTriangle className="w-8 h-8 text-rose-400" />
            <p className="text-sm font-medium">{error}</p>
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="py-16 text-center text-slate-400 flex flex-col items-center justify-center gap-2">
            <Users className="w-10 h-10 text-slate-600" />
            <p className="text-sm font-medium text-slate-300">No users match your criteria</p>
            <p className="text-xs text-slate-500">Try adjusting your search query or status filter.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950/60 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                  <th className="py-3.5 px-4 sm:px-6">User Name</th>
                  <th className="py-3.5 px-4">Email ID</th>
                  <th className="py-3.5 px-4 text-center">Status</th>
                  <th className="py-3.5 px-4 text-center">Subscription</th>
                  <th className="py-3.5 px-4">Feature Permissions</th>
                  <th className="py-3.5 px-4 sm:px-6 text-right">Action Controls</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80 text-sm">
                {filteredUsers.map((user) => {
                  const isAdmin = isSuperAdmin(user.email);
                  const isPending = user.status === 'pending';
                  const isBlocked = user.status === 'blocked' || user.status === 'deactivated';
                  const isActive = user.status === 'active' || user.status === 'approved';
                  const isActionLoading = actionLoadingId === user.uid;
                  const perms = user.permissions || DEFAULT_USER_PERMISSIONS;

                  return (
                    <tr
                      key={user.uid}
                      id={`user-row-${user.uid}`}
                      onClick={() => setManagingUser(user)}
                      className={`hover:bg-slate-800/40 cursor-pointer transition ${
                        isPending ? 'bg-amber-950/10' : isBlocked ? 'bg-rose-950/10' : ''
                      }`}
                    >
                      {/* 1. User Name */}
                      <td className="py-4 px-4 sm:px-6">
                        <div className="flex items-center gap-3">
                          <div className="relative flex-shrink-0">
                            {user.photoURL ? (
                              <img
                                src={user.photoURL}
                                alt={user.displayName}
                                referrerPolicy="no-referrer"
                                className="w-9 h-9 rounded-xl object-cover border border-slate-700 shadow-sm"
                              />
                            ) : (
                              <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs border shadow-sm ${
                                isAdmin
                                  ? 'bg-amber-500/15 border-amber-500/30 text-amber-300'
                                  : isPending
                                  ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                                  : isBlocked
                                  ? 'bg-rose-500/15 border-rose-500/30 text-rose-300'
                                  : 'bg-blue-500/15 border-blue-500/30 text-blue-300'
                              }`}>
                                {user.displayName?.charAt(0)?.toUpperCase() || user.email?.charAt(0)?.toUpperCase() || 'U'}
                              </div>
                            )}
                            <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border border-slate-900 ${
                              isPending ? 'bg-amber-400 animate-pulse' : isBlocked ? 'bg-rose-500' : 'bg-emerald-400'
                            }`} />
                          </div>

                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-semibold text-white text-sm truncate max-w-[160px]">
                                {user.displayName || user.name || 'User'}
                              </span>
                              {isAdmin && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                  <Shield className="w-2.5 h-2.5" />
                                  Master
                                </span>
                              )}
                              {inspectedUserId === user.uid && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/40">
                                  Inspecting
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-500 font-mono flex items-center gap-1 mt-0.5">
                              <span>UID: {user.uid.slice(0, 8)}...</span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleCopyUid(user.uid);
                                }}
                                className="hover:text-slate-300"
                                title="Copy UID"
                              >
                                {copiedUid === user.uid ? (
                                  <Check className="w-3 h-3 text-emerald-400" />
                                ) : (
                                  <Copy className="w-3 h-3" />
                                )}
                              </button>
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* 2. Email ID & Request Date */}
                      <td className="py-4 px-4 font-mono text-xs text-slate-300">
                        <div className="flex items-center gap-1.5">
                          <Mail className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                          <span className="truncate max-w-[200px]" title={user.email}>
                            {user.email || 'No Email'}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-400 font-sans mt-1 flex items-center gap-1">
                          <Clock className="w-3 h-3 text-slate-500" />
                          <span>
                            {user.createdAt
                              ? new Date(user.createdAt).toLocaleString('en-IN', {
                                  dateStyle: 'medium',
                                  timeStyle: 'short',
                                })
                              : 'Recent'}
                          </span>
                        </div>
                      </td>

                      {/* 3. Status (Pending/Approved/Blocked) */}
                      <td className="py-4 px-4 text-center">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${
                          isPending
                            ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                            : isBlocked
                            ? 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                            : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${
                            isPending ? 'bg-amber-400 animate-pulse' : isBlocked ? 'bg-rose-400' : 'bg-emerald-400'
                          }`} />
                          {isPending ? 'Pending' : isBlocked ? 'Blocked' : 'Approved'}
                        </span>
                      </td>

                      {/* 3b. Subscription Plan & Payment Status */}
                      <td className="py-4 px-4 text-center">
                        <div className="inline-flex flex-col items-center gap-1">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                            user.subscription?.planType === 'paid'
                              ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                              : 'bg-slate-800 text-slate-300 border-slate-700'
                          }`}>
                            <CreditCard className="w-2.5 h-2.5" />
                            {user.subscription?.planType === 'paid' ? `Paid (₹${user.subscription.monthlyFee ?? 0})` : 'Free'}
                          </span>

                          <span className={`inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] font-medium border ${
                            user.subscription?.paymentStatus === 'active'
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                              : user.subscription?.paymentStatus === 'verification_pending'
                              ? 'bg-blue-500/20 text-blue-300 border-blue-500/40 animate-pulse'
                              : user.subscription?.paymentStatus === 'expiring_soon'
                              ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                              : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                          }`}>
                            {user.subscription?.paymentStatus === 'verification_pending'
                              ? 'Slip Pending'
                              : (user.subscription?.paymentStatus || 'Active').replace('_', ' ')}
                          </span>
                        </div>
                      </td>

                      {/* 4. Feature Permissions (Live Click to Toggle) */}
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {/* Daily Entry */}
                          <button
                            type="button"
                            onClick={(e) => handleToggleFeature(user, 'dailyEntry', e)}
                            disabled={permLoadingKey === `${user.uid}-dailyEntry`}
                            className={`px-2 py-1 rounded-lg text-xs font-medium border flex items-center gap-1 transition ${
                              perms.dailyEntry
                                ? 'bg-blue-950/70 text-blue-300 border-blue-700 hover:bg-blue-900/80'
                                : 'bg-slate-900 text-slate-500 border-slate-800 line-through hover:text-slate-400'
                            }`}
                            title="Click to toggle Daily Entry permission"
                          >
                            <Package className="w-3 h-3" />
                            <span>Entry</span>
                            <span className="text-[10px] font-bold">
                              {perms.dailyEntry ? '✓' : '✕'}
                            </span>
                          </button>

                          {/* Riders */}
                          <button
                            type="button"
                            onClick={(e) => handleToggleFeature(user, 'riders', e)}
                            disabled={permLoadingKey === `${user.uid}-riders`}
                            className={`px-2 py-1 rounded-lg text-xs font-medium border flex items-center gap-1 transition ${
                              perms.riders
                                ? 'bg-emerald-950/70 text-emerald-300 border-emerald-700 hover:bg-emerald-900/80'
                                : 'bg-slate-900 text-slate-500 border-slate-800 line-through hover:text-slate-400'
                            }`}
                            title="Click to toggle Riders directory permission"
                          >
                            <Bike className="w-3 h-3" />
                            <span>Riders</span>
                            <span className="text-[10px] font-bold">
                              {perms.riders ? '✓' : '✕'}
                            </span>
                          </button>

                          {/* Incentives */}
                          <button
                            type="button"
                            onClick={(e) => handleToggleFeature(user, 'incentives', e)}
                            disabled={permLoadingKey === `${user.uid}-incentives`}
                            className={`px-2 py-1 rounded-lg text-xs font-medium border flex items-center gap-1 transition ${
                              perms.incentives
                                ? 'bg-amber-950/70 text-amber-300 border-amber-700 hover:bg-amber-900/80'
                                : 'bg-slate-900 text-slate-500 border-slate-800 line-through hover:text-slate-400'
                            }`}
                            title="Click to toggle Incentive calculation permission"
                          >
                            <Sparkles className="w-3 h-3" />
                            <span>Incentives</span>
                            <span className="text-[10px] font-bold">
                              {perms.incentives ? '✓' : '✕'}
                            </span>
                          </button>

                          {/* Reports */}
                          <button
                            type="button"
                            onClick={(e) => handleToggleFeature(user, 'reports', e)}
                            disabled={permLoadingKey === `${user.uid}-reports`}
                            className={`px-2 py-1 rounded-lg text-xs font-medium border flex items-center gap-1 transition ${
                              perms.reports
                                ? 'bg-purple-950/70 text-purple-300 border-purple-700 hover:bg-purple-900/80'
                                : 'bg-slate-900 text-slate-500 border-slate-800 line-through hover:text-slate-400'
                            }`}
                            title="Click to toggle Reports & Settlement permission"
                          >
                            <FileSpreadsheet className="w-3 h-3" />
                            <span>Reports</span>
                            <span className="text-[10px] font-bold">
                              {perms.reports ? '✓' : '✕'}
                            </span>
                          </button>
                        </div>
                      </td>

                      {/* 5. Action Controls */}
                      <td className="py-4 px-4 sm:px-6 text-right">
                        <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                          {/* If Pending: Show "Approve" & "Reject" buttons */}
                          {isPending && (
                            <>
                              <button
                                id={`row-approve-btn-${user.uid}`}
                                type="button"
                                onClick={(e) => handleApprove(user, e)}
                                disabled={isActionLoading}
                                className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow flex items-center gap-1 transition active:scale-95 cursor-pointer"
                                title="Approve user access"
                              >
                                {isActionLoading ? (
                                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                )}
                                <span>Approve</span>
                              </button>
                              <button
                                id={`row-reject-btn-${user.uid}`}
                                type="button"
                                onClick={(e) => handleReject(user, e)}
                                disabled={isActionLoading}
                                className="px-3 py-1.5 rounded-xl bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 text-xs font-semibold border border-rose-500/30 flex items-center gap-1 transition cursor-pointer"
                                title="Reject access request"
                              >
                                <Ban className="w-3.5 h-3.5" />
                                <span>Reject</span>
                              </button>
                            </>
                          )}

                          {/* Inspect Workspace button (for approved/active users) */}
                          {isActive && onInspectUser && (
                            <button
                              id={`inspect-user-btn-${user.uid}`}
                              type="button"
                              onClick={() => onInspectUser(user)}
                              className="px-2.5 py-1.5 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 hover:text-white text-xs border border-indigo-500/40 flex items-center gap-1 transition font-semibold cursor-pointer"
                              title="Switch into user workspace to inspect riders, entries, and reports"
                            >
                              <Eye className="w-3.5 h-3.5 text-indigo-400" />
                              <span>Inspect</span>
                            </button>
                          )}

                          {/* Block button for active/approved non-admin users */}
                          {!isAdmin && isActive && (
                            <button
                              id={`block-user-btn-${user.uid}`}
                              type="button"
                              onClick={(e) => handleBlock(user, e)}
                              disabled={isActionLoading}
                              className="px-3 py-1.5 rounded-xl bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/40 text-xs font-semibold flex items-center gap-1 transition cursor-pointer"
                              title="Immediately lock out and restrict access for this active user"
                            >
                              {isActionLoading ? (
                                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Ban className="w-3.5 h-3.5 text-rose-400" />
                              )}
                              <span>Block</span>
                            </button>
                          )}

                          {/* Unblock button for blocked users */}
                          {!isAdmin && isBlocked && (
                            <button
                              id={`unblock-user-btn-${user.uid}`}
                              type="button"
                              onClick={(e) => handleUnblock(user, e)}
                              disabled={isActionLoading}
                              className="px-3 py-1.5 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 text-xs font-semibold flex items-center gap-1 transition cursor-pointer"
                              title="Restore access for this previously blocked user"
                            >
                              {isActionLoading ? (
                                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Unlock className="w-3.5 h-3.5 text-emerald-400" />
                              )}
                              <span>Unblock</span>
                            </button>
                          )}

                          {/* Master Admin Indicator */}
                          {isAdmin && (
                            <span className="text-[11px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/30 px-2.5 py-1 rounded-lg">
                              Master Admin
                            </span>
                          )}

                          {/* Quick Inspect Button */}
                          <button
                            id={`table-inspect-btn-${user.uid}`}
                            type="button"
                            onClick={() => {
                              setSelectedInspectorUserId(user.uid);
                              document.getElementById('user-workspace-inspector-section')?.scrollIntoView({ behavior: 'smooth' });
                            }}
                            className="px-2.5 py-1.5 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 hover:text-white text-xs border border-indigo-500/40 flex items-center gap-1 transition font-semibold cursor-pointer"
                            title="Inspect riders, delivery history, and dues in the Super-Inspector"
                          >
                            <Eye className="w-3.5 h-3.5 text-indigo-400" />
                            <span>Inspect</span>
                          </button>

                          {/* Manage rates button */}
                          <button
                            id={`manage-user-btn-${user.uid}`}
                            type="button"
                            onClick={() => setManagingUser(user)}
                            className="px-2.5 py-1.5 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 hover:text-white text-xs border border-blue-500/40 flex items-center gap-1 transition font-semibold cursor-pointer"
                            title="Manage user rates, custom slabs, and riders"
                          >
                            <Sliders className="w-3.5 h-3.5 text-blue-400" />
                            <span>Manage</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Mobile Cards View (Visible on small screens) */}
            <div className="md:hidden divide-y divide-slate-800 p-3 space-y-3">
              {filteredUsers.map((user) => {
                const isAdmin = isSuperAdmin(user.email);
                const isPending = user.status === 'pending';
                const isBlocked = user.status === 'blocked' || user.status === 'deactivated';
                const isActive = user.status === 'active' || user.status === 'approved';
                const isActionLoading = actionLoadingId === user.uid;

                return (
                  <div
                    key={`mobile-user-${user.uid}`}
                    id={`mobile-user-card-${user.uid}`}
                    className={`bg-slate-950/70 border rounded-xl p-4 space-y-3 ${
                      isPending
                        ? 'border-amber-500/40 bg-amber-950/10'
                        : isBlocked
                        ? 'border-rose-500/40 bg-rose-950/10'
                        : 'border-slate-800'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs border shrink-0 ${
                          isAdmin
                            ? 'bg-amber-500/15 border-amber-500/30 text-amber-300'
                            : isPending
                            ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                            : isBlocked
                            ? 'bg-rose-500/15 border-rose-500/30 text-rose-300'
                            : 'bg-blue-500/15 border-blue-500/30 text-blue-300'
                        }`}>
                          {user.displayName?.charAt(0)?.toUpperCase() || user.email?.charAt(0)?.toUpperCase() || 'U'}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-bold text-white text-sm truncate">
                              {user.displayName || user.name || 'User'}
                            </span>
                            {isAdmin && (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                Master
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-slate-300 font-mono flex items-center gap-1 mt-0.5 truncate" title={user.email}>
                            <Mail className="w-3 h-3 text-slate-500 shrink-0" />
                            <span className="truncate">{user.email || 'No Email'}</span>
                          </div>
                        </div>
                      </div>

                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border shrink-0 ${
                        isPending
                          ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                          : isBlocked
                          ? 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                          : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${
                          isPending ? 'bg-amber-400 animate-pulse' : isBlocked ? 'bg-rose-400' : 'bg-emerald-400'
                        }`} />
                        {isPending ? 'Pending' : isBlocked ? 'Blocked' : 'Approved'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-slate-850">
                      <div className="flex items-center gap-1 font-mono">
                        <span>UID: {user.uid.slice(0, 10)}...</span>
                        <button
                          type="button"
                          onClick={() => handleCopyUid(user.uid)}
                          className="p-1 hover:text-white"
                          title="Copy UID"
                        >
                          {copiedUid === user.uid ? (
                            <Check className="w-3 h-3 text-emerald-400" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </button>
                      </div>
                      <div className="flex items-center gap-1">
                        <Clock className="w-3 h-3 text-slate-500" />
                        <span>
                          {user.createdAt
                            ? new Date(user.createdAt).toLocaleDateString('en-IN', {
                                day: 'numeric',
                                month: 'short',
                                year: 'numeric',
                              })
                            : 'Recent'}
                        </span>
                      </div>
                    </div>

                    {/* Subscription summary badge on mobile */}
                    <div className="flex items-center justify-between text-xs py-1.5 px-2.5 rounded-lg bg-slate-900 border border-slate-800">
                      <div className="flex items-center gap-1.5">
                        <CreditCard className="w-3.5 h-3.5 text-blue-400" />
                        <span className="font-semibold text-slate-200 text-xs">
                          {user.subscription?.planType === 'paid' ? `Paid (₹${user.subscription.monthlyFee ?? 0}/mo)` : 'Free Plan'}
                        </span>
                      </div>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                        user.subscription?.paymentStatus === 'active'
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : user.subscription?.paymentStatus === 'verification_pending'
                          ? 'bg-blue-500/20 text-blue-300 animate-pulse'
                          : user.subscription?.paymentStatus === 'expiring_soon'
                          ? 'bg-amber-500/20 text-amber-300'
                          : 'bg-rose-500/20 text-rose-300'
                      }`}>
                        {user.subscription?.paymentStatus === 'verification_pending' ? 'Verification Pending' : (user.subscription?.paymentStatus || 'Active').replace('_', ' ')}
                      </span>
                    </div>

                    {/* Action buttons on mobile */}
                    <div className="flex items-center gap-2 pt-2 border-t border-slate-850 flex-wrap">
                      {isPending && (
                        <>
                          <button
                            type="button"
                            onClick={(e) => handleApprove(user, e)}
                            disabled={isActionLoading}
                            className="flex-1 py-1.5 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-1 cursor-pointer"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Approve</span>
                          </button>
                          <button
                            type="button"
                            onClick={(e) => handleReject(user, e)}
                            disabled={isActionLoading}
                            className="py-1.5 px-3 rounded-lg bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 font-semibold text-xs border border-rose-500/30 flex items-center justify-center gap-1 cursor-pointer"
                          >
                            <Ban className="w-3.5 h-3.5" />
                            <span>Reject</span>
                          </button>
                        </>
                      )}

                      {!isAdmin && isActive && (
                        <button
                          type="button"
                          onClick={(e) => handleBlock(user, e)}
                          disabled={isActionLoading}
                          className="flex-1 py-1.5 px-3 rounded-lg bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/40 font-semibold text-xs flex items-center justify-center gap-1 cursor-pointer"
                        >
                          <Ban className="w-3.5 h-3.5" />
                          <span>Block User</span>
                        </button>
                      )}

                      {!isAdmin && isBlocked && (
                        <button
                          type="button"
                          onClick={(e) => handleUnblock(user, e)}
                          disabled={isActionLoading}
                          className="flex-1 py-1.5 px-3 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 font-semibold text-xs flex items-center justify-center gap-1 cursor-pointer"
                        >
                          <Unlock className="w-3.5 h-3.5" />
                          <span>Unblock User</span>
                        </button>
                      )}

                      {isActive && onInspectUser && (
                        <button
                          type="button"
                          onClick={() => onInspectUser(user)}
                          className="py-1.5 px-2.5 rounded-lg bg-indigo-600/20 text-indigo-300 border border-indigo-500/40 text-xs font-semibold flex items-center gap-1"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Inspect</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => setManagingUser(user)}
                        className="py-1.5 px-2.5 rounded-lg bg-blue-600/20 text-blue-300 border border-blue-500/40 text-xs font-semibold flex items-center gap-1"
                      >
                        <Sliders className="w-3.5 h-3.5" />
                        <span>Manage</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
      </div>
      ) : (
        <div className="space-y-6 animate-in fade-in">
          {/* Top-Level Expiry Alerts (48-Hour) & Pending Slips Approval Section */}
          <AdminBillingExpiryAndSlips
            users={users}
            onApproveSlip={handleApproveSlip}
            onRejectSlip={handleRejectSlip}
            onExtendDays={handleExtendUserDays}
            onOpenQrModal={(user) => setQrModalUser(user)}
            onOpenSlipReviewModal={(user) => setSlipReviewUser(user)}
            onManageUser={(user) => setManagingUser(user)}
            actionLoadingId={actionLoadingId}
          />

          {/* Subscription KPI Metric Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
            {/* 1. Total Registered Accounts */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-sm">
              <div className="flex items-center justify-between text-slate-400 text-xs font-semibold uppercase tracking-wider">
                <span>Total Users</span>
                <Users className="w-4 h-4 text-blue-400" />
              </div>
              <div className="mt-2 text-2xl font-extrabold text-white">{users.length}</div>
              <div className="text-[11px] text-slate-400 mt-0.5">Registered accounts</div>
            </div>

            {/* 2. Free Plan Accounts */}
            <div className="bg-slate-900/90 border border-emerald-500/30 rounded-2xl p-4 shadow-sm">
              <div className="flex items-center justify-between text-emerald-400 text-xs font-semibold uppercase tracking-wider">
                <span>Free Plan</span>
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              </div>
              <div className="mt-2 text-2xl font-extrabold text-emerald-400">{subStats.freeCount}</div>
              <div className="text-[11px] text-emerald-400/80 mt-0.5 font-medium">Never receives alerts or locks</div>
            </div>

            {/* 3. Paid Plan Accounts */}
            <div className="bg-slate-900/90 border border-amber-500/30 rounded-2xl p-4 shadow-sm">
              <div className="flex items-center justify-between text-amber-400 text-xs font-semibold uppercase tracking-wider">
                <span>Paid Plan</span>
                <CreditCard className="w-4 h-4 text-amber-400" />
              </div>
              <div className="mt-2 text-2xl font-extrabold text-amber-400">{subStats.paidCount}</div>
              <div className="text-[11px] text-amber-400/80 mt-0.5">Custom monthly billing</div>
            </div>

            {/* 4. Active Subscriptions */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-sm">
              <div className="flex items-center justify-between text-slate-400 text-xs font-semibold uppercase tracking-wider">
                <span>Active Subscriptions</span>
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="mt-2 text-2xl font-extrabold text-emerald-300">{subStats.activePaidCount}</div>
              <div className="text-[11px] text-slate-400 mt-0.5">Paid and verified</div>
            </div>

            {/* 5. Slips Pending Verification */}
            <div className={`rounded-2xl p-4 border transition shadow-sm ${
              subStats.slipPendingCount > 0 
                ? 'bg-amber-950/30 border-amber-500 shadow-amber-500/10' 
                : 'bg-slate-900/90 border-slate-800'
            }`}>
              <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider">
                <span className={subStats.slipPendingCount > 0 ? 'text-amber-300 font-bold' : 'text-slate-400'}>
                  Slips Pending
                </span>
                <Clock className={`w-4 h-4 ${subStats.slipPendingCount > 0 ? 'text-amber-400 animate-pulse' : 'text-slate-500'}`} />
              </div>
              <div className={`mt-2 text-2xl font-extrabold ${subStats.slipPendingCount > 0 ? 'text-amber-400' : 'text-slate-400'}`}>
                {subStats.slipPendingCount}
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                {subStats.slipPendingCount > 0 ? 'Review & approve slips' : 'All slips reviewed'}
              </div>
            </div>

            {/* 6. Projected Monthly SaaS Revenue */}
            <div className="bg-slate-900/90 border border-teal-500/30 rounded-2xl p-4 shadow-sm">
              <div className="flex items-center justify-between text-teal-400 text-xs font-semibold uppercase tracking-wider">
                <span>Monthly Revenue</span>
                <span className="font-bold text-teal-400">₹</span>
              </div>
              <div className="mt-2 text-2xl font-extrabold text-teal-300">
                ₹{subStats.projectedMonthlyRevenue.toLocaleString('en-IN')}
              </div>
              <div className="text-[11px] text-teal-400/80 mt-0.5">Sum of active fees</div>
            </div>
          </div>

          {/* Search, Filter Bar & Global Defaults */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 shadow-sm">
            {/* Search Input */}
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                id="admin-sub-search-input"
                type="text"
                value={subSearchQuery}
                onChange={(e) => setSubSearchQuery(e.target.value)}
                placeholder="Search users by name, email, or UID..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500 transition"
              />
            </div>

            {/* Filter Tabs */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {[
                { id: 'all', label: 'All Users', count: users.length },
                { id: 'paid', label: 'Paid Plan', count: subStats.paidCount },
                { id: 'free', label: 'Free Plan', count: subStats.freeCount },
                { id: 'verification_pending', label: 'Slip Pending', count: subStats.slipPendingCount, alert: subStats.slipPendingCount > 0 },
                { id: 'expired', label: 'Expired', count: subStats.expiredCount }
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setSubFilter(tab.id as any)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
                    subFilter === tab.id
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                      : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
                  }`}
                >
                  <span>{tab.label}</span>
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                    tab.alert
                      ? 'bg-amber-500 text-slate-950 font-bold animate-pulse'
                      : subFilter === tab.id
                      ? 'bg-blue-500 text-white'
                      : 'bg-slate-800 text-slate-400'
                  }`}>
                    {tab.count}
                  </span>
                </button>
              ))}

              <button
                type="button"
                id="sub-global-default-btn"
                onClick={handleOpenSubConfigModal}
                className="px-3.5 py-1.5 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 text-xs font-bold transition flex items-center gap-1.5 ml-auto cursor-pointer"
                title="Configure default plan, monthly fee, and trial duration for newly registering users"
              >
                <Sliders className="w-3.5 h-3.5" />
                <span>New User Defaults</span>
              </button>
            </div>
          </div>

          {/* Table / List of all registered users with their current subscription status */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
            <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-emerald-400" />
                  <span>Subscription & Billing Registry</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Set plan type, custom monthly fees (₹), upload custom UPI QR codes, and approve payment slips. Settings save directly to Firestore.
                </p>
              </div>

              <span className="text-xs text-slate-400 font-mono">
                Showing {filteredSubUsers.length} of {users.length} users
              </span>
            </div>

            {filteredSubUsers.length === 0 ? (
              <div className="p-12 text-center text-slate-400 text-sm">
                <CreditCard className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                <span>No registered users match the selected subscription filter.</span>
              </div>
            ) : (
              <>
                {/* Desktop Table View */}
                <div className="hidden lg:block overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-950/70 border-b border-slate-800 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                        <th className="py-3 px-4">User Details</th>
                        <th className="py-3 px-4">Plan Selector (Free vs Paid)</th>
                        <th className="py-3 px-4">Monthly Fee (₹)</th>
                        <th className="py-3 px-4">Custom UPI QR Code</th>
                        <th className="py-3 px-4">Validity & Payment Status</th>
                        <th className="py-3 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 text-xs">
                      {filteredSubUsers.map((user) => {
                        const sub = user.subscription;
                        const planType = sub?.planType || 'free';
                        const isFree = planType === 'free';
                        const paymentStatus = sub?.paymentStatus || 'active';
                        const qrCodeUrl = sub?.qrCodeUrl;
                        const monthlyFee = sub?.monthlyFee ?? 499;
                        const feeDraft = feeDrafts[user.uid];
                        const displayFee = (feeDraft !== undefined && feeDraft !== null) ? feeDraft : (monthlyFee ?? 499);
                        const isFeeLoading = actionLoadingId === `fee-${user.uid}`;
                        const isPlanLoading = actionLoadingId === `plan-${user.uid}`;
                        const isExtendLoading = actionLoadingId === `extend-${user.uid}`;
                        const isUploadingQr = uploadingQrUserId === user.uid;

                        return (
                          <tr key={user.uid} className="hover:bg-slate-850/60 transition">
                            {/* 1. User Details */}
                            <td className="py-3.5 px-4">
                              <div className="flex items-center gap-3">
                                {user.photoURL ? (
                                  <img
                                    src={user.photoURL}
                                    alt={user.displayName || user.email}
                                    className="w-9 h-9 rounded-full object-cover border border-slate-700 shrink-0"
                                    referrerPolicy="no-referrer"
                                  />
                                ) : (
                                  <div className="w-9 h-9 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center text-xs shrink-0">
                                    {(user.displayName || user.name || user.email || 'U').charAt(0).toUpperCase()}
                                  </div>
                                )}
                                <div className="min-w-0">
                                  <div className="font-bold text-white truncate flex items-center gap-1.5">
                                    <span>{user.displayName || user.name || user.email.split('@')[0]}</span>
                                    {isSuperAdmin(user.email) && (
                                      <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                        MASTER ADMIN
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-slate-400 text-[11px] truncate">{user.email}</div>
                                  <div className="flex items-center gap-1 text-[10px] text-slate-500 font-mono mt-0.5">
                                    <span>UID: {user.uid.slice(0, 8)}...</span>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        navigator.clipboard.writeText(user.uid);
                                        setCopiedUid(user.uid);
                                        setTimeout(() => setCopiedUid(null), 2000);
                                      }}
                                      className="text-slate-400 hover:text-white"
                                      title="Copy UID"
                                    >
                                      {copiedUid === user.uid ? <Check className="w-2.5 h-2.5 text-emerald-400" /> : <Copy className="w-2.5 h-2.5" />}
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </td>

                            {/* 2. Plan Selector Toggle ('Free' vs 'Paid') */}
                            <td className="py-3.5 px-4">
                              <div className="space-y-1">
                                <div className="inline-flex p-0.5 rounded-xl bg-slate-950 border border-slate-800">
                                  {/* Free Button */}
                                  <button
                                    type="button"
                                    disabled={isPlanLoading}
                                    onClick={() => handleToggleUserPlan(user, 'free')}
                                    className={`px-3 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer ${
                                      isFree
                                        ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-600/30'
                                        : 'text-slate-400 hover:text-white'
                                    }`}
                                  >
                                    {isFree && <Check className="w-3 h-3" />}
                                    <span>Free</span>
                                  </button>

                                  {/* Paid Button */}
                                  <button
                                    type="button"
                                    disabled={isPlanLoading}
                                    onClick={() => handleToggleUserPlan(user, 'paid')}
                                    className={`px-3 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer ${
                                      !isFree
                                        ? 'bg-amber-600 text-white shadow-sm shadow-amber-600/30'
                                        : 'text-slate-400 hover:text-white'
                                    }`}
                                  >
                                    {!isFree && <Check className="w-3 h-3" />}
                                    <span>Paid</span>
                                  </button>
                                </div>

                                <div className="text-[10px] font-medium">
                                  {isFree ? (
                                    <span className="text-emerald-400 flex items-center gap-1">
                                      <CheckCircle2 className="w-3 h-3" />
                                      <span>Never sees alerts or locks</span>
                                    </span>
                                  ) : (
                                    <span className="text-amber-400 flex items-center gap-1">
                                      <CreditCard className="w-3 h-3" />
                                      <span>Monthly billing enabled</span>
                                    </span>
                                  )}
                                </div>
                              </div>
                            </td>

                            {/* 3. Editable Monthly Fee (₹) + Preset Chips */}
                            <td className="py-3.5 px-4">
                              <div className="space-y-1.5 w-44">
                                <div className="flex items-center gap-1.5">
                                  <div className="relative flex-1">
                                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-bold">₹</span>
                                    <input
                                      type="number"
                                      min="0"
                                      step="1"
                                      value={displayFee}
                                      onChange={(e) => setFeeDrafts(prev => ({ ...prev, [user.uid]: e.target.value }))}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                          handleSaveMonthlyFee(user);
                                        }
                                      }}
                                      className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-6 pr-2 py-1 text-xs text-white font-bold focus:outline-none focus:border-amber-500 transition"
                                      placeholder="Fee"
                                    />
                                  </div>

                                  {feeDraft !== undefined && (
                                    <button
                                      type="button"
                                      disabled={isFeeLoading}
                                      onClick={() => handleSaveMonthlyFee(user)}
                                      className="p-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow transition cursor-pointer"
                                      title="Save custom monthly fee to Firestore"
                                    >
                                      {isFeeLoading ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                                    </button>
                                  )}
                                </div>

                                {/* Quick Click Preset Chips */}
                                <div className="flex items-center gap-1 flex-wrap">
                                  {[199, 299, 499, 999, 1499, 1999].map((preset) => (
                                    <button
                                      key={preset}
                                      type="button"
                                      onClick={() => handleSaveMonthlyFee(user, preset)}
                                      className={`px-1.5 py-0.5 rounded text-[10px] font-mono transition border cursor-pointer ${
                                        monthlyFee === preset && feeDraft === undefined
                                          ? 'bg-amber-500 text-slate-950 font-bold border-amber-400'
                                          : 'bg-slate-950 hover:bg-slate-800 text-slate-400 hover:text-white border-slate-800'
                                      }`}
                                      title={`Set fee to ₹${preset} and save directly to Firestore`}
                                    >
                                      ₹{preset}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            </td>

                            {/* 4. Custom UPI QR Code Image Uploader */}
                            <td className="py-3.5 px-4">
                              <div className="space-y-1.5">
                                {/* Hidden File Input */}
                                <input
                                  type="file"
                                  accept="image/*"
                                  id={`qr-upload-${user.uid}`}
                                  className="hidden"
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) {
                                      handleUploadUserQrFile(user, file);
                                    }
                                  }}
                                />

                                {qrCodeUrl ? (
                                  <div className="flex items-center gap-2">
                                    {/* Thumbnail Preview */}
                                    <button
                                      type="button"
                                      onClick={() => setQrModalUser(user)}
                                      className="w-10 h-10 rounded-lg bg-white p-0.5 border border-slate-700 shadow-sm shrink-0 hover:scale-105 transition cursor-pointer"
                                      title="Click to preview full-size QR Code"
                                    >
                                      <img
                                        src={qrCodeUrl}
                                        alt="UPI QR Code"
                                        className="w-full h-full object-contain"
                                        referrerPolicy="no-referrer"
                                      />
                                    </button>

                                    {/* Action Buttons */}
                                    <div className="flex items-center gap-1">
                                      <label
                                        htmlFor={`qr-upload-${user.uid}`}
                                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition cursor-pointer"
                                        title="Upload new QR Image"
                                      >
                                        <Upload className="w-3.5 h-3.5" />
                                      </label>
                                      <button
                                        type="button"
                                        onClick={() => handleRemoveUserQr(user)}
                                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-900/50 text-slate-400 hover:text-rose-400 transition cursor-pointer"
                                        title="Remove custom QR"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <label
                                    htmlFor={`qr-upload-${user.uid}`}
                                    className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer border ${
                                      isUploadingQr
                                        ? 'bg-slate-800 text-slate-400 border-slate-700'
                                        : 'bg-slate-950 hover:bg-slate-800 text-blue-300 border-blue-500/30 hover:border-blue-500/60'
                                    }`}
                                  >
                                    {isUploadingQr ? (
                                      <>
                                        <RefreshCw className="w-3 h-3 animate-spin" />
                                        <span>Uploading...</span>
                                      </>
                                    ) : (
                                      <>
                                        <Upload className="w-3 h-3 text-blue-400" />
                                        <span>Upload QR</span>
                                      </>
                                    )}
                                  </label>
                                )}
                              </div>
                            </td>

                            {/* 5. Validity & Payment Status */}
                            <td className="py-3.5 px-4">
                              <div className="space-y-1">
                                <div className="flex items-center gap-1.5">
                                  {isFree ? (
                                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                                      LIFETIME FREE
                                    </span>
                                  ) : (
                                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                                      paymentStatus === 'active'
                                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                                        : paymentStatus === 'verification_pending'
                                        ? 'bg-blue-500/10 text-blue-400 border-blue-500/30 animate-pulse'
                                        : paymentStatus === 'expiring_soon'
                                        ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                                        : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                                    }`}>
                                      {paymentStatus.replace('_', ' ').toUpperCase()}
                                    </span>
                                  )}
                                </div>

                                <div className="text-[11px] text-slate-400 flex items-center gap-2">
                                  <span>
                                    {isFree ? (
                                      'Never expires'
                                    ) : sub?.validUntil ? (
                                      `Expires: ${new Date(sub.validUntil).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`
                                    ) : (
                                      'No date set'
                                    )}
                                  </span>

                                  {!isFree && (
                                    <button
                                      type="button"
                                      disabled={isExtendLoading}
                                      onClick={() => handleExtendUserDays(user, 30)}
                                      className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-[10px] font-semibold border border-slate-700 transition cursor-pointer"
                                      title="Add +30 days and mark active"
                                    >
                                      +30d
                                    </button>
                                  )}
                                </div>

                                {sub?.lastSubmittedSlip && (
                                  <button
                                    type="button"
                                    onClick={() => setSlipReviewUser(user)}
                                    className="px-2 py-0.5 rounded bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 text-[10px] font-bold border border-blue-500/30 flex items-center gap-1 transition cursor-pointer"
                                  >
                                    <Receipt className="w-3 h-3 text-blue-400" />
                                    <span>Review Slip (₹{sub.lastSubmittedSlip.amountPaid})</span>
                                  </button>
                                )}
                              </div>
                            </td>

                            {/* 6. Actions */}
                            <td className="py-3.5 px-4 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => setManagingUser(user)}
                                  className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition cursor-pointer flex items-center gap-1"
                                  title="Open full user management modal"
                                >
                                  <Sliders className="w-3 h-3 text-amber-400" />
                                  <span>Manage</span>
                                </button>

                                {onInspectUser && (
                                  <button
                                    type="button"
                                    onClick={() => onInspectUser(user)}
                                    className="p-1.5 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 transition cursor-pointer"
                                    title="Inspect Workspace"
                                  >
                                    <Eye className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Responsive Cards View */}
                <div className="lg:hidden divide-y divide-slate-800/80">
                  {filteredSubUsers.map((user) => {
                    const sub = user.subscription;
                    const planType = sub?.planType || 'free';
                    const isFree = planType === 'free';
                    const paymentStatus = sub?.paymentStatus || 'active';
                    const qrCodeUrl = sub?.qrCodeUrl;
                    const monthlyFee = sub?.monthlyFee ?? 499;
                    const feeDraft = feeDrafts[user.uid];
                    const displayFee = (feeDraft !== undefined && feeDraft !== null) ? feeDraft : (monthlyFee ?? 499);
                    const isFeeLoading = actionLoadingId === `fee-${user.uid}`;
                    const isPlanLoading = actionLoadingId === `plan-${user.uid}`;
                    const isExtendLoading = actionLoadingId === `extend-${user.uid}`;
                    const isUploadingQr = uploadingQrUserId === user.uid;

                    return (
                      <div key={user.uid} className="p-4 space-y-3 bg-slate-950/40">
                        {/* Header: User details */}
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2.5 min-w-0">
                            {user.photoURL ? (
                              <img
                                src={user.photoURL}
                                alt={user.displayName || user.email}
                                className="w-8 h-8 rounded-full object-cover border border-slate-700"
                                referrerPolicy="no-referrer"
                              />
                            ) : (
                              <div className="w-8 h-8 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center text-xs">
                                {(user.displayName || user.name || user.email || 'U').charAt(0).toUpperCase()}
                              </div>
                            )}
                            <div className="min-w-0">
                              <h4 className="font-bold text-white text-xs truncate">
                                {user.displayName || user.name || user.email.split('@')[0]}
                              </h4>
                              <p className="text-[11px] text-slate-400 truncate">{user.email}</p>
                            </div>
                          </div>

                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                            isFree
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                              : 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                          }`}>
                            {isFree ? 'FREE' : 'PAID'}
                          </span>
                        </div>

                        {/* Plan Toggle */}
                        <div className="flex items-center justify-between p-2 rounded-xl bg-slate-900 border border-slate-800">
                          <span className="text-xs font-medium text-slate-300">Plan Type</span>
                          <div className="inline-flex p-0.5 rounded-lg bg-slate-950 border border-slate-800">
                            <button
                              type="button"
                              disabled={isPlanLoading}
                              onClick={() => handleToggleUserPlan(user, 'free')}
                              className={`px-3 py-1 rounded-md text-xs font-bold transition ${
                                isFree ? 'bg-emerald-600 text-white' : 'text-slate-400'
                              }`}
                            >
                              Free
                            </button>
                            <button
                              type="button"
                              disabled={isPlanLoading}
                              onClick={() => handleToggleUserPlan(user, 'paid')}
                              className={`px-3 py-1 rounded-md text-xs font-bold transition ${
                                !isFree ? 'bg-amber-600 text-white' : 'text-slate-400'
                              }`}
                            >
                              Paid
                            </button>
                          </div>
                        </div>

                        {/* Monthly Fee */}
                        <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-slate-300">Monthly Fee (₹)</span>
                            <div className="flex items-center gap-1.5">
                              <span className="text-slate-400 text-xs font-bold">₹</span>
                              <input
                                type="number"
                                min="0"
                                value={displayFee}
                                onChange={(e) => setFeeDrafts(prev => ({ ...prev, [user.uid]: e.target.value }))}
                                className="w-16 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white font-bold text-center"
                              />
                              {feeDraft !== undefined && (
                                <button
                                  type="button"
                                  disabled={isFeeLoading}
                                  onClick={() => handleSaveMonthlyFee(user)}
                                  className="p-1 rounded bg-emerald-600 text-white text-xs"
                                >
                                  <Check className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-1 flex-wrap">
                            {[199, 299, 499, 999, 1499, 1999].map((preset) => (
                              <button
                                key={preset}
                                type="button"
                                onClick={() => handleSaveMonthlyFee(user, preset)}
                                className={`px-2 py-0.5 rounded text-[10px] font-mono border ${
                                  monthlyFee === preset && feeDraft === undefined
                                    ? 'bg-amber-500 text-slate-950 font-bold border-amber-400'
                                    : 'bg-slate-950 text-slate-400 border-slate-800'
                                }`}
                              >
                                ₹{preset}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* QR Code & Actions */}
                        <div className="flex items-center justify-between pt-1">
                          {/* QR Upload */}
                          <div>
                            <input
                              type="file"
                              accept="image/*"
                              id={`qr-upload-mobile-${user.uid}`}
                              className="hidden"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  handleUploadUserQrFile(user, file);
                                }
                              }}
                            />
                            {qrCodeUrl ? (
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => setQrModalUser(user)}
                                  className="w-8 h-8 rounded-lg bg-white p-0.5 border border-slate-700 shadow shrink-0"
                                >
                                  <img src={qrCodeUrl} alt="QR" className="w-full h-full object-contain" referrerPolicy="no-referrer" />
                                </button>
                                <label
                                  htmlFor={`qr-upload-mobile-${user.uid}`}
                                  className="px-2 py-1 rounded bg-slate-800 text-slate-300 text-[11px] font-medium"
                                >
                                  Change QR
                                </label>
                              </div>
                            ) : (
                              <label
                                htmlFor={`qr-upload-mobile-${user.uid}`}
                                className="px-2.5 py-1 rounded-lg bg-slate-800 text-blue-300 text-xs font-semibold flex items-center gap-1"
                              >
                                <Upload className="w-3 h-3" />
                                <span>Upload QR</span>
                              </label>
                            )}
                          </div>

                          {/* Quick Extend or Manage */}
                          <div className="flex items-center gap-1.5">
                            {!isFree && (
                              <button
                                type="button"
                                disabled={isExtendLoading}
                                onClick={() => handleExtendUserDays(user, 30)}
                                className="px-2.5 py-1 rounded-lg bg-slate-800 text-slate-300 text-xs font-semibold"
                              >
                                +30d
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => setManagingUser(user)}
                              className="px-2.5 py-1 rounded-lg bg-slate-800 text-slate-200 text-xs font-semibold"
                            >
                              Manage
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* User Management Modal */}
      {managingUser && (
        <UserManagementModal
          user={managingUser}
          onClose={() => setManagingUser(null)}
          currentAdminEmail={currentAdminEmail}
          onInspectUser={onInspectUser}
          onUserUpdated={(updatedUser) => {
            setUsers(prev => prev.map(u => u.uid === updatedUser.uid ? updatedUser : u));
            setManagingUser(updatedUser);
          }}
        />
      )}

      {/* Single Rider Detail & Master Edit Modal */}
      {inspectingRider && selectedUser && workspaceData && (
        <SingleRiderDetailModal
          rider={inspectingRider}
          user={selectedUser}
          entries={workspaceData.entries}
          settlements={workspaceData.settlements}
          onClose={() => setInspectingRider(null)}
          onRiderUpdated={handleWorkspaceRiderUpdated}
          onRiderDeleted={handleWorkspaceRiderDeleted}
          onEntryUpdated={handleWorkspaceEntryUpdated}
        />
      )}

      {/* Default Subscription Config Modal for Master Admin */}
      {showSubConfigModal && (
        <div 
          id="default-subscription-config-modal"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in"
        >
          <div className="bg-slate-900 border border-slate-700/80 rounded-2xl max-w-lg w-full shadow-2xl text-slate-100 overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-5 border-b border-slate-800 bg-slate-950/60 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center">
                  <CreditCard className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Default Subscription Settings</h3>
                  <p className="text-xs text-slate-400">Configures default plan assigned to new user signups</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowSubConfigModal(false)}
                className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition"
              >
                ✕
              </button>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto flex-1">
              {/* Default Plan Type */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">Default Plan Type</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setTempSubConfig(prev => ({ ...prev, planType: 'free' }))}
                    className={`py-2 px-3 rounded-xl border text-xs font-bold transition flex items-center justify-center gap-2 ${
                      tempSubConfig.planType === 'free'
                        ? 'bg-blue-600/20 text-blue-300 border-blue-500/60 shadow-sm'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    <span>Free Plan</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setTempSubConfig(prev => ({ ...prev, planType: 'paid' }))}
                    className={`py-2 px-3 rounded-xl border text-xs font-bold transition flex items-center justify-center gap-2 ${
                      tempSubConfig.planType === 'paid'
                        ? 'bg-emerald-600/20 text-emerald-300 border-emerald-500/60 shadow-sm'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    <span>Paid Plan</span>
                  </button>
                </div>
              </div>

              {/* Monthly Fee */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">Default Monthly Fee (₹ INR)</label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-slate-400 text-xs font-bold">₹</span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={tempSubConfig.monthlyFee ?? 0}
                    onChange={(e) => setTempSubConfig(prev => ({ ...prev, monthlyFee: Math.max(0, Number(e.target.value) || 0) }))}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-8 pr-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 font-mono"
                    placeholder="e.g. 499"
                  />
                </div>
              </div>

              {/* Default Validity Days */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">Initial Trial / Validity Days</label>
                <input
                  type="number"
                  min="1"
                  max="3650"
                  step="1"
                  value={tempSubConfig.trialDays ?? 30}
                  onChange={(e) => setTempSubConfig(prev => ({ ...prev, trialDays: Math.max(1, Number(e.target.value) || 30) }))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 font-mono"
                  placeholder="e.g. 30"
                />
                <p className="text-[11px] text-slate-400">
                  New users will automatically receive this many days of access starting from registration.
                </p>
              </div>

              {/* Default Payment QR Code URL */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">Default Payment QR Code URL (UPI)</label>
                <input
                  type="url"
                  value={tempSubConfig.qrCodeUrl || ''}
                  onChange={(e) => setTempSubConfig(prev => ({ ...prev, qrCodeUrl: e.target.value.trim() }))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 font-mono"
                  placeholder="https://example.com/upi-qr-code.png"
                />
                {tempSubConfig.qrCodeUrl && (
                  <div className="flex items-center gap-3 p-2 bg-slate-950 rounded-lg border border-slate-800">
                    <img
                      src={tempSubConfig.qrCodeUrl}
                      alt="QR Preview"
                      referrerPolicy="no-referrer"
                      className="w-14 h-14 object-contain rounded bg-white p-1"
                      onError={(e) => {
                        (e.target as HTMLElement).style.display = 'none';
                      }}
                    />
                    <div className="text-xs text-slate-400">
                      <span className="text-slate-300 font-medium block">Default QR Preview</span>
                      <span className="text-[11px] text-slate-500">Will be shown on payment screens</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Default Payment Status */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">Default Payment Status for New Accounts</label>
                <select
                  value={tempSubConfig.paymentStatus}
                  onChange={(e) => setTempSubConfig(prev => ({ ...prev, paymentStatus: e.target.value as UserPaymentStatus }))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                >
                  <option value="active">Active (Instant Access)</option>
                  <option value="verification_pending">Verification Pending (Requires Payment Slip)</option>
                </select>
              </div>
            </div>

            <div className="p-4 border-t border-slate-800 bg-slate-950/80 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setShowSubConfigModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition border border-slate-700"
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={savingSubConfig}
                onClick={handleSaveSubConfig}
                className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-md shadow-emerald-600/20"
              >
                {savingSubConfig ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Save Default Settings</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* QR Code Fullscreen Preview Modal */}
      {qrModalUser && qrModalUser.subscription?.qrCodeUrl && (
        <div
          id="qr-preview-modal-backdrop"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in"
          onClick={() => setQrModalUser(null)}
        >
          <div
            className="bg-slate-900 border border-slate-700/80 rounded-2xl max-w-sm w-full shadow-2xl p-6 text-center space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="text-left">
                <h4 className="text-sm font-bold text-white">UPI Payment QR Code</h4>
                <p className="text-xs text-slate-400 truncate max-w-[220px]">
                  {qrModalUser.displayName || qrModalUser.email}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setQrModalUser(null)}
                className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-3 bg-white rounded-2xl shadow-inner inline-block mx-auto border-2 border-slate-200">
              <img
                src={qrModalUser.subscription.qrCodeUrl}
                alt="UPI QR Code"
                className="w-60 h-60 object-contain mx-auto"
                referrerPolicy="no-referrer"
              />
            </div>

            <div className="text-xs text-slate-300">
              Monthly Fee: <span className="font-bold text-amber-400">₹{qrModalUser.subscription.monthlyFee || 499}/month</span>
            </div>

            <div className="flex items-center justify-center gap-2 pt-2">
              <a
                href={qrModalUser.subscription.qrCodeUrl}
                download={`upi-qr-${qrModalUser.uid.slice(0, 8)}.png`}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition flex items-center gap-1.5 shadow cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download QR</span>
              </a>

              <button
                type="button"
                onClick={() => setQrModalUser(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Slip Review Modal */}
      {slipReviewUser && slipReviewUser.subscription?.lastSubmittedSlip && (
        <div
          id="slip-review-modal-backdrop"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in"
          onClick={() => setSlipReviewUser(null)}
        >
          <div
            className="bg-slate-900 border border-slate-700/80 rounded-2xl max-w-md w-full shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
              <div className="flex items-center gap-2">
                <Receipt className="w-5 h-5 text-blue-400" />
                <div>
                  <h4 className="text-sm font-bold text-white">Review Payment Slip</h4>
                  <p className="text-xs text-slate-400">{slipReviewUser.displayName || slipReviewUser.email}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSlipReviewUser(null)}
                className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-4 space-y-4 overflow-y-auto flex-1">
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Amount Paid:</span>
                  <span className="text-emerald-400 font-extrabold text-sm">
                    ₹{slipReviewUser.subscription.lastSubmittedSlip.amountPaid}
                  </span>
                </div>
                {slipReviewUser.subscription.lastSubmittedSlip.utrNumber && (
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">UTR / Ref Number:</span>
                    <span className="text-white font-mono font-bold select-all">
                      {slipReviewUser.subscription.lastSubmittedSlip.utrNumber}
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Submitted At:</span>
                  <span className="text-slate-300">
                    {new Date(slipReviewUser.subscription.lastSubmittedSlip.submittedAt).toLocaleString('en-IN')}
                  </span>
                </div>
              </div>

              {/* Screenshot Preview */}
              <div className="space-y-1.5">
                <span className="text-xs font-semibold text-slate-400">Uploaded Screenshot</span>
                <div className="bg-slate-950 rounded-xl border border-slate-800 p-2 max-h-72 overflow-y-auto text-center">
                  <img
                    src={slipReviewUser.subscription.lastSubmittedSlip.slipUrl}
                    alt="Payment Slip"
                    className="max-w-full rounded-lg mx-auto object-contain"
                    referrerPolicy="no-referrer"
                  />
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => handleRejectSlip(slipReviewUser)}
                className="px-3.5 py-2 rounded-xl bg-rose-900/30 hover:bg-rose-900/50 text-rose-300 border border-rose-800/40 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
                <span>Reject</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSlipReviewUser(null)}
                  className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleApproveSlip(slipReviewUser)}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-md shadow-emerald-600/20 cursor-pointer"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Approve (+30 Days)</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Free to Paid Plan Conversion Modal */}
      <FreeToPaidConversionModal
        user={convertingToPaidUser}
        isOpen={Boolean(convertingToPaidUser)}
        onClose={() => setConvertingToPaidUser(null)}
        onConfirm={handleConfirmFreeToPaid}
      />
    </div>
  );
};
