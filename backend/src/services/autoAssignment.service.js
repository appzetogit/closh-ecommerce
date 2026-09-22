import mongoose from 'mongoose';
import Order from '../models/Order.model.js';
import DeliveryBoy from '../models/DeliveryBoy.model.js';
import DeliveryBatch from '../models/DeliveryBatch.model.js';
import ServiceArea from '../models/ServiceArea.model.js';
import { createNotification } from './notification.service.js';
import { emitEvent, isDeliveryBoyConnected } from './socket.service.js';
import { calculateDistance, getDeliveryEarning, getVendorPickupFee } from '../utils/geo.js';
import { getDeliveryFeeConfig } from '../utils/deliveryFeeConfig.js';
import { OrderNotificationService } from './orderNotification.service.js';
import { QueueService } from './queue.service.js';

/**
 * Automagically assigns the nearest available delivery boy to a multi-vendor or single-vendor order
 * immediately after checkout/payment verification.
 * 
 * @param {String|mongoose.Types.ObjectId} orderId 
 * @returns {Promise<Boolean>} Success status of assignment
 */
export const autoAssignDeliveryBoy = async (orderId, excludeRiderIds = []) => {
    try {
        console.log(`[AutoAssignment] Starting smart assignment for order: ${orderId}. Excluding: ${excludeRiderIds}`);
        const order = await Order.findById(orderId).populate('vendorItems.vendorId');
        if (!order) {
            console.error(`[AutoAssignment] Order not found: ${orderId}`);
            return false;
        }

        if (order.status === 'cancelled' || order.status === 'delivered') {
            console.log(`[AutoAssignment] Order ${order.orderId} is already ${order.status}. Skipping assignment.`);
            return false;
        }

        // If already assigned, bypass auto-assignment to prevent overriding admin decisions
        if (order.deliveryBoyId && !excludeRiderIds.includes(order.deliveryBoyId.toString())) {
            console.log(`[AutoAssignment] Order ${order.orderId} already has delivery partner assigned: ${order.deliveryBoyId}`);
            return true;
        }

        // 1. Gather all vendor coordinates
        const vendorStopsRaw = [];
        for (const vi of order.vendorItems) {
            const vendor = vi.vendorId;
            if (vendor && vendor.shopLocation?.coordinates) {
                // Build a full address from vendor fields
                const fullAddress = vendor.shopAddress
                    || [vendor.address?.street, vendor.address?.city, vendor.address?.state, vendor.address?.zipCode]
                        .filter(Boolean).join(', ')
                    || '';
                vendorStopsRaw.push({
                    vendorId: vendor._id,
                    vendorName: vendor.storeName || vi.vendorName || 'Vendor',
                    shopLocation: vendor.shopLocation,
                    shopAddress: fullAddress,
                    vendorPhone: vendor.phone || '',
                    status: vi.status || 'pending'
                });
            }
        }

        if (vendorStopsRaw.length === 0) {
            console.warn(`[AutoAssignment] No valid vendor locations found for order ${order.orderId}. Cannot assign.`);
            return false;
        }

        // Define primary pickup location (coordinate center or first vendor)
        const firstVendorLocation = vendorStopsRaw[0].shopLocation.coordinates;
        order.pickupLocation = {
            type: 'Point',
            coordinates: firstVendorLocation
        };

        const combinedExclusions = [
            ...excludeRiderIds,
            ...(order.rejectedDeliveryBoys || []).map(id => id.toString())
        ];

        const excludeObjectIds = combinedExclusions.map(id => {
            try { return new mongoose.Types.ObjectId(id); } catch (e) { return null; }
        }).filter(Boolean);

        // 2. Find which ServiceArea boundary the pickup location falls inside
        const activeServiceArea = await ServiceArea.findOne({
            isActive: true,
            boundaries: {
                $geoIntersects: {
                    $geometry: {
                        type: 'Point',
                        coordinates: firstVendorLocation
                    }
                }
            }
        });

        let deliveryBoys = [];

        if (activeServiceArea && activeServiceArea.boundaries && activeServiceArea.boundaries.coordinates && activeServiceArea.boundaries.coordinates.length > 0) {
            console.log(`[AutoAssignment] Pickup is within ServiceArea: ${activeServiceArea.name}. Using strictly geofenced boundaries.`);
            // Strict geofence search
            deliveryBoys = await DeliveryBoy.find({
                status: 'available',
                isAvailable: true,
                applicationStatus: 'approved',
                _id: { $nin: excludeObjectIds },
                currentLocation: {
                    $geoWithin: {
                        $geometry: activeServiceArea.boundaries
                    }
                }
            }).limit(15).lean();
        } else {
            console.log(`[AutoAssignment] No strict boundary found for pickup location. Falling back to 10km radius search.`);
            // Fallback: Query nearest available delivery boys (within 10km radius)
            deliveryBoys = await DeliveryBoy.find({
                status: 'available',
                isAvailable: true,
                applicationStatus: 'approved',
                _id: { $nin: excludeObjectIds },
                currentLocation: {
                    $near: {
                        $geometry: { type: 'Point', coordinates: firstVendorLocation },
                        $maxDistance: 10000 // 10 kilometers
                    }
                }
            }).limit(15).lean();
        }

        // 2.1 Rank by how far each candidate is from the pickup.
        // This has to happen here rather than relying on the query: the
        // service-area branch above uses $geoWithin, which returns matches in
        // no particular order, so without an explicit sort the "nearest 5" were
        // an arbitrary 5 from anywhere inside the city boundary. Only the 10km
        // $near fallback comes back distance-ordered.
        const candidates = deliveryBoys
            .map((boy) => {
                const coords = boy.currentLocation?.coordinates;
                const hasFix = Array.isArray(coords) && coords.length === 2
                    && !(coords[0] === 0 && coords[1] === 0);
                return {
                    boy,
                    // A rider with no GPS fix must not sort as 0 km away, which
                    // calculateDistance would return for invalid input.
                    distanceKm: hasFix ? calculateDistance(firstVendorLocation, coords) : Infinity,
                };
            })
            .sort((a, b) => a.distanceKm - b.distanceKm);

        // Prefer riders with a live socket — they can actually be shown the
        // request — but fall back to the rest rather than leaving it unassigned.
        const connectedCandidates = candidates.filter(({ boy }) => isDeliveryBoyConnected(boy._id.toString()));
        const shortlist = (connectedCandidates.length > 0 ? connectedCandidates : candidates).slice(0, 5);

        // STRICT REQUIREMENT: Do not scan globally outside the service area.
        // If no boys are found in the boundaries or 10km radius, do not fall back.

        if (shortlist.length === 0) {
            console.warn(`[AutoAssignment] ❌ No available delivery partners found in the system for order ${order.orderId}. Waiting for manual intervention.`);
            order.deliveryBoyId = undefined;
            order.status = 'searching';
            await order.save();
            QueueService.scheduleAutoAssignRetry(order._id, 30 * 1000);
            return false;
        }

        // Proximity decides who gets it; idle time only separates riders who are
        // effectively the same distance from the vendor. An earlier version
        // sorted the shortlist purely by lastAssignedAt, which meant a rider 9km
        // away could take an order from one parked outside the shop — that is
        // the "any rider gets it" behaviour this replaces.
        //
        // The band exists because two riders 300m and 600m from a shop are, in
        // practice, equally close; rotating between them is fair without ever
        // sending an order past someone nearer.
        const FAIRNESS_BAND_KM = 1;
        const ranked = [...shortlist].sort((a, b) => {
            const bandA = Math.floor(a.distanceKm / FAIRNESS_BAND_KM);
            const bandB = Math.floor(b.distanceKm / FAIRNESS_BAND_KM);
            if (bandA !== bandB) return bandA - bandB;
            const aTime = a.boy.lastAssignedAt ? new Date(a.boy.lastAssignedAt).getTime() : 0;
            const bTime = b.boy.lastAssignedAt ? new Date(b.boy.lastAssignedAt).getTime() : 0;
            return aTime - bTime; // never-assigned (0) or longest-idle first
        });
        const chosenRider = ranked[0].boy;
        console.log(
            `[AutoAssignment] Shortlist for ${order.orderId}: ` +
            ranked.map((c) => `${c.boy.name} @ ${Number.isFinite(c.distanceKm) ? c.distanceKm.toFixed(2) + 'km' : 'no GPS'}`).join(', ')
        );
        console.log(`[AutoAssignment] Selected rider: ${chosenRider.name} (${chosenRider._id}) for order ${order.orderId} — ${Number.isFinite(ranked[0].distanceKm) ? ranked[0].distanceKm.toFixed(2) + 'km from pickup' : 'no GPS fix'}, idle since ${chosenRider.lastAssignedAt || 'never assigned'}`);

        // 3. Optimize pickup route sequence from rider's current location
        const riderCoords = chosenRider.currentLocation?.coordinates || firstVendorLocation;

        console.log(`[AutoAssignment] 🧭 Rider "${chosenRider.name}" currentLocation:`, JSON.stringify(chosenRider.currentLocation));
        console.log(`[AutoAssignment] 🧭 riderCoords used for sorting:`, riderCoords);
        vendorStopsRaw.forEach((s, i) => {
            const dist = calculateDistance(riderCoords, s.shopLocation?.coordinates || [0, 0]);
            console.log(`[AutoAssignment] 🏪 Vendor[${i}] "${s.vendorName}" coords: ${JSON.stringify(s.shopLocation?.coordinates)}, distFromRider: ${dist} km`);
        });

        const sortStopsNearestFirst = (stops, coords) => {
            if (!coords || coords.length < 2) return stops;
            return [...stops].sort((a, b) => {
                const distA = calculateDistance(coords, a.shopLocation?.coordinates || [0, 0]);
                const distB = calculateDistance(coords, b.shopLocation?.coordinates || [0, 0]);
                return distA - distB;
            });
        };

        const sortedStops = sortStopsNearestFirst(vendorStopsRaw, riderCoords);
        console.log(`[AutoAssignment] ✅ Sorted order:`, sortedStops.map((s, i) => `${i}: ${s.vendorName}`).join(' → '));

        // Map stops to database schema format
        const vendorPickups = sortedStops.map((stop, idx) => {
            const otp = Math.floor(100000 + Math.random() * 900000).toString();
            return {
                vendorId: stop.vendorId,
                vendorName: stop.vendorName,
                shopLocation: stop.shopLocation,
                shopAddress: stop.shopAddress,
                vendorPhone: stop.vendorPhone || '',
                sequence: idx,
                status: 'pending',
                handoverOtp: otp,
                handoverOtpHash: otp,
                handoverOtpDebug: otp,
                handoverOtpSentAt: new Date()
            };
        });

        // 4. Update the Order
        order.deliveryBoyId = chosenRider._id;
        order.status = 'assigned';
        order.assignedAt = new Date(); // Fix: Frontend countdown relies on this
        order.riderAcceptedAt = null; // Clear any previous acceptance
        order.isMultiVendor = order.vendorItems.length > 1;
        order.vendorPickups = vendorPickups;
        order.generateDeliveryOtp();
        await order.save();

        // 5. Update Delivery Boy status to busy
        await DeliveryBoy.findByIdAndUpdate(chosenRider._id, { status: 'busy', lastAssignedAt: new Date() });

        // 6. Create DeliveryBatch for tracing stop-by-stop pickups
        const pickupStops = vendorPickups.map((stop) => ({
            vendorId: stop.vendorId,
            vendorName: stop.vendorName,
            shopAddress: stop.shopAddress,
            vendorPhone: stop.vendorPhone || '',
            location: stop.shopLocation,
            sequence: stop.sequence,
            status: 'pending',
            vendorReadinessStatus: stop.status, // Track vendor acceptance/preparing stage live
            otpVerified: false
        }));

        // Only clear this order's OWN stale batch (if it's being re-assigned), not any
        // other order the same customer happens to have in flight at the same time.
        await DeliveryBatch.deleteMany({
            orderId: order._id,
            status: { $in: ['assigned', 'picked_up', 'arrived', 'try_and_buy', 'payment_pending'] }
        });

        const batchId = `MVBATCH-${Date.now()}`;
        const newBatch = await DeliveryBatch.create({
            batchId,
            orderId: order._id,
            deliveryBoyId: chosenRider._id,
            customerId: order.userId || new mongoose.Types.ObjectId(), // Handle guests
            isMultiVendor: order.isMultiVendor,
            currentStopIndex: 0,
            pickupStops,
            customerLocation: order.dropoffLocation || { type: 'Point', coordinates: [0, 0] },
            customerAddress: order.shippingAddress,
            customerPhone: order.shippingAddress?.phone || order.guestInfo?.phone,
            customerName: order.shippingAddress?.name || order.guestInfo?.name || 'Customer',
            status: 'assigned'
        });

        console.log(`[AutoAssignment] Created DeliveryBatch ${batchId} for order ${order.orderId}`);

        // 7. Notify customer and delivery partner
        await OrderNotificationService.notifyOrderUpdate(order._id, 'assigned', {
            title: 'Delivery Partner Assigned',
            message: `Smart assignment: Rider ${chosenRider.name} has been assigned to your order.`
        });

        // Prepare Payload details (Vendor Name, Address, Distance, Time, Fee)
        const firstVendor = order.vendorItems?.[0] || {};
        const vData = firstVendor.vendorId || {};
        const vendorName = vData.storeName || firstVendor.vendorName || 'Vendor';
        const vendorAddress = vData.shopAddress || (vData.address?.street ? `${vData.address.street}, ${vData.address.city}` : 'Vendor Address');

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
            console.error('❌ [AutoAssignmentTriggerDistance Error]', err.message);
        }

        // Send socket alerts to rider
        const socketPayload = {
            orderId: order.orderId,
            id: order._id,
            batchId: newBatch.batchId,
            pickupLocation: order.pickupLocation,
            customer: order.shippingAddress?.name || order.guestInfo?.name || 'Customer',
            address: order.shippingAddress?.address || 'Address unavailable',
            vendorName,
            vendorAddress,
            total: order.total,
            deliveryEarnings: deliveryFee,
            distance: estimatedDistance,
            estimatedTime: estimatedTime,
            paymentMethod: order.paymentMethod,
            orderType: order.orderType,
            isMultiVendor: order.isMultiVendor,
            vendorPickups: order.vendorPickups,
            type: 'auto_assigned_alert'
        };

        console.log(`📡 [Socket Emit] Notifying delivery_${chosenRider._id} about auto-assignment`);
        emitEvent(`delivery_${chosenRider._id.toString()}`, 'order_ready_for_pickup', socketPayload);
        emitEvent(`delivery_${chosenRider._id.toString()}`, 'auto_assigned_alert', socketPayload);

        await createNotification({
            recipientId: chosenRider._id.toString(),
            recipientType: 'delivery',
            title: 'New Order Auto-Assigned',
            message: `You have been automatically assigned to order #${order.orderId}. Please head towards the vendor cluster.`,
            type: 'order',
            data: {
                orderId: order.orderId,
                batchId: newBatch.batchId,
                type: 'auto_assigned_alert'
            }
        });

        // Clear other riders' caches
        emitEvent('delivery_partners', 'order_taken', {
            orderId: order.orderId,
            id: order._id
        });

        // Notify Admin Panel about live assignment
        emitEvent('admin', 'admin_order_assigned', {
            orderId: order.orderId,
            deliveryBoyId: chosenRider._id,
            assignedAt: order.assignedAt
        });

        // 7. Schedule 120-Second Timeout for Acceptance (must match frontend timer of 120s)
        QueueService.scheduleRiderAutoAssignTimeout(order._id, chosenRider._id, 120 * 1000);

        return true;
    } catch (error) {
        console.error(`[AutoAssignment] ❌ Error assigning delivery boy:`, error);
        return false;
    }
};
