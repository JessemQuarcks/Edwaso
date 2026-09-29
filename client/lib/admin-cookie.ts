// Must match adminCookieName() in server/src/middleware/adminSession.ts. Production uses the
// `__Host-` prefix, which browsers only accept over https. Kept dependency-free so
// middleware.ts (edge runtime) can import it.
export const ADMIN_COOKIE_NAMES = ['__Host-admin_sid', 'admin_sid'] as const;
