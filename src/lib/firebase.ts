// src/lib/firebase.ts

import { initializeApp, getApps, FirebaseApp } from "firebase/app";
import { initializeFirestore, Firestore, persistentLocalCache } from "firebase/firestore";
import { getStorage, FirebaseStorage } from "firebase/storage";
import { getAuth, signInAnonymously, onAuthStateChanged, Auth } from "firebase/auth";
import { getFunctions, Functions } from "firebase/functions";

type RequiredEnv = {
  VITE_FIREBASE_API_KEY: string | undefined;
  VITE_FIREBASE_AUTH_DOMAIN: string | undefined;
  VITE_FIREBASE_PROJECT_ID: string | undefined;
  VITE_FIREBASE_STORAGE_BUCKET: string | undefined;
  VITE_FIREBASE_MESSAGING_SENDER_ID: string | undefined;
  VITE_FIREBASE_APP_ID: string | undefined;
};

const env: RequiredEnv = {
  VITE_FIREBASE_API_KEY: import.meta.env.VITE_FIREBASE_API_KEY,
  VITE_FIREBASE_AUTH_DOMAIN: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  VITE_FIREBASE_PROJECT_ID: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  VITE_FIREBASE_STORAGE_BUCKET: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  VITE_FIREBASE_MESSAGING_SENDER_ID: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  VITE_FIREBASE_APP_ID: import.meta.env.VITE_FIREBASE_APP_ID,
};

const missing = Object.entries(env)
  .filter(([, v]) => !v)
  .map(([k]) => k);

if (missing.length > 0) {
  throw new Error(`Missing Firebase env vars: ${missing.join(", ")}`);
}

const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY!,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN!,
  projectId: env.VITE_FIREBASE_PROJECT_ID!,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET!,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID!,
  appId: env.VITE_FIREBASE_APP_ID!,
};

let app: FirebaseApp;
if (!getApps().length) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApps()[0];
}

export const db: Firestore = initializeFirestore(app, {
  localCache: persistentLocalCache(),
});
export const storage: FirebaseStorage = getStorage(app);
export const auth: Auth = getAuth(app);
export const functions: Functions = getFunctions(app);

/**
 * authReady — resolves once Firebase Auth has determined the initial state.
 *
 * If anonymous sign-in fails (e.g. provider disabled in Firebase Console),
 * authReady still resolves so the app doesn't hang.
 */
export const authReady: Promise<void> = new Promise((resolve) => {
  const unsub = onAuthStateChanged(auth, (user) => {
    unsub();

    if (user) {
      resolve();
    } else {
      signInAnonymously(auth)
        .then(() => resolve())
        .catch((err: { code: string; message: string }) => {
          if (err.code === 'auth/admin-restricted-operation') {
            console.warn(
              '[firebase] ⚠️  Anonymous Authentication is DISABLED in the Firebase Console.\n' +
              '           Firestore rules are currently set to `if true;` so the app can still run.\n' +
              '           To enable full auth-gated security:\n' +
              '             1. Go to: https://console.firebase.google.com/project/_/authentication/providers\n' +
              '             2. Enable the "Anonymous" sign-in provider\n' +
              '             3. Prepare and review a Firestore rules change in a safe branch\n' +
              '             4. Request an approval-gated release-manager deploy for firestore:rules',
            );
          } else {
            console.warn(
              '[firebase] Anonymous sign-in failed — Firestore reads may be blocked.',
              err.code,
              err.message,
            );
          }
          resolve();
        });
    }
  });
});

export default app;
