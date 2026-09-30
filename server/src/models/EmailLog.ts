import mongoose, { Schema, type HydratedDocument, type Types } from 'mongoose';

// A record that an email was sent, for the customer activity trail and debugging. Bodies are
// deliberately not stored: some carry one-time links (password resets) that staff must not see.
export interface IEmailLog {
  to: string;
  subject: string;
  template: string;
  user?: Types.ObjectId;
  order?: Types.ObjectId;
  /** `logged`: no provider configured, so it was only written to the server log. */
  status: 'sent' | 'logged' | 'failed';
  providerId?: string;
  error?: string;
  createdAt: Date;
}

export type EmailLogDoc = HydratedDocument<IEmailLog>;

const emailLogSchema = new Schema<IEmailLog>(
  {
    to: { type: String, required: true },
    subject: { type: String, required: true },
    template: { type: String, required: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    order: { type: Schema.Types.ObjectId, ref: 'Order' },
    status: { type: String, enum: ['sent', 'logged', 'failed'], required: true },
    providerId: String,
    error: String,
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export default mongoose.model<IEmailLog>('EmailLog', emailLogSchema);
