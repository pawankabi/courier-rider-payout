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
 * Lightweight IndexedDB backing store so full historical delivery/rider/settlement caches
 * remain available locally even when localStorage (~5MB) is full.
 */
const IDB_NAME = 'cp_offline_cache_v1';
const IDB_STORE = 'kv';

function saveToIndexedDB(key: string, value: unknown): void {
  if (typeof window === 'undefined' || !('indexedDB' in window)) return;
  try {
    const req = window.indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = () => {
      try {
        const db = req.result;
        const tx = db.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).put(value, key);
        tx.oncomplete = () => db.close();
        tx.onerror = () => db.close();
      } catch {
        // Ignore non-fatal IDB errors
      }
    };
  } catch {
    // Ignore IDB unavailability (e.g. restricted private browsing)
  }
}

function isQuotaError(err: unknown): boolean {
  if (!err) return false;
  if (err instanceof DOMException) {
    return (
      err.name === 'QuotaExceededError' ||
      err.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
      err.code === 22 ||
      err.code === 1014
    );
  }
  const msg = String((err as any)?.message || err).toLowerCase();
  return msg.includes('quota');
}

/**
 * Frees localStorage space safely without deleting active user data:
 * 1. Removes redundant legacy duplicate keys (`courier_riders_u_*`, `courier_deliveries_u_*`, etc.)
 * 2. Removes redundant rolling snapshot (`cp_safety_shield_snapshot_v1`)
 * 3. Removes stale guest caches when a real authenticated uid is active
 * 4. Prunes oldest COD daily sheet duplicates beyond the newest 45 distinct days while preserving recent sheets
 */
export function reclaimLocalStorageSpace(activeUid?: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    const keysToRemove: string[] = [];
    const datedCodKeys: Array<{ key: string; date: string }> = [];

    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;

      // Legacy duplicate copies (superseded by cp_cache_*)
      if (
        k.startsWith('courier_riders_u_') ||
        k.startsWith('courier_deliveries_u_') ||
        k.startsWith('courier_settlements_u_') ||
        k === 'courier_riders' ||
        k === 'courier_deliveries' ||
        k === 'courier_settlements' ||
        k === 'cp_safety_shield_snapshot_v1'
      ) {
        keysToRemove.push(k);
        continue;
      }

      // Stale guest caches when authenticated
      if (
        activeUid &&
        activeUid !== 'guest' &&
        (k === 'cp_cache_deliveries_guest' ||
          k === 'cp_cache_riders_guest' ||
          k === 'cp_cache_settlements_guest')
      ) {
        keysToRemove.push(k);
        continue;
      }

      // Collect dated COD sheet caches so oldest duplicates (>45 days) can be trimmed if needed
      const dateMatch = k.match(/(?:cp_cod_sheet_|cod_entries_|cp_cod_archived_sheet_).*(\d{4}-\d{2}-\d{2})$/);
      if (dateMatch) {
        datedCodKeys.push({ key: k, date: dateMatch[1] });
      }
    }

    keysToRemove.forEach((k) => {
      try {
        localStorage.removeItem(k);
      } catch {}
    });

    // Prune older COD sheet local caches beyond newest 45 distinct calendar dates
    const distinctDates = Array.from(new Set(datedCodKeys.map((d) => d.date))).sort();
    if (distinctDates.length > 45) {
      const keepDates = new Set(distinctDates.slice(-45));
      for (const item of datedCodKeys) {
        if (!keepDates.has(item.date)) {
          try {
            localStorage.removeItem(item.key);
          } catch {}
        }
      }
    }
  } catch {
    // Ignore storage iteration failures
  }
}

export function trySetLocalStorageItem(key: string, jsonValue: string, activeUid?: string | null): boolean {
  if (typeof window === 'undefined') return false;
  try {
    localStorage.setItem(key, jsonValue);
    return true;
  } catch (err) {
    if (!isQuotaError(err)) return false;
    reclaimLocalStorageSpace(activeUid);
    try {
      localStorage.setItem(key, jsonValue);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Compacts delivery objects for localStorage caching by omitting repetitive workspace/email metadata
 * already scoped by `cp_cache_deliveries_${uid}`. Restores uid fields cleanly on load if needed.
 */
function compactDeliveryForCache(d: DeliveryEntry): Record<string, any> {
  const out: Record<string, any> = {
    id: d.id,
    riderId: d.riderId,
    riderName: d.riderName,
    date: d.date,
    parcels: d.parcels,
    baseRate: d.baseRate,
    hasIncentive: d.hasIncentive,
    incentiveRate: d.incentiveRate,
    baseAmount: d.baseAmount,
    incentiveAmount: d.incentiveAmount,
    totalEarnings: d.totalEarnings,
    status: d.status,
    createdAt: d.createdAt,
  };
  if (d.riderPhone) out.riderPhone = d.riderPhone;
  if (d.paidAt) out.paidAt = d.paidAt;
  if (d.advanceAmount) out.advanceAmount = d.advanceAmount;
  if (d.advanceDate) out.advanceDate = d.advanceDate;
  if (d.settlementId) out.settlementId = d.settlementId;
  if (d.notes) out.notes = d.notes;
  if (d.isDeleted) out.isDeleted = true;
  if (d.deletedAt) out.deletedAt = d.deletedAt;
  if ((d as any).updatedAt) out.updatedAt = (d as any).updatedAt;
  if ((d as any).updatedBy) out.updatedBy = (d as any).updatedBy;
  return out;
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
  const id = typeof d.id === 'string' ? d.id.trim() : '';
  return (
    id === 'del_1' ||
    id === 'del_2' ||
    id === 'del_3' ||
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
              trySetLocalStorageItem(key, JSON.stringify(cleaned));
            } else if (parsed && typeof parsed === 'object') {
              if (Array.isArray(parsed.entries)) {
                parsed.entries = parsed.entries.filter((item: any) => {
                  const name = (item.name || item.riderName || '').trim().toLowerCase();
                  const phone = (item.phone || item.riderPhone || '').trim().replace(/\D/g, '');
                  return name !== 'akash mahato' && phone !== '6207262418';
                });
                trySetLocalStorageItem(key, JSON.stringify(parsed));
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
    console.warn('Notice loading riders from storage:', err);
    return [];
  }
}

export function saveRidersToStorage(riders: Rider[], userId?: string): void {
  try {
    const cleanList = (riders || []).filter((r) => !isSampleRider(r));
    const key = getRidersKey(userId);
    const uid = userId || getCachedAuthUserId();

    // Persist full list to IndexedDB and remove redundant legacy duplicate key first
    saveToIndexedDB(key, cleanList);
    if (uid) {
      try {
        localStorage.removeItem(`courier_riders_u_${uid}`);
      } catch {}
    }

    trySetLocalStorageItem(key, JSON.stringify(cleanList), uid);
  } catch (err) {
    console.warn('Notice saving riders to storage:', err);
  }
}

/**
 * TARGETED PURGE (UNSETTLED ONLY):
 * Wipes ONLY unsettled/pending advance records (`isSettled === false` or `!isSettled`).
 * Retains ALL historical settled advances (`isSettled === true`) so past audit history
 * and completed settlement statements remain 100% intact.
 */
export function purgeUnsettledAdvancesFromStorage(userId?: string): Rider[] {
  if (typeof window === 'undefined') return [];
  try {
    const riders = loadRidersFromStorage(userId);
    const updatedRiders = riders.map((rider) => {
      const settledAdvancesOnly = (rider.advances || []).filter(
        (adv) => adv.isSettled === true || (adv as any).status === 'PAID' || adv.isDeducted === true
      );
      const newTotalAdvance = settledAdvancesOnly.reduce(
        (sum, adv) => sum + Number(adv.remainingAmount || 0),
        0
      );
      return {
        ...rider,
        advances: settledAdvancesOnly,
        totalAdvance: newTotalAdvance,
      };
    });

    saveRidersToStorage(updatedRiders, userId);

    // Also scan all localStorage keys containing 'rider' to ensure no ghost unsettled advances remain
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.startsWith('cp_cache_riders_') || key.startsWith('courier_riders_u_'))) {
        try {
          const val = localStorage.getItem(key);
          if (val) {
            const list = JSON.parse(val);
            if (Array.isArray(list)) {
              const cleaned = list.map((r: any) => ({
                ...r,
                advances: Array.isArray(r.advances)
                  ? r.advances.filter(
                      (adv: any) => adv.isSettled === true || adv.status === 'PAID' || adv.isDeducted === true
                    )
                  : [],
                totalAdvance: 0,
              }));
              trySetLocalStorageItem(key, JSON.stringify(cleaned), userId);
            }
          }
        } catch {}
      }
    }

    return updatedRiders;
  } catch (err) {
    console.warn('Notice during purgeUnsettledAdvancesFromStorage:', err);
    return [];
  }
}

/**
 * Loads authentic user deliveries from local cache.
 * Returns empty array [] if no cached data exists. Never returns fake rows.
 */
export function loadDeliveriesFromStorage(_riders?: Rider[], userId?: string): DeliveryEntry[] {
  try {
    const key = getDeliveriesKey(userId);
    const uid = userId || getCachedAuthUserId();
    const raw = localStorage.getItem(key);
    if (!raw) {
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
    return list
      .filter((d) => !isSampleDelivery(d))
      .map((d) =>
        uid && (!d.workspaceId || !d.userId)
          ? { ...d, workspaceId: d.workspaceId || uid, userId: d.userId || uid }
          : d
      );
  } catch (err) {
    console.warn('Notice loading deliveries from storage:', err);
    return [];
  }
}

export function saveDeliveriesToStorage(deliveries: DeliveryEntry[], userId?: string): void {
  try {
    const cleanList = (deliveries || []).filter((d) => !isSampleDelivery(d));
    const key = getDeliveriesKey(userId);
    const uid = userId || getCachedAuthUserId();

    // Always store full un-truncated history in IndexedDB
    saveToIndexedDB(key, cleanList);

    // Immediately reclaim space from legacy duplicate key before writing
    if (uid) {
      try {
        localStorage.removeItem(`courier_deliveries_u_${uid}`);
      } catch {}
    }

    // Attempt 1: Full JSON in single scoped key
    if (trySetLocalStorageItem(key, JSON.stringify(cleanList), uid)) {
      return;
    }

    // Attempt 2: Compact records (omits repetitive uid/email metadata strings, keeps 100% of delivery accounting data)
    const compactedAll = cleanList.map(compactDeliveryForCache);
    if (trySetLocalStorageItem(key, JSON.stringify(compactedAll), uid)) {
      return;
    }

    // Attempt 3: Prioritize ALL unpaid + soft-deleted Trash items + capped Paid history so 0ms startup cache never overflows 5MB
    const sorted = [...cleanList].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    const priority = sorted.filter((d) => Boolean(d.isDeleted) || d.status !== 'Paid');
    const paid = sorted.filter((d) => !d.isDeleted && d.status === 'Paid');

    for (const paidLimit of [1500, 800, 400, 150, 0]) {
      const subset = [...priority, ...paid.slice(0, paidLimit)].map(compactDeliveryForCache);
      if (trySetLocalStorageItem(key, JSON.stringify(subset), uid)) {
        return;
      }
    }

    // Attempt 4: Minimal recent window if even unpaid backlog is massive
    for (const totalLimit of [300, 100, 25]) {
      const minimalSubset = sorted.slice(0, totalLimit).map(compactDeliveryForCache);
      if (trySetLocalStorageItem(key, JSON.stringify(minimalSubset), uid)) {
        return;
      }
    }
  } catch (err) {
    console.warn('Notice saving deliveries to storage (IDB fallback preserved):', err);
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
          if (Array.isArray(parsed)) {
            saveSettlementsToStorage(parsed, uid);
            return parsed;
          }
        }
      }
      return [];
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.warn('Notice loading settlements from storage:', err);
    return [];
  }
}

export function saveSettlementsToStorage(settlements: SettlementRecord[], userId?: string): void {
  try {
    const list = settlements || [];
    const key = getSettlementsKey(userId);
    const uid = userId || getCachedAuthUserId();

    saveToIndexedDB(key, list);
    if (uid) {
      try {
        localStorage.removeItem(`courier_settlements_u_${uid}`);
      } catch {}
    }

    if (trySetLocalStorageItem(key, JSON.stringify(list), uid)) {
      return;
    }

    // Fallback: keep recent 400 settlements in localStorage while IDB retains all
    const recent = [...list]
      .sort((a, b) => (b.paidAt || b.endDate || '').localeCompare(a.paidAt || a.endDate || ''))
      .slice(0, 400);
    trySetLocalStorageItem(key, JSON.stringify(recent), uid);
  } catch (err) {
    console.warn('Notice saving settlements to storage:', err);
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

// -------------------------------------------------------------
// 0.0s Instant Cold-Start Quick Stats Cache ("कुल अनपेड" व "कुल बकाया राशि")
// -------------------------------------------------------------
export interface QuickStatsSummary {
  totalUnpaidAmount: number;
  totalAdvanceAmount: number;
  todayEarnings: number;
  todayParcels: number;
  unpaidCount: number;
  lastUpdated: number;
}

export function saveQuickStatsSummary(summary: QuickStatsSummary, userId?: string): void {
  if (typeof window === 'undefined') return;
  try {
    const uid = userId || getCachedAuthUserId() || 'guest';
    const payload = JSON.stringify({ ...summary, lastUpdated: Date.now() });
    localStorage.setItem(`cp_stats_summary_${uid}`, payload);
    localStorage.setItem('cp_stats_summary_latest', payload);
  } catch (err) {
    console.warn('Notice saving quick stats summary:', err);
  }
}

export function loadQuickStatsSummary(userId?: string): QuickStatsSummary | null {
  if (typeof window === 'undefined') return null;
  try {
    const uid = userId || getCachedAuthUserId() || 'guest';
    const raw = userId
      ? localStorage.getItem(`cp_stats_summary_${uid}`)
      : (localStorage.getItem(`cp_stats_summary_${uid}`) || localStorage.getItem('cp_stats_summary_latest'));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      totalUnpaidAmount: Number(parsed.totalUnpaidAmount) || 0,
      totalAdvanceAmount: Number(parsed.totalAdvanceAmount) || 0,
      todayEarnings: Number(parsed.todayEarnings) || 0,
      todayParcels: Number(parsed.todayParcels) || 0,
      unpaidCount: Number(parsed.unpaidCount) || 0,
      lastUpdated: Number(parsed.lastUpdated) || 0,
    };
  } catch {
    return null;
  }
}

