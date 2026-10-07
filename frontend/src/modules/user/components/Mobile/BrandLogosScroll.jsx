import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { getCatalogBrands } from '../../data/catalogData';
import { getOptimizedImageUrl } from "../../../../shared/utils/helpers";

const BrandLogosScroll = ({ brands = null }) => {
    const navigate = useNavigate();
    const fallbackBrands = getCatalogBrands().slice(0, 10);
    const displayBrands = Array.isArray(brands) && brands.length > 0
        ? brands.slice(0, 10)
        : fallbackBrands;

    return (
        <section className="bg-transparent w-full overflow-hidden">
            {/* Desktop Layout - White card container */}
            <div className="hidden md:block bg-white rounded-lg mb-4 p-4">
                <div className="w-full overflow-x-auto scrollbar-hide" style={{ WebkitOverflowScrolling: 'touch' }}>
                    <div className="flex gap-4 min-w-max pb-2">
                        {displayBrands.map((brand, index) => (
                            <motion.div
                                key={brand.id}
                                initial={{ opacity: 0, x: -20 }}
                                whileInView={{ opacity: 1, x: 0 }}
                                viewport={{ once: true, margin: "-50px" }}
                                transition={{ delay: index * 0.05, duration: 0.3 }}
                                className="flex-shrink-0 flex flex-col items-center"
                                style={{ width: '64px' }}
                            >
                                <div
                                    onClick={() => navigate(`/brand/${brand.id}`)}
                                    className="bg-white rounded-lg p-2 shadow-sm transition-all duration-300 flex items-center justify-center w-16 h-16 group cursor-pointer border border-gray-100 mb-2 hover:shadow-md hover:border-gray-200">
                                    <img
                                        src={getOptimizedImageUrl(brand.logo, 120)} loading="lazy" decoding="async"
                                        alt={brand.name}
                                        className="w-full h-full object-contain"
                                        onError={(e) => {
                                            e.target.src = 'https://via.placeholder.com/120x80?text=Brand';
                                        }}
                                        loading="lazy"
                                    />
                                </div>
                                <p className="text-xs font-medium text-gray-700 text-center truncate w-full">
                                    {brand.name}
                                </p>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Mobile Layout - Unchanged */}
            <div className="md:hidden w-full">
                <style>{`
          @media (min-width: 1024px) {
            .brand-card-desktop {
              width: 5rem !important;
              min-width: 5rem !important;
              max-width: 5rem !important;
            }
          }
          @media (min-width: 1280px) {
            .brand-card-desktop {
              width: 6rem !important;
              min-width: 6rem !important;
              max-width: 6rem !important;
            }
          }
        `}</style>
                <div className="w-full overflow-x-auto scrollbar-hide" style={{ WebkitOverflowScrolling: 'touch' }}>
                    <div className="flex gap-3 sm:gap-4 lg:gap-3 min-w-max px-4 pb-2">
                        {displayBrands.map((brand, index) => (
                            <motion.div
                                key={brand.id}
                                initial={{ opacity: 0, x: -20 }}
                                whileInView={{ opacity: 1, x: 0 }}
                                viewport={{ once: true, margin: "-50px" }}
                                transition={{ delay: index * 0.05, duration: 0.3 }}
                                className="flex-shrink-0 flex flex-col items-center brand-card-desktop"
                                style={{
                                    width: 'calc((100% - 1rem - 0.75rem * 3) / 4)',
                                    minWidth: 'calc((100% - 1rem - 0.75rem * 3) / 4)',
                                    maxWidth: 'calc((100% - 1rem - 0.75rem * 3) / 4)',
                                }}
                            >
                                <div
                                    onClick={() => navigate(`/brand/${brand.id}`)}
                                    className="bg-white rounded-lg sm:rounded-xl lg:rounded-lg p-1.5 sm:p-2 md:p-2 lg:p-1.5 xl:p-2 shadow-md transition-all duration-300 flex items-center justify-center w-full aspect-square group cursor-pointer border border-gray-100 mb-1.5 lg:mb-1 hover:shadow-lg">
                                    <img
                                        src={getOptimizedImageUrl(brand.logo, 120)} loading="lazy" decoding="async"
                                        alt={brand.name}
                                        className="w-[85%] h-[85%] lg:w-[80%] lg:h-[80%] object-contain"
                                        onError={(e) => {
                                            e.target.src = 'https://via.placeholder.com/120x80?text=Brand';
                                        }}
                                        loading="lazy"
                                    />
                                </div>
                                <p className="text-xs sm:text-sm lg:text-xs font-semibold text-black text-center transition-colors truncate w-full px-1">
                                    {brand.name}
                                </p>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </div>
        </section>
    );
};

export default BrandLogosScroll;
