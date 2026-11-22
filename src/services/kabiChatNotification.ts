import { registerPlugin } from '@capacitor/core';
import { isNativeAndroid } from './nativeSms';
import firebaseConfig from '../../firebase-applet-config.json';
import { UNIFIED_FIRESTORE_DATABASE_ID } from '../firebase';

interface KabiChatNotificationNative {
  checkNotificationPermission(): Promise<{ granted: boolean }>;
  requestNotificationPermission(): Promise<{ granted: boolean }>;
  showMessageNotification(options: {
    senderName: string;
    messageText: string;
    chatId?: string;
    totalUnread: number;
    silent?: boolean;
  }): Promise<{ success: boolean }>;
  clearNotifications(): Promise<{ success: boolean }>;
  configureBackgroundSync(options: {
    hubId: string;
    participantId: string;
    projectId: string;
    databaseId: string;
    apiKey: string;
  }): Promise<{ scheduled: boolean }>;
  clearBackgroundSync(): Promise<{ cleared: boolean }>;
}

const KabiChatNotification = registerPlugin<KabiChatNotificationNative>('KabiChatNotification');

let sharedAudioCtx: AudioContext | null = null;
let audioUnlocked = false;
let baseDocumentTitle: string | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;
    if (!sharedAudioCtx) {
      sharedAudioCtx = new AudioCtx();
    }
    if (sharedAudioCtx.state === 'suspended') {
      sharedAudioCtx.resume().catch(() => {});
    }
    return sharedAudioCtx;
  } catch {
    return null;
  }
}

export function initKabiAudioUnlock(): void {
  if (typeof window === 'undefined' || audioUnlocked) return;
  const unlock = () => {
    audioUnlocked = true;
    getAudioContext();
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('touchstart', unlock);
    window.removeEventListener('keydown', unlock);
  };
  window.addEventListener('pointerdown', unlock, { passive: true });
  window.addEventListener('touchstart', unlock, { passive: true });
  window.addEventListener('keydown', unlock, { passive: true });
}

/**
 * Plays a crisp, pleasant WhatsApp/SMS-style two-tone incoming message chime + subtle vibration.
 */
export function playKabiSmsReceiveTone(): void {
  try {
    const ctx = getAudioContext();
    if (ctx) {
      const now = ctx.currentTime;

      const playBellNote = (freq: number, startOffset: number, duration: number, peakGain: number) => {
        const osc = ctx.createOscillator();
        const harmonic = ctx.createOscillator();
        const gain = ctx.createGain();
        const harmGain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + startOffset);

        harmonic.type = 'triangle';
        harmonic.frequency.setValueAtTime(freq * 2, now + startOffset);

        gain.gain.setValueAtTime(0.0001, now + startOffset);
        gain.gain.exponentialRampToValueAtTime(peakGain, now + startOffset + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + startOffset + duration);

        harmGain.gain.setValueAtTime(0.0001, now + startOffset);
        harmGain.gain.exponentialRampToValueAtTime(peakGain * 0.25, now + startOffset + 0.012);
        harmGain.gain.exponentialRampToValueAtTime(0.0001, now + startOffset + duration * 0.7);

        osc.connect(gain);
        harmonic.connect(harmGain);
        gain.connect(ctx.destination);
        harmGain.connect(ctx.destination);

        osc.start(now + startOffset);
        harmonic.start(now + startOffset);
        osc.stop(now + startOffset + duration + 0.02);
        harmonic.stop(now + startOffset + duration + 0.02);
      };

      // Signature crisp SMS double chime: A5 (880 Hz) -> D6 (1174.66 Hz)
      playBellNote(880, 0, 0.24, 0.22);
      playBellNote(1174.66, 0.13, 0.34, 0.25);
    }
  } catch {
    // Ignore audio context block on locked browsers
  }

  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate([140, 70, 140]);
    }
  } catch {
    // Vibration not available
  }
}

/**
 * Plays a soft subtle pop tone when sending a message.
 */
export function playKabiSmsSendTone(): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(520, now);
    osc.frequency.exponentialRampToValueAtTime(760, now + 0.08);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.09, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.1);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.11);
  } catch {
    // Ignore
  }
}

export async function requestKabiNotificationPermission(): Promise<boolean> {
  if (isNativeAndroid()) {
    try {
      const check = await KabiChatNotification.checkNotificationPermission();
      if (check?.granted) return true;
      const res = await KabiChatNotification.requestNotificationPermission();
      return Boolean(res?.granted);
    } catch {
      return false;
    }
  }
  if (typeof window !== 'undefined' && 'Notification' in window) {
    try {
      if (Notification.permission === 'granted') return true;
      if (Notification.permission === 'denied') return false;
      const perm = await Notification.requestPermission();
      return perm === 'granted';
    } catch {
      return false;
    }
  }
  return false;
}

export async function configureNativeBackgroundChatSync(hubId: string, participantId: string): Promise<void> {
  if (!isNativeAndroid() || !hubId || !participantId) return;
  try {
    await KabiChatNotification.configureBackgroundSync({
      hubId,
      participantId,
      projectId: firebaseConfig.projectId || '',
      databaseId: UNIFIED_FIRESTORE_DATABASE_ID,
      apiKey: firebaseConfig.apiKey || '',
    });
  } catch {
    // Graceful no-op on older APKs without this plugin
  }
}

export async function clearNativeBackgroundChatSync(): Promise<void> {
  if (!isNativeAndroid()) return;
  try {
    await KabiChatNotification.clearBackgroundSync();
  } catch {
    // Ignore
  }
}

export async function syncAppUnreadBadge(totalUnread: number): Promise<void> {
  const safeCount = Math.max(0, Math.floor(totalUnread));

  // 1. Update browser tab title badge cleanly
  if (typeof document !== 'undefined') {
    if (baseDocumentTitle === null) {
      baseDocumentTitle = document.title.replace(/^\(\d+\+?\)\s*/, '');
    }
    if (safeCount > 0) {
      const label = safeCount > 99 ? '99+' : String(safeCount);
      document.title = `(${label}) ${baseDocumentTitle}`;
    } else if (baseDocumentTitle) {
      document.title = baseDocumentTitle;
    }
  }

  // 2. Update PWA / Desktop OS App Icon Badge if supported
  if (typeof navigator !== 'undefined') {
    const navAny = navigator as Navigator & {
      setAppBadge?: (contents?: number) => Promise<void>;
      clearAppBadge?: () => Promise<void>;
    };
    try {
      if (safeCount > 0 && typeof navAny.setAppBadge === 'function') {
        await navAny.setAppBadge(safeCount);
      } else if (safeCount === 0 && typeof navAny.clearAppBadge === 'function') {
        await navAny.clearAppBadge();
      }
    } catch {
      // Unsupported browser badge API
    }
  }

  // 3. Clear native Android system notifications & badge when everything is read
  if (safeCount === 0 && isNativeAndroid()) {
    try {
      await KabiChatNotification.clearNotifications();
    } catch {
      // Ignore
    }
  }
}

export async function triggerIncomingKabiNotification(params: {
  senderName: string;
  messageText: string;
  chatId?: string;
  totalUnread: number;
  playAudioTone: boolean;
  showSystemBanner: boolean;
}): Promise<void> {
  const { senderName, messageText, chatId, totalUnread, playAudioTone, showSystemBanner } = params;

  if (playAudioTone) {
    playKabiSmsReceiveTone();
  }

  await syncAppUnreadBadge(totalUnread);

  if (!showSystemBanner) return;

  if (isNativeAndroid()) {
    try {
      await KabiChatNotification.showMessageNotification({
        senderName,
        messageText,
        chatId: chatId || '',
        totalUnread: Math.max(1, totalUnread),
        silent: false,
      });
      return;
    } catch {
      // Fall through to web notification fallback
    }
  }

  // Web Notification API when page is hidden or user granted permission
  if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
    try {
      if (document.hidden) {
        new Notification(`${senderName} • KabiTech Solution SMS`, {
          body: messageText,
          tag: `kabi_chat_${chatId || 'general'}`,
          silent: false,
        });
      }
    } catch {
      // Ignore browser notification restrictions
    }
  }
}
