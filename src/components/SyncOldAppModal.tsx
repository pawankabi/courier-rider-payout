import React, { useState, useRef } from 'react';
import {
  X,
  CloudDownload,
  Link,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Users,
  Package,
  FileSpreadsheet,
  ArrowRight,
  Copy,
  Check,
  Code2,
  RefreshCw,
  Clock,
  ShieldCheck,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import {
  extractDataFromOldAppUrl,
  SyncExtractedData,
  ONE_CLICK_EXTRACTION_SCRIPT
} from '../services/oldAppSync';
import { formatINR, formatDateDisplay } from '../utils/formatters';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onImportComplete: (data: SyncExtractedData) => Promise<void>;
  currentOwnerEmail?: string | null;
}

export const SyncOldAppModal: React.FC<Props> = ({
  isOpen,
  onClose,
  onImportComplete,
  currentOwnerEmail
}) => {
  const [urlInput, setUrlInput] = useState('');
  const [isExtracting, setIsExtracting] = useState(false);
  const [progressMsg, setProgressMsg] = useState('');
  const [progressPercent, setProgressPercent] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [extractedData, setExtractedData] = useState<SyncExtractedData | null>(null);
  const [activePreviewTab, setActivePreviewTab] = useState<'riders' | 'entries'>('riders');
  const [isImporting, setIsImporting] = useState(false);
  const [copiedScript, setCopiedScript] = useState(false);
  const [showDirectPaste, setShowDirectPaste] = useState(false);
  const [pastedJson, setPastedJson] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Smooth Escape key handler to return smoothly without freeze
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isExtracting && !isImporting) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, isExtracting, isImporting]);

  if (!isOpen) return null;

  const handleStartExtraction = async (inputToUse?: string) => {
    const raw = (inputToUse !== undefined ? inputToUse : urlInput).trim();
    if (!raw) {
      setErrorMsg('Please enter your old app URL or paste backup data.');
      return;
    }

    setErrorMsg(null);
    setExtractedData(null);
    setIsExtracting(true);
    setProgressMsg('Initiating data discovery...');
    setProgressPercent(10);

    try {
      const result = await extractDataFromOldAppUrl(raw, (msg, pct) => {
        setProgressMsg(msg);
        setProgressPercent(pct);
      });

      setExtractedData(result);
      setProgressPercent(100);
      setProgressMsg('Extraction complete!');
    } catch (err: any) {
      console.error('Extraction failed:', err);
      setErrorMsg(err.message || 'Failed to extract data. Please check the URL or use the 1-click script option.');
    } finally {
      setIsExtracting(false);
    }
  };

  const handleConfirmImport = async () => {
    if (!extractedData) return;
    setIsImporting(true);
    try {
      await onImportComplete(extractedData);
      onClose();
    } catch (err: any) {
      console.error('Import error:', err);
      setErrorMsg(err.message || 'Failed to save data. Please try again.');
    } finally {
      setIsImporting(false);
    }
  };

  const handleCopyScript = () => {
    navigator.clipboard.writeText(ONE_CLICK_EXTRACTION_SCRIPT);
    setCopiedScript(true);
    setTimeout(() => setCopiedScript(false), 2500);
  };

  const handlePasteClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setUrlInput(text);
        if (text.startsWith('{') || text.startsWith('[')) {
          handleStartExtraction(text);
        }
      }
    } catch {
      // clipboard permission denied
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        id="sync-old-app-modal-container"
        className="relative w-full max-w-2xl max-h-[90vh] flex flex-col bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden text-slate-100"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-900/90">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-sm">
              <CloudDownload className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white tracking-tight">
                  Sync from Old App URL
                </h2>
                <span className="text-[10px] uppercase font-black px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  Full Migration
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Import all 13+ riders, delivery history logs, and dues into this workspace
              </p>
            </div>
          </div>
          <button
            id="close-sync-modal-btn"
            onClick={onClose}
            disabled={isExtracting || isImporting}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs sm:text-sm">
          {/* Target Owner Badge */}
          {currentOwnerEmail && (
            <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-slate-800/60 border border-slate-700/60 text-xs">
              <div className="flex items-center gap-2 text-slate-300">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>
                  Target Workspace:{' '}
                  <strong className="text-white">{currentOwnerEmail}</strong>
                </span>
              </div>
              <span className="text-[11px] text-slate-400 font-mono">100% Isolated</span>
            </div>
          )}

          {/* URL Input Form */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-slate-300">
              Old App URL or Cloud Run Address:
            </label>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                  <Link className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  id="sync-old-app-url-input"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !isExtracting) {
                      handleStartExtraction();
                    }
                  }}
                  disabled={isExtracting}
                  placeholder="https://ais-dev-...515426382523.asia-east1.run.app"
                  className="w-full pl-9 pr-20 py-2.5 rounded-xl bg-slate-800/90 border border-slate-700 text-white placeholder-slate-500 text-xs focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500 font-mono transition"
                />
                <button
                  type="button"
                  onClick={handlePasteClipboard}
                  className="absolute inset-y-1 right-1 px-2.5 rounded-lg bg-slate-700/70 hover:bg-slate-700 text-[11px] text-slate-300 font-medium transition"
                  title="Paste from clipboard"
                >
                  Paste
                </button>
              </div>

              <button
                id="extract-sync-data-btn"
                type="button"
                onClick={() => handleStartExtraction()}
                disabled={isExtracting || !urlInput.trim()}
                className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white font-bold text-xs shadow-md shadow-amber-600/20 transition active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
              >
                {isExtracting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Extracting...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Extract Data</span>
                  </>
                )}
              </button>
            </div>
            <p className="text-[11px] text-slate-400">
              Enter your previous Courier Payout Cloud Run URL, Firebase link, or paste raw backup JSON.
            </p>
          </div>

          {/* Extraction Progress Bar */}
          {isExtracting && (
            <div className="p-3.5 rounded-xl bg-slate-800/80 border border-amber-500/30 space-y-2 animate-in fade-in duration-150">
              <div className="flex items-center justify-between text-xs">
                <span className="text-amber-300 font-medium flex items-center gap-1.5">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-400" />
                  {progressMsg || 'Extracting collections...'}
                </span>
                <span className="text-amber-400 font-bold font-mono">{progressPercent}%</span>
              </div>
              <div className="w-full bg-slate-700/80 rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-amber-500 to-orange-500 h-1.5 rounded-full transition-all duration-300"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          )}

          {/* Error Message */}
          {errorMsg && (
            <div className="p-3.5 rounded-xl bg-rose-950/60 border border-rose-800/70 text-rose-200 text-xs flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-semibold text-rose-100">Extraction Note:</p>
                <p className="leading-relaxed">{errorMsg}</p>
                <p className="text-[11px] text-rose-300/80">
                  Tip: Use the "1-Click Extraction Script" below to pull riders and delivery entries directly from your old app's browser tab!
                </p>
              </div>
            </div>
          )}

          {/* Extracted Data Live Preview */}
          {extractedData && (
            <div className="space-y-3 p-3.5 rounded-xl bg-slate-800/50 border border-emerald-500/30 animate-in fade-in slide-in-from-bottom-2 duration-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span className="text-xs font-bold text-emerald-300">
                    Ready to Import ({extractedData.stats.source})
                  </span>
                </div>
                <span className="text-[10px] font-mono text-slate-400">
                  Calculated Live
                </span>
              </div>

              {/* Stat Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <div className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-700/70">
                  <div className="flex items-center gap-1.5 text-slate-400 text-[11px]">
                    <Users className="w-3.5 h-3.5 text-blue-400" />
                    <span>Riders</span>
                  </div>
                  <div className="text-lg font-extrabold text-white mt-0.5">
                    {extractedData.stats.ridersCount}
                  </div>
                  <div className="text-[10px] text-amber-400 font-medium">
                    {formatINR(extractedData.stats.totalUnpaidDue)} pending
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-700/70">
                  <div className="flex items-center gap-1.5 text-slate-400 text-[11px]">
                    <Package className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Deliveries</span>
                  </div>
                  <div className="text-lg font-extrabold text-white mt-0.5">
                    {extractedData.stats.entriesCount}
                  </div>
                  <div className="text-[10px] text-emerald-400 font-medium">
                    {extractedData.stats.totalParcels} total pkts
                  </div>
                </div>

                <div className="col-span-2 sm:col-span-1 p-2.5 rounded-lg bg-slate-900/80 border border-slate-700/70">
                  <div className="flex items-center gap-1.5 text-slate-400 text-[11px]">
                    <FileSpreadsheet className="w-3.5 h-3.5 text-purple-400" />
                    <span>Settlements</span>
                  </div>
                  <div className="text-lg font-extrabold text-white mt-0.5">
                    {extractedData.stats.settlementsCount}
                  </div>
                  <div className="text-[10px] text-slate-400">
                    Historical records
                  </div>
                </div>
              </div>

              {/* Preview Selector Tabs */}
              <div className="flex items-center gap-2 border-b border-slate-700/60 pb-1.5 pt-1">
                <button
                  type="button"
                  onClick={() => setActivePreviewTab('riders')}
                  className={`px-2.5 py-1 rounded-md text-xs font-semibold transition ${
                    activePreviewTab === 'riders'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Riders ({extractedData.riders.length})
                </button>
                <button
                  type="button"
                  onClick={() => setActivePreviewTab('entries')}
                  className={`px-2.5 py-1 rounded-md text-xs font-semibold transition ${
                    activePreviewTab === 'entries'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Delivery Logs ({extractedData.entries.length})
                </button>
              </div>

              {/* Preview Content */}
              <div className="max-h-44 overflow-y-auto rounded-lg bg-slate-900/90 border border-slate-800 p-2 space-y-1.5 text-xs font-mono">
                {activePreviewTab === 'riders' ? (
                  extractedData.riders.map((r, i) => (
                    <div
                      key={r.id || i}
                      className="flex items-center justify-between py-1 px-2 rounded hover:bg-slate-800/60 text-slate-300"
                    >
                      <div className="flex items-center gap-2 truncate">
                        <span className="text-slate-500 font-bold">{i + 1}.</span>
                        <span className="text-white font-medium truncate">{r.name}</span>
                        <span className="text-slate-500 text-[10px]">({r.phone || 'No phone'})</span>
                      </div>
                      <span className="text-slate-400 text-[11px] shrink-0 ml-2">
                        {r.vehicleType}
                      </span>
                    </div>
                  ))
                ) : (
                  extractedData.entries.slice(0, 50).map((e, i) => (
                    <div
                      key={e.id || i}
                      className="flex items-center justify-between py-1 px-2 rounded hover:bg-slate-800/60 text-slate-300 text-[11px]"
                    >
                      <div className="flex items-center gap-2 truncate">
                        <span className="text-slate-400">{formatDateDisplay(e.date)}</span>
                        <span className="text-white truncate">{e.riderName}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        <span className="text-emerald-400 font-bold">{e.parcels} pkts</span>
                        <span className="text-slate-300 font-bold">{formatINR(e.totalEarnings)}</span>
                        <span
                          className={`text-[9px] px-1 py-0.2 rounded font-bold uppercase ${
                            e.status === 'Paid'
                              ? 'bg-emerald-500/20 text-emerald-300'
                              : 'bg-amber-500/20 text-amber-300'
                          }`}
                        >
                          {e.status}
                        </span>
                      </div>
                    </div>
                  ))
                )}
                {activePreviewTab === 'entries' && extractedData.entries.length > 50 && (
                  <div className="text-center py-1 text-slate-500 text-[10px]">
                    + {extractedData.entries.length - 50} more delivery logs
                  </div>
                )}
              </div>

              {/* Confirm Import Action Button */}
              <button
                id="confirm-import-sync-btn"
                type="button"
                onClick={handleConfirmImport}
                disabled={isImporting}
                className="w-full py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs shadow-lg shadow-emerald-600/20 transition active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
              >
                {isImporting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Saving to Database & Workspace...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>
                      Import All {extractedData.stats.ridersCount} Riders & {extractedData.stats.entriesCount} Deliveries Now
                    </span>
                  </>
                )}
              </button>
            </div>
          )}

          {/* 1-Click Extraction Assistant & Fallback Drawer */}
          <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-900/40">
            <button
              type="button"
              onClick={() => setShowDirectPaste(!showDirectPaste)}
              className="w-full px-3.5 py-2.5 flex items-center justify-between text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-800/40 transition"
            >
              <div className="flex items-center gap-2">
                <Code2 className="w-4 h-4 text-amber-400" />
                <span>Need 1-Click Extraction Script or Direct Paste?</span>
              </div>
              {showDirectPaste ? (
                <ChevronUp className="w-4 h-4 text-slate-400" />
              ) : (
                <ChevronDown className="w-4 h-4 text-slate-400" />
              )}
            </button>

            {showDirectPaste && (
              <div className="p-3.5 pt-1 space-y-3 border-t border-slate-800/80 bg-slate-900/70">
                <div className="space-y-1.5">
                  <p className="text-[11px] text-slate-300 font-medium">
                    If your old app requires Google authentication or runs in a private tab, extract all 13+ riders & entries directly from its console:
                  </p>
                  <ol className="text-[11px] text-slate-400 list-decimal list-inside space-y-0.5">
                    <li>Open your old app in another browser tab</li>
                    <li>Press <strong>F12</strong> (or right-click → Inspect) → click <strong>Console</strong></li>
                    <li>Click the button below to copy the extraction script</li>
                    <li>Paste into the console, press Enter, then paste the result here</li>
                  </ol>
                  <button
                    type="button"
                    onClick={handleCopyScript}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-750 text-amber-300 border border-amber-500/30 text-xs font-semibold transition active:scale-95"
                  >
                    {copiedScript ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Copied to Clipboard!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy 1-Click Extraction Script</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Direct JSON Textarea */}
                <div className="space-y-1.5">
                  <label className="block text-[11px] font-semibold text-slate-400">
                    Paste Copied Data or Backup JSON:
                  </label>
                  <textarea
                    rows={3}
                    value={pastedJson}
                    onChange={(e) => setPastedJson(e.target.value)}
                    placeholder='{"riders": [...], "deliveries": [...]}'
                    className="w-full p-2 rounded-lg bg-slate-950 border border-slate-700 text-slate-200 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => handleStartExtraction(pastedJson)}
                      disabled={!pastedJson.trim() || isExtracting}
                      className="px-3 py-1 rounded-lg bg-slate-700 hover:bg-slate-650 text-white text-xs font-semibold transition disabled:opacity-50"
                    >
                      Parse Pasted Data
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3 border-t border-slate-800 bg-slate-900/90 flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-slate-500" />
            <span>Retains full delivery history, dates, packets & dues</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isExtracting || isImporting}
            className="px-3 py-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};
