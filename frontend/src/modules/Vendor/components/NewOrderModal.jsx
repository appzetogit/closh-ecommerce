import { motion, AnimatePresence } from 'framer-motion';
import { 
    FiPackage, 
    FiX, 
    FiNavigation, 
    FiShoppingBag,
    FiCheck
} from 'react-icons/fi';
import { formatPrice } from '../../../shared/utils/helpers';
import { formatVariantLabel } from '../../../shared/utils/variant';
import { createPortal } from 'react-dom';

import { IMAGE_BASE_URL } from '../../../shared/utils/constants';

const getFullImageUrl = (image) => {
    if (!image) return null;
    if (image.startsWith('http')) return image;
    const cleanImage = image.startsWith('/') ? image : `/${image}`;
    return `${IMAGE_BASE_URL}${cleanImage}`;
};

const NewOrderModal = ({ order, isOpen, onClose, onAccept, isAccepting, isBuzzerActive, onStopBuzzer, vendorId }) => {
    if (!order && isOpen) return null;

    let items = [];
    if (order?.isMultiVendor || order?.vendorItems?.length > 1) {
        const vendorGroup = order?.vendorItems?.find(vi => String(vi.vendorId?._id || vi.vendorId) === String(vendorId));
        items = vendorGroup?.items || [];
    } else {
        items = order?.vendorItems?.[0]?.items || order?.items || [];
    }
    const firstItem = items[0];
    const itemImage = getFullImageUrl(firstItem?.image || firstItem?.productId?.image);

    // Calculate vendor-specific total based on vendorPrice
    const vendorTotal = items.reduce((sum, it) => {
        const itemVendorPrice = it.vendorPrice || it.productId?.vendorPrice || it.price || 0;
        return sum + (itemVendorPrice * (it.quantity || 1));
    }, 0);

    return createPortal(
        <AnimatePresence>
            {isOpen && order && (
                <div className="fixed inset-0 z-[9000] flex items-center justify-center p-4">
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm"
                        onClick={onClose}
                    />

                    {/* Modal Card */}
                    <motion.div
                        initial={{ scale: 0.95, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.95, opacity: 0 }}
                        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                        className="relative w-full max-w-[440px] bg-white rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.1)] overflow-hidden flex flex-col z-[9001]"
                    >
                        {/* Header */}
                        <div className="px-8 pt-8 pb-6 flex items-start justify-between">
                            <div className="flex gap-4">
                                <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-400 shrink-0 border border-slate-100">
                                    {itemImage ? (
                                        <img src={itemImage} className="w-full h-full object-cover rounded-2xl" alt="" />
                                    ) : (
                                        <FiShoppingBag size={20} />
                                    )}
                                </div>
                                <div className="min-w-0">
                                    <h2 className="text-xl font-bold text-slate-900 leading-tight">New Order</h2>
                                    <p className="text-[13px] font-medium text-slate-400">Order #{order.orderId || order.id?.slice(-8)}</p>
                                </div>
                            </div>
                            <button
                                onClick={onClose}
                                className="p-2 text-slate-400 hover:text-slate-900 hover:bg-slate-50 rounded-full transition-all"
                            >
                                <FiX size={20} />
                            </button>
                        </div>

                        {/* Order Summary Snapshot */}
                        <div className="px-8 py-2">
                            <div className="p-6 bg-slate-900 rounded-2xl text-white">
                                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">Total Amount</p>
                                <p className="text-3xl font-bold">{formatPrice(vendorTotal)}</p>
                            </div>
                        </div>

                        {/* Content Area */}
                        <div className="px-8 py-6 space-y-6">
                            {/* Items List */}
                            <div className="space-y-3">
                                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Order Items</p>
                                <div className="space-y-2">
                                    {items.map((it, idx) => (
                                        <div key={idx} className="flex justify-between items-start text-[14px]">
                                            <div className="flex items-start gap-2 min-w-0">
                                                <span className="w-5 h-5 flex items-center justify-center bg-slate-50 rounded text-slate-400 text-[10px] font-bold shrink-0 mt-0.5">{it.quantity}x</span>
                                                <div className="flex flex-col min-w-0">
                                                    <span className="font-semibold text-slate-700 truncate">{it.name}</span>
                                                    {(it.productCode || it.productId?.productCode) && (
                                                        <span className="self-start mt-0.5 bg-slate-900 text-white text-[10px] font-bold tracking-wide px-1.5 py-0.5 rounded">
                                                            {it.productCode || it.productId?.productCode}
                                                        </span>
                                                    )}
                                                    {it.variant && formatVariantLabel(it.variant) && (
                                                        <span className="text-[11px] text-slate-500 font-medium leading-tight">
                                                            {formatVariantLabel(it.variant)}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                            <span className="text-slate-400 font-medium ml-4 whitespace-nowrap">{formatPrice((it.vendorPrice || it.productId?.vendorPrice || it.price || 0) * (it.quantity || 1))}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Divider */}
                            <div className="h-px bg-slate-100 w-full" />

                            {/* Delivery Info */}
                            <div className="space-y-2">
                                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Delivery Detail</p>
                                <div className="flex items-start gap-3">
                                    <div className="mt-0.5 text-slate-400"><FiNavigation size={14} /></div>
                                    <div className="text-[13px] font-medium text-slate-600 leading-relaxed">
                                        <p className="text-slate-900 font-bold">{order.shippingAddress?.name || 'Customer'}</p>
                                        <p className="line-clamp-1">{[order.shippingAddress?.address, order.shippingAddress?.city].filter(Boolean).join(', ')}</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="p-8 pt-2">
                            <div className="space-y-3">
                                <button
                                    onClick={() => onAccept(order.orderId || order.id)}
                                    disabled={isAccepting}
                                    className="w-full h-14 bg-slate-900 text-white rounded-2xl font-bold text-[15px] flex items-center justify-center gap-2 hover:bg-black active:scale-[0.98] transition-all disabled:opacity-50"
                                >
                                    {isAccepting ? (
                                        <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                                    ) : (
                                        <><FiCheck strokeWidth={3} /> Accept Order</>
                                    )}
                                </button>
                                
                                {isBuzzerActive && (
                                    <button
                                        onClick={onStopBuzzer}
                                        className="w-full h-10 text-[12px] font-bold text-slate-400 hover:text-red-500 transition-colors flex items-center justify-center gap-2"
                                    >
                                        <div className="w-1 h-1 bg-red-400 rounded-full animate-pulse" />
                                        Mute Buzzer
                                    </button>
                                )}
                            </div>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>,
        document.body
    );
};

export default NewOrderModal;
