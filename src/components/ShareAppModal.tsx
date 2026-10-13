import React, { useState } from 'react';
import { 
  X, 
  Share2, 
  Check, 
  Copy, 
  ExternalLink, 
  Bike, 
  Globe, 
  Sparkles,
  Smartphone,
  Download
} from 'lucide-react';
import { 
  getBaseUrl, 
  getRiderAppUrl, 
  getRiderApkDownloadUrl,
  getAdminApkDownloadUrl,
  copyAppShareLink
} from '../utils/shareLink';

interface ShareAppModalProps {
  isOpen: boolean;
  onClose: () => void;
  onToast?: (message: string, type?: 'success' | 'info' | 'error') => void;
}

export const ShareAppModal: React.FC<ShareAppModalProps> = ({
  isOpen,
  onClose,
  onToast
}) => {
  const [copiedType, setCopiedType] = useState<'rider' | 'admin' | 'rider_apk' | 'admin_apk' | null>(null);

  if (!isOpen) return null;

  const currentBaseUrl = getBaseUrl();
  const riderUrl = getRiderAppUrl();
  const riderApkUrl = getRiderApkDownloadUrl();
  const adminApkUrl = getAdminApkDownloadUrl();

  const handleCopy = async (type: 'rider' | 'admin' | 'rider_apk' | 'admin_apk') => {
    let targetUrl = currentBaseUrl;
    let label = '📋 एडमिन पोर्टल लिंक कॉपी हो गया!';

    if (type === 'rider') {
      targetUrl = riderUrl;
      label = '📋 साथी ऐप (Rider Entry) लिंक कॉपी हो गया!';
    } else if (type === 'rider_apk') {
      targetUrl = riderApkUrl;
      label = '📋 राइडर ऐप APK (COD Entry Rider) डाउनलोड लिंक कॉपी हो गया!';
    } else if (type === 'admin_apk') {
      targetUrl = adminApkUrl;
      label = '📋 एडमिन ऐप APK डाउनलोड लिंक कॉपी हो गया!';
    }

    const success = await copyAppShareLink(targetUrl);
    if (success) {
      setCopiedType(type);
      if (onToast) {
        onToast(label, 'success');
      }
      setTimeout(() => setCopiedType(null), 2500);
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-in fade-in"
      onClick={onClose}
    >
      <div 
        className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden my-auto flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-800 bg-slate-850">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center shadow-md">
              <Share2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-white">
                शेयर ऐप लिंक (Share App Links)
              </h2>
              <p className="text-xs text-slate-400">
                राइडर्स और टीम के लिए डायनामिक वेब लिंक
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-5 space-y-4 overflow-y-auto">
          {/* Card 1: Rider Companion Portal Link */}
          <div className="p-4 rounded-xl bg-emerald-950/40 border border-emerald-500/40 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-emerald-600 text-white flex items-center justify-center">
                  <Bike className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs sm:text-sm font-bold text-white flex items-center gap-1.5">
                    <span>📲 साथी ऐप लिंक (Rider Entry Portal)</span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                      Riders / Staff
                    </span>
                  </h3>
                  <p className="text-[11px] text-slate-300">
                    राइडर्स सिर्फ इस लिंक से लॉगिन करके अपनी दैनिक COD प्रविष्टि कर सकते हैं।
                  </p>
                </div>
              </div>
            </div>

            <div className="p-2.5 rounded-lg bg-slate-950/90 border border-slate-800 font-mono text-xs text-emerald-300 break-all select-all flex items-center justify-between gap-2">
              <span className="truncate">{riderUrl}</span>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => handleCopy('rider')}
                className="flex-1 py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition flex items-center justify-center gap-1.5 shadow"
              >
                {copiedType === 'rider' ? (
                  <>
                    <Check className="w-4 h-4" />
                    <span>कॉपी हो गया!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    <span>कॉपी राइडर लिंक (WhatsApp)</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  try {
                    window.open(riderUrl, '_blank');
                  } catch {
                    window.location.hash = '/cod-entry';
                  }
                }}
                className="py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition flex items-center justify-center gap-1.5 border border-slate-700"
                title="पोर्टल खोलें"
              >
                <ExternalLink className="w-4 h-4" />
                <span className="hidden sm:inline">खोलें</span>
              </button>
            </div>
          </div>

          {/* Card 2: Main Admin App Link */}
          <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700/80 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center">
                  <Globe className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs sm:text-sm font-bold text-white">
                    💻 एडमिन डैशबोर्ड लिंक (Main Hub App)
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    मास्टर एडमिन और हब मैनेजर हेतु संपूर्ण प्रबंधन पोर्टल।
                  </p>
                </div>
              </div>
            </div>

            <div className="p-2.5 rounded-lg bg-slate-950/90 border border-slate-800 font-mono text-xs text-indigo-300 break-all select-all">
              <span className="truncate">{currentBaseUrl}</span>
            </div>

            <button
              type="button"
              onClick={() => handleCopy('admin')}
              className="w-full py-2 px-3 rounded-xl bg-slate-750 hover:bg-slate-700 text-white text-xs font-bold transition flex items-center justify-center gap-1.5 border border-slate-650"
            >
              {copiedType === 'admin' ? (
                <>
                  <Check className="w-4 h-4 text-indigo-400" />
                  <span>कॉपी हो गया!</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4 text-indigo-400" />
                  <span>कॉपी एडमिन लिंक</span>
                </>
              )}
            </button>
          </div>

          {/* Card 3: Dedicated Rider App APK Download (Strict Flavor Build) */}
          <div className="p-4 rounded-xl bg-emerald-950/30 border border-emerald-500/50 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-emerald-600 text-white flex items-center justify-center shadow-xs">
                  <Smartphone className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs sm:text-sm font-bold text-white flex items-center gap-1.5">
                    <span>📲 राइडर ऐप APK (COD Entry Rider Build)</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold">
                      Rider Only
                    </span>
                  </h3>
                  <p className="text-[11px] text-slate-300">
                    राइडर्स के लिए समर्पित Android APK — सीधा फ़ोन नंबर व PIN लॉगिन, नो एडमिन झंझट।
                  </p>
                </div>
              </div>
            </div>

            <div className="p-2.5 rounded-lg bg-slate-950/90 border border-slate-800 font-mono text-xs text-emerald-300 flex items-center justify-between gap-2">
              <span className="truncate">COD-Entry-Rider-Release.apk</span>
              <span className="text-[10px] text-slate-400 bg-slate-900 px-2 py-0.5 rounded border border-slate-800 shrink-0">
                v1.0.5 Rider
              </span>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <a
                href={riderApkUrl}
                download="COD-Entry-Rider-Release.apk"
                className="flex-1 py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition flex items-center justify-center gap-1.5 shadow cursor-pointer text-center"
              >
                <Download className="w-4 h-4" />
                <span>डाउनलोड राइडर APK</span>
              </a>

              <button
                type="button"
                onClick={() => handleCopy('rider_apk')}
                className="py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition flex items-center justify-center gap-1.5 border border-slate-700 cursor-pointer"
                title="APK डाउनलोड लिंक कॉपी करें"
              >
                {copiedType === 'rider_apk' ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-400" />
                    <span className="hidden sm:inline">कॉपी हुआ!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    <span className="hidden sm:inline">कॉपी लिंक</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Card 4: Dedicated Admin App APK Download */}
          <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-700/60 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center shadow-xs">
                  <Smartphone className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs sm:text-sm font-bold text-white flex items-center gap-1.5">
                    <span>💻 एडमिन ऐप APK (Admin Control Panel)</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 font-bold">
                      Admin Only
                    </span>
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    हब मैनेजर हेतु संपूर्ण पेआउट व मैनेजमेंट APK।
                  </p>
                </div>
              </div>
            </div>

            <div className="p-2.5 rounded-lg bg-slate-950/90 border border-slate-800 font-mono text-xs text-indigo-300 flex items-center justify-between gap-2">
              <span className="truncate">Admin-Payout-Release.apk</span>
              <span className="text-[10px] text-slate-400 bg-slate-900 px-2 py-0.5 rounded border border-slate-800 shrink-0">
                v1.0.5 Admin
              </span>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <a
                href={adminApkUrl}
                download="Admin-Payout-Release.apk"
                className="flex-1 py-2 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition flex items-center justify-center gap-1.5 shadow cursor-pointer text-center"
              >
                <Download className="w-4 h-4" />
                <span>डाउनलोड एडमिन APK</span>
              </a>

              <button
                type="button"
                onClick={() => handleCopy('admin_apk')}
                className="py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition flex items-center justify-center gap-1.5 border border-slate-700 cursor-pointer"
                title="एडमिन APK लिंक कॉपी करें"
              >
                {copiedType === 'admin_apk' ? (
                  <>
                    <Check className="w-4 h-4 text-indigo-400" />
                    <span className="hidden sm:inline">कॉपी हुआ!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    <span className="hidden sm:inline">कॉपी लिंक</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-slate-800 bg-slate-900/60 flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition"
          >
            बंद करें
          </button>
        </div>
      </div>
    </div>
  );
};
