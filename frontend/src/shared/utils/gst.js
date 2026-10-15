// Customer GST for invoices. Mirrors backend/src/utils/gstUtils.js (computeLineGst) so an
// invoice shows the same tax the order was charged.
//
// A coupon given at checkout lowers the value of the supply, so each line's share of the
// coupon is taken off first and the slab is picked on the price actually paid per piece:
// Rs.2,699 shoes with a Rs.269.90 coupon (Rs.2,429.10 paid) are 5%, not 18%.

export const DEFAULT_GST_RULES = [
  { minPrice: 0, maxPrice: 2500, rate: 5 },
  { minPrice: 2501, maxPrice: 9999999, rate: 18 },
];

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// Rules are matched by their upper limit, so a price between two slabs (2500.50) goes to the
// higher slab instead of matching nothing.
export const pickGstRate = (unitPrice, rules = DEFAULT_GST_RULES) => {
  const price = Number(unitPrice) || 0;
  const list = (Array.isArray(rules) && rules.length ? rules : DEFAULT_GST_RULES)
    .filter((r) => r && Number.isFinite(Number(r.rate)))
    .sort((a, b) => Number(a.maxPrice ?? Infinity) - Number(b.maxPrice ?? Infinity));
  const match = list.find((r) => price <= Number(r.maxPrice ?? Infinity));
  return Number((match || list[list.length - 1])?.rate) || 0;
};

// Coupon split across lines in proportion to their amount; the last line takes the rounding.
export const allocateDiscount = (amounts, discount) => {
  const total = amounts.reduce((s, a) => s + (Number(a) || 0), 0);
  const d = Math.min(Math.max(Number(discount) || 0, 0), total);
  if (!total || !d) return amounts.map(() => 0);
  let left = d;
  return amounts.map((a, i) => {
    if (i === amounts.length - 1) return round2(left);
    const share = round2((d * (Number(a) || 0)) / total);
    left -= share;
    return share;
  });
};

/**
 * lines: [{ price, quantity }] (GST-inclusive prices). Returns per line:
 * { couponDiscount, netAmount, gstRate, taxableValue, gst, cgst, sgst, igst }
 */
export const computeLineGst = (lines, { couponDiscount = 0, rules, interState = false } = {}) => {
  const gross = lines.map((l) => (Number(l.price) || 0) * (Number(l.quantity) || 0));
  const shares = allocateDiscount(gross, couponDiscount);
  return lines.map((l, i) => {
    const qty = Number(l.quantity) || 0;
    const netAmount = round2(gross[i] - shares[i]);
    const gstRate = pickGstRate(qty > 0 ? netAmount / qty : 0, rules);
    const taxableValue = round2(netAmount / (1 + gstRate / 100));
    const gst = round2(netAmount - taxableValue);
    const cgst = interState ? 0 : round2(gst / 2);
    const sgst = interState ? 0 : round2(gst - cgst);
    return {
      couponDiscount: shares[i],
      netAmount,
      gstRate,
      taxableValue,
      gst,
      cgst,
      sgst,
      igst: interState ? gst : 0,
    };
  });
};
