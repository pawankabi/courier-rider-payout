/**
 * Super-Powered In-App Live Cloud Sync & OTA Engine
 * Enables seamless in-app background update detection, manual 1-click feature sync,
 * and zero-reinstall updates without ever needing to re-download APKs.
 * 
 * STRICT RULES:
 * 1. The update banner ONLY shows if a genuine NEW build exists on the cloud.
 * 2. If user clicks (X), it dismisses ONLY FOR TODAY (that date).
 *    On the NEXT DAY, if still not updated, the banner appears again as a daily reminder!
 * 3. Once user clicks "⚡ 1-क्लिक अपडेट (Apply)" and update is applied,
 *    it is marked as applied and NEVER shows again for that version.
 */

import { doc, getDoc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../firebase';

export const CLOUD_LIVE_BASE_URL = 'https://ais-pre-2ld7nak662g7pg4ixrragv-515426382523.asia-east1.run.app';
export const CURRENT_LOCAL_BUILD_TIME = 1729600000000; // Local baseline (older than v1.0.8 cloud build 1729705000000)
export const CURRENT_LOCAL_VERSION = '1.0.7';

type UpdateListener = (available: boolean, details?: { version?: string; releaseNotes?: string }) => void;

export interface CloudVersionManifest {
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

      // Direct Firebase Firestore Realtime Update Listener (Works 100% on native Android APKs)
      try {
        onSnapshot(
          doc(db, 'app_updates', 'latest'),
          (snap) => {
            if (snap.exists()) {
              const data = snap.data();
              if (data && typeof data.buildTime === 'number') {
                this.handleManifestDiscovered(data as CloudVersionManifest);
              }
            }
          },
          () => {}
        );
      } catch {}

      // Auto-check for updates after 2.5 seconds of startup, without blocking initial render
      setTimeout(() => {
        this.checkForUpdate().catch(() => {});
      }, 2500);
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
            this.notifyUpdateAvailable();
          }
        }
      });
    });
  }

  public handleManifestDiscovered(manifest: CloudVersionManifest, force = false) {
    if (typeof window === 'undefined') return;

    const todayDate = new Date().toISOString().split('T')[0];
    const dismissedDate = localStorage.getItem('cp_dismissed_update_date');
    const appliedVersion = localStorage.getItem('cp_applied_version');

    // 1. If this exact version was already successfully applied, do not show banner
    if (appliedVersion === manifest.version) {
      this.clearUpdateAvailable();
      return;
    }

    // 2. Check if cloud has a newer build than the currently compiled local code
    if (manifest.buildTime > CURRENT_LOCAL_BUILD_TIME) {
      // 3. User Rule: If dismissed with 'X', hide ONLY for today (same calendar date).
      // On the NEXT DAY, if still not updated, the banner appears again!
      if (!force && dismissedDate === todayDate) {
        this.clearUpdateAvailable();
        return;
      }

      this.notifyUpdateAvailable(manifest);
    } else {
      this.clearUpdateAvailable();
    }
  }

  private notifyUpdateAvailable(manifest?: CloudVersionManifest) {
    this.updateAvailable = true;
    if (manifest) {
      this.latestManifest = manifest;
    }
    this.listeners.forEach((listener) => 
      listener(true, {
        version: manifest?.version || this.latestManifest?.version || 'Latest',
        releaseNotes: manifest?.releaseNotes || this.latestManifest?.releaseNotes
      })
    );
  }

  public clearUpdateAvailable() {
    this.updateAvailable = false;
    this.listeners.forEach((listener) => listener(false));
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
   * Dismiss the update banner for TODAY ONLY:
   * Saves today's date (YYYY-MM-DD) so it won't badger the user for the rest of today.
   * On the NEXT DAY, it will automatically show up again until the user applies the update!
   */
  public dismissUpdate() {
    this.updateAvailable = false;
    this.clearUpdateAvailable();
    try {
      const todayDate = new Date().toISOString().split('T')[0];
      localStorage.setItem('cp_dismissed_update_date', todayDate);
    } catch {}
  }

  /**
   * Comprehensive OTA Cloud Update Check:
   * 1. Direct Firebase Firestore probe (works 100% across native Android APKs & web)
   * 2. Direct Cloud Run Version Manifest Probe
   * 3. ServiceWorker registration check
   * Resolves to true ONLY if a newer build exists on cloud.
   */
  public async checkForUpdate(force = false): Promise<boolean> {
    const now = Date.now();
    if (!force && this.isChecking) return this.updateAvailable;
    if (!force && now - this.lastCheckTime < 8000) return this.updateAvailable; // Throttle 8s

    this.isChecking = true;
    this.lastCheckTime = now;

    try {
      let cloudManifest: CloudVersionManifest | null = null;

      // Probe A: Direct Firebase Firestore (Fastest & 100% reliable on native Android)
      try {
        const snap = await getDoc(doc(db, 'app_updates', 'latest'));
        if (snap.exists()) {
          const data = snap.data();
          if (data && typeof data.buildTime === 'number') {
            cloudManifest = data as CloudVersionManifest;
          }
        }
      } catch {}

      // Probe B: HTTP Version.json fallback
      if (!cloudManifest) {
        const targetUrls = [
          `${CLOUD_LIVE_BASE_URL}/version.json?_t=${now}`,
          `/version.json?_t=${now}`
        ];

        for (const url of targetUrls) {
          try {
            const res = await fetch(url, {
              cache: 'no-store',
              headers: { 'Accept': 'application/json' },
              signal: AbortSignal.timeout(4000)
            });
            if (res.ok) {
              const data = await res.json();
              if (data && typeof data.buildTime === 'number') {
                cloudManifest = data as CloudVersionManifest;
                break;
              }
            }
          } catch {}
        }
      }

      if (cloudManifest) {
        this.handleManifestDiscovered(cloudManifest, force);
        return this.updateAvailable;
      } else {
        this.clearUpdateAvailable();
        return false;
      }
    } catch (err) {
      console.warn('Check live cloud update notice:', err);
      return false;
    } finally {
      this.isChecking = false;
    }
  }

  /**
   * Applies update immediately:
   * 1. Marks current version as applied in localStorage so banner never shows again for this version.
   * 2. Clears today's dismissal date.
   * 3. Clears the update banner immediately from the UI.
   * 4. Triggers Service Worker skip waiting & cache reload.
   */
  public applyUpdate() {
    const targetBuildTime = this.latestManifest ? this.latestManifest.buildTime : CURRENT_LOCAL_BUILD_TIME;
    const targetVersion = this.latestManifest ? this.latestManifest.version : CURRENT_LOCAL_VERSION;

    try {
      localStorage.setItem('cp_active_build_time', String(targetBuildTime));
      localStorage.setItem('cp_active_version', targetVersion);
      localStorage.setItem('cp_applied_version', targetVersion);
      localStorage.removeItem('cp_dismissed_update_date');
      localStorage.setItem('cp_streamed_live', 'true');
    } catch {}

    // Immediately remove banner from the UI so it never lingers
    this.clearUpdateAvailable();

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
      const isCompanion = 
        window.location.href.includes('cod-entry') || 
        (typeof localStorage !== 'undefined' && localStorage.getItem('cp_last_portal') === 'companion') ||
        (import.meta.env.VITE_APP_TARGET === 'cod_companion') ||
        (typeof window !== 'undefined' && window.location.hostname.includes('cod-entry-rider'));

      const liveTarget = isCompanion 
        ? `${CLOUD_LIVE_BASE_URL}/?app=cod-entry&live=1` 
        : `${CLOUD_LIVE_BASE_URL}/?live=1`;

      window.location.replace(liveTarget);
      return;
    }

    // Refresh smoothly with fresh cache
    setTimeout(() => {
      window.location.reload();
    }, 250);
  }
}

/**
 * Ensures the latest build manifest is synced to Firestore for zero-latency detection across all mobile apps
 */
export async function syncLatestManifestToFirestore(): Promise<void> {
  try {
    const updateData = {
      version: '1.0.8',
      buildTime: 1729705000000,
      buildDate: new Date().toISOString().split('T')[0],
      releaseNotes: '15-Minute Inactivity/Screen-Off Fingerprint App Lock, Android Stability Fix, Zero-Reinstall OTA Update',
      updatedAt: new Date().toISOString(),
    };
    await setDoc(doc(db, 'app_updates', 'latest'), updateData, { merge: true });
  } catch {}
}

export const liveUpdateService = new LiveUpdateService();
