import { Rider, DeliveryEntry, SettlementRecord } from '../types';
import { BASE_RATE, INCENTIVE_RATE, getTodayDateString, getDaysAgoDateString } from './formatters';

const RIDERS_STORAGE_KEY = 'courier_riders_v1';
const DELIVERIES_STORAGE_KEY = 'courier_deliveries_v1';
const SETTLEMENTS_STORAGE_KEY = 'courier_settlements_v1';

function getRidersKey(userId?: string) {
  return userId ? `courier_riders_u_${userId}` : RIDERS_STORAGE_KEY;
}

function getDeliveriesKey(userId?: string) {
  return userId ? `courier_deliveries_u_${userId}` : DELIVERIES_STORAGE_KEY;
}

function getSettlementsKey(userId?: string) {
  return userId ? `courier_settlements_u_${userId}` : SETTLEMENTS_STORAGE_KEY;
}

export const INITIAL_RIDERS: Rider[] = [
  {
    id: 'rider_1',
    name: 'Rahul Sharma',
    phone: '9876543210',
    vehicleType: 'Hero Splendor (Bike)',
    joinedDate: '2026-01-10',
    active: true,
    order: 0,
  },
  {
    id: 'rider_2',
    name: 'Amit Kumar',
    phone: '9812345678',
    vehicleType: 'Honda Activa (Scooter)',
    joinedDate: '2026-02-01',
    active: true,
    order: 1,
  },
  {
    id: 'rider_3',
    name: 'Priya Singh',
    phone: '9765432109',
    vehicleType: 'Ather 450X (EV)',
    joinedDate: '2026-03-15',
    active: true,
    order: 2,
  },
];

function generateInitialDeliveries(riders: Rider[]): DeliveryEntry[] {
  const entries: DeliveryEntry[] = [];
  // Generate sample deliveries for the last 10 days
  const sampleCounts = [
    { daysAgo: 0, riderIdx: 0, parcels: 65, inc: true, status: 'Unpaid' as const },
    { daysAgo: 0, riderIdx: 1, parcels: 52, inc: true, status: 'Unpaid' as const },
    { daysAgo: 0, riderIdx: 2, parcels: 48, inc: false, status: 'Unpaid' as const },
    { daysAgo: 1, riderIdx: 0, parcels: 70, inc: true, status: 'Unpaid' as const },
    { daysAgo: 1, riderIdx: 1, parcels: 58, inc: false, status: 'Unpaid' as const },
    { daysAgo: 1, riderIdx: 2, parcels: 62, inc: true, status: 'Unpaid' as const },
    { daysAgo: 2, riderIdx: 0, parcels: 60, inc: true, status: 'Unpaid' as const },
    { daysAgo: 2, riderIdx: 2, parcels: 55, inc: true, status: 'Unpaid' as const },
    { daysAgo: 3, riderIdx: 1, parcels: 45, inc: false, status: 'Paid' as const, paidAt: '2026-09-09T14:30:00.000Z' },
    { daysAgo: 4, riderIdx: 0, parcels: 72, inc: true, status: 'Paid' as const, paidAt: '2026-09-08T18:00:00.000Z' },
    { daysAgo: 5, riderIdx: 1, parcels: 50, inc: false, status: 'Paid' as const, paidAt: '2026-09-08T18:00:00.000Z' },
    { daysAgo: 6, riderIdx: 2, parcels: 64, inc: true, status: 'Paid' as const, paidAt: '2026-09-07T11:20:00.000Z' },
  ];

  sampleCounts.forEach((item, idx) => {
    const rider = riders[item.riderIdx] || riders[0];
    const date = getDaysAgoDateString(item.daysAgo);
    const baseAmount = item.parcels * BASE_RATE;
    const incentiveAmount = item.parcels * (item.inc ? INCENTIVE_RATE : 0);
    const totalEarnings = baseAmount + incentiveAmount;

    entries.push({
      id: `del_${Date.now() - idx * 86400000}_${idx}`,
      riderId: rider.id,
      riderName: rider.name,
      riderPhone: rider.phone,
      date,
      parcels: item.parcels,
      baseRate: BASE_RATE,
      hasIncentive: item.inc,
      incentiveRate: INCENTIVE_RATE,
      baseAmount,
      incentiveAmount,
      totalEarnings,
      status: item.status,
      paidAt: item.paidAt,
      createdAt: new Date(Date.now() - item.daysAgo * 86400000).toISOString(),
    });
  });

  return entries;
}

export function loadRidersFromStorage(userId?: string): Rider[] {
  try {
    const key = getRidersKey(userId);
    const raw = localStorage.getItem(key);
    if (!raw) {
      if (userId) {
        // Logged-in user starts with empty list until loaded from Firestore
        return [];
      }
      localStorage.setItem(key, JSON.stringify(INITIAL_RIDERS));
      return INITIAL_RIDERS;
    }
    const parsed = JSON.parse(raw);
    const list: Rider[] = Array.isArray(parsed) ? parsed : [];
    return list.slice().sort((a, b) => {
      const orderA = typeof a.order === 'number' ? a.order : 99999;
      const orderB = typeof b.order === 'number' ? b.order : 99999;
      if (orderA !== orderB) return orderA - orderB;
      return (a.joinedDate < b.joinedDate ? 1 : -1);
    });
  } catch (err) {
    console.error('Error loading riders from storage', err);
    return userId ? [] : INITIAL_RIDERS;
  }
}

export function saveRidersToStorage(riders: Rider[], userId?: string): void {
  try {
    localStorage.setItem(getRidersKey(userId), JSON.stringify(riders));
  } catch (err) {
    console.error('Error saving riders to storage', err);
  }
}

export function loadDeliveriesFromStorage(riders: Rider[], userId?: string): DeliveryEntry[] {
  try {
    const key = getDeliveriesKey(userId);
    const raw = localStorage.getItem(key);
    if (!raw) {
      if (userId) {
        return [];
      }
      const initialDeliveries = generateInitialDeliveries(riders);
      localStorage.setItem(key, JSON.stringify(initialDeliveries));
      return initialDeliveries;
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error('Error loading deliveries from storage', err);
    return [];
  }
}

export function saveDeliveriesToStorage(deliveries: DeliveryEntry[], userId?: string): void {
  try {
    localStorage.setItem(getDeliveriesKey(userId), JSON.stringify(deliveries));
  } catch (err) {
    console.error('Error saving deliveries to storage', err);
  }
}

export function loadSettlementsFromStorage(userId?: string): SettlementRecord[] {
  try {
    const key = getSettlementsKey(userId);
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error('Error loading settlements from storage', err);
    return [];
  }
}

export function saveSettlementsToStorage(settlements: SettlementRecord[], userId?: string): void {
  try {
    localStorage.setItem(getSettlementsKey(userId), JSON.stringify(settlements));
  } catch (err) {
    console.error('Error saving settlements to storage', err);
  }
}

const SETTINGS_STORAGE_KEY = 'courier_settings_v1';

function getSettingsKey(userId?: string) {
  return userId ? `courier_settings_u_${userId}` : SETTINGS_STORAGE_KEY;
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

/**
 * Loads all active festival greeting sent records.
 * Automatically purges and filters out any records older than 24 hours.
 */
export function loadFestivalGreetingSentRecords(): FestivalGreetingSentRecord[] {
  try {
    const raw = localStorage.getItem(FESTIVAL_SENT_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const now = Date.now();
    // Auto-expire records older than 24 hours
    const active = parsed.filter(
      (r) => r && r.riderId && r.festivalId && (now - (r.sentAt || 0) < FESTIVAL_SENT_EXPIRY_MS)
    );
    // If some records expired, persist the cleaned list back to storage
    if (active.length !== parsed.length) {
      localStorage.setItem(FESTIVAL_SENT_STORAGE_KEY, JSON.stringify(active));
    }
    return active;
  } catch (err) {
    console.error('Error loading festival greeting sent records from storage', err);
    return [];
  }
}

/**
 * Records that a festival greeting was sent to a rider.
 * Replaces any existing record for that specific (riderId, festivalId) pair with the new timestamp.
 */
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

/**
 * Checks whether a greeting for this festival has been sent to the rider in the last 24 hours.
 */
export function isFestivalGreetingSentWithin24Hours(
  records: FestivalGreetingSentRecord[],
  riderId: string,
  festivalId: string
): { isSent: boolean; sentAt?: number; hoursRemaining?: number } {
  const now = Date.now();
  const record = records.find(
    (r) => r.riderId === riderId && r.festivalId === festivalId && (now - r.sentAt < FESTIVAL_SENT_EXPIRY_MS)
  );
  if (!record) return { isSent: false };
  const msLeft = FESTIVAL_SENT_EXPIRY_MS - (now - record.sentAt);
  const hoursRemaining = Math.max(1, Math.ceil(msLeft / (60 * 60 * 1000)));
  return { isSent: true, sentAt: record.sentAt, hoursRemaining };
}


