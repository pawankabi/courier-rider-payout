/**
 * Application Sharing & Preview Link Utilities
 * Provides the dedicated, clean shared preview link for team access and delivery rider fleet.
 */

export const SHARED_APP_URL = 'https://ais-pre-2ld7nak662g7pg4ixrragv-515426382523.asia-east1.run.app';

export const SHARE_SUCCESS_MESSAGE = 'App Link copied to clipboard! Share this with your team.';

/**
 * Returns the cleanest direct web app preview link.
 * Prioritizes the production/standalone preview URL or clean origin.
 */
export function getAppShareUrl(): string {
  if (typeof window !== 'undefined' && window.location) {
    const origin = window.location.origin;
    // If running in production preview domain
    if (origin && (origin.includes('ais-pre') || (!origin.includes('localhost') && !origin.includes('127.0.0.1') && !origin.includes('ais-dev')))) {
      return origin;
    }
  }
  return SHARED_APP_URL;
}

/**
 * Copies the clean app preview URL to clipboard with fallback.
 */
export async function copyAppShareLink(): Promise<boolean> {
  const url = getAppShareUrl();
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
