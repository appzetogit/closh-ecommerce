import { FiHeart, FiStar } from "react-icons/fi";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { useWishlistStore } from "../../../../shared/store/wishlistStore";
import {
  formatPrice,
  getPlaceholderImage,
} from "../../../../shared/utils/helpers";
import toast from "react-hot-toast";
import LazyImage from "../../../../shared/components/LazyImage";
import VendorBadge from "../../../Vendor/components/VendorBadge";
import { getVendorById } from "../../data/catalogData";

const MobileProductCard = ({ product }) => {
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

  return (
    <>
      <motion.div
        whileTap={{ scale: 0.98 }}
        className="glass-card rounded-2xl overflow-hidden mb-4"
      >
        <div className="flex gap-4 p-4">
          {/* Product Image */}
          <Link to={`/product/${product.id}`} className="w-24 h-24 flex-shrink-0 rounded-xl overflow-hidden bg-gray-100 block">
            <LazyImage
              src={product.image}
              alt={product.name}
              width={200}
              className="w-full h-full object-cover"
              onError={(e) => {
                e.target.src = getPlaceholderImage(200, 200, "Product");
              }}
            />
          </Link>

          {/* Product Info */}
          <div className="flex-1 min-w-0 flex flex-col">
            <div className="flex items-start justify-between gap-2 mb-1">
              <Link to={`/product/${product.id}`} className="flex-1">
                <h3 className="font-bold text-gray-800 text-sm line-clamp-2">
                  {product.name}
                </h3>
              </Link>
              <button
                type="button"
                onClick={handleFavorite}
                className="flex-shrink-0 p-1.5 hover:bg-gray-100 rounded-full transition-colors">
                <FiHeart
                  className={`text-lg ${isFavorite ? "text-red-500 fill-red-500" : "text-gray-400"
                    }`}
                />
              </button>
            </div>



            {/* Vendor Badge */}
            {product.vendorId && (
              <div className="mb-2">
                <VendorBadge
                  vendor={getVendorById(product.vendorId)}
                  showVerified={true}
                  size="sm"
                  disableLink={true}
                />
              </div>
            )}

            {/* Rating */}
            {product.rating && (
              <div className="flex items-center gap-1 mb-2">
                <div className="flex items-center">
                  {[...Array(5)].map((_, i) => (
                    <FiStar
                      key={i}
                      className={`text-xs ${i < Math.floor(product.rating)
                        ? "text-yellow-400 fill-yellow-400"
                        : "text-gray-300"
                        }`}
                    />
                  ))}
                </div>
                <span className="text-xs text-gray-600 font-medium">
                  {product.rating} ({product.reviewCount || 0})
                </span>
              </div>
            )}

            {/* Price */}
            <div className="flex items-center gap-2 mb-3">
              <span className="text-lg font-bold text-gray-800">
                {formatPrice(product.price)}
              </span>
              {product.originalPrice && (
                <span className="text-xs text-gray-400 line-through font-medium">
                  {formatPrice(product.originalPrice)}
                </span>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </>
  );
};

export default MobileProductCard;
