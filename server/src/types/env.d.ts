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
      /** The API's public origin, used in uploaded image URLs (local image store). */
      PUBLIC_API_URL?: string;
      /** Where the local image store writes files; default ./uploads. */
      UPLOAD_DIR?: string;
      /** cloudinary://<api_key>:<api_secret>@<cloud_name>. When set, uploads go to Cloudinary. */
      CLOUDINARY_URL?: string;
      /** `npm run copy-db` only: the database to copy into. */
      TARGET_MONGODB_URI?: string;
      STRIPE_SECRET_KEY?: string;
      STRIPE_WEBHOOK_SECRET?: string;
    }
  }
}

export {};
