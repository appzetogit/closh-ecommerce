import mongoose from 'mongoose';

const categorySchema = new mongoose.Schema(
    {
        name: { type: String, required: true, trim: true },
        slug: { type: String, required: true, unique: true },
        description: { type: String, trim: true, default: '' },
        image: { type: String },
        icon: { type: String },
        parentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', default: null, index: true },
        order: { type: Number, default: 0 },
        isActive: { type: Boolean, default: true },
        // Tri-state: null/undefined = inherit from the nearest ancestor that sets
        // this (or default-enabled if none do); true/false = an explicit override
        // for this category and everything under it. A category-level `false`
        // always wins over a product's own flag (see resolveTryAndBuyEligibility in
        // utils/categoryFeatures.js) — a business rule like "no Try & Buy for
        // Undergarments" has to hold regardless of what an individual vendor sets
        // on their product.
        tryAndBuyEnabled: { type: Boolean, default: null },
        // When true, this category is kept in sync with its Men/Women
        // opposite-gender sibling (e.g. "Crocs" under "Mens Footwear" <->
        // "Crocs" under "Womens Footwear") - see utils/categoryMirror.js and
        // the create/update handlers in admin/catalog.controller.js.
        isUnisex: { type: Boolean, default: false },
        // The paired category on the opposite side, only set when isUnisex
        // is true. Both categories point at each other.
        linkedCategoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', default: null },
    },
    { timestamps: true }
);

categorySchema.index({ parentId: 1, order: 1 });

const Category = mongoose.model('Category', categorySchema);
export { Category };
export default Category;
