import Enquiry from '../../../models/Enquiry.model.js';
import { Order } from '../../../models/Order.model.js';
import { emitEvent } from '../../../services/socket.service.js';
import { refundPayment } from '../../../services/razorpay.service.js';

// Helper function to calculate distance between two coordinates in km (Haversine formula)
const calculateDistance = (coord1, coord2) => {
    const [lon1, lat1] = coord1;
    const [lon2, lat2] = coord2;
    const R = 6371; // Radius of the Earth in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
        Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
    const distance = R * c; // Distance in km
    return distance;
};

export const getEnquiries = async (req, res) => {
    try {
        const enquiries = await Enquiry.find()
            .populate('orderId', 'orderId status vendorItems')
            .populate('deliveryBoyId', 'name phone')
            .populate('reasonId', 'reason')
            .sort({ createdAt: -1 });
        res.status(200).json({ success: true, enquiries });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const handleEnquiry = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, adminRemarks } = req.body;

        if (!['approved', 'rejected'].includes(status)) {
            return res.status(400).json({ success: false, message: 'Invalid status' });
        }

        const enquiry = await Enquiry.findById(id).populate('orderId');
        if (!enquiry) {
            return res.status(404).json({ success: false, message: 'Enquiry not found' });
        }

        enquiry.status = status;
        enquiry.adminRemarks = adminRemarks;
        await enquiry.save();

        if (status === 'approved') {
            const order = await Order.findById(enquiry.orderId._id);
            
            // Check if it's already picked up, if so, it ALWAYS goes to return flow.
            const needsReturn = ['picked_up', 'out_for_delivery', 'arrived', 'processing'].includes(order.status);
            
            if (needsReturn) {
                // Determine delivery boy's current location (fallback to order.deliveryTracking.lastLocation or [0,0])
                const currentLocation = order.deliveryFlow?.lastLocation?.coordinates || order.deliveryTracking?.startLocation?.coordinates || [0, 0];
                
                let returnStops = [];
                if (order.isMultiVendor && order.vendorItems && order.vendorItems.length > 0) {
                    // Map vendor items to return stops
                    returnStops = order.vendorItems.map(vi => {
                        // Find shop location, assume vi has a populated vendorId or we use the pickup location
                        const pickupStop = order.vendorPickups?.find(vp => String(vp.vendorId) === String(vi.vendorId));
                        const shopLocation = pickupStop?.shopLocation?.coordinates || [0, 0];
                        const distance = calculateDistance(currentLocation, shopLocation);
                        
                        return {
                            vendorId: vi.vendorId,
                            vendorName: vi.vendorName || pickupStop?.vendorName,
                            shopLocation: pickupStop?.shopLocation,
                            shopAddress: pickupStop?.shopAddress,
                            vendorPhone: pickupStop?.vendorPhone,
                            status: 'pending',
                            distance // Temporary for sorting
                        };
                    });

                    // Sort Nearest to Farthest
                    returnStops.sort((a, b) => a.distance - b.distance);

                    // Assign sequence
                    returnStops.forEach((stop, idx) => {
                        stop.sequence = idx + 1;
                        delete stop.distance; // remove temporary field
                    });
                } else {
                    // Single vendor fallback
                    const vendorId = order.items?.[0]?.vendorId;
                    const shopLocation = order.pickupLocation?.coordinates || [0, 0];
                    returnStops.push({
                        vendorId: vendorId,
                        vendorName: order.vendorName || 'Vendor',
                        shopLocation: { type: 'Point', coordinates: shopLocation },
                        shopAddress: order.vendorAddress || 'Pickup Location',
                        vendorPhone: order.vendorPhone || '',
                        status: 'pending',
                        sequence: 1
                    });
                }

                order.vendorReturnStops = returnStops;
                order.status = 'returning_unselected_items'; // Flow switches to return mode
                order.cancellationReason = enquiry.reasonText || 'Approved via Admin Enquiry';
                
                if (!order.deliveryFlow) order.deliveryFlow = {};
                order.deliveryFlow.phase = 'returning_unselected';
                order.deliveryFlow.rejectedItems = order.items.map(i => ({
                    productId: i.productId || i._id,
                    vendorId: i.vendorId,
                    name: i.name,
                    image: i.image,
                    price: i.price,
                    originalPrice: i.originalPrice,
                    quantity: i.quantity || 1,
                    variant: i.variant,
                    variantKey: i.variantKey,
                    decision: 'rejected'
                }));
            } else {
                // If not picked up yet, simply cancel it
                order.status = 'cancelled';
                order.cancellationReason = enquiry.reasonText || 'Approved via Admin Enquiry';
            }

            // Process full refund if prepaid (for both direct cancellation and return flows)
            if (order.paymentMethod !== 'cod' && order.paymentMethod !== 'cash' && order.razorpayPaymentId && order.paymentStatus !== 'refunded') {
                try {
                    const refund = await refundPayment({
                        paymentId: order.razorpayPaymentId,
                        amount: order.total || 0,
                        notes: { orderId: String(order._id) }
                    });
                    // Fallback for local development where webhook cannot reach
                    if (process.env.NODE_ENV !== 'production' || !process.env.RAZORPAY_WEBHOOK_SECRET) {
                        order.refundStatus = 'processed';
                    } else {
                        order.refundStatus = 'pending'; // Will be updated to processed by webhook
                    }
                    order.refundId = refund.id;
                    order.refundAmount = order.total;
                    order.paymentStatus = 'refunded';
                } catch (refundError) {
                    console.error('Cancellation Refund Error:', refundError);
                    order.refundStatus = 'failed';
                }
            }

            await order.save();
            
            if (order.deliveryBoyId) {
                // Correctly emit to the delivery boy's specific room
                emitEvent(`delivery_${order.deliveryBoyId.toString()}`, 'order_status_updated', { 
                    id: order._id, 
                    orderId: order.orderId, 
                    status: order.status 
                });

                // Send push notification to the delivery boy
                try {
                    const { createNotification } = await import('../../../services/notification.service.js');
                    await createNotification({
                        recipientId: order.deliveryBoyId.toString(),
                        recipientType: 'delivery',
                        title: 'Enquiry Updated',
                        message: `Your cancellation enquiry for order #${order.orderId} has been ${status}.`,
                        type: 'order',
                        data: { orderId: String(order._id), status }
                    });
                } catch (notifyErr) {
                    console.error('[Enquiry] Error notifying delivery boy:', notifyErr);
                }
            }
        }

        res.status(200).json({ success: true, message: `Enquiry ${status} successfully`, enquiry });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
