import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { FiHeart } from "react-icons/fi";
import { useWishlistStore } from "../../../../shared/store/wishlistStore";
import { formatPrice } from "../../../../shared/utils/helpers";
import toast from "react-hot-toast";
import LazyImage from '../../../../shared/components/LazyImage';

const ProductListItem = ({ product, index, isFlashSale = false }) => {
  const productLink = `/product/${product.id}`;
  const {
    addItem: addToWishlist,
    removeItem: removeFromWishlist,
    isInWishlist,
  } = useWishlistStore();
  const isFavorite = isInWishlist(product.id);

  const handleFavorite = (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (isFavorite) {
      removeFromWishlist(product.id);
      toast.success("Removed from wishlist");
    } else {
      const addedToWishlist = addToWishlist({
        id: product.id,
        name: product.name,
        price: product.price,
        image: product.image,
      });
      if (addedToWishlist) {
        toast.success("Added to wishlist");
      }
    }
  };

  const soldPercentage = product.stockQuantity ? Math.min(95, Math.floor(100 - (product.stockQuantity / 2))) : 75;

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.05 }}
      className={`glass-card rounded-2xl p-3 mb-3 border border-white/40 shadow-sm hover:shadow-md transition-all ${isFlashSale ? "bg-red-50/20 border-red-100" : ""}`}>
      <div className="flex gap-4">
        {/* Product Image Section */}
        <Link to={productLink} className="flex-shrink-0 relative group">
          <div className="w-24 h-24 md:w-32 md:h-32 rounded-xl overflow-hidden bg-gradient-to-br from-gray-50 to-gray-100 p-2">
            <LazyImage
              src={product.image}
              alt={product.name}
              width={160}
              className="w-full h-full object-contain group-hover:scale-110 transition-transform duration-500"
              onError={(e) => {
                e.target.src = "https://via.placeholder.com/200x200?text=Product";
              }}
            />
          </div>
          {product.originalPrice && (
            <div className="absolute top-1 left-1 bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-lg shadow-sm">
              {Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100)}% OFF
            </div>
          )}
        </Link>

        {/* Product Info Section */}
        <div className="flex-1 min-w-0 flex flex-col">
          {/* Top Row: Name + Favorite */}
          <div className="flex items-start justify-between gap-2 mb-1">
            <Link to={productLink} className="flex-1 min-w-0">
              <h3 className="font-bold text-gray-800 text-sm md:text-base mb-0 line-clamp-2 md:line-clamp-1 leading-snug group-hover:text-primary-600 transition-colors">
                {product.name}
              </h3>
            </Link>
            <button
              onClick={handleFavorite}
              className={`flex-shrink-0 p-2 rounded-full transition-all ${isFavorite
                ? "bg-red-50 text-red-500 shadow-inner"
                : "bg-white text-gray-400 hover:bg-gray-100"
                }`}>
              <FiHeart
                className={`text-sm ${isFavorite ? "fill-current scale-110" : ""}`}
              />
            </button>
          </div>

          <div className="flex items-center gap-2 mb-1">
            {product.rating && (
              <div className="flex items-center bg-yellow-400/10 px-1.5 py-0.5 rounded-md">
                <span className="text-[10px] md:text-xs font-bold text-yellow-700">⭐ {product.rating}</span>
                <span className="text-[9px] text-gray-400 font-medium ml-1">({product.reviewCount || 0})</span>
              </div>
            )}

          </div>

          {/* Flash Sale Progress */}
          {isFlashSale && (
            <div className="mb-2 space-y-1 max-w-[200px]">
              <div className="flex justify-between text-[9px] font-bold">
                <span className="text-gray-400 uppercase">Stock Left</span>
                <span className="text-orange-600">{soldPercentage}% Sold</span>
              </div>
              <div className="h-1 w-full bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-red-500 to-orange-400 transition-all duration-1000"
                  style={{ width: `${soldPercentage}%` }}
                />
              </div>
            </div>
          )}

          {/* Bottom Row: Price Only */}
          <div className="mt-auto flex items-center justify-between gap-3 pt-2 border-t border-gray-50">
            <div className="flex flex-col">
              <span className="text-base md:text-xl font-bold text-gray-900 leading-none">
                {formatPrice(product.price)}
              </span>
              {product.originalPrice && (
                <span className="text-[10px] md:text-xs text-gray-400 line-through font-medium mt-0.5">
                  {formatPrice(product.originalPrice)}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default ProductListItem;
