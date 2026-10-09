import mongoose from 'mongoose';

// One record per referred customer (docs/REFER_AND_EARN_AND_WALLET.md §5.2).
//   pending       friend signed up with a code, no qualifying order yet
//   order_placed  friend's first order is being tracked
//   qualified     delivered and kept >= minimum, waiting for the return window
//   rewarded      wallet credit issued
//   void          no reward (see voidReason)
export const REFERRAL_STATUSES = ['pending', 'order_placed', 'qualified', 'rewarded', 'void'];

const referralSchema = new mongoose.Schema(
    {
        referrer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        referee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
        code: { type: String, uppercase: true, trim: true },
        status: { type: String, enum: REFERRAL_STATUSES, default: 'pending', index: true },
        firstOrder: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null },
        keptValue: { type: Number, default: 0 },
        rewardDueAt: { type: Date, default: null },
        referrerReward: { type: Number, default: 0 },
        refereeReward: { type: Number, default: 0 },
        settingsSnapshot: { type: mongoose.Schema.Types.Mixed, default: {} },
        voidReason: { type: String, default: null },
        voidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
        fraudFlags: { type: [String], default: [] },
        rewardedAt: { type: Date, default: null },
    },
    { timestamps: true }
);

referralSchema.index({ referrer: 1, status: 1, rewardedAt: -1 });
referralSchema.index({ status: 1, rewardDueAt: 1 });
referralSchema.index({ firstOrder: 1 });

const Referral = mongoose.model('Referral', referralSchema);
export { Referral };
export default Referral;
