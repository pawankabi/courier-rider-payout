import React, { useState } from 'react';
import { Trash2, RotateCcw, X, ShieldAlert, CheckCircle2, User, Package, IndianRupee } from 'lucide-react';
import { Rider, DeliveryEntry } from '../types';
import { formatINR, formatDateDisplay } from '../utils/formatters';

interface TrashRecoveryModalProps {
  isOpen: boolean;
  onClose: () => void;
  riders: Rider[];
  entries: DeliveryEntry[];
  onRestoreRider: (riderId: string) => void;
  onRestoreEntry: (entryId: string) => void;
  onRestoreAdvance?: (riderId: string, advanceId: string) => void;
}

export const TrashRecoveryModal: React.FC<TrashRecoveryModalProps> = ({
  isOpen,
  onClose,
  riders,
  entries,
  onRestoreRider,
  onRestoreEntry,
  onRestoreAdvance,
}) => {
  const [activeTab, setActiveTab] = useState<'entries' | 'advances' | 'riders'>('entries');
  const [restoredNotice, setRestoredNotice] = useState<string | null>(null);

  if (!isOpen) return null;

  const deletedEntries = (entries || []).filter((e) => Boolean(e.isDeleted));
  const deletedRiders = (riders || []).filter((r) => Boolean(r.isDeleted));

  // Collect deleted advances across all riders
  const deletedAdvances: { riderId: string; riderName: string; adv: any }[] = [];
  (riders || []).forEach((r) => {
    (r.advances || []).forEach((adv) => {
      if (adv.isDeleted || adv.status === 'DELETED' || adv.status === 'RESET_ARCHIVED') {
        deletedAdvances.push({
          riderId: r.id,
          riderName: r.name,
          adv,
        });
      }
    });
  });

  const totalDeletedCount = deletedEntries.length + deletedAdvances.length + deletedRiders.length;

  const handleRestoreRiderClick = (riderId: string, name: string) => {
    onRestoreRider(riderId);
    setRestoredNotice(`राइडर "${name}" को सफलतापूर्वक पुनः सक्रिय कर दिया गया!`);
    setTimeout(() => setRestoredNotice(null), 3000);
  };

  const handleRestoreEntryClick = (entryId: string, name: string) => {
    onRestoreEntry(entryId);
    setRestoredNotice(`डिलीवरी एंट्री (${name}) सफलतापूर्वक बहाल हो गई!`);
    setTimeout(() => setRestoredNotice(null), 3000);
  };

  const handleRestoreAdvanceClick = (riderId: string, advId: string, amt: number) => {
    if (onRestoreAdvance) {
      onRestoreAdvance(riderId, advId);
      setRestoredNotice(`एडवांस राशि ₹${formatINR(amt)} सफलतापूर्वक बहाल हो गई!`);
      setTimeout(() => setRestoredNotice(null), 3000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/75 backdrop-blur-xs animate-in fade-in">
      <div className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-5 bg-gradient-to-r from-rose-900 via-slate-900 to-indigo-950 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-rose-500/20 text-rose-300 border border-rose-400/30">
              <Trash2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold flex items-center gap-2">
                <span>रीसायकल बिन व डेटा रिकवरी</span>
                <span className="px-2 py-0.5 rounded-full bg-rose-500/30 text-rose-200 text-xs font-mono font-bold">
                  Zero Data Loss
                </span>
              </h3>
              <p className="text-xs text-slate-300 font-medium mt-0.5">
                हटाया गया कोई भी डेटा कभी नष्ट नहीं होता। यहाँ से आप 1-क्लिक में रीस्टोर कर सकते हैं।
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

        {/* Tab Selection */}
        <div className="flex items-center gap-2 px-6 pt-4 border-b border-slate-200 bg-slate-50">
          <button
            onClick={() => setActiveTab('entries')}
            className={`px-4 py-2.5 text-xs font-bold rounded-t-xl transition border-b-2 flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'entries'
                ? 'border-indigo-600 text-indigo-700 bg-white shadow-2xs'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Package className="w-3.5 h-3.5" />
            <span>डिलीट की गई डिलीवरी ({deletedEntries.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('advances')}
            className={`px-4 py-2.5 text-xs font-bold rounded-t-xl transition border-b-2 flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'advances'
                ? 'border-indigo-600 text-indigo-700 bg-white shadow-2xs'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <IndianRupee className="w-3.5 h-3.5" />
            <span>हटाए गए एडवांस ({deletedAdvances.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('riders')}
            className={`px-4 py-2.5 text-xs font-bold rounded-t-xl transition border-b-2 flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'riders'
                ? 'border-indigo-600 text-indigo-700 bg-white shadow-2xs'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <User className="w-3.5 h-3.5" />
            <span>हटाए गए राइडर्स ({deletedRiders.length})</span>
          </button>
        </div>

        {/* Restored Toast Banner */}
        {restoredNotice && (
          <div className="mx-6 mt-3 p-3 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-800 text-xs font-semibold flex items-center gap-2 shadow-2xs">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{restoredNotice}</span>
          </div>
        )}

        {/* Content list */}
        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          {activeTab === 'entries' && (
            <>
              {deletedEntries.length === 0 ? (
                <div className="py-12 text-center text-slate-400">
                  <Package className="w-10 h-10 mx-auto text-slate-300 mb-2" />
                  <p className="text-sm font-semibold">कोई भी हटाई गई डिलीवरी एंट्री नहीं है।</p>
                  <p className="text-xs text-slate-400 mt-1">आपका सारा दैनिक हिसाब सक्रिय और सुरक्षित है।</p>
                </div>
              ) : (
                deletedEntries.map((e) => (
                  <div
                    key={e.id}
                    className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 hover:border-slate-300 transition flex items-center justify-between gap-4"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 text-sm">{e.riderName}</span>
                        <span className="text-xs text-slate-500 font-mono">({formatDateDisplay(e.date)})</span>
                      </div>
                      <div className="text-xs text-slate-600 mt-1 flex items-center gap-3">
                        <span>पैकेट: <strong>{e.parcels}</strong></span>
                        <span>कमाई: <strong>₹{formatINR(e.totalEarnings)}</strong></span>
                        {e.deletedAt && (
                          <span className="text-[10px] text-slate-400">
                            हटाया गया: {new Date(e.deletedAt).toLocaleDateString('hi-IN')}
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => handleRestoreEntryClick(e.id, e.riderName)}
                      className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold text-xs flex items-center gap-1.5 shadow-2xs transition cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>रीस्टोर करें</span>
                    </button>
                  </div>
                ))
              )}
            </>
          )}

          {activeTab === 'advances' && (
            <>
              {deletedAdvances.length === 0 ? (
                <div className="py-12 text-center text-slate-400">
                  <IndianRupee className="w-10 h-10 mx-auto text-slate-300 mb-2" />
                  <p className="text-sm font-semibold">कोई भी हटाया गया एडवांस रिकॉर्ड नहीं है।</p>
                  <p className="text-xs text-slate-400 mt-1">सारे अग्रिम भुगतान सुरक्षित रूप से लेजर में हैं।</p>
                </div>
              ) : (
                deletedAdvances.map(({ riderId, riderName, adv }) => (
                  <div
                    key={adv.id}
                    className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 hover:border-slate-300 transition flex items-center justify-between gap-4"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 text-sm">{riderName}</span>
                        <span className="text-xs font-bold text-rose-700 font-mono">
                          ₹{formatINR(adv.amount)}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 mt-0.5">कारण: {adv.reason || 'अग्रिम राशि'}</p>
                      {adv.deletedAt && (
                        <p className="text-[10px] text-slate-400 mt-0.5">
                          हटाया गया: {new Date(adv.deletedAt).toLocaleDateString('hi-IN')}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => handleRestoreAdvanceClick(riderId, adv.id, adv.amount)}
                      className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold text-xs flex items-center gap-1.5 shadow-2xs transition cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>रीस्टोर करें</span>
                    </button>
                  </div>
                ))
              )}
            </>
          )}

          {activeTab === 'riders' && (
            <>
              {deletedRiders.length === 0 ? (
                <div className="py-12 text-center text-slate-400">
                  <User className="w-10 h-10 mx-auto text-slate-300 mb-2" />
                  <p className="text-sm font-semibold">कोई भी हटाया गया राइडर नहीं है।</p>
                </div>
              ) : (
                deletedRiders.map((r) => (
                  <div
                    key={r.id}
                    className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 hover:border-slate-300 transition flex items-center justify-between gap-4"
                  >
                    <div>
                      <span className="font-bold text-slate-900 text-sm">{r.name}</span>
                      <p className="text-xs text-slate-500 font-mono mt-0.5">{r.phone || 'फोन नंबर नहीं'}</p>
                      {r.deletedAt && (
                        <p className="text-[10px] text-slate-400 mt-0.5">
                          हटाया गया: {new Date(r.deletedAt).toLocaleDateString('hi-IN')}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => handleRestoreRiderClick(r.id, r.name)}
                      className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold text-xs flex items-center gap-1.5 shadow-2xs transition cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>पुनः सक्रिय करें</span>
                    </button>
                  </div>
                ))
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <span className="text-xs text-slate-500 font-medium">
            कुल सुरक्षित संग्रह: <strong>{totalDeletedCount}</strong> रिकॉर्ड्स
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
