import React, { useState } from 'react';
import {
  Trash2,
  RotateCcw,
  X,
  CheckCircle2,
  User,
  Package,
  IndianRupee,
  AlertTriangle,
  Clock,
  RefreshCw,
} from 'lucide-react';
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
  onPermanentDeleteEntry?: (entryId: string) => Promise<void> | void;
  onPermanentDeleteRider?: (riderId: string) => Promise<void> | void;
  onPermanentDeleteAdvance?: (riderId: string, advanceId: string) => Promise<void> | void;
  onEmptyTrash?: () => Promise<void> | void;
}

type ConfirmTarget =
  | { kind: 'entry'; id: string; label: string }
  | { kind: 'rider'; id: string; label: string }
  | { kind: 'advance'; riderId: string; advanceId: string; label: string }
  | { kind: 'empty_all'; label: string };

const TRASH_RETENTION_DAYS = 30;

function getRemainingDaysLabel(deletedAt?: string): string {
  if (!deletedAt) return '30 दिन स्वतः सफाई सुरक्षित';
  const ts = new Date(deletedAt).getTime();
  if (isNaN(ts)) return '30 दिन स्वतः सफाई सुरक्षित';
  const elapsedDays = Math.floor((Date.now() - ts) / (24 * 60 * 60 * 1000));
  const remaining = Math.max(0, TRASH_RETENTION_DAYS - elapsedDays);
  if (remaining <= 0) return 'आज स्वतः साफ होगा';
  return `${remaining} दिन शेष`;
}

export const TrashRecoveryModal: React.FC<TrashRecoveryModalProps> = ({
  isOpen,
  onClose,
  riders,
  entries,
  onRestoreRider,
  onRestoreEntry,
  onRestoreAdvance,
  onPermanentDeleteEntry,
  onPermanentDeleteRider,
  onPermanentDeleteAdvance,
  onEmptyTrash,
}) => {
  const [activeTab, setActiveTab] = useState<'entries' | 'advances' | 'riders'>('entries');
  const [restoredNotice, setRestoredNotice] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<ConfirmTarget | null>(null);
  const [isDeletingPermanent, setIsDeletingPermanent] = useState(false);

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

  const showNotice = (msg: string) => {
    setRestoredNotice(msg);
    setTimeout(() => setRestoredNotice(null), 3500);
  };

  const handleRestoreRiderClick = (riderId: string, name: string) => {
    onRestoreRider(riderId);
    showNotice(`राइडर "${name}" को सफलतापूर्वक पुनः सक्रिय कर दिया गया!`);
  };

  const handleRestoreEntryClick = (entryId: string, name: string) => {
    onRestoreEntry(entryId);
    showNotice(`डिलीवरी एंट्री (${name}) सफलतापूर्वक बहाल हो गई!`);
  };

  const handleRestoreAdvanceClick = (riderId: string, advId: string, amt: number) => {
    if (onRestoreAdvance) {
      onRestoreAdvance(riderId, advId);
      showNotice(`एडवांस राशि ${formatINR(amt)} सफलतापूर्वक बहाल हो गई!`);
    }
  };

  const handleConfirmPermanentDelete = async () => {
    if (!confirmTarget || isDeletingPermanent) return;
    setIsDeletingPermanent(true);
    try {
      if (confirmTarget.kind === 'entry' && onPermanentDeleteEntry) {
        await onPermanentDeleteEntry(confirmTarget.id);
        showNotice(`डिलीवरी एंट्री स्थायी रूप से हटा दी गई। स्टोरेज साफ हुआ!`);
      } else if (confirmTarget.kind === 'rider' && onPermanentDeleteRider) {
        await onPermanentDeleteRider(confirmTarget.id);
        showNotice(`राइडर रिकॉर्ड स्थायी रूप से हटा दिया गया।`);
      } else if (confirmTarget.kind === 'advance' && onPermanentDeleteAdvance) {
        await onPermanentDeleteAdvance(confirmTarget.riderId, confirmTarget.advanceId);
        showNotice(`एडवांस एंट्री स्थायी रूप से हटा दी गई।`);
      } else if (confirmTarget.kind === 'empty_all' && onEmptyTrash) {
        await onEmptyTrash();
        showNotice(`कचरा पेटी के सभी ${totalDeletedCount} रिकॉर्ड स्थायी रूप से साफ हो गए!`);
      }
      setConfirmTarget(null);
    } finally {
      setIsDeletingPermanent(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/75 backdrop-blur-xs animate-in fade-in">
      <div className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-5 bg-gradient-to-r from-rose-900 via-slate-900 to-indigo-950 text-white flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2.5 rounded-2xl bg-rose-500/20 text-rose-300 border border-rose-400/30 shrink-0">
              <Trash2 className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-bold flex items-center gap-2 flex-wrap">
                <span>रीसायकल बिन व डेटा रिकवरी</span>
                <span className="px-2 py-0.5 rounded-full bg-amber-500/25 text-amber-200 border border-amber-400/30 text-[11px] font-semibold">
                  30 दिन स्वतः सफाई
                </span>
              </h3>
              <p className="text-xs text-slate-300 font-medium mt-0.5">
                हटाया गया डेटा 30 दिन बाद स्वतः डिलीट हो जाता है। आप अभी रीस्टोर या तुरंत स्थायी हटा सकते हैं।
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white transition cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 30-day Retention Info & Instant Purge Bar */}
        <div className="px-6 py-2.5 bg-amber-50 border-b border-amber-200 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 text-amber-900 font-medium">
            <Clock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
            <span>30 दिन पुराने रिकॉर्ड Firebase और फोन स्टोरेज से अपने आप हट जाते हैं।</span>
          </div>
          {totalDeletedCount > 0 && onEmptyTrash && (
            <button
              type="button"
              onClick={() =>
                setConfirmTarget({
                  kind: 'empty_all',
                  label: `कचरा पेटी के सभी ${totalDeletedCount} रिकॉर्ड`,
                })
              }
              className="px-3 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 active:scale-95 text-white font-bold text-[11px] flex items-center gap-1 shadow-2xs transition cursor-pointer"
            >
              <Trash2 className="w-3 h-3" />
              <span>सभी तुरंत हटाएं ({totalDeletedCount})</span>
            </button>
          )}
        </div>

        {/* Tab Selection */}
        <div className="flex items-center gap-2 px-6 pt-3 border-b border-slate-200 bg-slate-50 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab('entries')}
            className={`px-3.5 py-2.5 text-xs font-bold rounded-t-xl transition border-b-2 flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              activeTab === 'entries'
                ? 'border-indigo-600 text-indigo-700 bg-white shadow-2xs'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Package className="w-3.5 h-3.5" />
            <span>डिलीवरी ({deletedEntries.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('advances')}
            className={`px-3.5 py-2.5 text-xs font-bold rounded-t-xl transition border-b-2 flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              activeTab === 'advances'
                ? 'border-indigo-600 text-indigo-700 bg-white shadow-2xs'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <IndianRupee className="w-3.5 h-3.5" />
            <span>एडवांस ({deletedAdvances.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('riders')}
            className={`px-3.5 py-2.5 text-xs font-bold rounded-t-xl transition border-b-2 flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              activeTab === 'riders'
                ? 'border-indigo-600 text-indigo-700 bg-white shadow-2xs'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <User className="w-3.5 h-3.5" />
            <span>राइडर्स ({deletedRiders.length})</span>
          </button>
        </div>

        {/* Notice Toast Banner */}
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
                    className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 hover:border-slate-300 transition flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-slate-900 text-sm">{e.riderName}</span>
                        <span className="text-xs text-slate-500 font-mono">({formatDateDisplay(e.date)})</span>
                        <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold">
                          {getRemainingDaysLabel(e.deletedAt)}
                        </span>
                      </div>
                      <div className="text-xs text-slate-600 mt-1 flex items-center gap-3 flex-wrap">
                        <span>पैकेट: <strong>{e.parcels}</strong></span>
                        <span>कमाई: <strong>{formatINR(e.totalEarnings)}</strong></span>
                        {e.deletedAt && (
                          <span className="text-[10px] text-slate-400">
                            हटाया गया: {new Date(e.deletedAt).toLocaleDateString('hi-IN')}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleRestoreEntryClick(e.id, e.riderName)}
                        className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold text-xs flex items-center gap-1 shadow-2xs transition cursor-pointer"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>रीस्टोर</span>
                      </button>
                      {onPermanentDeleteEntry && (
                        <button
                          type="button"
                          onClick={() =>
                            setConfirmTarget({
                              kind: 'entry',
                              id: e.id,
                              label: `${e.riderName} (${formatDateDisplay(e.date)} - ${formatINR(e.totalEarnings)})`,
                            })
                          }
                          className="px-2.5 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-600 text-rose-700 hover:text-white border border-rose-200 hover:border-rose-600 active:scale-95 font-bold text-xs flex items-center gap-1 transition cursor-pointer"
                          title="स्थायी रूप से हटाएं (Storage बचाएं)"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>स्थायी हटाएं</span>
                        </button>
                      )}
                    </div>
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
                    className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 hover:border-slate-300 transition flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-slate-900 text-sm">{riderName}</span>
                        <span className="text-xs font-bold text-rose-700 font-mono">
                          {formatINR(adv.amount)}
                        </span>
                        <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold">
                          {getRemainingDaysLabel(adv.deletedAt)}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 mt-0.5">कारण: {adv.reason || 'अग्रिम राशि'}</p>
                      {adv.deletedAt && (
                        <p className="text-[10px] text-slate-400 mt-0.5">
                          हटाया गया: {new Date(adv.deletedAt).toLocaleDateString('hi-IN')}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleRestoreAdvanceClick(riderId, adv.id, adv.amount)}
                        className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold text-xs flex items-center gap-1 shadow-2xs transition cursor-pointer"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>रीस्टोर</span>
                      </button>
                      {onPermanentDeleteAdvance && (
                        <button
                          type="button"
                          onClick={() =>
                            setConfirmTarget({
                              kind: 'advance',
                              riderId,
                              advanceId: adv.id,
                              label: `${riderName} का एडवांस ${formatINR(adv.amount)}`,
                            })
                          }
                          className="px-2.5 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-600 text-rose-700 hover:text-white border border-rose-200 hover:border-rose-600 active:scale-95 font-bold text-xs flex items-center gap-1 transition cursor-pointer"
                          title="स्थायी रूप से हटाएं (Storage बचाएं)"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>स्थायी हटाएं</span>
                        </button>
                      )}
                    </div>
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
                    className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 hover:border-slate-300 transition flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-slate-900 text-sm">{r.name}</span>
                        <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold">
                          {getRemainingDaysLabel(r.deletedAt)}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 font-mono mt-0.5">{r.phone || 'फोन नंबर नहीं'}</p>
                      {r.deletedAt && (
                        <p className="text-[10px] text-slate-400 mt-0.5">
                          हटाया गया: {new Date(r.deletedAt).toLocaleDateString('hi-IN')}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleRestoreRiderClick(r.id, r.name)}
                        className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold text-xs flex items-center gap-1 shadow-2xs transition cursor-pointer"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>पुनः सक्रिय करें</span>
                      </button>
                      {onPermanentDeleteRider && (
                        <button
                          type="button"
                          onClick={() =>
                            setConfirmTarget({
                              kind: 'rider',
                              id: r.id,
                              label: `राइडर "${r.name}" (${r.phone || ''})`,
                            })
                          }
                          className="px-2.5 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-600 text-rose-700 hover:text-white border border-rose-200 hover:border-rose-600 active:scale-95 font-bold text-xs flex items-center gap-1 transition cursor-pointer"
                          title="स्थायी रूप से हटाएं (Storage बचाएं)"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>स्थायी हटाएं</span>
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-2">
          <span className="text-xs text-slate-500 font-medium">
            कचरा पेटी में कुल रिकॉर्ड: <strong>{totalDeletedCount}</strong>
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold text-xs transition cursor-pointer"
          >
            बंद करें
          </button>
        </div>

        {/* In-App Permanent Delete Confirmation Overlay (Zero window.confirm) */}
        {confirmTarget && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-xs">
            <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-2xl border border-rose-200 space-y-4">
              <div className="flex items-start gap-3">
                <div className="p-2.5 rounded-xl bg-rose-100 text-rose-600 shrink-0">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-900 text-sm">
                    स्थायी रूप से हटाने की पुष्टि करें
                  </h4>
                  <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                    क्या आप वाकई <strong>{confirmTarget.label}</strong> को हमेशा के लिए हटाना चाहते हैं?
                  </p>
                  <p className="text-[11px] text-rose-700 font-semibold mt-1.5">
                    यह डेटा फोन और Firebase स्टोरेज दोनों से हमेशा के लिए हट जाएगा और वापस नहीं लाया जा सकेगा।
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  disabled={isDeletingPermanent}
                  onClick={() => setConfirmTarget(null)}
                  className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition cursor-pointer disabled:opacity-50"
                >
                  नहीं, रद्द करें
                </button>
                <button
                  type="button"
                  disabled={isDeletingPermanent}
                  onClick={handleConfirmPermanentDelete}
                  className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs flex items-center gap-1.5 transition cursor-pointer disabled:opacity-60"
                >
                  {isDeletingPermanent ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>हटाया जा रहा है...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>हाँ, हमेशा के लिए हटाएं</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
