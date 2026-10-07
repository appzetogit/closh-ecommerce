import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { getOptimizedImageUrl } from "../utils/helpers";

const CategoryCard = ({ category }) => {
  const categoryLink = `/category/${category.id}`;

  return (
    <Link to={categoryLink} className="block h-full">
      <motion.div
        whileHover={{ scale: 1.05, y: -5 }}
        className="glass-card rounded-2xl overflow-hidden cursor-pointer hover-lift group h-full flex flex-col">
        <div className="w-full h-24 md:h-32 bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center overflow-hidden relative">
          <img
            src={getOptimizedImageUrl(category.image, 150)} loading="lazy" decoding="async"
            alt={category.name}
            className="w-full h-full object-contain scale-50 group-hover:scale-65 transition-transform duration-500"
            onError={(e) => {
              e.target.src =
                "https://via.placeholder.com/200x200?text=Category";
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
        </div>
        <div className="p-3 flex-1 flex items-center justify-center">
          <h3 className="text-sm font-bold text-gray-800 text-center group-hover:text-gradient transition-colors">
            {category.name}
          </h3>
        </div>
      </motion.div>
    </Link>
  );
};

export default CategoryCard;
