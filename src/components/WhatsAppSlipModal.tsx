import React, { useState, useEffect } from 'react';
import { MessageCircle, Copy, Check, X, Share2, Sparkles, ArrowLeft } from 'lucide-react';
import { WhatsAppSlipData, generateWhatsAppMessage, openWhatsAppSlip } from '../utils/whatsapp';
import { formatINR, formatDateDisplay } from '../utils/formatters';

interface Props {
  data: WhatsAppSlipData;
  onClose: () => void;
}

export const WhatsAppSlipModal: React.FC<Props> = ({ data, onClose }) => {
  const [copied, setCopied] = useState(false);
  const messageText = generateWhatsAppMessage(data);

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

  const handleCopy = () => {
    navigator.clipboard.writeText(messageText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleOpenWhatsApp = () => {
    openWhatsAppSlip(data);
  };

  return (
    <div
      id="whatsapp-slip-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm animate-in fade-in"
      onClick={onClose}
    >
      <div 
        className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-700 p-5 shadow-2xl text-slate-100 max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-3 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              <MessageCircle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm sm:text-base text-white">WhatsApp Payout Slip</h3>
              <p className="text-[11px] text-slate-400">Ready to send directly to rider</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition cursor-pointer"
            title="Close (✕)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Receipt Preview Box styled like WhatsApp bubble */}
        <div className="my-4 p-4 rounded-xl bg-slate-950 border border-emerald-500/30 font-mono text-xs overflow-y-auto max-h-64 whitespace-pre-wrap text-emerald-100 selection:bg-emerald-600 selection:text-white">
          {messageText}
        </div>

        <div className="p-3 rounded-xl bg-slate-800/80 border border-slate-700/80 mb-4 shrink-0 flex items-center justify-between text-xs">
          <div>
            <div className="font-semibold text-slate-200">Recipient WhatsApp</div>
            <div className="text-slate-400 font-mono">+91 {data.phone} ({data.riderName})</div>
          </div>
          <span className="px-2 py-1 bg-emerald-500/20 text-emerald-300 font-bold rounded-lg border border-emerald-500/40 text-[10px]">
            {data.status}
          </span>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-2.5 shrink-0">
          <button
            onClick={handleCopy}
            className="flex-1 py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-750 border border-slate-700 text-xs font-semibold text-slate-200 flex items-center justify-center gap-1.5 transition cursor-pointer"
          >
            {copied ? (
              <>
                <Check className="w-4 h-4 text-emerald-400" />
                <span className="text-emerald-400">Copied to Clipboard!</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                <span>Copy Slip Text</span>
              </>
            )}
          </button>

          <button
            id="open-whatsapp-btn"
            onClick={handleOpenWhatsApp}
            className="flex-1 py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg shadow-emerald-600/25 flex items-center justify-center gap-2 active:scale-95 transition cursor-pointer"
          >
            <MessageCircle className="w-4 h-4" />
            <span>Open in WhatsApp</span>
          </button>
        </div>

        {/* Modal Bottom Footer with Back / Cancel */}
        <div className="mt-3 pt-3 border-t border-slate-800 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2 rounded-xl bg-slate-800/80 hover:bg-slate-750 text-slate-300 hover:text-white text-xs font-semibold transition cursor-pointer"
          >
            Back / Cancel (वापस जाएं)
          </button>
        </div>
      </div>
    </div>
  );
};
