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
  getRiderGithubReleaseUrl,
  getAdminGithubReleaseUrl,
  copyAppShareLink,
  downloadRiderApk,
  downloadAdminApk,
  PRODUCTION_DOMAIN,
  ADMIN_VERCEL_DOWNLOAD_URL
} from '../utils/shareLink';
import { 
  fetchLatestReleaseVersion, 
  getCachedReleaseVersion, 
  APP_VERSION 
} from '../utils/version';

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
  const [copiedType, setCopiedType] = useState<'rider' | 'admin' | 'rider_apk' | 'admin_apk' | 'admin_vercel_apk' | null>(null);
  const [releaseVersion, setReleaseVersion] = useState<string>(() => getCachedReleaseVersion());

  React.useEffect(() => {
    fetchLatestReleaseVersion().then((ver) => {
      if (ver) setReleaseVersion(ver);
    }).catch(() => {});
  }, []);

  if (!isOpen) return null;

  const currentBaseUrl = PRODUCTION_DOMAIN || getBaseUrl();
  const riderUrl = getRiderAppUrl();
  const riderApkUrl = getRiderApkDownloadUrl();
  const adminApkUrl = getAdminApkDownloadUrl();
  const riderGithubUrl = getRiderGithubReleaseUrl();
  const adminGithubUrl = getAdminGithubReleaseUrl();

  const handleCopy = async (type: 'rider' | 'admin' | 'rider_apk' | 'admin_apk' | 'admin_vercel_apk') => {
    let targetUrl = currentBaseUrl;
    let label = '📋 एडमिन Vercel वेब पोर्टल लिंक कॉपी हो गया!';

    if (type === 'rider') {
      targetUrl = riderUrl;
      label = '📋 साथी ऐप (Rider Entry) लिंक कॉपी हो गया!';
    } else if (type === 'rider_apk') {
      targetUrl = riderApkUrl;
      label = '📋 राइडर ऐप APK (COD Entry Rider) डाउनलोड लिंक कॉपी हो गया!';
    } else if (type === 'admin_apk') {
      targetUrl = adminGithubUrl;
      label = '📋 एडमिन ऐप GitHub APK डाउनलोड लिंक कॉपी हो गया!';
    } else if (type === 'admin_vercel_apk') {
      targetUrl = ADMIN_VERCEL_DOWNLOAD_URL;
      label = '📋 एडमिन ऐप Vercel 1-क्लिक APK डाउनलोड लिंक कॉपी हो गया!';
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

          {/* Card 2: Main Admin App Link (Vercel Production) */}
          <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700/80 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center">
                  <Globe className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs sm:text-sm font-bold text-white flex items-center gap-1.5">
                    <span>💻 मुख्य वेब ऐप (Vercel Permanent Link)</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold">
                      24/7 Live
                    </span>
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    मास्टर एडमिन और हब मैनेजर हेतु हमेशा चालू रहने वाला वेब पोर्टल।
                  </p>
                </div>
              </div>
            </div>

            <div className="p-2.5 rounded-lg bg-slate-950/90 border border-slate-800 font-mono text-xs text-indigo-300 break-all select-all flex items-center justify-between gap-2">
              <span className="truncate">{PRODUCTION_DOMAIN}</span>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => handleCopy('admin')}
                className="flex-1 py-2 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition flex items-center justify-center gap-1.5 border border-indigo-500/40 cursor-pointer"
              >
                {copiedType === 'admin' ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-400" />
                    <span>कॉपी हो गया!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    <span>कॉपी Vercel वेब लिंक</span>
                  </>
                )}
              </button>

              <a
                href={PRODUCTION_DOMAIN}
                target="_blank"
                rel="noopener noreferrer"
                className="py-2 px-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition flex items-center justify-center gap-1.5 border border-slate-700"
                title="Vercel पोर्टल खोलें"
              >
                <ExternalLink className="w-4 h-4" />
                <span className="hidden sm:inline">खोलें</span>
              </a>
            </div>
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
                    <span>📲 राइडर ऐप (COD Entry हिसाब किताब)</span>
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
              <span className="text-[10px] text-slate-300 bg-slate-900 px-2 py-0.5 rounded border border-slate-800 shrink-0 font-medium">
                v{releaseVersion} Rider
              </span>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <a
                href={riderApkUrl}
                target="_blank"
                rel="noopener noreferrer"
                download="COD-Entry-Rider-Release.apk"
                onClick={(e) => {
                  e.preventDefault();
                  downloadRiderApk();
                }}
                className="flex-1 py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition flex items-center justify-center gap-1.5 shadow cursor-pointer text-center"
              >
                <Download className="w-4 h-4" />
                <span>डाउनलोड राइडर ऐप (COD Entry हिसाब किताब)</span>
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

            <div className="flex items-center justify-between text-[11px] text-slate-400 pt-0.5 px-1">
              <span>Direct GitHub Asset:</span>
              <a
                href={riderGithubUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => {
                  e.preventDefault();
                  downloadRiderApk();
                }}
                className="text-emerald-400 hover:text-emerald-300 font-mono text-[10px] underline flex items-center gap-1 cursor-pointer"
                title="Direct GitHub Releases Download"
              >
                <span>COD-Entry-Rider-Release.apk</span>
                <ExternalLink className="w-3 h-3" />
              </a>
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

            <div className="p-3 rounded-lg bg-slate-950/90 border border-slate-800 space-y-2.5">
              <div className="flex items-center justify-between text-xs text-indigo-300 font-mono">
                <span className="font-semibold text-white">Admin-Payout-Release.apk</span>
                <span className="text-[10px] text-indigo-300 bg-indigo-950/80 px-2 py-0.5 rounded border border-indigo-800 shrink-0 font-medium">
                  v{releaseVersion} (Latest)
                </span>
              </div>

              {/* Vercel 1-Click Link */}
              <div className="p-2 rounded-lg bg-slate-900 border border-slate-800 space-y-1">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-emerald-400 font-semibold flex items-center gap-1">
                    <span>🌐 1. Vercel डायरेक्ट डाउनलोड लिंक:</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopy('admin_vercel_apk')}
                    className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-1 font-mono cursor-pointer"
                  >
                    {copiedType === 'admin_vercel_apk' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedType === 'admin_vercel_apk' ? 'कॉपी हुआ!' : 'कॉपी'}</span>
                  </button>
                </div>
                <div className="font-mono text-[11px] text-emerald-300 break-all select-all">
                  {ADMIN_VERCEL_DOWNLOAD_URL}
                </div>
              </div>

              {/* GitHub 1-Click Link */}
              <div className="p-2 rounded-lg bg-slate-900 border border-slate-800 space-y-1">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-indigo-400 font-semibold flex items-center gap-1">
                    <span>🐙 2. GitHub डायरेक्ट डाउनलोड लिंक:</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopy('admin_apk')}
                    className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 font-mono cursor-pointer"
                  >
                    {copiedType === 'admin_apk' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedType === 'admin_apk' ? 'कॉपी हुआ!' : 'कॉपी'}</span>
                  </button>
                </div>
                <div className="font-mono text-[11px] text-slate-300 break-all select-all">
                  {adminGithubUrl}
                </div>
              </div>

              <p className="text-[10px] text-emerald-400 font-medium">
                ⚡ 1-क्लिक डायरेक्ट APK डाउनलोड (बिना कोई पेज खुले सीधे डाउनलोड होगा, भविष्य में नया वर्जन आने पर भी यही लिंक काम करेगा)
              </p>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <a
                href={ADMIN_VERCEL_DOWNLOAD_URL}
                target="_blank"
                rel="noopener noreferrer"
                download="Admin-Payout-Release.apk"
                className="flex-1 py-2.5 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition flex items-center justify-center gap-1.5 shadow cursor-pointer text-center"
              >
                <Download className="w-4 h-4" />
                <span>1-क्लिक डाउनलोड APK (Admin App)</span>
              </a>

              <button
                type="button"
                onClick={() => handleCopy('admin_vercel_apk')}
                className="py-2.5 px-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition flex items-center justify-center gap-1.5 border border-slate-700 cursor-pointer shrink-0"
                title="Vercel डायरेक्ट APK डाउनलोड लिंक कॉपी करें"
              >
                {copiedType === 'admin_vercel_apk' ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-400" />
                    <span className="hidden sm:inline text-emerald-400">कॉपी हुआ!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4 text-emerald-400" />
                    <span className="hidden sm:inline">कॉपी Vercel लिंक</span>
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
