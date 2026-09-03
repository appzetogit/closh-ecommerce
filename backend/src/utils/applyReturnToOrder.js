/**
 * Stamps a completed ReturnRequest onto its parent Order so invoices/reporting
 * reflect the actual amount payable after the return, instead of the originally
 * purchased amount.
 *
 * Mutates `order.items[]`, `order.vendorItems[].items[]` (returnedQuantity) and
 * `order.returnedAmount` in place. Caller is responsible for order.save().
 *
 * Idempotency: callers must only invoke this once per ReturnRequest transition
 * into 'completed' (guard with previousStatus !== 'completed'). As a second line
 * of defense, returnedQuantity is capped at each line's original quantity, so
 * even an accidental re-run cannot push a line's returned amount past 100%.
 */
const roundTo2 = (val) => Math.round((Number(val) || 0) * 100) / 100;

const variantKeyOf = (item) =>
    item?.selectedSize ||
    item?.variantKey ||
    (item?.variant && typeof item.variant === 'object' ? Object.values(item.variant)[0] : '') ||
    '';

const matchesReturnItem = (orderItem, returnItem) => {
    if (String(orderItem?.productId || '') !== String(returnItem?.productId || '')) return false;
    const orderVariant = variantKeyOf(orderItem);
    const returnVariant = variantKeyOf(returnItem);
    if (!orderVariant && !returnVariant) return true;
    return String(orderVariant) === String(returnVariant);
};

export const applyReturnToOrder = (order, returnRequest) => {
    if (!order || !returnRequest) return 0;

    const returnItems = Array.isArray(returnRequest.items) ? returnRequest.items : [];
    let appliedAmount = 0;

    const applyToList = (list, returnItem, qty) => {
        const match = (list || []).find((oi) => matchesReturnItem(oi, returnItem));
        if (!match) return 0;
        const already = Number(match.returnedQuantity || 0);
        const remaining = Math.max(0, Number(match.quantity || 0) - already);
        const toApply = Math.min(qty, remaining);
        match.returnedQuantity = already + toApply;
        return toApply;
    };

    for (const returnItem of returnItems) {
        const qty = Number(returnItem?.quantity || 0);
        if (qty <= 0) continue;

        const appliedOnFlat = applyToList(order.items, returnItem, qty);
        (order.vendorItems || []).forEach((group) => applyToList(group.items, returnItem, qty));

        const price = Number(returnItem?.price || 0);
        appliedAmount += price * (appliedOnFlat || qty);
    }

    appliedAmount = roundTo2(appliedAmount);
    order.returnedAmount = roundTo2(Number(order.returnedAmount || 0) + appliedAmount);

    order.markModified?.('items');
    order.markModified?.('vendorItems');

    return appliedAmount;
};

export default applyReturnToOrder;
