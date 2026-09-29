import { NextResponse, type NextRequest } from 'next/server';
import { ADMIN_COOKIE_NAMES } from '@/lib/admin-cookie';

// Pages anyone can open: signing in, and redeeming an invite link.
const PUBLIC_ADMIN_PATHS = ['/admin/login', '/admin/invite'];

// A fast first gate: without an admin cookie, /admin pages redirect to the admin login before
// anything renders. It only checks presence. The (console) layout validates the session with
// the API, and the API enforces it on every request.
export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (PUBLIC_ADMIN_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }
  if (ADMIN_COOKIE_NAMES.some((name) => req.cookies.has(name))) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = '/admin/login';
  url.search = `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

export const config = { matcher: ['/admin/:path*'] };
