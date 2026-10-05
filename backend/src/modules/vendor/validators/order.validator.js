import Joi from 'joi';

const allowedStatuses = [
    'pending',
    'accepted',
    'ready_for_pickup',
    'picked_up',
    // 'out_for_delivery' and 'delivered' are deliberately absent: only the rider
    // can move an order into those, after the customer's delivery OTP. A vendor
    // setting 'delivered' used to credit the rider and vendor wallets with no OTP.
    'cancelled',
];

export const updateOrderStatusSchema = Joi.object({
    status: Joi.string()
        .required()
        .trim()
        .valid(...allowedStatuses)
        .insensitive() // Makes validation case-insensitive
        .messages({
            'string.base': 'Status must be a text string',
            'string.empty': 'Status cannot be empty',
            'any.required': 'Status field is required',
            'any.only': `Status must be one of: ${allowedStatuses.join(', ')}`,
        }),
});
