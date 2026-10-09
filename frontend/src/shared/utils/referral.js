// Refer & Earn helpers for the customer app (docs/REFER_AND_EARN_AND_WALLET.md §7.1-7.2).
// A referral link (/r/CODE) stores the code here so the sign-up form can prefill it; the
// device id lets the backend refuse a customer referring themselves from the same phone.
const CODE_KEY = 'closh_ref';
const DEVICE_KEY = 'closh_device_id';
const CODE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const safe = (fn, fallback) => {
  try {
    return fn();
  } catch {
    return fallback;
  }
};

export const normalizeReferralCode = (code) => String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);

export const storeReferralCode = (code) => {
  const clean = normalizeReferralCode(code);
  if (clean.length < 4) return;
  safe(() => localStorage.setItem(CODE_KEY, JSON.stringify({ code: clean, savedAt: Date.now() })));
};

export const getStoredReferralCode = () =>
  safe(() => {
    const raw = JSON.parse(localStorage.getItem(CODE_KEY) || 'null');
    if (!raw?.code || Date.now() - (raw.savedAt || 0) > CODE_TTL_MS) return '';
    return raw.code;
  }, '');

export const clearStoredReferralCode = () => safe(() => localStorage.removeItem(CODE_KEY));

export const getDeviceId = () =>
  safe(() => {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`);
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  }, '');

const REFERRAL_ERRORS = {
  invalid_code: 'That referral code is not valid, so no referral was added.',
  self_referral: 'You cannot use your own referral code.',
  not_new_customer: 'Referral codes are only for new customers.',
  already_referred: 'A referral code has already been applied to this account.',
  program_disabled: 'Refer & Earn is not running right now.',
};

export const referralResultMessage = (referral) => {
  if (!referral) return null;
  if (referral.applied) return { type: 'success', text: 'Referral code applied. Your friend earns a reward when your first order is delivered.' };
  const text = REFERRAL_ERRORS[referral.reason];
  return text ? { type: 'info', text } : null;
};
