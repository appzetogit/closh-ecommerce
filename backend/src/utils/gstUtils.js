/**
 * Helper to round a number to exactly 2 decimal places.
 * Relies on toFixed(2) to match standard JavaScript/Node rounding,
 * returning a float number.
 * 
 * @param {number} val 
 * @returns {number}
 */
const roundTo2 = (val) => parseFloat(Number(val).toFixed(2));

/**
 * Validates that the input price is a valid, non-negative finite number.
 * Throws an error if invalid.
 * 
 * @param {number} price 
 */
const validatePrice = (price) => {
    if (price === null || price === undefined) {
        throw new Error("Price cannot be null or undefined");
    }
    const num = Number(price);
    if (isNaN(num)) {
        throw new Error("Price must be a valid number");
    }
    if (!isFinite(num)) {
        throw new Error("Price must be a finite number");
    }
    if (num < 0) {
        throw new Error("Price cannot be negative");
    }
};

/**
 * Determines the GST rate for apparel/clothing products.
 * - Price <= ₹2500 -> 5%
 * - Price > ₹2500 -> 18%
 * 
 * @param {number} price 
 * @returns {number} - GST Rate (5 or 18)
 */
export const getGstRate = (price) => {
    validatePrice(price);
    const num = Number(price);
    return num <= 2500 ? 5 : 18;
};

/**
 * Calculates GST for a GST-inclusive price.
 * 
 * Formula:
 * - Taxable Value = Inclusive Price * 100 / (100 + GST Rate)
 * - GST Amount = Inclusive Price - Taxable Value
 * - CGST = GST Amount / 2
 * - SGST = GST Amount / 2
 * 
 * @param {number} price - Inclusive Price
 * @returns {Object} - Breakdown containing taxableValue, totalGst, cgst, sgst, finalAmount
 */
export const calculateInclusiveGST = (price) => {
    validatePrice(price);
    const inclusivePrice = Number(price);
    const rate = getGstRate(inclusivePrice);
    
    const taxableValue = roundTo2(inclusivePrice * 100 / (100 + rate));
    const totalGst = roundTo2(inclusivePrice - taxableValue);
    
    const cgst = roundTo2(totalGst / 2);
    const sgst = roundTo2(totalGst / 2);
    
    return {
        productPrice: inclusivePrice,
        gstRate: rate,
        taxableValue,
        cgst,
        sgst,
        totalGst,
        finalAmount: inclusivePrice
    };
};

/**
 * Calculates GST for a GST-exclusive price (where the input price is the taxable value).
 * 
 * Formula:
 * - GST Amount = Taxable Value * GST Rate / 100
 * - Final Price = Taxable Value + GST Amount
 * - CGST = GST Amount / 2
 * - SGST = GST Amount / 2
 * 
 * @param {number} price - Exclusive Price (Taxable Value)
 * @returns {Object} - Breakdown containing taxableValue, totalGst, cgst, sgst, finalAmount
 */
export const calculateExclusiveGST = (price) => {
    validatePrice(price);
    const exclusivePrice = Number(price);
    const rate = getGstRate(exclusivePrice);
    
    const totalGst = roundTo2(exclusivePrice * rate / 100);
    const finalAmount = roundTo2(exclusivePrice + totalGst);
    
    const cgst = roundTo2(totalGst / 2);
    const sgst = roundTo2(totalGst / 2);
    
    return {
        productPrice: exclusivePrice,
        gstRate: rate,
        taxableValue: exclusivePrice,
        cgst,
        sgst,
        totalGst,
        finalAmount
    };
};

/**
 * Generates the complete invoice breakdown for a product.
 * 
 * @param {number} price 
 * @param {boolean} isInclusive 
 * @returns {Object}
 */
export const generateInvoiceBreakdown = (price, isInclusive = true) => {
    if (isInclusive) {
        return calculateInclusiveGST(price);
    } else {
        return calculateExclusiveGST(price);
    }
};

/**
 * GST rate for one piece from the admin's slab rules ({ minPrice, maxPrice, rate }).
 * Rules are checked by their upper limit, so a price between two slabs (e.g. 2500.50 when
 * the slabs are 0-2500 and 2501+) lands in the higher slab instead of matching nothing.
 */
export const pickGstRate = (unitPrice, rules) => {
    const price = Number(unitPrice) || 0;
    const sorted = (Array.isArray(rules) ? rules : [])
        .filter((r) => r && Number.isFinite(Number(r.rate)))
        .sort((a, b) => Number(a.maxPrice ?? Infinity) - Number(b.maxPrice ?? Infinity));
    if (!sorted.length) return getGstRate(price);
    const match = sorted.find((r) => price <= Number(r.maxPrice ?? Infinity));
    return Number((match || sorted[sorted.length - 1]).rate) || 0;
};

/**
 * Splits an order-level discount (the coupon) across lines in proportion to each line's
 * amount. Rounded to paise; the last line absorbs the rounding so the shares add up exactly.
 */
export const allocateDiscount = (amounts, discount) => {
    const total = amounts.reduce((s, a) => s + (Number(a) || 0), 0);
    const d = Math.min(Math.max(Number(discount) || 0, 0), total);
    if (!total || !d) return amounts.map(() => 0);
    let left = d;
    return amounts.map((a, i) => {
        if (i === amounts.length - 1) return roundTo2(left);
        const share = roundTo2((d * (Number(a) || 0)) / total);
        left -= share;
        return share;
    });
};

/**
 * Customer GST for order lines, prices GST-inclusive.
 *
 * A coupon given at checkout and shown on the invoice lowers the value of the supply
 * (CGST Act s.15(3)(a)), so each line's coupon share is taken off first and the slab is
 * picked on the price actually paid per piece. Before this the slab used the pre-coupon
 * price: Rs.2,699 shoes with a Rs.269.90 coupon (Rs.2,429.10 paid) were taxed at 18%
 * instead of 5%.
 *
 * lines: [{ price, quantity }]. Returns one entry per line:
 *   { couponDiscount, netAmount, unitNetPrice, gstRate, taxableValue, gst, igst, cgst, sgst, gstType, basePrice }
 */
export const computeLineGst = (lines, { couponDiscount = 0, rules, sameState = true } = {}) => {
    const gross = lines.map((l) => (Number(l.price) || 0) * (Number(l.quantity) || 0));
    const shares = allocateDiscount(gross, couponDiscount);
    return lines.map((l, i) => {
        const qty = Number(l.quantity) || 0;
        const netAmount = roundTo2(gross[i] - shares[i]);
        const unitNetPrice = qty > 0 ? netAmount / qty : 0;
        const gstRate = pickGstRate(unitNetPrice, rules);
        const taxableValue = roundTo2(netAmount / (1 + gstRate / 100));
        const gst = roundTo2(netAmount - taxableValue);
        const cgst = sameState ? roundTo2(gst / 2) : 0;
        const sgst = sameState ? roundTo2(gst - cgst) : 0;
        const igst = sameState ? 0 : gst;
        return {
            couponDiscount: shares[i],
            netAmount,
            unitNetPrice: roundTo2(unitNetPrice),
            gstRate,
            taxableValue,
            gst,
            igst,
            cgst,
            sgst,
            gstType: gstRate > 0 ? (sameState ? 'CGST_SGST' : 'IGST') : 'NONE',
            basePrice: qty > 0 ? roundTo2(taxableValue / qty) : 0,
        };
    });
};

/**
 * Writes computeLineGst's result onto order lines (Order item fields): the line's coupon
 * share, GST rate, per-piece taxable price and line-total customer GST.
 */
export const applyLineGst = (items, options) => {
    const results = computeLineGst(items, options);
    items.forEach((item, i) => {
        const r = results[i];
        item.couponDiscount = r.couponDiscount;
        item.basePrice = r.basePrice;
        item.gstRate = r.gstRate;
        item.customerGstType = r.gstType;
        item.customerIgst = r.igst;
        item.customerCgst = r.cgst;
        item.customerSgst = r.sgst;
    });
    return results;
};
