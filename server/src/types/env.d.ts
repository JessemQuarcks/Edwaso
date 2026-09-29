// Typed view of the environment variables this app reads (see .env.example).
declare global {
  namespace NodeJS {
    interface ProcessEnv {
      PORT?: string;
      NODE_ENV?: 'development' | 'production' | 'test';
      MONGODB_URI?: string;
      JWT_SECRET?: string;
      CLIENT_URL?: string;
      CURRENCY?: string;
      STRIPE_SECRET_KEY?: string;
      STRIPE_WEBHOOK_SECRET?: string;
      ADMIN_EMAIL?: string;
      ADMIN_PASSWORD?: string;
    }
  }
}

export {};
