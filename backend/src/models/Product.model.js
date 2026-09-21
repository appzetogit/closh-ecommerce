import mongoose from 'mongoose';

const productSchema = new mongoose.Schema(
    {
        name: { type: String, required: true, trim: true, index: true },
        slug: { type: String, required: true, unique: true },
        description: { type: String },
        price: { type: Number, required: true, min: 0 },
        originalPrice: { type: Number }, // This will be used as MRP (strikethrough price)
        discount: { type: Number, default: 0 }, // This will store percentage off (e.g. 10 for 10%)
        vendorPrice: { type: Number, default: 0 }, // This is the amount the vendor wants
        unit: { type: String, default: 'Piece' },
        offlineSold: { type: Number, default: 0 },
        images: [{ type: String }],
        image: { type: String }, // primary image
        categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true, index: true },
        // 'Unisex' is ADULT unisex - browsing Men or Women includes it.
        // 'Kids' is the kids-unisex catch-all - browsing Boys or Girls
        // includes it, while adult Unisex is deliberately excluded there.
        // See utils/divisionFilter.js for the browsing rules.
        division: {
            type: String, 
            enum: ['Men', 'Women', 'Boys', 'Girls', 'Kids', 'Unisex'], 
            default: 'Unisex',
            index: true 
        },
        brandId: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand', index: true },
        vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true, index: true },
        stock: {
            type: String,
            enum: ['in_stock', 'low_stock', 'out_of_stock'],
            default: 'in_stock',
            index: true,
        },
        stockQuantity: { type: Number, default: 0, min: 0 },
        totalAllowedQuantity: { type: Number, min: 0 },
        minimumOrderQuantity: { type: Number, min: 1, default: 1 },
        lowStockThreshold: { type: Number, default: 10 },
        variants: {
            sizes: [String],
            materials: [String],
            attributes: [{
                name: String,
                values: [String],
            }],
            prices: { type: Map, of: Number },
            stockMap: { type: Map, of: Number },
            imageMap: { type: Map, of: String },
            defaultVariant: {
                size: String,
            },
            defaultSelection: {
                type: Map,
                of: String,
            },
        },
        flashSale: { type: Boolean, default: false, index: true },
        isNewArrival: { type: Boolean, default: false, index: true },
        isFeatured: { type: Boolean, default: false, index: true },
        isActive: { type: Boolean, default: true, index: true },
        isVisible: { type: Boolean, default: true },
        codAllowed: { type: Boolean, default: true },
        returnable: { type: Boolean, default: true },
        cancelable: { type: Boolean, default: true },
        taxIncluded: { type: Boolean, default: false },
        warrantyPeriod: { type: String },
        guaranteePeriod: { type: String },
        hsnCode: { type: String },
        // Code printed on the physical sticker attached to the garment.
        // Snapshotted onto every order line so warehouse staff and riders
        // can match a physical item back to an order line.
        // Indexed below as a partial UNIQUE index rather than with `index: true`,
        // which would declare a second, non-unique index on the same key.
        productCode: { type: String, trim: true, uppercase: true },
        rating: { type: Number, default: 0, min: 0, max: 5 },
        reviewCount: { type: Number, default: 0 },
        taxRate: { type: Number, default: 18 },
        seoTitle: { type: String },
        seoDescription: { type: String },
        relatedProducts: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
        faqs: [{ question: String, answer: String }],
        tags: [String],
        approvalStatus: {
            type: String,
            enum: ['pending', 'approved', 'rejected'],
            default: 'pending',
            index: true
        },
        pendingUpdates: { type: mongoose.Schema.Types.Mixed },
        hasPendingUpdates: { type: Boolean, default: false, index: true },
    },
    { 
        timestamps: true,
        toJSON: { flattenMaps: true },
        toObject: { flattenMaps: true }
    }
);

// An empty string is a value and would collide under a unique index, so a
// blank code is stored as unset and the constraint only covers real codes.
productSchema.pre('save', function (next) {
    if (this.productCode !== undefined && String(this.productCode).trim() === '') {
        this.productCode = undefined;
    }
    next();
});

productSchema.index(
    { productCode: 1 },
    {
        unique: true,
        partialFilterExpression: { productCode: { $exists: true, $type: 'string' } },
    }
);

productSchema.index({ vendorId: 1, isActive: 1 });
productSchema.index({ categoryId: 1, isActive: 1 });
productSchema.index({ name: 'text', description: 'text', tags: 'text' });

const Product = mongoose.model('Product', productSchema);
export { Product };
export default Product;
