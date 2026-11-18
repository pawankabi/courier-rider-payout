import React, { useEffect, useState } from 'react';
import { CheckCircle2, ExternalLink, Eye, FolderDown, Share2, X } from 'lucide-react';
import {
  DownloadedPdfPayload,
  PDF_DOWNLOADED_EVENT,
  openDownloadedPdfNative,
  shareDownloadedPdfNative,
} from '../services/nativeDownload';

export const DownloadedPdfOverlay: React.FC = () => {
  const [pdfInfo, setPdfInfo] = useState<DownloadedPdfPayload | null>(null);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [openingFile, setOpeningFile] = useState(false);
  const [sharingFile, setSharingFile] = useState(false);
  const [statusNote, setStatusNote] = useState<string | null>(null);

  useEffect(() => {
    const handlePdfDownloaded = (ev: Event) => {
      const customEv = ev as CustomEvent<DownloadedPdfPayload>;
      if (!customEv?.detail) return;
      setPdfInfo((prev) => {
        if (prev?.blobUrl && prev.blobUrl !== customEv.detail.blobUrl) {
          try {
            URL.revokeObjectURL(prev.blobUrl);
          } catch {}
        }
        return customEv.detail;
      });
      setStatusNote(null);
      setViewerOpen(false);
    };

    window.addEventListener(PDF_DOWNLOADED_EVENT, handlePdfDownloaded);
    return () => {
      window.removeEventListener(PDF_DOWNLOADED_EVENT, handlePdfDownloaded);
    };
  }, []);

  const handleDismiss = () => {
    if (pdfInfo?.blobUrl) {
      try {
        URL.revokeObjectURL(pdfInfo.blobUrl);
      } catch {}
    }
    setViewerOpen(false);
    setPdfInfo(null);
    setStatusNote(null);
  };

  if (!pdfInfo) return null;

  const hasPreviewPages = Array.isArray(pdfInfo.previewPages) && pdfInfo.previewPages.length > 0;

  const handleOpenFile = async () => {
    if (openingFile) return;
    setStatusNote(null);

    if (pdfInfo.isNative && pdfInfo.contentUri) {
      setOpeningFile(true);
      try {
        const res = await openDownloadedPdfNative(pdfInfo.contentUri, pdfInfo.mimeType);
        if (!res.opened) {
          if (hasPreviewPages) {
            setViewerOpen(true);
            setStatusNote('फ़ोन में अलग PDF ऐप नहीं मिला, इसलिए यहीं ऐप के अंदर फ़ाइल खोली गई है।');
          } else {
            setStatusNote('फ़ाइल आपके Downloads फ़ोल्डर में सेव है — इसे देखने के लिए आप शेयर या फ़ाइल मैनेजर का उपयोग कर सकते हैं।');
          }
        }
      } finally {
        setOpeningFile(false);
      }
      return;
    }

    // Web / Mobile Browser: open built-in in-app viewer modal (never redirects to another browser)
    if (hasPreviewPages || pdfInfo.blobUrl) {
      setViewerOpen(true);
    }
  };

  const handleShareFile = async () => {
    if (sharingFile) return;
    setSharingFile(true);
    setStatusNote(null);
    try {
      if (pdfInfo.isNative && pdfInfo.contentUri) {
        await shareDownloadedPdfNative({
          contentUri: pdfInfo.contentUri,
          mimeType: pdfInfo.mimeType,
          title: pdfInfo.title,
          text: pdfInfo.text,
        });
      } else if (pdfInfo.blobUrl && typeof navigator !== 'undefined' && navigator.share) {
        const resp = await fetch(pdfInfo.blobUrl);
        const blob = await resp.blob();
        const file = new File([blob], pdfInfo.filename, { type: pdfInfo.mimeType || 'application/pdf' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({
            title: pdfInfo.title,
            text: pdfInfo.text,
            files: [file],
          });
        }
      }
    } catch {
      // Ignore user cancel
    } finally {
      setSharingFile(false);
    }
  };

  return (
    <>
      {/* Direct Download Complete Bar with In-App Open Option */}
      {!viewerOpen && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[10050] w-[calc(100%-1.25rem)] max-w-md bg-slate-900 border border-emerald-500/50 rounded-2xl p-3.5 shadow-2xl shadow-black/70 text-white animate-in fade-in slide-in-from-bottom-4 print:hidden">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-400/40 text-emerald-400 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-xs sm:text-sm font-black text-emerald-300 truncate">
                  PDF सीधे डाउनलोड हो गया!
                </h4>
                <button
                  type="button"
                  onClick={handleDismiss}
                  className="p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg cursor-pointer shrink-0"
                  title="बंद करें"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="text-[11px] text-slate-200 font-semibold truncate mt-0.5">
                {pdfInfo.filename}
              </p>
              <p className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
                <FolderDown className="w-3 h-3 text-emerald-400 shrink-0" />
                <span className="truncate">
                  {pdfInfo.isNative
                    ? (pdfInfo.savedInDownloads
                        ? 'फ़ाइल मैनेजर → Downloads फ़ोल्डर में सेव हो गया है'
                        : 'ऐप डॉक्यूमेंट्स में सेव हो गया है')
                    : 'डिवाइस के Downloads में सेव हो गया है'}
                </span>
              </p>

              {statusNote && (
                <p className="text-[10px] text-amber-300 mt-1.5 leading-snug">
                  {statusNote}
                </p>
              )}

              <div className="flex items-center flex-wrap gap-2 mt-3">
                <button
                  type="button"
                  onClick={handleOpenFile}
                  disabled={openingFile}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition active:scale-95 cursor-pointer shadow-sm disabled:opacity-60"
                >
                  <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                  <span>{openingFile ? 'खुल रहा है...' : 'फ़ाइल खोलें (Open)'}</span>
                </button>

                {hasPreviewPages && pdfInfo.isNative && (
                  <button
                    type="button"
                    onClick={() => setViewerOpen(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition active:scale-95 cursor-pointer shadow-sm"
                  >
                    <Eye className="w-3.5 h-3.5 shrink-0" />
                    <span>ऐप में देखें</span>
                  </button>
                )}

                {pdfInfo.isNative && pdfInfo.contentUri && (
                  <button
                    type="button"
                    onClick={handleShareFile}
                    disabled={sharingFile}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-bold transition active:scale-95 cursor-pointer"
                  >
                    <Share2 className="w-3.5 h-3.5 shrink-0" />
                    <span>शेयर</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Built-In In-App PDF Viewer Modal (Zero External Browser Redirect) */}
      {viewerOpen && (
        <div className="fixed inset-0 z-[10060] bg-slate-950/95 flex flex-col text-white print:hidden">
          <div className="flex items-center justify-between gap-2 px-3 sm:px-4 py-3 bg-slate-900 border-b border-slate-800 shrink-0">
            <div className="min-w-0 flex-1">
              <h3 className="text-xs sm:text-sm font-black text-white truncate">
                {pdfInfo.filename}
              </h3>
              <p className="text-[10px] text-emerald-400 truncate">
                {pdfInfo.savedInDownloads
                  ? '✓ फ़ाइल मैनेजर → Downloads में सेव है'
                  : '✓ डाउनलोड पूरा हुआ'}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {pdfInfo.isNative && pdfInfo.contentUri && (
                <>
                  <button
                    type="button"
                    onClick={() => openDownloadedPdfNative(pdfInfo.contentUri!, pdfInfo.mimeType)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold cursor-pointer"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>PDF ऐप</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleShareFile}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-bold cursor-pointer"
                  >
                    <Share2 className="w-3.5 h-3.5" />
                    <span>शेयर</span>
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={handleDismiss}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-rose-950/80 hover:bg-rose-900 text-rose-200 border border-rose-800/70 text-xs font-bold cursor-pointer"
              >
                <X className="w-4 h-4" />
                <span>बंद करें</span>
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-3 sm:p-6 bg-slate-900/70">
            {hasPreviewPages ? (
              <div className="max-w-3xl mx-auto space-y-4">
                {pdfInfo.previewPages!.map((pageImg, idx) => (
                  <div
                    key={idx}
                    className="bg-white rounded-xl overflow-hidden shadow-2xl border border-slate-700"
                  >
                    <img
                      src={pageImg}
                      alt={`Page ${idx + 1}`}
                      className="w-full h-auto block"
                    />
                  </div>
                ))}
              </div>
            ) : pdfInfo.blobUrl ? (
              <iframe
                src={pdfInfo.blobUrl}
                title={pdfInfo.filename}
                className="w-full h-full min-h-[75vh] rounded-xl bg-white border border-slate-700"
              />
            ) : (
              <div className="max-w-md mx-auto mt-16 text-center space-y-3 bg-slate-900 border border-slate-800 rounded-2xl p-6">
                <p className="text-sm font-bold text-slate-200">
                  यह PDF फ़ाइल आपके फ़ोन के Downloads फ़ोल्डर में सेव हो चुकी है।
                </p>
                <p className="text-xs text-slate-400">
                  फ़ाइल का नाम: {pdfInfo.filename}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};

export default DownloadedPdfOverlay;
