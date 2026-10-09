// Referral codes: up to 4 letters from the customer's name + 4 random characters from an
// alphabet without look-alikes (no 0/O/1/I), e.g. "RAHU7K2P". See docs/REFER_AND_EARN_AND_WALLET.md §5.1.
import crypto from 'crypto';

const RANDOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export const normalizeReferralCode = (code) =>
    String(code || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');

const randomPart = (length) => {
    const bytes = crypto.randomBytes(length);
    let out = '';
    for (let i = 0; i < length; i++) out += RANDOM_ALPHABET[bytes[i] % RANDOM_ALPHABET.length];
    return out;
};

export const buildReferralCode = (name = '') => {
    const prefix = String(name).toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4).padEnd(4, 'X');
    return `${prefix}${randomPart(4)}`;
};

/**
 * A code no other user has. `exists(code)` must resolve to true when taken; the unique index
 * on User.referralCode is the final guard if two sign-ups race for the same code.
 */
export const generateUniqueReferralCode = async (name, exists, attempts = 8) => {
    for (let i = 0; i < attempts; i++) {
        const code = buildReferralCode(name);
        if (!(await exists(code))) return code;
    }
    // Practically unreachable (32^4 combinations per prefix); widen the random part.
    return `${buildReferralCode(name)}${randomPart(2)}`;
};
