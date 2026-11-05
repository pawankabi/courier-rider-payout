import { db } from '../firebase';
import { 
  doc, 
  setDoc, 
  getDoc, 
  getDocs, 
  collection 
} from 'firebase/firestore';
import { 
  Rider, 
  DeliveryEntry, 
  SettlementRecord, 
  DailyCodSheetData, 
  HubAutoBackupSnapshot 
} from '../types';
import { getTodayDateString } from '../utils/formatters';
import { cleanForFirestore } from './firestoreSync';
import { exportAllCodDataForBackup } from './codService';

const LOCAL_AUTO_BACKUP_KEY_PREFIX = 'cp_auto_backup_hub_';

/**
 * Creates an automated cloud snapshot of the entire hub state into Firestore hubs/{hubId}/auto_backups/{date}
 */
export async function createAutoCloudBackup(
  hubId: string,
  riders: Rider[],
  entries: DeliveryEntry[],
  settlements: SettlementRecord[],
  settings?: any
): Promise<HubAutoBackupSnapshot | null> {
  const effectiveHubId = (hubId || 'guest').trim();
  if (!effectiveHubId || effectiveHubId === 'guest') return null;

  const todayStr = getTodayDateString();
  const backupId = `auto_backup_${todayStr}`;

  // Gather COD sheets as well
  let codSheets: DailyCodSheetData[] = [];
  try {
    const codData = await exportAllCodDataForBackup(effectiveHubId);
    codSheets = codData.sheets || [];
  } catch {}

  const totalCodAmount = codSheets.reduce((sum, sheet) => {
    return sum + (sheet.entries || []).reduce((s, e) => s + (Number(e.totalCod) || 0), 0);
  }, 0);

  const totalCashDeposited = codSheets.reduce((sum, sheet) => {
    return sum + (sheet.entries || []).reduce((s, e) => s + (Number(e.cashDeposit) || 0), 0);
  }, 0);

  const snapshot: HubAutoBackupSnapshot = {
    id: backupId,
    date: todayStr,
    createdAt: new Date().toISOString(),
    createdBy: 'System Auto-Backup',
    hubId: effectiveHubId,
    summary: {
      totalRiders: (riders || []).filter((r) => !r.isDeleted).length,
      totalDeliveries: (entries || []).filter((e) => !e.isDeleted).length,
      totalSettlements: (settlements || []).filter((s) => !s.isDeleted).length,
      totalCodSheets: codSheets.length,
      totalCodAmount,
      totalCashDeposited,
    },
    riders: riders || [],
    deliveries: entries || [],
    settlements: settlements || [],
    codSheets,
    settings: settings || null,
  };

  // 1. Save to local storage for instant offline access
  try {
    localStorage.setItem(`${LOCAL_AUTO_BACKUP_KEY_PREFIX}${effectiveHubId}_${todayStr}`, JSON.stringify(snapshot));
  } catch {}

  // 2. Commit to Firestore
  if (db) {
    try {
      const backupRef = doc(db, 'hubs', effectiveHubId, 'auto_backups', todayStr);
      await setDoc(backupRef, cleanForFirestore(snapshot), { merge: true });
    } catch (err) {
      console.warn('Auto cloud backup firestore write notice:', err);
    }
  }

  return snapshot;
}

/**
 * Loads list of available cloud backups for this hub
 */
export async function loadAutoCloudBackups(hubId: string): Promise<HubAutoBackupSnapshot[]> {
  const effectiveHubId = (hubId || 'guest').trim();
  const backupsMap = new Map<string, HubAutoBackupSnapshot>();

  // 1. Load from local storage
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(`${LOCAL_AUTO_BACKUP_KEY_PREFIX}${effectiveHubId}_`)) {
        try {
          const raw = localStorage.getItem(key);
          if (raw) {
            const parsed = JSON.parse(raw) as HubAutoBackupSnapshot;
            if (parsed && parsed.date) {
              backupsMap.set(parsed.date, parsed);
            }
          }
        } catch {}
      }
    }
  } catch {}

  // 2. Query Firestore
  if (db && effectiveHubId && effectiveHubId !== 'guest') {
    try {
      const colRef = collection(db, 'hubs', effectiveHubId, 'auto_backups');
      const snaps = await getDocs(colRef);
      if (!snaps.empty) {
        snaps.docs.forEach((docSnap) => {
          const data = docSnap.data() as HubAutoBackupSnapshot;
          if (data && data.date) {
            backupsMap.set(data.date, data);
          }
        });
      }
    } catch (err) {
      console.warn('Fetch cloud backups notice:', err);
    }
  }

  const list = Array.from(backupsMap.values());
  return list.sort((a, b) => b.date.localeCompare(a.date));
}
