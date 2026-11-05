import React, { useState } from 'react';
import { Lock, KeyRound, Check, X, AlertCircle, ShieldCheck, Eye, EyeOff } from 'lucide-react';

interface ChangeSecurityPinModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentPin: string;
  onSavePin: (newPin: string) => Promise<void> | void;
}

export const ChangeSecurityPinModal: React.FC<ChangeSecurityPinModalProps> = ({
  isOpen,
  onClose,
  currentPin = '8409',
  onSavePin,
}) => {
  const [oldPinInput, setOldPinInput] = useState('');
  const [newPinInput, setNewPinInput] = useState('');
  const [confirmPinInput, setConfirmPinInput] = useState('');
  const [showPins, setShowPins] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const effectiveCurrentPin = (currentPin || '8409').trim();

    if (oldPinInput.trim() !== effectiveCurrentPin) {
      setError('वर्तमान पिन गलत है! कृपया सही पुराना पिन दर्ज करें (डिफ़ॉल्ट: 8409)।');
      return;
    }

    if (!/^\d{4}$/.test(newPinInput.trim())) {
      setError('नया पिन ठीक 4 अंकों का होना चाहिए (केवल संख्याएं 0-9)।');
      return;
    }

    if (newPinInput.trim() !== confirmPinInput.trim()) {
      setError('नया पिन और पुष्टि पिन मेल नहीं खा रहे हैं! कृपया दोनों में एक जैसा 4 अंकों का पिन दर्ज करें।');
      return;
    }

    if (newPinInput.trim() === effectiveCurrentPin) {
      setError('नया पिन वर्तमान पिन से भिन्न होना चाहिए।');
      return;
    }

    setIsSaving(true);
    try {
      await onSavePin(newPinInput.trim());
      setOldPinInput('');
      setNewPinInput('');
      setConfirmPinInput('');
      onClose();
    } catch (err: any) {
      setError(err?.message || 'पिन सहेजने में त्रुटि हुई। कृपया पुनः प्रयास करें।');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
      <div className="relative w-full max-w-md bg-slate-900 border border-slate-750 rounded-3xl shadow-2xl overflow-hidden my-auto text-slate-100">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 bg-gradient-to-br from-slate-900 to-indigo-950 border-b border-slate-800 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center text-xl shrink-0">
              <KeyRound className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white leading-tight">
                मास्टर सुरक्षा पिन बदलें
              </h2>
              <p className="text-xs text-indigo-300 font-medium mt-0.5">
                Change Master Security PIN
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="p-3.5 rounded-2xl bg-indigo-950/40 border border-indigo-800/40 text-xs text-indigo-200 leading-relaxed flex items-start gap-2.5">
            <ShieldCheck className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
            <span>
              यह पिन राइडर खाता रीसेट, डिलीवरी रिकॉर्ड डिलीट, एडवांस हटाने और क्लाउड स्नैपशॉट रीस्टोर करने जैसे संवेदनशील कार्यों की सुरक्षा करता है। (शुरुआती डिफ़ॉल्ट पिन: <strong className="text-white font-mono">8409</strong> है)
            </span>
          </div>

          {/* Toggle PIN Visibility */}
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setShowPins(!showPins)}
              className="text-[11px] text-slate-400 hover:text-slate-200 flex items-center gap-1.5 transition cursor-pointer"
            >
              {showPins ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              <span>{showPins ? 'पिन छिपाएं' : 'पिन देखें (Show PIN)'}</span>
            </button>
          </div>

          {/* Field 1: Old PIN */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
              <span>वर्तमान पिन (Current PIN)</span>
              <span className="text-[11px] text-slate-400 font-normal">डिफ़ॉल्ट: 8409</span>
            </label>
            <input
              type={showPins ? 'text' : 'password'}
              maxLength={4}
              pattern="\d*"
              inputMode="numeric"
              value={oldPinInput}
              onChange={(e) => setOldPinInput(e.target.value.replace(/\D/g, '').slice(0, 4))}
              placeholder="पुराना 4-अंकों का पिन"
              className="w-full px-4 py-2.5 rounded-xl bg-slate-800/90 border border-slate-700 text-white font-mono text-center tracking-widest text-lg focus:outline-none focus:border-indigo-500 transition"
              required
              autoFocus
            />
          </div>

          {/* Field 2: New PIN */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300">
              नया 4-अंकों का पिन (New 4-Digit PIN)
            </label>
            <input
              type={showPins ? 'text' : 'password'}
              maxLength={4}
              pattern="\d*"
              inputMode="numeric"
              value={newPinInput}
              onChange={(e) => setNewPinInput(e.target.value.replace(/\D/g, '').slice(0, 4))}
              placeholder="नया 4-अंकों का पिन"
              className="w-full px-4 py-2.5 rounded-xl bg-slate-800/90 border border-slate-700 text-white font-mono text-center tracking-widest text-lg focus:outline-none focus:border-indigo-500 transition"
              required
            />
          </div>

          {/* Field 3: Confirm PIN */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300">
              नए पिन की पुनः पुष्टि (Confirm New PIN)
            </label>
            <input
              type={showPins ? 'text' : 'password'}
              maxLength={4}
              pattern="\d*"
              inputMode="numeric"
              value={confirmPinInput}
              onChange={(e) => setConfirmPinInput(e.target.value.replace(/\D/g, '').slice(0, 4))}
              placeholder="वही नया पिन दोबारा दर्ज करें"
              className="w-full px-4 py-2.5 rounded-xl bg-slate-800/90 border border-slate-700 text-white font-mono text-center tracking-widest text-lg focus:outline-none focus:border-indigo-500 transition"
              required
            />
          </div>

          {/* Error Message */}
          {error && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2 animate-in fade-in">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="pt-2 flex gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="flex-1 py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 font-semibold text-xs border border-slate-700 transition cursor-pointer"
            >
              रद्द करें (Cancel)
            </button>
            <button
              type="submit"
              disabled={isSaving || newPinInput.length !== 4 || confirmPinInput.length !== 4 || !oldPinInput}
              className="flex-1 py-2.5 px-4 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white font-bold text-xs shadow-lg shadow-indigo-600/30 transition active:scale-95 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
            >
              {isSaving ? (
                <span>सहेज रहे हैं...</span>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  <span>नया पिन सहेजें</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
