import React, { useEffect, useState } from 'react';
import { 
  CheckCircle2, 
  Sparkles, 
  Copy, 
  Check, 
  Calendar, 
  ShieldCheck, 
  Zap, 
  ArrowRight,
  Receipt
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { RazorpayPlan } from '../services/razorpayCheckout';
import { formatINR } from '../utils/formatters';

interface RazorpaySuccessModalProps {
  isOpen: boolean;
  onClose: () => void;
  plan: RazorpayPlan | null;
  paymentId: string;
  validUntil?: string;
}

export const RazorpaySuccessModal: React.FC<RazorpaySuccessModalProps> = ({
  isOpen,
  onClose,
  plan,
  paymentId,
  validUntil,
}) => {
  const [copied, setCopied] = useState(false);
  const [countdown, setCountdown] = useState(2);

  // Auto-redirect to dashboard after 2 seconds
  useEffect(() => {
    if (!isOpen) return;
    setCountdown(2);

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          onClose();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (isOpen) {
      try {
        confetti({
          particleCount: 100,
          spread: 70,
          origin: { y: 0.6 },
        });
        setTimeout(() => {
          confetti({
            particleCount: 50,
            angle: 60,
            spread: 55,
            origin: { x: 0 },
          });
          confetti({
            particleCount: 50,
            angle: 120,
            spread: 55,
            origin: { x: 1 },
          });
        }, 250);
      } catch (e) {
        console.warn('Confetti error', e);
      }
    }
  }, [isOpen]);

  if (!isOpen || !plan) return null;

  const handleCopyPaymentId = () => {
    navigator.clipboard.writeText(paymentId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formattedDate = validUntil
    ? new Date(validUntil).toLocaleDateString('hi-IN', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : 'सक्रिय (Active)';

  return (
    <div 
      className="fixed inset-0 z-[200] flex items-center justify-center p-3 sm:p-4 bg-slate-950/90 backdrop-blur-md animate-in fade-in"
      onClick={onClose}
    >
      <div 
        className="bg-slate-900 border-2 border-emerald-500/80 rounded-3xl max-w-lg w-full shadow-2xl shadow-emerald-950/50 overflow-hidden relative animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Glow & Header */}
        <div className="bg-gradient-to-b from-emerald-950/80 via-slate-900 to-slate-900 p-6 text-center space-y-3 border-b border-slate-800">
          <div className="w-16 h-16 rounded-2xl bg-emerald-500/20 border-2 border-emerald-400 flex items-center justify-center mx-auto text-emerald-400 shadow-xl shadow-emerald-500/20 animate-bounce">
            <CheckCircle2 className="w-9 h-9" />
          </div>

          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-black uppercase tracking-wider">
            <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
            <span>Razorpay Live Verified Payment</span>
          </div>

          <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
            भुगतान सफल! खाता सक्रिय हुआ
          </h2>
          <p className="text-xs text-slate-300">
            आपकी सदस्यता Razorpay द्वारा तुरंत स्वीकृत कर दी गई है।
          </p>
        </div>

        {/* Plan & Transaction Summary Box */}
        <div className="p-6 space-y-4">
          <div className="p-4 rounded-2xl bg-slate-950/90 border border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400 font-medium">चयनित प्लान (Selected Plan):</span>
              <span className="text-sm font-black text-white bg-blue-500/20 text-blue-300 px-2.5 py-0.5 rounded-full border border-blue-500/30">
                {plan.displayName} ({plan.durationLabel})
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400 font-medium">भुगतान राशि (Amount Paid):</span>
              <span className="text-base font-black text-emerald-400">
                {formatINR(plan.price)} (Live Cleared)
              </span>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-800/80">
              <span className="text-xs text-slate-400 font-medium flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-amber-400" />
                <span>अनलॉक वैधता (Valid Until):</span>
              </span>
              <span className="text-xs font-bold text-amber-300 font-mono">
                {formattedDate}
              </span>
            </div>

            {/* Payment ID Pill */}
            <div className="pt-2 border-t border-slate-800/80">
              <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider block mb-1">
                Razorpay Payment ID:
              </span>
              <div className="flex items-center justify-between bg-slate-900 px-3 py-1.5 rounded-xl border border-slate-700">
                <code className="text-xs font-mono font-bold text-blue-300 select-all truncate">
                  {paymentId}
                </code>
                <button
                  type="button"
                  onClick={handleCopyPaymentId}
                  className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-bold flex items-center gap-1 transition cursor-pointer shrink-0"
                >
                  {copied ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-400" />
                      <span className="text-emerald-400">कॉपी हुआ!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      <span>Copy</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Unlocked Capabilities */}
          <div className="space-y-1.5 text-xs text-slate-300">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
              सक्रिय प्रो सुविधाएं (Activated Features):
            </span>
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div className="flex items-center gap-1.5 p-2 rounded-xl bg-slate-850 border border-slate-800 text-slate-200">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>अनलिमिटेड राइडर फ्लीट</span>
              </div>
              <div className="flex items-center gap-1.5 p-2 rounded-xl bg-slate-850 border border-slate-800 text-slate-200">
                <Zap className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span>क्लाउड डेटा ऑटो बैकअप</span>
              </div>
              <div className="flex items-center gap-1.5 p-2 rounded-xl bg-slate-850 border border-slate-800 text-slate-200">
                <Receipt className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                <span>SIM SMS भुगतान रसीदें</span>
              </div>
              <div className="flex items-center gap-1.5 p-2 rounded-xl bg-slate-850 border border-slate-800 text-slate-200">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>15-दिवसीय लेजर व PDF</span>
              </div>
            </div>
          </div>

          {/* Continue to Dashboard Button */}
          <button
            type="button"
            onClick={onClose}
            className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-emerald-600 via-teal-600 to-blue-600 hover:from-emerald-500 hover:to-blue-500 text-white font-extrabold text-sm shadow-xl shadow-emerald-950/50 flex items-center justify-center gap-2 transition active:scale-[0.98] cursor-pointer mt-2"
          >
            <span>डैशबोर्ड शुरू करें ({countdown > 0 ? `${countdown}s में ऑटो-रीडायरेक्ट` : 'खुल रहा है...'})</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
