export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000/api';

const TOKEN_KEY = 'token';

export const getToken = (): string | null =>
  typeof window === 'undefined' ? null : window.localStorage.getItem(TOKEN_KEY);
export const setToken = (token: string): void => window.localStorage.setItem(TOKEN_KEY, token);
export const clearToken = (): void => window.localStorage.removeItem(TOKEN_KEY);

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface ApiOptions extends Omit<RequestInit, 'body'> {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Send the stored bearer token. Client components only. */
  auth?: boolean;
}

// Works in both server and client components.
export async function api<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const { method = 'GET', body, auth = false, ...init } = options;

  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const token = auth ? getToken() : null;
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
    ...init,
  });

  const data: unknown = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message =
      (data as { message?: string } | null)?.message ?? `Request failed (${res.status})`;
    throw new ApiError(res.status, message);
  }
  return data as T;
}

// The store has a single currency (Settings, locked once there are orders), so formatting uses a
// module-level default set by the root layout on the server and by <Providers> in the browser.
let storeCurrency = 'USD';
const formatters = new Map<string, Intl.NumberFormat>();

export function setStoreCurrency(currency: string): void {
  storeCurrency = currency.toUpperCase();
}

export const getStoreCurrency = (): string => storeCurrency;

export function formatPrice(cents: number, currency = storeCurrency): string {
  const code = currency.toUpperCase();
  let fmt = formatters.get(code);
  if (!fmt) {
    fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: code });
    formatters.set(code, fmt);
  }
  return fmt.format(cents / 100);
}

export const errorMessage = (err: unknown): string =>
  err instanceof Error ? err.message : 'Something went wrong';
