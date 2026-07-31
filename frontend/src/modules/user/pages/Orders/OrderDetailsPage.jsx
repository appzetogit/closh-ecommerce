import React, { useEffect, useState, useRef, useCallback } from 'react';
import toast from 'react-hot-toast';
import api from '../../../../shared/utils/api';
import { useParams, useNavigate } from 'react-router-dom';
import AccountLayout from '../../components/Profile/AccountLayout';
import { ArrowLeft, Package, Clock, MapPin, Phone, CreditCard, ChevronRight, Printer, AlertTriangle, RefreshCcw, X, ShieldCheck, RefreshCw, CheckCircle, Truck, Store, ThumbsUp, UserCheck, CheckCircle2, Layers, Star, MessageSquare } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useOrderStore } from '../../../../shared/store/orderStore';
import { useReviewsStore } from '../../../../shared/store/reviewsStore';
import socketService from '../../../../shared/utils/socket';
import DeliveryRatingCard from '../../components/Profile/DeliveryRatingCard';


const OrderDetailsPage = () => {
    const { orderId } = useParams();
    const navigate = useNavigate();
    const { user } = useAuth();
    const { fetchOrderById, getOrder, resendDeliveryOtp, cancelOrder } = useOrderStore();
    const { addReview, fetchReviews } = useReviewsStore();
    const [taxSettings, setTaxSettings] = useState(null);
    const [order, setOrder] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [showReturnModal, setShowReturnModal] = useState(false);
    const [returnReason, setReturnReason] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [userUpiId, setUserUpiId] = useState('');
    const [isSubmittingUpi, setIsSubmittingUpi] = useState(false);
    const [selectedReturnItems, setSelectedReturnItems] = useState({});
    const [perItemReasons, setPerItemReasons] = useState({});
    const cooldownRef = useRef(null);

    // Review modal state
    const [reviewItem, setReviewItem] = useState(null);
    const [reviewedProductIds, setReviewedProductIds] = useState({});

    // Cancel Order states
    const [showCancelModal, setShowCancelModal] = useState(false);
    const [cancelReason, setCancelReason] = useState('');
    const [customCancelReason, setCustomCancelReason] = useState('');
    const [isCancelling, setIsCancelling] = useState(false);
    const [cancelStep, setCancelStep] = useState(1); // 1 = reason, 2 = confirm
    const [noPartnerMsg, setNoPartnerMsg] = useState('');





    const RETURN_REASONS = [
        "Wrong size delivered",
        "Item is defective or damaged",
        "Item not as described",
        "Changed my mind",
        "Quality not as expected",
        "Received wrong item"
    ];

    const CANCEL_REASONS = [
        'Changed my mind',
        'Ordered by mistake',
        'Found a better price elsewhere',
        'Delivery taking too long',
        'Wrong delivery address selected',
        'Want to modify items in the order',
        'Payment issue',
        'Duplicate order placed',
        'Product no longer needed',
        'Other (Please specify)'
    ];

    const CANCELLABLE_STATUSES = ['pending', 'accepted', 'processing', 'ready_for_pickup', 'all_vendors_ready', 'ready_for_delivery', 'searching', 'assigned'];
    const SUPPORT_CANCELLABLE_STATUSES = ['picked_up', 'out_for_delivery', 'arrived', 'shipped'];
    const canCancelOrder = order && CANCELLABLE_STATUSES.includes(order.status?.toLowerCase()) && order.status?.toLowerCase() !== 'cancelled';
    const needsSupportToCancel = order && SUPPORT_CANCELLABLE_STATUSES.includes(order.status?.toLowerCase());

    const isOrderDelivered = order?.status?.toLowerCase() === 'delivered';

    // Check which products have already been reviewed
    useEffect(() => {
        if (!isOrderDelivered || !order?.items?.length) return;
        const checkExisting = async () => {
            try {
                const result = await useReviewsStore.getState().getMyOrderReviews(order._id || orderId);
                const reviewed = {};
                (result?.productReviews || []).forEach(r => {
                    const pid = String(r.productId?._id || r.productId || '');
                    if (pid) reviewed[pid] = true;
                });
                setReviewedProductIds(reviewed);
            } catch { /* ignore */ }
        };
        checkExisting();
    }, [isOrderDelivered, order?._id, orderId]);

    const handleSubmitProductReview = async (reviewData) => {
        if (!reviewItem) return false;
        const productId = String(reviewItem.productId || reviewItem.id || reviewItem._id);
        const ok = await addReview(productId, {
            ...reviewData,
            orderId: order._id || orderId,
        });
        if (!ok) {
            toast.error('Unable to submit review');
            return false;
        }
        setReviewedProductIds(prev => ({ ...prev, [productId]: true }));
        setReviewItem(null);
        return true;
    };

    const handleCancelOrder = async () => {
        const reason = cancelReason === 'Other (Please specify)' ? customCancelReason.trim() : cancelReason;
        if (!reason || reason.length < 5) {
            toast.error('Please provide a valid cancellation reason');
            return;
        }
        setIsCancelling(true);
        try {
            await cancelOrder(orderId, reason);
            toast.success('Order cancelled successfully');
            setShowCancelModal(false);
            setCancelStep(1);
            setCancelReason('');
            setCustomCancelReason('');
            navigate('/orders');
        } catch (error) {
            const msg = error?.response?.data?.message || error?.message || 'Failed to cancel order';
            toast.error(msg);
        } finally {
            setIsCancelling(false);
        }
    };

    useEffect(() => {
        const loadOrder = async () => {
            if (!orderId) return;
            setIsLoading(true);
            try {
                // Try cache first
                let foundOrder = getOrder(orderId);
                // Always refresh from API to get latest status
                foundOrder = await fetchOrderById(orderId, true);
                if (foundOrder) setOrder(foundOrder);
            } catch (error) {
                console.error("Failed to load order details:", error);
            } finally {
                setIsLoading(false);
            }
        };
        loadOrder();
    }, [orderId, fetchOrderById, getOrder]);

    // Socket.io for real-time updates
    useEffect(() => {
        if (!orderId) return;

        socketService.connect();
        socketService.joinRoom(`order_${orderId}`);
        socketService.joinRoom(`guest_${orderId}`);

        const loadLatest = () => {
            console.log('🔄 Fetching latest order data via socket signal...');
            fetchOrderById(orderId, true).then(updated => {
                if (updated) {
                    setOrder(prev => {
                        // Deep merge to ensure we don't lose local state like temporary animations
                        // but strictly update critical data from server
                        return {
                            ...prev,
                            ...updated,
                            deliveryOtpDebug: updated.deliveryOtpDebug || prev?.deliveryOtpDebug
                        };
                    });
                }
            }).catch(err => console.error('Socket refresh failed:', err));
        };

        const handleUpdate = (data) => {
            if (!data.orderId || String(data.orderId) === String(orderId)) {
                console.log('📦 Real-time update received:', data);
                loadLatest();
            }
        };

        socketService.on('order_status_updated', handleUpdate);
        socketService.on('rider_assigned', handleUpdate);
        socketService.on('delivery_otp_sent', (data) => {
            toast.success('🔐 Delivery OTP Updated!', { id: `otp-sock-${orderId}` });
            loadLatest();
        });
        socketService.on('delivery_otp_resent', (data) => {
            toast.success('🔐 New Delivery OTP received!', { id: `otp-sock-${orderId}` });
            loadLatest();
        });

        const handleNoPartner = (data) => {
            console.log('🚫 no_partner_yet received:', data);
            if (data.orderId === orderId || (order && data.orderId === order.orderId)) {
                setNoPartnerMsg(data.message);
                toast.error(data.message || 'Order cancelled - no delivery partner available', {
                    duration: 8000,
                    id: `no-partner-${orderId}`
                });
                loadLatest();
            }
        };
        socketService.on('no_partner_yet', handleNoPartner);

        return () => {
            socketService.leaveRoom(`order_${orderId}`);
            socketService.leaveRoom(`guest_${orderId}`);
            socketService.off('order_status_updated', handleUpdate);
            socketService.off('rider_assigned', handleUpdate);
            socketService.off('delivery_otp_sent');
            socketService.off('delivery_otp_resent');
            socketService.off('no_partner_yet', handleNoPartner);
        };
    }, [orderId, fetchOrderById]);

    // Real-time return request updates via sockets
    useEffect(() => {
        if (!orderId || !order?.returnRequest?._id) return;

        socketService.joinRoom(`return_${order.returnRequest._id}`);

        const handleReturnUpdate = () => {
            console.log('🔄 Return status updated via socket, refreshing order details...');
            fetchOrderById(orderId, true).then(updated => {
                if (updated) setOrder(updated);
            });
        };

        socketService.on('return_status_updated', handleReturnUpdate);

        return () => {
            socketService.leaveRoom(`return_${order.returnRequest._id}`);
            socketService.off('return_status_updated', handleReturnUpdate);
        };
    }, [orderId, order?.returnRequest?._id, fetchOrderById]);

    // Cleanup cooldown timer on unmount
    useEffect(() => {
        return () => {
            if (cooldownRef.current) clearInterval(cooldownRef.current);
        };
    }, []);

    const handleViewInvoice = () => {
        if (!order) return;

        const invoiceWindow = window.open('', '_blank');

        if (!invoiceWindow) {
            toast.error('Please allow popups to view the invoice.');
            return;
        }

        // Calculate vendor details (defaulting to the first vendor if multiple)
        const primaryVendor = order.vendorItems && order.vendorItems.length > 0 
            ? (order.vendorItems[0].vendorId || {}) 
            : {};
        const vendorNameStr = primaryVendor.storeName || primaryVendor.shopName || order.vendorItems?.[0]?.vendorName || 'CLOSH COMMERCE (OPC) PRIVATE LIMITED';
        const vendorGstinStr = primaryVendor.gstNumber || '08AANCC7176M1ZV';
        const vendorAddressStr = primaryVendor.shopAddress || '70, keshar vihar, Near Railway Colony, Jagatpura, Jaipur, Rajasthan 302017';

        // Format the date for the invoice
        const invoiceDate = new Date(order.date).toLocaleDateString('en-IN', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });

        const addr = order.shippingAddress || order.address || {};
        const customerName = user?.name || order.user?.name || order.userId?.name || order.guestInfo?.name || '';
        const shippingNameRaw = addr.name || '';
        const displayShippingName = ['home', 'work', 'other'].includes(shippingNameRaw.toLowerCase()) ? customerName : (shippingNameRaw || customerName);

        // Calculate totals from items for proper tax and mathematical alignment
        let totalGrossAmount = 0;
        let totalDiscountAmount = 0;
        let totalTaxableValue = 0;
        let totalCgst = 0;
        let totalSgst = 0;
        let totalIgst = 0;
        let totalSellingPriceSum = 0;

        const itemsHtml = order.items.map(item => {
            const qty = item.quantity || 1;
            const mrp = item.originalPrice || item.price || 0;
            const sellingPrice = item.price || 0;
            const totalSellingPrice = sellingPrice * qty;
            const totalMrp = mrp * qty;
            
            // Calculate GST
            let itemCgst = 0, itemSgst = 0, itemIgst = 0;
            const gstRate = sellingPrice <= 2500 ? 5 : 18;
            const taxableValue = totalSellingPrice / (1 + (gstRate / 100));
            const gstAmount = totalSellingPrice - taxableValue;

            if (order.totalCustomerIgst > 0) {
                itemIgst = gstAmount;
            } else {
                itemCgst = gstAmount / 2;
                itemSgst = gstAmount / 2;
            }
            
            const calculatedTaxableValue = totalSellingPrice - (itemCgst + itemSgst + itemIgst);
            const discount = totalMrp - totalSellingPrice;

            totalGrossAmount += totalMrp;
            totalDiscountAmount += discount;
            totalTaxableValue += calculatedTaxableValue;
            totalCgst += itemCgst;
            totalSgst += itemSgst;
            totalIgst += itemIgst;
            totalSellingPriceSum += totalSellingPrice;

            return `
                <tr>
                    <td class="text-left">${item.name} ${item.selectedSize ? `(${item.selectedSize})` : ''}</td>
                    <td>${item.hsnCode || item.productId?.hsnCode || item.product?.hsnCode || 'N/A'}</td>
                    <td>${mrp.toFixed(2)}</td>
                    <td>${qty}</td>
                    <td>${(totalMrp).toFixed(2)}</td>
                    <td>${discount.toFixed(2)}</td>
                    <td>${calculatedTaxableValue.toFixed(2)}</td>
                    <td>${itemCgst.toFixed(2)}</td>
                    <td>${itemSgst.toFixed(2)}</td>
                    <td>${itemIgst.toFixed(2)}</td>
                    <td>${totalSellingPrice.toFixed(2)}</td>
                </tr>
            `;
        }).join('');

        const invoiceContent = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <title>Tax Invoice #${order.id}</title>
                <style>
                    * { box-sizing: border-box; }
                    body { font-family: Arial, sans-serif; padding: 20px; max-width: 1000px; margin: 0 auto; color: #000; line-height: 1.4; font-size: 12px; }
                    .header-title { text-align: center; font-size: 18px; font-weight: bold; margin-bottom: 20px; text-transform: uppercase; border-bottom: 2px solid #000; padding-bottom: 5px; }
                    .top-section { display: flex; justify-content: space-between; margin-bottom: 20px; }
                    .sold-by-info { width: 60%; }
                    .invoice-info { width: 35%; text-align: right; }
                    .info-text { margin-bottom: 5px; }
                    .bold { font-weight: bold; }
                    
                    .addresses-box { border: 1px solid #000; display: flex; margin-bottom: 20px; }
                    .address-col { padding: 10px; flex: 1; border-right: 1px solid #000; }
                    .address-col:last-child { border-right: none; }
                    .address-title { font-weight: bold; margin-bottom: 10px; }
                    
                    .table { width: 100%; border-collapse: collapse; margin-bottom: 20px; text-align: center; border: 1px solid #000; }
                    .table th { border: 1px solid #000; padding: 8px 4px; font-size: 11px; font-weight: bold; }
                    .table td { border: 1px solid #000; padding: 8px 4px; font-size: 11px; vertical-align: middle; }
                    .table .text-left { text-align: left; }
                    .table .text-right { text-align: right; }
                    
                    .totals-row td { font-weight: bold; border-top: 2px solid #000; }
                    .grand-total-row td { font-weight: bold; font-size: 14px; border-top: 2px solid #000; }
                    
                    .footer { text-align: center; margin-top: 40px; font-size: 11px; color: #555; border-top: 1px solid #000; padding-top: 10px; }
                    
                    @media print {
                        body { padding: 0; max-width: 100%; }
                    }
                </style>
            </head>
            <body>
                <div class="header-title">Tax Invoice</div>
                
                <div class="top-section">
                    <div class="sold-by-info">
                        <div class="info-text"><span class="bold">Sold By:</span> ${vendorNameStr}</div>
                        <div class="info-text"><span class="bold">GSTIN:</span> ${vendorGstinStr}</div>
                        <div class="info-text"><span class="bold">Ship-from Address:</span> ${vendorAddressStr}</div>
                    </div>
                    <div class="invoice-info">
                        <div class="info-text"><span class="bold">Invoice Number:</span> INV-${order.id}</div>
                    </div>
                </div>

                <div class="addresses-box">
                    <div class="address-col" style="flex: 1.2;">
                        <div class="info-text"><span class="bold">Order ID:</span> #${order.id}</div>
                        <div class="info-text"><span class="bold">Order Date:</span> ${new Date(order.date).toLocaleDateString('en-CA')}</div>
                        <div class="info-text"><span class="bold">Invoice Date:</span> ${new Date().toLocaleDateString('en-CA')}</div>
                    </div>
                    <div class="address-col" style="flex: 1;">
                        <div class="address-title">Billing To:</div>
                        ${order.address ? `
                            <div>${displayShippingName}</div>
                            <div>${order.address.address}, ${order.address.locality}</div>
                            <div>${order.address.city}, ${order.address.state} - ${order.address.pincode}</div>
                        ` : 'N/A'}
                    </div>
                    <div class="address-col" style="flex: 1;">
                        <div class="address-title">Shipping To:</div>
                        ${order.address ? `
                            <div>${displayShippingName}</div>
                            <div>${order.address.address}, ${order.address.locality}</div>
                            <div>${order.address.city}, ${order.address.state} - ${order.address.pincode}</div>
                        ` : 'N/A'}
                    </div>
                </div>

                <table class="table">
                    <thead>
                        <tr>
                            <th class="text-left" style="width: 25%;">Product</th>
                            <th>HSN</th>
                            <th>MRP</th>
                            <th>Qty</th>
                            <th>Gross Amount</th>
                            <th>Discount</th>
                            <th>Taxable Value</th>
                            <th>CGST</th>
                            <th>SGST/UTGST</th>
                            <th>IGST</th>
                            <th>Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${itemsHtml}
                        <tr class="totals-row">
                            <td colspan="7" class="text-right">Total</td>
                            <td>${totalCgst.toFixed(2)}</td>
                            <td>${totalSgst.toFixed(2)}</td>
                            <td>${totalIgst.toFixed(2)}</td>
                            <td>${totalSellingPriceSum.toFixed(2)}</td>
                        </tr>
                        <tr class="grand-total-row">
                            <td colspan="10" class="text-right">Grand Total</td>
                            <td>${totalSellingPriceSum.toFixed(2)}</td>
                        </tr>
                    </tbody>
                </table>

                <div class="footer">
                    <p class="bold" style="color: #000; font-size: 12px; margin-bottom: 5px;">This is a computer generated invoice and does not require a signature.</p>
                </div>

                <script>
                    window.onload = function() { 
                        setTimeout(function() {
                            window.print();
                        }, 500); 
                    }
                </script>
            </body>
            </html>
        `;

        invoiceWindow.document.open();
        invoiceWindow.document.write(invoiceContent);
        invoiceWindow.document.close();
    };

    const handleViewPlatformInvoice = () => {
        if (!order) return;

        // 18% GST on Shipping and Platform Fee
        const shipping = order.shipping || 0;
        const platformFee = order.platformFee || 0;
        const totalAmount = shipping + platformFee;
        
        if (totalAmount <= 0) {
            toast.error('No shipping or platform fees associated with this order.');
            return;
        }

        const invoiceWindow = window.open('', '_blank');
        if (!invoiceWindow) {
            toast.error('Please allow popups to view the invoice.');
            return;
        }

        const invoiceDate = new Date(order.date).toLocaleDateString('en-IN', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });

        const addr = order.shippingAddress || order.address || {};
        const customerName = user?.name || order.user?.name || order.userId?.name || order.guestInfo?.name || '';
        const shippingNameRaw = addr.name || '';
        const displayShippingName = ['home', 'work', 'other'].includes(shippingNameRaw.toLowerCase()) ? customerName : (shippingNameRaw || customerName);

        const feeTaxable = platformFee / 1.18;
        const feeGst = platformFee - feeTaxable;
        
        const shipTaxable = shipping;
        const shipGst = 0;

        const cgst = feeGst / 2;
        const sgst = feeGst / 2;

        let itemsHtml = '';
        if (shipping > 0) {
            itemsHtml += `
                <tr>
                    <td class="text-left">Shipping & Delivery Charges</td>
                    <td>996812</td>
                    <td>${shipping.toFixed(2)}</td>
                    <td>1</td>
                    <td>${shipping.toFixed(2)}</td>
                    <td>0.00</td>
                    <td>${shipTaxable.toFixed(2)}</td>
                    <td>${(shipGst/2).toFixed(2)}</td>
                    <td>${(shipGst/2).toFixed(2)}</td>
                    <td>0.00</td>
                    <td>${shipping.toFixed(2)}</td>
                </tr>
            `;
        }
        if (platformFee > 0) {
            itemsHtml += `
                <tr>
                    <td class="text-left">Platform Convenience Fee</td>
                    <td>998311</td>
                    <td>${platformFee.toFixed(2)}</td>
                    <td>1</td>
                    <td>${platformFee.toFixed(2)}</td>
                    <td>0.00</td>
                    <td>${feeTaxable.toFixed(2)}</td>
                    <td>${(feeGst/2).toFixed(2)}</td>
                    <td>${(feeGst/2).toFixed(2)}</td>
                    <td>0.00</td>
                    <td>${platformFee.toFixed(2)}</td>
                </tr>
            `;
        }

        const invoiceContent = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <title>Platform Services Invoice #${order.id}</title>
                <style>
                    * { box-sizing: border-box; }
                    body { font-family: Arial, sans-serif; padding: 20px; max-width: 1000px; margin: 0 auto; color: #000; line-height: 1.4; font-size: 12px; }
                    .header-title { text-align: center; font-size: 18px; font-weight: bold; margin-bottom: 20px; text-transform: uppercase; border-bottom: 2px solid #000; padding-bottom: 5px; }
                    .top-section { display: flex; justify-content: space-between; margin-bottom: 20px; }
                    .sold-by-info { width: 60%; }
                    .invoice-info { width: 35%; text-align: right; }
                    .info-text { margin-bottom: 5px; }
                    .bold { font-weight: bold; }
                    
                    .addresses-box { border: 1px solid #000; display: flex; margin-bottom: 20px; }
                    .address-col { padding: 10px; flex: 1; border-right: 1px solid #000; }
                    .address-col:last-child { border-right: none; }
                    .address-title { font-weight: bold; margin-bottom: 10px; }
                    
                    .table { width: 100%; border-collapse: collapse; margin-bottom: 20px; text-align: center; border: 1px solid #000; }
                    .table th { border: 1px solid #000; padding: 8px 4px; font-size: 11px; font-weight: bold; }
                    .table td { border: 1px solid #000; padding: 8px 4px; font-size: 11px; vertical-align: middle; }
                    .table .text-left { text-align: left; }
                    .table .text-right { text-align: right; }
                    
                    .totals-row td { font-weight: bold; border-top: 2px solid #000; }
                    .grand-total-row td { font-weight: bold; font-size: 14px; border-top: 2px solid #000; }
                    
                    .footer { text-align: center; margin-top: 40px; font-size: 11px; color: #555; border-top: 1px solid #000; padding-top: 10px; }
                    
                    @media print {
                        body { padding: 0; max-width: 100%; }
                    }
                </style>
            </head>
            <body>
                <div class="header-title">Platform Services Tax Invoice</div>
                
                <div class="top-section">
                    <div class="sold-by-info">
                        <div class="info-text"><span class="bold">Billed From:</span> CLOSH COMMERCE (OPC) PRIVATE LIMITED</div>
                        <div class="info-text"><span class="bold">GSTIN:</span> 08AANCC7176M1ZV</div>
                        <div class="info-text"><span class="bold">Address:</span> 70, keshar vihar, Near Railway Colony, Jagatpura, Jaipur, Rajasthan 302017</div>
                    </div>
                    <div class="invoice-info">
                        <div class="info-text"><span class="bold">Invoice Number:</span> TX-${order.id}</div>
                    </div>
                </div>

                <div class="addresses-box">
                    <div class="address-col" style="flex: 1.2;">
                        <div class="info-text"><span class="bold">Order ID:</span> #${order.id}</div>
                        <div class="info-text"><span class="bold">Order Date:</span> ${new Date(order.date).toLocaleDateString('en-CA')}</div>
                        <div class="info-text"><span class="bold">Invoice Date:</span> ${new Date().toLocaleDateString('en-CA')}</div>
                    </div>
                    <div class="address-col" style="flex: 1;">
                        <div class="address-title">Billed To (Customer):</div>
                        ${order.address ? `
                            <div>${displayShippingName}</div>
                            <div>${order.address.address}, ${order.address.locality}</div>
                            <div>${order.address.city}, ${order.address.state} - ${order.address.pincode}</div>
                        ` : 'N/A'}
                    </div>
                </div>

                <table class="table">
                    <thead>
                        <tr>
                            <th class="text-left" style="width: 25%;">Service Description</th>
                            <th>SAC</th>
                            <th>Amount</th>
                            <th>Qty</th>
                            <th>Gross Amount</th>
                            <th>Discount</th>
                            <th>Taxable Value</th>
                            <th>CGST (9%)</th>
                            <th>SGST (9%)</th>
                            <th>IGST</th>
                            <th>Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${itemsHtml}
                        <tr class="totals-row">
                            <td colspan="7" class="text-right">Total</td>
                            <td>${cgst.toFixed(2)}</td>
                            <td>${sgst.toFixed(2)}</td>
                            <td>0.00</td>
                            <td>${totalAmount.toFixed(2)}</td>
                        </tr>
                        <tr class="grand-total-row">
                            <td colspan="10" class="text-right">Grand Total (GST Inclusive)</td>
                            <td>${totalAmount.toFixed(2)}</td>
                        </tr>
                    </tbody>
                </table>

                <div class="footer">
                    <p class="bold" style="color: #000; font-size: 12px; margin-bottom: 5px;">This is a computer generated invoice and does not require a signature.</p>
                </div>

                <script>
                    window.onload = function() { 
                        setTimeout(function() {
                            window.print();
                        }, 500); 
                    }
                </script>
            </body>
            </html>
        `;

        invoiceWindow.document.open();
        invoiceWindow.document.write(invoiceContent);
        invoiceWindow.document.close();
    };
    const isTryAndBuy = order?.orderType === 'try_and_buy';
    const isCheckAndBuy = order?.orderType === 'check_and_buy';
    const isMultiVendorOrder = (order?.vendorItems?.length || 0) > 1;
    const showItemLevelReturn = isMultiVendorOrder || (isCheckAndBuy && (order?.items?.length || 0) > 1);



    const handleReturnSubmit = async () => {
        if (showItemLevelReturn) {
            // Multi-vendor: validate per-item selections
            const selectedItems = Object.values(selectedReturnItems).filter(Boolean);
            if (selectedItems.length === 0) {
                toast.error('Please select at least one item to return');
                return;
            }
            const missingReason = selectedItems.find(si => !perItemReasons[si.itemId]);
            if (missingReason) {
                toast.error('Please select a reason for each selected item');
                return;
            }

            setIsSubmitting(true);
            try {
                // Submit one return request with all items
                const allItemsToReturn = selectedItems.map(si => ({
                    productId: String(si.productId?._id || si.productId?.id || si.productId || si._id || si.id),
                    quantity: si.quantity,
                    reason: perItemReasons[si.itemId] || '',
                }));

                await useOrderStore.getState().requestReturn(orderId, {
                    reason: allItemsToReturn[0]?.reason || 'Multi-item return',
                    items: allItemsToReturn,
                });

                const updatedOrder = await fetchOrderById(orderId);
                if (updatedOrder) setOrder(updatedOrder);

                setShowReturnModal(false);
                toast.success('Return request submitted successfully. Our team will review it shortly.');
            } catch (error) {
                console.error("Return request failed:", error);
                toast.error(error.message || 'Failed to submit return request. Please try again.');
            } finally {
                setIsSubmitting(false);
            }
        } else {
            // Single-vendor: original flow
            if (!returnReason) {
                toast.error('Please select a reason for return');
                return;
            }

            setIsSubmitting(true);
            try {
                const allItemsToReturn = order.items.map(item => ({
                    productId: String(item.productId?._id || item.productId?.id || item.productId || item._id || item.id),
                    quantity: item.quantity || 1,
                    reason: returnReason,
                }));

                await useOrderStore.getState().requestReturn(orderId, {
                    reason: returnReason,
                    items: allItemsToReturn,
                });

                const updatedOrder = await fetchOrderById(orderId);
                if (updatedOrder) setOrder(updatedOrder);

                setShowReturnModal(false);
                toast.success('Return request submitted successfully. Our team will review it shortly.');
            } catch (error) {
                console.error("Return request failed:", error);
                toast.error(error.message || 'Failed to submit return request. Please try again.');
            } finally {
                setIsSubmitting(false);
            }
        }
    };

    const handleSubmitUpi = async () => {
        if (!userUpiId) {
            toast.error('Please enter a valid UPI ID');
            return;
        }
        setIsSubmittingUpi(true);
        try {
            await useOrderStore.getState().submitReturnUPI(order.returnRequest._id, userUpiId);
            toast.success('UPI ID submitted successfully!');
            const updatedOrder = await fetchOrderById(orderId, true);
            if (updatedOrder) setOrder(updatedOrder);
        } catch (error) {
            console.error("UPI submission failed:", error);
            toast.error(error.message || 'Failed to submit UPI ID');
        } finally {
            setIsSubmittingUpi(false);
        }
    };

    if (isLoading) {
        return (
            <AccountLayout hideHeader={true}>
                <div className="flex flex-col items-center justify-center min-h-[400px]">
                    <div className="w-10 h-10 border-4 border-black/10 border-t-black rounded-full animate-spin mb-4" />
                    <p className="text-[10px] font-bold uppercase  text-gray-400">Fetching Details...</p>
                </div>
            </AccountLayout>
        );
    }

    if (!order) {
        return (
            <AccountLayout hideHeader={true}>
                <div className="flex flex-col items-center justify-center min-h-[400px]">
                    <p className="text-gray-500 font-bold">Order not found</p>
                    <button
                        onClick={() => navigate('/orders')}
                        className="mt-4 px-6 py-2 bg-black text-white rounded-xl text-sm font-bold uppercase"
                    >
                        Back to Orders
                    </button>
                </div>
            </AccountLayout>
        );
    }

    return (
        <AccountLayout hideHeader={true}>
            <div className="max-w-6xl mx-auto px-0.5 md:px-0 pb-10">
                {/* Responsive Header */}
                <div className="flex flex-wrap items-center gap-2 md:gap-4 mb-4 pt-1">
                    <button
                        onClick={() => navigate('/orders')}
                        className="p-2 hover:bg-white hover:text-black rounded-full transition-colors order-1"
                    >
                        <ArrowLeft size={20} />
                    </button>
                    <div className="flex-1 order-2 min-w-[150px]">
                        <h2 className="text-lg md:text-xl font-bold uppercase ">Order Details</h2>
                        <p className="text-[10px] md:text-xs text-gray-500 font-bold">#{order.id}</p>
                    </div>
                    <div className="flex items-center gap-2 order-3 w-full sm:w-auto sm:order-2 justify-between sm:justify-end">
                        <button
                            onClick={handleViewPlatformInvoice}
                            className="flex items-center gap-2 px-3 md:px-4 py-2 bg-gray-100 hover:bg-gray-200 text-black rounded-xl transition-colors"
                        >
                            <Printer size={16} />
                            <span className="text-[10px] font-bold uppercase">Tax Invoice</span>
                        </button>
                        <button
                            onClick={handleViewInvoice}
                            className="flex items-center gap-2 px-3 md:px-4 py-2 bg-gray-100 hover:bg-gray-200 text-black rounded-xl transition-colors"
                        >
                            <Printer size={16} />
                            <span className="text-[10px] font-bold uppercase">Invoice</span>
                        </button>
                        <span className="text-[9px] md:text-[10px] font-bold bg-black text-white px-3 py-1.5 rounded-full uppercase ">
                            {order.status?.toLowerCase() === 'assigned' ? 'assigned to pickup' : order.status?.toLowerCase() === 'ready_for_pickup' ? 'ready for pickup' : order.status?.toLowerCase() === 'picked_up' ? 'picked up' : order.status?.toLowerCase() === 'out_for_delivery' ? 'out for delivery' : order.status}
                        </span>
                    </div>
                </div>

                <div className="space-y-3 md:space-y-6">
                    {/* Multi-vendor Check & Buy Policy Banner */}
                    {isCheckAndBuy && isMultiVendorOrder && (
                        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex items-start gap-3">
                            <ShieldCheck size={16} className="text-emerald-500 shrink-0 mt-0.5" />
                            <div>
                                <p className="text-[11px] font-black text-emerald-800 uppercase tracking-wide">Multi-Vendor Return Policy</p>
                                <p className="text-[10px] font-medium text-emerald-700 leading-relaxed mt-0.5">
                                    This is a multi-vendor Check &amp; Buy order. You can return items per vendor within 24 hours of delivery. Select specific products during the return process.
                                </p>
                            </div>
                        </div>
                    )}



                    {/* Items Section */}
                    <div className="bg-white rounded-2xl border border-gray-100 p-3 md:p-6 shadow-sm font-bold">
                        <h3 className="text-[10px] md:text-sm font-bold uppercase mb-3 flex items-center gap-2 text-gray-400">
                            <Package size={14} /> Items in Order

                        </h3>
                        <div className="space-y-3">
                            {order.items.map((item, idx) => {
                                const itemId = String(item.id || item.productId || item._id || idx);
                                return (
                                    <div key={idx}
                                        className="flex gap-3 border-b border-gray-50 last:border-0 pb-3 last:pb-0 rounded-xl transition-all"
                                    >
                                        <div className="w-14 h-18 md:w-20 md:h-24 bg-white rounded-lg overflow-hidden shrink-0 border border-gray-100">
                                            <img src={item.image} alt="" className="w-full h-full object-cover" />
                                        </div>
                                        <div className="flex-1 min-w-0 py-0">
                                            <h4 className="text-[12px] md:text-sm font-bold text-gray-900 line-clamp-1">{item.name}</h4>
                                            <p className="text-[8px] md:text-[11px] font-bold text-gray-400 uppercase">
                                                {item.brand || 'Premium Piece'}
                                            </p>
                                            <div className="flex gap-2 mt-1">
                                                <span className="bg-gray-50 px-2 py-0.5 rounded text-[8px] md:text-[10px] font-bold text-gray-600 border border-gray-100 uppercase">
                                                    Size: {item.selectedSize || item.variant?.size || 'N/A'}
                                                </span>
                                                {(item.selectedColor || item.variant?.color) && (
                                                    <span className="bg-gray-50 px-2 py-0.5 rounded text-[8px] md:text-[10px] font-bold text-gray-600 border border-gray-100 uppercase">
                                                        Color: {item.selectedColor || item.variant?.color}
                                                    </span>
                                                )}
                                                <span className="bg-gray-50 px-2 py-0.5 rounded text-[8px] md:text-[10px] font-bold text-gray-600 border border-gray-100 uppercase">
                                                    Qty: {item.quantity}
                                                </span>
                                            </div>
                                            <p className="text-[12px] md:text-base font-bold text-black mt-1">₹{item.discountedPrice || item.price}</p>
                                            {isOrderDelivered && (() => {
                                                const pid = String(item.productId || item.id || item._id || '');
                                                const alreadyReviewed = reviewedProductIds[pid];
                                                return alreadyReviewed ? (
                                                    <span className="inline-flex items-center gap-1 mt-1.5 px-2 py-1 bg-emerald-50 text-emerald-600 rounded-lg text-[9px] font-bold uppercase border border-emerald-100">
                                                        <CheckCircle size={10} /> Reviewed
                                                    </span>
                                                ) : (
                                                    <button
                                                        onClick={() => setReviewItem(item)}
                                                        className="inline-flex items-center gap-1 mt-1.5 px-2.5 py-1 bg-black text-white rounded-lg text-[9px] font-bold uppercase hover:bg-gray-800 transition-all active:scale-95 shadow-sm"
                                                    >
                                                        <Star size={10} /> Rate / Review
                                                    </button>
                                                );
                                            })()}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>


                    </div>

                    {/* Delivery & Payment Info Grid */}
                    <div className="grid md:grid-cols-2 gap-3 md:gap-6 font-bold">
                        {/* Delivery Address */}
                        <div className="bg-white rounded-2xl border border-gray-100 p-3 md:p-6 shadow-sm">
                            <h3 className="text-[10px] md:text-sm font-bold uppercase mb-3 flex items-center gap-2 text-gray-400">
                                <MapPin size={14} /> Delivery
                            </h3>
                            {order.address ? (
                                <div className="space-y-1">
                                    <p className="text-[13px] font-bold text-gray-900">{order.address.name}</p>
                                    <p className="text-[10px] md:text-xs text-gray-500 font-medium leading-tight">
                                        {order.address.address}, {order.address.locality} <br />
                                        {order.address.city} - {order.address.pincode || 'N/A'}
                                    </p>
                                    <p className="text-[10px] font-bold text-gray-900 flex items-center gap-2 mt-1">
                                        <Phone size={10} className="text-gray-400" /> {order.address.mobile || 'N/A'}
                                    </p>
                                </div>
                            ) : (
                                <p className="text-[10px] text-gray-400">N/A</p>
                            )}
                        </div>

                        {/* Payment Info */}
                        <div className="bg-white rounded-2xl border border-gray-100 p-3 md:p-6 shadow-sm">
                            <h3 className="text-[10px] md:text-sm font-bold uppercase mb-3 flex items-center gap-2 text-gray-400">
                                <CreditCard size={14} /> Summary
                            </h3>
                            <div className="space-y-1.5">
                                <div className="flex justify-between text-[10px] font-bold text-gray-500">
                                    <span>Subtotal</span>
                                    <span>₹{order.subtotal}</span>
                                </div>
                                {order.discount > 0 && (
                                    <div className="flex justify-between text-[10px] font-bold text-emerald-600">
                                        <span>Discount</span>
                                        <span>-₹{order.discount}</span>
                                    </div>
                                )}
                                <div className="flex justify-between text-[10px] font-bold text-gray-500">
                                    <span>Shipping</span>
                                    <span>{order.shipping > 0 ? `₹${order.shipping}` : 'FREE'}</span>
                                </div>
                                {/* Tax is inclusive in the MRP and displayed in the invoice, hidden from summary to avoid confusion */}
                                {order.platformFee > 0 && (
                                    <div className="flex justify-between text-[10px] font-bold text-gray-500">
                                        <span>Platform Fee</span>
                                        <span>₹{order.platformFee}</span>
                                    </div>
                                )}
                                <div className="flex justify-between text-[10px] font-black text-black pt-1.5 border-t border-gray-50">
                                    <span>Paid via {order.paymentMethod?.toUpperCase() || 'COD'}</span>
                                    <span>₹{order.total}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Refund Details */}
                    {order.refundId && (
                        <div className="bg-white rounded-2xl border border-gray-100 p-3 md:p-6 shadow-sm mt-3 md:mt-0">
                            <h3 className="text-[10px] md:text-sm font-bold uppercase mb-4 flex items-center gap-2 text-emerald-600">
                                <CheckCircle size={14} className="text-emerald-500" /> Refund Details
                            </h3>
                            <div className="grid md:grid-cols-2 gap-4 md:gap-8">
                                <div className="space-y-2">
                                    <div className="flex justify-between text-[10px] md:text-xs font-bold text-gray-500">
                                        <span>Refund Status</span>
                                        <span className="text-emerald-600 capitalize">{order.refundStatus}</span>
                                    </div>
                                    <div className="flex justify-between text-[10px] md:text-xs font-bold text-gray-500">
                                        <span>Refund Amount</span>
                                        <span className="text-gray-900">₹{order.refundAmount || order.total}</span>
                                    </div>
                                    <div className="flex justify-between text-[10px] md:text-xs font-bold text-gray-500">
                                        <span>Refund ID</span>
                                        <span className="text-gray-900 break-all">{order.refundId}</span>
                                    </div>
                                    {order.cancelledAt && (
                                        <div className="flex justify-between text-[10px] md:text-xs font-bold text-gray-500">
                                            <span>Issued On</span>
                                            <span className="text-gray-900">
                                                {new Date(order.cancelledAt).toLocaleDateString('en-US', {
                                                    year: 'numeric',
                                                    month: 'short',
                                                    day: 'numeric',
                                                    hour: '2-digit',
                                                    minute: '2-digit'
                                                })}
                                            </span>
                                        </div>
                                    )}
                                </div>
                                
                                {/* Refund Timeline */}
                                <div className="border-t border-gray-50 md:border-t-0 md:border-l md:pl-8 pt-4 md:pt-0">
                                    <p className="font-bold text-gray-400 mb-4 text-[10px] tracking-wider uppercase">Refund Timeline</p>
                                    <div className="space-y-0 pl-1">
                                        <div className="flex gap-4 relative">
                                            <div className="absolute left-[5px] top-[14px] w-[2px] h-full bg-emerald-500 z-0" />
                                            <div className="relative z-10 flex flex-col items-center">
                                                <div className="w-3 h-3 rounded-full bg-emerald-500 ring-4 ring-emerald-50" />
                                            </div>
                                            <div className="pb-5 pt-0.5">
                                                <p className="font-bold text-gray-900 text-[11px] uppercase tracking-wider">Refund Processing</p>
                                                <p className="text-[9px] text-gray-500 mt-0.5">Takes 3-5 working days</p>
                                            </div>
                                        </div>
                                        <div className="flex gap-4 relative">
                                            <div className="relative z-10 flex flex-col items-center">
                                                <div className={`w-3 h-3 rounded-full ${order.refundStatus === 'processed' ? 'bg-emerald-500 ring-4 ring-emerald-50' : 'bg-gray-200 ring-4 ring-gray-50'}`} />
                                            </div>
                                            <div className="pt-0.5 pb-2">
                                                <p className={`font-bold text-[11px] uppercase tracking-wider ${order.refundStatus === 'processed' ? 'text-gray-900' : 'text-gray-400'}`}>Refund Processed</p>
                                                <p className="text-[9px] text-gray-500 mt-0.5 leading-relaxed pr-2">
                                                    Amount will be credited to customer's bank account within 5-7 working days after the refund has processed.
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* OTP and Rider Info */}
                    {(() => {
                        const status = order?.status?.toLowerCase() || 'pending';
                        const isActiveDelivery = ['assigned', 'picked_up', 'out_for_delivery', 'arrived'].includes(status);
                        const hasRider = !!((order?.deliveryBoyId || order?.assignedDeliveryBoy) && order?.riderAcceptedAt);
                        const riderName = order?.deliveryBoyId?.name || order?.assignedDeliveryBoy?.name;
                        const riderPhone = order?.deliveryBoyId?.phone || order?.assignedDeliveryBoy?.phone;
                        
                        if (!isActiveDelivery) return null;

                        return (
                            <div className="space-y-4 mb-6">
                                {/* OTP Section */}
                                {order.deliveryOtpDebug && user && (
                                    <div className="bg-slate-900 rounded-2xl p-6 text-white shadow-xl relative overflow-hidden flex items-center justify-between">
                                        <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/20 rounded-full blur-3xl" />
                                        <div className="relative z-10">
                                            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1">Delivery OTP</p>
                                            <p className="text-[12px] text-white leading-tight">Share this with your rider</p>
                                        </div>
                                        <div className="bg-white rounded-xl px-5 py-3 shadow-inner relative z-10 text-slate-900">
                                            <span className="text-2xl font-black tracking-[0.2em]">{order.deliveryOtpDebug}</span>
                                        </div>
                                    </div>
                                )}

                                {/* Rider Card */}
                                <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm flex items-center gap-4">
                                    {hasRider ? (
                                        <>
                                            <div className="relative shrink-0">
                                                <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center text-indigo-500 border border-slate-100 overflow-hidden">
                                                    {order?.deliveryBoyId?.avatar ? (
                                                        <img src={order.deliveryBoyId.avatar} className="w-full h-full object-cover" alt="Rider" />
                                                    ) : <Truck size={32} />}
                                                </div>
                                                <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-emerald-500 rounded-full border-4 border-white shadow-sm" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-[11px] text-slate-400 font-bold uppercase tracking-widest mb-0.5">Your Rider</p>
                                                <h3 className="text-base font-bold text-slate-900 leading-tight truncate">{riderName}</h3>
                                                <div className="flex items-center gap-2 mt-1">
                                                    <div className="flex items-center text-amber-500 bg-amber-50 px-2 py-0.5 rounded-lg border border-amber-100">
                                                        <span className="text-[11px] font-bold">4.9</span>
                                                        <svg className="w-3 h-3 fill-current ml-0.5" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg>
                                                    </div>
                                                    <span className="text-[11px] text-slate-400 font-bold uppercase tracking-tight">Verified</span>
                                                </div>
                                            </div>
                                            <button 
                                                onClick={() => window.open(`tel:${riderPhone}`, '_self')}
                                                className="w-12 h-12 rounded-2xl bg-emerald-500 shadow-lg shadow-emerald-50 flex items-center justify-center text-white active:scale-90 transition-transform shrink-0"
                                            >
                                                <Phone size={20} />
                                            </button>
                                        </>
                                    ) : (
                                        <>
                                            <div className="w-14 h-14 bg-amber-50 rounded-2xl flex items-center justify-center text-amber-500 shrink-0">
                                                <RefreshCw size={32} className="animate-spin-slow" />
                                            </div>
                                            <div>
                                                <h3 className="font-bold text-sm text-slate-900 uppercase tracking-tight">Assigning Partner</h3>
                                                <p className="text-[12px] text-slate-500 font-medium mt-1 leading-tight">Finding the best delivery partner for your order...</p>
                                            </div>
                                        </>
                                    )}
                                </div>
                            </div>
                        );
                    })()}

                    {/* Order Timeline */}
                    <div className="bg-white rounded-3xl border border-slate-100 p-6 md:p-8 shadow-sm font-sans">
                        <h3 className="text-xs md:text-sm font-black uppercase mb-6 flex items-center gap-2 text-slate-400 tracking-wider">
                            <Clock size={16} className="text-slate-400" /> Live Tracking Journey
                        </h3>

                        {(() => {
                            const status = order.status?.toLowerCase() || 'pending';
                            const isCancelled = status === 'cancelled' || status === 'canceled';

                            const getStepState = (stepIndex) => {
                                if (isCancelled) return 'pending';
                                
                                const vendorStatuses = (order.vendorItems || []).map(vi => String(vi.status || 'pending').toLowerCase());
                                
                                // Step 1: Confirm (Vendor confirmed)
                                const isConfirmed = vendorStatuses.length > 0 && vendorStatuses.some(s => 
                                    ['accepted', 'processing', 'ready_for_pickup', 'picked_up', 'out_for_delivery', 'delivered'].includes(s)
                                );
                                
                                // Step 2: Ready for Pickup (Prepared at shop)
                                const isReadyForPickup = vendorStatuses.length > 0 && vendorStatuses.every(s => 
                                    ['ready_for_pickup', 'picked_up', 'out_for_delivery', 'delivered'].includes(s)
                                );
                                
                                // Step 3: Picked Up (Collected by rider)
                                const isPickedUp = ['picked_up', 'out_for_delivery', 'delivered'].includes(status);
                                
                                // Step 4: Out for Delivery (On the way to you)
                                const isOutForDelivery = ['out_for_delivery', 'delivered'].includes(status);
                                
                                // Step 5: Delivered (Arrived safely)
                                const isDelivered = status === 'delivered';
                                
                                if (stepIndex === 1) {
                                    if (isConfirmed) return 'completed';
                                    return 'active';
                                }
                                
                                if (stepIndex === 2) {
                                    if (isReadyForPickup) return 'completed';
                                    if (isConfirmed) return 'active';
                                    return 'pending';
                                }
                                
                                if (stepIndex === 3) {
                                    if (isPickedUp) return 'completed';
                                    if (isReadyForPickup) return 'active';
                                    return 'pending';
                                }
                                
                                if (stepIndex === 4) {
                                    if (isOutForDelivery) return 'completed';
                                    if (isPickedUp) return 'active';
                                    return 'pending';
                                }
                                
                                if (stepIndex === 5) {
                                    if (isDelivered) return 'completed';
                                    if (isOutForDelivery) return 'active';
                                    return 'pending';
                                }
                                
                                return 'pending';
                            };

                            const formatDate = (dateString) => {
                                if (!dateString) return '';
                                const date = new Date(dateString);
                                if (isNaN(date.getTime())) return '';
                                return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
                            };

                            const steps = [
                                {
                                    label: 'Confirm',
                                    subtitle: 'Vendor confirmed',
                                    icon: CheckCircle,
                                    date: order.vendorAcceptedAt || order.createdAt,
                                    state: getStepState(1)
                                },
                                {
                                    label: 'Ready for Pickup',
                                    subtitle: 'Prepared at shop',
                                    icon: Package,
                                    date: order.readyAt,
                                    state: getStepState(2)
                                },
                                {
                                    label: 'Picked Up',
                                    subtitle: 'Collected by rider',
                                    icon: Store,
                                    date: order.pickedUpAt,
                                    state: getStepState(3)
                                },
                                {
                                    label: 'Out for Delivery',
                                    subtitle: 'On the way to you',
                                    icon: Truck,
                                    date: (status === 'out_for_delivery' || status === 'delivered') ? (order.updatedAt || order.pickedUpAt) : null,
                                    state: getStepState(4)
                                },
                                {
                                    label: 'Delivered',
                                    subtitle: 'Arrived safely',
                                    icon: MapPin,
                                    date: order.deliveredAt,
                                    state: getStepState(5)
                                }
                            ];

                            const isReturned = ['returned', 'returned_to_vendor', 'returning_unselected_items', 'return_requested'].includes(status) || order.returnRequest;

                            return (
                                <div className="w-full">
                                    {isCancelled ? (
                                        <div className="text-center py-6 bg-red-50 rounded-2xl border border-red-100/50 px-4">
                                            <p className="text-red-500 text-xs font-black uppercase tracking-widest">Order Cancelled</p>
                                            {order.cancellationReason && order.cancellationReason.toLowerCase().includes('no delivery partner') ? (
                                                <p className="text-slate-500 text-[11px] font-bold mt-2 leading-relaxed">
                                                    Sorry for the inconvenience! Your order has been cancelled because no delivery partner is currently available in your area. Please feel free to place a new order.
                                                </p>
                                            ) : (
                                                <p className="text-slate-400 text-[10px] mt-1">This order was cancelled by the customer or vendor.</p>
                                            )}
                                        </div>
                                    ) : isReturned ? (
                                        <div className="text-center py-6 bg-emerald-50 rounded-2xl border border-emerald-100/50 px-4">
                                            <p className="text-emerald-600 text-xs font-black uppercase tracking-widest">Order Returned</p>
                                            <p className="text-slate-500 text-[11px] font-bold mt-2 leading-relaxed">
                                                This order has been returned. Your refund has been processed or is being processed according to the return request.
                                            </p>
                                        </div>
                                    ) : (
                                        <div>
                                            {/* DESKTOP HORIZONTAL TIMELINE */}
                                            <div className="hidden md:flex items-center justify-between relative px-4 py-6">
                                                {/* Background track line */}
                                                <div className="absolute top-[48px] left-[10%] right-[10%] h-[3px] bg-slate-100 z-0 rounded-full" />

                                                {/* Completed track line */}
                                                {(() => {
                                                    const completedSteps = steps.filter(s => s.state === 'completed').length;
                                                    let widthPercentage = '0%';
                                                    if (completedSteps >= 5) widthPercentage = '100%';
                                                    else if (completedSteps === 4) widthPercentage = '75%';
                                                    else if (completedSteps === 3) widthPercentage = '50%';
                                                    else if (completedSteps === 2) widthPercentage = '25%';
                                                    else if (completedSteps === 1) widthPercentage = '0%';

                                                    return (
                                                        <div
                                                            className="absolute top-[48px] left-[10%] h-[3px] bg-emerald-500 z-0 rounded-full transition-all duration-700 ease-out"
                                                            style={{ width: `calc(${widthPercentage} * 0.8)` }}
                                                        />
                                                    );
                                                })()}

                                                {steps.map((step, idx) => {
                                                    const Icon = step.icon;
                                                    const isCompleted = step.state === 'completed';
                                                    const isActive = step.state === 'active';

                                                    return (
                                                        <div key={idx} className="flex flex-col items-center flex-1 relative z-10">
                                                            {/* Step Node */}
                                                            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-500 relative ${isCompleted
                                                                ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20'
                                                                : isActive
                                                                    ? 'bg-slate-900 text-white shadow-xl shadow-slate-900/30 scale-110 animate-pulse'
                                                                    : 'bg-slate-50 text-slate-300 border border-slate-100'
                                                                }`}>
                                                                <Icon size={20} strokeWidth={2.2} />

                                                                {/* Pulse ring for active status */}
                                                                {isActive && (
                                                                    <div className="absolute inset-0 rounded-2xl border-2 border-slate-950 animate-ping opacity-70" />
                                                                )}
                                                            </div>

                                                            {/* Labels */}
                                                            <div className="text-center mt-3 max-w-[120px]">
                                                                <p className={`text-[11px] font-black tracking-wide uppercase ${isCompleted ? 'text-emerald-600' : isActive ? 'text-slate-900' : 'text-slate-400'}`}>
                                                                    {step.label}
                                                                </p>
                                                                <p className="text-[9px] text-slate-400 font-medium leading-tight mt-0.5">{step.subtitle}</p>
                                                                {step.date && (
                                                                    <span className="inline-block mt-1 bg-slate-50 border border-slate-100 text-slate-500 text-[8px] font-bold px-1.5 py-0.5 rounded-md uppercase tracking-wider">
                                                                        {formatDate(step.date)}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>

                                            {/* MOBILE VERTICAL TIMELINE */}
                                            <div className="md:hidden space-y-6 py-2 px-1">
                                                {steps.map((step, idx) => {
                                                    const Icon = step.icon;
                                                    const isCompleted = step.state === 'completed';
                                                    const isActive = step.state === 'active';

                                                    return (
                                                        <div key={idx} className="flex gap-4 relative">
                                                            {/* Timeline Vertical line */}
                                                            {idx !== steps.length - 1 && (
                                                                <div className={`absolute left-5 top-10 w-[2px] h-12 z-0 ${isCompleted ? 'bg-emerald-500' : 'bg-slate-100'
                                                                    }`} />
                                                            )}

                                                            {/* Icon container */}
                                                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 z-10 transition-all duration-300 relative ${isCompleted
                                                                ? 'bg-emerald-500 text-white shadow-md'
                                                                : isActive
                                                                    ? 'bg-slate-900 text-white shadow-lg scale-105'
                                                                    : 'bg-slate-50 text-slate-300 border border-slate-100'
                                                                }`}>
                                                                <Icon size={18} strokeWidth={2.2} />
                                                                {isActive && (
                                                                    <div className="absolute inset-0 rounded-xl border-2 border-slate-900 animate-ping opacity-60" />
                                                                )}
                                                            </div>

                                                            {/* Content */}
                                                            <div className="flex-1 pt-1">
                                                                <div className="flex items-start justify-between">
                                                                    <div>
                                                                        <h4 className={`text-[12px] font-black uppercase tracking-wider ${isActive ? 'text-slate-900' : isCompleted ? 'text-slate-700' : 'text-slate-400'
                                                                            }`}>
                                                                            {step.label}
                                                                        </h4>
                                                                        <p className="text-[10px] text-slate-400 font-medium leading-tight mt-0.5">{step.subtitle}</p>
                                                                    </div>
                                                                    {step.date && (
                                                                        <span className="shrink-0 bg-slate-50 border border-slate-100 text-slate-500 text-[8px] font-bold px-1.5 py-0.5 rounded-md uppercase tracking-wider">
                                                                            {formatDate(step.date)}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })()}

                        {(order.orderType || order.deliveryType) && (
                            <div className="flex items-center justify-center gap-2 mt-6 px-4 py-2 bg-slate-50 border border-slate-100 rounded-full w-fit mx-auto">
                                <ShieldCheck size={14} className="text-slate-700" />
                                <span className="text-[9px] font-black uppercase text-slate-700 tracking-wider">
                                    Delivery Option: <span className="text-indigo-600">{(order.orderType || order.deliveryType).replace(/_/g, ' ')}</span>
                                </span>
                            </div>
                        )}

                        <p className="text-[9px] font-bold text-slate-400 mt-4 text-center tracking-widest uppercase">
                            Fast Delivery Guaranteed
                        </p>



                        {order.returnRequest && !['completed', 'rejected'].includes(order.returnRequest.status?.toLowerCase()) && order.returnRequest.pickupOtpDebug && user && (
                            <div className="mt-6 p-4 bg-indigo-50/50 rounded-2xl border border-indigo-150 border-dashed text-center relative overflow-hidden animate-pulse">
                                <div className="absolute -top-10 -right-10 w-24 h-24 bg-indigo-600/5 rounded-full blur-xl pointer-events-none" />
                                <p className="text-[9px] font-black uppercase text-indigo-600 mb-1 tracking-widest flex items-center justify-center gap-1">
                                    <ShieldCheck size={12} className="text-indigo-500" /> Share this Return Pickup OTP with delivery partner
                                </p>
                                <p className="text-2xl font-black text-indigo-700 tracking-wider font-mono">{order.returnRequest.pickupOtpDebug}</p>
                                <p className="text-[8px] text-indigo-400 font-bold uppercase tracking-tight leading-none mt-1">
                                    Rider will verify this code to collect your return package.
                                </p>
                            </div>
                        )}
                    </div>


                    {/* Multi-Vendor Combined Delivery Timeline */}
                    {order.isMultiVendor && order.vendorItems?.length > 1 && (
                        <div className="bg-white rounded-3xl border border-indigo-100 p-6 md:p-8 shadow-sm font-sans mt-6">
                            <h3 className="text-xs md:text-sm font-black uppercase mb-6 flex items-center gap-2 text-indigo-500 tracking-wider">
                                <Layers size={16} className="text-indigo-500" /> Multi-Vendor Combined Delivery
                            </h3>

                            {/* Vendor Readiness Grid */}
                            <div className="grid grid-cols-1 gap-2 mb-6">
                                {(order.vendorItems || []).map((vi, idx) => {
                                    const vendorPickup = (order.vendorPickups || []).find(vp => String(vp.vendorId) === String(vi.vendorId));
                                    const isReady = vi.status === 'ready_for_pickup' || vendorPickup?.status === 'picked_up';
                                    const isPickedUp = vendorPickup?.status === 'picked_up';
                                    return (
                                        <div key={idx} className={`flex items-center justify-between p-3 rounded-xl border ${isPickedUp ? 'bg-emerald-50 border-emerald-200' : isReady ? 'bg-blue-50 border-blue-200' : 'bg-slate-50 border-slate-100'}`}>
                                            <div className="flex items-center gap-2">
                                                <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${isPickedUp ? 'bg-emerald-500' : isReady ? 'bg-blue-500' : 'bg-slate-200'}`}>
                                                    <Store size={13} className={isPickedUp || isReady ? 'text-white' : 'text-slate-400'} />
                                                </div>
                                                <div>
                                                    <p className="text-xs font-black text-slate-800">Closh {idx + 1}</p>
                                                    <p className="text-[10px] text-slate-400 font-medium">{vi.items?.length || 0} item{vi.items?.length !== 1 ? 's' : ''}</p>
                                                </div>
                                            </div>
                                            <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase ${isPickedUp ? 'bg-emerald-100 text-emerald-700' : isReady ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'}`}>
                                                {isPickedUp ? 'Picked Up ✓' : isReady ? 'Ready' : vi.status?.replace(/_/g, ' ') || 'Pending'}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Combined Pickup Timeline Steps */}
                            {(() => {
                                const s = order.status?.toLowerCase() || 'pending';
                                const vendorPickups = order.vendorPickups || [];
                                const pickedCount = vendorPickups.filter(vp => vp.status === 'picked_up').length;
                                const totalVendors = order.vendorItems?.length || 1;

                                const mvRank = {
                                    'pending': 0, 'accepted': 0, 'all_vendors_ready': 1,
                                    'assigned': 2, 'picked_up': 3 + pickedCount,
                                    'out_for_delivery': 3 + totalVendors,
                                    'delivered': 5 + totalVendors,
                                };
                                const mvCurrentRank = mvRank[s] ?? 0;

                                const mvSteps = [
                                    { label: 'All Vendors Ready', subtitle: 'Combined order confirmed', icon: CheckCircle },
                                    { label: 'Rider Assigned', subtitle: 'Multi-stop trip started', icon: Truck },
                                    ...(order.vendorItems || []).map((vi, i) => ({
                                        label: `Pickup from Closh ${i + 1}`,
                                        subtitle: 'OTP verified & collected',
                                        icon: Package,
                                        mvRankVal: 3 + i,
                                        isVendorStop: true,
                                        vendorPickup: vendorPickups.find(vp => String(vp.vendorId) === String(vi.vendorId)),
                                    })),
                                    { label: 'Out for Delivery', subtitle: 'Heading to your location', icon: MapPin, mvRankVal: 3 + totalVendors },
                                    { label: 'Delivered', subtitle: 'OTP verified & received', icon: CheckCircle, mvRankVal: 4 + totalVendors },
                                ];

                                return (
                                    <div className="space-y-3">
                                        {mvSteps.map((step, idx) => {
                                            const stepRank = step.mvRankVal ?? idx + 1;
                                            const isComplete = mvCurrentRank >= stepRank;
                                            const isActive = mvCurrentRank === stepRank - 1;
                                            const Icon = step.icon;
                                            return (
                                                <div key={idx} className="flex items-start gap-3 relative">
                                                    {idx < mvSteps.length - 1 && (
                                                        <div className={`absolute left-[14px] top-8 w-0.5 h-8 ${isComplete ? 'bg-indigo-400' : 'bg-slate-100'}`} />
                                                    )}
                                                    <div className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 z-10 transition-all ${isComplete ? 'bg-indigo-600 text-white' : isActive ? 'bg-slate-900 text-white animate-pulse' : 'bg-slate-100 text-slate-300'}`}>
                                                        <Icon size={13} />
                                                    </div>
                                                    <div className="pt-0.5 flex-1">
                                                        <p className={`text-[11px] font-black uppercase tracking-wide ${isComplete ? 'text-indigo-700' : isActive ? 'text-slate-900' : 'text-slate-400'}`}>
                                                            {step.label}
                                                        </p>
                                                        <p className="text-[9px] text-slate-400 font-medium">{step.subtitle}</p>
                                                        {step.isVendorStop && step.vendorPickup?.pickedUpAt && (
                                                            <span className="text-[8px] font-bold text-emerald-600">
                                                                ✓ {new Date(step.vendorPickup.pickedUpAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                                                            </span>
                                                        )}
                                                    </div>
                                                    {isComplete && (
                                                        <CheckCircle size={13} className="text-indigo-500 shrink-0 mt-1" />
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                );
                            })()}
                        </div>
                    )}

                    {/* Return Live Tracking Timeline */}
                    {order.returnRequest && !isTryAndBuy && (

                        <div className="bg-white rounded-3xl border border-slate-100 p-6 md:p-8 shadow-sm font-sans mt-6">
                            <h3 className="text-xs md:text-sm font-black uppercase mb-6 flex items-center gap-2 text-slate-400 tracking-wider">
                                <Clock size={16} className="text-slate-400 animate-spin" style={{ animationDuration: '4s' }} /> Return Live Tracking Timeline
                            </h3>

                            {(() => {
                                const retStatus = order.returnRequest.status?.toLowerCase() || 'pending';
                                const hasRider = !!order.returnRequest.deliveryBoyId;
                                const hasPickupPhoto = !!order.returnRequest.pickupPhoto;
                                const hasDeliveryPhoto = !!order.returnRequest.deliveryPhoto;

                                const getReturnStepState = (stepIndex) => {
                                    if (retStatus === 'rejected') return 'pending';

                                    if (stepIndex === 1) {
                                        if (retStatus === 'pending') return 'active';
                                        return 'completed';
                                    }
                                    if (stepIndex === 2) {
                                        if (retStatus === 'pending') return 'pending';
                                        if (retStatus === 'approved') return 'active';
                                        return 'completed';
                                    }
                                    if (stepIndex === 3) {
                                        if (['pending', 'approved'].includes(retStatus)) return 'pending';
                                        if (retStatus === 'processing' && !hasRider) return 'active';
                                        return 'completed';
                                    }
                                    if (stepIndex === 4) {
                                        if (['pending', 'approved'].includes(retStatus)) return 'pending';
                                        if (retStatus === 'processing' && !hasPickupPhoto) return 'active';
                                        return 'completed';
                                    }
                                    if (stepIndex === 5) {
                                        if (['pending', 'approved', 'processing'].includes(retStatus) && !hasPickupPhoto) return 'pending';
                                        if (retStatus === 'processing' && hasPickupPhoto && !hasDeliveryPhoto) return 'active';
                                        return 'completed';
                                    }
                                    if (stepIndex === 6) {
                                        if (['pending', 'approved', 'processing'].includes(retStatus) && !hasPickupPhoto) return 'pending';
                                        if (retStatus === 'processing' && hasPickupPhoto && !hasDeliveryPhoto) return 'active';
                                        return 'completed';
                                    }
                                    if (stepIndex === 7) {
                                        if (retStatus === 'completed') return 'completed';
                                        return 'pending';
                                    }
                                    return 'pending';
                                };

                                const formatReturnDate = (dateString) => {
                                    if (!dateString) return '';
                                    const date = new Date(dateString);
                                    if (isNaN(date.getTime())) return '';
                                    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
                                };

                                const returnSteps = [
                                    {
                                        label: 'Requested',
                                        subtitle: 'Submitted by you',
                                        icon: Package,
                                        date: order.returnRequest.createdAt,
                                        state: getReturnStepState(1)
                                    },
                                    {
                                        label: 'Approved',
                                        subtitle: 'Vendor approved',
                                        icon: ThumbsUp,
                                        date: ['approved', 'processing', 'completed'].includes(retStatus) ? order.returnRequest.updatedAt : null,
                                        state: getReturnStepState(2)
                                    },
                                    {
                                        label: 'Assigned',
                                        subtitle: 'Partner assigned',
                                        icon: UserCheck,
                                        date: ['processing', 'completed'].includes(retStatus) && hasRider ? order.returnRequest.updatedAt : null,
                                        state: getReturnStepState(3)
                                    },
                                    {
                                        label: 'Arrived',
                                        subtitle: 'Rider reached',
                                        icon: MapPin,
                                        date: ['processing', 'completed'].includes(retStatus) && hasRider ? order.returnRequest.updatedAt : null,
                                        state: getReturnStepState(4)
                                    },
                                    {
                                        label: 'Picked Up',
                                        subtitle: 'Product collected',
                                        icon: ShieldCheck,
                                        date: hasPickupPhoto || retStatus === 'completed' ? order.returnRequest.updatedAt : null,
                                        state: getReturnStepState(5)
                                    },
                                    {
                                        label: 'At Store',
                                        subtitle: 'Reached vendor',
                                        icon: Store,
                                        date: hasPickupPhoto || retStatus === 'completed' ? order.returnRequest.updatedAt : null,
                                        state: getReturnStepState(6)
                                    },
                                    {
                                        label: 'Completed',
                                        subtitle: 'Refund processed',
                                        icon: CheckCircle2,
                                        date: retStatus === 'completed' ? order.returnRequest.updatedAt : null,
                                        state: getReturnStepState(7)
                                    }
                                ];

                                return (
                                    <div className="w-full">
                                        {retStatus === 'rejected' ? (
                                            <div className="text-center py-6 bg-red-50 rounded-2xl border border-red-100/50">
                                                <p className="text-red-500 text-xs font-black uppercase tracking-widest">Return Request Rejected</p>
                                                <p className="text-slate-500 text-[10px] font-bold mt-1">
                                                    Reason: {order.returnRequest.rejectionReason || 'Does not meet store guidelines.'}
                                                </p>
                                            </div>
                                        ) : (
                                            <div>
                                                {/* DESKTOP HORIZONTAL TIMELINE */}
                                                <div className="hidden lg:flex items-center justify-between relative px-2 py-6">
                                                    {/* Background track line */}
                                                    <div className="absolute top-[48px] left-[7%] right-[7%] h-[3px] bg-slate-100 z-0 rounded-full" />

                                                    {/* Completed track line */}
                                                    {(() => {
                                                        const completedSteps = returnSteps.filter(s => s.state === 'completed').length;
                                                        let widthPercentage = '0%';
                                                        if (completedSteps >= 7) widthPercentage = '100%';
                                                        else if (completedSteps === 6) widthPercentage = '83.33%';
                                                        else if (completedSteps === 5) widthPercentage = '66.66%';
                                                        else if (completedSteps === 4) widthPercentage = '50%';
                                                        else if (completedSteps === 3) widthPercentage = '33.33%';
                                                        else if (completedSteps === 2) widthPercentage = '16.66%';
                                                        else if (completedSteps === 1) widthPercentage = '0%';

                                                        return (
                                                            <div
                                                                className="absolute top-[48px] left-[7%] h-[3px] bg-amber-500 z-0 rounded-full transition-all duration-700 ease-out"
                                                                style={{ width: `calc(${widthPercentage} * 0.86)` }}
                                                            />
                                                        );
                                                    })()}

                                                    {returnSteps.map((step, idx) => {
                                                        const Icon = step.icon;
                                                        const isCompleted = step.state === 'completed';
                                                        const isActive = step.state === 'active';

                                                        return (
                                                            <div key={idx} className="flex flex-col items-center flex-1 relative z-10">
                                                                {/* Step Node */}
                                                                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-500 relative ${isCompleted
                                                                    ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/20'
                                                                    : isActive
                                                                        ? 'bg-slate-900 text-white shadow-xl shadow-slate-900/30 scale-110'
                                                                        : 'bg-slate-50 text-slate-300 border border-slate-100'
                                                                    }`}>
                                                                    <Icon size={20} strokeWidth={2.2} />

                                                                    {/* Pulse ring for active status */}
                                                                    {isActive && (
                                                                        <div className="absolute inset-0 rounded-2xl border-2 border-slate-950 animate-ping opacity-70" />
                                                                    )}
                                                                </div>

                                                                {/* Labels */}
                                                                <div className="text-center mt-3 max-w-[100px]">
                                                                    <p className={`text-[10px] font-black tracking-wide uppercase ${isCompleted ? 'text-amber-600' : isActive ? 'text-slate-900' : 'text-slate-400'}`}>
                                                                        {step.label}
                                                                    </p>
                                                                    <p className="text-[8px] text-slate-400 font-bold leading-tight mt-0.5">{step.subtitle}</p>
                                                                    {step.date && (
                                                                        <span className="inline-block mt-1 bg-slate-50 border border-slate-100 text-slate-500 text-[8px] font-bold px-1.5 py-0.5 rounded-md uppercase tracking-wider">
                                                                            {formatReturnDate(step.date)}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>

                                                {/* MOBILE VERTICAL TIMELINE */}
                                                <div className="lg:hidden space-y-6 py-2 px-1">
                                                    {returnSteps.map((step, idx) => {
                                                        const Icon = step.icon;
                                                        const isCompleted = step.state === 'completed';
                                                        const isActive = step.state === 'active';

                                                        return (
                                                            <div key={idx} className="flex gap-4 relative">
                                                                {/* Timeline Vertical line */}
                                                                {idx !== returnSteps.length - 1 && (
                                                                    <div className={`absolute left-5 top-10 w-[2px] h-12 z-0 ${isCompleted ? 'bg-amber-500' : 'bg-slate-100'
                                                                        }`} />
                                                                )}

                                                                {/* Icon container */}
                                                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 z-10 transition-all duration-300 relative ${isCompleted
                                                                    ? 'bg-amber-500 text-white shadow-md'
                                                                    : isActive
                                                                        ? 'bg-slate-900 text-white shadow-lg scale-105'
                                                                        : 'bg-slate-50 text-slate-300 border border-slate-100'
                                                                    }`}>
                                                                    <Icon size={18} strokeWidth={2.2} />
                                                                    {isActive && (
                                                                        <div className="absolute inset-0 rounded-xl border-2 border-slate-900 animate-ping opacity-60" />
                                                                    )}
                                                                </div>

                                                                {/* Content */}
                                                                <div className="flex-1 pt-1">
                                                                    <div className="flex items-start justify-between">
                                                                        <div>
                                                                            <h4 className={`text-[12px] font-black uppercase tracking-wider ${isActive ? 'text-slate-900' : isCompleted ? 'text-slate-700' : 'text-slate-400'
                                                                                }`}>
                                                                                {step.label}
                                                                            </h4>
                                                                            <p className="text-[10px] text-slate-400 font-bold leading-tight mt-0.5">{step.subtitle}</p>
                                                                        </div>
                                                                        {step.date && (
                                                                            <span className="shrink-0 bg-slate-50 border border-slate-100 text-slate-500 text-[8px] font-bold px-1.5 py-0.5 rounded-md uppercase tracking-wider">
                                                                                {formatReturnDate(step.date)}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })()}
                        </div>
                    )}

                    {/* Return Request & UPI Info */}
                    {order.returnRequest && !isTryAndBuy && (
                        <div className="bg-amber-50 rounded-2xl border border-amber-200 p-4 shadow-sm font-bold mt-4">
                            <h3 className="text-[10px] md:text-sm font-bold uppercase mb-2 flex items-center gap-2 text-amber-700">
                                <RefreshCw size={14} /> Return Request Details
                            </h3>
                            <div className="space-y-2 text-xs text-amber-900">
                                <div className="flex justify-between">
                                    <span>Status:</span>
                                    <span className="uppercase text-amber-800">{order.returnRequest.status}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span>Reason:</span>
                                    <span>{order.returnRequest.reason}</span>
                                </div>

                                {order.returnRequest.pickupOtpDebug && order.returnRequest.status !== 'completed' && (
                                    <div className="mt-4 p-4 bg-white/80 backdrop-blur-sm rounded-2xl border border-amber-300 border-dashed text-center shadow-inner">
                                        <p className="text-[10px] font-black uppercase text-amber-800 mb-1 tracking-widest flex items-center justify-center gap-1.5">
                                            <ShieldCheck size={12} className="text-amber-700 animate-pulse" /> Return Verification Code
                                        </p>
                                        <p className="text-2xl font-black text-amber-900 tracking-[0.2em] pl-2">{order.returnRequest.pickupOtpDebug}</p>
                                        <p className="text-[9px] text-amber-700/80 font-medium leading-tight mt-1">
                                            Share this OTP with the pickup partner only after they verify your return items.
                                        </p>
                                    </div>
                                )}

                                {order.returnRequest.isUpiRequested && (
                                    <div className="mt-3 pt-3 border-t border-amber-200">
                                        {order.returnRequest.upiId ? (
                                            <div className="flex justify-between items-center bg-white p-3 rounded-xl border border-amber-100">
                                                <span className="text-gray-600">UPI ID Submitted:</span>
                                                <span className="text-black font-extrabold break-all">{order.returnRequest.upiId}</span>
                                            </div>
                                        ) : (
                                            <div className="bg-white p-3 rounded-xl border border-amber-100 space-y-2">
                                                <p className="text-gray-700 text-[10px] font-bold uppercase">Submit UPI ID for Refund</p>
                                                <div className="flex gap-2">
                                                    <input
                                                        type="text"
                                                        value={userUpiId}
                                                        onChange={(e) => setUserUpiId(e.target.value)}
                                                        placeholder="example@upi"
                                                        className="flex-1 min-w-0 px-3 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-black"
                                                    />
                                                    <button
                                                        onClick={handleSubmitUpi}
                                                        disabled={isSubmittingUpi}
                                                        className="shrink-0 px-4 py-2 bg-black text-white rounded-lg text-[10px] font-bold uppercase hover:bg-gray-800 disabled:bg-gray-300 transition-colors"
                                                    >
                                                        {isSubmittingUpi ? '...' : 'Submit'}
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Action Buttons */}
                    <div className="flex flex-col sm:flex-row gap-2 mt-4">
                        {canCancelOrder && (
                            <button
                                onClick={() => {
                                    setCancelReason('');
                                    setCustomCancelReason('');
                                    setCancelStep(1);
                                    setShowCancelModal(true);
                                }}
                                className="flex-1 py-3 bg-white text-red-600 border-2 border-red-200 rounded-xl font-bold text-[10px] uppercase hover:bg-red-50 hover:border-red-400 transition-all active:scale-95 flex items-center justify-center gap-2"
                            >
                                <X size={14} />
                                Cancel Order
                            </button>
                        )}
                        {needsSupportToCancel && (
                            <button
                                onClick={() => navigate(`/support?orderId=${orderId || order?.orderId}`)}
                                className="flex-1 py-3 bg-white text-amber-600 border-2 border-amber-200 rounded-xl font-bold text-[10px] uppercase hover:bg-amber-50 hover:border-amber-400 transition-all active:scale-95 flex items-center justify-center gap-2"
                            >
                                <MessageSquare size={14} />
                                Request Cancellation
                            </button>
                        )}
                        <button
                            onClick={() => navigate(`/track-order/${orderId}`)}
                            className="flex-1 py-3 bg-black text-white rounded-xl font-bold text-[10px] uppercase hover:bg-gray-800 transition-all active:scale-95"
                        >
                            Track Live Order
                        </button>

                        {(() => {
                            const isDelivered = order.status?.toLowerCase() === 'delivered';
                            const deliveredTime = order.deliveredAt ? new Date(order.deliveredAt).getTime() : 0;
                            const now = new Date().getTime();
                            const isWithin24h = deliveredTime && (now - deliveredTime) < (24 * 60 * 60 * 1000);
                            const isTryAndBuyOrder = order.orderType === 'try_and_buy';
                            const hasExistingReturn = !!order.returnRequest;



                            // Check & Buy or regular — show standard return button
                            if (isDelivered && isWithin24h && !isTryAndBuyOrder && !hasExistingReturn) {
                                return (
                                    <button
                                        onClick={() => {
                                            setSelectedReturnItems({});
                                            setPerItemReasons({});
                                            setReturnReason('');
                                            setShowReturnModal(true);
                                        }}
                                        className="flex-1 py-3 bg-white text-black border-2 border-black rounded-xl font-bold text-[11px] uppercase hover:bg-black hover:text-white transition-all active:scale-95 flex items-center justify-center gap-2"
                                    >
                                        <RefreshCcw size={14} />
                                        Return Items
                                    </button>
                                );
                            }
                            return null;
                        })()}

                        {order.status?.toLowerCase() === 'return requested' && (
                            <div className="flex-1 py-3 bg-amber-50 text-amber-700 rounded-xl font-bold text-[11px] uppercase  border border-amber-200 flex items-center justify-center gap-2">
                                <Clock size={14} />
                                Return Under Review
                            </div>
                        )}
                    </div>
                </div>

                {/* Delivery Rating Card */}
                {order.status?.toLowerCase() === 'delivered' && (order.deliveryBoyId || order.assignedDeliveryBoy) && (
                    <DeliveryRatingCard 
                        orderId={order._id || orderId} 
                        deliveryBoyId={typeof order.deliveryBoyId === 'object' ? (order.deliveryBoyId?._id || order.deliveryBoyId?.id) : (order.deliveryBoyId || (typeof order.assignedDeliveryBoy === 'object' ? (order.assignedDeliveryBoy?._id || order.assignedDeliveryBoy?.id) : order.assignedDeliveryBoy))}
                        deliveryBoyName={order.deliveryBoyId?.name || order.assignedDeliveryBoy?.name || 'Your Rider'}
                        deliveryBoyAvatar={order.deliveryBoyId?.avatar || order.assignedDeliveryBoy?.avatar}
                    />
                )}
            </div>



            {/* Return Request Modal */}
            {showReturnModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-300 max-h-[90vh] flex flex-col">
                        <div className="p-6 border-b border-gray-100 flex items-center justify-between shrink-0">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-amber-100 text-amber-600 rounded-xl">
                                    <AlertTriangle size={20} />
                                </div>
                                <h3 className="text-lg font-bold uppercase ">Return Request</h3>
                            </div>
                            <button
                                onClick={() => setShowReturnModal(false)}
                                className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <div className="p-6 space-y-4 overflow-y-auto flex-1">
                            <p className="text-sm font-bold text-gray-500">
                                {showItemLevelReturn
                                    ? <>Select items to return from order <span className="text-black">#{order.id}</span>. Choose a reason for each item.</>
                                    : <>Please select a reason for returning the items in order <span className="text-black">#{order.id}</span>.</>
                                }
                            </p>

                            {/* Per-product selection for multi-vendor orders */}
                            {showItemLevelReturn ? (
                                <div className="space-y-3">
                                    {/* Product selection with per-item reason */}
                                    {order.items.map((item, idx) => {
                                        const rawProductId = typeof item.productId === 'object' ? (item.productId?._id || item.productId?.id) : item.productId;
                                        const itemId = String(item._id || item.id || rawProductId || idx);
                                        const isSelected = !!selectedReturnItems[itemId];
                                        const itemReason = perItemReasons[itemId] || '';
                                        return (
                                            <div key={idx} className={`rounded-2xl border-2 transition-all overflow-hidden ${
                                                isSelected ? 'border-black bg-white shadow-sm' : 'border-gray-100 hover:border-gray-200'
                                            }`}>
                                                {/* Product row with checkbox */}
                                                <label className="flex items-center gap-3 p-3 cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        checked={isSelected}
                                                        onChange={(e) => {
                                                            setSelectedReturnItems(prev => ({
                                                                ...prev,
                                                                [itemId]: e.target.checked ? { productId: rawProductId, quantity: item.quantity, itemId: itemId } : undefined
                                                            }));
                                                            if (!e.target.checked) {
                                                                setPerItemReasons(prev => {
                                                                    const next = { ...prev };
                                                                    delete next[itemId];
                                                                    return next;
                                                                });
                                                            }
                                                        }}
                                                        className="w-4 h-4 accent-black rounded shrink-0"
                                                    />
                                                    <div className="w-10 h-12 bg-gray-50 rounded-lg overflow-hidden shrink-0 border border-gray-100">
                                                        <img src={item.image} alt="" className="w-full h-full object-cover" />
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-[11px] font-bold text-gray-900 line-clamp-1">{item.name}</p>
                                                        <p className="text-[9px] font-bold text-gray-400 uppercase">Qty: {item.quantity} • ₹{item.price}</p>
                                                    </div>
                                                </label>

                                                {/* Per-item reason selector - shown when product is selected */}
                                                {isSelected && (
                                                    <div className="px-3 pb-3 pt-0">
                                                        <p className="text-[9px] font-bold text-gray-400 uppercase mb-1.5 ml-1">Select reason for this item</p>
                                                        <div className="space-y-1">
                                                            {RETURN_REASONS.map((reason, rIdx) => (
                                                                <label
                                                                    key={rIdx}
                                                                    className={`flex items-center gap-2 p-2 rounded-xl border transition-all cursor-pointer text-[10px] ${
                                                                        itemReason === reason
                                                                            ? 'border-black bg-gray-50 font-bold text-black'
                                                                            : 'border-gray-100 hover:border-gray-200 text-gray-600'
                                                                    }`}
                                                                >
                                                                    <input
                                                                        type="radio"
                                                                        name={`reason-${itemId}`}
                                                                        value={reason}
                                                                        checked={itemReason === reason}
                                                                        onChange={() => setPerItemReasons(prev => ({ ...prev, [itemId]: reason }))}
                                                                        className="w-3 h-3 accent-black"
                                                                    />
                                                                    {reason}
                                                                </label>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                /* Single-vendor: original reason-only selector */
                                <div className="space-y-2">
                                    {RETURN_REASONS.map((reason, idx) => (
                                        <label
                                            key={idx}
                                            className={`flex items-center gap-3 p-3 rounded-2xl border-2 transition-all cursor-pointer ${returnReason === reason ? 'border-black bg-white' : 'border-gray-100 hover:border-gray-200'}`}
                                        >
                                            <input
                                                type="radio"
                                                name="returnReason"
                                                value={reason}
                                                checked={returnReason === reason}
                                                onChange={(e) => setReturnReason(e.target.value)}
                                                className="w-4 h-4 accent-black"
                                            />
                                            <span className="text-xs font-bold text-gray-700">{reason}</span>
                                        </label>
                                    ))}
                                </div>
                            )}

                            <div className="pt-4 flex gap-3">
                                <button
                                    onClick={() => setShowReturnModal(false)}
                                    className="flex-1 py-3 bg-gray-100 text-gray-600 rounded-xl font-bold text-[11px] uppercase hover:bg-gray-200 transition-all"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleReturnSubmit}
                                    disabled={showItemLevelReturn
                                        ? (Object.values(selectedReturnItems).filter(Boolean).length === 0 || Object.values(selectedReturnItems).filter(Boolean).some(si => !perItemReasons[si.itemId]) || isSubmitting)
                                        : (!returnReason || isSubmitting)
                                    }
                                    className={`flex-1 py-3 rounded-xl font-bold text-[11px] uppercase  transition-all shadow-lg ${
                                        (showItemLevelReturn
                                            ? (Object.values(selectedReturnItems).filter(Boolean).length === 0 || Object.values(selectedReturnItems).filter(Boolean).some(si => !perItemReasons[si.itemId]) || isSubmitting)
                                            : (!returnReason || isSubmitting)
                                        ) ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-black text-white hover:bg-gray-800 shadow-gray-200'
                                    }`}
                                >
                                    {isSubmitting ? 'Submitting...' : 'Submit Request'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Cancel Order Modal */}
            {showCancelModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-300 max-h-[90vh] flex flex-col">
                        {/* Modal Header */}
                        <div className="p-6 border-b border-gray-100 flex items-center justify-between shrink-0">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-red-100 text-red-600 rounded-xl">
                                    <AlertTriangle size={18} />
                                </div>
                                <h3 className="text-lg font-bold uppercase">{cancelStep === 1 ? 'Cancel Order' : 'Confirm Cancellation'}</h3>
                            </div>
                            <button
                                onClick={() => { setShowCancelModal(false); setCancelStep(1); }}
                                className="p-2 hover:bg-gray-100 rounded-xl transition-all"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        {/* Modal Body */}
                        <div className="p-6 overflow-y-auto flex-1">
                            {cancelStep === 1 ? (
                                <>
                                    <p className="text-xs text-gray-500 font-medium mb-4">Please tell us why you want to cancel this order.</p>
                                    <div className="space-y-2">
                                        {CANCEL_REASONS.map((reason, idx) => (
                                            <label
                                                key={idx}
                                                className={`flex items-center gap-3 p-3 rounded-2xl border-2 transition-all cursor-pointer ${cancelReason === reason ? 'border-red-400 bg-red-50' : 'border-gray-100 hover:border-gray-200'}`}
                                            >
                                                <input
                                                    type="radio"
                                                    name="cancelReason"
                                                    value={reason}
                                                    checked={cancelReason === reason}
                                                    onChange={(e) => setCancelReason(e.target.value)}
                                                    className="w-4 h-4 accent-red-500"
                                                />
                                                <span className="text-xs font-bold text-gray-700">{reason}</span>
                                            </label>
                                        ))}
                                    </div>

                                    {cancelReason === 'Other (Please specify)' && (
                                        <div className="mt-4">
                                            <textarea
                                                value={customCancelReason}
                                                onChange={(e) => setCustomCancelReason(e.target.value)}
                                                placeholder="Please enter your reason (minimum 10 characters)..."
                                                rows={3}
                                                className="w-full px-4 py-3 border-2 border-gray-200 rounded-2xl text-xs font-medium focus:outline-none focus:border-red-400 transition-all resize-none"
                                            />
                                            <p className={`text-[9px] mt-1 font-bold ${customCancelReason.trim().length >= 10 ? 'text-emerald-500' : 'text-gray-400'}`}>
                                                {customCancelReason.trim().length}/10 characters minimum
                                            </p>
                                        </div>
                                    )}

                                    <div className="pt-4 flex gap-3">
                                        <button
                                            onClick={() => { setShowCancelModal(false); setCancelStep(1); }}
                                            className="flex-1 py-3 bg-gray-100 text-gray-600 rounded-xl font-bold text-[11px] uppercase hover:bg-gray-200 transition-all"
                                        >
                                            Go Back
                                        </button>
                                        <button
                                            onClick={() => setCancelStep(2)}
                                            disabled={!cancelReason || (cancelReason === 'Other (Please specify)' && customCancelReason.trim().length < 10)}
                                            className={`flex-1 py-3 rounded-xl font-bold text-[11px] uppercase transition-all shadow-lg ${
                                                (!cancelReason || (cancelReason === 'Other (Please specify)' && customCancelReason.trim().length < 10))
                                                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                                    : 'bg-red-600 text-white hover:bg-red-700 shadow-red-200'
                                            }`}
                                        >
                                            Continue
                                        </button>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div className="text-center py-4">
                                        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                            <AlertTriangle size={28} className="text-red-500" />
                                        </div>
                                        <h4 className="text-base font-bold text-gray-900 mb-2">Are you sure you want to cancel this order?</h4>
                                        <div className="bg-gray-50 rounded-2xl p-4 text-left space-y-2 mt-4">
                                            <div className="flex justify-between text-xs">
                                                <span className="font-bold text-gray-500">Order ID</span>
                                                <span className="font-black text-gray-900">#{order?.orderId || order?.id}</span>
                                            </div>
                                            <div className="flex justify-between text-xs">
                                                <span className="font-bold text-gray-500">Refund Amount</span>
                                                <span className="font-black text-emerald-600">₹{order?.total}</span>
                                            </div>
                                            <div className="flex justify-between text-xs">
                                                <span className="font-bold text-gray-500">Reason</span>
                                                <span className="font-bold text-gray-700 text-right max-w-[200px] truncate">
                                                    {cancelReason === 'Other (Please specify)' ? customCancelReason.trim() : cancelReason}
                                                </span>
                                            </div>
                                        </div>
                                        <p className="text-[10px] text-red-500 font-bold mt-4 uppercase tracking-wider">This action cannot be undone.</p>
                                    </div>

                                    <div className="pt-4 flex gap-3">
                                        <button
                                            onClick={() => { setShowCancelModal(false); setCancelStep(1); }}
                                            disabled={isCancelling}
                                            className="flex-1 py-3 bg-gray-100 text-gray-700 rounded-xl font-bold text-[11px] uppercase hover:bg-gray-200 transition-all"
                                        >
                                            Keep Order
                                        </button>
                                        <button
                                            onClick={handleCancelOrder}
                                            disabled={isCancelling}
                                            className={`flex-1 py-3 rounded-xl font-bold text-[11px] uppercase transition-all shadow-lg ${
                                                isCancelling
                                                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                                    : 'bg-red-600 text-white hover:bg-red-700 shadow-red-200'
                                            }`}
                                        >
                                            {isCancelling ? 'Cancelling...' : 'Confirm Cancellation'}
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Product Review Modal */}
            {reviewItem && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-300 max-h-[90vh] flex flex-col">
                        <div className="p-5 border-b border-gray-100 flex items-center justify-between shrink-0">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-amber-50 text-amber-600 rounded-xl">
                                    <Star size={18} />
                                </div>
                                <div>
                                    <h3 className="text-base font-bold uppercase">Write a Review</h3>
                                    <p className="text-[10px] text-gray-400 font-bold line-clamp-1">{reviewItem.name}</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setReviewItem(null)}
                                className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                            >
                                <X size={20} />
                            </button>
                        </div>
                        <div className="p-5 overflow-y-auto flex-1">
                            <div className="flex items-center gap-3 mb-4 p-3 bg-gray-50 rounded-2xl border border-gray-100">
                                <div className="w-14 h-18 bg-white rounded-lg overflow-hidden shrink-0 border border-gray-100">
                                    <img src={reviewItem.image} alt="" className="w-full h-full object-cover" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h4 className="text-[12px] font-bold text-gray-900 line-clamp-1">{reviewItem.name}</h4>
                                    <p className="text-[9px] font-bold text-gray-400 uppercase">{reviewItem.brand || 'Premium Piece'}</p>
                                    <p className="text-[11px] font-bold text-black mt-0.5">₹{reviewItem.discountedPrice || reviewItem.price}</p>
                                </div>
                            </div>
                            <ReviewForm
                                productId={String(reviewItem.productId || reviewItem.id || reviewItem._id)}
                                onSubmit={handleSubmitProductReview}
                            />
                        </div>
                    </div>
                </div>
            )}

            {/* No Partner Popup Modal */}
            {noPartnerMsg && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl p-6 shadow-2xl max-w-sm w-full text-center relative overflow-hidden animate-in zoom-in duration-300">
                        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-orange-400 to-red-500" />
                        <div className="w-16 h-16 bg-red-100 text-red-500 rounded-full flex items-center justify-center text-3xl mx-auto mb-4">
                            😔
                        </div>
                        <h3 className="text-xl font-bold text-gray-900 mb-2">Order Cancelled</h3>
                        <p className="text-sm text-gray-600 mb-6 leading-relaxed">
                            {noPartnerMsg}
                        </p>
                        <button 
                            onClick={() => setNoPartnerMsg('')}
                            className="w-full py-3 bg-gray-100 text-gray-800 font-bold rounded-xl hover:bg-gray-200 transition-colors"
                        >
                            Got it
                        </button>
                    </div>
                </div>
            )}
        </AccountLayout>
    );
};

export default OrderDetailsPage;
