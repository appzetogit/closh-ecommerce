import { FiHeart } from "react-icons/fi";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { useWishlistStore } from "../store/wishlistStore";
import { formatPrice, getPlaceholderImage } from "../utils/helpers";
import LazyImage from "./LazyImage";

const ProductCard = ({ product }) => {
  const productLink = `/product/${product.id}`;
  const { addItem: addToWishlist, removeItem: removeFromWishlist, isInWishlist } = useWishlistStore();
  const isFavorite = isInWishlist(product.id);

  const handleFavorite = (e) => {
    e.stopPropagation();
    if (isFavorite) {
      removeFromWishlist(product.id);
    } else {
      addToWishlist({ id: product.id, name: product.name, price: product.price, image: product.image });
    }
  };

  return (
    <>
      <motion.div
        whileTap={{ scale: 0.98 }}
        className="flex flex-col w-full h-full group relative bg-white rounded-xl transition-all duration-500 hover:shadow-[0_15px_30px_rgba(0,0,0,0.08)] hover:-translate-y-1"
      >
        {/* IMAGE AREA - Taller 3:4 ratio with matching rounded corners */}
        <div className="relative aspect-[3/4] md:aspect-[4/5] overflow-hidden rounded-xl bg-[#F8F8F8]">
          <Link to={productLink} className="absolute inset-0 w-full h-full">
            <LazyImage
              src={product.image}
              alt={product.name}
              width={300}
              className={`absolute inset-0 w-full h-full object-contain transition-transform duration-700 group-hover:scale-110 ${(product.stock === 'out_of_stock' || product.stockQuantity <= 0) ? 'grayscale opacity-70' : ''}`}
              onError={(e) => { e.target.src = getPlaceholderImage(400, 533, "Product"); }}
            />
          </Link>

          {/* Wishlist Icon */}
          <button
            onClick={handleFavorite}
            className="absolute bottom-2 right-2 w-7 h-7 md:w-8 md:h-8 rounded-full bg-black/20 hover:bg-black/40 backdrop-blur-sm flex items-center justify-center text-white transition-all z-10"
          >
            <FiHeart size={14} className={`${isFavorite ? 'fill-current text-red-500 stroke-red-500' : 'stroke-white'}`} />
          </button>

          {/* Status Badges */}
          {product.stock === 'out_of_stock' || product.stockQuantity <= 0 ? (
            <div className="absolute bottom-0 left-0 bg-red-600 text-white text-[9px] md:text-[11px] font-bold px-2 py-0.5 rounded-tr-lg z-20 shadow-lg tracking-wide">
                Sold Out
            </div>
          ) : product.vendorId?.isOnline === false ? (
            <div className="absolute bottom-0 left-0 bg-[#52b788] text-white text-[9px] md:text-[11px] font-bold px-2 py-0.5 rounded-tr-lg z-20 shadow-lg tracking-wide">
                Store Offline
            </div>
          ) : (
            <div className="absolute bottom-0 left-0 bg-black text-white text-[10px] md:text-[11px] font-semibold px-2 md:px-2.5 py-0.5 md:py-1 rounded-tr-lg z-20 tracking-wide">
                Try & Buy
            </div>
          )}
        </div>

        {/* INFO AREA - Compact */}
        <div className="pt-2 flex flex-col flex-1 px-0.5">
          <span className="text-[#1A1A1A] text-[12px] md:text-[14px] font-bold tracking-tight truncate w-full">
            {(product.brandName && product.brandName !== 'AAPZETO' && product.brandName !== 'Appzeto') ? product.brandName : ((product.brand && product.brand !== 'AAPZETO' && product.brand !== 'Appzeto') ? product.brand : 'CLOSH')}
          </span>
          
          <Link to={productLink} className="flex flex-col">
            <h3 className="text-gray-500 text-[11px] md:text-[12px] font-normal truncate leading-tight mt-0.5">
              {product.name}
            </h3>
          </Link>

          {/* Optional Deals Badge */}
          {product.isAsapDeal && (
             <div className="mt-1.5 flex">
                 <span className="bg-black text-white text-[9px] font-semibold px-2 py-0.5 rounded-sm">Asap Deal</span>
             </div>
          )}
          
          <div className="mt-1 flex flex-nowrap items-center gap-1.5 w-full">
             <span className="text-[12px] md:text-[14px] font-extrabold text-gray-900 whitespace-nowrap tracking-tight">
                {formatPrice(product.price)}
             </span>
             {product.originalPrice && product.originalPrice > product.price && (
               <>
                 <span className="text-[10px] md:text-[12px] text-gray-400 line-through font-medium whitespace-nowrap">
                   {formatPrice(product.originalPrice)}
                 </span>
                 <div className="relative ml-1 flex items-center justify-center px-1.5 py-0.5">
                   <div className="absolute inset-0 bg-[#e8f5e9] -skew-x-12 rounded-sm"></div>
                   <span className="relative text-[#2e7d32] text-[9px] md:text-[10px] font-bold whitespace-nowrap z-10 tracking-tight">
                     {Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100)}% Off
                   </span>
                 </div>
               </>
            )}
          </div>
        </div>
      </motion.div>
    </>
  );
};

export default ProductCard;
