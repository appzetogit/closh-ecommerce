import mongoose from 'mongoose';
import DeliveryBoy from '../models/DeliveryBoy.model.js';
import { createNotification } from './notification.service.js';
import { emitEvent, isDeliveryBoyConnected } from './socket.service.js';
import { getDeliveryFeeConfig } from '../utils/deliveryFeeConfig.js';
import { calculateDistance, calculatePathDistance, getDeliveryEarning, getVendorPickupFee } from '../utils/geo.js';
import Order from '../models/Order.model.js';
import Settings from '../models/Settings.model.js';

/**
 * Find nearby delivery boys for an order (Dynamic Radius based on Admin Settings)
 */
export const findNearbyDeliveryBoys = async (order) => {
    let radiusMeters = 100000; // fallback default
    try {
        const settings = await Settings.findOne({ key: 'delivery_fees' }).lean();
        if (settings?.value?.maxAssignmentRadiusKm) {
            radiusMeters = settings.value.maxAssignmentRadiusKm * 1000;
        }
    } catch (err) {
        console.error('[Radius Search] Error fetching dynamic radius:', err);
    }

    const pickupLocation = order.pickupLocation;
    
    if (!pickupLocation || !pickupLocation.coordinates || (pickupLocation.coordinates[0] === 0 && pickupLocation.coordinates[1] === 0)) {
        console.warn(`[Radius Search] ⚠️ Invalid pickup coordinates:`, pickupLocation?.coordinates);
        return [];
    }

    // Total available in entire DB
    const totalAvailable = await DeliveryBoy.countDocuments({ status: 'available', isAvailable: true });
    console.log(`[Radius Search] Searching within ${radiusMeters}m of ${pickupLocation.coordinates.join(', ')}`);
    console.log(`[Radius Search] Total 'available' partners in system: ${totalAvailable}`);

    const nearbyBoys = await DeliveryBoy.aggregate([
        {
            $geoNear: {
                near: {
                    type: 'Point',
                    coordinates: pickupLocation.coordinates,
                },
                distanceField: 'distance',
                maxDistance: radiusMeters,
                query: { 
                    status: 'available', 
                    isAvailable: true
                },
                spherical: true,
            },
        },
        { $limit: 15 },
    ]);

    if (nearbyBoys.length > 0) {
        console.log(`\n✅ [RADIUS MATCH] Found ${nearbyBoys.length} nearby partners:`);
        nearbyBoys.forEach((boy, i) => {
            console.log(`   ${i+1}. ${boy.name.padEnd(20)} | ID: ${boy._id} | Dist: ${Math.round(boy.distance)}m`);
        });
    } else {
        console.log(`\n❌ [RADIUS MATCH] No available partners found within ${radiusMeters}m.`);
        if (totalAvailable > 0) {
             const closest = await DeliveryBoy.aggregate([
                { $geoNear: { near: { type: 'Point', coordinates: pickupLocation.coordinates }, distanceField: 'distance', query: { status: 'available', isAvailable: true }, spherical: true } },
                { $limit: 1 }
            ]);
            if (closest[0]) console.log(`[Radius Search] FYI: Closest available partner is ${Math.round(closest[0].distance/1000)}km away.`);
        }
    }

    // 2.1 Strictly filter to ensure they are connected to the socket
    const activeNearbyBoys = nearbyBoys.filter(boy => isDeliveryBoyConnected(boy._id.toString()));
    
    if (activeNearbyBoys.length < nearbyBoys.length) {
         console.log(`⚠️ [RADIUS MATCH] Filtered out ${nearbyBoys.length - activeNearbyBoys.length} offline partners who appeared available in DB.`);
    }

    return activeNearbyBoys;
};

/**
 * Global Assignment Logic: Triggers whenever an order is ready for pickup
 */
export const triggerDeliveryAssignment = async (order) => {
    try {
        console.log(`\n--- 🔍 [NEW ASSIGNMENT TRIGGER] ---`);
        console.log(`Order: ${order.orderId} | Type: ${order.orderType}`);
        
        // Populate vendor if needed
        if (order.populated && !order.populated('vendorItems.vendorId')) {
            await order.populate('vendorItems.vendorId', 'storeName shopAddress shopLocation address');
        }

        const nearbyBoys = await findNearbyDeliveryBoys(order);
        
        // Prepare Payload
        const firstVendor = order.vendorItems?.[0] || {};
        const vData = firstVendor.vendorId || {};
        const vendorName = vData.storeName || firstVendor.vendorName || 'Vendor';
        const vendorAddress = vData.shopAddress || (vData.address?.street ? `${vData.address.street}, ${vData.address.city}` : 'Vendor Address');

        // Calculate Earning & Distance for the socket popup (estimation only — final locked at completion)
        let estimatedDistance = order.deliveryDistance ? `${order.deliveryDistance} km` : '0 km';
        let estimatedTime = 'N/A';
        let deliveryFee = order.deliveryEarnings || 25;

        try {
            const feeConfig = await getDeliveryFeeConfig();
            const dropoffCoords = order.dropoffLocation?.coordinates;
            const pickupCoords = order.pickupLocation?.coordinates;

            if (dropoffCoords?.length === 2 && (dropoffCoords[0] !== 0 || dropoffCoords[1] !== 0)) {
                const { getDistanceMatrix, getRouteDistance } = await import('./googleMaps.service.js');
                
                let nearestDistanceToCustomer = 0;
                let vendorCoordsList = [];
                
                if (order.isMultiVendor && order.vendorPickups?.length > 0) {
                    const sortedPickups = [...order.vendorPickups].sort((a, b) => a.sequence - b.sequence);
                    vendorCoordsList = sortedPickups.map(p => p.shopLocation?.coordinates).filter(c => c && c.length === 2);
                } else if (pickupCoords?.length === 2) {
                    vendorCoordsList = [pickupCoords];
                }
                
                if (vendorCoordsList.length > 0) {
                    const lastVendorCoord = vendorCoordsList[vendorCoordsList.length - 1];
                    try {
                        const res = await getDistanceMatrix(lastVendorCoord, dropoffCoords);
                        if (res && res.distance !== undefined) {
                            nearestDistanceToCustomer = res.distance;
                        } else {
                            nearestDistanceToCustomer = calculateDistance(lastVendorCoord, dropoffCoords);
                        }
                    } catch (e) {
                        nearestDistanceToCustomer = calculateDistance(lastVendorCoord, dropoffCoords);
                    }

                    estimatedDistance = `${nearestDistanceToCustomer} km`;
                    estimatedTime = `${Math.round(nearestDistanceToCustomer * 3)} mins`;
                }
                
                let vendorRoutingDistance = 0;
                if (vendorCoordsList.length > 1) {
                    vendorRoutingDistance = await getRouteDistance(vendorCoordsList, calculateDistance);
                }
                
                if (nearestDistanceToCustomer > 0 || vendorRoutingDistance > 0) {
                    deliveryFee = getDeliveryEarning(nearestDistanceToCustomer, feeConfig) + getVendorPickupFee(vendorRoutingDistance, feeConfig);
                }
            }
        } catch (err) {
            console.error('❌ [AssignmentTriggerDistance Error]', err.message);
        }

        const socketPayload = {
            orderId: order.orderId,
            id: order._id,
            pickupLocation: order.pickupLocation,
            customer: order.shippingAddress?.name || 'Customer',
            address: order.shippingAddress?.address || 'Address unavailable',
            vendorName,
            vendorAddress,
            total: order.total,
            deliveryFee: deliveryFee,
            distance: estimatedDistance,
            estimatedTime: estimatedTime,
            isTryAndBuy: order.orderType === 'try_and_buy' || order.orderType === 'check_and_buy',
            isMultiVendor: order.isMultiVendor,
            vendorPickups: order.vendorPickups,
            type: 'new_assignment_broadcast'
        };

        if (nearbyBoys.length > 0) {
            console.log(`📡 [SOCKET] Sending targeted broadcast to ${nearbyBoys.length} nearby partners.`);
            nearbyBoys.forEach(boy => {
                emitEvent(`delivery_${boy._id}`, 'order_ready_for_pickup', socketPayload);
                
                createNotification({
                    recipientId: boy._id,
                    recipientType: 'delivery',
                    title: 'New Order Nearby',
                    message: `A new order #${order.orderId} is available for pickup near you.`,
                    type: 'order',
                    data: { 
                        orderId: order.orderId, 
                        type: 'new_assignment_broadcast',
                        click_action: `/delivery/dashboard?viewOrder=${order.orderId}`
                    }
                }).catch(() => {});
            });
        } else {
            console.log(`⚠️ [SOCKET] No nearby partners. Broadcasting to global room 'delivery_partners'.`);
            emitEvent('delivery_partners', 'order_ready_for_pickup', socketPayload);
        }
        
    } catch (err) {
        console.error('❌ [Assignment Trigger Error]', err.message);
    }
};
