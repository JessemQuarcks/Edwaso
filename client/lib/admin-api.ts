import { ApiError } from './api';

// Client-side calls to the admin API. They go to the same-origin proxy (/api/admin, see
// next.config.ts), so the browser attaches the httpOnly session cookie itself; no token
// is ever readable from JavaScript.

const PUBLIC_PAGES = ['/admin/login', '/admin/invite'];

export interface AdminApiOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
}

export async function adminApi<T = void>(path: string, { method = 'GET', body }: AdminApiOptions = {}): Promise<T> {
  const res = await fetch(`/api/admin${path}`, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: 'same-origin',
    cache: 'no-store',
  });

  if (res.status === 204) return undefined as T;
  const data: unknown = await res.json().catch(() => ({}));

  if (!res.ok) {
    const message = (data as { message?: string } | null)?.message ?? `Request failed (${res.status})`;
    // Session expired or revoked while using the console: send them to sign in again.
    const onPublicPage = PUBLIC_PAGES.some((p) => window.location.pathname.startsWith(p));
    if (res.status === 401 && !onPublicPage) {
      const next = encodeURIComponent(window.location.pathname + window.location.search);
      window.location.assign(`/admin/login?next=${next}&expired=1`);
    }
    throw new ApiError(res.status, message);
  }
  return data as T;
}

/** Only follow `next` to another admin page, never off-site. */
export function safeAdminRedirect(next: string | null): string {
  return next && /^\/admin(\/|$|\?)/.test(next) && !next.startsWith('/admin/login') ? next : '/admin';
}
