import mongoose, { Schema, type HydratedDocument, type Types } from 'mongoose';
import { ADMIN_ROLES, type Role } from './User.js';

export const NOTIFICATION_TYPES = ['order_paid', 'low_stock', 'out_of_stock', 'webhook_failed'] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/** What staff choose to be emailed about (Account & security). Each type belongs to one topic. */
export const NOTIFY_TOPICS = ['orders', 'stock', 'payments'] as const;
export type NotifyTopic = (typeof NOTIFY_TOPICS)[number];

export const TOPIC_OF: Record<NotificationType, NotifyTopic> = {
  order_paid: 'orders',
  low_stock: 'stock',
  out_of_stock: 'stock',
  webhook_failed: 'payments',
};

/** Who sees each topic, in the console feed and by email. Payment problems are for owners and admins. */
export const TOPIC_ROLES: Record<NotifyTopic, readonly Role[]> = {
  orders: ADMIN_ROLES,
  stock: ADMIN_ROLES,
  payments: ['owner', 'admin'],
};

/** An event for the admin console's notification feed. */
export interface INotification {
  type: NotificationType;
  title: string;
  body: string;
  /** Console path to open, e.g. `/admin/orders/<id>`. */
  link?: string;
  /** Makes the event happen once: a retried webhook can't notify twice. */
  key?: string;
  roles: Role[];
  readBy: Types.ObjectId[];
  /** Set when the problem went away (a failed webhook later succeeded). */
  resolvedAt?: Date;
  createdAt: Date;
}

export type NotificationDoc = HydratedDocument<INotification>;

const RETENTION_DAYS = 90;

const notificationSchema = new Schema<INotification>(
  {
    type: { type: String, enum: NOTIFICATION_TYPES, required: true },
    title: { type: String, required: true },
    body: { type: String, default: '' },
    link: String,
    key: { type: String, unique: true, sparse: true },
    roles: { type: [String], required: true, index: true },
    readBy: { type: [Schema.Types.ObjectId], default: [] },
    resolvedAt: Date,
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: RETENTION_DAYS * 24 * 60 * 60 });

export default mongoose.model<INotification>('Notification', notificationSchema);
