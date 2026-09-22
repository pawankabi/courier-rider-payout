import { Auth } from 'firebase/auth';

type ConnectionState = 'connected' | 'connecting' | 'offline';

interface KeepAliveOptions {
  auth?: Auth | null;
  onStateChange?: (state: ConnectionState) => void;
  onWakeup?: () => void;
  pingIntervalMs?: number; // default 3 minutes (180000ms)
}

/**
 * Auto-keepalive & idle-recovery service.
 * Solves Cloud Run cold-starts, mobile sleep, and silent network timeouts
 * when reopening PWA after hours of inactivity.
 */
export function initKeepAlive({
  auth,
  onStateChange,
  onWakeup,
  pingIntervalMs = 180000,
}: KeepAliveOptions = {}): () => void {
  let isDestroyed = false;
  let timerId: ReturnType<typeof setInterval> | null = null;
  let lastActiveTime = Date.now();

  const pingServer = async () => {
    if (isDestroyed || !navigator.onLine) {
      onStateChange?.('offline');
      return;
    }

    try {
      onStateChange?.('connecting');
      // If user is authenticated, refresh token if it's nearing expiry or after inactivity
      if (auth?.currentUser) {
        const timeSinceLastActive = Date.now() - lastActiveTime;
        // If inactive for more than 15 minutes, force token refresh
        if (timeSinceLastActive > 15 * 60 * 1000) {
          await auth.currentUser.getIdToken(true).catch(() => {});
        }
      }

      // Lightweight ping to root or API to keep container warm
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);

      await fetch('/icon.svg', {
        method: 'HEAD',
        cache: 'no-store',
        signal: controller.signal,
      }).catch(() => {});

      clearTimeout(timeoutId);
      lastActiveTime = Date.now();
      if (!isDestroyed) {
        onStateChange?.('connected');
      }
    } catch {
      if (!isDestroyed) {
        onStateChange?.(navigator.onLine ? 'connected' : 'offline');
      }
    }
  };

  // Handle visibility change: user wakes up device or switches back to PWA tab
  const handleVisibilityChange = async () => {
    if (document.visibilityState === 'visible') {
      const now = Date.now();
      const idleDuration = now - lastActiveTime;
      lastActiveTime = now;

      // If app was in background for more than 30 seconds, trigger wake-up recovery
      if (idleDuration > 30000) {
        onWakeup?.();
        await pingServer();
      }
    }
  };

  const handleOnline = () => {
    onStateChange?.('connecting');
    pingServer().then(() => {
      onWakeup?.();
    });
  };

  const handleOffline = () => {
    onStateChange?.('offline');
  };

  // Attach event listeners
  document.addEventListener('visibilitychange', handleVisibilityChange);
  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);

  // Periodic keepalive interval
  timerId = setInterval(pingServer, pingIntervalMs);

  // Initial lightweight check
  pingServer();

  return () => {
    isDestroyed = true;
    if (timerId) clearInterval(timerId);
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
  };
}
