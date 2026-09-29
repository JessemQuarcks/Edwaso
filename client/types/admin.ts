// Shapes returned by the admin API (server/src/routes/admin).

export type AdminRole = 'staff' | 'admin' | 'owner';
export type PendingStep = 'change_password' | 'enroll_2fa';

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: AdminRole;
  totpEnabled: boolean;
}

export interface AdminMe {
  user: AdminUser;
  pendingSteps: PendingStep[];
  session: { expiresAt: string; idleTimeoutMinutes: number };
}

export type AdminLoginResponse =
  | { status: 'ok'; user: AdminUser; pendingSteps: PendingStep[] }
  | { status: '2fa_required'; challenge: string };

export interface AdminAccountResponse {
  user: AdminUser;
  pendingSteps: PendingStep[];
}

export interface TwoFactorSetupResponse {
  secret: string;
  otpauthUrl: string;
  /** PNG data URL. */
  qrCode: string;
}

export interface TwoFactorEnableResponse extends AdminAccountResponse {
  recoveryCodes: string[];
}

export interface AdminSessionInfo {
  id: string;
  ip?: string;
  userAgent?: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  current: boolean;
}

export interface Invite {
  _id: string;
  email: string;
  role: Exclude<AdminRole, 'owner'>;
  expiresAt: string;
  createdAt: string;
  invitedBy: { _id: string; name: string; email: string } | string;
}

export interface InviteInfo {
  email: string;
  role: Invite['role'];
  expiresAt: string;
}
