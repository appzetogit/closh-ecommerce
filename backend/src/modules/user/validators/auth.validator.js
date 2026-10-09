import Joi from 'joi';

export const registerSchema = Joi.object({
    name: Joi.string().trim().min(2).max(50).required(),
    email: Joi.string().email().lowercase().required(),
    password: Joi.string().min(6).optional(), // optional now
    phone: Joi.string().pattern(/^[0-9]{10}$/).optional(),
    referralCode: Joi.string().trim().uppercase().pattern(/^[A-Z0-9]{4,12}$/).allow('', null).optional()
        .messages({ 'string.pattern.base': 'Invalid referral code.' }),
    deviceId: Joi.string().trim().max(100).allow('', null).optional(),
});

export const loginOtpSchema = Joi.object({
    phone: Joi.string().pattern(/^[0-9]{10}$/).required(),
});

export const registerOtpSchema = Joi.object({
    phone: Joi.string().pattern(/^[0-9]{10}$/).required().messages({
        'string.pattern.base': 'Invalid phone number.',
    }),
    name: Joi.string().trim().min(2).max(50).required(),
    email: Joi.string().email().lowercase().required().messages({
        'string.email': 'Invalid email address.',
    }),
    referralCode: Joi.string().trim().uppercase().pattern(/^[A-Z0-9]{4,12}$/).allow('', null).optional()
        .messages({ 'string.pattern.base': 'Invalid referral code.' }),
    deviceId: Joi.string().trim().max(100).allow('', null).optional(),
});

export const referralCodeSchema = Joi.object({
    code: Joi.string().trim().uppercase().pattern(/^[A-Z0-9]{4,12}$/).required()
        .messages({ 'string.pattern.base': 'Invalid referral code.' }),
});

export const checkPhoneSchema = Joi.object({
    phone: Joi.string().pattern(/^[0-9]{10}$/).required().messages({
        'string.pattern.base': 'Invalid phone number. Must be 10 digits.',
        'any.required': 'Phone number is required.'
    }),
});

export const loginSchema = Joi.object({
    email: Joi.string().required(),
    password: Joi.string().required(),
});

export const otpSchema = Joi.object({
    email: Joi.string().required(),
    otp: Joi.string().length(6).required(),
});

export const resendOtpSchema = Joi.object({
    email: Joi.string().required(),
});

export const refreshTokenSchema = Joi.object({
    refreshToken: Joi.string().required(),
});

export const logoutSchema = Joi.object({
    refreshToken: Joi.string().allow('').optional(),
});

export const forgotPasswordSchema = Joi.object({
    email: Joi.string().required(),
});

export const verifyResetOtpSchema = Joi.object({
    email: Joi.string().required(),
    otp: Joi.string().length(6).required(),
});

export const resetPasswordSchema = Joi.object({
    email: Joi.string().required(),
    password: Joi.string().min(6).required(),
    confirmPassword: Joi.string().valid(Joi.ref('password')).required().messages({
        'any.only': 'Confirm password must match password.',
    }),
});

export const updateProfileSchema = Joi.object({
    name: Joi.string().trim().min(2).max(50).required(),
    firstName: Joi.string().trim().allow('').optional(),
    lastName: Joi.string().trim().allow('').optional(),
    email: Joi.string().email().lowercase().optional(),
    phone: Joi.string().pattern(/^[0-9]{10}$/).allow('').optional(),
    dob: Joi.string().allow('').optional(),
    gender: Joi.string().allow('').optional(),
    ageRange: Joi.string().allow('').optional(),
    stylePreference: Joi.string().allow('').optional(),
    preferredFit: Joi.string().allow('').optional(),
});

export const changePasswordSchema = Joi.object({
    currentPassword: Joi.string().required(),
    newPassword: Joi.string().min(6).required(),
});
