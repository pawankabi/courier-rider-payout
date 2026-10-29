import React from 'react';
import { 
  X, 
  Download, 
  Upload, 
  CloudDownload, 
  ShieldCheck, 
  Share2, 
  Scale, 
  RefreshCw, 
  Wrench,
  ChevronRight,
  Database
} from 'lucide-react';
import { APP_VERSION } from '../utils/version';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onDownloadBackup: () => void;
  onRestoreBackup: () => void;
  onOpenSyncOldApp: () => void;
  onOpenSafetyShield: () => void;
  onOpenLegalPolicies: () => void;
  onOpenShareLinks: () => void;
  onCheckLiveUpdate: () => void;
  isCheckingUpdate?: boolean;
  activeHubName: string;
}

export const AdminToolsDrawer: React.FC<Props> = ({
  isOpen,
  onClose,
  onDownloadBackup,
  onRestoreBackup,
  onOpenSyncOldApp,
  onOpenSafetyShield,
  onOpenLegalPolicies,
  onOpenShareLinks,
  onCheckLiveUpdate,
  isCheckingUpdate = false,
  activeHubName,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Dimmed Backdrop */}
      <div 
        className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Slide-out Drawer Panel */}
      <aside 
        className="relative w-84 max-w-[90vw] h-full bg-[#0b0f19] border-l border-slate-800 shadow-2xl flex flex-col justify-between z-10 animate-in slide-in-from-right duration-200"
      >
        {/* Drawer Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 bg-[#0f172a]/95 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-500/15 border border-indigo-500/30 text-indigo-400">
              <Wrench className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-black text-sm text-white tracking-tight flex items-center gap-1.5">
                <span>त्वरित एडमिन टूल्स</span>
                <span className="text-[10px] font-black px-1.5 py-0.2 rounded bg-indigo-600/30 text-indigo-300 border border-indigo-500/40">
                  ADMIN
                </span>
              </h3>
              <p className="text-[11px] text-slate-400">
                मास्टर बैकअप, सिंक और प्रबंधन टूल्स
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
            title="बंद करें"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Drawer Tool Items */}
        <div className="flex-1 overflow-y-auto p-3.5 space-y-2">
          {/* Tool 1: Download JSON Backup */}
          <button
            type="button"
            onClick={() => {
              onClose();
              onDownloadBackup();
            }}
            className="w-full text-left p-3 rounded-xl bg-slate-900/90 hover:bg-slate-850 border border-slate-800 hover:border-blue-500/40 transition group flex items-center justify-between gap-3 cursor-pointer"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="p-2 rounded-lg bg-blue-500/15 text-blue-400 group-hover:scale-105 transition shrink-0">
                <Download className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="font-bold text-xs text-white group-hover:text-blue-300 transition truncate">
                  डाउनलोड बैकअप (.JSON)
                </div>
                <div className="text-[10px] text-slate-400 truncate">
                  सभी राइडर्स एवं हिसाब का ऑफलाइन बैकअप
                </div>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-white transition shrink-0" />
          </button>

          {/* Tool 2: Restore from JSON */}
          <button
            type="button"
            onClick={() => {
              onClose();
              onRestoreBackup();
            }}
            className="w-full text-left p-3 rounded-xl bg-slate-900/90 hover:bg-slate-850 border border-slate-800 hover:border-emerald-500/40 transition group flex items-center justify-between gap-3 cursor-pointer"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="p-2 rounded-lg bg-emerald-500/15 text-emerald-400 group-hover:scale-105 transition shrink-0">
                <Upload className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="font-bold text-xs text-white group-hover:text-emerald-300 transition truncate">
                  बैकअप फाइल रिस्टोर करें
                </div>
                <div className="text-[10px] text-slate-400 truncate">
                  JSON बैकअप फाइल से डेटा तुरंत लोड करें
                </div>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-white transition shrink-0" />
          </button>

          {/* Tool 3: Sync from Old App URL */}
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenSyncOldApp();
            }}
            className="w-full text-left p-3 rounded-xl bg-slate-900/90 hover:bg-slate-850 border border-slate-800 hover:border-amber-500/40 transition group flex items-center justify-between gap-3 cursor-pointer"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="p-2 rounded-lg bg-amber-500/15 text-amber-400 group-hover:scale-105 transition shrink-0">
                <CloudDownload className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="font-bold text-xs text-white group-hover:text-amber-300 transition truncate">
                  पुराने ऐप URL से सिंक
                </div>
                <div className="text-[10px] text-slate-400 truncate">
                  13+ राइडर्स और रिकॉर्ड्स सीधे इंपोर्ट करें
                </div>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-white transition shrink-0" />
          </button>

          {/* Tool 4: Autonomous Safety Shield */}
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenSafetyShield();
            }}
            className="w-full text-left p-3 rounded-xl bg-slate-900/90 hover:bg-slate-850 border border-slate-800 hover:border-purple-500/40 transition group flex items-center justify-between gap-3 cursor-pointer"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="p-2 rounded-lg bg-purple-500/15 text-purple-400 group-hover:scale-105 transition shrink-0">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="font-bold text-xs text-white group-hover:text-purple-300 transition truncate">
                  सुरक्षा कवच स्थिति
                </div>
                <div className="text-[10px] text-slate-400 truncate">
                  100% ऑटो-सुरक्षा सक्रिय • 2-मिनट ऑटो-ऑडिट
                </div>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-white transition shrink-0" />
          </button>

          {/* Tool 5: Share App Links Portal */}
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenShareLinks();
            }}
            className="w-full text-left p-3 rounded-xl bg-slate-900/90 hover:bg-slate-850 border border-slate-800 hover:border-cyan-500/40 transition group flex items-center justify-between gap-3 cursor-pointer"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="p-2 rounded-lg bg-cyan-500/15 text-cyan-400 group-hover:scale-105 transition shrink-0">
                <Share2 className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="font-bold text-xs text-white group-hover:text-cyan-300 transition truncate">
                  शेयर लिंक पोर्टल
                </div>
                <div className="text-[10px] text-slate-400 truncate">
                  राइडर स्टेटमेंट और टीम वेब लिंक
                </div>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-white transition shrink-0" />
          </button>

          {/* Tool 6: Legal Policies & Compliance */}
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenLegalPolicies();
            }}
            className="w-full text-left p-3 rounded-xl bg-slate-900/90 hover:bg-slate-850 border border-slate-800 hover:border-rose-500/40 transition group flex items-center justify-between gap-3 cursor-pointer"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="p-2 rounded-lg bg-rose-500/15 text-rose-400 group-hover:scale-105 transition shrink-0">
                <Scale className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="font-bold text-xs text-white group-hover:text-rose-300 transition truncate">
                  नीतियां (Policies & Compliance)
                </div>
                <div className="text-[10px] text-slate-400 truncate">
                  शर्तें, प्राइवेसी और रिफंड नीति
                </div>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-white transition shrink-0" />
          </button>

          {/* Tool 7: Check Live Cloud Update */}
          <button
            type="button"
            onClick={() => {
              onClose();
              onCheckLiveUpdate();
            }}
            disabled={isCheckingUpdate}
            className="w-full text-left p-3 rounded-xl bg-slate-900/90 hover:bg-slate-850 border border-slate-800 hover:border-indigo-500/40 transition group flex items-center justify-between gap-3 cursor-pointer disabled:opacity-60"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="p-2 rounded-lg bg-indigo-500/15 text-indigo-400 group-hover:scale-105 transition shrink-0">
                <RefreshCw className={`w-4 h-4 ${isCheckingUpdate ? 'animate-spin' : ''}`} />
              </div>
              <div className="min-w-0">
                <div className="font-bold text-xs text-white group-hover:text-indigo-300 transition truncate">
                  लाइव अपडेट जांचें
                </div>
                <div className="text-[10px] text-slate-400 truncate">
                  नवीनतम वर्जन से तुरंत सिंक करें
                </div>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-white transition shrink-0" />
          </button>
        </div>

        {/* Drawer Footer */}
        <div className="p-4 border-t border-slate-800/80 bg-slate-900/70 text-[11px] text-slate-400 flex items-center justify-between">
          <div className="flex items-center gap-1.5 truncate">
            <Database className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span className="truncate">{activeHubName}</span>
          </div>
          <span className="font-mono text-[10px] text-slate-400 shrink-0">v{APP_VERSION} Pro</span>
        </div>
      </aside>
    </div>
  );
};
