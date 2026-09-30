import mongoose, { Schema, type HydratedDocument, type Types } from 'mongoose';

// The money ledger: one entry per Stripe payment or refund. Amounts are in the smallest
// currency unit; refunds are negative so a period's net is a plain sum.
export const TRANSACTION_TYPES = ['payment', 'refund'] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

export interface ITransaction {
  type: TransactionType;
  order: Types.ObjectId;
  /** Payment intent id for payments, refund id for refunds. Unique, so recording is idempotent. */
  stripeId: string;
  /** Stripe charge / balance transaction ids, for payout reconciliation. */
  chargeId?: string;
  balanceTransactionId?: string;
  currency: string;
  amount: number;
  fee: number;
  net: number;
  occurredAt: Date;
  description?: string;
  createdAt: Date;
}

export type TransactionDoc = HydratedDocument<ITransaction>;

const transactionSchema = new Schema<ITransaction>(
  {
    type: { type: String, enum: TRANSACTION_TYPES, required: true },
    order: { type: Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
    stripeId: { type: String, required: true, unique: true },
    chargeId: String,
    balanceTransactionId: { type: String, index: true, sparse: true },
    currency: { type: String, required: true },
    amount: { type: Number, required: true },
    fee: { type: Number, default: 0 },
    net: { type: Number, required: true },
    occurredAt: { type: Date, required: true },
    description: String,
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

transactionSchema.index({ occurredAt: -1 });

export default mongoose.model<ITransaction>('Transaction', transactionSchema);
