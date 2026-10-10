import { Rider, DeliveryEntry, SettlementRecord } from '../types';

export const LAST_AUTH_UID_KEY = 'cp_last_auth_uid';

export function getCachedAuthUserId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(LAST_AUTH_UID_KEY) || null;
  } catch {
    return null;
  }
}

export function setCachedAuthUserId(uid: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (uid) {
      localStorage.setItem(LAST_AUTH_UID_KEY, uid);
    } else {
      localStorage.removeItem(LAST_AUTH_UID_KEY);
    }
  } catch (err) {
    console.warn('Error setting cached auth user id:', err);
  }
}

function getRidersKey(userId?: string) {
  const uid = userId || getCachedAuthUserId();
  return uid ? `cp_cache_riders_${uid}` : 'cp_cache_riders_guest';
}

function getDeliveriesKey(userId?: string) {
  const uid = userId || getCachedAuthUserId();
  return uid ? `cp_cache_deliveries_${uid}` : 'cp_cache_deliveries_guest';
}

function getSettlementsKey(userId?: string) {
  const uid = userId || getCachedAuthUserId();
  return uid ? `cp_cache_settlements_${uid}` : 'cp_cache_settlements_guest';
}

/**
 * PURE EMPTY INITIAL RIDERS - NO HARDCODED MOCK/SAMPLE DATA
 */
export const INITIAL_RIDERS: Rider[] = [];

/**
 * Clean up any legacy mock data left in localStorage from older versions
 */
function isSampleRider(r: any): boolean {
  if (!r) return false;
  const name = (r.name || '').trim().toLowerCase();
  const phone = (r.phone || '').trim().replace(/\D/g, '');
  return (
    r.id === 'rider_1' ||
    r.id === 'rider_2' ||
    r.id === 'rider_3' ||
    r.name === 'Rahul Sharma' ||
    r.name === 'Amit Kumar' ||
    r.name === 'Priya Singh' ||
    name === 'akash mahato' ||
    phone === '6207262418' ||
    phone.endsWith('6207262418')
  );
}

function isSampleDelivery(d: any): boolean {
  if (!d) return false;
  const riderName = (d.riderName || '').trim().toLowerCase();
  const riderPhone = (d.riderPhone || '').trim().replace(/\D/g, '');
  return (
    (typeof d.id === 'string' && d.id.startsWith('del_')) ||
    d.riderName === 'Rahul Sharma' ||
    d.riderName === 'Amit Kumar' ||
    d.riderName === 'Priya Singh' ||
    riderName === 'akash mahato' ||
    riderPhone === '6207262418'
  );
}

/**
 * Purges any legacy cached keys or mock data in localStorage/sessionStorage related to mock riders on app init.
 */
export function purgeLegacyMockStorage(): void {
  if (typeof window === 'undefined') return;
  try {
    // 1. Scan and purge or sanitize localStorage keys
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;

      if (key.includes('sample') || key.includes('mock_rider')) {
        localStorage.removeItem(key);
        continue;
      }

      if (key.includes('riders') || key.includes('cod') || key.includes('deliveries') || key.includes('courier')) {
        const val = localStorage.getItem(key);
        if (val && (val.toLowerCase().includes('akash mahato') || val.includes('6207262418'))) {
          try {
            const parsed = JSON.parse(val);
            if (Array.isArray(parsed)) {
              const cleaned = parsed.filter((item: any) => {
                const name = (item.name || item.riderName || '').trim().toLowerCase();
                const phone = (item.phone || item.riderPhone || '').trim().replace(/\D/g, '');
                return name !== 'akash mahato' && phone !== '6207262418';
              });
              localStorage.setItem(key, JSON.stringify(cleaned));
            } else if (parsed && typeof parsed === 'object') {
              if (Array.isArray(parsed.entries)) {
                parsed.entries = parsed.entries.filter((item: any) => {
                  const name = (item.name || item.riderName || '').trim().toLowerCase();
                  const phone = (item.phone || item.riderPhone || '').trim().replace(/\D/g, '');
                  return name !== 'akash mahato' && phone !== '6207262418';
                });
                localStorage.setItem(key, JSON.stringify(parsed));
              }
            }
          } catch {
            localStorage.removeItem(key);
          }
        }
      }
    }

    // 2. Scan and purge sessionStorage
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (!key) continue;
      const val = sessionStorage.getItem(key);
      if (val && (val.toLowerCase().includes('akash mahato') || val.includes('6207262418'))) {
        try {
          const parsed = JSON.parse(val);
          if (Array.isArray(parsed)) {
            const cleaned = parsed.filter((item: any) => {
              const name = (item.name || item.riderName || '').trim().toLowerCase();
              const phone = (item.phone || item.riderPhone || '').trim().replace(/\D/g, '');
              return name !== 'akash mahato' && phone !== '6207262418';
            });
            sessionStorage.setItem(key, JSON.stringify(cleaned));
          } else {
            sessionStorage.removeItem(key);
          }
        } catch {
          sessionStorage.removeItem(key);
        }
      }
    }
  } catch (err) {
    console.warn('Notice during purgeLegacyMockStorage:', err);
  }
}

/**
 * Loads authentic user riders from local cache.
 * Returns empty array [] if no cached data exists. Never returns fake rows.
 */
export function loadRidersFromStorage(userId?: string): Rider[] {
  try {
    const key = getRidersKey(userId);
    const raw = localStorage.getItem(key);
    if (!raw) {
      // Legacy fallback check (courier_riders_u_...)
      const uid = userId || getCachedAuthUserId();
      if (uid) {
        const legacyRaw = localStorage.getItem(`courier_riders_u_${uid}`);
        if (legacyRaw) {
          const parsed = JSON.parse(legacyRaw);
          if (Array.isArray(parsed)) {
            const sanitized = parsed.filter((r) => !isSampleRider(r));
            saveRidersToStorage(sanitized, uid);
            return sanitized;
          }
        }
      }
      return [];
    }

    const parsed = JSON.parse(raw);
    const list: Rider[] = Array.isArray(parsed) ? parsed : [];
    // Sanitize any legacy mock rows
    const cleanList = list.filter((r) => !isSampleRider(r));
    return cleanList.slice().sort((a, b) => {
      const orderA = typeof a.order === 'number' ? a.order : 99999;
      const orderB = typeof b.order === 'number' ? b.order : 99999;
      if (orderA !== orderB) return orderA - orderB;
      return a.joinedDate < b.joinedDate ? 1 : -1;
    });
  } catch (err) {
    console.error('Error loading riders from storage', err);
    return [];
  }
}

export function saveRidersToStorage(riders: Rider[], userId?: string): void {
  try {
    const cleanList = (riders || []).filter((r) => !isSampleRider(r));
    const key = getRidersKey(userId);
    localStorage.setItem(key, JSON.stringify(cleanList));
    // Also save under uid key for backwards compatibility
    const uid = userId || getCachedAuthUserId();
    if (uid) {
      localStorage.setItem(`courier_riders_u_${uid}`, JSON.stringify(cleanList));
    }
  } catch (err) {
    console.error('Error saving riders to storage', err);
  }
}

/**
 * Loads authentic user deliveries from local cache.
 * Returns empty array [] if no cached data exists. Never returns fake rows.
 */
export function loadDeliveriesFromStorage(_riders?: Rider[], userId?: string): DeliveryEntry[] {
  try {
    const key = getDeliveriesKey(userId);
    const raw = localStorage.getItem(key);
    if (!raw) {
      const uid = userId || getCachedAuthUserId();
      if (uid) {
        const legacyRaw = localStorage.getItem(`courier_deliveries_u_${uid}`);
        if (legacyRaw) {
          const parsed = JSON.parse(legacyRaw);
          if (Array.isArray(parsed)) {
            const sanitized = parsed.filter((d) => !isSampleDelivery(d));
            saveDeliveriesToStorage(sanitized, uid);
            return sanitized;
          }
        }
      }
      return [];
    }

    const parsed = JSON.parse(raw);
    const list: DeliveryEntry[] = Array.isArray(parsed) ? parsed : [];
    return list.filter((d) => !isSampleDelivery(d));
  } catch (err) {
    console.error('Error loading deliveries from storage', err);
    return [];
  }
}

export function saveDeliveriesToStorage(deliveries: DeliveryEntry[], userId?: string): void {
  try {
    const cleanList = (deliveries || []).filter((d) => !isSampleDelivery(d));
    const key = getDeliveriesKey(userId);
    localStorage.setItem(key, JSON.stringify(cleanList));
    const uid = userId || getCachedAuthUserId();
    if (uid) {
      localStorage.setItem(`courier_deliveries_u_${uid}`, JSON.stringify(cleanList));
    }
  } catch (err) {
    console.error('Error saving deliveries to storage', err);
  }
}

/**
 * Loads authentic user settlements from local cache.
 */
export function loadSettlementsFromStorage(userId?: string): SettlementRecord[] {
  try {
    const key = getSettlementsKey(userId);
    const raw = localStorage.getItem(key);
    if (!raw) {
      const uid = userId || getCachedAuthUserId();
      if (uid) {
        const legacyRaw = localStorage.getItem(`courier_settlements_u_${uid}`);
        if (legacyRaw) {
          const parsed = JSON.parse(legacyRaw);
          return Array.isArray(parsed) ? parsed : [];
        }
      }
      return [];
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error('Error loading settlements from storage', err);
    return [];
  }
}

export function saveSettlementsToStorage(settlements: SettlementRecord[], userId?: string): void {
  try {
    const key = getSettlementsKey(userId);
    localStorage.setItem(key, JSON.stringify(settlements || []));
    const uid = userId || getCachedAuthUserId();
    if (uid) {
      localStorage.setItem(`courier_settlements_u_${uid}`, JSON.stringify(settlements || []));
    }
  } catch (err) {
    console.error('Error saving settlements to storage', err);
  }
}

/**
 * Checks if the user already has cached data ready for instant 0ms startup
 */
export function hasUserCachedData(userId?: string): boolean {
  try {
    const r = loadRidersFromStorage(userId);
    const d = loadDeliveriesFromStorage(r, userId);
    return r.length > 0 || d.length > 0;
  } catch {
    return false;
  }
}

const SETTINGS_STORAGE_KEY = 'courier_settings_v1';

function getSettingsKey(userId?: string) {
  const uid = userId || getCachedAuthUserId();
  return uid ? `courier_settings_u_${uid}` : SETTINGS_STORAGE_KEY;
}

export function loadSettingsFromStorage(userId?: string): any {
  try {
    const key = getSettingsKey(userId);
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (err) {
    console.error('Error loading settings from storage', err);
    return null;
  }
}

export function saveSettingsToStorage(settings: any, userId?: string): void {
  try {
    if (!settings) return;
    localStorage.setItem(getSettingsKey(userId), JSON.stringify(settings));
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    localStorage.setItem('courier_user_rate_config', JSON.stringify(settings));
  } catch (err) {
    console.error('Error saving settings to storage', err);
  }
}

// -------------------------------------------------------------
// 24-Hour "SMS/WhatsApp Sent" Persistence for Festival Greetings
// -------------------------------------------------------------

export interface FestivalGreetingSentRecord {
  riderId: string;
  festivalId: string;
  sentAt: number; // timestamp in milliseconds
}

const FESTIVAL_SENT_STORAGE_KEY = 'courier_festival_greetings_sent_v1';
export const FESTIVAL_SENT_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 Hours

export function loadFestivalGreetingSentRecords(): FestivalGreetingSentRecord[] {
  try {
    const raw = localStorage.getItem(FESTIVAL_SENT_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const now = Date.now();
    const active = parsed.filter(
      (r) => r && r.riderId && r.festivalId && now - (r.sentAt || 0) < FESTIVAL_SENT_EXPIRY_MS
    );
    if (active.length !== parsed.length) {
      localStorage.setItem(FESTIVAL_SENT_STORAGE_KEY, JSON.stringify(active));
    }
    return active;
  } catch (err) {
    console.error('Error loading festival greeting sent records from storage', err);
    return [];
  }
}

export function saveFestivalGreetingSentRecord(
  riderId: string,
  festivalId: string
): FestivalGreetingSentRecord[] {
  try {
    const current = loadFestivalGreetingSentRecords();
    const now = Date.now();
    const filtered = current.filter(
      (r) => !(r.riderId === riderId && r.festivalId === festivalId)
    );
    const updated: FestivalGreetingSentRecord[] = [
      ...filtered,
      { riderId, festivalId, sentAt: now },
    ];
    localStorage.setItem(FESTIVAL_SENT_STORAGE_KEY, JSON.stringify(updated));
    return updated;
  } catch (err) {
    console.error('Error saving festival greeting sent record', err);
    return [];
  }
}

export function isFestivalGreetingSentWithin24Hours(
  records: FestivalGreetingSentRecord[],
  riderId: string,
  festivalId: string
): { isSent: boolean; sentAt?: number; hoursRemaining?: number } {
  const now = Date.now();
  const record = records.find(
    (r) => r.riderId === riderId && r.festivalId === festivalId && now - r.sentAt < FESTIVAL_SENT_EXPIRY_MS
  );
  if (!record) return { isSent: false };
  const msLeft = FESTIVAL_SENT_EXPIRY_MS - (now - record.sentAt);
  const hoursRemaining = Math.max(1, Math.ceil(msLeft / (60 * 60 * 1000)));
  return { isSent: true, sentAt: record.sentAt, hoursRemaining };
}
