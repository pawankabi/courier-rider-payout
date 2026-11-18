import React, { useEffect, useState } from 'react';
import { CheckCircle2, FileText, Share2, X } from 'lucide-react';
import {
  DownloadedPdfPayload,
  PDF_DOWNLOADED_EVENT,
  openDownloadedPdfNative,
  shareDownloadedPdfNative,
} from '../services/nativeDownload';

/**
 * Top Heads-Up Notification Banner shown immediately when a PDF finishes downloading.
 * Clicking anywhere on the top notification opens Android's native app chooser
 * (WPS Office, Google Drive PDF Viewer, Adobe, Phone Viewer, etc.) without using a browser.
 */
export const DownloadedPdfOverlay: React.FC = () => {
  const [pdfInfo, setPdfInfo] = useState<DownloadedPdfPayload | null>(null);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [openingFile, setOpeningFile] = useState(false);
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

  // Auto-hide notification cleanly after 18s unless in-app fallback viewer is open
  useEffect(() => {
    if (!pdfInfo || viewerOpen) return;
    const timer = setTimeout(() => {
      setPdfInfo((prev) => {
        if (prev?.blobUrl) {
          try {
            URL.revokeObjectURL(prev.blobUrl);
          } catch {}
        }
        return null;
      });
      setStatusNote(null);
    }, 18000);
    return () => clearTimeout(timer);
  }, [pdfInfo, viewerOpen]);

  const handleDismiss = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
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

  const handleOpenNotificationClick = async () => {
    if (openingFile) return;
    setStatusNote(null);

    if (pdfInfo.isNative && pdfInfo.contentUri) {
      setOpeningFile(true);
      try {
        const res = await openDownloadedPdfNative(pdfInfo.contentUri, pdfInfo.mimeType);
        if (res.opened) {
          // User's OS app picker opened cleanly; dismiss the top banner
          handleDismiss();
          return;
        }
        // Only if the device literally has ZERO PDF viewer apps installed
        if (hasPreviewPages) {
          setViewerOpen(true);
        } else {
          setStatusNote('फ़ोन में कोई PDF व्यूअर ऐप नहीं मिला — फ़ाइल Downloads में सेव है।');
        }
      } finally {
        setOpeningFile(false);
      }
      return;
    }

    // Web / Mobile Browser fallback preview
    if (hasPreviewPages || pdfInfo.blobUrl) {
      setViewerOpen(true);
    }
  };

  const handleShareFile = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (pdfInfo.isNative && pdfInfo.contentUri) {
      await shareDownloadedPdfNative({
        contentUri: pdfInfo.contentUri,
        mimeType: pdfInfo.mimeType,
        title: pdfInfo.title,
        text: pdfInfo.text,
      });
    }
  };

  return (
    <>
      {/* Sleek Android-style TOP Heads-Up Download Notification */}
      {!viewerOpen && (
        <div
          role="button"
          tabIndex={0}
          onClick={handleOpenNotificationClick}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              handleOpenNotificationClick();
            }
          }}
          className="fixed top-3 left-1/2 -translate-x-1/2 z-[10050] w-[calc(100%-1.25rem)] max-w-md bg-slate-900/95 backdrop-blur-md border border-emerald-500/60 rounded-2xl px-3.5 py-2.5 shadow-2xl shadow-black/70 text-white cursor-pointer active:scale-[0.99] transition animate-in fade-in slide-in-from-top-4 print:hidden"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-400/40 text-emerald-400 flex items-center justify-center shrink-0">
              <FileText className="w-4 h-4" />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span className="text-xs font-black text-emerald-300 truncate">
                  PDF डाउनलोड पूरा • खोलने के लिए टैप करें
                </span>
              </div>
              <p className="text-[11px] text-slate-200 font-semibold truncate mt-0.5">
                {pdfInfo.filename}
              </p>
              <p className="text-[10px] text-slate-400 truncate">
                {openingFile
                  ? 'ऐप चुनने का विकल्प खुल रहा है...'
                  : pdfInfo.isNative
                  ? 'Downloads में सेव • क्लिक कर PDF ऐप (WPS/Drive) चुनें'
                  : 'डिवाइस में डाउनलोड हो गया • देखने के लिए टैप करें'}
              </p>
              {statusNote && (
                <p className="text-[10px] text-amber-300 mt-0.5 leading-snug">
                  {statusNote}
                </p>
              )}
            </div>

            <button
              type="button"
              onClick={handleDismiss}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg cursor-pointer shrink-0"
              title="बंद करें"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Fallback Viewer ONLY when on Web or if Android device has zero PDF apps installed */}
      {viewerOpen && (
        <div className="fixed inset-0 z-[10060] bg-slate-950/95 flex flex-col text-white print:hidden">
          <div className="flex items-center justify-between gap-2 px-3 sm:px-4 py-3 bg-slate-900 border-b border-slate-800 shrink-0">
            <div className="min-w-0 flex-1">
              <h3 className="text-xs sm:text-sm font-black text-white truncate">
                {pdfInfo.filename}
              </h3>
              <p className="text-[10px] text-emerald-400 truncate">
                ✓ Downloads में सेव है
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {pdfInfo.isNative && pdfInfo.contentUri && (
                <button
                  type="button"
                  onClick={handleShareFile}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-bold cursor-pointer"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  <span>शेयर</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => handleDismiss()}
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
            ) : null}
          </div>
        </div>
      )}
    </>
  );
};

export default DownloadedPdfOverlay;
