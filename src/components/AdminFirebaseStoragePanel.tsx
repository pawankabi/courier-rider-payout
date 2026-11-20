import React, { useEffect, useMemo, useState } from 'react';
import {
  HardDrive,
  Database,
  Wallet,
  ExternalLink,
  RefreshCw,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  Trash2,
  Plus,
  Search,
  Crown,
  IndianRupee,
  Save,
  Calendar,
  Users,
  Lock,
  Landmark,
  Sliders,
} from 'lucide-react';
import { AppUser } from '../types';
import {
  DEFAULT_FIREBASE_STORAGE_POLICY,
  FirebaseRechargeEntry,
  FirebaseStoragePolicy,
  UserStorageFootprint,
  formatStorageSize,
  getOfficialFirebaseConsoleUrls,
  runAdminOldPaidDeliveriesCleanup,
  saveFirebaseStoragePolicy,
  scanAllUsersFirebaseStorage,
  subscribeToFirebaseStoragePolicy,
} from '../services/firebaseStorageManager';
import { formatINR, getTodayDateString } from '../utils/formatters';

interface AdminFirebaseStoragePanelProps {
  users: AppUser[];
}

export const AdminFirebaseStoragePanel: React.FC<AdminFirebaseStoragePanelProps> = ({ users }) => {
  const [policy, setPolicy] = useState<FirebaseStoragePolicy>(DEFAULT_FIREBASE_STORAGE_POLICY);
  const [savingPolicy, setSavingPolicy] = useState(false);

  // Editable policy draft inputs
  const [autoCleanupDraft, setAutoCleanupDraft] = useState(false);
  const [thresholdDraft, setThresholdDraft] = useState(85);
  const [retentionDaysDraft, setRetentionDaysDraft] = useState(730);
  const [manualConsoleMbDraft, setManualConsoleMbDraft] = useState('');
  const [billingPlanDraft, setBillingPlanDraft] = useState<'Spark (Free 1 GB)' | 'Blaze (Pay-as-you-go)'>(
    'Spark (Free 1 GB)'
  );
  const [spentDraft, setSpentDraft] = useState('0');
  const [remainingBalanceDraft, setRemainingBalanceDraft] = useState('0');

  // Add Recharge form
  const [rechargeAmount, setRechargeAmount] = useState('');
  const [rechargeDate, setRechargeDate] = useState(getTodayDateString());
  const [rechargeMethod, setRechargeMethod] = useState<FirebaseRechargeEntry['method']>('Bank Account');
  const [rechargeNote, setRechargeNote] = useState('');
  const [addingRecharge, setAddingRecharge] = useState(false);

  // Per-user storage scanner
  const [footprints, setFootprints] = useState<UserStorageFootprint[]>([]);
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 });
  const [userSearch, setUserSearch] = useState('');

  // Manual safe cleanup modal
  const [confirmCleanupOpen, setConfirmCleanupOpen] = useState(false);
  const [runningCleanup, setRunningCleanup] = useState(false);
  const [bannerMessage, setBannerMessage] = useState<{ text: string; type: 'success' | 'info' | 'error' } | null>(null);

  const consoleUrls = useMemo(() => getOfficialFirebaseConsoleUrls(), []);

  useEffect(() => {
    const unsub = subscribeToFirebaseStoragePolicy((loaded) => {
      setPolicy(loaded);
      setAutoCleanupDraft(loaded.autoCleanupEnabled);
      setThresholdDraft(loaded.cleanupThresholdPercent);
      setRetentionDaysDraft(loaded.retentionDays);
      setManualConsoleMbDraft(loaded.manualConsoleUsageMB !== null ? String(loaded.manualConsoleUsageMB) : '');
      setBillingPlanDraft(loaded.billingPlan);
      setSpentDraft(String(loaded.totalSpentINR || 0));
      setRemainingBalanceDraft(String(loaded.remainingBalanceINR || 0));
    });
    return () => unsub();
  }, []);

  // Build instant leaderboard from already-stored per-user `storageStats` on `all_users`
  useEffect(() => {
    const cached: UserStorageFootprint[] = users
      .map((u) => {
        const stats = (u as any).storageStats as UserStorageFootprint | undefined;
        if (stats && typeof stats.totalBytes === 'number') {
          return {
            ...stats,
            uid: u.uid,
            email: u.email || stats.email || '',
            name: u.displayName || stats.name || u.email || 'Unknown User',
          };
        }
        // Fallback rough estimate from user's known riders/deliveries count until Admin runs full scan
        const approxBytes = (Number(u.totalRiders) || 0) * 1400 + (Number(u.totalEntries) || 0) * 650;
        return {
          uid: u.uid,
          email: u.email || '',
          name: u.displayName || u.email || 'Unknown User',
          totalBytes: approxBytes,
          totalKB: Number((approxBytes / 1024).toFixed(2)),
          totalMB: Number((approxBytes / (1024 * 1024)).toFixed(4)),
          ridersCount: Number(u.totalRiders) || 0,
          deliveriesCount: Number(u.totalEntries) || 0,
          unpaidDeliveriesCount: 0,
          paidDeliveriesOver2YearsCount: 0,
          settlementsCount: 0,
          advancesCount: 0,
          incentivesCount: 0,
          codLogsCount: 0,
          scannedAt: '',
        };
      })
      .sort((a, b) => b.totalBytes - a.totalBytes);

    setFootprints((prev) => (prev.length > 0 && scanning ? prev : cached));
  }, [users, scanning]);

  const showToast = (text: string, type: 'success' | 'info' | 'error' = 'success') => {
    setBannerMessage({ text, type });
    setTimeout(() => setBannerMessage(null), 5000);
  };

  const totalFootprintBytes = useMemo(
    () => footprints.reduce((sum, f) => sum + (f.totalBytes || 0), 0),
    [footprints]
  );
  const totalFootprintMB = totalFootprintBytes / (1024 * 1024);

  const effectiveUsageMB =
    policy.manualConsoleUsageMB !== null && policy.manualConsoleUsageMB >= 0
      ? policy.manualConsoleUsageMB
      : Math.max(policy.lastScannedTotalMB || 0, Number(totalFootprintMB.toFixed(3)));

  const freeLimitMB = policy.freeLimitMB || 1024;
  const usagePercent = Math.min(100, (effectiveUsageMB / freeLimitMB) * 100);
  const remainingFreeMB = Math.max(0, freeLimitMB - effectiveUsageMB);
  const isOverThreshold = usagePercent >= policy.cleanupThresholdPercent;

  // Estimated monthly storage overage cost if exceeding 1 GB Free Tier (~₹15 per extra GB/month on Blaze)
  const overageGB = Math.max(0, (effectiveUsageMB - freeLimitMB) / 1024);
  const estimatedMonthlyOverageINR = Math.round(overageGB * 15);

  const totalEligibleOldPaid = useMemo(
    () => footprints.reduce((sum, f) => sum + (f.paidDeliveriesOver2YearsCount || 0), 0),
    [footprints]
  );

  const topConsumer = footprints.length > 0 ? footprints[0] : null;

  const filteredFootprints = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    if (!q) return footprints;
    return footprints.filter(
      (f) =>
        f.name.toLowerCase().includes(q) ||
        f.email.toLowerCase().includes(q) ||
        f.uid.toLowerCase().includes(q)
    );
  }, [footprints, userSearch]);

  const handleScanAllUsers = async () => {
    if (users.length === 0) return;
    setScanning(true);
    setScanProgress({ done: 0, total: users.length });
    try {
      const res = await scanAllUsersFirebaseStorage(users, retentionDaysDraft, (done, total) => {
        setScanProgress({ done, total });
      });
      setFootprints(res.footprints);
      showToast(
        `सभी ${users.length} यूज़र्स का लाइव मेमोरी स्कैन पूरा हुआ — कुल अनुमानित स्टोरेज: ${res.totalMB.toFixed(2)} MB`,
        'success'
      );
    } catch (err) {
      console.error('Storage scan error:', err);
      showToast('मेमोरी स्कैन करने में त्रुटि आई, कृपया पुनः प्रयास करें।', 'error');
    } finally {
      setScanning(false);
    }
  };

  const handleSavePolicy = async () => {
    setSavingPolicy(true);
    try {
      const parsedManualMB =
        manualConsoleMbDraft.trim() === '' ? null : Math.max(0, Number(manualConsoleMbDraft));
      await saveFirebaseStoragePolicy({
        autoCleanupEnabled: autoCleanupDraft,
        cleanupThresholdPercent: Math.min(98, Math.max(50, Number(thresholdDraft) || 85)),
        retentionDays: Math.max(90, Number(retentionDaysDraft) || 730),
        manualConsoleUsageMB: parsedManualMB !== null && !isNaN(parsedManualMB) ? parsedManualMB : null,
        manualConsoleUpdatedAt: parsedManualMB !== null ? new Date().toISOString() : null,
      });
      showToast('Firebase स्टोरेज नियम और 2-साल ऑटो-पॉलिसी सेव हो गई है।', 'success');
    } catch (err) {
      console.error('Save policy error:', err);
      showToast('पॉलिसी सेव करने में त्रुटि आई।', 'error');
    } finally {
      setSavingPolicy(false);
    }
  };

  const handleAddRecharge = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Number(rechargeAmount);
    if (!amt || amt <= 0) {
      showToast('कृपया सही रिचार्ज राशि (₹) दर्ज करें।', 'error');
      return;
    }
    setAddingRecharge(true);
    try {
      const newEntry: FirebaseRechargeEntry = {
        id: `rech_${Date.now()}`,
        date: rechargeDate || getTodayDateString(),
        amountINR: amt,
        method: rechargeMethod,
        note: rechargeNote.trim() || 'Firebase Billing Top-up',
        createdAt: new Date().toISOString(),
      };
      const updatedHistory = [newEntry, ...(policy.rechargeHistory || [])].slice(0, 50);
      const newTotalRecharged = (policy.totalRechargedINR || 0) + amt;
      const newRemaining = Math.max(0, (policy.remainingBalanceINR || 0) + amt);

      await saveFirebaseStoragePolicy({
        billingPlan: billingPlanDraft,
        rechargeHistory: updatedHistory,
        totalRechargedINR: newTotalRecharged,
        remainingBalanceINR: newRemaining,
        lastBillingSyncedAt: new Date().toISOString(),
      });
      setRechargeAmount('');
      setRechargeNote('');
      showToast(`₹${amt.toLocaleString('en-IN')} का Firebase रिचार्ज बैलेंस में जुड़ गया है।`, 'success');
    } catch (err) {
      console.error('Add recharge error:', err);
      showToast('रिचार्ज सेव करने में त्रुटि आई।', 'error');
    } finally {
      setAddingRecharge(false);
    }
  };

  const handleSaveBillingBalance = async () => {
    setSavingPolicy(true);
    try {
      const spent = Math.max(0, Number(spentDraft) || 0);
      const remaining = Math.max(0, Number(remainingBalanceDraft) || 0);
      await saveFirebaseStoragePolicy({
        billingPlan: billingPlanDraft,
        totalSpentINR: spent,
        remainingBalanceINR: remaining,
        lastBillingSyncedAt: new Date().toISOString(),
      });
      showToast('Firebase बैलेंस और खर्च का विवरण अपडेट हो गया है।', 'success');
    } catch (err) {
      console.error('Save billing error:', err);
      showToast('बैलेंस अपडेट करने में त्रुटि आई।', 'error');
    } finally {
      setSavingPolicy(false);
    }
  };

  const handleDeleteRechargeEntry = async (entryId: string) => {
    const target = (policy.rechargeHistory || []).find((r) => r.id === entryId);
    if (!target) return;
    const updatedHistory = (policy.rechargeHistory || []).filter((r) => r.id !== entryId);
    const newTotalRecharged = Math.max(0, (policy.totalRechargedINR || 0) - target.amountINR);
    const newRemaining = Math.max(0, (policy.remainingBalanceINR || 0) - target.amountINR);
    await saveFirebaseStoragePolicy({
      rechargeHistory: updatedHistory,
      totalRechargedINR: newTotalRecharged,
      remainingBalanceINR: newRemaining,
    });
    showToast('रिचार्ज एंट्री हटा दी गई है।', 'info');
  };

  const handleRunManualCleanup = async () => {
    setRunningCleanup(true);
    try {
      const result = await runAdminOldPaidDeliveriesCleanup(users, policy.retentionDays);
      setConfirmCleanupOpen(false);
      if (result.deletedCount === 0) {
        showToast('2 साल से पुरानी कोई भी Paid डिलीवरी नहीं मिली — पूरा डाटा पहले से साफ है।', 'info');
      } else {
        showToast(
          `${result.affectedUsers} यूज़र्स की ${result.deletedCount} पुरानी Paid डिलीवरी साफ हुईं (~${result.freedKB} KB खाली हुआ)।`,
          'success'
        );
        handleScanAllUsers();
      }
    } catch (err) {
      console.error('Manual cleanup error:', err);
      showToast('सफाई के दौरान त्रुटि आई।', 'error');
    } finally {
      setRunningCleanup(false);
    }
  };

  const meterColor =
    usagePercent >= policy.cleanupThresholdPercent
      ? 'from-rose-500 to-red-600'
      : usagePercent >= 65
      ? 'from-amber-400 to-orange-500'
      : 'from-emerald-400 to-teal-500';

  return (
    <div className="space-y-6 animate-in fade-in">
      {bannerMessage && (
        <div
          className={`p-3.5 rounded-xl border text-xs font-semibold flex items-center gap-2.5 shadow-lg ${
            bannerMessage.type === 'success'
              ? 'bg-emerald-950/80 border-emerald-500/40 text-emerald-200'
              : bannerMessage.type === 'error'
              ? 'bg-rose-950/80 border-rose-500/40 text-rose-200'
              : 'bg-blue-950/80 border-blue-500/40 text-blue-200'
          }`}
        >
          {bannerMessage.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
          ) : (
            <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
          )}
          <span>{bannerMessage.text}</span>
        </div>
      )}

      {/* SECTION 1: FIREBASE 1 GB STORAGE METER + SMART 2-YEAR AUTO-RETENTION POLICY */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950/50 border border-indigo-500/30 rounded-2xl p-5 sm:p-6 shadow-xl space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="p-2 rounded-xl bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                <Database className="w-5 h-5" />
              </span>
              <div>
                <h2 className="text-lg font-extrabold text-white tracking-tight">
                  Firebase 1 GB स्टोरेज मीटर और स्मार्ट 2-साल ऑटो नियम
                </h2>
                <p className="text-xs text-slate-400">
                  मेमोरी खाली रहने पर 2 साल से पुराना डाटा भी सुरक्षित रहेगा • केवल {policy.cleanupThresholdPercent}% भरने पर पुरानी Paid डिलीवरी रोल होंगी
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={handleScanAllUsers}
              disabled={scanning}
              className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white text-xs font-bold flex items-center gap-2 shadow-lg shadow-indigo-600/25 cursor-pointer transition"
            >
              <RefreshCw className={`w-4 h-4 ${scanning ? 'animate-spin' : ''}`} />
              <span>
                {scanning
                  ? `स्कैन हो रहा है (${scanProgress.done}/${scanProgress.total})...`
                  : 'सभी यूज़र्स की मेमोरी स्कैन करें'}
              </span>
            </button>

            <a
              href={consoleUrls.firestoreStorageUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-bold flex items-center gap-1.5 transition"
            >
              <HardDrive className="w-4 h-4 text-cyan-400" />
              <span>Firestore ग्राफ देखें</span>
              <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
            </a>
          </div>
        </div>

        {/* Storage Progress Bar */}
        <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                कुल Firebase स्टोरेज उपयोग (Free Tier: 1024 MB)
              </span>
              <div className="flex items-baseline gap-2 mt-0.5">
                <span className="text-2xl sm:text-3xl font-black text-white font-mono">
                  {effectiveUsageMB.toFixed(2)} MB
                </span>
                <span className="text-sm font-bold text-slate-400">/ {freeLimitMB} MB (1 GB)</span>
                <span
                  className={`px-2 py-0.5 rounded-md text-xs font-black ${
                    isOverThreshold
                      ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                      : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  }`}
                >
                  {usagePercent.toFixed(1)}% भरा
                </span>
              </div>
            </div>
            <div className="text-left sm:text-right text-xs">
              <div className="text-emerald-300 font-bold">
                खाली फ्री मेमोरी: {remainingFreeMB.toFixed(1)} MB
              </div>
              <div className="text-slate-400 text-[11px]">
                {policy.manualConsoleUsageMB !== null
                  ? 'स्रोत: एडमिन द्वारा दर्ज Firebase Console MB'
                  : policy.lastScannedAt
                  ? `अंतिम स्कैन: ${new Date(policy.lastScannedAt).toLocaleString('en-IN')}`
                  : 'अनुमानित (सटीक आंकड़े के लिए ऊपर "स्कैन करें" दबाएं)'}
              </div>
            </div>
          </div>

          <div className="relative h-4 w-full bg-slate-800 rounded-full overflow-hidden border border-slate-700">
            <div
              className={`h-full bg-gradient-to-r ${meterColor} transition-all duration-500`}
              style={{ width: `${Math.max(1.5, usagePercent)}%` }}
            />
            {/* Threshold marker line */}
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-amber-300 shadow-[0_0_8px_rgba(252,211,77,0.9)]"
              style={{ left: `${policy.cleanupThresholdPercent}%` }}
              title={`Auto-Cleanup Threshold: ${policy.cleanupThresholdPercent}%`}
            />
          </div>

          {/* Live Protection Status Banner */}
          <div
            className={`p-3 rounded-xl border text-xs flex items-start gap-2.5 ${
              isOverThreshold
                ? 'bg-rose-950/50 border-rose-500/40 text-rose-200'
                : 'bg-emerald-950/40 border-emerald-500/30 text-emerald-200'
            }`}
          >
            {isOverThreshold ? (
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
            ) : (
              <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5 text-emerald-400" />
            )}
            <div className="leading-relaxed">
              {isOverThreshold ? (
                <span>
                  <strong>अलर्ट:</strong> Firebase मेमोरी {policy.cleanupThresholdPercent}% से ऊपर पहुँच गई है।
                  ऑटो-नियम चालू रहने पर केवल <strong>{Math.round(policy.retentionDays / 365)} साल से पुरानी Paid डिलीवरी</strong> ही धीरे-धीरे साफ होंगी।
                </span>
              ) : (
                <span>
                  <strong>पूरी तरह सुरक्षित:</strong> अभी 1 GB में पर्याप्त जगह खाली है ({usagePercent.toFixed(1)}% उपयोग)। इसलिए{' '}
                  <strong>2 साल से भी पुराना डाटा डिलीट नहीं होगा</strong> और 100% सुरक्षित रहेगा।
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Policy Settings Controls */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3.5 flex flex-col justify-between gap-2">
            <label className="text-[11px] font-bold text-slate-300 flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-indigo-400" />
              <span>स्मार्ट ऑटो-सफाई नियम</span>
            </label>
            <button
              type="button"
              onClick={() => setAutoCleanupDraft((v) => !v)}
              className={`w-full py-2 px-3 rounded-lg text-xs font-extrabold border transition cursor-pointer ${
                autoCleanupDraft
                  ? 'bg-emerald-600/20 border-emerald-500/50 text-emerald-300'
                  : 'bg-slate-800 border-slate-700 text-slate-300'
              }`}
            >
              {autoCleanupDraft ? `ON (${thresholdDraft}% पार होने पर ही चालू)` : 'OFF (सुरक्षित डिफ़ॉल्ट — ऑटो-डिलीट बंद)'}
            </button>
          </div>

          <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3.5 space-y-1.5">
            <label className="text-[11px] font-bold text-slate-300 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-amber-400" />
              <span>डेटा रखने की न्यूनतम अवधि</span>
            </label>
            <select
              value={retentionDaysDraft}
              onChange={(e) => setRetentionDaysDraft(Number(e.target.value))}
              className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs font-bold text-white"
            >
              <option value={365}>1 साल (365 दिन)</option>
              <option value={730}>2 साल (730 दिन — अनुशंसित)</option>
              <option value={1095}>3 साल (1095 दिन)</option>
            </select>
          </div>

          <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3.5 space-y-1.5">
            <label className="text-[11px] font-bold text-slate-300">
              सफाई थ्रेशहोल्ड (% of 1 GB)
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={50}
                max={98}
                value={thresholdDraft}
                onChange={(e) => setThresholdDraft(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs font-bold text-white font-mono"
              />
              <span className="text-xs font-bold text-slate-400">%</span>
            </div>
          </div>

          <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3.5 space-y-1.5">
            <label className="text-[11px] font-bold text-slate-300">
              Console से सटीक MB (वैकल्पिक)
            </label>
            <input
              type="number"
              min={0}
              step="0.1"
              placeholder="खाली = ऑटो स्कैन"
              value={manualConsoleMbDraft}
              onChange={(e) => setManualConsoleMbDraft(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs font-bold text-white font-mono placeholder:text-slate-500"
            />
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
          <div className="flex items-center gap-2 flex-wrap text-[11px] text-slate-300">
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-950/70 border border-emerald-500/30 text-emerald-300 font-semibold">
              <Lock className="w-3 h-3" /> राइडर्स व सेटलमेंट लॉक्ड
            </span>
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-950/70 border border-emerald-500/30 text-emerald-300 font-semibold">
              <Lock className="w-3 h-3" /> Unpaid, एडवांस व इंसेंटिव लॉक्ड
            </span>
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-950/70 border border-indigo-500/30 text-indigo-200 font-semibold">
              <ShieldCheck className="w-3 h-3" /> 6-लेयर सुरक्षा (180 दिन Paid कूलडाउन)
            </span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {totalEligibleOldPaid > 0 && (
              <button
                type="button"
                onClick={() => setConfirmCleanupOpen(true)}
                className="px-3.5 py-2 rounded-xl bg-rose-600/20 hover:bg-rose-600/30 border border-rose-500/40 text-rose-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>2 साल से पुरानी Paid साफ करें ({totalEligibleOldPaid})</span>
              </button>
            )}
            <button
              type="button"
              onClick={handleSavePolicy}
              disabled={savingPolicy}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white text-xs font-bold flex items-center gap-1.5 shadow-md shadow-emerald-600/20 cursor-pointer transition"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{savingPolicy ? 'सेव हो रहा है...' : 'स्टोरेज नियम सेव करें'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* SECTION 2: FIREBASE BALANCE, RECHARGE LEDGER & DIRECT BANK ACCOUNT TOP-UP LINKS */}
      <div className="bg-gradient-to-br from-emerald-950/35 via-slate-900 to-slate-900 border border-emerald-500/30 rounded-2xl p-5 sm:p-6 shadow-xl space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              <Wallet className="w-5 h-5" />
            </span>
            <div>
              <h2 className="text-lg font-extrabold text-white tracking-tight">
                Firebase बैलेंस, रिचार्ज हिसाब और डायरेक्ट बैंक पेमेंट लिंक
              </h2>
              <p className="text-xs text-slate-400">
                प्रोजेक्ट: <span className="font-mono text-emerald-300">{consoleUrls.projectId}</span> • रिचार्ज किया पैसा, बचा बैलेंस और डायरेक्ट Google Cloud Billing लिंक
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <a
              href={consoleUrls.addBalanceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-extrabold flex items-center gap-2 shadow-lg shadow-emerald-600/30 transition"
            >
              <Landmark className="w-4 h-4" />
              <span>बैंक अकाउंट / UPI से बैलेंस ऐड करें</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>

            <a
              href={consoleUrls.firebaseUsageUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-bold flex items-center gap-1.5 transition"
            >
              <IndianRupee className="w-4 h-4 text-amber-400" />
              <span>Firebase लाइव बिल देखें</span>
              <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
            </a>
          </div>
        </div>

        {/* 3 Balance KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
          <div className="bg-slate-950/70 border border-emerald-500/30 rounded-xl p-4">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              कुल रिचार्ज किया गया (Total Added)
            </span>
            <div className="text-2xl font-black text-emerald-300 font-mono mt-1">
              {formatINR(policy.totalRechargedINR || 0)}
            </div>
            <div className="text-[11px] text-slate-400 mt-1">
              कुल {(policy.rechargeHistory || []).length} बार रिचार्ज दर्ज
            </div>
          </div>

          <div className="bg-slate-950/70 border border-amber-500/30 rounded-xl p-4">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              कुल खर्च / वर्तमान बिल (Spent)
            </span>
            <div className="text-2xl font-black text-amber-300 font-mono mt-1">
              {formatINR(policy.totalSpentINR || 0)}
            </div>
            <div className="text-[11px] text-slate-400 mt-1">
              अनुमानित स्टोरेज चार्ज: {estimatedMonthlyOverageINR === 0 ? '₹0 (1 GB फ्री के अंदर)' : `~${formatINR(estimatedMonthlyOverageINR)}/माह`}
            </div>
          </div>

          <div className="bg-slate-950/70 border border-cyan-500/35 rounded-xl p-4">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              बचा हुआ Firebase बैलेंस (Remaining)
            </span>
            <div className="text-2xl font-black text-cyan-300 font-mono mt-1">
              {formatINR(policy.remainingBalanceINR || 0)}
            </div>
            <div className="text-[11px] text-slate-400 mt-1">
              प्लान: <span className="text-white font-semibold">{policy.billingPlan}</span>
            </div>
          </div>
        </div>

        {/* Recharge Entry Form + Manual Balance Sync */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Form A: Record Bank/UPI Recharge */}
          <form
            onSubmit={handleAddRecharge}
            className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-3"
          >
            <div className="text-xs font-extrabold text-white flex items-center gap-2">
              <Plus className="w-4 h-4 text-emerald-400" />
              <span>नया Firebase रिचार्ज दर्ज करें (बैंक / UPI के बाद)</span>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="text-[11px] text-slate-400 block mb-1">राशि (₹)</label>
                <input
                  type="number"
                  min={1}
                  placeholder="जैसे 1000"
                  value={rechargeAmount}
                  onChange={(e) => setRechargeAmount(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs font-bold text-white font-mono"
                />
              </div>
              <div>
                <label className="text-[11px] text-slate-400 block mb-1">तारीख</label>
                <input
                  type="date"
                  value={rechargeDate}
                  onChange={(e) => setRechargeDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs font-bold text-white"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="text-[11px] text-slate-400 block mb-1">भुगतान माध्यम</label>
                <select
                  value={rechargeMethod}
                  onChange={(e) => setRechargeMethod(e.target.value as FirebaseRechargeEntry['method'])}
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs font-bold text-white"
                >
                  <option value="Bank Account">Bank Account</option>
                  <option value="UPI">UPI</option>
                  <option value="NetBanking">NetBanking</option>
                  <option value="Debit/Credit Card">Debit/Credit Card</option>
                </select>
              </div>
              <div>
                <label className="text-[11px] text-slate-400 block mb-1">नोट (वैकल्पिक)</label>
                <input
                  type="text"
                  placeholder="UTR / रिमार्क"
                  value={rechargeNote}
                  onChange={(e) => setRechargeNote(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={addingRecharge}
              className="w-full py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition"
            >
              <Plus className="w-4 h-4" />
              <span>{addingRecharge ? 'जुड़ रहा है...' : 'रिचार्ज बैलेंस में जोड़ें'}</span>
            </button>
          </form>

          {/* Form B: Sync Exact Remaining Balance & Plan from Google Cloud Console */}
          <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-3">
            <div className="text-xs font-extrabold text-white flex items-center gap-2">
              <RefreshCw className="w-4 h-4 text-cyan-400" />
              <span>Google Cloud Billing के अनुसार वर्तमान बैलेंस अपडेट करें</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div>
                <label className="text-[11px] text-slate-400 block mb-1">Firebase प्लान</label>
                <select
                  value={billingPlanDraft}
                  onChange={(e) =>
                    setBillingPlanDraft(e.target.value as 'Spark (Free 1 GB)' | 'Blaze (Pay-as-you-go)')
                  }
                  className="w-full px-2.5 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs font-bold text-white"
                >
                  <option value="Spark (Free 1 GB)">Spark (Free 1 GB)</option>
                  <option value="Blaze (Pay-as-you-go)">Blaze (Pay-as-you-go)</option>
                </select>
              </div>
              <div>
                <label className="text-[11px] text-slate-400 block mb-1">कुल खर्च (₹)</label>
                <input
                  type="number"
                  min={0}
                  value={spentDraft}
                  onChange={(e) => setSpentDraft(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs font-bold text-white font-mono"
                />
              </div>
              <div>
                <label className="text-[11px] text-slate-400 block mb-1">बचा बैलेंस (₹)</label>
                <input
                  type="number"
                  min={0}
                  value={remainingBalanceDraft}
                  onChange={(e) => setRemainingBalanceDraft(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs font-bold text-cyan-300 font-mono"
                />
              </div>
            </div>

            <button
              type="button"
              onClick={handleSaveBillingBalance}
              disabled={savingPolicy}
              className="w-full py-2.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-60 text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition"
            >
              <Save className="w-4 h-4" />
              <span>बैलेंस व प्लान सेव करें</span>
            </button>

            <p className="text-[11px] text-slate-400 leading-relaxed">
              <strong className="text-slate-300">सुरक्षा नोट:</strong> Google की सुरक्षा नीति के कारण बैंक अकाउंट से लाइव पेमेंट और ऑटो-बैलेंस Google Cloud Billing पोर्टल पर होता है। ऊपर दिए{' '}
              <span className="text-emerald-300 font-semibold">"बैंक अकाउंट / UPI से बैलेंस ऐड करें"</span> बटन से आप सीधे भुगतान कर सकते हैं और यहाँ अपना पूरा रिचार्ज व शेष बैलेंस रिकॉर्ड रख सकते हैं।
            </p>
          </div>
        </div>

        {/* Recharge History List */}
        {(policy.rechargeHistory || []).length > 0 && (
          <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3.5 space-y-2">
            <div className="text-xs font-bold text-slate-300">रिचार्ज इतिहास (Recharge History)</div>
            <div className="divide-y divide-slate-800/80 max-h-48 overflow-y-auto">
              {policy.rechargeHistory.map((item) => (
                <div key={item.id} className="py-2 flex items-center justify-between gap-3 text-xs">
                  <div className="min-w-0">
                    <span className="font-bold text-emerald-300 font-mono">{formatINR(item.amountINR)}</span>
                    <span className="text-slate-400 mx-2">•</span>
                    <span className="text-slate-200 font-semibold">{item.method}</span>
                    {item.note && <span className="text-slate-400 ml-2">({item.note})</span>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[11px] text-slate-400 font-mono">{item.date}</span>
                    <button
                      type="button"
                      onClick={() => handleDeleteRechargeEntry(item.id)}
                      className="p-1 rounded-md text-slate-500 hover:text-rose-400 hover:bg-rose-950/40 cursor-pointer"
                      title="हटाएं"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* SECTION 3: PER-USER MEMORY USAGE LEADERBOARD */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xl space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/30">
              <Users className="w-5 h-5" />
            </span>
            <div>
              <h2 className="text-lg font-extrabold text-white tracking-tight">
                किस यूज़र ने कितनी मेमोरी इस्तेमाल की (Top Memory Users)
              </h2>
              <p className="text-xs text-slate-400">
                सबसे ज़्यादा मेमोरी इस्तेमाल करने वाले यूज़र सबसे ऊपर दिखेंगे
              </p>
            </div>
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="यूज़र नाम या ईमेल खोजें..."
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white placeholder:text-slate-500"
            />
          </div>
        </div>

        {/* #1 Top Memory User Highlight */}
        {topConsumer && topConsumer.totalBytes > 0 && (
          <div className="bg-gradient-to-r from-amber-950/50 via-slate-950 to-rose-950/40 border border-amber-500/40 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <span className="p-2.5 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-400/40 shrink-0">
                <Crown className="w-5 h-5" />
              </span>
              <div className="min-w-0">
                <div className="text-[11px] font-black uppercase tracking-wider text-amber-300">
                  #1 सबसे ज़्यादा मेमोरी इस्तेमाल करने वाला यूज़र
                </div>
                <div className="text-sm font-extrabold text-white truncate">{topConsumer.name}</div>
                <div className="text-xs text-slate-400 truncate">{topConsumer.email}</div>
              </div>
            </div>
            <div className="flex items-center gap-4 shrink-0">
              <div className="text-right">
                <div className="text-xl font-black text-amber-300 font-mono">
                  {formatStorageSize(topConsumer.totalBytes)}
                </div>
                <div className="text-[11px] text-slate-400">
                  कुल उपयोग का{' '}
                  <strong className="text-white">
                    {totalFootprintBytes > 0
                      ? ((topConsumer.totalBytes / totalFootprintBytes) * 100).toFixed(1)
                      : '0'}
                    %
                  </strong>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Per-User Ranked List */}
        <div className="space-y-2.5">
          {filteredFootprints.length === 0 ? (
            <div className="text-center py-8 text-xs text-slate-400">
              कोई यूज़र रिकॉर्ड नहीं मिला।
            </div>
          ) : (
            filteredFootprints.map((u, idx) => {
              const sharePercent =
                totalFootprintBytes > 0 ? (u.totalBytes / totalFootprintBytes) * 100 : 0;
              const of1GbPercent = (u.totalBytes / (freeLimitMB * 1024 * 1024)) * 100;

              return (
                <div
                  key={u.uid}
                  className="bg-slate-950/70 border border-slate-800 hover:border-slate-700 rounded-xl p-3.5 space-y-2 transition"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black shrink-0 ${
                          idx === 0
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                            : idx === 1
                            ? 'bg-slate-700/80 text-slate-200 border border-slate-600'
                            : idx === 2
                            ? 'bg-orange-950/70 text-orange-300 border border-orange-500/30'
                            : 'bg-slate-900 text-slate-400 border border-slate-800'
                        }`}
                      >
                        #{idx + 1}
                      </span>
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-white truncate">{u.name}</div>
                        <div className="text-[11px] text-slate-400 truncate">{u.email}</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 sm:text-right">
                      <div>
                        <div className="text-sm font-black text-cyan-300 font-mono">
                          {formatStorageSize(u.totalBytes)}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          कुल का {sharePercent.toFixed(1)}% • 1 GB का {of1GbPercent.toFixed(2)}%
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Per-user progress bar */}
                  <div className="h-2 w-full bg-slate-900 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        idx === 0
                          ? 'bg-gradient-to-r from-amber-400 to-rose-500'
                          : 'bg-gradient-to-r from-indigo-500 to-cyan-400'
                      }`}
                      style={{ width: `${Math.max(2, Math.min(100, sharePercent))}%` }}
                    />
                  </div>

                  {/* Detailed breakdown chips */}
                  <div className="flex items-center gap-2 flex-wrap text-[11px] text-slate-300">
                    <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800">
                      राइडर्स: <strong className="text-white">{u.ridersCount}</strong>
                    </span>
                    <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800">
                      डिलीवरी: <strong className="text-white">{u.deliveriesCount}</strong>
                    </span>
                    <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800">
                      सेटलमेंट: <strong className="text-white">{u.settlementsCount}</strong>
                    </span>
                    {u.unpaidDeliveriesCount > 0 && (
                      <span className="px-2 py-0.5 rounded bg-amber-950/60 border border-amber-500/30 text-amber-300">
                        Unpaid (लॉक्ड): <strong>{u.unpaidDeliveriesCount}</strong>
                      </span>
                    )}
                    {u.paidDeliveriesOver2YearsCount > 0 && (
                      <span className="px-2 py-0.5 rounded bg-rose-950/60 border border-rose-500/30 text-rose-300">
                        2 साल+ Paid: <strong>{u.paidDeliveriesOver2YearsCount}</strong>
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* In-App Confirmation Modal for Safe >2-Year Paid Cleanup */}
      {confirmCleanupOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-rose-500/40 rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center gap-2.5 text-rose-300">
              <Trash2 className="w-5 h-5" />
              <h3 className="text-base font-extrabold text-white">
                2 साल से पुरानी Paid डिलीवरी साफ करें?
              </h3>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              केवल <strong>{policy.retentionDays} दिन (2 साल) से पुरानी</strong> और पूरी तरह{' '}
              <strong>Paid (चुकता)</strong> हो चुकी कुल <strong>{totalEligibleOldPaid}</strong> डिलीवरी एंट्रीज़ Firebase से हटेंगी।
              <br />
              <span className="text-emerald-300 font-semibold block mt-2">
                ✓ कोई भी राइडर, सेटलमेंट, बकाया (Unpaid) डिलीवरी, एडवांस या इंसेंटिव डिलीट नहीं होगा।
              </span>
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={runningCleanup}
                onClick={() => setConfirmCleanupOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold cursor-pointer"
              >
                रद्द करें
              </button>
              <button
                type="button"
                disabled={runningCleanup}
                onClick={handleRunManualCleanup}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-60 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{runningCleanup ? 'सफाई हो रही है...' : 'हां, सुरक्षित सफाई करें'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
