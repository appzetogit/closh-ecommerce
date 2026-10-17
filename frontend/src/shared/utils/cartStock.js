// Stock limits for cart lines. The server sends `availableStock` on every cart item (the
// same rule placeOrder uses), so the cart can stop the customer at the + button instead of
// at "Place order". Older responses without it fall back to the line's own stock fields.

export const getLineAvailableStock = (item) => {
  if (Number.isFinite(Number(item?.availableStock)) && item?.availableStock !== null && item?.availableStock !== undefined) {
    return Math.max(0, Number(item.availableStock));
  }
  const size = item?.variant?.size || item?.selectedSize;
  const stockMap = item?.variants?.stockMap;
  if (size && stockMap) {
    const s = String(size);
    for (const k of [`${s.toLowerCase()}|`, `${s}|`, `size=${s.toLowerCase()}`, `size=${s}`]) {
      if (stockMap[k] !== undefined) return Math.max(0, Number(stockMap[k]) || 0);
    }
  }
  return Math.max(0, Number(item?.stockQuantity ?? 1) || 0);
};

// Cart line state for the quantity controls and messages.
export const getLineStockState = (item) => {
  const available = getLineAvailableStock(item);
  const qty = Number(item?.quantity) || 0;
  return {
    available,
    outOfStock: available <= 0,
    atLimit: qty >= available, // + must not go higher
    overLimit: available > 0 && qty > available, // stock dropped below what is in the cart
    lowStock: available > 0 && available <= 5,
  };
};

export const stockLimitMessage = (name, available) =>
  `Only ${available} unit${available === 1 ? '' : 's'} of "${name}" ${available === 1 ? 'is' : 'are'} available.`;
