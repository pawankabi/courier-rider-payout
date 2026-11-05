import React, { useState } from 'react';
import { ShieldCheck, Lock, X, AlertCircle } from 'lucide-react';

interface SecurityPinModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  title?: string;
  description?: string;
  configuredPin?: string;
}

export const SecurityPinModal: React.FC<SecurityPinModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  title = 'मास्टर सुरक्षा पिन सत्यापन (Master PIN Verification)',
  description = 'इस संवेदनशील वित्तीय कार्य को जारी रखने के लिए अपना 4-अंकों का मास्टर सुरक्षा पिन दर्ज करें।',
  configuredPin = '8409',
}) => {
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const targetPin = (configuredPin || '8409').trim();
    if (pin.trim() === targetPin) {
      setError(null);
      setPin('');
      onSuccess();
    } else {
      setError('अमान्य सुरक्षा पिन! कृपया सही 4-अंकों का मास्टर पिन दर्ज करें।');
    }
  };

  const handleQuickDigit = (digit: string) => {
    if (pin.length < 4) {
      const next = pin + digit;
      setPin(next);
      setError(null);
      const targetPin = (configuredPin || '8409').trim();
      if (next.length === 4) {
        if (next === targetPin) {
          setError(null);
          setPin('');
          onSuccess();
        } else {
          setError('अमान्य सुरक्षा पिन! कृपया सही पिन दर्ज करें।');
        }
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs animate-in fade-in">
      <div className="relative w-full max-w-sm bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 bg-gradient-to-br from-slate-900 to-indigo-950 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-500/20 text-indigo-300 border border-indigo-400/30">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold leading-snug">{title}</h3>
              <p className="text-[11px] text-indigo-200/80 font-medium mt-0.5">वित्तीय डाटा सुरक्षा</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          <p className="text-xs text-slate-600 leading-relaxed mb-4 font-medium">{description}</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* PIN Dots */}
            <div className="flex justify-center items-center gap-3 py-2">
              {[0, 1, 2, 3].map((idx) => (
                <div
                  key={idx}
                  className={`w-4 h-4 rounded-full border-2 transition-all ${
                    pin.length > idx
                      ? 'bg-indigo-600 border-indigo-600 scale-110'
                      : 'border-slate-300 bg-slate-100'
                  }`}
                />
              ))}
            </div>

            {error && (
              <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                <span>{error}</span>
              </div>
            )}

            {/* Keypad */}
            <div className="grid grid-cols-3 gap-2.5 pt-2">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((num) => (
                <button
                  key={num}
                  type="button"
                  onClick={() => handleQuickDigit(num)}
                  className="py-3 rounded-2xl bg-slate-50 hover:bg-slate-100 active:scale-95 text-slate-800 font-bold text-lg border border-slate-200 transition cursor-pointer"
                >
                  {num}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setPin('')}
                className="py-3 rounded-2xl bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-600 font-bold text-xs border border-slate-200 transition cursor-pointer"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() => handleQuickDigit('0')}
                className="py-3 rounded-2xl bg-slate-50 hover:bg-slate-100 active:scale-95 text-slate-800 font-bold text-lg border border-slate-200 transition cursor-pointer"
              >
                0
              </button>
              <button
                type="button"
                onClick={() => setPin((prev) => prev.slice(0, -1))}
                className="py-3 rounded-2xl bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-600 font-bold text-xs border border-slate-200 transition cursor-pointer"
              >
                ⌫
              </button>
            </div>

            <div className="pt-2 text-center">
              <span className="text-[11px] text-slate-400 font-mono">
                डिफ़ॉल्ट मास्टर पिन: <strong className="text-slate-600">{configuredPin || '8409'}</strong>
              </span>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
