import Razorpay from 'razorpay';
import crypto from 'crypto';
import asyncHandler from '../../../utils/asyncHandler.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import ApiError from '../../../utils/ApiError.js';
import Order from '../../../models/Order.model.js';
import Product from '../../../models/Product.model.js';
import Coupon from '../../../models/Coupon.model.js';
import Commission from '../../../models/Commission.model.js';
import ReturnRequest from '../../../models/ReturnRequest.model.js';
import Admin from '../../../models/Admin.model.js';
import { generateOrderId } from '../../../utils/generateOrderId.js';
import { generateReturnId } from '../../../utils/generateReturnId.js';
import { generateTrackingNumber } from '../../../utils/generateTrackingNumber.js';
import mongoose from 'mongoose';
import { createNotification } from '../../../services/notification.service.js';
import { calculateVendorShippingForGroups } from '../../../services/vendorShipping.service.js';
import { emitEvent } from '../../../services/socket.service.js';
import Settings from '../../../models/Settings.model.js';
import { calculateDistance, getDeliveryEarning, getVendorPickupFee } from '../../../utils/geo.js';
import { validateAddressServiceability } from '../../../services/serviceArea.service.js';
import Vendor from '../../../models/Vendor.model.js';
import { OrderNotificationService } from '../../../services/orderNotification.service.js';
import { geocodeAddress, getDistanceMatrix, getRouteDistance } from '../../../services/googleMaps.service.js';
import { applyActiveCampaigns } from '../../../utils/productUtils.js';
import { refundPayment } from '../../../services/razorpay.service.js';
import { validateCoupon } from '../../../services/coupon.service.js';
import { autoAssignDeliveryBoy } from '../../../services/autoAssignment.service.js';
import * as DeliveryOtpService from '../../../services/deliveryOtp.service.js';
import { QueueService } from '../../../services/queue.service.js';

const getRazorpayInstance = () => {
    const key_id = process.env.RAZORPAY_KEY_ID;
    const key_secret = process.env.RAZORPAY_KEY_SECRET;

    if (!key_id || !key_secret) {
        console.warn('⚠️ Razorpay keys missing. Online payments will fail.');
        return null;
    }

    return new Razorpay({ key_id, key_secret });
};


const normalizeVariantPart = (value) => String(value || '').trim().toLowerCase();
const normalizeAxisName = (value) =>
    String(value || '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '_');
const createDynamicVariantKey = (selection = {}) =>
    Object.entries(selection || {})
        .map(([axis, value]) => [normalizeAxisName(axis), normalizeVariantPart(value)])
        .filter(([axis, value]) => axis && value)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([axis, value]) => `${axis}=${value}`)
        .join('|');

const toVariantPriceEntries = (variantPrices) => {
    if (!variantPrices) return [];
    if (variantPrices instanceof Map) return Array.from(variantPrices.entries());
    if (typeof variantPrices === 'object') return Object.entries(variantPrices);
    return [];
};

const toVariantStockEntries = (stockMap) => {
    if (!stockMap) return [];
    if (stockMap instanceof Map) return Array.from(stockMap.entries());
    if (typeof stockMap === 'object') return Object.entries(stockMap);
    return [];
};

const resolveVariantSelection = (product, selectedVariant) => {
    const basePrice = Number(product?.price);
    if (!Number.isFinite(basePrice)) {
        throw new ApiError(400, `Invalid price configured for product ${product?.name || product?._id || ''}.`);
    }

    const priceEntries = toVariantPriceEntries(product?.variants?.prices);
    const stockEntries = toVariantStockEntries(product?.variants?.stockMap);

    // Resolve the best matching key from both Price and Stock maps
    const variantKey = resolveOrderItemVariantKey(product, { variant: selectedVariant });

    const sizes = Array.isArray(product?.variants?.sizes) ? product.variants.sizes : [];
    const colors = Array.isArray(product?.variants?.colors) ? product.variants.colors : [];
    const attributes = Array.isArray(product?.variants?.attributes) ? product.variants.attributes : [];
    const hasVariantAxes = sizes.length > 0 || colors.length > 0 || attributes.length > 0;

    if (variantKey) {
        // Try to find price for this key
        const priceMatch = priceEntries.find(([k]) => String(k).trim() === variantKey);
        const price = priceMatch ? Number(priceMatch[1]) : basePrice;

        return {
            price: (Number.isFinite(price) && price >= 0) ? price : basePrice,
            variantKey,
            hasVariantAxes
        };
    }

    // Fallback if no variant key resolved but product has variant axes
    return { price: basePrice, variantKey: null, hasVariantAxes };
};

const resolveVariantKeyFromKeys = (keys = [], variant = {}) => {
    if (!keys || !keys.length) return null;

    const size = normalizeVariantPart(variant?.size || variant?.Size || '');
    const color = normalizeVariantPart(variant?.color || variant?.Color || '');
    if (!size && !color) return null;

    const candidates = [
        [size && `size=${size}`, color && `color=${color}`].filter(Boolean).sort().join('|'),
        `${size}|${color}`,
        `${size}|`,
        `|${color}`,
        `${size}-${color}`,
        `${size}_${color}`,
        `${size}:${color}`,
        size && !color ? size : null,
        color && !size ? color : null,
    ].filter(Boolean);

    for (const candidate of candidates) {
        const exact = keys.find((key) => key === candidate);
        if (exact) return exact;
        const normalized = keys.find((key) => normalizeVariantPart(key) === normalizeVariantPart(candidate));
        if (normalized) return normalized;
    }
    return null;
};

const resolveOrderItemVariantKey = (product, orderItem) => {
    const explicitKey = String(orderItem?.variantKey || '').trim();
    if (explicitKey) return explicitKey;

    const stockEntries = toVariantStockEntries(product?.variants?.stockMap).map(([k]) => String(k).trim());
    const priceEntries = toVariantPriceEntries(product?.variants?.prices).map(([k]) => String(k).trim());
    const existingKeys = [...new Set([...stockEntries, ...priceEntries])];
    if (!existingKeys.length) return null;

    const dynamicSelection = Object.entries(orderItem?.variant || {}).reduce((acc, [axis, value]) => {
        const axisKey = normalizeAxisName(axis);
        const selectedValue = String(value || '').trim();
        if (axisKey && selectedValue) acc[axisKey] = selectedValue;
        return acc;
    }, {});
    const dynamicKey = createDynamicVariantKey(dynamicSelection);
    if (dynamicKey) {
        const exactDynamic = existingKeys.find((key) => key === dynamicKey);
        if (exactDynamic) return exactDynamic;
        const normalizedDynamic = existingKeys.find(
            (key) => normalizeVariantPart(key) === normalizeVariantPart(dynamicKey)
        );
        if (normalizedDynamic) return normalizedDynamic;
    }

    return resolveVariantKeyFromKeys(existingKeys, orderItem?.variant);
};

// POST /api/user/orders
export const placeOrder = asyncHandler(async (req, res) => {
    const { items, shippingAddress, paymentMethod, couponCode, shippingOption, orderType, deliveryType, deviceToken, dropoffLocation } = req.body;

    const userId = req.user?._id || req.user?.id;

    // 0. Check Order Time Management Settings
    const orderSettings = await Settings.findOne({ key: 'orders' }).lean();
    if (orderSettings && orderSettings.value?.timeManagement?.enabled) {
        let { startTime, endTime, message } = orderSettings.value.timeManagement;
        
        // Fallback to defaults if missing in DB due to frontend state issue
        startTime = startTime || '09:00';
        endTime = endTime || '21:00';

        if (startTime && endTime) {
            const now = new Date();
            // Convert to IST
            const istTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
            const currentHours = istTime.getHours();
            const currentMinutes = istTime.getMinutes();
            
            const [startH, startM] = startTime.split(':').map(Number);
            const [endH, endM] = endTime.split(':').map(Number);
            
            const currentTotal = currentHours * 60 + currentMinutes;
            const startTotal = startH * 60 + startM;
            const endTotal = endH * 60 + endM;
            
            let isAllowed = false;
            if (startTotal <= endTotal) {
                isAllowed = currentTotal >= startTotal && currentTotal <= endTotal;
            } else {
                isAllowed = currentTotal >= startTotal || currentTotal <= endTotal;
            }
            
            if (!isAllowed) {
                const customMsg = message || `We are currently not accepting orders. Please try again between ${startTime} and ${endTime}.`;
                const error = new ApiError(403, customMsg, [{ code: 'ORDER_TIME_RESTRICTED', startTime, endTime }]);
                throw error;
            }
        }
    }

    // 1. Check serviceability (Service is not yet delivered/available in the zone check)
    if (shippingAddress) {
        try {
            await validateAddressServiceability({
                pincode: shippingAddress.zipCode,
                city: shippingAddress.city,
                coordinates: dropoffLocation?.coordinates || null
            });
        } catch (error) {
            throw new ApiError(400, error.message || "Service is not yet available/delivered in this area. Please try another location.");
        }
    }

    console.log("STEP 3 - Received dropoffLocation:", dropoffLocation);

    // Validate order type
    const allowedOrderTypes = ['check_and_buy', 'try_and_buy'];
    if (!orderType || !allowedOrderTypes.includes(orderType)) {
        throw new ApiError(400, "Please select an order type: 'Check & Buy' or 'Try & Buy'.");
    }

    const normalizedPaymentMethod = paymentMethod === 'cash' ? 'cod' : paymentMethod;
    const rawIdempotencyKey = String(req.get('x-idempotency-key') || '').trim();
    const idempotencyKey = rawIdempotencyKey || null;
    const normalizedGuestEmail = String(shippingAddress?.email || '').trim().toLowerCase();
    const normalizedGuestPhone = String(shippingAddress?.phone || '').replace(/\D/g, '').slice(-10);
    const idempotencyScope = userId
        ? `user:${String(userId)}`
        : `guest:${normalizedGuestEmail || normalizedGuestPhone || 'anonymous'}`;

    if (idempotencyKey) {
        const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
        const existingOrder = await Order.findOne({
            idempotencyScope,
            idempotencyKey,
            createdAt: { $gte: fifteenMinutesAgo }
        })
            .select('orderId total trackingNumber')
            .lean();
        if (existingOrder) {
            return res.status(200).json(
                new ApiResponse(
                    200,
                    {
                        orderId: existingOrder.orderId,
                        total: existingOrder.total,
                        trackingNumber: existingOrder.trackingNumber,
                        idempotentReplay: true,
                    },
                    'Duplicate order request ignored. Returning existing order.'
                )
            );
        }
    }

    console.log(`\n--- 📦 [PLACE ORDER] ---`);
    console.log(`User/Guest: ${idempotencyScope}`);
    console.log(`Items: ${items.length}, Type: ${orderType}, Delivery: ${deliveryType}`);


    // Fetch GST Rules
    const taxSettings = await Settings.findOne({ key: 'tax' });
    
    const gstRules = taxSettings?.value?.gstRules || [
        { minPrice: 0, maxPrice: 2500, rate: 5 },
        { minPrice: 2501, maxPrice: 9999999, rate: 18 }
    ];
    const closhBusinessState = taxSettings?.value?.closhBusinessState || 'Rajasthan';
    const buyerState = shippingAddress?.state || '';
    const isSameState = String(buyerState).trim().toLowerCase() === String(closhBusinessState).trim().toLowerCase();

    // 1. Validate items and calculate subtotal


    let subtotal = 0;
    const enrichedItems = [];
    const vendorMap = {};

    for (const item of items) {
        const productDoc = await Product.findById(item.productId).populate(
            'vendorId',
            'commissionRate storeName shippingEnabled defaultShippingRate freeShippingThreshold shopLocation isOnline address'
        );

        if (!productDoc) {
            throw new ApiError(404, `Product not found: ${item.productId}`);
        }

        // Check if store is offline
        if (productDoc.vendorId && productDoc.vendorId.isOnline === false) {
            throw new ApiError(400, `The store "${productDoc.vendorId.storeName}" is currently offline. Orders cannot be placed at this time.`);
        }

        // Apply active campaigns to ensure order pricing matches catalog pricing
        const product = await applyActiveCampaigns(productDoc);

        console.log(`🛒 [ITEM] ${product.name} x${item.quantity}, Price: ${product.price}, Vendor: ${product.vendorId.storeName}`);

        if (product.stock === 'out_of_stock') throw new ApiError(400, `"${product.name}" is currently out of stock.`);
        if (product.stockQuantity < item.quantity) {
            if (product.stockQuantity <= 0) {
                throw new ApiError(400, `"${product.name}" is currently out of stock.`);
            } else {
                throw new ApiError(400, `Only ${product.stockQuantity} unit(s) of "${product.name}" are available.`);
            }
        }

        // Always trust server-side product pricing; never trust client-sent item.price.
        const { price: itemPrice, variantKey, hasVariantAxes } = resolveVariantSelection(product, item.variant);

        if (hasVariantAxes && !variantKey) {
            throw new ApiError(400, `Please select a valid variant for ${product.name}.`);
        }

        let variantStockValue = null;
        let stockKeyInMap = variantKey;
        let hasSpecificVariantStock = false;
        if (hasVariantAxes && variantKey) {
            const stockKeys = toVariantStockEntries(product?.variants?.stockMap).map(([k]) => String(k).trim());
            const resolvedStockKey = resolveVariantKeyFromKeys(stockKeys, item.variant);
            if (resolvedStockKey) {
                stockKeyInMap = resolvedStockKey;
            }
            const rawVariantStock = product?.variants?.stockMap?.get?.(stockKeyInMap) ?? product?.variants?.stockMap?.[stockKeyInMap];
            if (rawVariantStock !== undefined && rawVariantStock !== null && rawVariantStock !== "") {
                variantStockValue = Number(rawVariantStock);
                hasSpecificVariantStock = true;
            } else {
                if (stockKeys.length > 0) {
                    variantStockValue = 0;
                } else {
                    variantStockValue = Number(product.stockQuantity || 0);
                }
                hasSpecificVariantStock = false;
            }
        }

        if (hasVariantAxes && variantKey && variantStockValue < item.quantity) {
            if (variantStockValue <= 0) {
                throw new ApiError(400, `"${product.name}" is currently out of stock in the selected variant.`);
            } else {
                throw new ApiError(400, `Only ${variantStockValue} unit(s) of "${product.name}" are available in the selected variant.`);
            }
        }
        const itemSubtotal = itemPrice * item.quantity;
        subtotal += itemSubtotal;

        const variantImage =
            variantKey
                ? String(
                    (product?.variants?.imageMap?.get?.(variantKey) ?? product?.variants?.imageMap?.[variantKey]) ||
                    (stockKeyInMap ? (product?.variants?.imageMap?.get?.(stockKeyInMap) ?? product?.variants?.imageMap?.[stockKeyInMap]) : '') ||
                    ''
                ).trim()
                : '';
        const itemCommissionRate = product.vendorId.commissionRate || 0;
        const itemVendorPrice = product.vendorPrice || 0;
        const itemCommissionAmount = (itemVendorPrice * item.quantity * itemCommissionRate) / 100;
        const itemMarginAmount = (itemPrice - itemVendorPrice) * item.quantity;
        // Find matching GST rule based on itemPrice
        const gstRule = gstRules.find(rule => itemPrice >= rule.minPrice && itemPrice <= rule.maxPrice) || { rate: 0 };
        const gstRate = gstRule.rate || 0;
        
        // Calculate Inclusive GST
        const itemBasePrice = parseFloat((itemPrice / (1 + (gstRate / 100))).toFixed(2));
        const itemCustomerGst = parseFloat((itemPrice - itemBasePrice).toFixed(2));
        
        let customerIgst = 0, customerCgst = 0, customerSgst = 0;
        let customerGstType = 'NONE';
        
        if (gstRate > 0) {
            if (isSameState) {
                customerGstType = 'CGST_SGST';
                customerCgst = parseFloat((itemCustomerGst / 2).toFixed(2));
                customerSgst = parseFloat((itemCustomerGst / 2).toFixed(2));
            } else {
                customerGstType = 'IGST';
                customerIgst = itemCustomerGst;
            }
        }

        const itemVendorTax = parseFloat(((itemVendorPrice * item.quantity) * 0.18).toFixed(2));
        const itemCommissionTax = parseFloat((itemCommissionAmount * 0.18).toFixed(2));

        const enriched = {
            productId: product._id,
            vendorId: product.vendorId._id,
            name: product.name,
            image: variantImage || product.image,
            price: itemPrice,
            originalPrice: product.originalPrice || itemPrice,
            quantity: item.quantity,
            vendorPrice: itemVendorPrice,
            commissionRate: itemCommissionRate,
            commissionAmount: itemCommissionAmount,
            marginAmount: itemMarginAmount,
            vendorTax: itemVendorTax,
            commissionTax: itemCommissionTax,
            variant: item.variant,
            variantKey: stockKeyInMap || variantKey || undefined,
            hasSpecificVariantStock: hasSpecificVariantStock,
            basePrice: itemBasePrice,
            gstRate: gstRate,
            customerGstType: customerGstType,
            customerIgst: customerIgst * item.quantity,
            customerCgst: customerCgst * item.quantity,
            customerSgst: customerSgst * item.quantity,
        };
        enrichedItems.push(enriched);

        // Group by vendor
        const vid = product.vendorId._id.toString();
        if (!vendorMap[vid]) {
            vendorMap[vid] = {
                vendorId: product.vendorId._id,
                vendorName: product.vendorId.storeName,
                commissionRate: product.vendorId.commissionRate || 10,
                shippingEnabled: product.vendorId.shippingEnabled !== false,
                defaultShippingRate: product.vendorId.defaultShippingRate,
                freeShippingThreshold: product.vendorId.freeShippingThreshold,
                items: [],
                subtotal: 0,
                basePrice: 0,
            };
        }
        vendorMap[vid].items.push(enriched);
        vendorMap[vid].subtotal += itemSubtotal;
        vendorMap[vid].basePrice += (itemVendorPrice * item.quantity);
        vendorMap[vid].totalCustomerIgst = (vendorMap[vid].totalCustomerIgst || 0) + (customerIgst * item.quantity);
        vendorMap[vid].totalCustomerCgst = (vendorMap[vid].totalCustomerCgst || 0) + (customerCgst * item.quantity);
        vendorMap[vid].totalCustomerSgst = (vendorMap[vid].totalCustomerSgst || 0) + (customerSgst * item.quantity);
        vendorMap[vid].shopLocation = product.vendorId.shopLocation;
    }
    console.log(`[OrderCalc] Subtotal: ₹${subtotal}, Vendors: ${Object.keys(vendorMap).length}`);

    // Multi-vendor orders now support both Check & Buy and Try & Buy.
    // Pickup routing is handled by autoAssignDeliveryBoy (nearest-to-farthest).


    // 2. Validate coupon
    let couponDiscount = 0;
    let appliedCoupon = null;
    if (couponCode) {
        const result = await validateCoupon(couponCode, subtotal, userId);
        appliedCoupon = result.coupon;
        couponDiscount = result.discount;
    }

    // 3. Resolve Dropoff Location & Calculate distance-based shipping
    let dropoffCoords = req.body.dropoffLocation?.coordinates;
    const isInvalidCoords = !dropoffCoords || (dropoffCoords[0] === 0 && dropoffCoords[1] === 0);

    if (isInvalidCoords) {
        console.log(`🔍 [Geocoding] Missing coordinates. Attempting geocode for address...`);
        const fullAddress = `${shippingAddress.address}, ${shippingAddress.city}, ${shippingAddress.state} ${shippingAddress.zipCode}, ${shippingAddress.country}`;
        const geocoded = await geocodeAddress(fullAddress);
        if (geocoded) {
            console.log(`✅ [Geocoding] Success:`, geocoded);
            dropoffCoords = geocoded;
        } else {
            console.warn(`❌ [Geocoding] No results. Falling back to [0, 0].`);
            dropoffCoords = [0, 0];
        }
    }

    // 3. Calculate Shipping using centralized service
    const { totalShipping, shippingByVendor, distanceByVendor } = await calculateVendorShippingForGroups({
        vendorGroups: Object.values(vendorMap).map(v => ({
            vendorId: v.vendorId,
            subtotal: v.subtotal,
            shippingEnabled: v.shippingEnabled,
            defaultShippingRate: v.defaultShippingRate,
            freeShippingThreshold: v.freeShippingThreshold,
            shopLocation: v.shopLocation
        })),
        shippingAddress: {
            ...shippingAddress,
            coordinates: dropoffCoords
        },
        shippingOption: 'online',
        couponType: appliedCoupon?.type
    });

    // --- Delivery Boy Earning Calculation ---
    // 1. Calculate nearest vendor distance using Google Maps for the base fee
    const vendorCoordsList = Object.values(vendorMap).map(v => v.shopLocation?.coordinates).filter(c => c && c.length === 2);
    let nearestDistanceToCustomer = 0;
    
    if (vendorCoordsList.length > 0) {
        const distances = [];
        for (const vCoord of vendorCoordsList) {
            try {
                const res = await getDistanceMatrix(vCoord, dropoffCoords);
                if (res && res.distance !== undefined) {
                    distances.push(res.distance);
                } else {
                    distances.push(calculateDistance(vCoord, dropoffCoords));
                }
            } catch(e) {
                distances.push(calculateDistance(vCoord, dropoffCoords));
            }
        }
        nearestDistanceToCustomer = Math.min(...distances);
    }
    
    // 2. Calculate Multi-Vendor Extra Routing Fee
    let vendorRoutingDistance = 0;
    if (vendorCoordsList.length > 1) {
        vendorRoutingDistance = await getRouteDistance(vendorCoordsList, calculateDistance);
    }
    
    const calculatedDeliveryEarnings = getDeliveryEarning(nearestDistanceToCustomer) + getVendorPickupFee(vendorRoutingDistance);
    // ----------------------------------------

    // Fetch admin settings for platform fee and shipping overrides
    const [orderSettingsDoc, shippingSettingsDoc] = await Promise.all([
        Settings.findOne({ key: 'orders' }),
        Settings.findOne({ key: 'shipping' }),
    ]);
    const dynamicPlatformFee = orderSettingsDoc?.value?.platformFee !== undefined ? Number(orderSettingsDoc.value.platformFee) : 20;
    const globalFreeShippingThreshold = shippingSettingsDoc?.value?.freeShippingThreshold !== undefined ? Number(shippingSettingsDoc.value.freeShippingThreshold) : 0;
    const globalDefaultShippingRate = shippingSettingsDoc?.value?.defaultShippingRate !== undefined ? Number(shippingSettingsDoc.value.defaultShippingRate) : 0;

    // Apply admin global shipping override: if subtotal exceeds global free shipping threshold, shipping is free
    let shipping = totalShipping;
    if (globalFreeShippingThreshold > 0 && subtotal >= globalFreeShippingThreshold) {
        shipping = 0;
    } else if (totalShipping === 0 && globalDefaultShippingRate > 0) {
        shipping = globalDefaultShippingRate;
    }
    // 4. Calculate final totals — server is ALWAYS the source of truth.
    // SECURITY: req.body.shipping, req.body.tax, req.body.platformFee, req.body.total are NEVER trusted.
    // tax is derived from per-item GST already calculated in the enrichedItems loop above.
    const tax = parseFloat(
        enrichedItems.reduce((sum, item) =>
            sum + (Number(item.customerIgst) || 0) + (Number(item.customerCgst) || 0) + (Number(item.customerSgst) || 0),
        0).toFixed(2)
    );
    const platformFee = Number(dynamicPlatformFee || 0);
    // Tax is inclusive in subtotal, so we don't add it to the final total
    const total = parseFloat((subtotal - couponDiscount + shipping + platformFee).toFixed(2));

    console.log(`💰 [TOTALS] Subtotal: ₹${subtotal}, Shipping: ₹${shipping}, Discount: ₹${couponDiscount}, Tax: ₹${tax}, Platform Fee: ₹${platformFee}, Grand Total: ₹${total}`);


    // 5. Build vendor item groups
    const vendorItems = Object.values(vendorMap).map((v) => {
        const vendorCommissionAmount = v.items.reduce((sum, item) => sum + (item.commissionAmount || 0), 0);
        const vendorMarginAmount = v.items.reduce((sum, item) => sum + (item.marginAmount || 0), 0);
        const vendorTaxAmount = v.items.reduce((sum, item) => sum + (item.vendorTax || 0), 0);
        const vendorCommissionTaxAmount = v.items.reduce((sum, item) => sum + (item.commissionTax || 0), 0);

        return {
            vendorId: v.vendorId,
            vendorName: v.vendorName,
            items: v.items,
            subtotal: v.subtotal,
            basePrice: v.basePrice,
            shipping: Number(shippingByVendor[String(v.vendorId)] || 0),
            distance: v.distance || 0,
            tax: parseFloat((v.totalCustomerIgst + v.totalCustomerCgst + v.totalCustomerSgst).toFixed(2)),
            totalCustomerIgst: parseFloat(v.totalCustomerIgst.toFixed(2)),
            totalCustomerCgst: parseFloat(v.totalCustomerCgst.toFixed(2)),
            totalCustomerSgst: parseFloat(v.totalCustomerSgst.toFixed(2)),
            vendorTax: vendorTaxAmount,
            commissionTax: vendorCommissionTaxAmount,
            discount: 0,
            commissionRate: v.commissionRate,
            commissionAmount: vendorCommissionAmount,
            vendorEarnings: parseFloat((v.subtotal - vendorCommissionAmount - vendorMarginAmount).toFixed(2)),
            status: 'pending',
        };
    });

    // 6-9. Transactional order creation to avoid partial writes.
    let order = null;
    let idempotentReplay = false;
    const session = await mongoose.startSession();
    try {
        await session.withTransaction(async () => {
            if (idempotencyKey) {
                const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
                const existingOrder = await Order.findOne({
                    idempotencyScope,
                    idempotencyKey,
                    createdAt: { $gte: fifteenMinutesAgo }
                })
                    .select('orderId total trackingNumber')
                    .session(session);
                if (existingOrder) {
                    order = existingOrder;
                    idempotentReplay = true;
                    return;
                }
            }

            const [createdOrder] = await Order.create([{
                orderId: generateOrderId(),
                userId,
                items: enrichedItems,
                vendorItems,
                shippingAddress,
                paymentMethod: normalizedPaymentMethod,
                // Keep every new order pending until gateway/webhook confirmation is implemented.
                paymentStatus: 'pending',
                subtotal,
                shipping,
                // tax is set correctly below via vendorItems.reduce (line 616 overrides this key).
                // Kept for readability — JS last-key-wins means line 616 is the actual DB value.
                discount: couponDiscount,
                totalCustomerIgst: vendorItems.reduce((sum, v) => sum + (v.totalCustomerIgst || 0), 0),
                totalCustomerCgst: vendorItems.reduce((sum, v) => sum + (v.totalCustomerCgst || 0), 0),
                totalCustomerSgst: vendorItems.reduce((sum, v) => sum + (v.totalCustomerSgst || 0), 0),
                tax: vendorItems.reduce((sum, v) => sum + (v.tax || 0), 0),
                platformFee,
                total,
                couponCode: couponCode?.toUpperCase(),
                couponDiscount,
                isMultiVendor: vendorItems.length > 1,
                orderType,
                pickupLocation: Object.values(vendorMap)[0]?.shopLocation || { type: 'Point', coordinates: [0, 0] },
                dropoffLocation: { type: 'Point', coordinates: dropoffCoords },
                deliveryDistance: nearestDistanceToCustomer,
                deliveryEarnings: calculatedDeliveryEarnings,
                trackingNumber: generateTrackingNumber(),
                estimatedDelivery: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000), // +5 days
                idempotencyKey: idempotencyKey || undefined,
                idempotencyScope: idempotencyKey ? idempotencyScope : undefined,
                deviceToken: deviceToken || undefined,
            }], { session });

            order = createdOrder;
            console.log("STEP 4 - Saved order.customerLocation:", order.dropoffLocation);

            // Step 4.5: Decrement stock and update stock status
            for (const item of enrichedItems) {
                const quantity = Number(item.quantity || 0);
                const variantKey = item.variantKey;

                const incUpdate = { stockQuantity: -quantity };
                const queryFilter = { _id: item.productId, stockQuantity: { $gte: quantity } };

                if (variantKey && item.hasSpecificVariantStock) {
                    // Note: This works for Map-based stockMap as well in modern Mongoose/MongoDB
                    incUpdate[`variants.stockMap.${variantKey}`] = -quantity;
                    queryFilter[`variants.stockMap.${variantKey}`] = { $gte: quantity };
                }

                const updatedProduct = await Product.findOneAndUpdate(
                    queryFilter,
                    { $inc: incUpdate },
                    { new: true, session }
                );

                if (!updatedProduct) {
                    const currentProduct = await Product.findById(item.productId).session(session);
                    const availableTotal = currentProduct?.stockQuantity || 0;
                    const rawVarStock = variantKey ? (currentProduct?.variants?.stockMap?.get?.(variantKey) ?? currentProduct?.variants?.stockMap?.[variantKey]) : null;
                    const availableVariant = variantKey ? (rawVarStock ?? 0) : 'N/A';

                    throw new ApiError(400, `Stock changed for ${item.name}. Requested: ${quantity}, Available Total: ${availableTotal}, Available Variant [${variantKey || 'None'}]: ${availableVariant}. Please refresh and try again.`);
                }

                if (updatedProduct) {
                    const nextStockState =
                        updatedProduct.stockQuantity <= 0
                            ? 'out_of_stock'
                            : (updatedProduct.stockQuantity <= (updatedProduct.lowStockThreshold || 10) ? 'low_stock' : 'in_stock');

                    await Product.updateOne(
                        { _id: updatedProduct._id },
                        { $set: { stock: nextStockState } },
                        { session }
                    );
                }
            }

            // If payment method is prepaid, create Razorpay order
            if (normalizedPaymentMethod === 'prepaid') {
                try {
                    const razorpay = getRazorpayInstance();
                    if (!razorpay) throw new ApiError(500, "Payment gateway not configured.");

                    const razorpayOrder = await razorpay.orders.create({
                        amount: Math.round(total * 100), // Razorpay expects amount in paise
                        currency: 'INR',
                        receipt: order.orderId,
                    });

                    order.razorpayOrderId = razorpayOrder.id;
                    await order.save({ session });
                } catch (razorError) {
                    console.error("❌ RAZORPAY_ORDER_CREATION_FAILED:", razorError);
                    throw new ApiError(500, "Failed to initialize online payment. Please try again.");
                }
            }
        });

        // 10. Unified Notification to all parties (CALLED OUTSIDE TRANSACTION)
        if (order && !idempotentReplay) {
            console.log("STEP 5 - Emitting Order:", order);
            
            // Only notify seller and assign delivery boy instantly if NOT prepaid
            // Prepaid orders will trigger this after successful payment verification
            if (order.paymentMethod !== 'prepaid') {
                OrderNotificationService.notifyOrderUpdate(order._id, 'pending', {
                    excludeRecipientId: userId,
                    title: 'New Order Received!',
                    message: `You have a new ${orderType?.replace(/_/g, ' ') || 'order'} of Rs.${order.total}.`
                }).catch(err => console.error('[OrderDebug] Notification failed:', err));

                autoAssignDeliveryBoy(order._id).catch(err => {
                    console.error("[AutoAssign Error in placeOrder]", err);
                });
                QueueService.scheduleAdminEscalation(order._id);
                QueueService.scheduleUserNoPartnerNotification(order._id);
            }
        }
    } catch (err) {
        if (idempotencyKey && err?.code === 11000) {
            const existingOrder = await Order.findOne({ idempotencyScope, idempotencyKey })
                .select('orderId total trackingNumber')
                .lean();
            if (existingOrder) {
                order = existingOrder;
                idempotentReplay = true;
            } else {
                throw err;
            }
        } else {
            throw err;
        }
    } finally {
        await session.endSession();
    }

    const responseStatus = idempotentReplay ? 200 : 201;
    const responseMessage = idempotentReplay
        ? 'Duplicate order request ignored. Returning existing order.'
        : 'Order placed successfully.';
    console.log("📤 Sending Order Response Data:", {
        orderId: order.orderId,
        razorpayOrderId: order.razorpayOrderId,
        razorpayKeyId: process.env.RAZORPAY_KEY_ID
    });
    res.status(responseStatus).json(
        new ApiResponse(
            responseStatus,
            {
                orderId: order.orderId,
                total: order.total,
                trackingNumber: order.trackingNumber,
                razorpayOrderId: order.razorpayOrderId,
                razorpayKeyId: process.env.RAZORPAY_KEY_ID,
                ...(idempotentReplay ? { idempotentReplay: true } : {}),
            },
            responseMessage
        )
    );
});

// POST /api/user/orders/verify-payment
export const verifyPayment = asyncHandler(async (req, res) => {
    const { orderId, razorpayPaymentId, razorpayOrderId, razorpaySignature } = req.body;

    if (!razorpayPaymentId || !razorpayOrderId || !razorpaySignature) {
        throw new ApiError(400, "Missing payment verification details.");
    }

    const order = await Order.findOne({ orderId });
    if (!order) throw new ApiError(404, "Order not found.");

    // Verify signature
    const hmac = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET);
    hmac.update(razorpayOrderId + "|" + razorpayPaymentId);
    const generatedSignature = hmac.digest('hex');

    if (generatedSignature !== razorpaySignature) {
        order.paymentStatus = 'failed';
        await order.save();
        throw new ApiError(400, "Invalid payment signature. Payment verification failed.");
    }

    // Update order status
    order.paymentStatus = 'paid';
    order.razorpayPaymentId = razorpayPaymentId;
    order.razorpaySignature = razorpaySignature;

    // Auto-confirm order if it was pending
    if (order.status === 'pending') {
        order.status = 'pending'; // Keep as pending, but mark as paid
    }

    await order.save();

    // Trigger notification and auto assignment for prepaid order after payment succeeds
    OrderNotificationService.notifyOrderUpdate(order._id, 'pending', {
        excludeRecipientId: req.user?._id || req.user?.id,
        title: 'New Order Received!',
        message: `You have a new ${order.orderType?.replace(/_/g, ' ') || 'order'} of Rs.${order.total}.`
    }).catch(err => console.error('[OrderDebug] Notification failed in verifyPayment:', err));

    autoAssignDeliveryBoy(order._id).catch(err => {
        console.error("[AutoAssign Error in verifyPayment]", err);
    });
    QueueService.scheduleAdminEscalation(order._id);
    QueueService.scheduleUserNoPartnerNotification(order._id);

    res.status(200).json(new ApiResponse(200, { orderId: order.orderId }, "Payment verified successfully."));
});

// GET /api/user/orders
export const getUserOrders = asyncHandler(async (req, res) => {
    const { page = 1, limit = 10 } = req.query;
    const skip = (page - 1) * limit;
    console.log(`[OrderDebug] Fetching all orders for user: ${req.user.id}`);
    const orders = await Order.find({ userId: req.user.id }).populate('deliveryBoyId', 'currentLocation name phone').sort({ createdAt: -1 }).skip(skip).limit(Number(limit));
    const total = await Order.countDocuments({ userId: req.user.id });
    console.log(`[OrderDebug] Found ${orders.length}/${total} orders in DB for user ${req.user.id}.`);
    res.status(200).json(new ApiResponse(200, { orders, total, page: Number(page), pages: Math.ceil(total / limit) }, 'Orders fetched.'));
});

// GET /api/user/orders/:id
export const getOrderDetail = asyncHandler(async (req, res) => {
    const { id } = req.params;
    console.log(`[OrderDebug] Fetching order detail: ${id} for user: ${req.user.id}`);

    let filter = {};
    if (mongoose.Types.ObjectId.isValid(id)) {
        filter._id = id;
    } else {
        filter.orderId = id;
    }

    const order = await Order.findOne({ ...filter, userId: req.user.id })
        .populate('deliveryBoyId', 'currentLocation name phone')
        .populate('items.productId', 'hsnCode')
        .select('+deliveryOtpDebug');

    if (!order) {
        console.warn(`[OrderDebug] Order not found for user: ${req.user.id} with identifier: ${id}. Checking if it exists at all...`);
        const anyOrder = await Order.findOne(filter);
        if (anyOrder) {
            console.warn(`[OrderDebug] Order exists but belongs to a different userId: ${anyOrder.userId || 'GUEST'}`);
        } else {
            console.error(`[OrderDebug] Order NO-EXIST at all in DB for identifier: ${id}`);
        }
        throw new ApiError(404, 'Order not found.');
    }

    const returnRequest = await ReturnRequest.findOne({ orderId: order._id }).sort({ createdAt: -1 });
    const orderObj = order.toObject();
    orderObj.returnRequest = returnRequest;

    res.status(200).json(new ApiResponse(200, orderObj, 'Order detail fetched.'));
});

// PATCH /api/user/orders/:id/cancel
export const cancelOrderInternal = async (orderId, userId, reason) => {
    const session = await mongoose.startSession();
    let cancelledOrder;
    try {
        await session.withTransaction(async () => {
            const order = await Order.findOne({ orderId: orderId, userId: userId }).session(session);
            if (!order) throw new Error('Order not found.');
            if (!['pending', 'accepted', 'processing', 'ready_for_pickup', 'all_vendors_ready', 'ready_for_delivery', 'searching'].includes(order.status)) throw new Error('Order cannot be cancelled at this stage.');

            order.status = 'cancelled';
            order.cancelledAt = new Date();
            order.cancellationReason = reason || 'Cancelled by customer';
            if (Array.isArray(order.vendorItems)) {
                order.vendorItems.forEach((vendorGroup) => {
                    if (vendorGroup.status !== 'delivered') {
                        vendorGroup.status = 'cancelled';
                    }
                });
            }
            await order.save({ session });

            // Restore stock and status
            for (const item of order.items) {
                const quantity = Number(item.quantity || 0);
                if (quantity <= 0) continue;

                const productSnapshot = await Product.findById(item.productId)
                    .select('variants.stockMap variants.prices')
                    .session(session)
                    .lean();
                const variantKey = resolveOrderItemVariantKey(productSnapshot, item);

                const incUpdate = { stockQuantity: quantity };
                if (variantKey && item.hasSpecificVariantStock) {
                    incUpdate[`variants.stockMap.${variantKey}`] = quantity;
                }

                const product = await Product.findByIdAndUpdate(item.productId, { $inc: incUpdate }, { new: true, session });
                if (!product) continue;

                const nextStockState =
                    product.stockQuantity <= 0
                        ? 'out_of_stock'
                        : (product.stockQuantity <= product.lowStockThreshold ? 'low_stock' : 'in_stock');

                await Product.updateOne(
                    { _id: product._id },
                    { $set: { stock: nextStockState } },
                    { session }
                );
            }

            // Reverse vendor earnings visibility for this order.
            await Commission.updateMany(
                {
                    orderId: order._id,
                    status: { $ne: 'cancelled' },
                },
                {
                    $set: {
                        status: 'cancelled',
                        paidAt: null,
                        settlementId: null,
                    },
                },
                { session }
            );

            // Free the delivery boy if assigned and credit them for the cancellation trip
            if (order.deliveryBoyId) {
                const DeliveryBoy = mongoose.model('DeliveryBoy');
                const riderEarnings = Number(order.deliveryEarnings || 0);
                
                if (riderEarnings > 0 && order.riderAcceptedAt) {
                    await DeliveryBoy.findByIdAndUpdate(order.deliveryBoyId, { 
                        status: 'available',
                        $inc: {
                            totalDeliveries: 1, // count as trip
                            totalEarnings: riderEarnings,
                            availableBalance: riderEarnings,
                        }
                    }, { session });
                } else {
                    await DeliveryBoy.findByIdAndUpdate(order.deliveryBoyId, { status: 'available' }, { session });
                }

                // Cancel any associated DeliveryBatch
                const DeliveryBatch = mongoose.model('DeliveryBatch');
                await DeliveryBatch.updateMany(
                    { customerId: order.userId, deliveryBoyId: order.deliveryBoyId, status: { $in: ['assigned', 'picked_up', 'arrived', 'try_and_buy', 'payment_pending'] } },
                    { $set: { status: 'cancelled' } },
                    { session }
                );

                // Tell the rider explicitly that this request/order was removed
                const { emitEvent } = await import('../../../services/socket.service.js');
                emitEvent(`delivery_${order.deliveryBoyId}`, 'order_cancelled', {
                    orderId: order.orderId,
                    id: order._id,
                    message: 'Order was cancelled.'
                });
            }

            // Process full refund if prepaid
            if (order.paymentMethod !== 'cod' && order.paymentMethod !== 'cash' && order.razorpayPaymentId && order.paymentStatus !== 'refunded') {
                let refundSuccess = false;
                let refundObj = null;
                try {
                    refundObj = await refundPayment({
                        paymentId: order.razorpayPaymentId,
                        amount: order.total || 0,
                        notes: { orderId: String(order._id) }
                    });
                    refundSuccess = true;
                } catch (refundError) {
                    console.error('User Cancellation Refund Error:', refundError?.error || refundError?.message || refundError);
                    order.refundStatus = 'failed';
                }

                if (refundSuccess && refundObj) {
                    order.refundStatus = refundObj.status === 'processed' ? 'processed' : 'pending';
                    order.refundId = refundObj.id;
                    order.refundAmount = order.total;
                    order.paymentStatus = 'refunded';
                }
                await order.save({ session });
            }
            
            cancelledOrder = order;
        });

        // Unified Notification to all parties
        if (cancelledOrder) {
            await OrderNotificationService.notifyOrderUpdate(cancelledOrder._id, 'cancelled', {
                reason: reason || 'Cancelled by customer',
                isSystemCancel: false
            });
        }
        return cancelledOrder;
    } finally {
        await session.endSession();
    }
};

export const cancelOrder = asyncHandler(async (req, res) => {
    try {
        const cancelledOrder = await cancelOrderInternal(req.params.id, req.user.id, req.body.reason);
        res.status(200).json(new ApiResponse(200, cancelledOrder, 'Order cancelled successfully.'));
    } catch (error) {
        if (error.message === 'Order not found.') throw new ApiError(404, error.message);
        if (error.message === 'Order cannot be cancelled at this stage.') throw new ApiError(400, error.message);
        throw error;
    }
});

const normalizeReturnRequest = (requestDoc) => {
    const request = typeof requestDoc?.toObject === 'function' ? requestDoc.toObject() : requestDoc;
    const orderOrderId = request?.orderId?.orderId || '';
    const orderRefId = request?.orderId?._id || request?.orderId || null;
    return {
        ...request,
        id: request.returnId || String(request?._id || ''),
        orderId: orderOrderId || String(orderRefId || ''),
        orderRefId: orderRefId ? String(orderRefId) : null,
        requestDate: request?.createdAt,
    };
};

// POST /api/user/orders/:id/returns
export const createReturnRequest = asyncHandler(async (req, res) => {
    const { id } = req.params;
    console.log('--- CREATE RETURN REQUEST ---', { orderId: id, body: req.body });

    const order = await Order.findOne({
        $or: [{ _id: mongoose.isValidObjectId(id) ? id : null }, { orderId: id }],
        userId: req.user.id,
    });

    if (!order) {
        console.log('Order not found or access denied', { id, userId: req.user.id });
        throw new ApiError(404, 'Order not found.');
    }

    const orderStatusNormalized = String(order.status || '').toLowerCase();
    if (orderStatusNormalized !== 'delivered') {
        throw new ApiError(400, 'Return can only be requested for delivered orders.');
    }

    // New Requirement: Only allow returns for check_and_buy order type
    if (order.orderType !== 'check_and_buy') {
        throw new ApiError(400, 'Returns are only permitted for "Check & Buy" orders. "Try & Buy" orders are non-returnable after delivery.');
    }

    // Multi-vendor Check & Buy returns are now supported.
    // Returns are scoped per-vendor and follow the same flow as single-vendor.

    // Check 24-hour validity
    if (order.deliveredAt) {
        const deliveredDate = new Date(order.deliveredAt);
        const now = new Date();
        const diffInHours = (now - deliveredDate) / (1000 * 60 * 60);

        if (diffInHours > 24) {
            throw new ApiError(400, 'Return validity has expired. Returns must be requested within 24 hours of delivery.');
        }
    } else {
        // Fallback if deliveredAt is missing (unlikely but safe)
        const updatedDate = new Date(order.updatedAt);
        const now = new Date();
        const diffInHours = (now - updatedDate) / (1000 * 60 * 60);
        if (diffInHours > 24) {
            throw new ApiError(400, 'Return validity has expired. Returns must be requested within 24 hours of delivery.');
        }
    }

    const orderItems = Array.isArray(order.items) ? order.items : [];
    const requestedItems = Array.isArray(req.body.items) ? req.body.items : [];

    if (requestedItems.length === 0) {
        throw new ApiError(400, 'No items provided for return request.');
    }

    const normalizedItems = [];
    const vendorDropoffsMap = {};
    let totalRefundAmount = 0;
    const vendorIdsInvolved = new Set();

    for (const inputItem of requestedItems) {
        const productId = String(inputItem?.productId || '');
        const orderItem = orderItems.find((it) => String(it?.productId || '') === productId);
        if (!orderItem) {
            throw new ApiError(400, `Product ${productId} is not valid for this return request.`);
        }

        const requestedQty = Number(inputItem?.quantity || 0);
        const maxQty = Number(orderItem?.quantity || 0);
        if (!Number.isFinite(requestedQty) || requestedQty <= 0 || requestedQty > maxQty) {
            throw new ApiError(400, `Invalid quantity for product ${orderItem.name || productId}.`);
        }

        const itemObj = {
            productId: orderItem.productId,
            name: orderItem.name,
            image: orderItem.image || '',
            price: orderItem.price || 0,
            quantity: requestedQty,
            reason: String(inputItem?.reason || req.body.reason || '').trim(),
        };
        normalizedItems.push(itemObj);

        const vendorIdStr = String(orderItem.vendorId || '');
        vendorIdsInvolved.add(vendorIdStr);
        if (!vendorDropoffsMap[vendorIdStr]) {
            vendorDropoffsMap[vendorIdStr] = {
                vendorId: orderItem.vendorId,
                items: [],
            };
        }
        vendorDropoffsMap[vendorIdStr].items.push(itemObj);
        totalRefundAmount += (Number(orderItem.price || 0) * requestedQty);
    }

    for (const vId of vendorIdsInvolved) {
        const existingOpen = await ReturnRequest.findOne({
            orderId: order._id,
            userId: req.user.id,
            $or: [ { vendorId: vId }, { 'vendorDropoffs.vendorId': vId } ],
            status: { $in: ['pending', 'approved', 'processing'] },
        });
        if (existingOpen) {
            throw new ApiError(409, 'An active return request already exists for one or more selected items.');
        }
    }

    const isMultiVendor = vendorIdsInvolved.size > 1;

    const request = await ReturnRequest.create({
        orderId: order._id,
        returnId: generateReturnId(),
        userId: req.user.id,
        vendorId: vendorIdsInvolved.size === 1 ? Array.from(vendorIdsInvolved)[0] : null,
        isMultiVendor,
        vendorDropoffs: isMultiVendor ? Object.values(vendorDropoffsMap) : [],
        items: normalizedItems,
        reason: String(req.body.reason || '').trim(),
        status: 'pending',
        refundAmount: Number(totalRefundAmount.toFixed(2)),
        refundStatus: 'pending',
        images: Array.isArray(req.body.images) ? req.body.images : [],
    });

    // Update order status to reflect the return request
    order.status = 'return requested';
    await order.save();

    // 10. Unified Notifications for Return Request
    const adminNotificationTask = Admin.find({ isActive: true }).then(admins =>
        Promise.all(admins.map(admin =>
            createNotification({
                recipientId: admin._id,
                recipientType: 'admin',
                title: 'New Return Request',
                message: `Order #${order.orderId} has a new return request.`,
                type: 'order',
                data: { returnRequestId: String(request._id), orderId: String(order.orderId) }
            })
        ))
    );

    const vendorNotificationTasks = Array.from(vendorIdsInvolved).map(vid =>
        createNotification({
            recipientId: vid,
            recipientType: 'vendor',
            title: 'New Return Request Received',
            message: `Customer requested a return for Order #${order.orderId}.`,
            type: 'order',
            data: { returnRequestId: String(request._id), orderId: String(order.orderId) }
        })
    );

    await Promise.all([adminNotificationTask, ...vendorNotificationTasks]);

    const populated = await ReturnRequest.findById(request._id)
        .populate('orderId', 'orderId total createdAt')
        .populate('vendorId', 'storeName email');

    res.status(201).json(new ApiResponse(201, normalizeReturnRequest(populated), 'Return request submitted successfully.'));
});

// GET /api/user/returns
export const getUserReturnRequests = asyncHandler(async (req, res) => {
    const { page = 1, limit = 20, status } = req.query;
    const numericPage = Math.max(1, Number(page) || 1);
    const numericLimit = Math.max(1, Number(limit) || 20);
    const filter = { userId: req.user.id };
    if (status && status !== 'all') filter.status = status;

    const [requests, total] = await Promise.all([
        ReturnRequest.find(filter)
            .populate('orderId', 'orderId total createdAt')
            .populate('vendorId', 'storeName email')
            .sort({ createdAt: -1 })
            .skip((numericPage - 1) * numericLimit)
            .limit(numericLimit),
        ReturnRequest.countDocuments(filter),
    ]);

    res.status(200).json(new ApiResponse(200, {
        returnRequests: requests.map(normalizeReturnRequest),
        pagination: {
            total,
            page: numericPage,
            limit: numericLimit,
            pages: Math.ceil(total / numericLimit),
        },
    }, 'Return requests fetched.'));
});

// GET /api/user/returns/:id
export const getUserReturnRequestById = asyncHandler(async (req, res) => {
    const request = await ReturnRequest.findOne({ _id: req.params.id, userId: req.user.id })
        .populate('orderId', 'orderId total createdAt')
        .populate('vendorId', 'storeName email');
    if (!request) throw new ApiError(404, 'Return request not found.');
    res.status(200).json(new ApiResponse(200, normalizeReturnRequest(request), 'Return request fetched.'));
});

// POST /api/user/orders/:id/resend-delivery-otp
// Customer requests a new delivery OTP (e.g. the previous one expired or SMS didn't arrive)
export const resendDeliveryOtp = asyncHandler(async (req, res) => {
    const { id } = req.params;

    let filter = { userId: req.user.id };
    if (mongoose.Types.ObjectId.isValid(id)) {
        filter._id = id;
    } else {
        filter.orderId = id;
    }

    const order = await Order.findOne(filter).select('+deliveryOtpHash +deliveryOtpExpiry +deliveryOtpSentAt +deliveryOtpAttempts +deliveryOtpDebug');
    if (!order) throw new ApiError(404, 'Order not found.');

    const allowedStatuses = ['picked_up', 'out_for_delivery'];
    if (!allowedStatuses.includes(order.status)) {
        throw new ApiError(409, 'Delivery OTP can only be resent when your order is out for delivery.');
    }

    // Cooldown: 60 seconds between resends
    const RESEND_COOLDOWN_MS = 60 * 1000;
    if (order.deliveryOtpSentAt && new Date(order.deliveryOtpSentAt).getTime() + RESEND_COOLDOWN_MS > Date.now()) {
        const waitSec = Math.ceil((new Date(order.deliveryOtpSentAt).getTime() + RESEND_COOLDOWN_MS - Date.now()) / 1000);
        throw new ApiError(429, `Please wait ${waitSec}s before requesting another OTP.`);
    }

    // Generate new OTP
    const crypto = await import('crypto');
    const secret = process.env.JWT_SECRET || 'delivery-otp-secret';
    const otp = String(Math.floor(100000 + Math.random() * 900000));
    const hash = crypto.default.createHash('sha256').update(`${otp}:${secret}`).digest('hex');

    order.deliveryOtpHash = hash;
    order.deliveryOtpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 min
    order.deliveryOtpSentAt = new Date();
    order.deliveryOtpAttempts = 0;

    const IS_PROD = String(process.env.NODE_ENV || '').toLowerCase() === 'production';
    if (!IS_PROD) {
        order.deliveryOtpDebug = otp;
    }

    await order.save();

    // Send OTP via email to the customer
    const { sendEmail } = await import('../../../services/email.service.js');
    const { sendDeliveryOtpSms } = await import('../../../services/sms.service.js');
    const { createNotification } = await import('../../../services/notification.service.js');

    const email = String(order?.shippingAddress?.email || '').trim().toLowerCase();
    const phone = String(order?.shippingAddress?.phone || '').replace(/\D/g, '').slice(-10);

    if (email) {
        await sendEmail({
            to: email,
            subject: `New Delivery OTP for order ${order.orderId || order._id}`,
            text: `Your new delivery verification OTP is ${otp}. Share it with the delivery partner only after receiving your order. It expires in 10 minutes.`,
            html: `<p>Your new delivery verification OTP is <strong>${otp}</strong>.</p><p>Share it with the delivery partner only after receiving your order.</p><p>This OTP expires in 10 minutes.</p>`,
        }).catch(err => console.warn('[User Resend OTP] Email failed:', err.message));
    }

    if (phone) {
        await sendDeliveryOtpSms(phone, otp).catch(e => console.warn('[User Resend OTP] SMS failed:', e.message));
    }

    // Push Notification
    createNotification({
        recipientId: order.userId,
        recipientType: 'user',
        title: 'New Delivery OTP',
        message: `Your new delivery OTP is ${otp}. Share it only with the delivery partner arrival.`,
        type: 'order',
        data: { orderId: order.orderId, otp: otp }
    }).catch(err => console.error('[User Resend OTP] Push Error:', err));

    // Emit socket event so the user-side UI updates with the new OTP immediately
    const { emitEvent: emit } = await import('../../../services/socket.service.js');
    emit(`user_${req.user.id}`, 'delivery_otp_resent', {
        orderId: order.orderId || order._id,
        deliveryOtpDebug: IS_PROD ? undefined : otp,
    });

    res.status(200).json(new ApiResponse(200, {
        deliveryOtpDebug: IS_PROD ? undefined : otp,
    }, 'New delivery OTP sent successfully.'));
});

/**
 * @desc    Submit UPI ID for return refund
 * @route   POST /api/user/returns/:id/upi
 * @access  Private (Customer)
 */
export const submitReturnUPI = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { upiId } = req.body;

    if (!upiId) {
        throw new ApiError(400, 'UPI ID is required');
    }

    const returnReq = await ReturnRequest.findOne({ _id: id, userId: req.user.id });
    if (!returnReq) {
        throw new ApiError(404, 'Return request not found');
    }

    returnReq.upiId = upiId;
    await returnReq.save();

    emitEvent(`return_${returnReq._id}`, 'return_status_updated', returnReq);

    res.status(200).json(new ApiResponse(200, returnReq, 'UPI ID submitted successfully'));
});

/**
 * @desc    Create Advanced Try & Buy / Check & Buy Return Request
 * @route   POST /api/user/orders/:id/try-buy-returns
 * @access  Private (Customer)
 */
export const createTryBuyReturnRequest = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { items, reason, images } = req.body;

    const order = await Order.findOne({
        $or: [{ _id: mongoose.isValidObjectId(id) ? id : null }, { orderId: id }],
        userId: req.user.id,
    });

    if (!order) {
        throw new ApiError(404, 'Order not found.');
    }

    if (!['try_and_buy', 'check_and_buy'].includes(order.orderType)) {
        throw new ApiError(400, 'This endpoint only supports Try & Buy or Check & Buy orders.');
    }

    const isMultiVendor = order.isMultiVendor || (order.vendorItems && order.vendorItems.length > 1);

    // Multi-vendor Check & Buy restriction
    if (order.orderType === 'check_and_buy' && isMultiVendor) {
        throw new ApiError(400, 'Return policy is currently not available for multi-vendor Check & Buy orders.');
    }

    // Try session active / valid status check
    const validStatuses = ['delivered', 'try_active'];
    if (!validStatuses.includes(String(order.status || '').toLowerCase())) {
        throw new ApiError(400, 'Returns can only be requested during an active try session or after delivery.');
    }

    // Group requested items by vendor
    const vendorDropoffsMap = {};
    const processedItems = [];
    let refundAmount = 0;

    for (const inputItem of items) {
        const productId = String(inputItem.productId);
        const requestedQty = Number(inputItem.quantity || 1);

        // Auto-resolve vendorId: search all vendorItems groups for this product
        let foundVendorGroup = null;
        let foundOrderItem = null;

        if (inputItem.vendorId) {
            // Client provided vendorId — use it directly
            const vid = String(inputItem.vendorId);
            foundVendorGroup = order.vendorItems?.find((v) => String(v.vendorId) === vid);
            if (foundVendorGroup) {
                foundOrderItem = foundVendorGroup.items?.find((it) => String(it.productId) === productId);
            }
        } else {
            // Auto-resolve: find which vendor group contains this productId
            for (const vGroup of (order.vendorItems || [])) {
                const match = vGroup.items?.find((it) => String(it.productId) === productId);
                if (match) {
                    foundVendorGroup = vGroup;
                    foundOrderItem = match;
                    break;
                }
            }
        }

        // Fallback: search flat order.items (each item has vendorId in schema)
        if (!foundOrderItem && order.items?.length > 0) {
            foundOrderItem = order.items.find(
                (it) => String(it.productId) === productId || String(it._id) === productId
            );
            if (foundOrderItem && !foundVendorGroup) {
                // Synthesize a vendorGroup from the item's vendorId
                const itemVendorId = foundOrderItem.vendorId;
                foundVendorGroup = {
                    vendorId: itemVendorId,
                    vendorName: foundOrderItem.vendorName || 'Vendor',
                    items: order.items.filter(it => String(it.vendorId) === String(itemVendorId)),
                };
            }
        }

        // Final fallback: single-vendor order without vendorItems
        if (!foundOrderItem && (!order.vendorItems || order.vendorItems.length === 0)) {
            foundOrderItem = order.items?.find((it) => String(it.productId) === productId || String(it.id) === productId);
            if (foundOrderItem && !foundVendorGroup) {
                foundVendorGroup = {
                    vendorId: order.vendorId || order.vendorItems?.[0]?.vendorId,
                    vendorName: order.vendorName || order.vendorItems?.[0]?.vendorName || 'Vendor',
                    items: order.items || [],
                };
            }
        }

        if (!foundOrderItem) {
            throw new ApiError(400, `Product ${productId} not found in this order.`);
        }

        const vendorId = String(foundVendorGroup?.vendorId || 'unknown');

        if (requestedQty <= 0 || requestedQty > (foundOrderItem.quantity || 1)) {
            throw new ApiError(400, `Invalid return quantity for product ${foundOrderItem.name || productId}.`);
        }

        const itemTotal = (foundOrderItem.price || foundOrderItem.discountedPrice || 0) * requestedQty;
        refundAmount += itemTotal;

        const returnItemData = {
            productId: foundOrderItem.productId || productId,
            name: foundOrderItem.name || inputItem.name || 'Product',
            image: foundOrderItem.image || '',
            price: foundOrderItem.price || foundOrderItem.discountedPrice || 0,
            quantity: requestedQty,
            reason: inputItem.reason || reason,
            variant: foundOrderItem.variant,
            selectedSize: foundOrderItem.selectedSize,
        };

        processedItems.push(returnItemData);

        if (!vendorDropoffsMap[vendorId]) {
            vendorDropoffsMap[vendorId] = {
                vendorId: foundVendorGroup?.vendorId,
                vendorName: foundVendorGroup?.vendorName || 'Vendor',
                shopLocation: undefined,
                shopAddress: '',
                items: [],
                status: 'pending'
            };

            // Attempt to get location from original pickups
            const origPickup = order.vendorPickups?.find(vp => String(vp.vendorId) === vendorId);
            if (origPickup) {
                vendorDropoffsMap[vendorId].shopLocation = origPickup.shopLocation;
                vendorDropoffsMap[vendorId].shopAddress = origPickup.shopAddress;
                vendorDropoffsMap[vendorId].vendorPhone = origPickup.vendorPhone;
            } else {
                // Fallback to fetching vendor model
                const vendorData = await Vendor.findById(foundVendorGroup?.vendorId);
                if (vendorData) {
                    vendorDropoffsMap[vendorId].shopLocation = vendorData.shopLocation;
                    vendorDropoffsMap[vendorId].shopAddress = vendorData.shopAddress;
                    vendorDropoffsMap[vendorId].vendorPhone = vendorData.phone;
                }
            }
        }

        vendorDropoffsMap[vendorId].items.push(returnItemData);
    }

    const vendorDropoffs = Object.values(vendorDropoffsMap);

    // Generate Customer Pickup OTP for Try & Buy / Check & Buy returns
    const otp = DeliveryOtpService.generateOtp();
    const pickupOtpHash = DeliveryOtpService.hashOtp(otp);
    const pickupOtpExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const pickupOtpDebug = otp;

    const returnRequest = await ReturnRequest.create({
        orderId: order._id,
        returnId: generateReturnId(),
        userId: req.user.id,
        isMultiVendor: isMultiVendor,
        vendorId: isMultiVendor ? null : vendorDropoffs[0]?.vendorId,
        vendorDropoffs,
        trySessionActive: order.status === 'try_active',
        items: processedItems,
        reason,
        images: images || [],
        status: 'pending',
        refundAmount,
        originalDeliveryBoyId: order.deliveryBoyId,
        deliveryBoyId: order.deliveryBoyId, // Auto-assign to same delivery boy
        pickupLocation: order.dropoffLocation, // Pick up from customer's dropoff location
        pickupOtpHash,
        pickupOtpExpiry,
        pickupOtpDebug,
    });

    res.status(201).json(new ApiResponse(201, returnRequest, 'Return request generated successfully.'));
});

