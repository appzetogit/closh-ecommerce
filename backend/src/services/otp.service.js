import crypto from 'crypto';
import { sendSmsOtp } from './sms.service.js';
import { sendEmail } from './email.service.js';

/**
 * Generate a 6-digit OTP and its 10-minute expiry timestamp.
 * Uses a real random OTP, except for specific test numbers.
 */
const generateOtp = (phone) => {
    const normalizedPhone = String(phone || '').replace(/\D/g, '').slice(-10);
    const testNumbers = ['7894561230', '1234567890', '7879363299', '9669002380'];
    
    // Use static OTP for test numbers, otherwise generate a real random OTP
    const otp = testNumbers.includes(normalizedPhone) 
        ? '123456' 
        : crypto.randomInt(100000, 999999).toString();
        
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
    return { otp, otpExpiry };
};

/**
 * Send OTP to the user/vendor via SMS (primary) with email fallback.
 *
 * Delivery rules:
 *   - If the document has a valid `phone` field → send SMS via SMS India Hub.
 *   - If SMS fails (or no phone) AND `email` is present → send email as fallback.
 *   - Both channels can be silently skipped in dev (OTP is always '123456' anyway).
 *
 * @param {Object} doc       - Mongoose user/vendor document
 * @param {string} type      - Purpose label for logging (e.g. 'email_verification')
 * @returns {Promise<string>} - The generated OTP (useful for testing)
 */
export const sendOTP = async (doc, type = 'verification') => {
    let { otp, otpExpiry } = generateOtp(doc.phone);

    doc.otp = otp;
    doc.otpExpiry = otpExpiry;
    await doc.save({ validateBeforeSave: false });

    const phone = String(doc.phone || '').replace(/\D/g, '').slice(-10);
    const email = doc.email;
    let smsSent = false;

    // Check if OTP service is actually enabled in .env
    const isOtpEnabled = process.env.ENABLE_OTP_SERVICE === 'true';

    if (!isOtpEnabled) {
        console.log(`[OTP Simulated] ${type} | phone=+91${phone || 'N/A'} | email=${email || 'N/A'} | otp=${otp}`);
        return otp;
    }

    // ── Primary: SMS ─────────────────────────────────────────────────────────
    if (phone.length === 10) {
        try {
            await sendSmsOtp(phone, otp);
            smsSent = true;
        } catch (smsErr) {
            console.warn(`[OTP] SMS failed for +91${phone} (${type}): ${smsErr.message}`);
        }
    } else {
        console.warn(`[OTP] No valid phone for ${type}. phone="${doc.phone}"`);
    }

    // ── Fallback: Email ───────────────────────────────────────────────────────
    if (!smsSent && email) {
        if (process.env.SMTP_USER === 'your_email@gmail.com') {
            console.warn(`[OTP] Email fallback skipped due to placeholder SMTP_USER. otp=${otp}`);
        } else {
            try {
                await sendEmail({
                to: email,
                subject: 'Your verification code',
                text: `Your verification code is ${otp}. It expires in 10 minutes.`,
                html: `<p>Your verification code is <strong>${otp}</strong>. It expires in 10 minutes.</p>`,
            });
            } catch (emailErr) {
                console.warn(`[OTP] Email fallback also failed for ${email}: ${emailErr.message}`);
            }
        }
    }

    // Dev convenience log
    if (process.env.NODE_ENV !== 'production') {
        console.log(`[OTP] ${type} | phone=+91${phone || 'N/A'} | email=${email || 'N/A'} | sms=${smsSent} | otp=${otp}`);
    }

    return otp;
};

