import Product from '../models/Product.model.js';
import { resolveOrderItemVariantKey } from './variantKey.js';

/**
 * Restores stock for a list of returned items - the exact mirror of the
 * decrement in modules/user/controllers/order.controller.js placeOrder
 * (Step 4.5) and the restore in cancelOrderInternal. Every return-completion
 * path (admin, vendor, delivery status update, delivery vendor dropoff)
 * should route through this instead of writing its own $inc, so they can't
 * drift out of sync with how stock was actually decremented.
 *
 * @param {Array<{productId, quantity, variantKey?, variant?, hasSpecificVariantStock?}>} items
 * @param {import('mongoose').ClientSession} [session]
 */
export const restockItems = async (items = [], session) => {
    for (const item of items) {
        const quantity = Number(item?.quantity || 0);
        const productId = item?.productId;
        if (!productId || quantity <= 0) continue;

        const productSnapshot = await Product.findById(productId)
            .select('variants.stockMap variants.prices lowStockThreshold')
            .session(session || null)
            .lean();
        if (!productSnapshot) continue; // product deleted since the order was placed - nothing to restock

        // Prefer the variantKey stored on the return/order item itself (set at
        // order time); only re-derive it as a fallback for older records that
        // predate that field.
        const variantKey = item?.variantKey || resolveOrderItemVariantKey(productSnapshot, item);

        const incUpdate = { stockQuantity: quantity };
        // Only touch stockMap when the original decrement did - restoring a
        // key that was never decremented would create a stray bucket instead
        // of just growing stockQuantity. The decrement touches the bucket
        // exactly when the product's stockMap has that key, so that's checked
        // directly too: older return items never stored hasSpecificVariantStock,
        // and relying on the flag alone left their size stuck at 0 ("OUT")
        // while only the product total went back up.
        const mapHasKey = Boolean(variantKey) && productSnapshot?.variants?.stockMap?.[variantKey] !== undefined;
        if (variantKey && (item?.hasSpecificVariantStock || mapHasKey)) {
            incUpdate[`variants.stockMap.${variantKey}`] = quantity;
        }

        const product = await Product.findByIdAndUpdate(
            productId,
            { $inc: incUpdate },
            { new: true, session: session || undefined }
        );
        if (!product) continue;

        const nextStockState =
            product.stockQuantity <= 0
                ? 'out_of_stock'
                : (product.stockQuantity <= (product.lowStockThreshold || 10) ? 'low_stock' : 'in_stock');

        await Product.updateOne(
            { _id: product._id },
            { $set: { stock: nextStockState } },
            { session: session || undefined }
        );
    }
};
