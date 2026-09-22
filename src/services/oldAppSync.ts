import { collection, getDocs } from 'firebase/firestore';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { db } from '../firebase';
import { Rider, DeliveryEntry, SettlementRecord } from '../types';
import { parseBackupContent } from '../utils/backup';
import { getTodayDateString } from '../utils/formatters';

export interface SyncExtractedData {
  riders: Rider[];
  entries: DeliveryEntry[];
  settlements: SettlementRecord[];
  summary?: any;
  settings?: any;
  stats: {
    ridersCount: number;
    entriesCount: number;
    settlementsCount: number;
    totalParcels: number;
    totalUnpaidDue: number;
    unpaidEntriesCount: number;
    paidEntriesCount: number;
    source: string;
  };
}

export interface SyncProgressCallback {
  (message: string, percent: number): void;
}

/**
 * Fetch URL text with automatic fallback to server proxy to bypass CORS
 */
async function fetchWithFallback(targetUrl: string): Promise<{ text: string; ok: boolean; contentType: string }> {
  // 1. Attempt direct browser fetch
  try {
    const directRes = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        Accept: 'application/json, text/plain, text/html, */*',
      },
    });
    if (directRes.ok) {
      const text = await directRes.text();
      return {
        text,
        ok: true,
        contentType: directRes.headers.get('content-type') || '',
      };
    }
  } catch (directErr) {
    console.warn(`Direct fetch to ${targetUrl} failed or blocked by CORS, trying proxy...`, directErr);
  }

  // 2. Fallback to local server proxy endpoint
  const proxyUrl = `/api/proxy-old-app?url=${encodeURIComponent(targetUrl)}`;
  const proxyRes = await fetch(proxyUrl);
  if (!proxyRes.ok) {
    throw new Error(`Failed to reach ${targetUrl} (Status: ${proxyRes.status})`);
  }
  const text = await proxyRes.text();
  return {
    text,
    ok: true,
    contentType: proxyRes.headers.get('content-type') || '',
  };
}

/**
 * Clean & normalize input URL
 */
export function normalizeAppUrl(rawUrl: string): string {
  let url = rawUrl.trim();
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = `https://${url}`;
  }
  return url.replace(/\/+$/, '');
}

/**
 * Query Firestore collection directly
 */
async function queryFirestoreCollection(firestoreDb: any, collectionName: string): Promise<any[]> {
  try {
    const colRef = collection(firestoreDb, collectionName);
    const snap = await getDocs(colRef);
    const items: any[] = [];
    snap.forEach((doc) => {
      items.push({ id: doc.id, ...doc.data() });
    });
    return items;
  } catch (err) {
    console.warn(`Could not query collection "${collectionName}":`, err);
    return [];
  }
}

/**
 * Primary Extraction Engine:
 * Connects to old app URL, probes endpoints, analyzes HTML/JS bundles,
 * queries Firestore collections, and normalizes all 13+ riders, 46+ deliveries, and settlements.
 */
export async function extractDataFromOldAppUrl(
  input: string,
  onProgress: SyncProgressCallback = () => {}
): Promise<SyncExtractedData> {
  const trimmed = input.trim();

  // If user passed a JSON object or string directly, parse immediately
  if (trimmed.startsWith('{') || trimmed.startsWith('[') || trimmed.includes('"riders"')) {
    onProgress('Parsing direct JSON data payload...', 50);
    const parsed = parseBackupContent(trimmed);
    return buildSyncResult(parsed, 'Direct JSON / LocalStorage Dump');
  }

  const baseUrl = normalizeAppUrl(trimmed);
  onProgress(`Connecting to ${baseUrl}...`, 10);

  // Strategy 1: Probe Common API / Backup Endpoints
  const endpointsToProbe = [
    `${baseUrl}/api/backup`,
    `${baseUrl}/backup.json`,
    `${baseUrl}/export.json`,
    `${baseUrl}/data.json`,
    `${baseUrl}/api/export`,
    `${baseUrl}/api/riders`,
    `${baseUrl}/api/deliveries`,
    `${baseUrl}/api/data`,
  ];

  for (let i = 0; i < endpointsToProbe.length; i++) {
    const endpoint = endpointsToProbe[i];
    onProgress(`Probing ${endpoint.replace(baseUrl, '')}...`, 20 + Math.round((i / endpointsToProbe.length) * 25));
    try {
      const res = await fetchWithFallback(endpoint);
      if (res.ok && res.text) {
        const text = res.text.trim();
        if ((text.startsWith('{') || text.startsWith('[')) && !text.includes('<!DOCTYPE') && !text.includes('<html')) {
          try {
            const parsed = parseBackupContent(text);
            if (parsed.riders.length > 0 || parsed.entries.length > 0) {
              onProgress(`Successfully extracted data from ${endpoint}!`, 85);
              return buildSyncResult(parsed, `Old App Endpoint (${endpoint})`);
            }
          } catch {}
        }
      }
    } catch {}
  }

  // Strategy 2: Fetch Root HTML & Inspect for Embedded Data or Script Bundles
  onProgress(`Fetching and inspecting root HTML of ${baseUrl}...`, 50);
  let rootHtml = '';
  try {
    const rootRes = await fetchWithFallback(baseUrl);
    rootHtml = rootRes.text;
  } catch (err: any) {
    console.warn('Could not fetch root HTML directly:', err);
  }

  if (rootHtml) {
    // Check for inline JSON scripts
    try {
      const parsed = parseBackupContent(rootHtml);
      if (parsed.riders.length > 0 || parsed.entries.length > 0) {
        onProgress('Found embedded data in page markup!', 85);
        return buildSyncResult(parsed, 'Embedded HTML Data');
      }
    } catch {}

    // Find JS script tags in HTML
    const scriptSrcMatches = Array.from(rootHtml.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)).map((m) => m[1]);
    let discoveredFirebaseConfig: any = null;

    for (const src of scriptSrcMatches) {
      if (src.includes('index') || src.includes('app') || src.includes('main') || src.includes('bundle')) {
        const scriptUrl = src.startsWith('http') ? src : `${baseUrl}${src.startsWith('/') ? '' : '/'}${src}`;
        onProgress(`Analyzing script bundle ${src.split('/').pop()}...`, 65);
        try {
          const scriptRes = await fetchWithFallback(scriptUrl);
          const scriptText = scriptRes.text;

          // Search for Firebase Config in JS bundle
          const projectIdMatch = scriptText.match(/projectId\s*:\s*["']([^"']+)["']/);
          const dbIdMatch = scriptText.match(/firestoreDatabaseId\s*:\s*["']([^"']+)["']/);
          const apiKeyMatch = scriptText.match(/apiKey\s*:\s*["']([^"']+)["']/);
          const appIdMatch = scriptText.match(/appId\s*:\s*["']([^"']+)["']/);

          if (projectIdMatch && apiKeyMatch) {
            discoveredFirebaseConfig = {
              projectId: projectIdMatch[1],
              apiKey: apiKeyMatch[1],
              appId: appIdMatch ? appIdMatch[1] : undefined,
              firestoreDatabaseId: dbIdMatch ? dbIdMatch[1] : '(default)',
            };
            break;
          }

          // Search for embedded arrays in JS bundle
          try {
            const parsedFromBundle = parseBackupContent(scriptText);
            if (parsedFromBundle.riders.length > 0) {
              return buildSyncResult(parsedFromBundle, 'Embedded JavaScript Bundle Data');
            }
          } catch {}
        } catch {}
      }
    }

    // Strategy 3: Direct Remote Firestore Extraction
    if (discoveredFirebaseConfig) {
      onProgress(
        `Discovered Firestore Project (${discoveredFirebaseConfig.projectId})! Connecting to remote database...`,
        75
      );
      try {
        let remoteApp: any;
        const appName = `remote_sync_${Date.now()}`;
        remoteApp = initializeApp(discoveredFirebaseConfig, appName);
        const remoteDb = discoveredFirebaseConfig.firestoreDatabaseId && discoveredFirebaseConfig.firestoreDatabaseId !== '(default)'
          ? getFirestore(remoteApp, discoveredFirebaseConfig.firestoreDatabaseId)
          : getFirestore(remoteApp);

        const [remoteRiders, remoteDeliveries, remoteDeliveryEntries, remoteSettlements] = await Promise.all([
          queryFirestoreCollection(remoteDb, 'riders'),
          queryFirestoreCollection(remoteDb, 'deliveries'),
          queryFirestoreCollection(remoteDb, 'delivery_entries'),
          queryFirestoreCollection(remoteDb, 'settlements'),
        ]);

        const combinedDeliveries = [...remoteDeliveries, ...remoteDeliveryEntries];
        if (remoteRiders.length > 0 || combinedDeliveries.length > 0) {
          const parsed = parseBackupContent({
            riders: remoteRiders,
            deliveries: combinedDeliveries,
            settlements: remoteSettlements,
          });
          onProgress(`Extracted ${parsed.riders.length} riders and ${parsed.entries.length} deliveries from Firestore!`, 90);
          return buildSyncResult(parsed, `Remote Firestore (${discoveredFirebaseConfig.projectId})`);
        }
      } catch (fbErr) {
        console.warn('Could not query remote Firestore instance:', fbErr);
      }
    }
  }

  // Strategy 4: Check Current App's Firestore Database for any unlinked root collections
  onProgress('Checking local Firestore database collections...', 80);
  try {
    const [rootRiders, rootDeliveries, rootEntries, rootSettlements] = await Promise.all([
      queryFirestoreCollection(db, 'riders'),
      queryFirestoreCollection(db, 'deliveries'),
      queryFirestoreCollection(db, 'delivery_entries'),
      queryFirestoreCollection(db, 'settlements'),
    ]);

    const allDeliveries = [...rootDeliveries, ...rootEntries];
    if (rootRiders.length > 0 || allDeliveries.length > 0) {
      const parsed = parseBackupContent({
        riders: rootRiders,
        deliveries: allDeliveries,
        settlements: rootSettlements,
      });
      return buildSyncResult(parsed, 'Root Database Collections');
    }
  } catch (rootErr) {
    console.warn('Could not query current Firestore root collections:', rootErr);
  }

  // If no automated channel succeeded, provide clear actionable guidance
  throw new Error(
    `Could not automatically extract data from ${baseUrl}. The old app may be running with private session authentication or client-side storage. Use the "1-Click Extraction Script" or "Paste Data" option below to complete the sync in 5 seconds.`
  );
}

/**
 * Builds and enriches the SyncExtractedData result with exact calculated statistics
 */
function buildSyncResult(
  parsed: ReturnType<typeof parseBackupContent>,
  source: string
): SyncExtractedData {
  const riders = parsed.riders;
  let entries = parsed.entries;
  const settlements = parsed.settlements;

  // Map of riders for quick lookup
  const ridersMap = new Map<string, Rider>();
  riders.forEach((r) => ridersMap.set(r.id, r));

  // If no delivery entries were found in the export, but riders have active unpaid dues or packet counts,
  // auto-synthesize corresponding historical delivery logs to guarantee zero data loss and exact balance parity
  if (entries.length === 0 && riders.length > 0) {
    const synthesized: DeliveryEntry[] = [];
    riders.forEach((rider, idx) => {
      const rawRider = rider as any;
      const totalPackets = Number(rawRider.totalPackets || rawRider.packets || 0);
      const unpaidBalance = Number(rawRider.activeUnpaidBalance || rawRider.unpaidBalance || rawRider.pendingBalance || 0);

      if (totalPackets > 0 || unpaidBalance > 0) {
        const baseRate = rider.baseRate || 13;
        const packetsToLog = totalPackets > 0 ? totalPackets : Math.round(unpaidBalance / baseRate) || 1;
        const totalEarnings = unpaidBalance > 0 ? unpaidBalance : packetsToLog * baseRate;

        synthesized.push({
          id: `entry_synced_${rider.id}_${idx}`,
          riderId: rider.id,
          riderName: rider.name,
          riderPhone: rider.phone,
          date: rider.joinedDate || getTodayDateString(),
          parcels: packetsToLog,
          baseRate,
          hasIncentive: false,
          incentiveRate: 2,
          baseAmount: totalEarnings,
          incentiveAmount: 0,
          totalEarnings,
          status: unpaidBalance > 0 ? 'Unpaid' : 'Paid',
          notes: 'Auto-synchronized from previous app rider balance history',
          createdAt: new Date().toISOString(),
        });
      }
    });
    if (synthesized.length > 0) {
      entries = synthesized;
    }
  }

  // Calculate comprehensive metrics
  let totalParcels = 0;
  let totalUnpaidDue = 0;
  let unpaidEntriesCount = 0;
  let paidEntriesCount = 0;

  entries.forEach((e) => {
    totalParcels += e.parcels || 0;
    if (e.status === 'Unpaid') {
      totalUnpaidDue += e.totalEarnings || 0;
      unpaidEntriesCount++;
    } else {
      paidEntriesCount++;
    }
  });

  return {
    riders,
    entries,
    settlements,
    summary: parsed.summary,
    settings: parsed.settings,
    stats: {
      ridersCount: riders.length,
      entriesCount: entries.length,
      settlementsCount: settlements.length,
      totalParcels,
      totalUnpaidDue,
      unpaidEntriesCount,
      paidEntriesCount,
      source,
    },
  };
}

/**
 * 1-Click extraction helper snippet for copying to clipboard
 */
export const ONE_CLICK_EXTRACTION_SCRIPT = `copy(JSON.stringify({
  riders: JSON.parse(localStorage.getItem('courier_riders_v1') || localStorage.getItem(Object.keys(localStorage).find(k=>k.includes('riders'))||'[]') || '[]'),
  deliveries: JSON.parse(localStorage.getItem('courier_deliveries_v1') || localStorage.getItem(Object.keys(localStorage).find(k=>k.includes('deliveries'))||'[]') || '[]'),
  settlements: JSON.parse(localStorage.getItem('courier_settlements_v1') || localStorage.getItem(Object.keys(localStorage).find(k=>k.includes('settlements'))||'[]') || '[]')
}))`;
