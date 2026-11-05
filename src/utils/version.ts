/**
 * Centralized Application Version Management & GitHub Release Auto-Discovery
 */

export const APP_VERSION = '1.0.30';
export const DEFAULT_GITHUB_REPO = 'pawankabi/courier-rider-payout';

function parseSemver(v: string): number[] {
  return (v || '').replace(/^v/i, '').split('.').map((p) => parseInt(p, 10) || 0);
}

function isHigherVersion(v1: string, v2: string): boolean {
  const p1 = parseSemver(v1);
  const p2 = parseSemver(v2);
  for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
    const num1 = p1[i] || 0;
    const num2 = p2[i] || 0;
    if (num1 > num2) return true;
    if (num1 < num2) return false;
  }
  return false;
}

/**
 * Automatically queries GitHub Releases API to discover the latest published version tag.
 * Falls back to localStorage cache if valid and higher than APP_VERSION, otherwise APP_VERSION.
 */
export async function fetchLatestReleaseVersion(): Promise<string> {
  if (typeof window === 'undefined') return APP_VERSION;

  try {
    const cached = localStorage.getItem('cp_latest_github_version');
    const lastCheck = Number(localStorage.getItem('cp_latest_github_version_time') || 0);
    const now = Date.now();

    // Re-check GitHub API if cache is older than 5 minutes or cache is lower than APP_VERSION
    if (cached && now - lastCheck < 5 * 60 * 1000 && !isHigherVersion(APP_VERSION, cached)) {
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
        return isHigherVersion(APP_VERSION, cleanTag) ? APP_VERSION : cleanTag;
      }
    }
  } catch (err) {
    console.warn('GitHub releases API auto-discovery notice:', err);
  }

  const cached = localStorage.getItem('cp_latest_github_version');
  if (cached && isHigherVersion(cached, APP_VERSION)) {
    return cached;
  }
  return APP_VERSION;
}

export function getCachedReleaseVersion(): string {
  if (typeof window === 'undefined') return APP_VERSION;
  try {
    const cached = localStorage.getItem('cp_latest_github_version');
    if (cached && isHigherVersion(cached, APP_VERSION)) {
      return cached;
    }
    return APP_VERSION;
  } catch {
    return APP_VERSION;
  }
}

