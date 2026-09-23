import React, { useState } from 'react';
import { 
  History, 
  X, 
  Receipt, 
  ExternalLink, 
  Copy, 
  Check, 
  Calendar, 
  CreditCard, 
  ShieldCheck,
  Eye,
  DollarSign
} from 'lucide-react';
import { AppUser, PaymentHistoryItem } from '../types';

interface AdminPaymentHistoryModalProps {
  user: AppUser | null;
  isOpen: boolean;
  onClose: () => void;
}

export const AdminPaymentHistoryModal: React.FC<AdminPaymentHistoryModalProps> = ({
  user,
  isOpen,
  onClose,
}) => {
  const [copiedUtr, setCopiedUtr] = useState<string | null>(null);
  const [zoomedSlipUrl, setZoomedSlipUrl] = useState<string | null>(null);

  if (!isOpen || !user) return null;

  const sub = user.subscription;
  const history: PaymentHistoryItem[] = Array.isArray(sub?.paymentHistory) ? sub.paymentHistory : [];
  
  // Sort by date descending (newest first)
  const sortedHistory = [...history].sort((a, b) => {
    return new Date(b.date).getTime() - new Date(a.date).getTime();
  });

  const totalPaid = sortedHistory.reduce((sum, item) => sum + (item.amount || 0), 0);

  const handleCopyUtr = (utr: string) => {
    navigator.clipboard.writeText(utr);
    setCopiedUtr(utr);
    setTimeout(() => setCopiedUtr(null), 2000);
  };

  const formatDate = (isoStr: string) => {
    try {
      const d = new Date(isoStr);
      if (isNaN(d.getTime())) return isoStr;
      return d.toLocaleDateString('hi-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoStr;
    }
  };

  return (
    <>
      <div 
        id="admin-payment-history-modal-backdrop"
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm animate-in fade-in"
        onClick={onClose}
      >
        <div 
          className="bg-slate-900 border border-slate-700/80 rounded-2xl max-w-2xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/70">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                <History className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-base font-bold text-white">Payment & Billing History</h3>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                    sub?.planType === 'free'
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                      : 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                  }`}>
                    {sub?.planType?.toUpperCase() || 'PAID'} PLAN
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  User: <span className="text-slate-200 font-medium">{user.displayName || user.name || 'Tenant'}</span> ({user.email})
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center cursor-pointer transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* User Overview Stats */}
          <div className="grid grid-cols-3 gap-2 p-4 bg-slate-950/40 border-b border-slate-800 text-xs">
            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800/80">
              <span className="text-slate-400 block text-[11px]">Total Paid</span>
              <span className="text-base font-extrabold text-emerald-400 mt-0.5 block">
                ₹{totalPaid.toLocaleString('en-IN')}
              </span>
            </div>
            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800/80">
              <span className="text-slate-400 block text-[11px]">Approved Payments</span>
              <span className="text-base font-extrabold text-white mt-0.5 block">
                {sortedHistory.length}
              </span>
            </div>
            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800/80">
              <span className="text-slate-400 block text-[11px]">Current Validity</span>
              <span className="text-xs font-bold text-amber-300 mt-1 block truncate">
                {sub?.planType === 'free' 
                  ? (sub.freeUntilDate ? `Trial until ${sub.freeUntilDate}` : 'Lifetime Free')
                  : (sub?.validUntil ? new Date(sub.validUntil).toLocaleDateString('hi-IN') : 'Expired')}
              </span>
            </div>
          </div>

          {/* History Records Table / List */}
          <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-3">
            {sortedHistory.length === 0 ? (
              <div className="p-10 text-center space-y-2">
                <Receipt className="w-10 h-10 text-slate-600 mx-auto" />
                <h4 className="text-sm font-semibold text-slate-300">No payment history recorded yet</h4>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  When this user submits a payment slip and an Admin approves it, permanent log entries will appear here.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {sortedHistory.map((item, idx) => (
                  <div 
                    key={item.id || idx}
                    className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 hover:border-slate-700 transition flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs"
                  >
                    {/* Left Details */}
                    <div className="space-y-1.5 flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-emerald-400 font-extrabold text-sm">
                          ₹{item.amount}
                        </span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                          {item.status ? item.status.toUpperCase() : 'APPROVED'}
                        </span>
                        <span className="text-[11px] text-slate-400">
                          {formatDate(item.date)}
                        </span>
                      </div>

                      {/* UTR and Admin */}
                      <div className="flex items-center gap-3 flex-wrap text-slate-300 text-[11px]">
                        {item.utr && (
                          <div className="flex items-center gap-1 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                            <span className="text-slate-400">UTR:</span>
                            <span className="font-mono font-bold text-amber-300 select-all">{item.utr}</span>
                            <button
                              type="button"
                              onClick={() => handleCopyUtr(item.utr)}
                              className="text-slate-400 hover:text-white ml-0.5 cursor-pointer"
                              title="Copy UTR"
                            >
                              {copiedUtr === item.utr ? (
                                <Check className="w-3 h-3 text-emerald-400" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                            </button>
                          </div>
                        )}

                        {item.approvedBy && (
                          <div className="text-slate-400">
                            Approved by: <span className="text-slate-300 font-medium">{item.approvedBy}</span>
                          </div>
                        )}
                      </div>

                      {item.notes && (
                        <div className="text-[11px] text-slate-400 italic">
                          "{item.notes}"
                        </div>
                      )}
                    </div>

                    {/* Right: Slip Image Preview */}
                    {item.slipUrl ? (
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => setZoomedSlipUrl(item.slipUrl)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-blue-300 text-xs border border-slate-800 transition cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>View Slip</span>
                        </button>
                      </div>
                    ) : (
                      <span className="text-[10px] text-slate-600 italic">No slip attached</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-slate-800 bg-slate-950/70 flex items-center justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold cursor-pointer transition"
            >
              Close
            </button>
          </div>
        </div>
      </div>

      {/* Slip Zoom Modal */}
      {zoomedSlipUrl && (
        <div 
          className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md"
          onClick={() => setZoomedSlipUrl(null)}
        >
          <div className="max-w-lg w-full bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden p-4 space-y-3" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-white flex items-center gap-1.5">
                <Receipt className="w-4 h-4 text-emerald-400" />
                <span>Payment Slip Screenshot</span>
              </h4>
              <button
                type="button"
                onClick={() => setZoomedSlipUrl(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="bg-slate-950 rounded-xl p-2 border border-slate-800 max-h-[70vh] overflow-y-auto text-center">
              <img 
                src={zoomedSlipUrl} 
                alt="Payment Slip Full" 
                className="max-w-full rounded-lg mx-auto object-contain"
                referrerPolicy="no-referrer"
              />
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setZoomedSlipUrl(null)}
                className="px-4 py-1.5 rounded-lg bg-slate-800 text-xs text-white"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
