// Admin-configurable Refer & Earn and wallet settings (docs/REFER_AND_EARN_AND_WALLET.md §4).
// Stored in Settings under keys 'referral' and 'wallet'; missing fields fall back to the
// defaults below. Cached in memory for a short time; an admin save clears the cache on the
// instance that handled it, other instances pick it up within CACHE_MS.
import Settings from '../models/Settings.model.js';

export const REFERRAL_DEFAULTS = Object.freeze({
    enabled: false,
    referrerReward: { type: 'flat', value: 250, maxAmount: 250 },
    refereeReward: { enabled: false, value: 100 },
    minFirstOrderValue: 999,
    rewardDelayHours: 24,
    allowCod: true,
    firstOrderStrict: false,
    maxRewardsPerReferrer: 50,
    monthlyRewardCap: 10,
    shareMessage: 'Shop on CLOSH with my code {CODE} and get fashion delivered in 60 minutes: {LINK}',
    termsText: 'You earn the reward when your friend signs up with your code and their first order is delivered and kept. Rewards are not given for cancelled or returned orders.',
});

export const WALLET_DEFAULTS = Object.freeze({
    enabled: false,
    maxWalletPercentPerOrder: 100,
    maxWalletAmountPerOrder: 0,
    minOrderValueForWallet: 0,
    creditValidityDays: 180,
    refundGraceDays: 30,
    allowWithCoupon: true,
});

const CACHE_MS = 60 * 1000;
const cache = new Map();

const num = (value, fallback, { min = 0, max = Infinity } = {}) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(Math.max(n, min), max);
};
const bool = (value, fallback) => (typeof value === 'boolean' ? value : fallback);
const str = (value, fallback) => (typeof value === 'string' && value.trim() ? value.trim().slice(0, 1000) : fallback);

export const normalizeReferralSettings = (raw = {}) => {
    const d = REFERRAL_DEFAULTS;
    const rr = raw.referrerReward || {};
    const re = raw.refereeReward || {};
    const type = rr.type === 'percent' ? 'percent' : 'flat';
    return {
        enabled: bool(raw.enabled, d.enabled),
        referrerReward: {
            type,
            value: num(rr.value, d.referrerReward.value, { max: type === 'percent' ? 100 : 100000 }),
            maxAmount: num(rr.maxAmount, d.referrerReward.maxAmount, { max: 100000 }),
        },
        refereeReward: {
            enabled: bool(re.enabled, d.refereeReward.enabled),
            value: num(re.value, d.refereeReward.value, { max: 100000 }),
        },
        minFirstOrderValue: num(raw.minFirstOrderValue, d.minFirstOrderValue, { max: 10000000 }),
        rewardDelayHours: num(raw.rewardDelayHours, d.rewardDelayHours, { max: 720 }),
        allowCod: bool(raw.allowCod, d.allowCod),
        firstOrderStrict: bool(raw.firstOrderStrict, d.firstOrderStrict),
        maxRewardsPerReferrer: Math.round(num(raw.maxRewardsPerReferrer, d.maxRewardsPerReferrer, { max: 100000 })),
        monthlyRewardCap: Math.round(num(raw.monthlyRewardCap, d.monthlyRewardCap, { max: 100000 })),
        shareMessage: str(raw.shareMessage, d.shareMessage),
        termsText: str(raw.termsText, d.termsText),
    };
};

export const normalizeWalletSettings = (raw = {}) => {
    const d = WALLET_DEFAULTS;
    return {
        enabled: bool(raw.enabled, d.enabled),
        maxWalletPercentPerOrder: num(raw.maxWalletPercentPerOrder, d.maxWalletPercentPerOrder, { max: 100 }),
        maxWalletAmountPerOrder: num(raw.maxWalletAmountPerOrder, d.maxWalletAmountPerOrder, { max: 10000000 }),
        minOrderValueForWallet: num(raw.minOrderValueForWallet, d.minOrderValueForWallet, { max: 10000000 }),
        creditValidityDays: Math.round(num(raw.creditValidityDays, d.creditValidityDays, { max: 3650 })),
        refundGraceDays: Math.round(num(raw.refundGraceDays, d.refundGraceDays, { max: 3650 })),
        allowWithCoupon: bool(raw.allowWithCoupon, d.allowWithCoupon),
    };
};

const NORMALIZERS = { referral: normalizeReferralSettings, wallet: normalizeWalletSettings };

const load = async (key) => {
    const hit = cache.get(key);
    if (hit && hit.expires > Date.now()) return hit.value;
    const doc = await Settings.findOne({ key }).lean();
    const value = NORMALIZERS[key](doc?.value || {});
    cache.set(key, { value, expires: Date.now() + CACHE_MS });
    return value;
};

export const getReferralSettings = () => load('referral');
export const getWalletSettings = () => load('wallet');

export const saveRewardSettings = async (key, raw) => {
    if (!NORMALIZERS[key]) throw new Error(`Unknown settings key ${key}`);
    const value = NORMALIZERS[key](raw || {});
    await Settings.findOneAndUpdate({ key }, { $set: { value } }, { upsert: true, new: true });
    cache.delete(key);
    return value;
};
