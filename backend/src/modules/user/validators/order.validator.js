import Joi from 'joi';

export const placeOrderSchema = Joi.object({
    items: Joi.array().items(
        Joi.object({
            productId: Joi.string().required(),
            quantity: Joi.number().integer().min(1).required(),
            price: Joi.number().optional(),
            variant: Joi.object().pattern(Joi.string(), Joi.alternatives().try(Joi.string().allow(''), Joi.number(), Joi.boolean())).optional(),
        })
    ).min(1).required(),
    shippingAddress: Joi.object({
        name: Joi.string().required(),
        email: Joi.string().email().required(),
        // Same 10-digit pattern already enforced at signup (auth.validator.js)
        // and for saved addresses (address.validator.js) - this field had no
        // format check at all, so checkout accepted literally any string as a
        // "delivery contact number" (spotted via an order whose shipping
        // phone turned out to be unrelated to the account that placed it).
        phone: Joi.string().pattern(/^[0-9]{10}$/).required().messages({
            'string.pattern.base': 'Please enter a valid 10-digit phone number.',
        }),
        address: Joi.string().required(),
        city: Joi.string().required(),
        state: Joi.string().required(),
        zipCode: Joi.string().required(),
        country: Joi.string().required(),
    }).required(),
    // Only methods the server can actually collect. 'prepaid' is the only one that
    // opens a Razorpay order; 'cod'/'cash' are collected by the rider. Any other
    // value (card, upi, wallet, bank...) used to be accepted, skipped payment
    // entirely, and still dispatched a rider - i.e. a free order.
    paymentMethod: Joi.string().valid('cod', 'cash', 'prepaid').required().messages({
        'any.only': 'Unsupported payment method. Choose Cash on Delivery or Prepaid.',
    }),
    couponCode: Joi.string().optional().allow(''),
    // Spend the customer's wallet balance on this order; the server decides how much.
    useWallet: Joi.boolean().optional().default(false),
    shippingOption: Joi.string().valid('standard', 'express', 'try_and_buy', 'check_and_buy', 'online').default('online'),
    orderType: Joi.string().valid('check_and_buy', 'try_and_buy').required(),
    deliveryType: Joi.string().valid('online').default('online'),
    dropoffLocation: Joi.object({
        type: Joi.string().valid('Point').optional(),
        coordinates: Joi.array().items(Joi.number()).length(2).optional(),
    }).optional().allow(null),
    deviceToken: Joi.string().optional().allow(''),
    subtotal: Joi.number().min(0).optional(),
    tax: Joi.number().min(0).optional(),
    shipping: Joi.number().min(0).optional(),
    platformFee: Joi.number().min(0).optional(),
    total: Joi.number().min(0).optional(),
});

export const createReturnRequestSchema = Joi.object({
    reason: Joi.string().trim().min(5).max(500).required(),
    vendorId: Joi.string().optional(),
    items: Joi.array()
        .items(
            Joi.object({
                productId: Joi.string().required(),
                quantity: Joi.number().integer().min(1).required(),
                reason: Joi.string().trim().max(300).allow('').optional(),
            })
        )
        .min(1)
        .optional(),
    images: Joi.array().items(Joi.string().uri()).max(6).optional(),
});

export const tryBuyReturnRequestSchema = Joi.object({
    reason: Joi.string().trim().min(3).max(500).required(),
    items: Joi.array()
        .items(
            Joi.object({
                productId: Joi.string().required(),
                quantity: Joi.number().integer().min(1).optional(),
                name: Joi.string().optional(),
                vendorId: Joi.string().optional(), // Optional — backend auto-resolves from order
                reason: Joi.string().trim().max(300).allow('').optional(),
            })
        )
        .min(1)
        .required(),
    images: Joi.array().items(Joi.string().uri()).max(6).optional(),
});
