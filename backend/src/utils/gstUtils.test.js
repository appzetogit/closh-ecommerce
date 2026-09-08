import assert from 'node:assert';
import {
    getGstRate,
    calculateInclusiveGST,
    calculateExclusiveGST,
    generateInvoiceBreakdown
} from './gstUtils.js';

console.log("🚀 Running GST Utility Tests...");

try {
    // ──────────── Test 1: getGstRate ────────────
    console.log("Testing getGstRate...");
    assert.strictEqual(getGstRate(100), 5, "Price <= 2500 should return 5%");
    assert.strictEqual(getGstRate(2500), 5, "Price exactly 2500 should return 5%");
    assert.strictEqual(getGstRate(2501), 18, "Price > 2500 should return 18%");
    assert.strictEqual(getGstRate(5000), 18, "Price > 2500 should return 18%");

    // ──────────── Test 2: calculateInclusiveGST (Example 1) ────────────
    console.log("Testing calculateInclusiveGST (Example 1: ₹900)...");
    const result1 = calculateInclusiveGST(900);
    assert.strictEqual(result1.gstRate, 5);
    assert.strictEqual(result1.taxableValue, 857.14, "Taxable Value should be 857.14");
    assert.strictEqual(result1.totalGst, 42.86, "Total GST should be 42.86");
    assert.strictEqual(result1.cgst, 21.43, "CGST should be 21.43");
    assert.strictEqual(result1.sgst, 21.43, "SGST should be 21.43");
    assert.strictEqual(result1.finalAmount, 900, "Final Amount should remain 900");

    // ──────────── Test 3: calculateInclusiveGST (Example 2) ────────────
    console.log("Testing calculateInclusiveGST (Example 2: ₹3000)...");
    const result2 = calculateInclusiveGST(3000);
    assert.strictEqual(result2.gstRate, 18);
    assert.strictEqual(result2.taxableValue, 2542.37, "Taxable Value should be 2542.37");
    assert.strictEqual(result2.totalGst, 457.63, "Total GST should be 457.63");
    assert.strictEqual(result2.cgst, 228.81, "CGST should be 228.81");
    assert.strictEqual(result2.sgst, 228.81, "SGST should be 228.81");
    assert.strictEqual(result2.finalAmount, 3000, "Final Amount should remain 3000");

    // ──────────── Test 4: calculateExclusiveGST ────────────
    console.log("Testing calculateExclusiveGST (Taxable: ₹1000)...");
    const result3 = calculateExclusiveGST(1000); // 5% GST
    assert.strictEqual(result3.gstRate, 5);
    assert.strictEqual(result3.taxableValue, 1000, "Taxable Value should be input value 1000");
    assert.strictEqual(result3.totalGst, 50, "Total GST should be 50");
    assert.strictEqual(result3.cgst, 25, "CGST should be 25");
    assert.strictEqual(result3.sgst, 25, "SGST should be 25");
    assert.strictEqual(result3.finalAmount, 1050, "Final Amount should be 1050");

    console.log("Testing calculateExclusiveGST (Taxable: ₹3000)...");
    const result4 = calculateExclusiveGST(3000); // 18% GST
    assert.strictEqual(result4.gstRate, 18);
    assert.strictEqual(result4.taxableValue, 3000, "Taxable Value should be input value 3000");
    assert.strictEqual(result4.totalGst, 540, "Total GST should be 540");
    assert.strictEqual(result4.cgst, 270, "CGST should be 270");
    assert.strictEqual(result4.sgst, 270, "SGST should be 270");
    assert.strictEqual(result4.finalAmount, 3540, "Final Amount should be 3540");

    // ──────────── Test 5: generateInvoiceBreakdown interface ────────────
    console.log("Testing generateInvoiceBreakdown...");
    const breakdownInclusive = generateInvoiceBreakdown(900, true);
    assert.strictEqual(breakdownInclusive.finalAmount, 900);
    const breakdownExclusive = generateInvoiceBreakdown(1000, false);
    assert.strictEqual(breakdownExclusive.finalAmount, 1050);

    // ──────────── Test 6: Input Validation / Edge Cases ────────────
    console.log("Testing negative price validation...");
    assert.throws(() => getGstRate(-100), /Price cannot be negative/);
    assert.throws(() => calculateInclusiveGST(-50), /Price cannot be negative/);
    assert.throws(() => calculateExclusiveGST(-1), /Price cannot be negative/);

    console.log("Testing non-numeric price validation...");
    assert.throws(() => getGstRate("abc"), /Price must be a valid number/);
    assert.throws(() => getGstRate({}), /Price must be a valid number/);

    console.log("Testing null/undefined validation...");
    assert.throws(() => getGstRate(null), /Price cannot be null or undefined/);
    assert.throws(() => getGstRate(undefined), /Price cannot be null or undefined/);

    console.log("✅ All tests passed successfully!");
} catch (err) {
    console.error("❌ Test failed!");
    console.error(err);
    process.exit(1);
}
