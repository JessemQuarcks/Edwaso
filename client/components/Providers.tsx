'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api, clearToken, getToken, setStoreCurrency, setToken } from '@/lib/api';
import type { AuthResponse, CartItem, MeResponse, Product, StoreInfo, User } from '@/types';

interface AuthValue {
  user: User | null;
  /** False until the stored session has been checked. */
  ready: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  /** Adopt a new session (after a password change) or updated profile. */
  setSession: (user: User, token?: string) => void;
}

interface CartValue {
  items: CartItem[];
  count: number;
  total: number;
  add: (product: Product, quantity?: number) => void;
  setQuantity: (id: string, quantity: number) => void;
  remove: (id: string) => void;
  clear: () => void;
  /** The slide-over cart. */
  drawerOpen: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
  /** Increments on every add, so the header badge can animate. */
  bump: number;
}

const AuthContext = createContext<AuthValue | null>(null);
const CartContext = createContext<CartValue | null>(null);

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <Providers>');
  return ctx;
}

export function useCart(): CartValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used inside <Providers>');
  return ctx;
}

const CART_KEY = 'cart';

const StoreContext = createContext<StoreInfo | null>(null);

/** Store name, currency and support email (from Settings). */
export function useStore(): StoreInfo {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside <Providers>');
  return ctx;
}

export default function Providers({ children, store }: { children: ReactNode; store: StoreInfo }) {
  // Before any child renders, so every price on the first paint uses the store currency.
  setStoreCurrency(store.currency);
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [items, setItems] = useState<CartItem[]>([]);
  const [cartReady, setCartReady] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [bump, setBump] = useState(0);

  // Restore session.
  useEffect(() => {
    if (!getToken()) {
      setAuthReady(true);
      return;
    }
    api<MeResponse>('/auth/me', { auth: true })
      .then((d) => setUser(d.user))
      .catch(() => clearToken())
      .finally(() => setAuthReady(true));
  }, []);

  // Restore cart.
  useEffect(() => {
    try {
      const stored = localStorage.getItem(CART_KEY);
      if (stored) setItems(JSON.parse(stored) as CartItem[]);
    } catch {
      // Corrupt or unavailable storage — start with an empty cart.
    }
    setCartReady(true);
  }, []);

  useEffect(() => {
    if (cartReady) localStorage.setItem(CART_KEY, JSON.stringify(items));
  }, [items, cartReady]);

  const authenticate = useCallback(async (path: string, body: Record<string, string>) => {
    const data = await api<AuthResponse>(path, { method: 'POST', body });
    setToken(data.token);
    setUser(data.user);
  }, []);

  const auth = useMemo<AuthValue>(
    () => ({
      user,
      ready: authReady,
      login: (email, password) => authenticate('/auth/login', { email, password }),
      register: (name, email, password) => authenticate('/auth/register', { name, email, password }),
      logout: () => {
        clearToken();
        setUser(null);
      },
      setSession: (next, token) => {
        if (token) setToken(token);
        setUser(next);
      },
    }),
    [user, authReady, authenticate]
  );

  const cart = useMemo<CartValue>(
    () => ({
      items,
      count: items.reduce((n, i) => n + i.quantity, 0),
      total: items.reduce((sum, i) => sum + i.price * i.quantity, 0),
      add: (product, quantity = 1) => {
        setBump((b) => b + 1);
        setItems((prev) => {
          const existing = prev.find((i) => i.id === product._id);
          if (existing) {
            return prev.map((i) =>
              i.id === product._id
                ? { ...i, quantity: Math.min(i.quantity + quantity, product.stock) }
                : i
            );
          }
          return [
            ...prev,
            {
              id: product._id,
              name: product.name,
              price: product.price,
              image: product.image,
              stock: product.stock,
              quantity: Math.min(quantity, product.stock),
            },
          ];
        });
      },
      setQuantity: (id, quantity) =>
        setItems((prev) =>
          prev.map((i) =>
            i.id === id ? { ...i, quantity: Math.max(1, Math.min(quantity, i.stock)) } : i
          )
        ),
      remove: (id) => setItems((prev) => prev.filter((i) => i.id !== id)),
      clear: () => setItems([]),
      drawerOpen,
      openDrawer: () => setDrawerOpen(true),
      closeDrawer: () => setDrawerOpen(false),
      bump,
    }),
    [items, drawerOpen, bump]
  );

  return (
    <StoreContext.Provider value={store}>
      <AuthContext.Provider value={auth}>
        <CartContext.Provider value={cart}>{children}</CartContext.Provider>
      </AuthContext.Provider>
    </StoreContext.Provider>
  );
}
