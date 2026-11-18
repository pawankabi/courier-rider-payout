import { Capacitor, registerPlugin } from '@capacitor/core';

export interface SaveToDownloadsResult {
  success: boolean;
  contentUri: string;
  filename: string;
  mimeType: string;
  savedInDownloads: boolean;
  locationLabel?: string;
}

export interface OpenFileResult {
  opened: boolean;
  noViewer?: boolean;
}

interface NativeDownloadPluginInterface {
  saveToDownloads(options: {
    filename: string;
    base64Data: string;
    mimeType: string;
  }): Promise<SaveToDownloadsResult>;
  openFile(options: {
    contentUri: string;
    mimeType: string;
  }): Promise<OpenFileResult>;
  shareFile(options: {
    contentUri: string;
    mimeType: string;
    title?: string;
    text?: string;
  }): Promise<{ shared: boolean }>;
}

const NativeDownload = registerPlugin<NativeDownloadPluginInterface>('NativeDownload');

export interface DownloadedPdfPayload {
  id: string;
  filename: string;
  title: string;
  text?: string;
  mimeType: string;
  contentUri?: string;
  blobUrl?: string;
  savedInDownloads: boolean;
  locationLabel: string;
  previewPages?: string[];
  isNative: boolean;
}

export const PDF_DOWNLOADED_EVENT = 'app:pdf-downloaded';

export function notifyPdfDownloaded(payload: DownloadedPdfPayload): void {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new CustomEvent<DownloadedPdfPayload>(PDF_DOWNLOADED_EVENT, { detail: payload }));
  } catch (err) {
    console.warn('Could not dispatch PDF downloaded event:', err);
  }
}

export async function savePdfToDeviceDownloadsNative(options: {
  filename: string;
  base64Data: string;
  mimeType?: string;
}): Promise<SaveToDownloadsResult | null> {
  if (!Capacitor.isNativePlatform()) return null;
  try {
    const res = await NativeDownload.saveToDownloads({
      filename: options.filename,
      base64Data: options.base64Data,
      mimeType: options.mimeType || 'application/pdf',
    });
    if (res?.success && res.contentUri) {
      return res;
    }
    return null;
  } catch (err) {
    console.warn('NativeDownload.saveToDownloads notice:', err);
    return null;
  }
}

export async function openDownloadedPdfNative(contentUri: string, mimeType = 'application/pdf'): Promise<OpenFileResult> {
  if (!Capacitor.isNativePlatform() || !contentUri) {
    return { opened: false, noViewer: true };
  }
  try {
    return await NativeDownload.openFile({ contentUri, mimeType });
  } catch (err) {
    console.warn('NativeDownload.openFile notice:', err);
    return { opened: false, noViewer: true };
  }
}

export async function shareDownloadedPdfNative(options: {
  contentUri: string;
  mimeType?: string;
  title?: string;
  text?: string;
}): Promise<boolean> {
  if (!Capacitor.isNativePlatform() || !options.contentUri) return false;
  try {
    await NativeDownload.shareFile({
      contentUri: options.contentUri,
      mimeType: options.mimeType || 'application/pdf',
      title: options.title,
      text: options.text,
    });
    return true;
  } catch (err) {
    console.warn('NativeDownload.shareFile notice:', err);
    return false;
  }
}
