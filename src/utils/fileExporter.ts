import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

export interface ExportFileOptions {
  filename: string;
  content: string;
  mimeType: string;
  title?: string;
  text?: string;
  dialogTitle?: string;
  encoding?: 'utf8' | 'base64';
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
 * Never uses broken `blob:` `<a download>` links inside native Android WebView.
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
  } = options;

  if (Capacitor.isNativePlatform()) {
    const candidateDirs: Directory[] = [
      Directory.Cache,
      Directory.Data,
      Directory.Documents,
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

    try {
      await Share.share({
        title,
        text,
        url: writtenUri,
        dialogTitle,
      });
    } catch (shareErr: any) {
      if (isShareCancelError(shareErr)) {
        return; // User closed the share sheet intentionally; not an error
      }
      // Retry with files array for stricter Android Share intents
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

  // Standard Web Browser download
  const blob =
    encoding === 'base64'
      ? base64ToBlob(content, mimeType)
      : new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', safeFilename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
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
