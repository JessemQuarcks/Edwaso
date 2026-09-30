import mongoose, { Schema, type HydratedDocument, type Types } from 'mongoose';

export const ORDER_STATUSES = ['pending', 'paid', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** Orders that count as sales (money kept). Partial refunds are netted out via amountRefunded. */
export const SALE_STATUSES: OrderStatus[] = ['paid', 'processing', 'shipped', 'delivered'];
/** Statuses in which the order's stock has been taken out of inventory. */
export const STOCK_TAKEN: OrderStatus[] = ['paid', 'processing', 'shipped', 'delivered'];

export interface IOrderItem {
  product: Types.ObjectId;
  // Snapshot of product data at purchase time.
  name: string;
  image?: string;
  sku?: string;
  price: number;
  /** Unit cost at purchase time, for margin reporting. */
  costPrice?: number;
  quantity: number;
}

export interface IStatusChange {
  status: OrderStatus;
  at: Date;
  /** The admin who made the change; absent for system changes (checkout, Stripe webhook). */
  by?: Types.ObjectId;
  note?: string;
}

export interface IShippingAddress {
  name?: string;
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
}

export interface IFulfillment {
  carrier?: string;
  trackingNumber?: string;
  trackingUrl?: string;
  shippedAt?: Date;
  deliveredAt?: Date;
}

/** Filled from Stripe once paid. Amounts in the order's currency, smallest unit. */
export interface IPayment {
  paymentIntentId?: string;
  chargeId?: string;
  amountSubtotal?: number;
  amountTax?: number;
  amountShipping?: number;
  amountTotal?: number;
  fee?: number;
  net?: number;
}

export interface IRefund {
  refundId: string;
  amount: number;
  reason?: string;
  status: string;
  createdAt: Date;
  by?: Types.ObjectId;
}

export interface INote {
  _id: Types.ObjectId;
  body: string;
  author: Types.ObjectId;
  createdAt: Date;
}

export interface IOrder {
  user: Types.ObjectId;
  items: IOrderItem[];
  total: number;
  currency: string;
  status: OrderStatus;
  stripeSessionId?: string;
  paidAt?: Date;
  shippingAddress?: IShippingAddress;
  statusHistory: IStatusChange[];
  fulfillment?: IFulfillment;
  payment?: IPayment;
  amountRefunded: number;
  refunds: IRefund[];
  /** Internal staff notes; never shown to the customer. */
  notes: INote[];
  createdAt: Date;
  updatedAt: Date;
}

export type OrderDoc = HydratedDocument<IOrder>;

const orderItemSchema = new Schema<IOrderItem>(
  {
    product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    name: { type: String, required: true },
    image: String,
    sku: String,
    price: { type: Number, required: true },
    costPrice: Number,
    quantity: { type: Number, required: true, min: 1 },
  },
  { _id: false }
);

const statusChangeSchema = new Schema<IStatusChange>(
  {
    status: { type: String, enum: ORDER_STATUSES, required: true },
    at: { type: Date, required: true },
    by: { type: Schema.Types.ObjectId, ref: 'User' },
    note: String,
  },
  { _id: false }
);

const refundSchema = new Schema<IRefund>(
  {
    refundId: { type: String, required: true },
    amount: { type: Number, required: true },
    reason: String,
    status: { type: String, required: true },
    createdAt: { type: Date, required: true },
    by: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { _id: false }
);

const noteSchema = new Schema<INote>(
  {
    body: { type: String, required: true, maxlength: 2000 },
    author: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

const orderSchema = new Schema<IOrder>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    items: { type: [orderItemSchema], required: true },
    total: { type: Number, required: true },
    currency: { type: String, default: 'usd' },
    status: { type: String, enum: ORDER_STATUSES, default: 'pending' },
    stripeSessionId: { type: String, index: true },
    paidAt: Date,
    shippingAddress: {
      name: String,
      line1: String,
      line2: String,
      city: String,
      state: String,
      postalCode: String,
      country: String,
    },
    statusHistory: { type: [statusChangeSchema], default: [] },
    fulfillment: {
      carrier: String,
      trackingNumber: String,
      trackingUrl: String,
      shippedAt: Date,
      deliveredAt: Date,
    },
    payment: {
      paymentIntentId: { type: String, index: true, sparse: true },
      chargeId: String,
      amountSubtotal: Number,
      amountTax: Number,
      amountShipping: Number,
      amountTotal: Number,
      fee: Number,
      net: Number,
    },
    amountRefunded: { type: Number, default: 0 },
    refunds: { type: [refundSchema], default: [] },
    notes: { type: [noteSchema], default: [] },
  },
  { timestamps: true }
);

orderSchema.index({ createdAt: -1 });
orderSchema.index({ status: 1, paidAt: -1 });

export default mongoose.model<IOrder>('Order', orderSchema);
