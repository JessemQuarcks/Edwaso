// Shapes returned by the Express API (server/src/routes).

export interface Product {
  _id: string;
  name: string;
  description: string;
  /** Cents. Render with `formatPrice`. */
  price: number;
  /** "Was" price, shown struck through when higher than `price`. */
  compareAtPrice?: number;
  sku?: string;
  /** Gallery; `image` is the first one. */
  images: string[];
  image: string;
  /** Category slug. */
  category: string;
  stock: number;
  featured: boolean;
  status: 'draft' | 'active' | 'archived';
  createdAt: string;
  updatedAt: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
}

/** `user` as returned by `.populate('user', 'name email')` on the admin orders list. */
export interface PopulatedUser {
  _id: string;
  name: string;
  email: string;
}

export type OrderStatus = 'pending' | 'paid' | 'processing' | 'shipped' | 'delivered' | 'cancelled' | 'refunded';

export interface OrderItem {
  product: string;
  name: string;
  image?: string;
  price: number;
  quantity: number;
}

export interface Order {
  _id: string;
  user: string | PopulatedUser;
  items: OrderItem[];
  total: number;
  status: OrderStatus;
  paidAt?: string;
  createdAt: string;
  updatedAt: string;
  // Present on the customer's own orders (see server/src/routes/orders.ts).
  currency?: string;
  amountRefunded?: number;
  statusHistory?: { status: OrderStatus; at: string }[];
  fulfillment?: { carrier?: string; trackingNumber?: string; trackingUrl?: string; shippedAt?: string; deliveredAt?: string };
  shippingAddress?: { name?: string; line1?: string; line2?: string; city?: string; state?: string; postalCode?: string; country?: string };
}

export interface CartItem {
  id: string;
  name: string;
  price: number;
  image: string;
  stock: number;
  quantity: number;
}

// Response envelopes

export interface ProductsResponse {
  products: Product[];
  page: number;
  pages: number;
  total: number;
}
export interface ProductResponse {
  product: Product;
}
export interface CategoryInfo {
  slug: string;
  name: string;
  image: string;
  description?: string;
  /** Products on sale in this category. */
  count?: number;
}
export interface CategoriesResponse {
  /** Slugs. */
  categories: string[];
  items: CategoryInfo[];
}
/** Landing-page content edited under Admin → Settings → Storefront. */
export interface StorefrontContent {
  announcement: string;
  heroEyebrow: string;
  heroTitle: string;
  heroSubtitle: string;
  promo: { title: string; body: string; ctaLabel: string; ctaHref: string; image: string };
  testimonials: { quote: string; author: string; detail: string }[];
  social: { instagram: string; facebook: string; x: string; tiktok: string };
}

export interface StoreInfo {
  storeName: string;
  currency: string;
  supportEmail: string;
  storefront: StorefrontContent;
  /** ISO country codes checkout ships to. */
  shippingCountries: string[];
}
export interface AuthResponse {
  token: string;
  user: User;
}
export interface MeResponse {
  user: User;
}
export interface OrdersResponse {
  orders: Order[];
}
export interface CheckoutResponse {
  url: string;
  orderId: string;
}
