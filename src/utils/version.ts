/**
 * Centralized Application Version Management & GitHub Release Auto-Discovery
 */

export const APP_VERSION = '1.0.10';
export const DEFAULT_GITHUB_REPO = 'pawankabi/courier-rider-payout';

/**
 * Automatically queries GitHub Releases API to discover the latest published version tag.
 * Falls back to localStorage cache, then APP_VERSION.
 */
export async function fetchLatestReleaseVersion(): Promise<string> {
  if (typeof window === 'undefined') return APP_VERSION;

  try {
    const cached = localStorage.getItem('cp_latest_github_version');
    const lastCheck = Number(localStorage.getItem('cp_latest_github_version_time') || 0);
    const now = Date.now();

    // Re-check GitHub API if cache is older than 5 minutes
    if (cached && now - lastCheck < 5 * 60 * 1000) {
      return cached;
    }

    const repo = (import.meta.env.VITE_GITHUB_REPO || DEFAULT_GITHUB_REPO).trim();
    const res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
      headers: { Accept: 'application/vnd.github.v3+json' },
    });

    if (res.ok) {
      const data = await res.json();
      const rawTag = data.tag_name || data.name || '';
      const cleanTag = rawTag.replace(/^v/i, '').trim();
      if (cleanTag) {
        localStorage.setItem('cp_latest_github_version', cleanTag);
        localStorage.setItem('cp_latest_github_version_time', String(now));
        return cleanTag;
      }
    }
  } catch (err) {
    console.warn('GitHub releases API auto-discovery notice:', err);
  }

  return localStorage.getItem('cp_latest_github_version') || APP_VERSION;
}

export function getCachedReleaseVersion(): string {
  if (typeof window === 'undefined') return APP_VERSION;
  try {
    return localStorage.getItem('cp_latest_github_version') || APP_VERSION;
  } catch {
    return APP_VERSION;
  }
}
