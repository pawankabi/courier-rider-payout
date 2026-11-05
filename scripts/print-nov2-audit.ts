import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import fs from 'fs';

const config = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf-8'));
const app = initializeApp(config);
const db = getFirestore(app, config.firestoreDatabaseId || undefined);

async function main() {
  const hubId = '9eQSF1ls7nhBnXG06RHu2qNWIr62';
  const snap = await getDocs(collection(db, 'workspaces', hubId, 'cod_audit_logs'));

  const logs = snap.docs.map((d) => d.data());
  logs.sort((a: any, b: any) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  const nov2Logs = logs.filter((l: any) => l.date === '2026-11-02');
  console.log(`TOTAL AUDIT LOGS FOR 2026-11-02: ${nov2Logs.length}`);
  nov2Logs.forEach((l: any, i: number) => {
    console.log(`[${i + 1}] Time: ${l.timestamp} | Rider: ${l.riderName} | Field: ${l.field} | Prev: ${l.previousValue} -> New: ${l.newValue} | By: ${l.changedBy} | Notes: ${l.notes || ''}`);
  });

  process.exit(0);
}

main().catch(console.error);
