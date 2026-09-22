import { Rider, DeliveryEntry, SettlementRecord } from '../types';
import { getTodayDateString } from './formatters';

interface BackupData {
  userEmail?: string | null;
  riders: Rider[];
  entries: DeliveryEntry[];
  settlements: SettlementRecord[];
  settings?: any;
}

/**
 * Generates and downloads a complete JSON backup file to the user's phone or computer.
 */
export function downloadJsonBackup({
  userEmail,
  riders,
  entries,
  settlements,
  settings,
}: BackupData): void {
  const totalParcels = entries.reduce((sum, e) => sum + (e.parcels || 0), 0);
  const totalEarnings = entries.reduce((sum, e) => sum + (e.totalEarnings || 0), 0);
  const unpaidCount = entries.filter((e) => e.status === 'Unpaid').length;
  const paidCount = entries.filter((e) => e.status === 'Paid').length;

  const backupPayload = {
    appName: 'Courier Rider Payout & Delivery Manager',
    version: '1.0',
    exportedAt: new Date().toISOString(),
    userEmail: userEmail || 'Local Guest User',
    summary: {
      totalRiders: riders.length,
      totalDeliveryEntries: entries.length,
      totalParcelsDelivered: totalParcels,
      totalPayoutINR: totalEarnings,
      unpaidEntriesCount: unpaidCount,
      paidEntriesCount: paidCount,
      totalSettlements: settlements.length,
    },
    riders,
    deliveries: entries,
    settlements,
    settings: settings || { defaultBaseRate: 13, defaultIncentiveRate: 2, incentivesEnabled: true },
  };

  const jsonString = JSON.stringify(backupPayload, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  
  const todayStr = getTodayDateString();
  const fileName = `courier_payout_backup_${todayStr}.json`;

  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', fileName);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  // Clean up object URL after download trigger
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export interface ParsedBackupResult {
  riders: Rider[];
  entries: DeliveryEntry[];
  settlements: SettlementRecord[];
  summary?: any;
  userEmail?: string;
  settings?: any;
}

function safeParseJsonString(val: any): any {
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
      try {
        return JSON.parse(trimmed);
      } catch {
        return val;
      }
    }
  }
  return val;
}

function isDeliveryItem(item: any): boolean {
  if (!item || typeof item !== 'object') return false;
  return (
    item.parcels !== undefined ||
    item.totalEarnings !== undefined ||
    item.baseAmount !== undefined ||
    (item.riderId !== undefined && item.date !== undefined) ||
    item.hasIncentive !== undefined
  );
}

function isRiderItem(item: any): boolean {
  if (!item || typeof item !== 'object') return false;
  // If it has parcels or grossTotal, it's not a rider
  if (item.parcels !== undefined || item.grossTotal !== undefined || item.netTotal !== undefined) {
    return false;
  }
  return (
    item.name !== undefined &&
    (item.phone !== undefined ||
      item.vehicleType !== undefined ||
      item.joinedDate !== undefined ||
      (typeof item.id === 'string' && item.id.toLowerCase().includes('rider')) ||
      item.active !== undefined)
  );
}

function isSettlementItem(item: any): boolean {
  if (!item || typeof item !== 'object') return false;
  return (
    item.grossTotal !== undefined ||
    item.netTotal !== undefined ||
    Array.isArray(item.entryIds) ||
    item.status === 'PAID'
  );
}

function normalizeRider(raw: any, index: number): Rider {
  const id = String(raw.id || raw._id || raw.riderId || raw.rider_id || `rider_${Date.now()}_${index}`);
  const name = String(raw.name || raw.riderName || raw.fullName || `Rider ${index + 1}`).trim();
  const phone = String(raw.phone || raw.riderPhone || raw.mobile || raw.contact || raw.phoneNumber || '').trim();
  const vehicleType = raw.vehicleType || raw.vehicle || raw.bike || raw.transport || 'Hero Splendor (Bike)';
  const joinedDate = raw.joinedDate || raw.joinDate || raw.createdDate || raw.date || getTodayDateString();
  const active = raw.active !== undefined ? Boolean(raw.active) : true;
  const order = typeof raw.order === 'number' ? raw.order : index;

  return {
    id,
    name,
    phone,
    vehicleType,
    joinedDate,
    active,
    order,
    baseRate: typeof raw.baseRate === 'number' ? raw.baseRate : undefined,
    incentiveRate: typeof raw.incentiveRate === 'number' ? raw.incentiveRate : undefined,
    incentiveEnabled: raw.incentiveEnabled !== undefined ? Boolean(raw.incentiveEnabled) : undefined,
  };
}

function normalizeDelivery(raw: any, index: number, ridersMap: Map<string, Rider>): DeliveryEntry {
  const id = String(raw.id || raw._id || raw.entryId || raw.entry_id || `entry_${Date.now()}_${index}`);
  const riderId = String(raw.riderId || raw.rider_id || raw.rider || '');
  const matchedRider = ridersMap.get(riderId);

  const riderName = String(raw.riderName || raw.name || matchedRider?.name || 'Unknown Rider');
  const riderPhone = String(raw.riderPhone || raw.phone || raw.mobile || matchedRider?.phone || '');
  const date = String(raw.date || raw.deliveryDate || raw.logDate || raw.entryDate || getTodayDateString());
  const parcels = Number(
    raw.parcels ??
    raw.packets ??
    raw.packetCount ??
    raw.deliveredPackets ??
    raw.count ??
    raw.totalParcels ??
    raw.packages ??
    0
  ) || 0;
  const baseRate = Number(raw.baseRate ?? matchedRider?.baseRate ?? 13) || 13;
  const hasIncentive = Boolean(raw.hasIncentive ?? raw.incentive ?? false);
  const incentiveRate = Number(raw.incentiveRate ?? matchedRider?.incentiveRate ?? 2) || 2;

  const baseAmount = typeof raw.baseAmount === 'number' ? raw.baseAmount : parcels * baseRate;
  const incentiveAmount =
    typeof raw.incentiveAmount === 'number' ? raw.incentiveAmount : parcels * (hasIncentive ? incentiveRate : 0);
  const totalEarnings =
    typeof raw.totalEarnings === 'number'
      ? raw.totalEarnings
      : (typeof raw.dailyPayout === 'number'
          ? raw.dailyPayout
          : (typeof raw.payoutAmount === 'number'
              ? raw.payoutAmount
              : (typeof raw.amount === 'number' ? raw.amount : baseAmount + incentiveAmount)));

  const rawStatus = String(raw.status || raw.paymentStatus || (raw.isPaid ? 'Paid' : 'Unpaid')).trim().toLowerCase();
  const status: 'Unpaid' | 'Paid' = (rawStatus === 'paid' || raw.isPaid === true) ? 'Paid' : 'Unpaid';
  const createdAt = raw.createdAt || raw.created_at || new Date().toISOString();

  return {
    id,
    riderId,
    riderName,
    riderPhone,
    date,
    parcels,
    baseRate,
    hasIncentive,
    incentiveRate,
    baseAmount,
    incentiveAmount,
    totalEarnings,
    status,
    paidAt: raw.paidAt || (status === 'Paid' ? (raw.paid_at || new Date().toISOString()) : undefined),
    advanceAmount: typeof raw.advanceAmount === 'number' ? raw.advanceAmount : undefined,
    advanceDate: raw.advanceDate,
    settlementId: raw.settlementId,
    notes: raw.notes || raw.remarks,
    createdAt,
  };
}

function normalizeSettlement(raw: any, index: number): SettlementRecord {
  return {
    id: String(raw.id || raw._id || `settlement_${Date.now()}_${index}`),
    riderId: String(raw.riderId || raw.rider_id || ''),
    riderName: String(raw.riderName || raw.name || 'Unknown Rider'),
    riderPhone: String(raw.riderPhone || raw.phone || ''),
    startDate: String(raw.startDate || raw.start_date || getTodayDateString()),
    endDate: String(raw.endDate || raw.end_date || getTodayDateString()),
    entryIds: Array.isArray(raw.entryIds) ? raw.entryIds.map(String) : [],
    totalParcels: Number(raw.totalParcels ?? raw.parcels ?? raw.packets) || 0,
    baseAmount: Number(raw.baseAmount) || 0,
    incentiveAmount: Number(raw.incentiveAmount) || 0,
    grossTotal: Number(raw.grossTotal ?? raw.total) || 0,
    advanceAmount: Number(raw.advanceAmount ?? raw.advance) || 0,
    advanceDate: raw.advanceDate,
    netTotal: Number(raw.netTotal ?? raw.payoutAmount ?? raw.netPayout) || 0,
    paidAt: String(raw.paidAt || raw.paid_at || new Date().toISOString()),
    status: 'PAID',
  };
}

/**
 * Robust universal parser for backups, JSON strings, localStorage dumps, and API responses
 */
export function parseBackupContent(content: string | any): ParsedBackupResult {
  let parsed: any = content;
  if (typeof content === 'string') {
    const trimmed = content.trim();
    // Check if HTML containing JSON script tags
    if (trimmed.startsWith('<!doctype') || trimmed.startsWith('<html') || trimmed.includes('<script')) {
      // Extract script tags that might contain JSON
      const scriptRegex = /<script[^>]*>([\s\S]*?)<\/script>/gi;
      let match;
      let extractedJson: any = null;
      while ((match = scriptRegex.exec(trimmed)) !== null) {
        const body = match[1].trim();
        if ((body.startsWith('{') && body.endsWith('}')) || (body.startsWith('[') && body.endsWith(']'))) {
          try {
            extractedJson = JSON.parse(body);
            if (extractedJson && (extractedJson.riders || extractedJson.deliveries || Array.isArray(extractedJson))) {
              parsed = extractedJson;
              break;
            }
          } catch {}
        }
      }
      if (!extractedJson) {
        // Search for JSON substrings
        const jsonMatch = trimmed.match(/\{[\s\S]*"riders"[\s\S]*\}/);
        if (jsonMatch) {
          try {
            parsed = JSON.parse(jsonMatch[0]);
          } catch {}
        }
      }
    } else {
      try {
        parsed = JSON.parse(trimmed);
      } catch {
        throw new Error('Invalid JSON format. Please provide valid JSON content.');
      }
    }
  }

  if (!parsed || (typeof parsed !== 'object' && !Array.isArray(parsed))) {
    throw new Error('Data payload is empty or corrupted.');
  }

  let rawRiders: any[] = [];
  let rawEntries: any[] = [];
  let rawSettlements: any[] = [];

  // Case 1: The backup itself is a top-level array of items
  if (Array.isArray(parsed)) {
    parsed.forEach((item) => {
      if (isDeliveryItem(item)) {
        rawEntries.push(item);
      } else if (isSettlementItem(item)) {
        rawSettlements.push(item);
      } else if (isRiderItem(item)) {
        rawRiders.push(item);
      } else {
        // Fallback: If it has riderId or parcels, assume delivery; otherwise rider
        if (item?.parcels !== undefined || item?.riderId !== undefined) {
          rawEntries.push(item);
        } else if (item?.name) {
          rawRiders.push(item);
        }
      }
    });
  } else {
    // Case 2: Object representation
    // Unwrap nested container wrappers like { data: ... } or { backup: ... }
    let targetObj = parsed;
    if (targetObj.data && typeof targetObj.data === 'object' && !Array.isArray(targetObj.data)) {
      targetObj = { ...targetObj, ...targetObj.data };
    }
    if (targetObj.backup && typeof targetObj.backup === 'object' && !Array.isArray(targetObj.backup)) {
      targetObj = { ...targetObj, ...targetObj.backup };
    }
    if (targetObj.payload && typeof targetObj.payload === 'object' && !Array.isArray(targetObj.payload)) {
      targetObj = { ...targetObj, ...targetObj.payload };
    }

    // Scan all keys (case-insensitive and handling localStorage dumps like 'courier_riders_v1')
    for (const key of Object.keys(targetObj)) {
      const lowerKey = key.toLowerCase();
      let value = safeParseJsonString(targetObj[key]);

      // If value is an object (id -> item map) rather than array, convert to array
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        const valuesList = Object.values(value);
        if (valuesList.length > 0 && typeof valuesList[0] === 'object') {
          value = valuesList;
        }
      }

      if (Array.isArray(value)) {
        if (
          lowerKey === 'riders' ||
          lowerKey === 'rider' ||
          lowerKey === 'riderslist' ||
          lowerKey === 'riders_list' ||
          lowerKey === 'operators' ||
          lowerKey === 'operator' ||
          lowerKey === 'drivers' ||
          lowerKey === 'agents' ||
          lowerKey === 'workers' ||
          lowerKey.includes('courier_riders')
        ) {
          rawRiders.push(...value);

          // If operators have nested logs, extract them as delivery entries
          value.forEach((op: any, opIdx: number) => {
            if (op && typeof op === 'object' && Array.isArray(op.logs)) {
              op.logs.forEach((log: any, logIdx: number) => {
                const dateStr = targetObj.log_list_timestamp
                  ? new Date(targetObj.log_list_timestamp).toISOString().slice(0, 10)
                  : getTodayDateString();
                rawEntries.push({
                  id: log.log_id || log.id || `entry_op_${opIdx}_${logIdx}`,
                  riderId: String(op.id || `rider_op_${opIdx}`),
                  riderName: String(op.name || `Operator ${opIdx + 1}`),
                  riderPhone: String(Array.isArray(op.email) ? op.email[0] : (op.phone || op.email || '')),
                  date: dateStr,
                  parcels: typeof log.parcels === 'number' ? log.parcels : 45,
                  baseRate: 13,
                  hasIncentive: false,
                  incentiveRate: 2,
                  status: 'Unpaid',
                  notes: log.description || log.url || '',
                });
              });
            }
          });
        } else if (
          lowerKey === 'deliveries' ||
          lowerKey === 'entries' ||
          lowerKey === 'deliveryentries' ||
          lowerKey === 'delivery_entries' ||
          lowerKey === 'dailyentries' ||
          lowerKey === 'daily_entries' ||
          lowerKey === 'logs' ||
          lowerKey === 'records' ||
          lowerKey.includes('courier_deliveries')
        ) {
          rawEntries.push(...value);
        } else if (
          lowerKey === 'settlements' ||
          lowerKey === 'settlement' ||
          lowerKey === 'settlementrecords' ||
          lowerKey.includes('courier_settlements')
        ) {
          rawSettlements.push(...value);
        }
      }
    }

    // If still not identified, inspect any unknown arrays in targetObj
    if (rawRiders.length === 0 && rawEntries.length === 0) {
      for (const [key, val] of Object.entries(targetObj)) {
        const parsedVal = safeParseJsonString(val);
        const list = Array.isArray(parsedVal)
          ? parsedVal
          : parsedVal && typeof parsedVal === 'object'
          ? Object.values(parsedVal)
          : [];

        if (Array.isArray(list) && list.length > 0 && typeof list[0] === 'object') {
          list.forEach((item: any) => {
            if (isDeliveryItem(item)) {
              rawEntries.push(item);
            } else if (isSettlementItem(item)) {
              rawSettlements.push(item);
            } else if (isRiderItem(item)) {
              rawRiders.push(item);
            }
          });
        }
      }
    }

    // Check nested users structure e.g. { users: { <uid>: { riders: [...], deliveries: [...] } } }
    if (rawRiders.length === 0 && rawEntries.length === 0 && targetObj.users && typeof targetObj.users === 'object') {
      const userObjects = Object.values(targetObj.users);
      userObjects.forEach((uObj: any) => {
        if (uObj && typeof uObj === 'object') {
          if (Array.isArray(uObj.riders)) rawRiders.push(...uObj.riders);
          if (Array.isArray(uObj.deliveries)) rawEntries.push(...uObj.deliveries);
          if (Array.isArray(uObj.entries)) rawEntries.push(...uObj.entries);
          if (Array.isArray(uObj.settlements)) rawSettlements.push(...uObj.settlements);
        }
      });
    }
  }

  // Deduplicate riders by ID (or name+phone)
  const ridersMap = new Map<string, Rider>();
  rawRiders.forEach((raw, idx) => {
    const r = normalizeRider(raw, idx);
    if (!ridersMap.has(r.id)) {
      ridersMap.set(r.id, r);
    }
  });

  // If riders are missing but entries have rider info, auto-derive riders from deliveries
  rawEntries.forEach((raw, idx) => {
    const riderId = String(raw.riderId || raw.rider_id || '');
    if (riderId && !ridersMap.has(riderId)) {
      const name = String(raw.riderName || raw.name || `Rider ${ridersMap.size + 1}`);
      const phone = String(raw.riderPhone || raw.phone || '');
      const derivedRider: Rider = {
        id: riderId,
        name,
        phone,
        vehicleType: 'Hero Splendor (Bike)',
        joinedDate: String(raw.date || getTodayDateString()),
        active: true,
        order: ridersMap.size,
      };
      ridersMap.set(riderId, derivedRider);
    }
  });

  const normalizedRiders = Array.from(ridersMap.values());

  // Deduplicate entries by ID
  const entriesMap = new Map<string, DeliveryEntry>();
  rawEntries.forEach((raw, idx) => {
    const entry = normalizeDelivery(raw, idx, ridersMap);
    if (!entriesMap.has(entry.id)) {
      entriesMap.set(entry.id, entry);
    }
  });
  const normalizedEntries = Array.from(entriesMap.values());

  // Deduplicate settlements by ID
  const settlementsMap = new Map<string, SettlementRecord>();
  rawSettlements.forEach((raw, idx) => {
    const s = normalizeSettlement(raw, idx);
    if (!settlementsMap.has(s.id)) {
      settlementsMap.set(s.id, s);
    }
  });
  const normalizedSettlements = Array.from(settlementsMap.values());

  if (normalizedRiders.length === 0 && normalizedEntries.length === 0 && normalizedSettlements.length === 0) {
    const detectedKeys = Object.keys(parsed).slice(0, 8).join(', ');
    throw new Error(
      `No riders or delivery entries found in this backup file (Found keys: [${detectedKeys || 'none'}]). Please ensure you selected a valid Courier Rider Payout JSON file.`
    );
  }

  let rawSettings: any = null;
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    rawSettings =
      parsed.settings ||
      parsed.rateConfig ||
      parsed.userRateConfig ||
      parsed.config ||
      (parsed.data && typeof parsed.data === 'object' ? (parsed.data.settings || parsed.data.rateConfig) : null);
  }

  return {
    riders: normalizedRiders,
    entries: normalizedEntries,
    settlements: normalizedSettlements,
    summary: parsed.summary,
    userEmail: parsed.userEmail,
    settings: rawSettings,
  };
}

/**
 * Parses a File object by extracting its text content and running universal parser
 */
export async function parseBackupFile(file: File): Promise<ParsedBackupResult> {
  const text = await file.text();
  return parseBackupContent(text);
}
