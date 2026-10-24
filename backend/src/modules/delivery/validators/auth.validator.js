import Joi from 'joi';

export const loginSchema = Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().required(),
    // Push token from the partner app; validate() strips unknown fields, so without these
    // an email/password login never saved the phone's token and the rider got no ring.
    fcmToken: Joi.string().trim().allow('').optional(),
    platform: Joi.string().trim().allow('').optional(),
});

export const registerSchema = Joi.object({
    name: Joi.string().trim().min(2).max(80).required(),
    email: Joi.string().email().lowercase().required(),
    password: Joi.string().min(6).optional().allow(''),
    phone: Joi.string().trim().required(),
    emergencyContact: Joi.string().trim().allow('').optional(),
    aadharNumber: Joi.string().trim().allow('').optional(),
    address: Joi.string().trim().allow('').optional(),
    vehicleType: Joi.string().trim().allow('').optional(),
    vehicleNumber: Joi.string().trim().allow('').optional(),
    fcmToken: Joi.string().trim().allow('').optional(),
    platform: Joi.string().trim().allow('').optional(),
    // Bank Details
    bankName: Joi.string().trim().allow('').optional(),
    accountNumber: Joi.string().trim().allow('').optional(),
    ifscCode: Joi.string().trim().uppercase().allow('').optional(),
    accountHolderName: Joi.string().trim().allow('').optional(),
});

export const forgotPasswordSchema = Joi.object({
    email: Joi.string().email().lowercase().required(),
});

export const verifyResetOtpSchema = Joi.object({
    email: Joi.string().email().lowercase().required(),
    otp: Joi.string().pattern(/^\d{6}$/).required(),
});

export const refreshTokenSchema = Joi.object({
    refreshToken: Joi.string().required(),
});

export const logoutSchema = Joi.object({
    refreshToken: Joi.string().allow('').optional(),
});

export const resetPasswordSchema = Joi.object({
    email: Joi.string().email().lowercase().required(),
    password: Joi.string().min(6).required(),
    confirmPassword: Joi.string().valid(Joi.ref('password')).required().messages({
        'any.only': 'Confirm password must match password.',
    }),
});
