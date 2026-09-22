import React, { useState } from 'react';
import { 
  Download, 
  Smartphone, 
  X, 
  CheckCircle2, 
  WifiOff, 
  Share, 
  ExternalLink, 
  Copy, 
  Check, 
  Monitor, 
  HelpCircle,
  Sparkles
} from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface Props {
  variant?: 'banner' | 'button';
}

export const PWAInstallBanner: React.FC<Props> = ({ variant = 'banner' }) => {
  const { isInstallable, isInstalled, isIOS, isOnline, isInIframe, install } = usePWAInstall();
  const [showInstallGuide, setShowInstallGuide] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  const [installSuccess, setInstallSuccess] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [activePlatformTab, setActivePlatformTab] = useState<'android' | 'ios' | 'desktop'>(
    isIOS ? 'ios' : 'android'
  );

  const handleInstallClick = async () => {
    if (isInstallable && !isInIframe) {
      const success = await install();
      if (success) {
        setInstallSuccess(true);
        setTimeout(() => setInstallSuccess(false), 3000);
        return;
      }
    }
    // Otherwise open the interactive installation modal with instructions and new-tab launcher
    setShowInstallGuide(true);
  };

  const handleOpenInNewTab = () => {
    window.open(window.location.href, '_blank', 'noopener,noreferrer');
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  // Header Button Variant
  if (variant === 'button') {
    if (isInstalled) {
      return (
        <span
          id="pwa-installed-badge"
          className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-emerald-300 bg-emerald-950/80 border border-emerald-500/30 rounded-full"
          title="App installed on this device"
        >
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Installed</span>
        </span>
      );
    }

    return (
      <>
        <button
          id="pwa-header-install-btn"
          onClick={handleInstallClick}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 rounded-lg shadow-sm active:scale-95 transition"
        >
          <Download className="w-3.5 h-3.5 animate-bounce" />
          <span>Install App</span>
        </button>

        {showInstallGuide && renderModal()}
      </>
    );
  }

  // Offline banner alert if connectivity lost
  if (!isOnline) {
    return (
      <div
        id="pwa-offline-alert"
        className="bg-amber-500/15 border-b border-amber-500/30 text-amber-200 px-4 py-2 text-xs flex items-center justify-between"
      >
        <div className="flex items-center gap-2">
          <WifiOff className="w-4 h-4 text-amber-400 shrink-0" />
          <span>Offline Mode — All deliveries & riders are securely saved in local storage.</span>
        </div>
      </div>
    );
  }

  // If installed or user dismissed banner, do not show top banner (header button remains)
  if (isInstalled || isDismissed) {
    return showInstallGuide ? renderModal() : null;
  }

  function renderModal() {
    return (
      <div
        id="pwa-installation-guide-modal"
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm animate-in fade-in"
      >
        <div className="w-full max-w-lg rounded-2xl bg-slate-900 border border-slate-700 p-5 sm:p-6 text-slate-100 shadow-2xl max-h-[90vh] overflow-y-auto">
          {/* Header */}
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-600/20 text-blue-400 border border-blue-500/30 flex items-center justify-center">
                <Download className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-base text-white">Install Courier Payout App</h3>
                <p className="text-xs text-slate-400">Install to your phone home screen or computer</p>
              </div>
            </div>
            <button
              onClick={() => setShowInstallGuide(false)}
              className="text-slate-400 hover:text-white p-1 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Iframe Notice & Direct Launch Action */}
          {isInIframe && (
            <div className="mt-4 p-3.5 rounded-xl bg-blue-950/60 border border-blue-500/30 space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-blue-300">
                <Sparkles className="w-4 h-4 text-blue-400 shrink-0" />
                <span>Running in Preview Mode</span>
              </div>
              <p className="text-[11px] text-slate-300 leading-relaxed">
                Browsers require PWAs to open in a direct tab (not inside an embedded preview) for the 1-tap install prompt.
              </p>
              <div className="flex flex-col sm:flex-row gap-2 pt-1">
                <button
                  onClick={handleOpenInNewTab}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg shadow transition"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Open in Full Screen Tab</span>
                </button>
                <button
                  onClick={handleCopyLink}
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 text-xs font-semibold rounded-lg transition"
                >
                  {copiedLink ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-emerald-400">Link Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy App Link</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Device Tabs */}
          <div className="mt-4">
            <div className="flex rounded-xl bg-slate-800 p-1 border border-slate-700 text-xs font-semibold">
              <button
                onClick={() => setActivePlatformTab('android')}
                className={`flex-1 py-1.5 rounded-lg flex items-center justify-center gap-1.5 transition ${
                  activePlatformTab === 'android'
                    ? 'bg-blue-600 text-white shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Smartphone className="w-3.5 h-3.5" />
                <span>Android (Chrome)</span>
              </button>
              <button
                onClick={() => setActivePlatformTab('ios')}
                className={`flex-1 py-1.5 rounded-lg flex items-center justify-center gap-1.5 transition ${
                  activePlatformTab === 'ios'
                    ? 'bg-blue-600 text-white shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Share className="w-3.5 h-3.5" />
                <span>iPhone / iPad</span>
              </button>
              <button
                onClick={() => setActivePlatformTab('desktop')}
                className={`flex-1 py-1.5 rounded-lg flex items-center justify-center gap-1.5 transition ${
                  activePlatformTab === 'desktop'
                    ? 'bg-blue-600 text-white shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Monitor className="w-3.5 h-3.5" />
                <span>PC / Mac</span>
              </button>
            </div>

            {/* Android Instructions */}
            {activePlatformTab === 'android' && (
              <div className="mt-3.5 space-y-2.5 text-xs text-slate-300 animate-in fade-in">
                <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-slate-800/70 border border-slate-700/60">
                  <span className="w-5 h-5 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center text-[11px] shrink-0 mt-0.5">
                    1
                  </span>
                  <p>
                    Open this app in <strong>Google Chrome</strong> on your Android phone.
                  </p>
                </div>
                <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-slate-800/70 border border-slate-700/60">
                  <span className="w-5 h-5 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center text-[11px] shrink-0 mt-0.5">
                    2
                  </span>
                  <p>
                    Tap the <strong>three dots menu (⋮)</strong> in the top right corner of Chrome.
                  </p>
                </div>
                <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-slate-800/70 border border-slate-700/60">
                  <span className="w-5 h-5 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center text-[11px] shrink-0 mt-0.5">
                    3
                  </span>
                  <p>
                    Tap <strong>"Install app"</strong> or <strong>"Add to Home screen"</strong>.
                  </p>
                </div>
                <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-slate-800/70 border border-slate-700/60">
                  <span className="w-5 h-5 rounded-full bg-emerald-600 text-white font-bold flex items-center justify-center text-[11px] shrink-0 mt-0.5">
                    ✓
                  </span>
                  <p>
                    The app will install as an official standalone app on your phone home screen with full offline support!
                  </p>
                </div>
              </div>
            )}

            {/* iOS Instructions */}
            {activePlatformTab === 'ios' && (
              <div className="mt-3.5 space-y-2.5 text-xs text-slate-300 animate-in fade-in">
                <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-slate-800/70 border border-slate-700/60">
                  <span className="w-5 h-5 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center text-[11px] shrink-0 mt-0.5">
                    1
                  </span>
                  <p>
                    Open this URL in <strong>Safari</strong> on your iPhone or iPad.
                  </p>
                </div>
                <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-slate-800/70 border border-slate-700/60">
                  <span className="w-5 h-5 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center text-[11px] shrink-0 mt-0.5">
                    2
                  </span>
                  <p>
                    Tap the <strong>Share</strong> button <Share className="w-3.5 h-3.5 inline mx-1 text-blue-400" /> in the bottom navigation bar.
                  </p>
                </div>
                <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-slate-800/70 border border-slate-700/60">
                  <span className="w-5 h-5 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center text-[11px] shrink-0 mt-0.5">
                    3
                  </span>
                  <p>
                    Scroll down and select <strong>"Add to Home Screen"</strong>, then tap <strong>Add</strong>.
                  </p>
                </div>
              </div>
            )}

            {/* Desktop Instructions */}
            {activePlatformTab === 'desktop' && (
              <div className="mt-3.5 space-y-2.5 text-xs text-slate-300 animate-in fade-in">
                <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-slate-800/70 border border-slate-700/60">
                  <span className="w-5 h-5 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center text-[11px] shrink-0 mt-0.5">
                    1
                  </span>
                  <p>
                    Open the app in <strong>Google Chrome</strong>, <strong>Microsoft Edge</strong>, or <strong>Brave</strong>.
                  </p>
                </div>
                <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-slate-800/70 border border-slate-700/60">
                  <span className="w-5 h-5 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center text-[11px] shrink-0 mt-0.5">
                    2
                  </span>
                  <p>
                    Look for the <strong>Install icon</strong> (<Download className="w-3.5 h-3.5 inline mx-0.5 text-blue-400" />) on the right side of the address bar, or click Chrome menu (⋮) → <strong>"Install Courier Payout Pro"</strong>.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Close Button */}
          <button
            onClick={() => setShowInstallGuide(false)}
            className="mt-5 w-full py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-xl text-xs font-semibold text-white transition"
          >
            Close Guide
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div
        id="pwa-mobile-install-banner"
        className="bg-gradient-to-r from-blue-900/90 via-indigo-900/90 to-slate-900/95 border-b border-blue-500/30 px-3.5 py-2.5 text-white shadow-lg backdrop-blur-md"
      >
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-blue-600/30 border border-blue-400/40 p-1 shrink-0 flex items-center justify-center">
              <img src="/icon.svg" alt="App Icon" className="w-8 h-8 rounded-lg" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 font-semibold text-sm leading-tight truncate">
                <span>Install Rider Payout PWA</span>
                <span className="text-[10px] uppercase font-bold bg-blue-500/30 text-blue-300 px-1.5 py-0.5 rounded">
                  Fast & Offline
                </span>
              </div>
              <p className="text-xs text-slate-300 truncate">
                Add to your phone's home screen for 1-tap delivery management
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              id="pwa-banner-install-action"
              onClick={handleInstallClick}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 active:scale-95 rounded-lg shadow transition whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Install Now</span>
            </button>
            <button
              id="pwa-banner-dismiss-btn"
              onClick={() => setIsDismissed(true)}
              className="p-1.5 text-slate-400 hover:text-slate-200 rounded-lg"
              title="Dismiss"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {showInstallGuide && renderModal()}

      {/* Success toast */}
      {installSuccess && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 bg-emerald-600 text-white px-4 py-2 rounded-xl text-xs font-medium shadow-xl flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" />
          <span>App installed successfully! Check your home screen.</span>
        </div>
      )}
    </>
  );
};
