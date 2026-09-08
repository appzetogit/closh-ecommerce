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
