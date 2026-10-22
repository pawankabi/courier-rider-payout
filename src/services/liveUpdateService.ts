/**
 * Super-Powered In-App Live Cloud Sync & OTA Engine
 * Enables seamless in-app background update detection, manual 1-click feature sync,
 * and zero-reinstall updates without ever needing to re-download APKs.
 */

type UpdateListener = (available: boolean) => void;

class LiveUpdateService {
  private updateAvailable = false;
  private listeners: Set<UpdateListener> = new Set();
  private swRegistration: ServiceWorkerRegistration | null = null;
  private isChecking = false;

  constructor() {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      this.initServiceWorkerListener();
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

  private notifyUpdateAvailable() {
    this.updateAvailable = true;
    this.listeners.forEach((listener) => listener(true));
  }

  public subscribe(listener: UpdateListener): () => void {
    this.listeners.add(listener);
    // Call immediately with current state
    listener(this.updateAvailable);
    return () => this.listeners.delete(listener);
  }

  public isUpdateAvailable(): boolean {
    return this.updateAvailable;
  }

  /**
   * Manually checks server for the newest build.
   * Resolves to true if new update is found, false if already up-to-date.
   */
  public async checkForUpdate(): Promise<boolean> {
    if (this.isChecking) return this.updateAvailable;
    this.isChecking = true;

    try {
      if (!('serviceWorker' in navigator)) {
        return false;
      }

      const reg = this.swRegistration || (await navigator.serviceWorker.getRegistration());
      if (!reg) {
        return false;
      }

      await reg.update();

      if (reg.waiting) {
        this.notifyUpdateAvailable();
        return true;
      }

      return this.updateAvailable;
    } catch (err) {
      console.warn('Check update notice:', err);
      return false;
    } finally {
      this.isChecking = false;
    }
  }

  /**
   * Applies update immediately by posting SKIP_WAITING to the waiting service worker
   * or refreshing the page with clean cache.
   */
  public applyUpdate() {
    if (this.swRegistration && this.swRegistration.waiting) {
      this.swRegistration.waiting.postMessage({ type: 'SKIP_WAITING' });
    }
    // Hard refresh to immediately activate new code
    setTimeout(() => {
      window.location.reload();
    }, 200);
  }
}

export const liveUpdateService = new LiveUpdateService();
