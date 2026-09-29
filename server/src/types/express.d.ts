import type { UserDoc } from '../models/User.js';
import type { AdminSessionDoc } from '../models/AdminSession.js';

declare global {
  namespace Express {
    interface Request {
      // `protect` attaches the storefront user; routes read it through `requireUser(req)`.
      user?: UserDoc;
      // `requireAdminSession` attaches the admin and their session; read via `requireAdmin(req)`.
      admin?: { user: UserDoc; session: AdminSessionDoc };
    }
  }
}

export {};
