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

export const formatPrice = (cents: number): string =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);

export const errorMessage = (err: unknown): string =>
  err instanceof Error ? err.message : 'Something went wrong';
