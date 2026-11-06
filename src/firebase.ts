import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getAuth, 
  GoogleAuthProvider, 
  setPersistence, 
  browserLocalPersistence, 
  indexedDBLocalPersistence 
} from 'firebase/auth';
import { 
  initializeFirestore, 
  getFirestore, 
  Firestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  setLogLevel
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

// Silence internal connection retry warnings so harmless transient reconnects do not trigger alerts
try {
  setLogLevel('silent');
} catch {}

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

export const auth = getAuth(app);

// Explicitly configure local persistence to stop auth state resets on mobile screen locks / sleep / app switching
if (typeof window !== 'undefined') {
  setPersistence(auth, indexedDBLocalPersistence)
    .catch(() => setPersistence(auth, browserLocalPersistence))
    .catch(() => {});
}

// Permanent Single Source of Truth for Firestore Database Instance
export const UNIFIED_FIRESTORE_DATABASE_ID = 'ai-studio-courierriderpayo-41843168-17ea-4603-a026-a68d04853b7c';

// Use initializeFirestore with experimentalAutoDetectLongPolling & persistentLocalCache
// to reliably connect through proxies, sandboxed iframes & mobile connections while enabling offline capability
let firestoreDb: Firestore;
try {
  firestoreDb = initializeFirestore(
    app,
    {
      experimentalAutoDetectLongPolling: true,
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
      }),
    },
    UNIFIED_FIRESTORE_DATABASE_ID
  );
} catch {
  try {
    firestoreDb = initializeFirestore(
      app,
      {
        experimentalAutoDetectLongPolling: true,
      },
      UNIFIED_FIRESTORE_DATABASE_ID
    );
  } catch {
    firestoreDb = getFirestore(app, UNIFIED_FIRESTORE_DATABASE_ID);
  }
}

export const db = firestoreDb;

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: 'select_account',
});

export default app;
