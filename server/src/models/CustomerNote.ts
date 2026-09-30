import mongoose, { Schema, type HydratedDocument, type Types } from 'mongoose';

// Internal staff notes about a customer ("prefers email", "VIP"). Never shown to the customer.
export interface ICustomerNote {
  customer: Types.ObjectId;
  author: Types.ObjectId;
  body: string;
  createdAt: Date;
}

export type CustomerNoteDoc = HydratedDocument<ICustomerNote>;

const customerNoteSchema = new Schema<ICustomerNote>(
  {
    customer: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    author: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    body: { type: String, required: true, maxlength: 2000 },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export default mongoose.model<ICustomerNote>('CustomerNote', customerNoteSchema);
