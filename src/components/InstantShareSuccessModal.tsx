import React, { useEffect, useState } from 'react';
import { MessageCircle, Send, X, Check, Copy, ExternalLink, Sparkles } from 'lucide-react';
import { formatINR } from '../utils/formatters';
import { getRiderStatementUrl } from '../utils/shareLink';

interface InstantShareSuccessModalProps {
  isOpen: boolean;
  onClose: () => void;
  riderName: string;
  riderPhone: string;
  riderId: string;
  title?: string;
  subtitle?: string;
  amount?: number;
  entryType?: 'payout' | 'advance';
  customMessage?: string;
}

export const InstantShareSuccessModal: React.FC<InstantShareSuccessModalProps> = ({
  isOpen,
  onClose,
  riderName,
  riderPhone,
  riderId,
  title = 'सफलतापूर्वक सुरक्षित किया गया!',
  subtitle,
  amount,
  entryType = 'payout',
  customMessage,
}) => {
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedText, setCopiedText] = useState(false);

  if (!isOpen) return null;

  const statementUrl = getRiderStatementUrl(riderId);
  const message = customMessage || `नमस्ते ${riderName}, आपका पे-आउट/एडवांस अपडेट कर दिया गया है। कुल बकाया/हिसाब देखने के लिए खाता लेजर लिंक पर क्लिक करें: ${statementUrl}`;
  const cleanPhone = (riderPhone || '').trim().replace(/\D/g, '').slice(-10);

  const smsUrl = `sms:${cleanPhone}?body=${encodeURIComponent(message)}`;
  const waUrl = `https://wa.me/91${cleanPhone}?text=${encodeURIComponent(message)}`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(statementUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleCopyMessage = () => {
    navigator.clipboard.writeText(message);
    setCopiedText(true);
    setTimeout(() => setCopiedText(false), 2000);
  };

  return (
    <div 
      className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-in fade-in"
      onClick={onClose}
    >
      <div 
        className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden my-auto flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 bg-slate-950/70 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center font-bold text-lg shrink-0">
              <Sparkles className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-1.5">
                <span>{title}</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                {subtitle || `राइडर: ${riderName} • +91 ${cleanPhone}`}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition cursor-pointer"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-5 space-y-4">
          {typeof amount === 'number' && amount > 0 && (
            <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 flex items-center justify-between">
              <span className="text-xs text-slate-400 font-medium">
                {entryType === 'advance' ? 'दर्ज एडवांस राशि:' : 'दर्ज पे-आउट राशि:'}
              </span>
              <span className="text-lg font-black text-emerald-400 font-mono">
                ₹{formatINR(amount)}
              </span>
            </div>
          )}

          {/* Message Preview */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>भेजा जाने वाला संदेश (Message Preview):</span>
              <button
                type="button"
                onClick={handleCopyMessage}
                className="text-blue-400 hover:text-blue-300 font-medium flex items-center gap-1 cursor-pointer"
              >
                {copiedText ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedText ? 'Copied' : 'Copy Text'}</span>
              </button>
            </div>
            <div className="p-3 rounded-xl bg-slate-950/90 border border-slate-800 text-xs text-slate-200 leading-relaxed font-sans select-all">
              {message}
            </div>
          </div>

          {/* TWO BIG 1-TAP DISPATCH BUTTONS */}
          <div className="space-y-2.5 pt-1">
            <a
              href={smsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-sm shadow-lg shadow-blue-900/40 flex items-center justify-center gap-2.5 transition active:scale-[0.98] cursor-pointer"
            >
              <Send className="w-4 h-4" />
              <span>📲 Send SMS Now</span>
            </a>

            <a
              href={waUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full py-3 px-4 rounded-xl bg-[#25D366] hover:bg-[#20bd5a] text-slate-950 font-bold text-sm shadow-lg shadow-emerald-950/40 flex items-center justify-center gap-2.5 transition active:scale-[0.98] cursor-pointer"
            >
              <MessageCircle className="w-4 h-4 fill-slate-950" />
              <span>💬 Send WhatsApp</span>
            </a>
          </div>

          {/* Footer secondary links */}
          <div className="flex items-center justify-between pt-2 border-t border-slate-800/80 text-xs">
            <button
              type="button"
              onClick={handleCopyLink}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white transition cursor-pointer"
            >
              {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedLink ? 'Link Copied!' : 'Copy Statement Link'}</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold transition cursor-pointer"
            >
              Close (✕)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
