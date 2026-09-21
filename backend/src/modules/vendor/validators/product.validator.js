import Joi from 'joi';

const objectId = Joi.string().trim().hex().length(24);

export const createProductSchema = Joi.object({
    name: Joi.string().trim().min(2).max(200).regex(/^[a-zA-Z0-9\s]+$/).required().messages({
        "string.pattern.base": "Product name must contain only alphanumeric characters and spaces"
    }),
    description: Joi.string().allow('').optional(),
    price: Joi.number().min(0).required(),
    originalPrice: Joi.number().min(0).allow(null, '').optional(),
    unit: Joi.string().regex(/^[a-zA-Z0-9\s]*$/).allow('').default('Piece').messages({
        "string.pattern.base": "Unit must contain only alphanumeric characters and spaces"
    }),
    categoryId: objectId.required(),
    subcategoryId: objectId.allow(null, '').optional(),
    brandId: objectId.allow(null, '').optional(),
    stockQuantity: Joi.number().integer().min(0).allow('').default(0),
    lowStockThreshold: Joi.number().integer().min(0).allow('').default(10),
    stock: Joi.string().valid('in_stock', 'low_stock', 'out_of_stock').optional(),
    totalAllowedQuantity: Joi.number().integer().min(0).allow(null).optional(),
    minimumOrderQuantity: Joi.number().integer().min(0).allow(null).optional(),
    warrantyPeriod: Joi.string().allow('', null).optional(),
    guaranteePeriod: Joi.string().allow('', null).optional(),
    productCode: Joi.string().trim().uppercase().max(64).allow('', null).optional().messages({
        'string.max': 'Product code cannot exceed 64 characters.',
    }),
    hsnCode: Joi.string().pattern(/^\d*$/).allow('', null).optional().messages({
        "string.pattern.base": "HSN code must contain only numbers"
    }),
    taxRate: Joi.number().min(0).max(100).allow('').default(18),
    flashSale: Joi.boolean().default(false),
    isNewArrival: Joi.boolean().default(false),
    isFeatured: Joi.boolean().optional(),
    isVisible: Joi.boolean().optional(),
    codAllowed: Joi.boolean().optional(),
    returnable: Joi.boolean().optional(),
    cancelable: Joi.boolean().optional(),
    taxIncluded: Joi.boolean().optional(),
    image: Joi.string().allow('').optional(),
    images: Joi.array().items(Joi.string()).optional(),
    tags: Joi.array().items(Joi.string()).optional(),
    seoTitle: Joi.string().allow('', null).optional(),
    seoDescription: Joi.string().allow('', null).optional(),
    relatedProducts: Joi.array().items(objectId).optional(),
    faqs: Joi.array().items(
        Joi.object({
            question: Joi.string().trim().allow('').optional(),
            answer: Joi.string().trim().allow('').optional(),
        })
    ).optional(),
    variants: Joi.object({
        sizes: Joi.array().items(Joi.string()),
        attributes: Joi.array().items(
            Joi.object({
                name: Joi.string().trim().allow('').optional(),
                values: Joi.array().items(Joi.string().trim()).optional(),
            })
        ).optional(),
        prices: Joi.object().pattern(Joi.string(), Joi.number().min(0)).optional(),
        stockMap: Joi.object().pattern(Joi.string(), Joi.number().min(0)).optional(),
        imageMap: Joi.object().pattern(Joi.string(), Joi.string().allow('', null)).optional(),
        defaultVariant: Joi.object({
            size: Joi.string().allow('').optional(),
        }).optional(),
        defaultSelection: Joi.object().optional(),
    }).optional(),
}).unknown(true);

export const updateProductSchema = Joi.object({
    name: Joi.string().trim().min(2).max(200).regex(/^[a-zA-Z0-9\s]+$/).optional().messages({
        "string.pattern.base": "Product name must contain only alphanumeric characters and spaces"
    }),
    description: Joi.string().allow('').optional(),
    price: Joi.number().min(0).optional(),
    originalPrice: Joi.number().min(0).allow(null, '').optional(),
    unit: Joi.string().regex(/^[a-zA-Z0-9\s]*$/).allow('').optional().messages({
        "string.pattern.base": "Unit must contain only alphanumeric characters and spaces"
    }),
    categoryId: objectId.optional(),
    subcategoryId: objectId.allow(null, '').optional(),
    brandId: objectId.allow(null, '').optional(),
    stockQuantity: Joi.number().integer().min(0).allow('').optional(),
    lowStockThreshold: Joi.number().integer().min(0).allow('').optional(),
    stock: Joi.string().valid('in_stock', 'low_stock', 'out_of_stock').optional(),
    totalAllowedQuantity: Joi.number().integer().min(0).allow(null).optional(),
    minimumOrderQuantity: Joi.number().integer().min(0).allow(null).optional(),
    warrantyPeriod: Joi.string().allow('', null).optional(),
    guaranteePeriod: Joi.string().allow('', null).optional(),
    productCode: Joi.string().trim().uppercase().max(64).allow('', null).optional().messages({
        'string.max': 'Product code cannot exceed 64 characters.',
    }),
    hsnCode: Joi.string().pattern(/^\d*$/).allow('', null).optional().messages({
        "string.pattern.base": "HSN code must contain only numbers"
    }),
    taxRate: Joi.number().min(0).max(100).allow('').optional(),
    flashSale: Joi.boolean().optional(),
    isNewArrival: Joi.boolean().optional(),
    isFeatured: Joi.boolean().optional(),
    isVisible: Joi.boolean().optional(),
    codAllowed: Joi.boolean().optional(),
    returnable: Joi.boolean().optional(),
    cancelable: Joi.boolean().optional(),
    taxIncluded: Joi.boolean().optional(),
    image: Joi.string().allow('', null).optional(),
    images: Joi.array().items(Joi.string()).optional(),
    tags: Joi.array().items(Joi.string()).optional(),
    seoTitle: Joi.string().allow('', null).optional(),
    seoDescription: Joi.string().allow('', null).optional(),
    relatedProducts: Joi.array().items(objectId).optional(),
    faqs: Joi.array().items(
        Joi.object({
            question: Joi.string().trim().allow('').optional(),
            answer: Joi.string().trim().allow('').optional(),
        })
    ).optional(),
    variants: Joi.object({
        sizes: Joi.array().items(Joi.string()),
        attributes: Joi.array().items(
            Joi.object({
                name: Joi.string().trim().allow('').optional(),
                values: Joi.array().items(Joi.string().trim()).optional(),
            })
        ).optional(),
        prices: Joi.object().pattern(Joi.string(), Joi.number().min(0)).optional(),
        stockMap: Joi.object().pattern(Joi.string(), Joi.number().min(0)).optional(),
        imageMap: Joi.object().pattern(Joi.string(), Joi.string().allow('', null)).optional(),
        defaultVariant: Joi.object({
            size: Joi.string().allow('').optional(),
        }).optional(),
        defaultSelection: Joi.object().optional(),
    }).optional(),
}).unknown(true);

export const productIdParamSchema = Joi.object({
    id: objectId.required(),
});
