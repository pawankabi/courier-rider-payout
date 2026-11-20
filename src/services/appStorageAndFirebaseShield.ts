/**
 * App-Wide Storage & Ledger Safety Shield ("सुरक्षा कवच")
 *
 * Root-Cause Protection:
 * 1. Prevents WebView / Browser 5MB localStorage QuotaExceededError which causes
 *    Firestore `INTERNAL ASSERTION FAILED (b815)` crashes across Web & Android.
 * 2. Purges orphaned Firebase multi-tab WebStorage client/target bloat (`firestore_clients_*`)
 *    and duplicate COD caches while preserving 100% of Auth, Pending Retry Queues,
 *    active hub settings, and current financial caches.
 * 3. Moves heavy rolling snapshots to IndexedDB (hundreds of MB capacity).
 * 4. Translates internal Firestore assertions/quota errors into self-healing recovery
 *    plus clean Hindi alerts.
 */

import { Capacitor } from '@capacitor/core';

const IDB_SHIELD_DB = 'cp_offline_cache_v1';
const IDB_SHIELD_STORE = 'kv';
const SAFE_MEMORY_FLAG_KEY = 'cp_firestore_safe_memory_mode';

// Keep total localStorage under ~2.2 MB (leaving >2.8 MB permanent headroom out of 5 MB quota)
const SOFT_QUOTA_BYTES = 2_200_000;
const AGGRESSIVE_QUOTA_BYTES = 1_200_000;

// Platform-aware IndexedDB offline storage limits:
// - Android Native APK: 200 MB rolling storage budget
// - Web App / Browser: 20 MB rolling storage budget (saves device storage)
export const ANDROID_OFFLINE_STORAGE_LIMIT_BYTES = 200 * 1024 * 1024;
export const WEB_OFFLINE_STORAGE_LIMIT_BYTES = 20 * 1024 * 1024;

export function isNativeAndroidStoragePlatform(): boolean {
  try {
    return Boolean(Capacitor.isNativePlatform && Capacitor.isNativePlatform());
  } catch {
    return false;
  }
}

export function getOfflineStorageBudgetBytes(): number {
  return isNativeAndroidStoragePlatform()
    ? ANDROID_OFFLINE_STORAGE_LIMIT_BYTES
    : WEB_OFFLINE_STORAGE_LIMIT_BYTES;
}

interface IdbStoredEnvelope {
  __cpIdbWrap: 1;
  value: unknown;
  updatedAt: number;
  sizeBytes: number;
}

function estimateJsonBytes(value: unknown): number {
  try {
    return JSON.stringify(value).length * 2;
  } catch {
    return 0;
  }
}

export function isQuotaExceededError(err: unknown): boolean {
  if (!err) return false;
  if (typeof DOMException !== 'undefined' && err instanceof DOMException) {
    return (
      err.name === 'QuotaExceededError' ||
      err.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
      err.code === 22 ||
      err.code === 1014
    );
  }
  const msg = String((err as any)?.message || err).toLowerCase();
  return msg.includes('quota') || msg.includes('exceeded the quota');
}

export function isFirestoreInternalAssertionOrQuotaError(err: unknown): boolean {
  if (!err) return false;
  if (isQuotaExceededError(err)) return true;
  const msg = String((err as any)?.message || err).toLowerCase();
  return (
    msg.includes('internal assertion failed') ||
    msg.includes('(id: b815)') ||
    msg.includes('(id: ca9)') ||
    msg.includes('unexpected state') ||
    msg.includes('quotaexceedederror') ||
    msg.includes('firestore_clients_')
  );
}

function isProtectedEssentialKey(key: string): boolean {
  if (!key) return true;
  return (
    key.startsWith('firebase:') ||
    key.startsWith('cp_last_auth_uid') ||
    key.startsWith('cp_cod_pending_ledger_queue_') ||
    key.startsWith('cp_cod_companion_user') ||
    key.startsWith('cp_authenticated_hub_id') ||
    key.startsWith('active_hub_id') ||
    key.startsWith('active_companion_hub_id') ||
    key.startsWith('cp_subscribed') ||
    key.startsWith('cp_is_pro_') ||
    key.startsWith('isPro') ||
    key.startsWith('subscriptionStatus') ||
    key.startsWith('cp_current_is_pro') ||
    key.startsWith('courier_settings') ||
    key.startsWith('courier_user_rate_config') ||
    key.startsWith('cp_app_lock') ||
    key.startsWith('cp_stats_summary_') ||
    key.startsWith('cp_cache_settlements_') ||
    key === SAFE_MEMORY_FLAG_KEY
  );
}

export function estimateLocalStorageBytes(): number {
  if (typeof window === 'undefined') return 0;
  try {
    let totalChars = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      const v = localStorage.getItem(k) || '';
      totalChars += k.length + v.length;
    }
    return totalChars * 2;
  } catch {
    return 0;
  }
}

/**
 * Reclaims localStorage headroom safely before Firebase boots and whenever quota tightens.
 * Never removes Pending Ledger Retry Queues, Auth tokens, or Hub/Company settings.
 */
export function enforceLocalStorageHeadroom(
  activeUid?: string | null,
  options?: { aggressive?: boolean }
): number {
  if (typeof window === 'undefined') return 0;
  const aggressive = Boolean(options?.aggressive);
  const targetMaxBytes = aggressive ? AGGRESSIVE_QUOTA_BYTES : SOFT_QUOTA_BYTES;

  try {
    const keysToRemove: string[] = [];
    const datedScopedCodSheets: Array<{ key: string; date: string; bytes: number }> = [];

    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || isProtectedEssentialKey(k)) continue;

      // 1. Orphaned Firebase WebStorage multi-tab client/target state keys (root cause of b815 crashes)
      if (
        k.startsWith('firestore_clients_') ||
        k.startsWith('firestore_targets_') ||
        k.startsWith('firestore_mutations_') ||
        k.startsWith('firestore_online_state_') ||
        k.startsWith('firestore_sequence_number_')
      ) {
        keysToRemove.push(k);
        continue;
      }

      // 2. Heavy snapshot blobs belong strictly in IndexedDB (not 5MB localStorage)
      if (
        k === 'cp_safety_shield_snapshot_v1' ||
        k === 'cp_safety_shield_snapshots_v1'
      ) {
        keysToRemove.push(k);
        continue;
      }

      // 3. Redundant legacy un-scoped / duplicated entity keys
      if (
        k.startsWith('courier_riders_u_') ||
        k.startsWith('courier_deliveries_u_') ||
        k.startsWith('courier_settlements_u_') ||
        k === 'courier_riders' ||
        k === 'courier_deliveries' ||
        k === 'courier_settlements' ||
        k.startsWith('cp_cod_archived_sheet_')
      ) {
        keysToRemove.push(k);
        continue;
      }

      // 4. Stale guest caches once logged into a real account
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

      // 5. Redundant un-scoped COD sheet/entries duplicates (`cod_entries_*` and `cp_cod_sheet_YYYY-MM-DD`)
      if (k.startsWith('cod_entries_') || /^cp_cod_sheet_\d{4}-\d{2}-\d{2}$/.test(k)) {
        keysToRemove.push(k);
        continue;
      }

      // Track canonical scoped COD sheets `cp_cod_sheet_${hub}_${YYYY-MM-DD}`
      const scopedMatch = k.match(/^cp_cod_sheet_(.+)_(\d{4}-\d{2}-\d{2})$/);
      if (scopedMatch) {
        const val = localStorage.getItem(k) || '';
        datedScopedCodSheets.push({
          key: k,
          date: scopedMatch[2],
          bytes: (k.length + val.length) * 2,
        });
      }
    }

    for (const k of keysToRemove) {
      try {
        localStorage.removeItem(k);
      } catch {}
    }

    // Trim large audit log arrays in localStorage (Firestore retains full logs)
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith('cp_cod_audit_logs_')) continue;
      try {
        const raw = localStorage.getItem(k);
        if (raw && raw.length > 25_000) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            localStorage.setItem(k, JSON.stringify(parsed.slice(0, aggressive ? 20 : 50)));
          }
        }
      } catch {
        try {
          localStorage.removeItem(k);
        } catch {}
      }
    }

    // Keep newest 10 days of COD sheets in localStorage (or newest 3 in aggressive mode)
    const keepDays = aggressive ? 3 : 10;
    const distinctDates = Array.from(new Set(datedScopedCodSheets.map((s) => s.date))).sort();
    if (distinctDates.length > keepDays) {
      const keepSet = new Set(distinctDates.slice(-keepDays));
      for (const sheet of datedScopedCodSheets) {
        if (!keepSet.has(sheet.date)) {
          try {
            localStorage.removeItem(sheet.key);
          } catch {}
        }
      }
    }

    // If still above target headroom, prune oldest remaining COD date caches
    let currentBytes = estimateLocalStorageBytes();
    if (currentBytes > targetMaxBytes) {
      const remainingSheets = datedScopedCodSheets
        .filter((s) => localStorage.getItem(s.key) !== null)
        .sort((a, b) => a.date.localeCompare(b.date));
      for (const s of remainingSheets) {
        if (currentBytes <= targetMaxBytes) break;
        try {
          localStorage.removeItem(s.key);
          currentBytes -= s.bytes;
        } catch {}
      }
    }

    if (currentBytes > targetMaxBytes && aggressive) {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        if (currentBytes <= targetMaxBytes) break;
        const k = localStorage.key(i);
        if (!k || isProtectedEssentialKey(k)) continue;
        // Never remove settlements or verified summaries (removing settlements causes inflated advance figures!)
        if (
          k.startsWith('cp_cache_deliveries_') ||
          k.startsWith('cp_cod_withdrawals_') ||
          k.startsWith('cp_cod_audit_logs_')
        ) {
          const val = localStorage.getItem(k) || '';
          try {
            localStorage.removeItem(k);
            currentBytes -= (k.length + val.length) * 2;
          } catch {}
        }
      }
    }

    return currentBytes;
  } catch {
    return 0;
  }
}

export function safeLocalStorageSet(
  key: string,
  rawValue: string,
  activeUid?: string | null
): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (estimateLocalStorageBytes() + (key.length + rawValue.length) * 2 > SOFT_QUOTA_BYTES) {
      enforceLocalStorageHeadroom(activeUid, { aggressive: false });
    }
    localStorage.setItem(key, rawValue);
    return true;
  } catch (err) {
    if (!isQuotaExceededError(err)) return false;
    enforceLocalStorageHeadroom(activeUid, { aggressive: true });
    try {
      localStorage.setItem(key, rawValue);
      return true;
    } catch {
      return false;
    }
  }
}

function openShieldIndexedDB(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || !('indexedDB' in window)) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    try {
      const req = window.indexedDB.open(IDB_SHIELD_DB, 1);
      req.onupgradeneeded = () => {
        const database = req.result;
        if (!database.objectStoreNames.contains(IDB_SHIELD_STORE)) {
          database.createObjectStore(IDB_SHIELD_STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function unwrapIdbRecord<T>(raw: unknown): T | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw === 'object' && (raw as any).__cpIdbWrap === 1 && 'value' in (raw as any)) {
    return ((raw as IdbStoredEnvelope).value ?? null) as T | null;
  }
  return raw as T;
}

/**
 * Accounting-safe delivery trimmer used ONLY when total IndexedDB usage exceeds platform budget
 * (200 MB on Android APK, 20 MB on Web App).
 * STRICT INVARIANT:
 * - NEVER removes any Unpaid delivery (status !== 'Paid')
 * - NEVER removes any Trash/Deleted item
 * - ONLY trims oldest Paid & Settled historical delivery rows to make room for new data.
 */
export function trimOldestPaidDeliveriesForBudget<T extends { status?: string; isDeleted?: boolean; date?: string }>(
  deliveries: T[],
  maxBytes: number
): T[] {
  if (!Array.isArray(deliveries) || deliveries.length === 0) return [];
  if (estimateJsonBytes(deliveries) <= maxBytes) return deliveries;

  const protectedItems = deliveries.filter((d) => Boolean(d?.isDeleted) || d?.status !== 'Paid');
  const paidItems = deliveries
    .filter((d) => !d?.isDeleted && d?.status === 'Paid')
    .sort((a, b) => (b.date || '').localeCompare(a.date || '')); // newest first, oldest at end

  const protectedBytes = estimateJsonBytes(protectedItems);
  const remainingBudget = Math.max(0, maxBytes - protectedBytes);
  if (remainingBudget <= 0 || paidItems.length === 0) {
    return protectedItems;
  }

  // Binary search maximum count of newest Paid records that fit safely within remainingBudget
  let low = 0;
  let high = paidItems.length;
  let bestCount = 0;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const sliceBytes = estimateJsonBytes(paidItems.slice(0, mid));
    if (sliceBytes <= remainingBudget) {
      bestCount = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return [...protectedItems, ...paidItems.slice(0, bestCount)];
}

let idbBudgetPruneScheduled = false;

/**
 * Enforces the platform-aware rolling IndexedDB storage budget:
 * - Android Native APK: 200 MB
 * - Web App / Browser: 20 MB
 * When full, oldest non-essential backups/logs roll off first, then oldest Paid deliveries only.
 * Riders, Settlements, Unpaid deliveries, Advances, and Incentives are ALWAYS 100% preserved.
 */
export async function enforceIndexedDBRollingBudget(): Promise<void> {
  const database = await openShieldIndexedDB();
  if (!database) return;

  const budgetBytes = getOfflineStorageBudgetBytes();
  const targetBytes = Math.floor(budgetBytes * 0.88);

  try {
    const records: Array<{ key: string; raw: unknown; sizeBytes: number; updatedAt: number }> = await new Promise(
      (resolve) => {
        const items: Array<{ key: string; raw: unknown; sizeBytes: number; updatedAt: number }> = [];
        try {
          const tx = database.transaction(IDB_SHIELD_STORE, 'readonly');
          const store = tx.objectStore(IDB_SHIELD_STORE);
          const cursorReq = store.openCursor();
          cursorReq.onsuccess = () => {
            const cursor = cursorReq.result;
            if (!cursor) {
              resolve(items);
              return;
            }
            const key = String(cursor.key);
            const raw = cursor.value;
            const isWrapped = Boolean(raw && typeof raw === 'object' && (raw as any).__cpIdbWrap === 1);
            const sizeBytes = isWrapped
              ? Number((raw as IdbStoredEnvelope).sizeBytes) || estimateJsonBytes((raw as IdbStoredEnvelope).value)
              : estimateJsonBytes(raw);
            const updatedAt = isWrapped ? Number((raw as IdbStoredEnvelope).updatedAt) || 0 : 0;
            items.push({ key, raw, sizeBytes, updatedAt });
            cursor.continue();
          };
          cursorReq.onerror = () => resolve(items);
        } catch {
          resolve(items);
        }
      }
    );

    let totalBytes = records.reduce((sum, r) => sum + r.sizeBytes, 0);
    if (totalBytes <= budgetBytes) {
      database.close();
      return;
    }

    // Stage 1: Delete oldest rolling backups, safety snapshots, and old COD logs first
    const isEvictableHistoryKey = (k: string) =>
      k.startsWith('cp_auto_backup_') ||
      k.startsWith('cp_safety_shield_') ||
      k.startsWith('cp_cod_sheet_') ||
      k.startsWith('cp_cod_audit_logs_');

    const evictable = records
      .filter((r) => isEvictableHistoryKey(r.key))
      .sort((a, b) => a.updatedAt - b.updatedAt || a.key.localeCompare(b.key));

    const keysToDelete: string[] = [];
    for (const rec of evictable) {
      if (totalBytes <= targetBytes) break;
      keysToDelete.push(rec.key);
      totalBytes -= rec.sizeBytes;
    }

    if (keysToDelete.length > 0) {
      await new Promise<void>((resolve) => {
        try {
          const tx = database.transaction(IDB_SHIELD_STORE, 'readwrite');
          const store = tx.objectStore(IDB_SHIELD_STORE);
          keysToDelete.forEach((k) => store.delete(k));
          tx.oncomplete = () => resolve();
          tx.onerror = () => resolve();
        } catch {
          resolve();
        }
      });
    }

    // Stage 2: If STILL over budget, trim ONLY oldest Paid & Settled deliveries inside delivery/atomic caches
    if (totalBytes > targetBytes) {
      const deliveryHoldingRecords = records.filter(
        (r) =>
          !keysToDelete.includes(r.key) &&
          (r.key.startsWith('cp_cache_deliveries_') || r.key.startsWith('cp_atomic_workspace_'))
      );

      for (const rec of deliveryHoldingRecords) {
        if (totalBytes <= targetBytes) break;
        const unwrapped = unwrapIdbRecord<any>(rec.raw);
        if (!unwrapped) continue;

        const excessBytes = totalBytes - targetBytes;
        const maxRecordBytes = Math.max(512 * 1024, rec.sizeBytes - excessBytes);

        let updatedValue: unknown = null;
        if (rec.key.startsWith('cp_cache_deliveries_') && Array.isArray(unwrapped)) {
          const trimmed = trimOldestPaidDeliveriesForBudget(unwrapped, maxRecordBytes);
          if (trimmed.length < unwrapped.length) {
            updatedValue = trimmed;
          }
        } else if (rec.key.startsWith('cp_atomic_workspace_') && Array.isArray(unwrapped.deliveries)) {
          const nonDeliveryBytes = Math.max(
            0,
            rec.sizeBytes - estimateJsonBytes(unwrapped.deliveries)
          );
          const allowedDeliveryBytes = Math.max(256 * 1024, maxRecordBytes - nonDeliveryBytes);
          const trimmed = trimOldestPaidDeliveriesForBudget(unwrapped.deliveries, allowedDeliveryBytes);
          if (trimmed.length < unwrapped.deliveries.length) {
            updatedValue = { ...unwrapped, deliveries: trimmed };
          }
        }

        if (updatedValue !== null) {
          const newSize = estimateJsonBytes(updatedValue);
          const envelope: IdbStoredEnvelope = {
            __cpIdbWrap: 1,
            value: updatedValue,
            updatedAt: Date.now(),
            sizeBytes: newSize,
          };
          await new Promise<void>((resolve) => {
            try {
              const tx = database.transaction(IDB_SHIELD_STORE, 'readwrite');
              tx.objectStore(IDB_SHIELD_STORE).put(envelope, rec.key);
              tx.oncomplete = () => resolve();
              tx.onerror = () => resolve();
            } catch {
              resolve();
            }
          });
          totalBytes = totalBytes - rec.sizeBytes + newSize;
        }
      }
    }
  } catch {
    // Non-blocking safeguard
  } finally {
    try {
      database.close();
    } catch {}
  }
}

export function loadBlobFromIndexedDB<T = unknown>(key: string): Promise<T | null> {
  return openShieldIndexedDB().then((database) => {
    if (!database) return null;
    return new Promise<T | null>((resolve) => {
      try {
        const tx = database.transaction(IDB_SHIELD_STORE, 'readonly');
        const req = tx.objectStore(IDB_SHIELD_STORE).get(key);
        req.onsuccess = () => {
          const result = unwrapIdbRecord<T>(req.result);
          database.close();
          resolve(result);
        };
        req.onerror = () => {
          database.close();
          resolve(null);
        };
      } catch {
        try {
          database.close();
        } catch {}
        resolve(null);
      }
    });
  });
}

export function saveBlobToIndexedDB(key: string, value: unknown): void {
  if (typeof window === 'undefined' || !('indexedDB' in window)) return;
  const sizeBytes = estimateJsonBytes(value);
  const envelope: IdbStoredEnvelope = {
    __cpIdbWrap: 1,
    value,
    updatedAt: Date.now(),
    sizeBytes,
  };

  openShieldIndexedDB().then((database) => {
    if (!database) return;
    try {
      const tx = database.transaction(IDB_SHIELD_STORE, 'readwrite');
      tx.objectStore(IDB_SHIELD_STORE).put(envelope, key);
      tx.oncomplete = () => {
        database.close();
        if (!idbBudgetPruneScheduled) {
          idbBudgetPruneScheduled = true;
          setTimeout(() => {
            idbBudgetPruneScheduled = false;
            enforceIndexedDBRollingBudget().catch(() => {});
          }, 1200);
        }
      };
      tx.onerror = () => database.close();
    } catch {
      try {
        database.close();
      } catch {}
    }
  });
}

export function shouldBootFirestoreInMemoryMode(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return (
      sessionStorage.getItem(SAFE_MEMORY_FLAG_KEY) === '1' ||
      localStorage.getItem(SAFE_MEMORY_FLAG_KEY) === '1'
    );
  } catch {
    return false;
  }
}

export function clearFirestoreMemoryFallbackFlag(): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(SAFE_MEMORY_FLAG_KEY);
    localStorage.removeItem(SAFE_MEMORY_FLAG_KEY);
  } catch {}
}

export function handleProtectedFirestoreFailure(
  err: unknown,
  activeUid?: string | null
): { isQuotaOrAssertion: boolean; friendlyHindiMessage: string } {
  const isQuotaOrAssertion = isFirestoreInternalAssertionOrQuotaError(err);
  if (isQuotaOrAssertion) {
    enforceLocalStorageHeadroom(activeUid, { aggressive: true });
    try {
      sessionStorage.setItem(SAFE_MEMORY_FLAG_KEY, '1');
      localStorage.setItem(SAFE_MEMORY_FLAG_KEY, '1');
    } catch {}
    return {
      isQuotaOrAssertion: true,
      friendlyHindiMessage:
        'फोन की अस्थायी मेमोरी (Cache) भरने से डेटाबेस अटक गया था — सुरक्षा कवच ने जगह खाली कर दी है। कृपया ऐप एक बार बंद करके दोबारा खोलें (या रीलोड करें) और फिर प्रयास करें।',
    };
  }

  const code = String((err as any)?.code || 'error');
  const rawMsg = String((err as any)?.message || '');
  const shortMsg = rawMsg.length > 140 ? `${rawMsg.slice(0, 140)}...` : rawMsg;
  return {
    isQuotaOrAssertion: false,
    friendlyHindiMessage: `त्रुटि (${code}): ${shortMsg || 'कृपया इंटरनेट जांच कर पुनः प्रयास करें।'}`,
  };
}
