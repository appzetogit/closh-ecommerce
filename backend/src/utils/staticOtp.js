/**
 * Static test OTP ("123456") for a fixed list of phone numbers, for local development only.
 *
 * It used to be unconditional: those numbers belong to real rider/vendor/customer accounts, so
 * anyone who knew them could log in as those people on production with 123456. It is now OFF
 * unless BOTH are true:
 *   - NODE_ENV is not 'production', and
 *   - ENABLE_TEST_OTP=true is set explicitly (never set it on a server).
 * validateEnv() refuses to start a production process that has ENABLE_TEST_OTP=true.
 */
export const TEST_OTP = '123456';

const DEFAULT_TEST_NUMBERS = ['7894561230', '1234567890', '7879363299', '8817921168', '9669002380'];

export const isTestOtpEnabled = () =>
    String(process.env.NODE_ENV || '').toLowerCase() !== 'production' &&
    process.env.ENABLE_TEST_OTP === 'true';

const testNumbers = () => {
    const configured = String(process.env.TEST_OTP_NUMBERS || '')
        .split(',')
        .map((n) => n.replace(/\D/g, '').slice(-10))
        .filter(Boolean);
    return configured.length ? configured : DEFAULT_TEST_NUMBERS;
};

export const isTestOtpNumber = (phone) => {
    if (!isTestOtpEnabled()) return false;
    const normalized = String(phone || '').replace(/\D/g, '').slice(-10);
    return testNumbers().includes(normalized);
};
