import mongoose from 'mongoose';

// Customer wallet ledger (docs/REFER_AND_EARN_AND_WALLET.md §5.3). Every change to a
// customer's wallet is one document here; User.walletBalance is only a cached sum.
//   credit  a "lot" of money with its own expiry; `remaining` is what is still unspent
//   debit   money spent; `allocations` records which lots it came from (FIFO by expiry),
//           so a refund can put it back into the same lots
export const WALLET_SOURCES = [
    'referral_reward',
    'referee_reward',
    'order_payment',
    'order_refund',
    'expiry',
    'admin_adjustment',
];

const walletTransactionSchema = new mongoose.Schema(
    {
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        type: { type: String, enum: ['credit', 'debit'], required: true },
        source: { type: String, enum: WALLET_SOURCES, required: true },
        amount: { type: Number, required: true, min: 0.01 },
        remaining: { type: Number, default: null },
        expiresAt: { type: Date, default: null },
        order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null },
        referral: { type: mongoose.Schema.Types.ObjectId, ref: 'Referral', default: null },
        allocations: {
            type: [{ credit: { type: mongoose.Schema.Types.ObjectId, ref: 'WalletTransaction' }, amount: Number, _id: false }],
            default: undefined,
        },
        // Makes every credit/debit safe to retry: a second insert with the same key fails.
        idempotencyKey: { type: String, required: true, unique: true },
        note: { type: String, trim: true, maxlength: 500 },
        createdBy: { type: mongoose.Schema.Types.ObjectId, default: null },
        createdByModel: { type: String, enum: ['Admin', 'System'], default: 'System' },
        balanceAfter: { type: Number, default: null },
    },
    { timestamps: true }
);

walletTransactionSchema.index({ user: 1, createdAt: -1 });
walletTransactionSchema.index({ user: 1, type: 1, remaining: 1, expiresAt: 1 });

const WalletTransaction = mongoose.model('WalletTransaction', walletTransactionSchema);
export { WalletTransaction };
export default WalletTransaction;
