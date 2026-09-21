import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, useMotionValue, useTransform } from 'framer-motion';
import { FiPackage, FiArrowRight, FiCheckCircle, FiEye } from 'react-icons/fi';
import { formatPrice } from '../../../shared/utils/helpers';
import { formatVariantLabel } from '../../../shared/utils/variant';
import { useVendorAuthStore } from '../store/vendorAuthStore';
import toast from 'react-hot-toast';

import { IMAGE_BASE_URL } from '../../../shared/utils/constants';

const getFullImageUrl = (image) => {
    if (!image) return null;
    if (image.startsWith('http')) return image;
    const cleanImage = image.startsWith('/') ? image : `/${image}`;
    return `${IMAGE_BASE_URL}${cleanImage}`;
};

const SwipeOrderCard = ({ order, onStatusUpdate }) => {
    const navigate = useNavigate();
    const { updateOrderStatus, vendor } = useVendorAuthStore();
    const [isUpdating, setIsUpdating] = useState(false);
    const [isSuccess, setIsSuccess] = useState(false);
    const constraintsRef = useRef(null);

    const x = useMotionValue(0);
    const background = useTransform(
        x,
        [0, 200],
        ['rgba(79, 70, 229, 0.1)', 'rgba(16, 185, 129, 0.2)']
    );
    const opacity = useTransform(x, [0, 150], [1, 0]);
    const successOpacity = useTransform(x, [150, 200], [0, 1]);

    const vendorId = vendor?.id || vendor?._id;
    const currentVendorId = vendorId?.toString();
    const vendorItem = order.vendorItems?.find(vi => {
        const vId = vi.vendorId?._id || vi.vendorId;
        return vId?.toString() === currentVendorId;
    });

    const currentStatus = (vendorItem?.status ?? order.status ?? 'pending').toLowerCase();
    const displayAmount = vendorItem?.basePrice ?? 
                         vendorItem?.items?.reduce((sum, it) => sum + (it.vendorPrice ?? it.price ?? 0) * (it.quantity ?? 1), 0) ??
                         vendorItem?.subtotal ?? 0;
    const orderId = order.orderId ?? order._id;

    // Logic for next state
    const nextStatus = currentStatus === 'pending' ? 'accepted' : 
                      (currentStatus === 'accepted' || currentStatus === 'processing') ? 'ready_for_pickup' : null;
    
    const nextActionLabel = nextStatus === 'accepted' ? 'Accept Order' : 'Mark Ready';

    const handleDragEnd = async (event, info) => {
        if (info.offset.x >= 180 && !isUpdating && nextStatus) {
            setIsUpdating(true);
            try {
                const res = await updateOrderStatus(orderId, nextStatus, {});
                if (res.success) {
                    setIsSuccess(true);
                    toast.success(`Order #${orderId} is now ${nextStatus.replace(/_/g, ' ')}!`);
                    if (onStatusUpdate) onStatusUpdate(orderId, nextStatus);
                }
            } catch (err) {
                toast.error(err?.response?.data?.message || 'Failed to update status');
                x.set(0); 
            } finally {
                setIsUpdating(false);
            }
        } else {
            x.set(0);
        }
    };

    if (isSuccess) {
        return (
            <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-center justify-between"
            >
                <div className="flex items-center gap-3">
                    <div className="bg-green-500 p-2 rounded-full">
                        <FiCheckCircle className="text-white" />
                    </div>
                    <div>
                        <p className="font-bold text-green-800">{orderId}</p>
                        <p className="text-xs text-green-600 uppercase font-bold ">Status Updated!</p>
                    </div>
                </div>
                <span className="text-green-700 font-bold">{formatPrice(displayAmount)}</span>
            </motion.div>
        );
    }

    return (
        <div 
            onClick={() => navigate(`/vendor/orders/${orderId}`)}
            className="relative overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm hover:shadow-md hover:bg-gray-50/30 transition-all cursor-pointer"
        >
            <div className="p-4 pb-14">
                <div className="flex justify-between items-start mb-2">
                    <div className="flex-1">
                        <div className="flex items-center gap-2">
                            <p className="font-bold text-gray-800">{orderId}</p>
                            <FiEye className="text-blue-500 hover:text-blue-700 transition-colors" />
                        </div>
                        <p className="text-xs text-gray-500">{new Date(order.createdAt).toLocaleDateString()}</p>
                    </div>
                    <div className="text-right">
                        <p className="font-bold text-gray-900">{formatPrice(displayAmount)}</p>
                        <div className="flex items-center gap-1 justify-end text-orange-500">
                            <FiPackage className="text-xs" />
                            <span className="text-[10px] uppercase font-bold ">{currentStatus.replace(/_/g, ' ')}</span>
                        </div>
                    </div>
                </div>

                {/* Product Detail Snippet */}
                <div className="flex items-center gap-3 mt-3 p-2 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors">
                    <div className="w-12 h-12 rounded-lg bg-white border border-gray-100 overflow-hidden flex-shrink-0">
                        <img 
                            src={getFullImageUrl(vendorItem?.items?.[0]?.image || order.items?.[0]?.image)} 
                            alt={vendorItem?.items?.[0]?.name || 'Product'}
                            className="w-full h-full object-cover"
                            onError={(e) => { e.target.src = 'https://via.placeholder.com/48?text=P' }}
                        />
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-gray-800 truncate">{vendorItem?.items?.[0]?.name || order.items?.[0]?.name || 'Multiple Products'}</p>
                        <p className="text-[10px] text-gray-500 font-medium mt-0.5">Qty: {vendorItem?.items?.[0]?.quantity || order.items?.[0]?.quantity || 1}</p>
                        {(() => {
                            const first = vendorItem?.items?.[0] || order.items?.[0];
                            const code = first?.productCode || first?.productId?.productCode;
                            return code ? (
                                <span className="inline-block mt-0.5 bg-gray-900 text-white text-[9px] font-bold tracking-wide px-1.5 py-0.5 rounded">
                                    {code}
                                </span>
                            ) : null;
                        })()}
                        {(vendorItem?.items?.[0]?.variant || order.items?.[0]?.variant) && formatVariantLabel(vendorItem?.items?.[0]?.variant || order.items?.[0]?.variant) && (
                            <p className="text-[10px] text-gray-400 font-medium leading-tight mt-0.5">
                                {formatVariantLabel(vendorItem?.items?.[0]?.variant || order.items?.[0]?.variant)}
                            </p>
                        )}
                    </div>
                </div>
            </div>

            {/* Swipe Track */}
            <div
                ref={constraintsRef}
                onClick={(e) => e.stopPropagation()}
                className="absolute bottom-2 left-2 right-2 h-10 bg-white rounded-lg overflow-hidden border border-dashed border-gray-200"
            >
                <motion.div
                    style={{ background }}
                    className="absolute inset-0 flex items-center px-4"
                >
                    <motion.p
                        style={{ opacity }}
                        className="text-[10px] font-bold text-gray-400 uppercase  flex items-center gap-2 mx-auto"
                    >
                        Swipe to {nextActionLabel} <FiArrowRight />
                    </motion.p>
                    <motion.p
                        style={{ opacity: successOpacity }}
                        className="text-[10px] font-bold text-green-600 uppercase  flex items-center gap-2 mx-auto absolute inset-0 flex items-center justify-center p-0"
                    >
                        Success! <FiCheckCircle />
                    </motion.p>
                </motion.div>

                <motion.div
                    drag="x"
                    dragConstraints={{ left: 0, right: 200 }}
                    style={{ x }}
                    onDragEnd={handleDragEnd}
                    className="absolute left-1 top-1 bottom-1 w-16 bg-white rounded-md shadow-sm border border-gray-200 flex items-center justify-center cursor-grab active:cursor-grabbing z-10"
                >
                    {isUpdating ? (
                        <div className="w-4 h-4 border-2 border-gray-200 border-t-indigo-600 rounded-full animate-spin" />
                    ) : (
                        <FiArrowRight className="text-indigo-600" />
                    )}
                </motion.div>
            </div>
        </div>
    );
};

export default SwipeOrderCard;
