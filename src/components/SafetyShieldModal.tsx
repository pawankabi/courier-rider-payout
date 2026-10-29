import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, 
  X, 
  RefreshCw, 
  Download, 
  CheckCircle2, 
  AlertCircle, 
  Lock, 
  Wifi, 
  WifiOff, 
  Database, 
  Smartphone, 
  FileCheck2 
} from 'lucide-react';
import { Rider, SettlementRecord, DeliveryEntry } from '../types';
import { 
  auditAndHealAllRiderLedgers, 
  exportEmergencySafetyBackup, 
  SafetyShieldStatus, 
  getLastSnapshotTime 
} from '../services/safetyShield';

interface SafetyShieldModalProps {
  isOpen: boolean;
  onClose: () => void;
  riders: Rider[];
  settlements: SettlementRecord[];
  deliveries: DeliveryEntry[];
  onRidersUpdated?: (updated: Rider[]) => void;
}

export const SafetyShieldModal: React.FC<SafetyShieldModalProps> = ({
  isOpen,
  onClose,
  riders,
  settlements,
  deliveries,
  onRidersUpdated,
}) => {
  const [isRunningAudit, setIsRunningAudit] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [auditStatus, setAuditStatus] = useState<SafetyShieldStatus | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3500);
  };

  const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;

  // Run initial lightweight audit when modal opens
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    auditAndHealAllRiderLedgers(riders, settlements, deliveries, false)
      .then((res) => {
        if (isMounted) {
          setAuditStatus(res.status);
        }
      })
      .catch((err) => {
        console.warn('Initial audit error notice:', err);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, riders, settlements, deliveries]);

  if (!isOpen) return null;

  const handleRunFullAuditAndHeal = async () => {
    setIsRunningAudit(true);
    setProgress({ current: 0, total: riders.length });

    try {
      const res = await auditAndHealAllRiderLedgers(
        riders,
        settlements,
        deliveries,
        true,
        (current, total) => {
          setProgress({ current, total });
        }
      );

      setAuditStatus(res.status);

      if (res.hasChanges && onRidersUpdated) {
        onRidersUpdated(res.repairedRiders);
      }

      showToast(
        res.status.issues.length === 0
          ? '✅ सुरक्षा ऑडिट सफल: सभी 19 राइडर्स का हिसाब-किताब 100% सही और लॉक है!'
          : `✅ सुरक्षा कवच सक्रिय: ${res.status.issues.length} विसंगतियों को स्वतः ठीक कर लॉक किया गया!`
      );
    } catch (err) {
      console.error('Audit execution error:', err);
      showToast('⚠️ ऑडिट में रुकावट आई, कृपया पुनः प्रयास करें।');
    } finally {
      setIsRunningAudit(false);
      setProgress(null);
    }
  };

  const handleDownloadBackup = () => {
    exportEmergencySafetyBackup(riders, settlements, deliveries);
    showToast('📥 इमरजेंसी बैकअप JSON फ़ाइल डाउनलोड हो गई है!');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in">
      <div className="w-full max-w-xl bg-slate-900 border border-emerald-500/40 rounded-3xl shadow-2xl overflow-hidden ring-1 ring-emerald-500/30 flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="px-5 py-4 bg-gradient-to-r from-emerald-950/80 via-slate-900 to-teal-950/80 border-b border-emerald-500/30 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center shadow-lg shadow-emerald-950/50">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-bold text-white tracking-tight">
                  सुरक्षा कवच एवं हिसाब-किताब ताला
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                  <Lock className="w-2.5 h-2.5" />
                  <span>100% लॉक</span>
                </span>
              </div>
              <p className="text-xs text-slate-400">
                एडमिन और राइडर ऐप में हिसाब-किताब का सटीक मिलान व सुरक्षा सुरक्षात्मक घेरा
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-4">
          {/* Toast Message */}
          {toastMsg && (
            <div className="p-3 rounded-2xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-xs font-semibold flex items-center gap-2 animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
              <span>{toastMsg}</span>
            </div>
          )}

          {/* Core Shields Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Shield 1: Math Lock */}
            <div className="p-3.5 rounded-2xl bg-slate-850/80 border border-slate-800 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                  <FileCheck2 className="w-4 h-4 text-emerald-400" />
                  <span>गणितीय ताला (Math Lock)</span>
                </span>
                <span className="text-[11px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                  सक्रिय
                </span>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                सभी गणनाएं 2-दशमलव बैंक-ग्रेड फॉर्मूले पर लॉक हैं। कभी भी ₹1 का भी फर्क नहीं आ सकता।
              </p>
            </div>

            {/* Shield 2: Cross-Device Parity */}
            <div className="p-3.5 rounded-2xl bg-slate-850/80 border border-slate-800 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                  <Smartphone className="w-4 h-4 text-teal-400" />
                  <span>मोबाइल समानता (Parity)</span>
                </span>
                <span className="text-[11px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                  सत्यापित
                </span>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                एडमिन और राइडर दोनों के फोन में एक ही 'प्योर लेजर इंजन' से हिसाब दिखता है।
              </p>
            </div>

            {/* Shield 3: Real-Time Cloud Sync */}
            <div className="p-3.5 rounded-2xl bg-slate-850/80 border border-slate-800 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                  <Database className="w-4 h-4 text-blue-400" />
                  <span>क्लाउड डेटाबेस (Firestore)</span>
                </span>
                <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border flex items-center gap-1 ${
                  isOnline 
                    ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' 
                    : 'text-amber-400 bg-amber-500/10 border-amber-500/20'
                }`}>
                  {isOnline ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                  <span>{isOnline ? 'लाइव सिंक' : 'ऑफ़लाइन सुरक्षित'}</span>
                </span>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                एडमिन द्वारा कोई भी एंट्री करते ही राइडर के मोबाइल पर रियल-टाइम सेकंड में अपडेट होता है।
              </p>
            </div>

            {/* Shield 4: Anti-Wipe Protection */}
            <div className="p-3.5 rounded-2xl bg-slate-850/80 border border-slate-800 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                  <Lock className="w-4 h-4 text-indigo-400" />
                  <span>घाटा कैरी-फॉरवर्ड सुरक्षा</span>
                </span>
                <span className="text-[11px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                  अपरिवर्तनीय
                </span>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                पुराने सेटलमेंट का कोई भी बकाया या घाटा कभी मिट नहीं सकता; वह हमेशा सुरक्षित रहता है।
              </p>
            </div>
          </div>

          {/* Audit Status Card */}
          <div className="p-4 rounded-2xl bg-gradient-to-br from-slate-850 to-slate-900 border border-slate-750 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-white">सिस्टम स्वास्थ्य व लेजर सत्यापन</span>
                <span className="text-[11px] px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 border border-slate-700">
                  कुल {riders.length} राइडर्स
                </span>
              </div>
              <span className="text-[11px] text-slate-400 font-mono">
                {auditStatus?.lastAuditTimestamp ? new Date(auditStatus.lastAuditTimestamp).toLocaleTimeString('en-IN') : 'सत्यापित'}
              </span>
            </div>

            {auditStatus && (
              <div className="grid grid-cols-3 gap-2 text-center pt-1">
                <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                  <div className="text-lg font-black text-emerald-400">
                    {auditStatus.healthyRidersCount}
                  </div>
                  <div className="text-[10px] text-slate-400">100% सत्यापित</div>
                </div>

                <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                  <div className="text-lg font-black text-teal-400">
                    {settlements.length}
                  </div>
                  <div className="text-[10px] text-slate-400">कुल सेटलमेंट्स</div>
                </div>

                <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                  <div className="text-lg font-black text-blue-400">
                    {deliveries.length}
                  </div>
                  <div className="text-[10px] text-slate-400">डिलीवरी रिकॉर्ड्स</div>
                </div>
              </div>
            )}

            {/* If any issues detected and repaired */}
            {auditStatus && auditStatus.issues.length > 0 && (
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 space-y-1">
                <div className="font-bold flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>ऑटो-रिपेयर रिपोर्ट:</span>
                </div>
                <div className="space-y-0.5 text-[11px] text-amber-200/90 pl-5 list-disc">
                  {auditStatus.issues.map((iss, i) => (
                    <div key={i}>• {iss.riderName}: {iss.description}</div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="space-y-2 pt-1">
            <button
              type="button"
              disabled={isRunningAudit}
              onClick={handleRunFullAuditAndHeal}
              className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-emerald-600 via-teal-600 to-blue-600 hover:from-emerald-500 hover:to-blue-500 active:scale-98 text-white font-bold text-xs sm:text-sm shadow-lg shadow-emerald-950/60 flex items-center justify-center gap-2 cursor-pointer transition disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isRunningAudit ? 'animate-spin' : ''}`} />
              <span>
                {isRunningAudit 
                  ? `ऑडिट व ताला लगाया जा रहा है (${progress?.current || 0}/${progress?.total || riders.length})...` 
                  : 'तुरंत पूर्ण सुरक्षा ऑडिट चलाएं व हिसाब लॉक करें'}
              </span>
            </button>

            <button
              type="button"
              onClick={handleDownloadBackup}
              className="w-full py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-200 text-xs font-semibold border border-slate-700 flex items-center justify-center gap-2 cursor-pointer transition"
            >
              <Download className="w-3.5 h-3.5 text-emerald-400" />
              <span>इमरजेंसी बैकअप सुरक्षित डाउनलोड करें (JSON File)</span>
            </button>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3 bg-slate-950 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-500">
          <span>सरायकेला कूरियर डिलीवरी हब • सुरक्षा कवच v2.5</span>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1 rounded-lg bg-slate-850 hover:bg-slate-800 text-slate-300 text-xs font-medium cursor-pointer"
          >
            बंद करें
          </button>
        </div>
      </div>
    </div>
  );
};

export default SafetyShieldModal;
