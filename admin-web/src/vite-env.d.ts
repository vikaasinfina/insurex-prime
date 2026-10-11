/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FIREBASE_API_KEY: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN: string;
  readonly VITE_FIREBASE_PROJECT_ID: string;
  readonly VITE_FIREBASE_STORAGE_BUCKET: string;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID: string;
  readonly VITE_FIREBASE_APP_ID: string;
  /** Optional InsuroX backend origin. When unset, pages use built-in demo data. */
  readonly VITE_API_BASE_URL?: string;
  /** Days before expiry when a policy can be renewed (default 30). */
  readonly VITE_RENEWABLE_WITHIN_DAYS?: string;
}

declare namespace NodeJS {
  // Server-only variables; never expose these through VITE_*.
  interface ProcessEnv {
    readonly NODE_ENV?: string;
    readonly FIREBASE_API_KEY?: string;
    readonly VITE_FIREBASE_API_KEY: string;
    readonly AUTH_ADMIN_EMAILS?: string;
    readonly AUTH_SESSION_SECRET?: string;
  }
}
