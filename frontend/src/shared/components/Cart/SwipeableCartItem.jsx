import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { FiTrash2, FiMinus, FiPlus, FiHeart, FiAlertCircle } from "react-icons/fi";
import { toast } from "react-hot-toast";
import { useCartStore } from "../../store/useStore";
import { useWishlistStore } from "../../store/wishlistStore";
import { formatPrice, getOptimizedImageUrl } from "../../utils/helpers";
import { formatVariantLabel } from "../../utils/variant";
import useSwipeGesture from "../../../modules/user/hooks/useSwipeGesture";

const SwipeableCartItem = ({ item, index }) => {
    const [swipeOffset, setSwipeOffset] = useState(0);
    const [isDeleted, setIsDeleted] = useState(false);
    const [hasAnimated, setHasAnimated] = useState(false);
    const deletedItemRef = useRef(null);

    const { removeItem, updateQuantity } = useCartStore();
    const { addItem: addToWishlist } = useWishlistStore();

    // Only animate on mount
    useEffect(() => {
        setHasAnimated(true);
    }, []);

    const getProductStock = () => Number(item?.stockQuantity);

    const isMaxQuantity = (quantity) => {
        const availableStock = Number(item?.stockQuantity);
        return Number.isFinite(availableStock) ? quantity >= availableStock : false;
    };

    const isLowStock = () => String(item?.stock || "") === "low_stock";

    const handleQuantityChange = (id, currentQuantity, change, variant) => {
        const newQuantity = currentQuantity + change;
        const availableStock = Number(item?.stockQuantity);

        if (newQuantity <= 0) {
            removeItem(id, variant);
            return;
        }

        if (Number.isFinite(availableStock) && newQuantity > availableStock) {
            toast.error(`Only ${availableStock} items available in stock`);
            return;
        }

        updateQuantity(id, newQuantity, variant);
    };

    const handleSaveForLater = (item) => {
        const addedToWishlist = addToWishlist({
            id: item.id,
            name: item.name,
            price: item.price,
            image: item.image,
        });
        if (!addedToWishlist) return;
        removeItem(item.id, item.variant);
        toast.success("Saved for later!");
    };

    const handleSwipeRight = () => {
        setIsDeleted(true);
        deletedItemRef.current = { ...item };
        removeItem(item.id, item.variant);
        toast.success("Item removed", {
            duration: 3000,
            action: {
                label: "Undo",
                onClick: () => {
                    if (deletedItemRef.current) {
                        const { addItem: addToCart } = useCartStore.getState();
                        addToCart(deletedItemRef.current);
                        setIsDeleted(false);
                        deletedItemRef.current = null;
                    }
                },
            },
        });
    };

    const swipeHandlers = useSwipeGesture({
        onSwipeRight: handleSwipeRight,
        threshold: 100,
    });

    // Update offset based on swipe state
    useEffect(() => {
        if (swipeHandlers.swipeState.isSwiping) {
            setSwipeOffset(Math.max(0, swipeHandlers.swipeState.offset));
        } else if (!swipeHandlers.swipeState.isSwiping && swipeOffset < 100) {
            setSwipeOffset(0);
        }
    }, [swipeHandlers.swipeState.isSwiping, swipeHandlers.swipeState.offset]);

    if (isDeleted) return null;

    return (
        <motion.div
            initial={hasAnimated ? false : { opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0, x: swipeOffset }}
            exit={{ opacity: 0, x: "100%" }}
            transition={{
                type: "spring",
                stiffness: 300,
                damping: 30,
            }}
            style={{ willChange: "transform, opacity", transform: "translateZ(0)" }}
            className="relative"
            onTouchStart={swipeHandlers.onTouchStart}
            onTouchMove={swipeHandlers.onTouchMove}
            onTouchEnd={swipeHandlers.onTouchEnd}>
            <div className="flex gap-4 p-4 bg-white rounded-xl relative">
                {/* Delete Background */}
                {swipeOffset > 0 && (
                    <div className="absolute inset-0 bg-red-500 rounded-xl flex items-center justify-end pr-4">
                        <FiTrash2 className="text-white text-xl" />
                    </div>
                )}

                {/* Product Image */}
                <div className="w-20 h-20 sm:w-24 sm:h-24 flex-shrink-0 rounded-lg overflow-hidden bg-gray-200 relative z-10">
                    <img
                        src={getOptimizedImageUrl(item.image, 120)} loading="lazy" decoding="async"
                        alt={item.name}
                        className="w-full h-full object-cover"
                    />
                </div>

                {/* Product Info */}
                <div className="flex-1 min-w-0 relative z-10">
                    <h3 className="font-semibold text-gray-800 text-sm mb-1 line-clamp-2">
                        {item.name}
                    </h3>
                    <p className="text-sm font-bold text-primary-600 mb-2">
                        {formatPrice(item.price)}
                    </p>
                    {formatVariantLabel(item?.variant) && (
                        <p className="text-xs text-gray-500 mb-2">
                            {formatVariantLabel(item?.variant)}
                        </p>
                    )}

                    {/* Stock Warning */}
                    {isLowStock() && (
                        <div className="flex items-center gap-1 text-xs text-orange-600 mb-2">
                            <FiAlertCircle className="text-xs" />
                            <span>Only {getProductStock()} left!</span>
                        </div>
                    )}

                    {/* Quantity Controls */}
                    <div className="flex items-center gap-3 mb-2">
                        <button
                            type="button"
                            onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                handleQuantityChange(item.id, item.quantity, -1, item.variant);
                            }}
                            className="w-8 h-8 flex items-center justify-center rounded-lg bg-white border border-gray-300 hover:bg-white hover:text-black transition-colors">
                            <FiMinus className="text-xs text-gray-600" />
                        </button>
                        <motion.span
                            key={item.quantity}
                            initial={{ scale: 1.2 }}
                            animate={{ scale: 1 }}
                            transition={{ duration: 0.2 }}
                            style={{ willChange: "transform", transform: "translateZ(0)" }}
                            className="text-sm font-semibold text-gray-800 min-w-[2rem] text-center">
                            {item.quantity}
                        </motion.span>
                        <button
                            type="button"
                            onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                handleQuantityChange(item.id, item.quantity, 1, item.variant);
                            }}
                            disabled={isMaxQuantity(item.quantity)}
                            className={`w-8 h-8 flex items-center justify-center rounded-lg border transition-colors ${isMaxQuantity(item.quantity)
                                ? "bg-gray-100 border-gray-200 cursor-not-allowed opacity-50"
                                : "bg-white border-gray-300 hover:bg-white hover:text-black"
                                }`}>
                            <FiPlus className="text-xs text-gray-600" />
                        </button>
                        <button
                            type="button"
                            onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                removeItem(item.id, item.variant);
                            }}
                            className="ml-auto p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                            <FiTrash2 className="text-sm" />
                        </button>
                    </div>
                    {/* Save for Later Button */}
                    <button
                        type="button"
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleSaveForLater(item);
                        }}
                        className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-pink-50 text-pink-600 rounded-lg font-medium hover:bg-pink-100 transition-colors text-sm">
                        <FiHeart className="text-sm" />
                        Save for Later
                    </button>
                </div>
            </div>
        </motion.div>
    );
};

export default SwipeableCartItem;



