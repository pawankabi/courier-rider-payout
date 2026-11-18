import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import {
  notifyPdfDownloaded,
  savePdfToDeviceDownloadsNative,
} from '../services/nativeDownload';

export interface ExportFileOptions {
  filename: string;
  content: string;
  mimeType: string;
  title?: string;
  text?: string;
  dialogTitle?: string;
  encoding?: 'utf8' | 'base64';
  previewPages?: string[];
}

function sanitizeFileName(raw: string): string {
  const cleaned = String(raw || 'export_file')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, '_')
    .trim();
  return cleaned || `export_${Date.now()}`;
}

export function isShareCancelError(err: any): boolean {
  const msg = String(err?.message || err || '').toLowerCase();
  return (
    msg.includes('cancel') ||
    msg.includes('dismiss') ||
    msg.includes('abort') ||
    msg.includes('user did not share')
  );
}

/**
 * Unified Android Capacitor APK + Web File Exporter.
 * On Android APK:
 *  - Saves directly into system public Downloads folder (File Manager -> Downloads) with ZERO browser redirect
 *  - Fires in-app download notification overlay with instant "Open File" / "View Inside App" buttons
 * On Web / Mobile Browser:
 *  - Downloads directly via blob URL and (for PDFs) shows the in-app open/preview bar
 */
export async function exportFileNativelyOrWeb(options: ExportFileOptions): Promise<void> {
  const safeFilename = sanitizeFileName(options.filename);
  const {
    content,
    mimeType,
    title = safeFilename,
    text = `Report: ${safeFilename}`,
    dialogTitle = 'रिपोर्ट सेव या शेयर करें (Save / Share)',
    encoding = 'utf8',
    previewPages,
  } = options;

  const isPdf = mimeType === 'application/pdf' || safeFilename.toLowerCase().endsWith('.pdf');

  if (Capacitor.isNativePlatform()) {
    // Convert UTF-8 payload to base64 when saving directly to MediaStore Downloads
    const base64Payload =
      encoding === 'base64'
        ? content
        : typeof window !== 'undefined'
        ? btoa(unescape(encodeURIComponent(content)))
        : Buffer.from(content, 'utf8').toString('base64');

    // 1. Primary path: Direct save to Android public Downloads folder (MediaStore / File Manager visible)
    const directDownload = await savePdfToDeviceDownloadsNative({
      filename: safeFilename,
      base64Data: base64Payload,
      mimeType,
    });

    if (directDownload?.success) {
      if (isPdf) {
        notifyPdfDownloaded({
          id: `${Date.now()}-${safeFilename}`,
          filename: directDownload.filename || safeFilename,
          title,
          text,
          mimeType,
          contentUri: directDownload.contentUri,
          savedInDownloads: directDownload.savedInDownloads,
          locationLabel: directDownload.locationLabel || `Downloads/${directDownload.filename || safeFilename}`,
          previewPages,
          isNative: true,
        });
      }
      return;
    }

    // 2. Legacy fallback if NativeDownload plugin is unavailable in an older pre-built shell
    const candidateDirs: Directory[] = [
      Directory.Documents,
      Directory.Cache,
      Directory.Data,
    ];

    let writtenUri: string | null = null;
    let lastWriteErr: any = null;

    for (const directory of candidateDirs) {
      try {
        const writeResult = await Filesystem.writeFile({
          path: safeFilename,
          data: content,
          directory,
          ...(encoding === 'utf8' ? { encoding: Encoding.UTF8 } : {}),
          recursive: true,
        });
        if (writeResult?.uri) {
          writtenUri = writeResult.uri;
          break;
        }
      } catch (err) {
        lastWriteErr = err;
      }
    }

    if (!writtenUri) {
      throw new Error(
        `फ़ाइल सेव करने में समस्या आई: ${lastWriteErr?.message || 'Storage permission / write failed'}`
      );
    }

    if (isPdf) {
      notifyPdfDownloaded({
        id: `${Date.now()}-${safeFilename}`,
        filename: safeFilename,
        title,
        text,
        mimeType,
        contentUri: writtenUri,
        savedInDownloads: false,
        locationLabel: safeFilename,
        previewPages,
        isNative: true,
      });
      return;
    }

    try {
      await Share.share({
        title,
        text,
        url: writtenUri,
        dialogTitle,
      });
    } catch (shareErr: any) {
      if (isShareCancelError(shareErr)) {
        return;
      }
      try {
        await Share.share({
          title,
          text,
          files: [writtenUri],
          dialogTitle,
        });
        return;
      } catch (retryErr: any) {
        if (isShareCancelError(retryErr)) {
          return;
        }
        throw new Error(
          `रिपोर्ट शेयर/डाउनलोड करने में त्रुटि: ${retryErr?.message || shareErr?.message || 'Share failed'}`
        );
      }
    }
    return;
  }

  // Standard Web Browser download (no external tab redirect)
  const blob =
    encoding === 'base64'
      ? base64ToBlob(content, mimeType)
      : new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.rel = 'noopener';
  link.style.display = 'none';
  link.setAttribute('download', safeFilename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  if (isPdf) {
    notifyPdfDownloaded({
      id: `${Date.now()}-${safeFilename}`,
      filename: safeFilename,
      title,
      text,
      mimeType,
      blobUrl: url,
      savedInDownloads: true,
      locationLabel: safeFilename,
      previewPages,
      isNative: false,
    });
  } else {
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
}

function base64ToBlob(base64: string, mimeType: string): Blob {
  const byteCharacters = atob(base64);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  return new Blob([byteArray], { type: mimeType });
}

export async function shareNativeTextNotice(title: string, text: string, url?: string): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  try {
    await Share.share({
      title,
      text,
      ...(url ? { url } : {}),
      dialogTitle: title,
    });
    return true;
  } catch (err) {
    if (isShareCancelError(err)) return true;
    return false;
  }
}
