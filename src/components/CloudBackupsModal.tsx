import React, { useState, useEffect } from 'react';
import { Cloud, CloudDownload, RefreshCw, X, ShieldCheck, Calendar, Database, CheckCircle2 } from 'lucide-react';
import { HubAutoBackupSnapshot } from '../types';
import { loadAutoCloudBackups, createAutoCloudBackup } from '../services/autoBackupService';
import { formatINR, formatDateDisplay } from '../utils/formatters';

interface CloudBackupsModalProps {
  isOpen: boolean;
  onClose: () => void;
  hubId: string;
  riders: any[];
  entries: any[];
  settlements: any[];
  settings?: any;
  onRestoreSnapshot: (snapshot: HubAutoBackupSnapshot) => Promise<void>;
}

export const CloudBackupsModal: React.FC<CloudBackupsModalProps> = ({
  isOpen,
  onClose,
  hubId,
  riders,
  entries,
  settlements,
  settings,
  onRestoreSnapshot,
}) => {
  const [backups, setBackups] = useState<HubAutoBackupSnapshot[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const fetchBackups = async () => {
    setIsLoading(true);
    try {
      const list = await loadAutoCloudBackups(hubId);
      setBackups(list);
    } catch (err) {
      console.warn('Failed to load auto cloud backups:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchBackups();
    }
  }, [isOpen, hubId]);

  if (!isOpen) return null;

  const handleCreateNow = async () => {
    setIsCreating(true);
    setStatusMessage(null);
    try {
      const snap = await createAutoCloudBackup(hubId, riders, entries, settlements, settings);
      if (snap) {
        setStatusMessage('नया क्लाउड बैकअप स्नैपशॉट सफलतापूर्वक बन गया!');
        await fetchBackups();
      }
    } catch {
      setStatusMessage('क्लाउड बैकअप बनाने में त्रुटि हुई।');
    } finally {
      setIsCreating(false);
    }
  };

  const handleRestoreClick = async (snapshot: HubAutoBackupSnapshot) => {
    setRestoringId(snapshot.id);
    setStatusMessage(null);
    try {
      await onRestoreSnapshot(snapshot);
      setStatusMessage(`तारीख ${formatDateDisplay(snapshot.date)} का बैकअप सफलतापूर्वक रीस्टोर हो गया!`);
    } catch {
      setStatusMessage('बैकअप रीस्टोर करने में त्रुटि हुई।');
    } finally {
      setRestoringId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/75 backdrop-blur-xs animate-in fade-in">
      <div className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-5 bg-gradient-to-r from-sky-900 via-indigo-950 to-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-sky-500/20 text-sky-300 border border-sky-400/30">
              <Cloud className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold flex items-center gap-2">
                <span>ऑटोमैटिक क्लाउड बैकअप इतिहास</span>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/30 text-emerald-200 text-xs font-mono font-bold">
                  Cloud Vault
                </span>
              </h3>
              <p className="text-xs text-slate-300 font-medium mt-0.5">
                हर दिन का सुरक्षित स्नैपशॉट — डिवाइस बदलने या कैश साफ होने पर भी 1-क्लिक रीस्टोर।
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Action bar */}
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-3">
          <div className="text-xs text-slate-600 font-semibold">
            कुल क्लाउड स्नैपशॉट्स: <strong className="text-slate-900">{backups.length}</strong>
          </div>
          <button
            onClick={handleCreateNow}
            disabled={isCreating}
            className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-bold text-xs flex items-center gap-1.5 shadow-2xs transition disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isCreating ? 'animate-spin' : ''}`} />
            <span>{isCreating ? 'बैकअप बन रहा है...' : 'अभी नया क्लाउड स्नैपशॉट लें'}</span>
          </button>
        </div>

        {/* Status Message */}
        {statusMessage && (
          <div className="mx-6 mt-3 p-3 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-800 text-xs font-semibold flex items-center gap-2 shadow-2xs">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{statusMessage}</span>
          </div>
        )}

        {/* Backup list */}
        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          {isLoading ? (
            <div className="py-12 text-center text-slate-400 flex flex-col items-center justify-center gap-2">
              <RefreshCw className="w-6 h-6 animate-spin text-indigo-500" />
              <p className="text-xs font-semibold">क्लाउड बैकअप्स लोड हो रहे हैं...</p>
            </div>
          ) : backups.length === 0 ? (
            <div className="py-12 text-center text-slate-400">
              <Database className="w-10 h-10 mx-auto text-slate-300 mb-2" />
              <p className="text-sm font-semibold">अभी कोई क्लाउड स्नैपशॉट नहीं मिला।</p>
              <p className="text-xs text-slate-400 mt-1">
                ऊपर दिए गए "अभी नया क्लाउड स्नैपशॉट लें" बटन पर क्लिक करके पहला स्नैपशॉट बनाएं।
              </p>
            </div>
          ) : (
            backups.map((snap) => (
              <div
                key={snap.id}
                className="p-4 rounded-2xl bg-slate-50 border border-slate-200 hover:border-slate-300 transition flex items-center justify-between gap-4"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-extrabold text-slate-900 text-sm">
                      📅 {formatDateDisplay(snap.date)}
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-800 text-[10px] font-bold">
                      {snap.summary?.totalDeliveries || snap.deliveries?.length || 0} डिलीवरी
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                      {snap.summary?.totalRiders || snap.riders?.length || 0} राइडर्स
                    </span>
                  </div>

                  <div className="mt-1.5 text-xs text-slate-600 flex flex-wrap items-center gap-x-4 gap-y-1">
                    {snap.summary?.totalCodAmount ? (
                      <span>कुल COD: <strong>₹{formatINR(snap.summary.totalCodAmount)}</strong></span>
                    ) : null}
                    {snap.summary?.totalCashDeposited ? (
                      <span>कैश जमा: <strong>₹{formatINR(snap.summary.totalCashDeposited)}</strong></span>
                    ) : null}
                    <span className="text-[10px] text-slate-400">
                      बनाया गया: {new Date(snap.createdAt).toLocaleTimeString('hi-IN', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => handleRestoreClick(snap)}
                  disabled={restoringId === snap.id}
                  className="px-3.5 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 active:scale-95 text-white font-bold text-xs flex items-center gap-1.5 shadow-2xs transition disabled:opacity-50 cursor-pointer"
                >
                  <CloudDownload className={`w-3.5 h-3.5 ${restoringId === snap.id ? 'animate-bounce' : ''}`} />
                  <span>{restoringId === snap.id ? 'रीस्टोर हो रहा है...' : '1-क्लिक रीस्टोर'}</span>
                </button>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <span className="text-xs text-slate-500 font-medium flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span>क्लाउड डेटा तिजोरी में पूर्णतः सुरक्षित</span>
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold text-xs transition cursor-pointer"
          >
            बंद करें
          </button>
        </div>
      </div>
    </div>
  );
};
