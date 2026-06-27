/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FIREBASE_API_KEY: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN: string;
  readonly VITE_FIREBASE_PROJECT_ID: string;
  readonly VITE_FIREBASE_STORAGE_BUCKET: string;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID: string;
  readonly VITE_FIREBASE_APP_ID: string;
  readonly VITE_FIREBASE_VAPID_KEY: string;
  readonly VITE_GOOGLE_CLIENT_ID?: string;
  readonly VITE_GOOGLE_MAPS_API_KEY: string;
  readonly VITE_GOOGLE_PLACES_API_KEY: string;
  readonly VITE_GOOGLE_SHEETS_API_KEY: string;
  readonly VITE_GOOGLE_MAPS_MAP_ID: string;
  readonly VITE_ENABLE_DEV_AUTH_BYPASS?: string;
  readonly VITE_APP_ENV?: string;
  readonly VITE_RELEASE_VERSION?: string;
  readonly VITE_RELEASE_COMMIT?: string;
  readonly VITE_RELEASE_COMMIT_FULL?: string;
  readonly VITE_RELEASE_DEPLOYED_AT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
