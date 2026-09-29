// Typed view of the environment variables this app reads (see .env.example).
declare global {
  namespace NodeJS {
    interface ProcessEnv {
      PORT?: string;
      NODE_ENV?: 'development' | 'production' | 'test';
      MONGODB_URI?: string;
      JWT_SECRET?: string;
      /** 32 random bytes, base64. Encrypts TOTP secrets at rest. */
      DATA_ENCRYPTION_KEY?: string;
      CLIENT_URL?: string;
      /** Express `trust proxy` setting; defaults to `loopback` (the Next.js dev proxy). */
      TRUST_PROXY?: string;
      CURRENCY?: string;
      STRIPE_SECRET_KEY?: string;
      STRIPE_WEBHOOK_SECRET?: string;
    }
  }
}

export {};
