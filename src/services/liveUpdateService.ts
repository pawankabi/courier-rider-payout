/**
 * Super-Powered In-App Live Cloud Sync & OTA Engine
 * Enables seamless in-app background update detection, manual 1-click feature sync,
 * and zero-reinstall updates without ever needing to re-download APKs.
 */

export const CLOUD_LIVE_BASE_URL = 'https://ais-pre-2ld7nak662g7pg4ixrragv-515426382523.asia-east1.run.app';
export const CURRENT_LOCAL_BUILD_TIME = 1729596000000;
export const CURRENT_LOCAL_VERSION = '1.0.6';

type UpdateListener = (available: boolean, details?: { version?: string; releaseNotes?: string }) => void;

interface CloudVersionManifest {
  version: string;
  buildTime: number;
  buildDate: string;
  releaseNotes?: string;
}

class LiveUpdateService {
  private updateAvailable = false;
  private latestManifest: CloudVersionManifest | null = null;
  private listeners: Set<UpdateListener> = new Set();
  private swRegistration: ServiceWorkerRegistration | null = null;
  private isChecking = false;
  private lastCheckTime = 0;

  constructor() {
    if (typeof window !== 'undefined') {
      if ('serviceWorker' in navigator) {
        this.initServiceWorkerListener();
      }

      // Check if running inside local Android WebView or localhost
      const isLocalOrigin = 
        window.location.origin.includes('firebaseapp.com') || 
        window.location.origin.includes('localhost') || 
        window.location.protocol === 'file:' || 
        !!(window as any).Capacitor?.isNativePlatform?.();

      // If user has active internet and previously opted for live streaming, resume live session automatically
      if (isLocalOrigin && navigator.onLine && localStorage.getItem('cp_streamed_live') === 'true') {
        setTimeout(() => {
          this.applyUpdate();
        }, 350);
      } else {
        // Auto-check for updates after 2 seconds of startup, without blocking initial render
        setTimeout(() => {
          this.checkForUpdate().catch(() => {});
        }, 2000);
      }
    }
  }

  private initServiceWorkerListener() {
    window.addEventListener('load', async () => {
      try {
        const registration = await navigator.serviceWorker.getRegistration();
        if (registration) {
          this.setRegistration(registration);
        }
      } catch (err) {
        console.warn('LiveUpdateService init notice:', err);
      }
    });

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      // New service worker activated: reload smoothly
      window.location.reload();
    });
  }

  public setRegistration(reg: ServiceWorkerRegistration) {
    this.swRegistration = reg;

    // Check if there is already a waiting worker
    if (reg.waiting) {
      this.notifyUpdateAvailable();
    }

    // Listen for state changes on installing worker
    reg.addEventListener('updatefound', () => {
      const installingWorker = reg.installing;
      if (!installingWorker) return;

      installingWorker.addEventListener('statechange', () => {
        if (installingWorker.state === 'installed') {
          if (navigator.serviceWorker.controller) {
            // New content is available; notify user
            this.notifyUpdateAvailable();
          }
        }
      });
    });
  }

  private notifyUpdateAvailable(manifest?: CloudVersionManifest) {
    this.updateAvailable = true;
    if (manifest) {
      this.latestManifest = manifest;
    }
    this.listeners.forEach((listener) => 
      listener(true, {
        version: manifest?.version || 'Latest',
        releaseNotes: manifest?.releaseNotes
      })
    );
  }

  public subscribe(listener: UpdateListener): () => void {
    this.listeners.add(listener);
    // Call immediately with current state
    listener(this.updateAvailable, {
      version: this.latestManifest?.version,
      releaseNotes: this.latestManifest?.releaseNotes
    });
    return () => this.listeners.delete(listener);
  }

  public isUpdateAvailable(): boolean {
    return this.updateAvailable;
  }

  public getLatestManifest(): CloudVersionManifest | null {
    return this.latestManifest;
  }

  /**
   * Comprehensive OTA Cloud Update Check:
   * 1. Direct Cloud Run Version Manifest Probe (bypasses local WebView asset cache)
   * 2. ServiceWorker registration check
   * Resolves to true if new update is found, false if already up-to-date.
   */
  public async checkForUpdate(force = false): Promise<boolean> {
    const now = Date.now();
    if (!force && this.isChecking) return this.updateAvailable;
    if (!force && now - this.lastCheckTime < 10000) return this.updateAvailable; // Throttle 10s

    this.isChecking = true;
    this.lastCheckTime = now;

    try {
      // 1. First probe the live Cloud Version Manifest via HTTP fetch with cache-busting
      const targetUrls = [
        `${CLOUD_LIVE_BASE_URL}/version.json?_t=${now}`,
        `/version.json?_t=${now}`
      ];

      let cloudManifest: CloudVersionManifest | null = null;

      for (const url of targetUrls) {
        try {
          const res = await fetch(url, {
            cache: 'no-store',
            headers: { 'Accept': 'application/json' },
            signal: AbortSignal.timeout(5000)
          });
          if (res.ok) {
            const data = await res.json();
            if (data && typeof data.buildTime === 'number') {
              cloudManifest = data as CloudVersionManifest;
              break;
            }
          }
        } catch {
          // Try next target URL
        }
      }

      const storedBuildTimeStr = typeof localStorage !== 'undefined' ? localStorage.getItem('cp_active_build_time') : null;
      const currentActiveBuildTime = storedBuildTimeStr ? parseInt(storedBuildTimeStr, 10) : CURRENT_LOCAL_BUILD_TIME;

      if (cloudManifest && cloudManifest.buildTime > currentActiveBuildTime) {
        this.notifyUpdateAvailable(cloudManifest);
        return true;
      }

      // 2. Service Worker check
      if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
        const reg = this.swRegistration || (await navigator.serviceWorker.getRegistration());
        if (reg) {
          await reg.update().catch(() => {});
          if (reg.waiting) {
            this.notifyUpdateAvailable();
            return true;
          }
        }
      }

      return this.updateAvailable;
    } catch (err) {
      console.warn('Check live cloud update notice:', err);
      return false;
    } finally {
      this.isChecking = false;
    }
  }

  /**
   * Applies update immediately:
   * - In Service Worker environment: posts SKIP_WAITING and reloads with clean cache
   * - In Capacitor Hybrid environment: smoothly streams latest live cloud URL while retaining local offline backup
   */
  public applyUpdate() {
    if (this.latestManifest) {
      try {
        localStorage.setItem('cp_active_build_time', String(this.latestManifest.buildTime));
        localStorage.setItem('cp_active_version', this.latestManifest.version);
      } catch {}
    }

    try {
      localStorage.setItem('cp_streamed_live', 'true');
    } catch {}

    if (this.swRegistration && this.swRegistration.waiting) {
      this.swRegistration.waiting.postMessage({ type: 'SKIP_WAITING' });
    }

    // Check if we are running in an Android Capacitor WebView pointing to local assets
    const isLocalCapacitorOrigin = 
      typeof window !== 'undefined' && 
      (window.location.origin.includes('firebaseapp.com') || 
       window.location.origin.includes('localhost') || 
       window.location.protocol === 'file:' ||
       !!(window as any).Capacitor?.isNativePlatform?.());

    if (isLocalCapacitorOrigin) {
      // Determine if current app is companion rider or main admin
      const isCompanion = 
        window.location.href.includes('cod-entry') || 
        (typeof localStorage !== 'undefined' && localStorage.getItem('cp_last_portal') === 'companion') ||
        (import.meta.env.VITE_APP_TARGET === 'cod_companion') ||
        (typeof window !== 'undefined' && window.location.hostname.includes('cod-entry-rider'));

      const liveTarget = isCompanion 
        ? `${CLOUD_LIVE_BASE_URL}/?app=cod-entry&live=1` 
        : `${CLOUD_LIVE_BASE_URL}/?live=1`;

      // Smoothly navigate to live cloud URL
      window.location.replace(liveTarget);
      return;
    }

    // Hard refresh to immediately activate new code
    setTimeout(() => {
      window.location.reload();
    }, 200);
  }
}

export const liveUpdateService = new LiveUpdateService();
