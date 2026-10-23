import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc } from 'firebase/firestore';
import fs from 'fs';

const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));

const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId || undefined);

async function seed() {
  const latestBuildTime = 1729705000000;
  const updateData = {
    version: '1.0.8',
    buildTime: latestBuildTime,
    buildDate: '2026-10-23',
    releaseNotes: '15-Minute Fingerprint Inactivity Lock & Auto-Close Fix, Android Compatibility',
    updatedAt: new Date().toISOString(),
  };

  console.log('Publishing latest update to Firestore app_updates/latest...', updateData);
  await setDoc(doc(db, 'app_updates', 'latest'), updateData, { merge: true });
  console.log('✅ Successfully published v1.0.8 manifest to Firestore!');
  process.exit(0);
}

seed().catch((err) => {
  console.error('❌ Failed to publish manifest to Firestore:', err);
  process.exit(1);
});
