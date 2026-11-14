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
  persistentSingleTabManager,
  memoryLocalCache,
  setLogLevel
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import {
  enforceLocalStorageHeadroom,
  shouldBootFirestoreInMemoryMode,
  clearFirestoreMemoryFallbackFlag,
} from './services/appStorageAndFirebaseShield';

// Run pre-boot storage safety shield BEFORE Firestore initializes so old WebStorage bloat never triggers QuotaExceededError/b815
if (typeof window !== 'undefined') {
  enforceLocalStorageHeadroom();
}

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

// Use single-tab IndexedDB persistence (zero localStorage firestore_clients_* writes) with memoryLocalCache safety fallback
let firestoreDb: Firestore;
const useSafeMemoryBoot = shouldBootFirestoreInMemoryMode();
try {
  firestoreDb = initializeFirestore(
    app,
    {
      experimentalAutoDetectLongPolling: true,
      localCache: useSafeMemoryBoot
        ? memoryLocalCache()
        : persistentLocalCache({
            tabManager: persistentSingleTabManager({ forceOwnership: true }),
          }),
    },
    UNIFIED_FIRESTORE_DATABASE_ID
  );
  if (useSafeMemoryBoot) {
    // Once safely booted after recovery, allow normal single-tab persistence on subsequent cold boots
    clearFirestoreMemoryFallbackFlag();
  }
} catch {
  try {
    firestoreDb = initializeFirestore(
      app,
      {
        experimentalAutoDetectLongPolling: true,
        localCache: memoryLocalCache(),
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
