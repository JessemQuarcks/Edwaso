import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ADMIN_COOKIE_NAMES } from './admin-cookie';
import type { AdminMe, InviteInfo } from '@/types/admin';

// Server components only: calls the API directly (not through the proxy), forwarding the
// admin session cookie from the incoming request.

const API_ORIGIN = process.env.API_ORIGIN ?? 'http://localhost:5000';

async function adminCookieHeader(): Promise<string | null> {
  const jar = await cookies();
  for (const name of ADMIN_COOKIE_NAMES) {
    const cookie = jar.get(name);
    if (cookie) return `${name}=${cookie.value}`;
  }
  return null;
}

/** The signed-in admin, or null when there is no valid session. */
export async function getAdminMe(): Promise<AdminMe | null> {
  const cookie = await adminCookieHeader();
  if (!cookie) return null;
  const res = await fetch(`${API_ORIGIN}/api/admin/auth/me`, { headers: { Cookie: cookie }, cache: 'no-store' });
  if (res.status === 401 || res.status === 403) return null;
  if (!res.ok) throw new Error(`Admin API responded ${res.status}`);
  return (await res.json()) as AdminMe;
}

/** For console pages: a valid session with account setup finished, or a redirect. */
export async function requireAdminMe(): Promise<AdminMe> {
  const me = await getAdminMe();
  if (!me) redirect('/admin/login');
  if (me.pendingSteps.length > 0) redirect('/admin/setup');
  return me;
}

export async function getInvite(token: string): Promise<InviteInfo | null> {
  const res = await fetch(`${API_ORIGIN}/api/admin/invitations/${encodeURIComponent(token)}`, { cache: 'no-store' });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Admin API responded ${res.status}`);
  return (await res.json()) as InviteInfo;
}

/** GET an admin endpoint from a server component with the caller's session, or null on 401/403/404. */
export async function adminServerGet<T>(path: string): Promise<T | null> {
  const cookie = await adminCookieHeader();
  if (!cookie) return null;
  const res = await fetch(`${API_ORIGIN}/api/admin${path}`, { headers: { Cookie: cookie }, cache: 'no-store' });
  if ([401, 403, 404].includes(res.status)) return null;
  if (!res.ok) throw new Error(`Admin API responded ${res.status}`);
  return (await res.json()) as T;
}
