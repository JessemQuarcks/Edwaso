import type { UserDoc } from '../models/User.js';

// `protect` attaches the authenticated user; routes read it through `requireUser(req)`,
// which narrows it to a non-optional UserDoc.
declare global {
  namespace Express {
    interface Request {
      user?: UserDoc;
    }
  }
}

export {};
