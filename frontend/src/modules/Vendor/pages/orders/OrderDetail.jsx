import api from '../../../../shared/utils/api';
import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
    FiArrowLeft,
    FiPackage,
    FiMapPin,
    FiUser,
    FiDollarSign,
    FiCamera,
    FiTruck,
    FiPrinter,
    FiDownload,
    FiX
} from 'react-icons/fi';
import closhLogo from "../../../../shared/assets/closh_logo.svg";
import { motion, AnimatePresence } from 'framer-motion';
import { useVendorAuthStore } from '../../store/vendorAuthStore';
import { getVendorOrderById, updateVendorOrderStatus } from '../../services/vendorService';
import { formatPrice, getItemStatusBadge, getVendorLineTotals, getLineAmount } from '../../../../shared/utils/helpers';
import { formatVariantLabel } from '../../../../shared/utils/variant';
import Badge from '../../../../shared/components/Badge';
import AnimatedSelect from '../../../Admin/components/AnimatedSelect';

// CLOSH official address used on all vendor invoices
const CLOSH_ADDRESS = "CLOSH Headquarters, 123 Business Avenue, Mumbai, Maharashtra, 400001, India";
import toast from 'react-hot-toast';
import socketService from '../../../../shared/utils/socket';

import { IMAGE_BASE_URL } from '../../../../shared/utils/constants';

const getFullImageUrl = (image) => {
    if (!image) return null;
    if (image.startsWith('http') || image.startsWith('data:')) return image;
    const cleanImage = image.startsWith('/') ? image : `/${image}`;
    return `${IMAGE_BASE_URL}${cleanImage}`;
};

const getPaymentStatusDisplay = (order, currentStatus) => {
    const status = String(order?.status || '').toLowerCase();
    const vendorStatus = String(currentStatus || '').toLowerCase();
    if (status === 'cancelled' || vendorStatus === 'cancelled') {
        if (order?.paymentStatus !== 'paid' && order?.paymentStatus !== 'refunded') {
            return 'CANCELLED';
        }
    }
    return order?.paymentStatus?.replace(/_/g, ' ')?.toUpperCase() || 'PENDING';
};

const getPaymentStatusVariant = (order, currentStatus) => {
    const status = String(order?.status || '').toLowerCase();
    const vendorStatus = String(currentStatus || '').toLowerCase();
    if (status === 'cancelled' || vendorStatus === 'cancelled') {
        if (order?.paymentStatus !== 'paid' && order?.paymentStatus !== 'refunded') {
            return 'cancelled';
        }
    }
    return order?.paymentStatus === 'paid' ? 'delivered' : 'pending';
};

const OrderDetail = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { vendor } = useVendorAuthStore();

    const [taxSettings, setTaxSettings] = useState(null);
    const [order, setOrder] = useState(null);
    const [loading, setLoading] = useState(true);
    const [updatingStatus, setUpdatingStatus] = useState(false);

    const vendorId = vendor?.id || vendor?._id;
    const shippingAddress = order?.shippingAddress ?? order?.address ?? null;
    const customerName =
        order?.customer?.name ??
        order?.userId?.name ??
        order?.guestInfo?.name ??
        order?.shippingAddress?.name ??
        order?.address?.name ??
        'Guest';
    const customerEmail =
        order?.customer?.email ??
        order?.userId?.email ??
        order?.guestInfo?.email ??
        order?.shippingAddress?.email ??
        order?.address?.email ??
        'N/A';
    const customerPhone =
        order?.customer?.phone ??
        order?.userId?.phone ??
        order?.guestInfo?.phone ??
        order?.shippingAddress?.phone ??
        order?.address?.phone ??
        order?.shippingAddress?.mobile ??
        'N/A';

    useEffect(() => {
        if (!id || !vendorId) return;

        const fetchOrder = async () => {
            setLoading(true);
            try {
                const res = await getVendorOrderById(id);
                const data = res?.data ?? res;
                setOrder(data ?? null);
            } catch {
                // api.js shows toast
                setOrder(null);
            } finally {
                setLoading(false);
            }
        };

        fetchOrder();
        api.get('/settings/tax')
            .then(res => setTaxSettings(res?.data || res))
            .catch(err => console.error("Failed to load tax settings", err));
        

        // Real-time socket updates (connection managed by VendorHeader)
        if (id) {
            socketService.joinRoom(`order_${id}`);
        }

        const handleRealTimeUpdate = (data) => {
            const displayId = id;
            if (data.orderId === displayId) {
                fetchOrder();
            }
        };

        socketService.on('order_picked_up', handleRealTimeUpdate);
        socketService.on('order_delivered', handleRealTimeUpdate);
        socketService.on('order_status_updated', handleRealTimeUpdate);
        socketService.on('return_rider_arrived', handleRealTimeUpdate);

        return () => {
            socketService.off('order_picked_up');
            socketService.off('order_delivered');
            socketService.off('order_status_updated');
            socketService.off('return_rider_arrived');
        };
    }, [id, vendorId]);

    const handleStatusChange = async (newStatus) => {
        if (!order) return;

        // Verify the order ID exists
        const orderId = order.orderId ?? order._id;
        if (!orderId) {
            toast.error('Order ID is missing. Cannot update status.');
            return;
        }

        // Verify the status is valid
        if (!newStatus || typeof newStatus !== 'string') {
            toast.error('Invalid status selected.');
            return;
        }

        console.log('🔵 Sending status update request:', { orderId, newStatus });

        setUpdatingStatus(true);
        try {
            const response = await updateVendorOrderStatus(orderId, newStatus);
            console.log('✅ Status update response:', response);

            // Optimistically update local state
            setOrder((prev) => ({
                ...prev,
                vendorItems: prev.vendorItems?.map((vi) => {
                    const vId = vi.vendorId?._id || vi.vendorId;
                    return vId?.toString() === vendorId?.toString()
                        ? { ...vi, status: newStatus }
                        : vi;
                }),
                status: newStatus,
            }));
            toast.success(`Order status updated to ${newStatus}`);
        } catch (error) {
            // Show specific error message from API
            const errorDetails = {
                message: error?.response?.data?.message || error?.message || 'Failed to update order status',
                status: error?.response?.status,
                data: error?.response?.data,
                fullError: error
            };

            console.error('❌ Status update error:', errorDetails);
            toast.error(errorDetails.message);
        } finally {
            setUpdatingStatus(false);
        }
    };

    const statusOptions = [
        { value: 'pending', label: 'Pending', color: 'yellow' },
        { value: 'accepted', label: 'Accepted (Start Preparing)', color: 'blue' },
        { value: 'ready_for_pickup', label: 'Ready for Pickup', color: 'indigo' },
        { value: 'picked_up', label: 'Picked Up by Rider', color: 'purple' },
        { value: 'out_for_delivery', label: 'Out for Delivery', color: 'orange' },
        { value: 'delivered', label: 'Delivered', color: 'green' },
        { value: 'cancelled', label: 'Cancelled', color: 'red' },
    ];

    const transitionMap = {
        pending: ['accepted', 'cancelled'],
        accepted: ['ready_for_pickup', 'cancelled'],
        ready_for_pickup: ['ready_for_pickup'], // Moving to picked_up is handled by delivery partner
        picked_up: ['picked_up'],
        out_for_delivery: ['out_for_delivery'],
        delivered: ['delivered'],
        cancelled: ['cancelled'],
    };

    // Derive per-vendor status from vendorItems
    const vendorItem = order?.vendorItems?.find((vi) => {
        const vId = vi.vendorId?._id || vi.vendorId;
        return vId?.toString() === vendorId?.toString();
    });
    let currentStatus = String(vendorItem?.status ?? order?.status ?? 'pending').toLowerCase();
    if (['returned', 'return requested', 'cancelled', 'canceled'].includes(String(order?.status || '').toLowerCase())) {
        currentStatus = String(order?.status || '').toLowerCase();
    }
    const allowedStatuses = transitionMap[currentStatus] || [currentStatus];
    const visibleStatusOptions = statusOptions.filter((option) =>
        allowedStatuses.includes(option.value)
    );

    // Items this vendor sold in this order
    const vendorItems = vendorItem?.items ?? [];
    const vendorSubtotal = vendorItem?.items?.reduce((sum, it) => sum + (it.vendorPrice ?? it.price ?? 0) * (it.quantity ?? 1), 0) ??
                          vendorItem?.basePrice ?? 0;
    const lineTotals = getVendorLineTotals(vendorItems);

    const [showInvoice, setShowInvoice] = useState(false);
    const [showCommissionInvoice, setShowCommissionInvoice] = useState(false);

    
    const handleViewCommissionInvoice = () => {
        if (!order) return;
        const invoiceWindow = window.open('', '_blank');
        if (!invoiceWindow) {
            toast.error('Please allow popups to view the invoice.');
            return;
        }

        const invoiceDate = new Date(order.createdAt || order.date || Date.now()).toLocaleDateString('en-IN', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });

        const invoiceContent = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <title>Commission Invoice #${order.orderId || order._id}</title>
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
                <div class="header-title">Commission Invoice</div>
                
                <div class="top-section">
                    <div class="sold-by-info">
                        <div class="info-text"><span class="bold">Billed From (Platform):</span> CLOSH Marketplace</div>
                        <div class="info-text"><span class="bold">Address:</span> CLOSH Headquarters, 123 Business Avenue, Mumbai, Maharashtra, 400001, India</div>
                        <div class="info-text"><span class="bold">State:</span> ${taxSettings?.closhBusinessState || 'Maharashtra'}</div>
                    </div>
                    <div class="invoice-info">
                        <div class="info-text"><span class="bold">Invoice Number:</span> COMM-${order.orderId || order._id}</div>
                    </div>
                </div>

                <div class="addresses-box">
                    <div class="address-col" style="flex: 1.2;">
                        <div class="info-text"><span class="bold">Order ID:</span> #${order.orderId || order._id}</div>
                        <div class="info-text"><span class="bold">Order Date:</span> ${new Date(order.createdAt || order.date || Date.now()).toLocaleDateString('en-CA')}</div>
                        <div class="info-text"><span class="bold">Invoice Date:</span> ${new Date().toLocaleDateString('en-CA')}</div>
                    </div>
                    <div class="address-col" style="flex: 1;">
                        <div class="address-title">Billed To (Vendor):</div>
                        <div>${vendor?.storeName || 'Vendor'}</div>
                        <div>${vendor?.shopAddress || 'Vendor Address'}</div>
                        <div>GSTIN: ${vendor?.gstNumber || 'N/A'}</div>
                    </div>
                </div>

                <table class="table">
                    <thead>
                        <tr>
                            <th class="text-left" style="width: 25%;">Service Description</th>
                            <th>Commission Amount</th>
                            <th>GST Rate</th>
                            <th>CGST</th>
                            <th>SGST/UTGST</th>
                            <th>IGST</th>
                            <th>Total Amount</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${(() => {
                            const commAmount = vendorItem?.commissionAmount || 0;
                            // GST rules are for products, but user asked for dynamic GST.
                            // If they meant GST on commission, usually it's standard 18%.
                            // We will use the dynamic gst config logic based on commission amount, or 18% fallback if no rules.
                            const rules = taxSettings?.gstRules || [];
                            const applicableRule = rules.find(r => commAmount >= r.minPrice && commAmount <= r.maxPrice);
                            const gstRate = applicableRule ? applicableRule.rate : 18;
                            
                            // It says "GST will be inclusive" in settings, but for commissions it's typically exclusive.
                            // However user said "because uss pr gst rahega jaisa user k iss me hai", implying inclusive calculation.
                            const taxableValue = commAmount / (1 + (gstRate/100));
                            const gstAmount = commAmount - taxableValue;
                            const itemCgst = gstAmount / 2;
                            const itemSgst = gstAmount / 2;
                            const itemIgst = 0;
                            
                            return `
                                <tr>
                                    <td class="text-left">Platform Services Commission (Order #${order.orderId || order._id})</td>
                                    <td>${commAmount.toFixed(2)}</td>
                                    <td>${gstRate}%</td>
                                    <td>${itemCgst.toFixed(2)}</td>
                                    <td>${itemSgst.toFixed(2)}</td>
                                    <td>${itemIgst.toFixed(2)}</td>
                                    <td>${commAmount.toFixed(2)}</td>
                                </tr>
                            `;
                        })()}
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
            

    const handleViewCustomerInvoice = () => {
        if (!order) return;
        const invoiceWindow = window.open('', '_blank');
        if (!invoiceWindow) {
            toast.error('Please allow popups to view the invoice.');
            return;
        }

        const invoiceDate = new Date(order.createdAt || order.date || Date.now()).toLocaleDateString('en-IN', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });

        const addr = order.shippingAddress || order.address || {};
        const customerName = order.customer?.name || order.userId?.name || order.guestInfo?.name || 'Guest';
        const shippingNameRaw = addr.name || '';
        const custName = ['home', 'work', 'other'].includes(shippingNameRaw.toLowerCase()) ? customerName : (shippingNameRaw || customerName);
        const couponCode = order.couponCode || '';
        const couponDiscount = Number(order.couponDiscount || 0);
        const itemsGrandTotal = vendorItems.reduce((s, i) => s + (i.price ?? 0) * (i.quantity || 1), 0);

        const invoiceContent = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <title>Customer Tax Invoice #${order.orderId || order._id}</title>
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
                <div class="header-title">Customer Tax Invoice</div>
                
                <div class="top-section">
                    <div class="sold-by-info">
                        <div class="info-text"><span class="bold">Sold By:</span> ${vendor?.storeName || 'Vendor'}</div>
                        <div class="info-text"><span class="bold">GSTIN:</span> ${vendor?.gstNumber || 'N/A'}</div>
                        <div class="info-text"><span class="bold">Ship-from Address:</span> ${vendor?.shopAddress || 'Vendor Address'}</div>
                    </div>
                    <div class="invoice-info">
                        <div class="info-text"><span class="bold">Invoice Number:</span> INV-${order.orderId || order._id}</div>
                    </div>
                </div>

                <div class="addresses-box">
                    <div class="address-col" style="flex: 1.2;">
                        <div class="info-text"><span class="bold">Order ID:</span> #${order.orderId || order._id}</div>
                        <div class="info-text"><span class="bold">Order Date:</span> ${new Date(order.createdAt || order.date || Date.now()).toLocaleDateString('en-CA')}</div>
                        <div class="info-text"><span class="bold">Invoice Date:</span> ${new Date().toLocaleDateString('en-CA')}</div>
                    </div>
                    <div class="address-col" style="flex: 1;">
                        <div class="address-title">Billing To:</div>
                        <div>${custName}</div>
                        <div>${addr.address || addr.street || ''}, ${addr.locality || ''}</div>
                        <div>${addr.city || ''}, ${addr.state || ''} - ${addr.zipCode || addr.pincode || ''}</div>
                    </div>
                    <div class="address-col" style="flex: 1;">
                        <div class="address-title">Shipping To:</div>
                        <div>${custName}</div>
                        <div>${addr.address || addr.street || ''}, ${addr.locality || ''}</div>
                        <div>${addr.city || ''}, ${addr.state || ''} - ${addr.zipCode || addr.pincode || ''}</div>
                    </div>
                </div>

                <table class="table">
                    <thead>
                        <tr>
                            <th class="text-left" style="width: 22%;">Product</th>
                            <th>HSN</th>
                            <th>MRP</th>
                            <th>Qty</th>
                            <th>Gross Amount</th>
                            <th>Discount</th>
                            <th>Taxable Value</th>
                            <th>GST %</th>
                            <th>CGST</th>
                            <th>SGST/UTGST</th>
                            <th>IGST</th>
                            <th>Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${vendorItems.map(item => {
                            const qty = item.quantity || 1;
                            const mrp = item.originalPrice || item.price || 0;
                            const sellingPrice = item.price ?? 0;
                            const totalSellingPrice = sellingPrice * qty;
                            const totalMrp = mrp * qty;
                            
                            const rules = taxSettings?.gstRules || [];
                            const applicableRule = rules.find(r => sellingPrice >= r.minPrice && sellingPrice <= r.maxPrice);
                            const gstRate = applicableRule ? applicableRule.rate : (sellingPrice <= 2500 ? 5 : 18);
                            const taxableValue = totalSellingPrice / (1 + (gstRate/100));
                            const gstAmount = totalSellingPrice - taxableValue;
                            const itemCgst = gstAmount / 2;
                            const itemSgst = gstAmount / 2;
                            const itemIgst = 0;
                            
                            const discount = totalMrp - totalSellingPrice;
                            
                            return `
                                <tr>
                                    <td class="text-left">${item.name} ${item.variant?.size ? '(' + item.variant.size + ')' : ''}</td>
                                    <td>${item.hsnCode || item.productId?.hsnCode || item.product?.hsnCode || 'N/A'}</td>
                                    <td>${mrp.toFixed(2)}</td>
                                    <td>${qty}</td>
                                    <td>${(totalMrp).toFixed(2)}</td>
                                    <td>${discount.toFixed(2)}</td>
                                    <td>${taxableValue.toFixed(2)}</td>
                                    <td>${gstRate}% (Incl.)</td>
                                    <td>${itemCgst.toFixed(2)}</td>
                                    <td>${itemSgst.toFixed(2)}</td>
                                    <td>${itemIgst.toFixed(2)}</td>
                                    <td>${totalSellingPrice.toFixed(2)}</td>
                                </tr>
                            `;
                        }).join('')}
                        
                        <tr class="totals-row">
                            <td colspan="8" class="text-right">Total</td>
                            <td>${(() => {
                                const taxAmount = vendorItems ? vendorItems.reduce((sum, item) => {
            const rules = taxSettings?.gstRules || [];
            const price = item.price ?? 0;
            const rule = rules.find(r => price >= r.minPrice && price <= r.maxPrice);
            const rate = rule ? rule.rate : 5;
            const taxable = (price * (item.quantity || 1)) / (1 + (rate/100));
            return sum + ((price * (item.quantity || 1)) - taxable);
        }, 0) : 0;
                                return (taxAmount / 2).toFixed(2);
                            })()}</td>
                            <td>${(() => {
                                const taxAmount = vendorItems ? vendorItems.reduce((sum, item) => {
            const rules = taxSettings?.gstRules || [];
            const price = item.price ?? 0;
            const rule = rules.find(r => price >= r.minPrice && price <= r.maxPrice);
            const rate = rule ? rule.rate : 5;
            const taxable = (price * (item.quantity || 1)) / (1 + (rate/100));
            return sum + ((price * (item.quantity || 1)) - taxable);
        }, 0) : 0;
                                return (taxAmount / 2).toFixed(2);
                            })()}</td>
                            <td>0.00</td>
                            <td>${itemsGrandTotal.toFixed(2)}</td>
                        </tr>
                        ${couponCode && couponDiscount > 0 ? `
                        <tr>
                            <td colspan="11" class="text-right">Coupon Applied (${couponCode})</td>
                            <td>-${couponDiscount.toFixed(2)}</td>
                        </tr>
                        ` : ''}
                        <tr class="grand-total-row">
                            <td colspan="11" class="text-right">Grand Total (GST Inclusive)</td>
                            <td>${(itemsGrandTotal - couponDiscount).toFixed(2)}</td>
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


const handleViewVendorInvoice = () => {
        if (!order) return;
        const invoiceWindow = window.open('', '_blank');
        if (!invoiceWindow) {
            toast.error('Please allow popups to view the invoice.');
            return;
        }

        const invoiceDate = new Date(order.createdAt || order.date || Date.now()).toLocaleDateString('en-IN', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });

        const addr = order.shippingAddress || order.address || {};
        const customerName = order.customer?.name || order.userId?.name || order.guestInfo?.name || 'Guest';
        const shippingNameRaw = addr.name || '';
        const custName = ['home', 'work', 'other'].includes(shippingNameRaw.toLowerCase()) ? customerName : (shippingNameRaw || customerName);

        const invoiceContent = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <title>Tax Invoice #${order.orderId || order._id}</title>
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
                        <div class="info-text"><span class="bold">Sold By:</span> ${vendor?.storeName || 'Vendor'}</div>
                        <div class="info-text"><span class="bold">GSTIN:</span> ${vendor?.gstNumber || 'N/A'}</div>
                        <div class="info-text"><span class="bold">Ship-from Address:</span> ${vendor?.shopAddress || 'Vendor Address'}</div>
                    </div>
                    <div class="invoice-info">
                        <div class="info-text"><span class="bold">Invoice Number:</span> INV-${order.orderId || order._id}</div>
                    </div>
                </div>

                <div class="addresses-box">
                    <div class="address-col" style="flex: 1.2;">
                        <div class="info-text"><span class="bold">Order ID:</span> #${order.orderId || order._id}</div>
                        <div class="info-text"><span class="bold">Order Date:</span> ${new Date(order.createdAt || order.date || Date.now()).toLocaleDateString('en-CA')}</div>
                        <div class="info-text"><span class="bold">Invoice Date:</span> ${new Date().toLocaleDateString('en-CA')}</div>
                    </div>
                    <div class="address-col" style="flex: 1;">
                        <div class="address-title">Billing To:</div>
                        <div>${custName}</div>
                        <div>${addr.address || addr.street || ''}, ${addr.locality || ''}</div>
                        <div>${addr.city || ''}, ${addr.state || ''} - ${addr.zipCode || addr.pincode || ''}</div>
                    </div>
                    <div class="address-col" style="flex: 1;">
                        <div class="address-title">Shipping To:</div>
                        <div>${custName}</div>
                        <div>${addr.address || addr.street || ''}, ${addr.locality || ''}</div>
                        <div>${addr.city || ''}, ${addr.state || ''} - ${addr.zipCode || addr.pincode || ''}</div>
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
                            <th>GST %</th>
                            <th>CGST</th>
                            <th>SGST/UTGST</th>
                            <th>IGST</th>
                            <th>Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${vendorItems.map(item => {
                            const qty = item.quantity || 1;
                            const mrp = item.originalPrice || item.price || item.vendorPrice || 0;
                            const sellingPrice = item.vendorPrice ?? item.price ?? 0;
                            const totalSellingPrice = sellingPrice * qty;
                            const totalMrp = mrp * qty;
                            
                            const rules = taxSettings?.gstRules || [];
                            const applicableRule = rules.find(r => sellingPrice >= r.minPrice && sellingPrice <= r.maxPrice);
                            const gstRate = applicableRule ? applicableRule.rate : (sellingPrice <= 2500 ? 5 : 18);
                            const taxableValue = totalSellingPrice / (1 + (gstRate/100));
                            const gstAmount = totalSellingPrice - taxableValue;
                            const itemCgst = gstAmount / 2;
                            const itemSgst = gstAmount / 2;
                            const itemIgst = 0;
                            
                            const discount = totalMrp - totalSellingPrice;
                            
                            return `
                                <tr>
                                    <td class="text-left">${item.name} ${item.variant?.size ? '(' + item.variant.size + ')' : ''}</td>
                                    <td>${item.hsnCode || item.productId?.hsnCode || item.product?.hsnCode || 'N/A'}</td>
                                    <td>${mrp.toFixed(2)}</td>
                                    <td>${qty}</td>
                                    <td>${(totalMrp).toFixed(2)}</td>
                                    <td>${discount.toFixed(2)}</td>
                                    <td>${taxableValue.toFixed(2)}</td>
                                    <td>${gstRate}% (Incl.)</td>
                                    <td>${itemCgst.toFixed(2)}</td>
                                    <td>${itemSgst.toFixed(2)}</td>
                                    <td>${itemIgst.toFixed(2)}</td>
                                    <td>${totalSellingPrice.toFixed(2)}</td>
                                </tr>
                            `;
                        }).join('')}
                        <tr class="totals-row">
                            <td colspan="8" class="text-right">Total Base Price</td>
                            <td>${(() => {
                                const taxAmount = vendorItems ? vendorItems.reduce((sum, item) => {
            const rules = taxSettings?.gstRules || [];
            const price = item.vendorPrice ?? item.price ?? 0;
            const rule = rules.find(r => price >= r.minPrice && price <= r.maxPrice);
            const rate = rule ? rule.rate : 5;
            const taxable = (price * (item.quantity || 1)) / (1 + (rate/100));
            return sum + ((price * (item.quantity || 1)) - taxable);
        }, 0) : 0;
                                return (taxAmount / 2).toFixed(2);
                            })()}</td>
                            <td>${(() => {
                                const taxAmount = vendorItems ? vendorItems.reduce((sum, item) => {
            const rules = taxSettings?.gstRules || [];
            const price = item.vendorPrice ?? item.price ?? 0;
            const rule = rules.find(r => price >= r.minPrice && price <= r.maxPrice);
            const rate = rule ? rule.rate : 5;
            const taxable = (price * (item.quantity || 1)) / (1 + (rate/100));
            return sum + ((price * (item.quantity || 1)) - taxable);
        }, 0) : 0;
                                return (taxAmount / 2).toFixed(2);
                            })()}</td>
                            <td>0.00</td>
                            <td>${vendorSubtotal.toFixed(2)}</td>
                        </tr>
                        <tr>
                            <td colspan="11" class="text-right" style="color: #ef4444;">Less: Platform Commission</td>
                            <td style="color: #ef4444;">-${(vendorItem?.commissionAmount || 0).toFixed(2)}</td>
                        </tr>
                        <tr class="grand-total-row">
                            <td colspan="11" class="text-right" style="color: #059669;">Net Earning (GST Inclusive)</td>
                            <td style="color: #059669;">${(vendorItem?.vendorEarnings || (vendorSubtotal - (vendorItem?.commissionAmount || 0))).toFixed(2)}</td>
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

    if (loading) {
        return (
            <div className="p-6 text-center">
                <p className="text-gray-500">Loading order details...</p>
            </div>
        );
    }

    if (!order) {
        return (
            <div className="p-6 text-center space-y-3">
                <p className="text-gray-700 font-semibold">Order not found</p>
                <p className="text-sm text-gray-500">
                    Order #{id} may not belong to your store.
                </p>
                <Link
                    to="/vendor/orders"
                    className="inline-block text-blue-600 hover:underline text-sm"
                >
                    ← Back to Orders
                </Link>
            </div>
        );
    }

    return (
        <>
            {/* Global Print Styles */}
            <style dangerouslySetInnerHTML={{ __html: `
                @media print {
                    body * {
                        visibility: hidden;
                    }
                    #printable-invoice, #printable-invoice * {
                        visibility: visible;
                    }
                    #printable-invoice {
                        position: absolute;
                        left: 0;
                        top: 0;
                        width: 100%;
                        padding: 0 !important;
                        margin: 0 !important;
                    }
                    .no-print {
                        display: none !important;
                    }
                }
            `}} />

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-6"
            >
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <Link
                        to="/vendor/orders"
                        className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                        <FiArrowLeft className="text-gray-600" />
                    </Link>
                    <div>
                        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                            Order #{order.orderId ?? order._id}
                            {order.orderType && (
                                <span className={`px-2 py-0.5 ${order.orderType === 'try_and_buy' ? 'bg-orange-50 text-orange-700 border-orange-100' : 'bg-blue-50 text-blue-700 border-blue-100'} text-[10px] font-bold rounded-lg border uppercase  shadow-sm animate-pulse`}>
                                    {order.orderType.replace(/_/g, ' ')}
                                </span>
                            )}
                        </h1>
                        <p className="text-sm text-gray-500">
                            Placed on{' '}
                            {order.createdAt
                                ? new Date(order.createdAt).toLocaleDateString()
                                : '—'}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    {/* <button
                        onClick={handleViewCustomerInvoice}
                        className="flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm font-bold shadow-sm"
                    >
                        <FiDownload className="text-sm" />
                        Customer Invoice
                    </button> */}
<button
                        onClick={handleViewVendorInvoice}
                        className="flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm font-bold shadow-sm"
                    >
                        <FiDownload className="text-sm" />
                        Vendor Invoice
                    </button>
                    <button
                        onClick={handleViewCommissionInvoice}
                        className="flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm font-bold shadow-sm"
                    >
                        <FiDownload className="text-sm" />
                        Comm. Bill
                    </button>
                    <AnimatedSelect
                        options={visibleStatusOptions}
                        value={currentStatus}
                        onChange={(e) => handleStatusChange(e.target.value)}
                        disabled={updatingStatus}
                        color={
                            visibleStatusOptions.find((opt) => opt.value === currentStatus)
                                ?.color || 'gray'
                        }
                    />
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Main Content */}
                <div className="lg:col-span-2 space-y-6">
                    {/* Order Items */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                        <div className="p-4 border-b border-gray-200">
                            <h2 className="font-semibold text-gray-800 flex items-center gap-2">
                                <FiPackage />
                                Your Items in this Order
                            </h2>
                        </div>
                        <div className="divide-y divide-gray-200">
                            {vendorItems.length > 0 ? (
                                vendorItems.map((item, index) => {
                                  const itemBadge = getItemStatusBadge(item.itemStatus, vendorItem?.status || order.status);
                                  const isVoided = ['Returned', 'Cancelled'].includes(itemBadge?.label);
                                  return (
                                    <div key={index} className="p-4 flex gap-4">
                                        <div className="w-16 h-16 bg-gray-100 rounded-lg overflow-hidden flex-shrink-0">
                                            <img
                                                src={getFullImageUrl(item.image)}
                                                alt={item.name}
                                                className="w-full h-full object-cover"
                                                onError={(e) => {
                                                    e.target.src =
                                                        'https://via.placeholder.com/64?text=P';
                                                }}
                                            />
                                        </div>
                                        <div className="flex-1">
                                            <div className="flex justify-between items-start">
                                                <div>
                                                    <h3 className="font-medium text-gray-800">
                                                        {item.name}
                                                    </h3>
                                                    <div className="flex flex-col gap-1">
                                                        <p className="text-sm text-gray-500">
                                                            Qty: {item.quantity}
                                                        </p>
                                                        {formatVariantLabel(item?.variant) && (
                                                            <p className="text-[11px] text-gray-400 font-medium">
                                                                {formatVariantLabel(item?.variant)}
                                                            </p>
                                                        )}
                                                        {itemBadge && (
                                                            <span className={`self-start text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border leading-none ${itemBadge.className}`}>
                                                                {itemBadge.label}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                                <p className={`font-semibold ${isVoided ? 'text-gray-400 line-through' : 'text-gray-800'}`}>
                                                    {formatPrice(getLineAmount(item))}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                  );
                                })
                            ) : (
                                <div className="p-6 text-center text-gray-500 text-sm">
                                    No item details available for this order.
                                </div>
                            )}
                        </div>
                        {vendorSubtotal > 0 && (
                            <div className="p-4 border-t border-gray-200 flex justify-end">
                                <div className="text-right">
                                    <p className="text-sm text-gray-500">
                                        Your Total Base Price
                                    </p>
                                    <p className="text-lg font-bold text-gray-800">
                                        {formatPrice(lineTotals.gross || vendorSubtotal)}
                                    </p>
                                    <div className="mt-2 pt-2 border-t border-gray-100 space-y-1">
                                        {/* The stored subtotal/earnings still include returned lines, so deduct
                                            them here rather than showing the vendor money they won't receive. */}
                                        {lineTotals.hasDeduction && (
                                            <div className="flex justify-between text-sm gap-6">
                                                <span className="text-gray-500">Returned Items</span>
                                                <span className="text-rose-500">-{formatPrice(lineTotals.gross - lineTotals.net)}</span>
                                            </div>
                                        )}
                                        <div className="flex justify-between text-sm gap-6">
                                            <span className="text-gray-500">Platform Commission</span>
                                            <span className="text-red-500">-{formatPrice(vendorItem?.commissionAmount || 0)}</span>
                                        </div>
                                        <div className="flex justify-between text-sm font-bold pt-1 border-t border-dashed border-gray-100 gap-6">
                                            <span className="text-gray-800">Your Net Earning</span>
                                            <span className="text-emerald-600">
                                                {formatPrice(Math.max(0, lineTotals.net - (vendorItem?.commissionAmount || 0)))}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Proof of Delivery Card */}
                    {(order.readyPhoto || order.pickupPhoto || order.deliveryPhoto || order.openBoxPhoto) && (
                        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mt-6">
                            <h2 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
                                <FiCamera className="text-blue-600" />
                                Proof & Verification Photos
                            </h2>
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                                {order.readyPhoto && (
                                    <div className="space-y-2">
                                        <p className="text-[10px] font-bold text-gray-400 uppercase ">Package Ready Proof</p>
                                        <div className="relative aspect-video bg-white rounded-lg overflow-hidden border border-gray-100 group">
                                            <img
                                                src={getFullImageUrl(order.readyPhoto)}
                                                alt="Ready Proof"
                                                className="w-full h-full object-cover cursor-pointer transition-transform group-hover:scale-105"
                                                onClick={() => window.open(getFullImageUrl(order.readyPhoto), '_blank')}
                                            />
                                        </div>
                                    </div>
                                )}
                                {order.pickupPhoto && (
                                    <div className="space-y-2">
                                        <p className="text-[10px] font-bold text-gray-400 uppercase ">Pickup Proof</p>
                                        <div className="relative aspect-video bg-white rounded-lg overflow-hidden border border-gray-100 group">
                                            <img
                                                src={getFullImageUrl(order.pickupPhoto)}
                                                alt="Pickup Proof"
                                                className="w-full h-full object-cover cursor-pointer transition-transform group-hover:scale-105"
                                                onClick={() => window.open(getFullImageUrl(order.pickupPhoto), '_blank')}
                                            />
                                        </div>
                                    </div>
                                )}
                                {order.deliveryPhoto && (
                                    <div className="space-y-2">
                                        <p className="text-[10px] font-bold text-gray-400 uppercase ">Delivery Proof</p>
                                        <div className="relative aspect-video bg-white rounded-lg overflow-hidden border border-gray-100 group">
                                            <img
                                                src={getFullImageUrl(order.deliveryPhoto)}
                                                alt="Delivery Proof"
                                                className="w-full h-full object-cover cursor-pointer transition-transform group-hover:scale-105"
                                                onClick={() => window.open(getFullImageUrl(order.deliveryPhoto), '_blank')}
                                            />
                                        </div>
                                    </div>
                                )}
                                {order.openBoxPhoto && (
                                    <div className="space-y-2">
                                        <p className="text-[10px] font-bold text-gray-400 uppercase ">Open Box Proof</p>
                                        <div className="relative aspect-video bg-white rounded-lg overflow-hidden border border-gray-100 group">
                                            <img
                                                src={getFullImageUrl(order.openBoxPhoto)}
                                                alt="Open Box Proof"
                                                className="w-full h-full object-cover cursor-pointer transition-transform group-hover:scale-105"
                                                onClick={() => window.open(getFullImageUrl(order.openBoxPhoto), '_blank')}
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* Sidebar */}
                <div className="space-y-6">
                    {/* Customer Info */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                        <h2 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
                            <FiUser />
                            Customer Details
                        </h2>
                        <div className="space-y-3">
                            <div>
                                <p className="text-sm text-gray-500">Name</p>
                                <p className="font-medium">{customerName}</p>
                            </div>
                            <div>
                                <p className="text-sm text-gray-500">Email</p>
                                <p className="font-medium truncate">{customerEmail}</p>
                            </div>
                            <div>
                                <p className="text-sm text-gray-500">Mobile</p>
                                <p className="text-[10px] italic text-gray-400">Available only to delivery partner</p>
                            </div>
                        </div>
                    </div>

                    {/* Delivery Partner (Assigned) */}
                    {order.deliveryBoyId && (
                        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                            <h2 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
                                <FiTruck className="text-indigo-500" />
                                Assigned Partner
                            </h2>
                            <div className="flex items-center gap-3">
                                <div className="w-12 h-12 bg-indigo-50 rounded-lg flex items-center justify-center flex-shrink-0 border border-indigo-100 overflow-hidden">
                                    {order.deliveryBoyId.profileImage ? (
                                        <img 
                                            src={getFullImageUrl(order.deliveryBoyId.profileImage)} 
                                            alt="Rider" 
                                            className="w-full h-full object-cover" 
                                        />
                                    ) : (
                                        <FiTruck className="text-indigo-600 text-xl" />
                                    )}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="font-bold text-gray-800 truncate">
                                        {order.deliveryBoyId.name || 'Delivery Partner'}
                                    </p>
                                    <p className="text-xs text-gray-500">
                                        {order.deliveryBoyId.phone || 'N/A'}
                                    </p>
                                    {order.deliveryBoyId.vehicleNumber && (
                                        <p className="text-[10px] text-gray-400 mt-0.5">
                                            Vehicle: {order.deliveryBoyId.vehicleNumber}
                                        </p>
                                    )}
                                </div>
                                {order.deliveryBoyId.phone && (
                                    <a
                                        href={`tel:${order.deliveryBoyId.phone}`}
                                        className="p-2 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100 transition-colors"
                                        title="Call Partner"
                                    >
                                        <FiUser />
                                    </a>
                                )}
                            </div>
                        </div>
                    )}

                    {order.isMultiVendor && currentStatus === 'ready_for_pickup' && (() => {
                        const myPickup = (order.vendorPickups || []).find(vp => {
                            const vpVendorId = vp.vendorId?._id || vp.vendorId;
                            return String(vpVendorId) === String(vendorId);
                        });
                        const otp = myPickup?.handoverOtpDebug || myPickup?.handoverOtp;
                        if (!otp) return null;
                        return (
                            <div className="bg-gradient-to-br from-indigo-600 to-indigo-700 rounded-xl p-4 shadow-lg shadow-indigo-500/20 text-white">
                                <p className="text-[10px] font-black uppercase tracking-widest mb-3 text-indigo-200">
                                    🔐 Vendor Handover OTP
                                </p>
                                <p className="text-4xl font-black tracking-[0.3em] text-center text-white mb-3">
                                    {otp}
                                </p>
                                <p className="text-[10px] text-indigo-200 text-center leading-tight">
                                    Share this OTP with the delivery partner when they arrive to collect your items.
                                </p>
                                <div className="mt-3 p-2 bg-white/10 rounded-lg">
                                    <p className="text-[9px] font-bold text-indigo-100 text-center uppercase tracking-wider">
                                        Stop: {myPickup?.status?.replace(/_/g, ' ') || 'Pending'}
                                    </p>
                                </div>
                            </div>
                        );
                    })()}

                    {['returning_unselected_items', 'returning_unselected'].includes(order.status) && (() => {
                        const myReturn = (order.vendorReturnStops || []).find(vp => {
                            const vpVendorId = vp.vendorId?._id || vp.vendorId;
                            return String(vpVendorId) === String(vendorId);
                        });
                        const otp = myReturn?.handoverOtpDebug || myReturn?.handoverOtp;
                        if (!otp) return null;
                        return (
                            <div className="bg-gradient-to-br from-rose-600 to-rose-700 rounded-xl p-4 shadow-lg shadow-rose-500/20 text-white">
                                <p className="text-[10px] font-black uppercase tracking-widest mb-3 text-rose-200">
                                    🔄 Return Reception OTP
                                </p>
                                <p className="text-4xl font-black tracking-[0.3em] text-center text-white mb-3">
                                    {otp}
                                </p>
                                <p className="text-[10px] text-rose-200 text-center leading-tight">
                                    Share this OTP with the delivery partner when they return unselected items to you.
                                </p>
                                <div className="mt-3 p-2 bg-white/10 rounded-lg">
                                    <p className="text-[9px] font-bold text-rose-100 text-center uppercase tracking-wider">
                                        Stop: {myReturn?.status?.replace(/_/g, ' ') || 'Pending'}
                                    </p>
                                </div>
                            </div>
                        );
                    })()}

                    {/* Payment Info */}

                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                        <h2 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
                            <FiDollarSign className="text-emerald-500" />
                            Payment Overview
                        </h2>
                        <div className="space-y-4">
                            <div>
                                <p className="text-[10px] font-bold text-gray-400 uppercase  mb-1">Payment Method</p>
                                <div className="flex items-center gap-2">
                                    {(order.paymentMethod === 'cod' || order.paymentMethod === 'cash') ? (
                                        <span className="px-2 py-1 bg-purple-50 text-purple-700 text-[10px] font-bold rounded border border-purple-100 uppercase er flex items-center gap-1">
                                            <FiDollarSign /> Cash on Delivery
                                        </span>
                                    ) : (
                                        <span className="px-2 py-1 bg-emerald-50 text-emerald-700 text-[10px] font-bold rounded border border-emerald-100 uppercase er">
                                            Prepaid
                                        </span>
                                    )}
                                </div>
                            </div>
                            <div>
                                <p className="text-[10px] font-bold text-gray-400 uppercase  mb-1">Payment Status</p>
                                <Badge variant={getPaymentStatusVariant(order, currentStatus)}>
                                    {getPaymentStatusDisplay(order, currentStatus)}
                                </Badge>
                                {(order.paymentMethod === 'cod' || order.paymentMethod === 'cash') && order.paymentStatus === 'paid' && (
                                    <p className="text-[9px] text-gray-400 font-medium mt-1 italic">
                                        * Collected by Delivery Partner
                                    </p>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Shipping Address */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                        <h2 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
                            <FiMapPin />
                            Shipping Address
                        </h2>
                        {shippingAddress ? (
                            <p className="text-gray-600 text-sm leading-relaxed">
                                {shippingAddress.address ?? shippingAddress.street ?? 'N/A'}
                                <br />
                                {shippingAddress.city}, {shippingAddress.state}{' '}
                                {shippingAddress.zipCode}
                                <br />
                                {shippingAddress.country}
                            </p>
                        ) : (
                            <p className="text-sm text-gray-400">
                                No address available
                            </p>
                        )}
                    </div>
                </div>
            </div>
        </motion.div >
        </>
    );
};

export default OrderDetail;
