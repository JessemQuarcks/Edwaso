// Shapes returned by the admin API (server/src/routes/admin).

import type { Order, OrderItem, OrderStatus, Product } from './index';

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

// ---- Dashboard ----


export type RangeUnit = 'hour' | 'day' | 'month';

export interface RangeInfo {
  from: string;
  to: string;
  unit: RangeUnit;
  tz: string;
  previous: { from: string; to: string } | null;
}

/** A figure with its previous-period value. `change` is a percentage, null without a baseline. */
export interface Kpi {
  value: number;
  previous: number | null;
  change: number | null;
}

export interface SeriesPoint {
  key: string;
  /** ISO start of the bucket. */
  start: string;
  revenue: number;
  orders: number;
  previousRevenue: number | null;
  previousOrders: number | null;
}

export interface ProductSales {
  productId: string;
  name: string;
  image?: string;
  category: string;
  units: number;
  revenue: number;
}

export interface StockItem {
  _id: string;
  name: string;
  stock: number;
  image?: string;
}

export interface OverviewResponse {
  range: RangeInfo;
  kpis: {
    revenue: Kpi;
    completedOrders: Kpi;
    averageOrderValue: Kpi;
    cancelledOrders: Kpi;
    newCustomers: Kpi;
    products: { value: number; added: number };
  };
  series: SeriesPoint[];
  topProducts: ProductSales[];
  recentOrders: Order[];
  lowStock: StockItem[];
  awaitingShipment: number;
}

export interface AnalyticsResponse {
  range: RangeInfo;
  summary: {
    revenue: Kpi;
    orders: Kpi;
    averageOrderValue: Kpi;
    unitsSold: Kpi;
    newCustomers: Kpi;
  };
  series: SeriesPoint[];
  byCategory: { category: string; revenue: number; units: number }[];
  byStatus: { status: OrderStatus; count: number }[];
  topProducts: ProductSales[];
  topCustomers: { customerId: string; name: string; email: string; orders: number; spent: number }[];
}

export interface NotificationsResponse {
  awaitingShipment: number;
  lowStock: StockItem[];
  lowStockCount: number;
  recentOrders: { _id: string; total: number; paidAt: string; user: { _id: string; name: string } | null }[];
}

// ---- Orders ----

export interface StatusChange {
  status: OrderStatus;
  at: string;
  by?: { _id: string; name: string; email: string };
  note?: string;
}

export interface ShippingAddress {
  name?: string;
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
}

export interface AdminOrder extends Omit<Order, 'user'> {
  user: { _id: string; name: string; email: string; createdAt?: string } | null;
  items: OrderItem[];
  stripeSessionId?: string;
  shippingAddress?: ShippingAddress;
  statusHistory: StatusChange[];
}

export type OrderCounts = Record<OrderStatus | 'all', number>;

export interface OrdersListResponse {
  orders: AdminOrder[];
  page: number;
  pages: number;
  total: number;
  counts: OrderCounts;
}

export interface OrderDetailResponse {
  order: AdminOrder;
  allowedTransitions: OrderStatus[];
}

// ---- Products ----

export interface AdminProduct extends Product {
  sold: number;
}

export interface ProductsListResponse {
  products: AdminProduct[];
  page: number;
  pages: number;
  total: number;
  counts: { all: number; low: number; out: number };
  lowStockThreshold: number;
}

// ---- Customers ----

export interface CustomerRow {
  _id: string;
  name: string;
  email: string;
  status: 'active' | 'disabled';
  createdAt: string;
  orders: number;
  spent: number;
  lastOrderAt?: string;
}

export interface CustomersListResponse {
  customers: CustomerRow[];
  page: number;
  pages: number;
  total: number;
}

export interface CustomerDetailResponse {
  customer: Omit<CustomerRow, 'orders' | 'spent' | 'lastOrderAt'>;
  stats: {
    orders: number;
    spent: number;
    units: number;
    averageOrderValue: number;
    firstOrderAt: string | null;
    lastOrderAt: string | null;
  };
  orders: AdminOrder[];
}

// ---- Team ----

export interface TeamMember {
  _id: string;
  name: string;
  email: string;
  role: AdminRole;
  status: 'active' | 'disabled';
  totpEnabled: boolean;
  lastLoginAt?: string;
  createdAt: string;
}
