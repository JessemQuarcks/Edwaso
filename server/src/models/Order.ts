import mongoose, { Schema, type HydratedDocument, type Types } from 'mongoose';

export const ORDER_STATUSES = ['pending', 'paid', 'shipped', 'cancelled'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export interface IOrderItem {
  product: Types.ObjectId;
  // Snapshot of product data at purchase time.
  name: string;
  image?: string;
  price: number;
  quantity: number;
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

export interface IOrder {
  user: Types.ObjectId;
  items: IOrderItem[];
  total: number;
  status: OrderStatus;
  stripeSessionId?: string;
  paidAt?: Date;
  shippingAddress?: IShippingAddress;
  createdAt: Date;
  updatedAt: Date;
}

export type OrderDoc = HydratedDocument<IOrder>;

const orderItemSchema = new Schema<IOrderItem>(
  {
    product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    name: { type: String, required: true },
    image: String,
    price: { type: Number, required: true },
    quantity: { type: Number, required: true, min: 1 },
  },
  { _id: false }
);

const orderSchema = new Schema<IOrder>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    items: { type: [orderItemSchema], required: true },
    total: { type: Number, required: true },
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
  },
  { timestamps: true }
);

export default mongoose.model<IOrder>('Order', orderSchema);
