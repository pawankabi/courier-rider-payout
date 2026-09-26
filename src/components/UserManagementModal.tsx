import React, { useState, useEffect } from 'react';
import { 
  X, 
  Shield, 
  Bike, 
  Sliders, 
  CheckSquare, 
  Square, 
  Check, 
  Save, 
  Plus, 
  Minus, 
  AlertCircle, 
  CheckCircle2, 
  Clock, 
  UserCheck, 
  UserX, 
  Percent, 
  Coins, 
  FileText, 
  Download, 
  Package, 
  RefreshCw,
  Sparkles,
  ToggleLeft,
  ToggleRight,
  Eye,
  Ban,
  Building2,
  MessageCircle,
  CreditCard,
  QrCode,
  Calendar,
  Receipt,
  ExternalLink,
  Upload,
  Trash2,
  Image as ImageIcon
} from 'lucide-react';
import { compressAndEncodeImage, validateImageFile } from '../utils/imageUpload';
import { 
  AppUser, 
  Rider, 
  UserPermissions, 
  UserRateConfig, 
  UserSubscription,
  UserPlanType,
  UserPaymentStatus,
  DEFAULT_USER_PERMISSIONS, 
  DEFAULT_USER_RATE_CONFIG,
  createDefaultUserSubscription 
} from '../types';
import { 
  subscribeToUserRiders, 
  updateUserPermissions, 
  updateUserRateConfig, 
  updateUserHubSignature,
  updateUserSubscription,
  normalizeUserSubscription,
  bulkUpdateRidersRates, 
  updateRiderRates, 
  setUserStatus,
  isSuperAdmin 
} from '../services/firestoreSync';
import { BASE_RATE, INCENTIVE_RATE, formatINR } from '../utils/formatters';

interface Props {
  user: AppUser;
  onClose: () => void;
  currentAdminEmail?: string | null;
  onInspectUser?: (user: AppUser) => void;
  onUserUpdated?: (user: AppUser) => void;
}

type SubTab = 'riders_rates' | 'permissions' | 'account_rates' | 'subscription';

export const UserManagementModal: React.FC<Props> = ({
  user,
  onClose,
  currentAdminEmail,
  onInspectUser,
  onUserUpdated,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<SubTab>('riders_rates');
  const [riders, setRiders] = useState<Rider[]>([]);
  const [loadingRiders, setLoadingRiders] = useState(true);
  const [selectedRiderIds, setSelectedRiderIds] = useState<string[]>([]);
  const [currentStatus, setCurrentStatus] = useState(user.status);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  // Smooth Escape key handler to return smoothly without freeze
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Status changer
  const handleStatusChange = async (newStatus: 'pending' | 'approved' | 'active' | 'blocked') => {
    if (isSuperAdmin(user.email) && newStatus === 'blocked') {
      showToast('Super Admin cannot be blocked.', 'error');
      return;
    }
    setIsUpdatingStatus(true);
    try {
      await setUserStatus(user.uid, newStatus);
      setCurrentStatus(newStatus);
      showToast(`Account status updated to "${newStatus.toUpperCase()}".`, 'success');
    } catch (err) {
      console.error('Failed to change user status:', err);
      showToast('Failed to update user status.', 'error');
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  // Permissions state
  const [permissions, setPermissions] = useState<UserPermissions>(
    user.permissions ? { ...DEFAULT_USER_PERMISSIONS, ...user.permissions } : { ...DEFAULT_USER_PERMISSIONS }
  );
  const [savingPermissions, setSavingPermissions] = useState(false);

  // Rate config state
  const [rateConfig, setRateConfig] = useState<UserRateConfig>(
    user.rateConfig ? { ...DEFAULT_USER_RATE_CONFIG, ...user.rateConfig } : { ...DEFAULT_USER_RATE_CONFIG }
  );
  const [savingRateConfig, setSavingRateConfig] = useState(false);

  // Subscription state
  const [subscription, setSubscription] = useState<UserSubscription>(
    user.subscription ? normalizeUserSubscription(user.subscription) : createDefaultUserSubscription()
  );
  const [savingSubscription, setSavingSubscription] = useState(false);
  const [uploadingQr, setUploadingQr] = useState(false);
  const [slipModalOpen, setSlipModalOpen] = useState(false);

  const handleQrUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validation = validateImageFile(file);
    if (!validation.valid) {
      showToast(validation.error || 'कृपया मान्य छवि फ़ाइल चुनें (PNG, JPG, WEBP)', 'error');
      return;
    }

    setUploadingQr(true);
    try {
      const reader = new FileReader();
      const dataUrl = await new Promise<string>((resolve, reject) => {
        reader.onload = async (event) => {
          try {
            const raw = event.target?.result as string;
            const optimized = await compressAndEncodeImage(file, {
              maxDimension: 800,
              quality: 0.9,
              maxSizeBytes: 400 * 1024,
            }).catch(() => raw);
            resolve(optimized || raw);
          } catch (err) {
            reject(err);
          }
        };
        reader.onerror = () => reject(new Error('FileReader failed to read image file'));
        reader.readAsDataURL(file);
      });

      setSubscription(prev => ({
        ...prev,
        qrCodeUrl: dataUrl
      }));
      showToast('QR Code फ़ोटो सफलतापूर्वक लोड हो गई! नीचे "Save Subscription Configuration" पर क्लिक करें।', 'success');
    } catch (err: any) {
      console.error('Failed to compress QR image:', err);
      showToast(err.message || 'Failed to process QR image.', 'error');
    } finally {
      setUploadingQr(false);
      e.target.value = '';
    }
  };

  const handleSaveSubscription = async () => {
    setSavingSubscription(true);
    try {
      const updated = await updateUserSubscription(user.uid, subscription);
      setSubscription(updated);
      onUserUpdated?.({ ...user, subscription: updated });
      showToast('Subscription updated successfully!', 'success');
    } catch (err: any) {
      console.error('Failed to update subscription:', err);
      alert('Failed to update user subscription in Firestore: ' + (err?.message || err));
      showToast('Failed to update user subscription.', 'error');
    } finally {
      setSavingSubscription(false);
    }
  };

  const handleQuickExtendDays = (days: number) => {
    const currentValid = subscription.validUntil ? new Date(subscription.validUntil).getTime() : Date.now();
    const baseTime = !isNaN(currentValid) && currentValid > Date.now() ? currentValid : Date.now();
    const nextTime = baseTime + days * 24 * 60 * 60 * 1000;
    const d = new Date(nextTime);
    d.setHours(23, 59, 59, 999);
    setSubscription(prev => ({
      ...prev,
      validUntil: d.toISOString(),
      paymentStatus: 'active',
    }));
  };

  // Bulk rate controls
  const [bulkBaseRateMode, setBulkBaseRateMode] = useState<'exact' | 'increase' | 'decrease'>('exact');
  const [bulkBaseRateValue, setBulkBaseRateValue] = useState<number>(13);
  const [bulkIncentiveRateMode, setBulkIncentiveRateMode] = useState<'exact' | 'increase' | 'decrease'>('exact');
  const [bulkIncentiveRateValue, setBulkIncentiveRateValue] = useState<number>(2);
  const [bulkIncentiveEnabled, setBulkIncentiveEnabled] = useState<boolean>(true);
  const [applyIncentiveToggle, setApplyIncentiveToggle] = useState<boolean>(true);
  const [isApplyingBulk, setIsApplyingBulk] = useState(false);

  // Individual rider inline edit state: riderId -> { baseRate, incentiveRate, incentiveEnabled, saving }
  const [editingRiders, setEditingRiders] = useState<Record<string, {
    baseRate: number;
    incentiveRate: number;
    incentiveEnabled: boolean;
    isSaving?: boolean;
  }>>({});

  // Toast notification inside modal
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  // Real-time listener for user's riders
  useEffect(() => {
    setLoadingRiders(true);
    const unsub = subscribeToUserRiders(
      user.uid,
      (loadedRiders) => {
        setRiders(loadedRiders);
        setLoadingRiders(false);

        // Initialize inline edit state for riders
        const initialEditState: Record<string, { baseRate: number; incentiveRate: number; incentiveEnabled: boolean }> = {};
        loadedRiders.forEach((r) => {
          initialEditState[r.id] = {
            baseRate: typeof r.baseRate === 'number' ? r.baseRate : (rateConfig.defaultBaseRate || BASE_RATE),
            incentiveRate: typeof r.incentiveRate === 'number' ? r.incentiveRate : (rateConfig.defaultIncentiveRate || INCENTIVE_RATE),
            incentiveEnabled: typeof r.incentiveEnabled === 'boolean' ? r.incentiveEnabled : true,
          };
        });
        setEditingRiders(initialEditState);
      },
      (err) => {
        console.error('Error fetching user riders:', err);
        setLoadingRiders(false);
      }
    );

    return () => unsub();
  }, [user.uid]);

  // Selection helpers
  const isAllSelected = riders.length > 0 && selectedRiderIds.length === riders.length;
  const isSomeSelected = selectedRiderIds.length > 0 && !isAllSelected;

  const handleToggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedRiderIds([]);
    } else {
      setSelectedRiderIds(riders.map((r) => r.id));
    }
  };

  const handleToggleSelectRider = (riderId: string) => {
    setSelectedRiderIds((prev) =>
      prev.includes(riderId) ? prev.filter((id) => id !== riderId) : [...prev, riderId]
    );
  };

  // Apply Bulk Rates to selected riders
  const handleApplyBulkRates = async () => {
    if (selectedRiderIds.length === 0) {
      showToast('Please select at least one delivery boy using the checkboxes.', 'error');
      return;
    }

    setIsApplyingBulk(true);
    try {
      // Calculate final rates for each selected rider
      const batchPromises = selectedRiderIds.map(async (riderId) => {
        const currentRider = riders.find((r) => r.id === riderId);
        const currentBase = currentRider?.baseRate ?? rateConfig.defaultBaseRate ?? BASE_RATE;
        const currentInc = currentRider?.incentiveRate ?? rateConfig.defaultIncentiveRate ?? INCENTIVE_RATE;

        let finalBase = currentBase;
        if (bulkBaseRateMode === 'exact') {
          finalBase = bulkBaseRateValue;
        } else if (bulkBaseRateMode === 'increase') {
          finalBase = Math.round((currentBase + bulkBaseRateValue) * 100) / 100;
        } else if (bulkBaseRateMode === 'decrease') {
          finalBase = Math.max(0, Math.round((currentBase - bulkBaseRateValue) * 100) / 100);
        }

        let finalInc = currentInc;
        if (bulkIncentiveRateMode === 'exact') {
          finalInc = bulkIncentiveRateValue;
        } else if (bulkIncentiveRateMode === 'increase') {
          finalInc = Math.round((currentInc + bulkIncentiveRateValue) * 100) / 100;
        } else if (bulkIncentiveRateMode === 'decrease') {
          finalInc = Math.max(0, Math.round((currentInc - bulkIncentiveRateValue) * 100) / 100);
        }

        await updateRiderRates(user.uid, riderId, {
          baseRate: finalBase,
          incentiveRate: finalInc,
          ...(applyIncentiveToggle ? { incentiveEnabled: bulkIncentiveEnabled } : {}),
        });
      });

      await Promise.all(batchPromises);
      showToast(
        `Successfully updated rates for ${selectedRiderIds.length} rider(s)! Calculations in user's app will update immediately.`,
        'success'
      );
    } catch (err) {
      console.error('Failed to bulk update rider rates:', err);
      showToast('Failed to apply rates to selected riders. Please try again.', 'error');
    } finally {
      setIsApplyingBulk(false);
    }
  };

  // Save single rider inline changes
  const handleSaveSingleRider = async (riderId: string) => {
    const edit = editingRiders[riderId];
    if (!edit) return;

    setEditingRiders((prev) => ({
      ...prev,
      [riderId]: { ...prev[riderId], isSaving: true },
    }));

    try {
      await updateRiderRates(user.uid, riderId, {
        baseRate: Number(edit.baseRate),
        incentiveRate: Number(edit.incentiveRate),
        incentiveEnabled: edit.incentiveEnabled,
      });
      showToast('Rider rates saved successfully.', 'success');
    } catch (err) {
      console.error('Error saving single rider rate:', err);
      showToast('Failed to save rider rates.', 'error');
    } finally {
      setEditingRiders((prev) => ({
        ...prev,
        [riderId]: { ...prev[riderId], isSaving: false },
      }));
    }
  };

  // Toggle user permission and auto-save
  const handleTogglePermission = async (key: keyof UserPermissions) => {
    const updated = {
      ...permissions,
      [key]: !permissions[key],
    };
    if (key === 'festivalGreetings') {
      updated.canAccessFestivalGreetings = updated.festivalGreetings;
    }
    setPermissions(updated);
    setSavingPermissions(true);
    try {
      await updateUserPermissions(user.uid, updated);
      showToast(
        `Feature permission "${key === 'festivalGreetings' ? 'Festival Greetings' : key}" is now ${updated[key] ? 'ENABLED' : 'RESTRICTED'}.`,
        updated[key] ? 'success' : 'info'
      );
    } catch (err) {
      console.error('Failed to save permission:', err);
      showToast('Failed to update permission in Firestore.', 'error');
    } finally {
      setSavingPermissions(false);
    }
  };

  // Save default rate config & workspace hub signature
  const handleSaveDefaultRateConfig = async () => {
    setSavingRateConfig(true);
    try {
      await updateUserRateConfig(user.uid, rateConfig);
      if (typeof rateConfig.hubSignature === 'string') {
        await updateUserHubSignature(user.uid, rateConfig.hubSignature);
      }
      showToast('Default tenant rates & hub signature updated successfully.', 'success');
    } catch (err) {
      console.error('Failed to update user rate config:', err);
      showToast('Failed to save settings.', 'error');
    } finally {
      setSavingRateConfig(false);
    }
  };

  return (
    <div
      id="user-management-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-sm animate-in fade-in overflow-y-auto"
    >
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl max-w-4xl w-full max-h-[92vh] flex flex-col shadow-2xl text-slate-100 overflow-hidden">
        {/* Modal Header */}
        <div className="p-5 border-b border-slate-800 bg-slate-950/60 flex items-start justify-between gap-4">
          <div className="flex items-center gap-3.5 min-w-0">
            {user.photoURL ? (
              <img
                src={user.photoURL}
                alt={user.displayName}
                referrerPolicy="no-referrer"
                className="w-12 h-12 rounded-xl object-cover border border-slate-700 shadow"
              />
            ) : (
              <div className="w-12 h-12 rounded-xl bg-blue-600/20 border border-blue-500/30 text-blue-400 font-bold flex items-center justify-center text-base">
                {user.displayName?.charAt(0) || user.email?.charAt(0) || 'U'}
              </div>
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-bold text-white tracking-tight truncate">
                  {user.displayName || 'User Workspace'}
                </h2>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                    currentStatus === 'pending'
                      ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                      : currentStatus === 'blocked' || currentStatus === 'deactivated'
                      ? 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                      : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                  }`}
                >
                  {currentStatus === 'pending'
                    ? 'Pending Approval'
                    : currentStatus === 'blocked' || currentStatus === 'deactivated'
                    ? 'Blocked Account'
                    : 'Approved Account'}
                </span>
                {isSuperAdmin(user.email) && (
                  <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30 flex items-center gap-1">
                    <Shield className="w-3 h-3" />
                    Super Admin
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 font-mono truncate mt-0.5">
                {user.email} • UID: {user.uid}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Quick Status Control */}
            {currentStatus === 'pending' && (
              <button
                type="button"
                onClick={() => handleStatusChange('approved')}
                disabled={isUpdatingStatus}
                className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow flex items-center gap-1.5 transition"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Approve Access</span>
              </button>
            )}

            {/* Inspect User Workspace Button */}
            {onInspectUser && (
              <button
                id="modal-inspect-workspace-btn"
                type="button"
                onClick={() => {
                  onClose();
                  onInspectUser(user);
                }}
                className="px-3 py-1.5 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-300 hover:text-white border border-indigo-500/40 font-semibold text-xs shadow flex items-center gap-1.5 transition"
                title="Inspect this user's data & calculations"
              >
                <Eye className="w-3.5 h-3.5 text-indigo-400" />
                <span>Inspect Workspace</span>
              </button>
            )}

            {/* Block / Unblock Toggle */}
            {!isSuperAdmin(user.email) && currentStatus !== 'pending' && (
              <button
                type="button"
                onClick={() => handleStatusChange(currentStatus === 'blocked' || currentStatus === 'deactivated' ? 'active' : 'blocked')}
                disabled={isUpdatingStatus}
                className={`px-3 py-1.5 rounded-xl font-semibold text-xs border flex items-center gap-1.5 transition ${
                  currentStatus === 'blocked' || currentStatus === 'deactivated'
                    ? 'bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border-emerald-500/30'
                    : 'bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border-rose-500/30'
                }`}
              >
                {currentStatus === 'blocked' || currentStatus === 'deactivated' ? (
                  <>
                    <UserCheck className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Unblock</span>
                  </>
                ) : (
                  <>
                    <Ban className="w-3.5 h-3.5 text-rose-400" />
                    <span>Block Access</span>
                  </>
                )}
              </button>
            )}

            <button
              id="close-user-management-modal-btn"
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* In-modal Toast Alert */}
        {toast && (
          <div
            id="modal-toast"
            className={`px-4 py-2.5 text-xs font-medium flex items-center justify-between border-b ${
              toast.type === 'error'
                ? 'bg-rose-950/80 text-rose-200 border-rose-800'
                : toast.type === 'info'
                ? 'bg-amber-950/80 text-amber-200 border-amber-800'
                : 'bg-emerald-950/80 text-emerald-200 border-emerald-800'
            }`}
          >
            <div className="flex items-center gap-2">
              {toast.type === 'error' ? (
                <AlertCircle className="w-4 h-4 text-rose-400" />
              ) : (
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              )}
              <span>{toast.message}</span>
            </div>
            <button
              onClick={() => setToast(null)}
              className="text-slate-400 hover:text-white text-xs ml-3"
            >
              ✕
            </button>
          </div>
        )}

        {/* Sub-Navigation Tabs */}
        <div className="flex items-center gap-2 border-b border-slate-800 px-5 pt-3 bg-slate-950/30">
          <button
            id="subtab-riders-btn"
            type="button"
            onClick={() => setActiveSubTab('riders_rates')}
            className={`pb-3 px-3 text-xs sm:text-sm font-medium border-b-2 flex items-center gap-2 transition ${
              activeSubTab === 'riders_rates'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Bike className="w-4 h-4" />
            <span>Riders & Rate Overrides ({riders.length})</span>
          </button>

          <button
            id="subtab-permissions-btn"
            type="button"
            onClick={() => setActiveSubTab('permissions')}
            className={`pb-3 px-3 text-xs sm:text-sm font-medium border-b-2 flex items-center gap-2 transition ${
              activeSubTab === 'permissions'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sliders className="w-4 h-4" />
            <span>Feature Access Flags</span>
          </button>

          <button
            id="subtab-account-rates-btn"
            type="button"
            onClick={() => setActiveSubTab('account_rates')}
            className={`pb-3 px-3 text-xs sm:text-sm font-medium border-b-2 flex items-center gap-2 transition ${
              activeSubTab === 'account_rates'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Coins className="w-4 h-4" />
            <span>Default Rates & Slabs</span>
          </button>

          <button
            id="subtab-subscription-btn"
            type="button"
            onClick={() => setActiveSubTab('subscription')}
            className={`pb-3 px-3 text-xs sm:text-sm font-medium border-b-2 flex items-center gap-2 transition relative ${
              activeSubTab === 'subscription'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <CreditCard className="w-4 h-4" />
            <span>Subscription & Billing</span>
            {subscription.paymentStatus === 'verification_pending' && (
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse ml-0.5" title="Payment Verification Pending" />
            )}
          </button>
        </div>

        {/* Modal Body Container */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {/* TAB 1: RIDERS & RATE CONTROLS */}
          {activeSubTab === 'riders_rates' && (
            <div className="space-y-5">
              {/* Bulk Rate Control Panel */}
              <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 sm:p-5 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
                  <div>
                    <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-amber-400" />
                      Bulk & Selective Rate Override Tool
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Select specific delivery boys below to adjust their base parcel payout or incentive rate in bulk.
                    </p>
                  </div>
                  <div className="text-xs px-2.5 py-1 rounded-lg bg-blue-950/60 border border-blue-800/80 text-blue-300 font-medium">
                    {selectedRiderIds.length} of {riders.length} riders selected
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Base Payout Adjustment */}
                  <div className="space-y-2 bg-slate-900/90 p-3.5 rounded-xl border border-slate-800">
                    <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                      <span>Base Payout per Parcel</span>
                      <span className="text-[11px] text-blue-400 font-mono">₹{bulkBaseRateValue}</span>
                    </label>
                    <div className="flex items-center gap-1.5">
                      <select
                        value={bulkBaseRateMode}
                        onChange={(e) => setBulkBaseRateMode(e.target.value as any)}
                        className="bg-slate-950 border border-slate-700 text-xs rounded-lg px-2 py-1.5 text-slate-200 focus:outline-none focus:border-blue-500"
                      >
                        <option value="exact">Set Exact ₹</option>
                        <option value="increase">Increase by +₹</option>
                        <option value="decrease">Decrease by -₹</option>
                      </select>
                      <input
                        type="number"
                        step="0.5"
                        min="0"
                        value={bulkBaseRateValue}
                        onChange={(e) => setBulkBaseRateValue(Number(e.target.value))}
                        className="w-full bg-slate-950 border border-slate-700 text-xs rounded-lg px-2.5 py-1.5 text-white font-semibold focus:outline-none focus:border-blue-500"
                      />
                    </div>
                    {/* Quick Step Buttons */}
                    <div className="flex items-center gap-1 text-[11px]">
                      <button
                        type="button"
                        onClick={() => setBulkBaseRateValue((v) => Math.max(0, v - 1))}
                        className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
                      >
                        -₹1
                      </button>
                      <button
                        type="button"
                        onClick={() => setBulkBaseRateValue((v) => v + 1)}
                        className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
                      >
                        +₹1
                      </button>
                      <button
                        type="button"
                        onClick={() => setBulkBaseRateValue(13)}
                        className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-400"
                      >
                        Std ₹13
                      </button>
                    </div>
                  </div>

                  {/* Incentive Rate Adjustment */}
                  <div className="space-y-2 bg-slate-900/90 p-3.5 rounded-xl border border-slate-800">
                    <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                      <span>Incentive Rate per Parcel</span>
                      <span className="text-[11px] text-emerald-400 font-mono">₹{bulkIncentiveRateValue}</span>
                    </label>
                    <div className="flex items-center gap-1.5">
                      <select
                        value={bulkIncentiveRateMode}
                        onChange={(e) => setBulkIncentiveRateMode(e.target.value as any)}
                        className="bg-slate-950 border border-slate-700 text-xs rounded-lg px-2 py-1.5 text-slate-200 focus:outline-none focus:border-blue-500"
                      >
                        <option value="exact">Set Exact ₹</option>
                        <option value="increase">Increase by +₹</option>
                        <option value="decrease">Decrease by -₹</option>
                      </select>
                      <input
                        type="number"
                        step="0.5"
                        min="0"
                        value={bulkIncentiveRateValue}
                        onChange={(e) => setBulkIncentiveRateValue(Number(e.target.value))}
                        className="w-full bg-slate-950 border border-slate-700 text-xs rounded-lg px-2.5 py-1.5 text-white font-semibold focus:outline-none focus:border-blue-500"
                      />
                    </div>
                    {/* Quick Step Buttons */}
                    <div className="flex items-center gap-1 text-[11px]">
                      <button
                        type="button"
                        onClick={() => setBulkIncentiveRateValue((v) => Math.max(0, v - 0.5))}
                        className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
                      >
                        -₹0.5
                      </button>
                      <button
                        type="button"
                        onClick={() => setBulkIncentiveRateValue((v) => v + 0.5)}
                        className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
                      >
                        +₹0.5
                      </button>
                      <button
                        type="button"
                        onClick={() => setBulkIncentiveRateValue(2)}
                        className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-400"
                      >
                        Std ₹2
                      </button>
                    </div>
                  </div>

                  {/* Incentive Status Toggle & Apply */}
                  <div className="space-y-2.5 bg-slate-900/90 p-3.5 rounded-xl border border-slate-800 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-semibold text-slate-300">
                          Incentive System Active
                        </label>
                        <input
                          type="checkbox"
                          checked={applyIncentiveToggle}
                          onChange={(e) => setApplyIncentiveToggle(e.target.checked)}
                          className="w-3.5 h-3.5 rounded text-blue-600 bg-slate-950 border-slate-700"
                          title="Check to include incentive state update in bulk operation"
                        />
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        <button
                          type="button"
                          disabled={!applyIncentiveToggle}
                          onClick={() => setBulkIncentiveEnabled(!bulkIncentiveEnabled)}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                            !applyIncentiveToggle
                              ? 'opacity-40 cursor-not-allowed bg-slate-800 text-slate-500'
                              : bulkIncentiveEnabled
                              ? 'bg-emerald-600/20 text-emerald-300 border border-emerald-500/40'
                              : 'bg-rose-600/20 text-rose-300 border border-rose-500/40'
                          }`}
                        >
                          {bulkIncentiveEnabled ? <ToggleRight className="w-4 h-4 text-emerald-400" /> : <ToggleLeft className="w-4 h-4 text-rose-400" />}
                          <span>{bulkIncentiveEnabled ? 'Enabled' : 'Disabled (0 bonus)'}</span>
                        </button>
                      </div>
                    </div>

                    <button
                      id="apply-bulk-rates-btn"
                      type="button"
                      disabled={isApplyingBulk || selectedRiderIds.length === 0}
                      onClick={handleApplyBulkRates}
                      className={`w-full py-2 px-3 rounded-lg text-xs font-bold transition flex items-center justify-center gap-2 ${
                        selectedRiderIds.length === 0
                          ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                          : 'bg-blue-600 hover:bg-blue-500 text-white shadow-md'
                      } ${isApplyingBulk ? 'opacity-70 animate-pulse' : ''}`}
                    >
                      {isApplyingBulk ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Applying to Firestore...</span>
                        </>
                      ) : (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          <span>Apply to {selectedRiderIds.length} Selected</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {/* Riders Selection Table */}
              <div className="bg-slate-950/60 border border-slate-800 rounded-xl overflow-hidden">
                {/* Table Header / Selection Bar */}
                <div className="p-3 bg-slate-900/80 border-b border-slate-800 flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={handleToggleSelectAll}
                      className="flex items-center gap-2 text-xs font-semibold text-slate-300 hover:text-white transition"
                    >
                      {isAllSelected ? (
                        <CheckSquare className="w-4 h-4 text-blue-400" />
                      ) : (
                        <Square className="w-4 h-4 text-slate-500" />
                      )}
                      <span>Select All Riders ({riders.length})</span>
                    </button>

                    {selectedRiderIds.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setSelectedRiderIds([])}
                        className="text-[11px] text-slate-400 hover:text-slate-200 underline"
                      >
                        Clear selection
                      </button>
                    )}
                  </div>

                  <div className="text-[11px] text-slate-400">
                    Live rates automatically sync to tenant user app
                  </div>
                </div>

                {loadingRiders ? (
                  <div className="py-12 text-center text-slate-400 flex flex-col items-center justify-center gap-2">
                    <RefreshCw className="w-5 h-5 animate-spin text-blue-400" />
                    <span className="text-xs">Loading delivery boys...</span>
                  </div>
                ) : riders.length === 0 ? (
                  <div className="py-12 text-center text-slate-400 space-y-1">
                    <Bike className="w-8 h-8 mx-auto text-slate-600 mb-2" />
                    <p className="text-sm text-slate-300 font-medium">No riders added yet by this user</p>
                    <p className="text-xs text-slate-500">When the user adds riders, they will appear here automatically.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-800/80">
                    {riders.map((rider) => {
                      const isSelected = selectedRiderIds.includes(rider.id);
                      const edit = editingRiders[rider.id] || {
                        baseRate: rider.baseRate ?? rateConfig.defaultBaseRate ?? BASE_RATE,
                        incentiveRate: rider.incentiveRate ?? rateConfig.defaultIncentiveRate ?? INCENTIVE_RATE,
                        incentiveEnabled: rider.incentiveEnabled ?? true,
                      };

                      return (
                        <div
                          key={rider.id}
                          className={`p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition ${
                            isSelected ? 'bg-blue-950/20' : 'hover:bg-slate-900/40'
                          }`}
                        >
                          {/* Rider Info & Checkbox */}
                          <div className="flex items-center gap-3 min-w-0">
                            <button
                              type="button"
                              onClick={() => handleToggleSelectRider(rider.id)}
                              className="text-slate-400 hover:text-white transition flex-shrink-0"
                            >
                              {isSelected ? (
                                <CheckSquare className="w-4 h-4 text-blue-400" />
                              ) : (
                                <Square className="w-4 h-4 text-slate-600" />
                              )}
                            </button>

                            <div className="w-9 h-9 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-xs text-slate-200 flex-shrink-0">
                              {rider.name.charAt(0).toUpperCase()}
                            </div>

                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-semibold text-white truncate">
                                  {rider.name}
                                </span>
                                <span
                                  className={`text-[10px] px-1.5 py-0.2 rounded font-medium ${
                                    rider.active
                                      ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                                      : 'bg-slate-800 text-slate-400'
                                  }`}
                                >
                                  {rider.active ? 'Active' : 'Inactive'}
                                </span>
                              </div>
                              <p className="text-xs text-slate-400 font-mono mt-0.5">
                                {rider.phone} • {rider.vehicleType || 'Bike'}
                              </p>
                            </div>
                          </div>

                          {/* Inline Individual Rates & Controls */}
                          <div className="flex items-center gap-3 self-end sm:self-center flex-wrap">
                            {/* Base Rate input */}
                            <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 px-2 py-1 rounded-lg">
                              <span className="text-[11px] text-slate-400 font-medium">Base:</span>
                              <span className="text-xs text-slate-300">₹</span>
                              <input
                                type="number"
                                step="0.5"
                                min="0"
                                value={edit.baseRate}
                                onChange={(e) => {
                                  const val = Number(e.target.value);
                                  setEditingRiders((prev) => ({
                                    ...prev,
                                    [rider.id]: { ...prev[rider.id], baseRate: val },
                                  }));
                                }}
                                className="w-12 bg-transparent text-xs font-semibold text-white focus:outline-none"
                              />
                            </div>

                            {/* Incentive Rate input */}
                            <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 px-2 py-1 rounded-lg">
                              <span className="text-[11px] text-slate-400 font-medium">Inc:</span>
                              <span className="text-xs text-slate-300">₹</span>
                              <input
                                type="number"
                                step="0.5"
                                min="0"
                                value={edit.incentiveRate}
                                onChange={(e) => {
                                  const val = Number(e.target.value);
                                  setEditingRiders((prev) => ({
                                    ...prev,
                                    [rider.id]: { ...prev[rider.id], incentiveRate: val },
                                  }));
                                }}
                                className="w-12 bg-transparent text-xs font-semibold text-white focus:outline-none"
                              />
                            </div>

                            {/* Incentive Enable/Disable toggle */}
                            <button
                              type="button"
                              onClick={() => {
                                setEditingRiders((prev) => ({
                                  ...prev,
                                  [rider.id]: {
                                    ...prev[rider.id],
                                    incentiveEnabled: !prev[rider.id].incentiveEnabled,
                                  },
                                }));
                              }}
                              className={`px-2 py-1 rounded-lg text-[11px] font-semibold border flex items-center gap-1 transition ${
                                edit.incentiveEnabled
                                  ? 'bg-emerald-950/50 text-emerald-300 border-emerald-800/80'
                                  : 'bg-rose-950/50 text-rose-300 border-rose-800/80'
                              }`}
                              title="Toggle incentive on/off for this rider"
                            >
                              <span>{edit.incentiveEnabled ? 'Bonus ON' : 'Bonus OFF'}</span>
                            </button>

                            {/* Single Save Button */}
                            <button
                              type="button"
                              disabled={edit.isSaving}
                              onClick={() => handleSaveSingleRider(rider.id)}
                              className="p-1.5 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30 transition text-xs flex items-center gap-1"
                              title="Save individual rider rate to Firestore"
                            >
                              {edit.isSaving ? (
                                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Save className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: ROLE-BASED FEATURE PERMISSIONS */}
          {activeSubTab === 'permissions' && (
            <div className="space-y-4">
              <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                      <Sliders className="w-4 h-4 text-blue-400" />
                      Role-Based Feature Flags & Access Gates
                    </h3>
                    <p className="text-xs text-slate-400 mt-1">
                      Toggle specific app screens or capabilities ON or OFF for this user. Toggled OFF features are immediately hidden from their interface.
                    </p>
                  </div>
                  {savingPermissions && (
                    <div className="flex items-center gap-1.5 text-xs text-blue-400">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Syncing...</span>
                    </div>
                  )}
                </div>
              </div>

              {/* 5 Feature Toggles */}
              <div className="space-y-3">
                {/* 1. Daily Entry Access */}
                <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 flex items-center justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Package className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-white">
                        Daily Delivery Entry Access
                      </h4>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Permits creating parcel delivery logs, editing entries, and viewing the daily entry form.
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleTogglePermission('canAccessDailyEntry')}
                    className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      permissions.canAccessDailyEntry ? 'bg-blue-600' : 'bg-slate-700'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        permissions.canAccessDailyEntry ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                {/* 2. Riders Section Access */}
                <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 flex items-center justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Bike className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-white">
                        Riders Directory Section
                      </h4>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Permits managing delivery boys, WhatsApp contacts, unpaid balance badges, and settlements.
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleTogglePermission('canAccessRiders')}
                    className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      permissions.canAccessRiders ? 'bg-blue-600' : 'bg-slate-700'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        permissions.canAccessRiders ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                {/* 3. Incentive Calculation */}
                <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 flex items-center justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Coins className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-white">
                        Incentive Calculation & Slabs
                      </h4>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Controls whether incentive bonuses are calculated. When OFF, hides the incentive checkbox and sets bonus to ₹0.
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleTogglePermission('canAccessIncentives')}
                    className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      permissions.canAccessIncentives ? 'bg-blue-600' : 'bg-slate-700'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        permissions.canAccessIncentives ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                {/* 4. Earnings & Statements / Reports */}
                <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 flex items-center justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-lg bg-purple-500/10 text-purple-400 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <FileText className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-white">
                        Earnings Statements & Analytics Reports
                      </h4>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Permits viewing earnings charts, rider payouts, settlement generation, and statement breakdowns.
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleTogglePermission('canAccessReports')}
                    className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      permissions.canAccessReports ? 'bg-blue-600' : 'bg-slate-700'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        permissions.canAccessReports ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                {/* 5. Export / Download Data */}
                <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 flex items-center justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-lg bg-sky-500/10 text-sky-400 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Download className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-white">
                        Export & Download Data (PDF/CSV/JSON)
                      </h4>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Controls whether this tenant can export financial statements, CSV parcel records, or local JSON backup files.
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleTogglePermission('canExportData')}
                    className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      permissions.canExportData ? 'bg-blue-600' : 'bg-slate-700'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        permissions.canExportData ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                {/* 6. Festival Greetings Access (Master Admin Controlled) */}
                <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 flex items-center justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Sparkles className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-semibold text-white">
                          Festival Greetings Access (त्योहार शुभकामना संदेश)
                        </h4>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                          permissions.festivalGreetings ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                        }`}>
                          {permissions.festivalGreetings ? 'Allowed' : 'Blocked'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Controls whether this tenant can access the Festival Greetings module & top banner. Disabled by default until explicitly permitted by Master Admin.
                      </p>
                    </div>
                  </div>

                  <button
                    id={`toggle-perm-festival-${user.uid}`}
                    type="button"
                    onClick={() => handleTogglePermission('festivalGreetings')}
                    className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      permissions.festivalGreetings ? 'bg-amber-500' : 'bg-slate-700'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        permissions.festivalGreetings ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: DEFAULT RATES & SLABS */}
          {activeSubTab === 'account_rates' && (
            <div className="space-y-5">
              <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Coins className="w-4 h-4 text-emerald-400" />
                  Tenant Default Rate Architecture & Hub Settings
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Configure default base payouts, incentive rules, and custom hub branding for this user's workspace.
                </p>
              </div>

              {/* Dynamic Business / Hub Signature per User Workspace */}
              <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center shrink-0">
                      <Building2 className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-white">
                        Custom Hub / Business Signature (हब / शाखा हस्ताक्षर)
                      </h4>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Signature stamped at the bottom of all Festival WhatsApp & SMS greetings sent from this user's workspace.
                      </p>
                    </div>
                  </div>
                </div>

                <div>
                  <input
                    id={`input-hub-sig-${user.uid}`}
                    type="text"
                    placeholder="e.g. पवन कबी / सरायकेला हब प्रबंधन (Pawan Kabi / Seraikella Hub Management)"
                    value={rateConfig.hubSignature || ''}
                    onChange={(e) =>
                      setRateConfig((prev) => ({
                        ...prev,
                        hubSignature: e.target.value,
                      }))
                    }
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white font-medium focus:outline-none focus:border-amber-500 placeholder:text-slate-600"
                  />
                </div>

                {/* Live Signature Sign-off Preview */}
                <div className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800 text-[11px] text-slate-400">
                  <span className="font-semibold text-slate-300">Message Sign-off Preview: </span>
                  <span className="text-amber-300 italic font-sans">
                    "— {rateConfig.hubSignature?.trim() || user.displayName || 'Hub Management'}"
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Default Base Payout */}
                <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-3">
                  <label className="text-xs font-semibold text-slate-300 block">
                    Default Base Payout (₹ per parcel)
                  </label>
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400 text-sm font-semibold">₹</span>
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      value={rateConfig.defaultBaseRate ?? 13}
                      onChange={(e) =>
                        setRateConfig((prev) => ({
                          ...prev,
                          defaultBaseRate: Number(e.target.value),
                        }))
                      }
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white font-bold focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Standard courier default is ₹13/parcel.
                  </p>
                </div>

                {/* Default Incentive Rate */}
                <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-3">
                  <label className="text-xs font-semibold text-slate-300 block">
                    Default Incentive Bonus (₹ per parcel)
                  </label>
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400 text-sm font-semibold">₹</span>
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      value={rateConfig.defaultIncentiveRate ?? 2}
                      onChange={(e) =>
                        setRateConfig((prev) => ({
                          ...prev,
                          defaultIncentiveRate: Number(e.target.value),
                        }))
                      }
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white font-bold focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Standard incentive default is ₹2/parcel (giving ₹15 effective rate).
                  </p>
                </div>
              </div>

              {/* Master Incentive Toggle */}
              <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 flex items-center justify-between gap-4">
                <div>
                  <h4 className="text-sm font-semibold text-white">
                    Master Incentive System Enabled
                  </h4>
                  <p className="text-xs text-slate-400 mt-0.5">
                    If disabled, the entire bonus system is shut down for this account.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setRateConfig((prev) => ({
                      ...prev,
                      incentivesEnabled: !prev.incentivesEnabled,
                    }))
                  }
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    rateConfig.incentivesEnabled ? 'bg-emerald-600' : 'bg-slate-700'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      rateConfig.incentivesEnabled ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  disabled={savingRateConfig}
                  onClick={handleSaveDefaultRateConfig}
                  className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition flex items-center gap-2 shadow-sm"
                >
                  {savingRateConfig ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving Defaults...</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-3.5 h-3.5" />
                      <span>Save Account Rate Defaults</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* TAB 4: SUBSCRIPTION & BILLING */}
          {activeSubTab === 'subscription' && (
            <div className="space-y-6">
              {/* Subscription Status Overview Card */}
              <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-5 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
                  <div>
                    <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                      <CreditCard className="w-4 h-4 text-blue-400" />
                      Tenant Subscription & Access Plan
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Configure monthly SaaS fee, validity period, payment QR code, and verify user payment slips.
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider border ${
                      subscription.planType === 'paid'
                        ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                        : 'bg-slate-800 text-slate-300 border-slate-700'
                    }`}>
                      {subscription.planType.toUpperCase()} PLAN
                    </span>

                    <span className={`px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider border ${
                      subscription.paymentStatus === 'active'
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                        : subscription.paymentStatus === 'verification_pending'
                        ? 'bg-blue-500/10 text-blue-400 border-blue-500/30 animate-pulse'
                        : subscription.paymentStatus === 'expiring_soon'
                        ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                        : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                    }`}>
                      {subscription.paymentStatus.replace('_', ' ').toUpperCase()}
                    </span>
                  </div>
                </div>

                {/* Grid of subscription parameters */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {/* Plan Type */}
                  <div className="bg-slate-900 border border-slate-800/90 rounded-xl p-4 space-y-2">
                    <label className="text-xs font-medium text-slate-300 block">Plan Type</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setSubscription(prev => ({ 
                            ...prev, 
                            planType: 'free',
                            paymentStatus: 'active' // Immediately clear all payment locks and alerts
                          }));
                        }}
                        className={`px-3 py-2 rounded-lg text-xs font-bold border transition cursor-pointer ${
                          subscription.planType === 'free'
                            ? 'bg-blue-600/20 text-blue-300 border-blue-500/50 shadow-sm'
                            : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white'
                        }`}
                      >
                        Free Plan
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setSubscription(prev => {
                            const now = Date.now();
                            const hasValidDate = prev.validUntil && new Date(prev.validUntil).getTime() > now;
                            const defaultValidUntil = hasValidDate 
                              ? prev.validUntil 
                              : new Date(now + 30 * 24 * 60 * 60 * 1000).toISOString();
                            return { 
                              ...prev, 
                              planType: 'paid',
                              monthlyFee: prev.monthlyFee > 0 ? prev.monthlyFee : 499,
                              validUntil: defaultValidUntil,
                              paymentStatus: 'active',
                            };
                          });
                        }}
                        className={`px-3 py-2 rounded-lg text-xs font-bold border transition cursor-pointer ${
                          subscription.planType === 'paid'
                            ? 'bg-amber-600/20 text-amber-300 border-amber-500/50 shadow-sm'
                            : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white'
                        }`}
                      >
                        Paid Plan
                      </button>
                    </div>
                    <p className="text-[11px] text-slate-400 pt-1">
                      {subscription.planType === 'free'
                        ? 'Free plan users never see any payment warnings, modals, or banners. Switching to Free clears all locks immediately.'
                        : 'Paid plan users see renewal alerts within 2 days of expiry and a payment modal with their assigned UPI QR code.'}
                    </p>
                  </div>

                  {/* Monthly Fee */}
                  <div className="bg-slate-900 border border-slate-800/90 rounded-xl p-4 space-y-2">
                    <label className="text-xs font-medium text-slate-300 block">
                      Monthly Fee (INR ₹)
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-2 text-slate-400 text-xs font-bold">₹</span>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={subscription.monthlyFee ?? 0}
                        onChange={(e) => setSubscription(prev => ({ ...prev, monthlyFee: Math.max(0, Number(e.target.value) || 0) }))}
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500 font-bold"
                        placeholder="e.g. 499"
                      />
                    </div>
                    {/* Quick fee presets */}
                    <div className="flex items-center gap-1.5 flex-wrap pt-1">
                      {[199, 299, 499, 999, 1499, 1999].map(preset => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => setSubscription(prev => ({ ...prev, monthlyFee: preset }))}
                          className={`text-[10px] px-1.5 py-0.5 rounded border transition ${
                            subscription.monthlyFee === preset
                              ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 font-bold'
                              : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white'
                          }`}
                        >
                          ₹{preset}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Payment Status */}
                  <div className="bg-slate-900 border border-slate-800/90 rounded-xl p-4 space-y-2">
                    <label className="text-xs font-medium text-slate-300 block">Payment Status</label>
                    <select
                      value={subscription.paymentStatus}
                      onChange={(e) => setSubscription(prev => ({ ...prev, paymentStatus: e.target.value as UserPaymentStatus }))}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
                    >
                      <option value="active">Active</option>
                      <option value="expiring_soon">Expiring Soon</option>
                      <option value="verification_pending">Verification Pending</option>
                      <option value="expired">Expired</option>
                    </select>
                  </div>
                </div>

                {/* Valid Until Date Picker & Quick Actions */}
                <div className="bg-slate-900 border border-slate-800/90 rounded-xl p-4 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <label className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-blue-400" />
                      Plan Valid Until (ISO Date)
                    </label>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[11px] text-slate-400 mr-1">Quick Add:</span>
                      <button
                        type="button"
                        onClick={() => handleQuickExtendDays(30)}
                        className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-[11px] font-medium transition cursor-pointer"
                      >
                        +30 Days
                      </button>
                      <button
                        type="button"
                        onClick={() => handleQuickExtendDays(90)}
                        className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-[11px] font-medium transition cursor-pointer"
                      >
                        +90 Days
                      </button>
                      <button
                        type="button"
                        onClick={() => handleQuickExtendDays(365)}
                        className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-[11px] font-medium transition cursor-pointer"
                      >
                        +1 Year
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <input
                      type="date"
                      value={subscription.validUntil ? subscription.validUntil.slice(0, 10) : ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (!val) {
                          setSubscription(prev => ({ ...prev, validUntil: '' }));
                          return;
                        }
                        const d = new Date(val + 'T23:59:59.999Z');
                        if (!isNaN(d.getTime())) {
                          setSubscription(prev => ({ ...prev, validUntil: d.toISOString() }));
                        }
                      }}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 font-mono"
                    />

                    <div className="flex items-center text-xs text-slate-400 bg-slate-950/60 border border-slate-800/80 rounded-lg px-3 py-2">
                      <Clock className="w-3.5 h-3.5 text-slate-500 mr-2 flex-shrink-0" />
                      <span>
                        {subscription.validUntil ? (
                          new Date(subscription.validUntil).getTime() > Date.now() ? (
                            <span className="text-emerald-400 font-semibold">
                              {Math.ceil((new Date(subscription.validUntil).getTime() - Date.now()) / (1000 * 60 * 60 * 24))} days remaining
                            </span>
                          ) : (
                            <span className="text-rose-400 font-semibold">
                              Expired {Math.ceil((Date.now() - new Date(subscription.validUntil).getTime()) / (1000 * 60 * 60 * 24))} days ago
                            </span>
                          )
                        ) : (
                          'No expiry configured'
                        )}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Payment QR Code Uploader & Instant Preview */}
                <div className="bg-slate-900 border border-slate-800/90 rounded-xl p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <label className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                        <QrCode className="w-3.5 h-3.5 text-amber-400" />
                        <span>QR Code फ़ोटो अपलोड करें (Upload QR Code Image)</span>
                      </label>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        उपयोगकर्ता के लिए विशिष्ट UPI QR कोड (GPay, PhonePe, Paytm) अपलोड करें।
                      </p>
                    </div>

                    {subscription.qrCodeUrl && (
                      <button
                        type="button"
                        onClick={() => setSubscription(prev => ({ ...prev, qrCodeUrl: '' }))}
                        className="text-[11px] text-rose-400 hover:text-rose-300 flex items-center gap-1 transition cursor-pointer font-medium"
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>Remove QR</span>
                      </button>
                    )}
                  </div>

                  {/* QR Image preview & uploader drop area */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
                    {/* File Upload Box */}
                    <div className="relative border-2 border-dashed border-slate-700 hover:border-amber-500/70 rounded-xl p-4 text-center transition bg-slate-950/60 cursor-pointer">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleQrUpload}
                        disabled={uploadingQr}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
                      />
                      <div className="flex flex-col items-center justify-center space-y-2 pointer-events-none py-1">
                        <div className="w-10 h-10 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-amber-400">
                          {uploadingQr ? (
                            <RefreshCw className="w-5 h-5 animate-spin text-amber-400" />
                          ) : (
                            <Upload className="w-5 h-5 text-amber-400" />
                          )}
                        </div>
                        <div className="space-y-0.5">
                          <p className="text-xs font-bold text-slate-200">
                            {uploadingQr ? 'छवि प्रोसेस हो रही है...' : 'QR Code फ़ोटो अपलोड करें (Upload QR Code Image)'}
                          </p>
                          <p className="text-[10px] text-slate-400">
                            PNG, JPG, WEBP • Click to Browse or Drop File
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* QR Preview or Placeholder */}
                    <div>
                      {subscription.qrCodeUrl ? (
                        <div className="flex items-center gap-3 p-3 bg-slate-950 rounded-xl border border-slate-800">
                          <div className="w-20 h-20 bg-white rounded-lg p-1.5 flex items-center justify-center border border-slate-300 shadow-sm flex-shrink-0">
                            <img
                              src={subscription.qrCodeUrl}
                              alt="Payment QR Code"
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-contain"
                              onError={(e) => {
                                (e.target as HTMLElement).style.display = 'none';
                              }}
                            />
                          </div>
                          <div className="text-xs text-slate-300 min-w-0 flex-1 space-y-1">
                            <span className="font-semibold block text-emerald-400">QR Code सक्रिय है</span>
                            <p className="text-[11px] text-slate-400">
                              उपयोगकर्ता को यह QR कोड उनके भुगतान स्क्रीन पर दिखाई देगा।
                            </p>
                            <span className="text-[10px] text-slate-500 font-mono block truncate">
                              Base64 Data • Ready to save
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div className="p-4 bg-slate-950/40 rounded-xl border border-dashed border-slate-800/80 text-center flex flex-col items-center justify-center h-full min-h-[96px]">
                          <QrCode className="w-6 h-6 text-slate-600 mb-1" />
                          <span className="text-xs text-slate-400">कोई कस्टम QR कोड संलग्न नहीं है</span>
                          <span className="text-[10px] text-slate-500">ऊपर दिए गए बॉक्स से फ़ोटो अपलोड करें</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Last Submitted Payment Slip Section */}
                <div className="bg-slate-900 border border-slate-800/90 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                    <h4 className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                      <Receipt className="w-4 h-4 text-emerald-400" />
                      Last Submitted Payment Slip
                    </h4>

                    {subscription.lastSubmittedSlip ? (
                      <span className="text-[11px] text-slate-400">
                        Submitted: {new Date(subscription.lastSubmittedSlip.submittedAt).toLocaleDateString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </span>
                    ) : (
                      <span className="text-[11px] text-slate-500 italic">No slip submitted yet</span>
                    )}
                  </div>

                  {subscription.lastSubmittedSlip ? (
                    <div className="space-y-4 pt-1">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                          <span className="text-[10px] text-slate-400 uppercase font-bold block">Amount Paid</span>
                          <span className="text-sm font-bold text-emerald-400">₹{subscription.lastSubmittedSlip.amountPaid}</span>
                        </div>

                        <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                          <span className="text-[10px] text-slate-400 uppercase font-bold block">UTR / Ref Number</span>
                          <span className="text-xs font-mono text-slate-200 truncate block">
                            {subscription.lastSubmittedSlip.utrNumber || 'Not provided'}
                          </span>
                        </div>

                        <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                          <span className="text-[10px] text-slate-400 uppercase font-bold block">Payment Slip File</span>
                          <a
                            href={subscription.lastSubmittedSlip.slipUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs text-blue-400 hover:underline flex items-center gap-1 font-medium mt-0.5"
                          >
                            <ExternalLink className="w-3 h-3" />
                            View Attached Slip
                          </a>
                        </div>
                      </div>

                      {/* Slip preview */}
                      <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 flex items-center gap-4">
                        <img
                          src={subscription.lastSubmittedSlip.slipUrl}
                          alt="Slip Preview"
                          referrerPolicy="no-referrer"
                          className="w-20 h-20 object-cover rounded-lg border border-slate-700 cursor-pointer hover:opacity-90 transition"
                          onClick={() => window.open(subscription.lastSubmittedSlip?.slipUrl, '_blank')}
                        />
                        <div className="flex-1 min-w-0 space-y-1.5">
                          <p className="text-xs text-slate-300 font-medium">Verify receipt and approve access</p>
                          <div className="flex items-center gap-2 flex-wrap">
                            <button
                              type="button"
                              onClick={() => {
                                handleQuickExtendDays(30);
                                showToast('Slip approved: Added 30 days and marked active!', 'success');
                              }}
                              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition flex items-center gap-1.5"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Approve & Extend 30 Days
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                setSubscription(prev => ({
                                  ...prev,
                                  paymentStatus: 'expired',
                                }));
                                showToast('Slip rejected: Marked as expired.', 'info');
                              }}
                              className="px-3 py-1.5 rounded-lg bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/40 text-xs font-bold transition flex items-center gap-1.5"
                            >
                              <UserX className="w-3.5 h-3.5" />
                              Reject Slip
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="p-4 bg-slate-950/60 rounded-lg border border-slate-800/80 text-center">
                      <p className="text-xs text-slate-400">
                        When the user transfers via UPI or bank and uploads their screenshot receipt, their slip URL, UTR number, and amount will appear here for one-click verification.
                      </p>
                    </div>
                  )}
                </div>

                {/* Save Subscription CTA */}
                <div className="flex justify-end pt-2">
                  <button
                    type="button"
                    disabled={savingSubscription}
                    onClick={handleSaveSubscription}
                    className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition flex items-center gap-2 shadow-sm"
                  >
                    {savingSubscription ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Saving Subscription...</span>
                      </>
                    ) : (
                      <>
                        <Save className="w-3.5 h-3.5" />
                        <span>Save Subscription Configuration</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between">
          <span className="text-xs text-slate-500 font-mono">
            Tenant: {user.email}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-medium transition border border-slate-700 cursor-pointer"
          >
            Back / Cancel (वापस जाएं)
          </button>
        </div>
      </div>
    </div>
  );
};
