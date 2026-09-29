/**
 * Per-line outcome for an order.
 *
 * In a Try & Buy order the customer can keep some items and send others back, so a
 * single order-level status ("returning_unselected_items", "returned") is wrong for
 * every individual line. The real per-item decision only lives in deliveryFlow, so it
 * is resolved here once and exposed to the clients as a plain `itemStatus`.
 */

// productId arrives populated on detail routes and as a raw ObjectId inside
// deliveryFlow, so normalise both down to the same id before matching.
const keyOf = (item) => `${String(item?.productId?._id || item?.productId || '')}|${item?.variantKey || ''}`;

export const buildItemStatusResolver = (order) => {
    const flow = order?.deliveryFlow || {};

    const decisions = new Map();
    (flow.tryAndBuyItems || []).forEach((item) => {
        if (item.decision) decisions.set(keyOf(item), item.decision);
    });
    // rejectedItems is authoritative — it survives even when tryAndBuyItems is absent.
    (flow.rejectedItems || []).forEach((item) => decisions.set(keyOf(item), 'rejected'));

    return (item, groupStatus) => {
        const fallback = groupStatus || order?.status;
        // A cancelled order, or a return raised after delivery (so after the
        // try&buy accept/reject decision was already made), overrides any
        // earlier per-item decision - otherwise an item accepted at delivery
        // stays stuck showing "delivered" forever even once it's returned.
        if (['cancelled', 'returned', 'return requested', 'returning_unselected_items', 'returned_to_vendor'].includes(String(fallback))) {
            return fallback;
        }
        if (decisions.size === 0) return fallback;

        const decision = decisions.get(keyOf(item));
        if (decision === 'rejected') return 'returned';
        if (decision === 'accepted') return 'delivered';
        return fallback;
    };
};

/**
 * Stamps `itemStatus` onto every line of a lean order document, in place.
 *
 * @param {object} order   lean Order document
 * @param {object} [opts]
 * @param {string} [opts.vendorId]      when set, top-level items fall back to that
 *                                      vendor's group status instead of the order's
 * @param {boolean} [opts.stripFlow]    drop deliveryFlow afterwards (list payloads)
 */
export const attachItemStatuses = (order, { vendorId, stripFlow = false } = {}) => {
    if (!order) return order;

    const resolve = buildItemStatusResolver(order);

    const vendorGroup = vendorId
        ? (order.vendorItems || []).find(
            (group) => String(group.vendorId?._id || group.vendorId) === String(vendorId)
        )
        : null;
    const topLevelStatus = vendorGroup?.status || order.status;

    (order.items || []).forEach((item) => { item.itemStatus = resolve(item, topLevelStatus); });
    (order.vendorItems || []).forEach((group) => {
        (group.items || []).forEach((item) => { item.itemStatus = resolve(item, group.status); });
    });

    if (stripFlow) delete order.deliveryFlow;
    return order;
};
