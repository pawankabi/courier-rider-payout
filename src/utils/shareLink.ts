/**
 * Application Sharing Link Utilities
 */

export const getRiderAppUrl = () => 'https://courier-rider-payout.vercel.app/#cod-entry';

export const getBaseUrl = (): string => {
  if (typeof window !== 'undefined' && window.location?.hostname?.includes('vercel.app')) {
    return window.location.origin;
  }
  return 'https://courier-rider-payout.vercel.app';
};

export const getRiderStatementUrl = (riderId: string): string => {
  const cleanId = encodeURIComponent((riderId || '').trim());
  const baseUrl = typeof window !== 'undefined' && window.location?.hostname?.includes('vercel.app')
    ? window.location.origin
    : 'https://courier-rider-payout.vercel.app';
  return `${baseUrl}/#/statement/${cleanId}`;
};

export const getAppShareUrl = (): string => {
  return 'https://courier-rider-payout.vercel.app';
};

export const PRODUCTION_DOMAIN = 'https://courier-rider-payout.vercel.app';
export const SHARED_APP_URL = PRODUCTION_DOMAIN;

export const SHARE_SUCCESS_MESSAGE = 'App Link copied to clipboard! Share this with your team.';

/**
 * Copies the clean app preview URL to clipboard with fallback.
 */
export async function copyAppShareLink(customUrl?: string): Promise<boolean> {
  const url = customUrl || 'https://courier-rider-payout.vercel.app/#cod-entry';
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(url);
      return true;
    }
  } catch (e) {
    console.warn('Clipboard write failed, attempting fallback', e);
  }

  // Fallback for older browsers / iframe security boundaries
  try {
    const textArea = document.createElement('textarea');
    textArea.value = url;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    const successful = document.execCommand('copy');
    document.body.removeChild(textArea);
    return successful;
  } catch (err) {
    console.error('Fallback copy failed', err);
    return false;
  }
}
