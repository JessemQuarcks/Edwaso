// Shapes returned by the admin API (server/src/routes/admin).

import type { Order, OrderItem, OrderStatus, Product, StorefrontContent } from './index';

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

export interface AdminOrderItem extends OrderItem {
  sku?: string;
  costPrice?: number;
}

export interface Fulfillment {
  carrier?: string;
  trackingNumber?: string;
  trackingUrl?: string;
  shippedAt?: string;
  deliveredAt?: string;
}

export interface PaymentInfo {
  paymentIntentId?: string;
  chargeId?: string;
  amountSubtotal?: number;
  amountTax?: number;
  amountShipping?: number;
  amountTotal?: number;
  fee?: number;
  net?: number;
}

export interface RefundInfo {
  refundId: string;
  amount: number;
  reason?: string;
  status: string;
  createdAt: string;
  by?: { _id: string; name: string; email: string };
}

export interface OrderNote {
  _id: string;
  body: string;
  author: { _id: string; name: string; email: string } | null;
  createdAt: string;
}

export interface AdminOrder extends Omit<Order, 'user' | 'items'> {
  user: { _id: string; name: string; email: string; createdAt?: string } | null;
  items: AdminOrderItem[];
  currency: string;
  stripeSessionId?: string;
  shippingAddress?: ShippingAddress;
  statusHistory: StatusChange[];
  fulfillment?: Fulfillment;
  payment?: PaymentInfo;
  amountRefunded: number;
  refunds: RefundInfo[];
  notes?: OrderNote[];
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
  /** Cents still refundable through Stripe; 0 when refunds aren't possible. */
  refundable: number;
}

// ---- Products ----

export interface AdminProduct extends Product {
  costPrice?: number;
  sold: number;
}

export interface ProductsListResponse {
  products: AdminProduct[];
  page: number;
  pages: number;
  total: number;
  counts: { all: number; low: number; out: number; archived: number };
  lowStockThreshold: number;
}

export type StockReason = 'sale' | 'restock' | 'return' | 'cancellation' | 'correction' | 'damaged' | 'manual' | 'import';

export interface StockEntry {
  _id: string;
  delta: number;
  stockAfter: number;
  reason: StockReason;
  note?: string;
  order?: { _id: string } | null;
  by?: { _id: string; name: string } | null;
  createdAt: string;
}

export interface StockHistoryResponse {
  entries: StockEntry[];
  page: number;
  pages: number;
  total: number;
}

export interface ImportSummary {
  rows: number;
  create: number;
  update: number;
  errors: { row: number; message: string }[];
  applied: boolean;
  message?: string;
}

export interface Category {
  _id: string;
  name: string;
  slug: string;
  description: string;
  image: string;
  sortOrder: number;
  productCount: number;
}

// ---- Settings ----

export interface StoreSettings {
  storeName: string;
  supportEmail: string;
  currency: string;
  shippingCountries: string[];
  automaticTax: boolean;
  lowStockThreshold: number;
  storefront: StorefrontContent;
}

export interface SettingsResponse {
  settings: StoreSettings;
  currencyLocked: boolean;
}

// ---- Finance ----

export interface FinancePoint {
  key: string;
  start: string;
  gross: number;
  refunds: number;
  fees: number;
  net: number;
}

export interface FinanceSummary {
  range: RangeInfo;
  kpis: { gross: Kpi; fees: Kpi; refunds: Kpi; net: Kpi };
  refundRate: number | null;
  feeRate: number | null;
  margin: { grossProfit: number; marginPercent: number | null; coveragePercent: number | null };
  series: FinancePoint[];
}

export interface LedgerEntry {
  _id: string;
  type: 'payment' | 'refund';
  order: { _id: string; total: number; status: OrderStatus; user: { _id: string; name: string; email: string } | null } | null;
  stripeId: string;
  currency: string;
  amount: number;
  fee: number;
  net: number;
  occurredAt: string;
}

export interface LedgerResponse {
  transactions: LedgerEntry[];
  page: number;
  pages: number;
  total: number;
}

export interface Payout {
  id: string;
  amount: number;
  currency: string;
  status: string;
  arrivalDate: string;
  createdAt: string;
  method: string;
  description: string | null;
}

export interface PayoutDetail {
  payout: { id: string; amount: number; currency: string; status: string; arrivalDate: string };
  transactions: { id: string; type: string; amount: number; fee: number; net: number; createdAt: string; orderId: string | null; matched: boolean }[];
  matched: number;
  unmatched: number;
  totalNet: number;
}

// ---- Audit ----

export interface AuditEntry {
  _id: string;
  actorEmail?: string;
  action: string;
  entity?: string;
  entityId?: string;
  before?: unknown;
  after?: unknown;
  meta?: Record<string, unknown>;
  ip?: string;
  createdAt: string;
}

export interface AuditResponse {
  entries: AuditEntry[];
  page: number;
  pages: number;
  total: number;
  actions: string[];
}

// ---- Search ----

export interface SearchResponse {
  orders: { _id: string; total: number; status: OrderStatus; createdAt: string; user: { _id: string; name: string } | null }[];
  products: { _id: string; name: string; sku?: string; image: string; status: string; price: number }[];
  customers: { _id: string; name: string; email: string }[];
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

export interface CustomerNote {
  _id: string;
  body: string;
  author: { _id: string; name: string; email: string } | null;
  createdAt: string;
}

export interface ActivityEvent {
  at: string;
  kind: 'account' | 'order' | 'email' | 'admin';
  title: string;
  detail?: string;
  orderId?: string;
  actor?: string;
  amount?: number;
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
