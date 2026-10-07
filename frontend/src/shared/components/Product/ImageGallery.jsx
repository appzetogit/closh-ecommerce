import { useState } from "react";
import { FiX, FiChevronLeft, FiChevronRight } from "react-icons/fi";
import { motion, AnimatePresence } from "framer-motion";
import LazyImage from "../LazyImage";
import useSwipeGesture from "../../../modules/user/hooks/useSwipeGesture";
import { getOptimizedImageUrl } from "../../utils/helpers";

const ImageGallery = ({ images, productName = "Product", children }) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);

  // Ensure images is an array
  const imageArray =
    Array.isArray(images) && images.length > 0
      ? images
      : [images].filter(Boolean);

  if (imageArray.length === 0) {
    return (
      <div className="w-full aspect-square bg-gradient-to-br from-gray-100 to-gray-200 rounded-2xl flex items-center justify-center">
        <p className="text-gray-400">No image available</p>
      </div>
    );
  }

  const handleThumbnailClick = (index) => {
    setSelectedIndex(index);
  };

  const handleNext = () => {
    setSelectedIndex((prev) => (prev + 1) % imageArray.length);
  };

  const handlePrevious = () => {
    setSelectedIndex(
      (prev) => (prev - 1 + imageArray.length) % imageArray.length
    );
  };

  const handleImageClick = () => {
    setIsLightboxOpen(true);
  };

  // Swipe gestures for image navigation
  const swipeHandlers = useSwipeGesture({
    onSwipeLeft: handleNext,
    onSwipeRight: handlePrevious,
    threshold: 50,
  });

  return (
    <>
      <div className="w-full flex flex-col gap-6">
        {/* Main Image */}
        <div
          className="w-full h-[60vh] md:h-[600px] bg-white rounded-3xl p-4 shadow-sm border border-gray-100 flex items-center justify-center"
          data-gallery>
          <motion.div
            key={selectedIndex}
            className="w-full h-full flex items-center justify-center"
            onClick={handleImageClick}
            onTouchStart={swipeHandlers.onTouchStart}
            onTouchMove={swipeHandlers.onTouchMove}
            onTouchEnd={swipeHandlers.onTouchEnd}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}>
            <img
              src={getOptimizedImageUrl(imageArray[selectedIndex], 600)} decoding="async"
              alt={`${productName} - Image ${selectedIndex + 1}`}
              className="w-full h-full object-contain mix-blend-multiply"
              onError={(e) => {
                e.target.src =
                  "https://via.placeholder.com/500x500?text=Product+Image";
              }}
            />
          </motion.div>

          {/* Navigation Arrows (Mobile Only) */}
          {imageArray.length > 1 && (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); handlePrevious(); }}
                className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/90 rounded-full flex items-center justify-center shadow-lg transition-all duration-300 hover:bg-white hover:text-black hover:scale-110 lg:hidden">
                <FiChevronLeft className="text-gray-800 text-xl" />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); handleNext(); }}
                className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/90 rounded-full flex items-center justify-center shadow-lg transition-all duration-300 hover:bg-white hover:text-black hover:scale-110 lg:hidden">
                <FiChevronRight className="text-gray-800 text-xl" />
              </button>
            </>
          )}

          {/* Zoom Hint */}
          <div className="absolute bottom-4 right-4 bg-white/90 px-3 py-1.5 rounded-lg text-xs font-semibold text-gray-700 shadow-sm pointer-events-none opacity-0 lg:opacity-100 transition-opacity">
            Click to zoom
          </div>
        </div>

        {/* Action Buttons / Badge Area (Injected via children) */}
        {children}

        {/* Thumbnails Grid (3 Columns) */}
        {imageArray.length > 1 && (
          <div className="grid grid-cols-3 gap-3">
            {imageArray.map((image, index) => (
              <button
                key={index}
                onClick={() => handleThumbnailClick(index)}
                className={`aspect-square rounded-2xl overflow-hidden border-2 transition-all duration-300 ${selectedIndex === index
                  ? "border-primary-600 ring-2 ring-primary-50 ring-offset-2"
                  : "border-transparent hover:border-gray-300"
                  }`}>
                <LazyImage
                  src={image}
                  alt={`${productName} thumbnail ${index + 1}`}
                  className="w-full h-full object-contain bg-gray-50/50 p-1 rounded-xl"
                  onError={(e) => {
                    e.target.src =
                      "https://via.placeholder.com/100x100?text=Thumbnail";
                  }}
                />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Lightbox Modal */}
      <AnimatePresence>
        {isLightboxOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/90 z-[9999] flex items-center justify-center p-4"
            onClick={() => setIsLightboxOpen(false)}>
            <button
              onClick={() => setIsLightboxOpen(false)}
              className="absolute top-4 right-4 w-12 h-12 bg-white/10 rounded-full flex items-center justify-center text-white transition-colors z-10">
              <FiX className="text-2xl" />
            </button>

            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="relative max-w-7xl max-h-[90vh] w-full">
              <img
                src={getOptimizedImageUrl(imageArray[selectedIndex], 1000)} decoding="async"
                alt={`${productName} - Full view`}
                className="w-full h-full object-contain max-h-[90vh] rounded-lg"
                onError={(e) => {
                  e.target.src =
                    "https://via.placeholder.com/800x800?text=Product+Image";
                }}
              />

              {/* Navigation in Lightbox */}
              {imageArray.length > 1 && (
                <>
                  <button
                    onClick={handlePrevious}
                    className="absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 bg-white/10 rounded-full flex items-center justify-center text-white transition-colors">
                    <FiChevronLeft className="text-2xl" />
                  </button>
                  <button
                    onClick={handleNext}
                    className="absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 bg-white/10 rounded-full flex items-center justify-center text-white transition-colors">
                    <FiChevronRight className="text-2xl" />
                  </button>
                </>
              )}

              {/* Image Counter */}
              {imageArray.length > 1 && (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/50 text-white px-4 py-2 rounded-lg text-sm">
                  {selectedIndex + 1} / {imageArray.length}
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default ImageGallery;
