/**
 * Application Sharing Link Utilities
 */

export const PRODUCTION_DOMAIN = 'https://courier-rider-payout.vercel.app';
export const SHARED_APP_URL = PRODUCTION_DOMAIN;

export const getBaseUrl = (): string => {
  if (typeof window !== 'undefined' && window.location) {
    const origin = window.location.origin || '';
    const hostname = (window.location.hostname || '').toLowerCase();

    // If currently accessed from official vercel deployment:
    if (hostname.includes('vercel.app')) {
      return origin;
    }

    // Exclude development sandboxes, local hosts, and Firebase staging / default hosting domains
    // that cause 404 Site Not Found when sent in SMS:
    if (
      !hostname.includes('firebaseapp.com') &&
      !hostname.includes('web.app') &&
      !hostname.includes('run.app') &&
      !hostname.includes('localhost') &&
      !hostname.includes('127.0.0.1') &&
      hostname !== ''
    ) {
      return origin;
    }
  }
  return PRODUCTION_DOMAIN;
};

/**
 * Ensures any statement URL or message text is sanitized so that any broken
 * firebaseapp.com, web.app, or dev origin links are replaced with the live production Vercel URL.
 */
export function ensureProductionStatementUrl(urlOrText?: string): string {
  if (!urlOrText) return `${PRODUCTION_DOMAIN}/#/statement/`;
  return urlOrText
    .replace(/https?:\/\/[a-zA-Z0-9.-]*firebaseapp\.com/gi, PRODUCTION_DOMAIN)
    .replace(/https?:\/\/[a-zA-Z0-9.-]*web\.app/gi, PRODUCTION_DOMAIN)
    .replace(/https?:\/\/[a-zA-Z0-9.-]*run\.app/gi, PRODUCTION_DOMAIN)
    .replace(/https?:\/\/localhost(:\d+)?/gi, PRODUCTION_DOMAIN)
    .replace(/https?:\/\/127\.0\.0\.1(:\d+)?/gi, PRODUCTION_DOMAIN);
}

export const getRiderAppUrl = (): string => {
  return `${getBaseUrl()}/#cod-entry`;
};

export const DEFAULT_GITHUB_REPO = 'pawankabi/courier-rider-payout';
export const RIDER_APK_FILENAME = 'COD-Entry-Rider-Release.apk';
export const ADMIN_APK_FILENAME = 'Admin-Payout-Release.apk';

export const RIDER_GITHUB_RELEASE_URL = `https://github.com/${DEFAULT_GITHUB_REPO}/releases/latest/download/${RIDER_APK_FILENAME}`;
export const RIDER_LOCAL_FALLBACK_URL = `/downloads/${RIDER_APK_FILENAME}`;

export const ADMIN_GITHUB_RELEASE_URL = `https://github.com/${DEFAULT_GITHUB_REPO}/releases/latest/download/${ADMIN_APK_FILENAME}`;
export const ADMIN_LOCAL_FALLBACK_URL = `/downloads/${ADMIN_APK_FILENAME}`;
export const ADMIN_VERCEL_DOWNLOAD_URL = `${PRODUCTION_DOMAIN}/download-admin`;

export const getRiderGithubReleaseUrl = (repo: string = DEFAULT_GITHUB_REPO): string => {
  const targetRepo = (import.meta.env.VITE_GITHUB_REPO || repo || DEFAULT_GITHUB_REPO).trim();
  return `https://github.com/${targetRepo}/releases/latest/download/${RIDER_APK_FILENAME}`;
};

export const getAdminGithubReleaseUrl = (repo: string = DEFAULT_GITHUB_REPO): string => {
  const targetRepo = (import.meta.env.VITE_GITHUB_REPO || repo || DEFAULT_GITHUB_REPO).trim();
  return `https://github.com/${targetRepo}/releases/latest/download/${ADMIN_APK_FILENAME}`;
};

/**
 * Explicit Rider Companion APK Release URL
 * Hard-bound to official GitHub Release asset: COD-Entry-Rider-Release.apk
 */
export const getRiderApkDownloadUrl = (): string => {
  return getRiderGithubReleaseUrl();
};

/**
 * Explicit Admin Payout Hub APK Release URL
 * Hard-bound to official GitHub Release asset: Admin-Payout-Release.apk
 */
export const getAdminApkDownloadUrl = (): string => {
  return getAdminGithubReleaseUrl();
};

/**
 * Directly downloads the Rider APK (COD-Entry-Rider-Release.apk).
 * Points directly to the release asset:
 * https://github.com/pawankabi/courier-rider-payout/releases/latest/download/COD-Entry-Rider-Release.apk
 * Also supports the local fallback /downloads/COD-Entry-Rider-Release.apk
 * so that if GitHub latest release tag is still building (returns 404),
 * it initiates the download immediately without throwing a 404 error page.
 *
 * Strict Rule: Must directly trigger file download — DO NOT redirect to the web login or portal URL.
 */
export async function downloadRiderApk(customFilename?: string): Promise<string> {
  const filename = customFilename || RIDER_APK_FILENAME;
  const primaryUrl = getRiderGithubReleaseUrl();
  const fallbackUrl = RIDER_LOCAL_FALLBACK_URL;

  const triggerDownload = (targetUrl: string) => {
    const link = document.createElement('a');
    link.href = targetUrl;
    link.setAttribute('download', filename);
    if (targetUrl.startsWith('http')) {
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
    }
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
      if (document.body.contains(link)) {
        document.body.removeChild(link);
      }
    }, 200);
  };

  try {
    // Quickly verify if GitHub latest release asset is published and not 404
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2000);
    const repoMatch = primaryUrl.match(/github\.com\/([^/]+\/[^/]+)/);
    const repoPath = repoMatch ? repoMatch[1] : DEFAULT_GITHUB_REPO;
    const apiUrl = `https://api.github.com/repos/${repoPath}/releases/latest`;

    const response = await fetch(apiUrl, { signal: controller.signal });
    clearTimeout(timer);

    if (response.ok) {
      const data = await response.json();
      const hasAsset = Array.isArray(data?.assets) && data.assets.some(
        (a: any) => a?.name === filename || (a?.name && a.name.toLowerCase().includes('rider') && a.name.endsWith('.apk'))
      );
      if (hasAsset) {
        triggerDownload(primaryUrl);
        return primaryUrl;
      }
    }
    // If GitHub latest release is 404 or tag still building, initiate local APK fallback immediately
    console.warn(`GitHub release asset not yet available (HTTP ${response?.status || 'unknown'}). Initiating local APK fallback.`);
    triggerDownload(fallbackUrl);
    return fallbackUrl;
  } catch (err) {
    // In case of timeout or offline, trigger primary directly
    console.warn('Network release check completed, initiating APK release download:', err);
    triggerDownload(primaryUrl);
    return primaryUrl;
  }
}

/**
 * Directly downloads the Admin APK (Admin-Payout-Release.apk) with local fallback.
 */
export async function downloadAdminApk(customFilename?: string): Promise<string> {
  const filename = customFilename || ADMIN_APK_FILENAME;
  const primaryUrl = getAdminGithubReleaseUrl();
  const fallbackUrl = ADMIN_LOCAL_FALLBACK_URL;

  const triggerDownload = (targetUrl: string) => {
    const link = document.createElement('a');
    link.href = targetUrl;
    link.setAttribute('download', filename);
    if (targetUrl.startsWith('http')) {
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
    }
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
      if (document.body.contains(link)) {
        document.body.removeChild(link);
      }
    }, 200);
  };

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2000);
    const repoMatch = primaryUrl.match(/github\.com\/([^/]+\/[^/]+)/);
    const repoPath = repoMatch ? repoMatch[1] : DEFAULT_GITHUB_REPO;
    const apiUrl = `https://api.github.com/repos/${repoPath}/releases/latest`;

    const response = await fetch(apiUrl, { signal: controller.signal });
    clearTimeout(timer);

    if (response.ok) {
      const data = await response.json();
      const hasAsset = Array.isArray(data?.assets) && data.assets.some(
        (a: any) => a?.name === filename || (a?.name && a.name.toLowerCase().includes('admin') && a.name.endsWith('.apk'))
      );
      if (hasAsset) {
        triggerDownload(primaryUrl);
        return primaryUrl;
      }
    }
    triggerDownload(fallbackUrl);
    return fallbackUrl;
  } catch {
    triggerDownload(primaryUrl);
    return primaryUrl;
  }
}

/**
 * Checks whether the current application context is strictly the Rider App / Flavor.
 */
export function isRiderBuild(): boolean {
  if (typeof window === 'undefined') return false;

  // 1. Direct Build-Time Target Check
  const appTarget = (import.meta.env.VITE_APP_TARGET || '').trim().toLowerCase();
  if (appTarget === 'admin') {
    return false;
  }
  if (appTarget === 'cod_companion' || appTarget === 'companion' || appTarget === 'rider') {
    return true;
  }

  // 2. Android Capacitor Rider Flavor Hostname Check
  const hostname = window.location.hostname || '';
  if (
    hostname === 'cod-entry-rider.firebaseapp.com' ||
    hostname.includes('cod-entry') ||
    hostname.includes('rider-portal')
  ) {
    return true;
  }

  // 3. Hash / Search / Pathname checks
  const hash = window.location.hash || '';
  const search = window.location.search || '';
  const pathname = window.location.pathname || '';

  if (
    hash.includes('cod-entry') ||
    hash.includes('rider-portal') ||
    hash.includes('rider') ||
    pathname.includes('/cod-entry') ||
    pathname.includes('/rider') ||
    search.includes('app=cod-entry') ||
    search.includes('app=rider') ||
    search.includes('cod=entry') ||
    search.includes('target=rider')
  ) {
    return true;
  }

  return false;
}

export const getRiderStatementUrl = (riderId: string): string => {
  const cleanId = encodeURIComponent((riderId || '').trim());
  const baseUrl = getBaseUrl();
  return `${baseUrl}/#/statement/${cleanId}`;
};

export const getAppShareUrl = (): string => {
  return getBaseUrl();
};


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
