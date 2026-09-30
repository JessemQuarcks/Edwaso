import mongoose, { Schema, type HydratedDocument } from 'mongoose';

// Newsletter sign-ups from the storefront footer. Sending is roadmap phase 4; for now the
// list can be exported from the admin (Customers → Export subscribers).
export interface ISubscriber {
  email: string;
  source: string;
  createdAt: Date;
}

export type SubscriberDoc = HydratedDocument<ISubscriber>;

const subscriberSchema = new Schema<ISubscriber>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    source: { type: String, default: 'footer' },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export default mongoose.model<ISubscriber>('Subscriber', subscriberSchema);
