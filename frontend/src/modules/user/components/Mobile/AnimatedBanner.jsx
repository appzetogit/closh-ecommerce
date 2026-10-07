import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { matchPath, useNavigate } from "react-router-dom";
import { FiArrowRight, FiZap, FiTag } from "react-icons/fi";

// Hero images for the parallax effect
import sneakersImg from "../../../../../data/products/sneakers.png";
import watchImg from "../../../../../data/products/stylish watch.png";
import sunglassImg from "../../../../../data/products/sunglass.png";
import { getOptimizedImageUrl } from "../../../../shared/utils/helpers";

const defaultBanners = [
  {
    id: 1,
    title: "Flash Sale",
    subtitle: "Limited Time Offer",
    discount: "Up to 50% OFF",
    description: "Shop now before it ends!",
    gradient: "from-red-500 via-pink-500 to-orange-500",
    link: "/flash-sale",
    icon: FiZap,
    heroImage: sneakersImg,
  },
  {
    id: 2,
    title: "Daily Deals",
    subtitle: "New Deals Every Day",
    discount: "Save 30%",
    description: "Check out today's best deals",
    gradient: "from-blue-500 via-purple-500 to-indigo-500",
    link: "/daily-deals",
    icon: FiTag,
    heroImage: sunglassImg,
  },
  {
    id: 3,
    title: "Special Offers",
    subtitle: "Exclusive Discounts",
    discount: "Up to 40% OFF",
    description: "Don't miss out!",
    gradient: "from-green-500 via-teal-500 to-cyan-500",
    link: "/offers",
    icon: FiTag,
    heroImage: watchImg,
  },
];

const gradientPalette = [
  "from-red-500 via-pink-500 to-orange-500",
  "from-blue-500 via-purple-500 to-indigo-500",
  "from-green-500 via-teal-500 to-cyan-500",
];

const KNOWN_USER_ROUTE_PATTERNS = [
  "/",
  "/home",
  "/search",
  "/offers",
  "/daily-deals",
  "/flash-sale",
  "/new-arrivals",
  "/categories",
  "/category/:id",
  "/brand/:id",
  "/seller/:id",
  "/product/:id",
  "/sale/:slug",
  "/track-order/:orderId",
];

const getPathnameFromTarget = (target) =>
  String(target || "").trim().split("?")[0].split("#")[0];

const isKnownInternalRoute = (target) => {
  const pathname = getPathnameFromTarget(target);
  if (!pathname) return false;
  return KNOWN_USER_ROUTE_PATTERNS.some((pattern) =>
    !!matchPath({ path: pattern, end: true }, pathname)
  );
};

const resolveBannerLink = (banner) => {
  const candidate = String(
    banner?.linkUrl || banner?.link || banner?.url || ""
  ).trim();
  if (!candidate) return "";
  if (isExternalLink(candidate)) return candidate;
  if (isSafeInternalPath(candidate) && isKnownInternalRoute(candidate))
    return candidate;
  return "";
};

const isExternalLink = (target) => /^https?:\/\//i.test(String(target || "").trim());
const isSafeInternalPath = (target) => String(target || "").startsWith("/");

const AnimatedBanner = ({ banners = null }) => {
  const navigate = useNavigate();
  const [currentBanner, setCurrentBanner] = useState(0);

  const resolvedBanners =
    Array.isArray(banners) && banners.length > 0
      ? banners.map((banner, index) => ({
          id: banner.id || `banner-${index}`,
          title: banner.title || "Special Offer",
          subtitle: banner.subtitle || "Limited Time",
          discount: banner.discount || "Shop Now",
          description: banner.description || "",
          gradient:
            banner.gradient || gradientPalette[index % gradientPalette.length],
          link: resolveBannerLink(banner),
          icon: banner.icon || FiTag,
          heroImage: banner.image || banner.heroImage || watchImg,
        }))
      : defaultBanners;

  const handleBannerClick = (target) => {
    const normalizedTarget = String(target || "").trim();
    if (!normalizedTarget) return;
    if (isExternalLink(normalizedTarget)) {
      window.open(normalizedTarget, "_blank", "noopener,noreferrer");
      return;
    }
    if (isSafeInternalPath(normalizedTarget) && isKnownInternalRoute(normalizedTarget)) {
      navigate(normalizedTarget);
    }
  };

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentBanner((prev) => (prev + 1) % resolvedBanners.length);
    }, 4000);
    return () => clearInterval(interval);
  }, [resolvedBanners.length]);

  return (
    <div className="px-3 py-1">
      <div className="relative w-full h-20 sm:h-24 md:h-28 rounded-xl overflow-hidden shadow-md">
        <AnimatePresence mode="wait">
          {resolvedBanners.map((banner, index) => {
            if (index !== currentBanner) return null;
            const Icon = banner.icon;

            return (
              <motion.div
                key={banner.id}
                initial={{ opacity: 0, scale: 1.1, x: "100%" }}
                animate={{ opacity: 1, scale: 1, x: 0 }}
                exit={{ opacity: 0, scale: 0.95, x: "-100%" }}
                transition={{
                  duration: 0.5,
                  ease: [0.25, 0.1, 0.25, 1],
                }}
                style={{ willChange: "transform, opacity" }}
                className={`absolute inset-0 bg-gradient-to-br ${banner.gradient} p-3 relative`}>
                {/* 3D Depth Parallax Background */}
                <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
                  {/* Layer 1: Background (Blurred Product) */}
                  <motion.div
                    initial={{ opacity: 0, scale: 1.5, rotate: -5, x: 50 }}
                    animate={{ opacity: 0.2, scale: 1.8, rotate: 0, x: 0 }}
                    transition={{ duration: 10, repeat: Infinity, repeatType: "reverse" }}
                    className="absolute right-[-10%] top-[-10%] w-[120%] h-[120%]"
                  >
                    <img
                      src={getOptimizedImageUrl(banner.heroImage, 800)} decoding="async"
                      className="w-full h-full object-contain blur-2xl opacity-40 brightness-150"
                      alt=""
                    />
                  </motion.div>

                  {/* Layer 2: Midground (Bokeh Particles) */}
                  {[...Array(6)].map((_, i) => (
                    <motion.div
                      key={i}
                      initial={{
                        opacity: 0,
                        x: Math.random() * 200,
                        y: Math.random() * 100
                      }}
                      animate={{
                        opacity: [0, 0.4, 0],
                        x: [null, Math.random() * -100],
                        y: [null, Math.random() * -50],
                      }}
                      transition={{
                        duration: 3 + Math.random() * 4,
                        repeat: Infinity,
                        delay: i * 0.5
                      }}
                      className="absolute w-1 h-1 bg-white rounded-full blur-[1px]"
                      style={{
                        right: `${10 + (i * 15)}%`,
                        top: `${20 + (i * 10)}%`,
                      }}
                    />
                  ))}

                  {/* Layer 3: Foreground (Sharp Hero Product) */}
                  <div className={`absolute right-[5%] top-1/2 -translate-y-1/2 w-32 h-32 flex items-center justify-center ${banner.id === 2 ? 'pb-6' : ''}`}>
                    <motion.div
                      initial={{ opacity: 0, x: 100, scale: 0.5, rotate: 10 }}
                      animate={{ opacity: 1, x: 0, scale: 1.1, rotate: 0 }}
                      transition={{
                        type: "spring",
                        stiffness: 80,
                        damping: 12,
                        delay: 0.2
                      }}
                    >
                      <motion.img
                        src={banner.heroImage}
                        alt="Hero Product"
                        className="w-full h-full object-contain drop-shadow-[0_20px_30px_rgba(0,0,0,0.5)]"
                        animate={{
                          y: [0, -5, 0],
                          rotate: [0, 2, -2, 0]
                        }}
                        transition={{
                          duration: 4,
                          repeat: Infinity,
                          ease: "easeInOut"
                        }}
                      />
                    </motion.div>
                  </div>
                </div>

                {/* Content */}
                <button
                  type="button"
                  onClick={() => handleBannerClick(banner.link)}
                  disabled={!banner.link}
                  className="relative z-10 h-full flex pt-2 justify-between group">
                  <div className="flex-1">
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2 }}
                      className="flex items-center gap-2 mb-0">
                      <motion.div
                        animate={{
                          scale: [1, 1.2, 1],
                          rotate: [0, 10, -10, 0],
                        }}
                        transition={{
                          duration: 2,
                          repeat: Infinity,
                          ease: "easeInOut",
                        }}>
                        <Icon className="text-white text-lg drop-shadow-lg" />
                      </motion.div>
                      <motion.span
                        className="text-white/90 text-xs font-medium"
                        animate={{
                          opacity: [0.9, 1, 0.9],
                        }}
                        transition={{
                          duration: 2,
                          repeat: Infinity,
                          ease: "easeInOut",
                        }}>
                        {banner.subtitle}
                      </motion.span>
                    </motion.div>

                    <motion.h3
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.3 }}
                      className="text-white text-xl font-extrabold mb-0 drop-shadow-lg relative inline-block">
                      {banner.title}
                    </motion.h3>

                    <motion.p
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.4 }}
                      className="text-white/90 text-xs mb-1">
                      {banner.description}
                    </motion.p>

                    <motion.div
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.5, type: "spring" }}
                      style={{
                        willChange: "transform",
                        transform: "translateZ(0)",
                      }}
                      className="inline-flex items-center gap-2 bg-white/25 px-3 py-1.5 rounded-full relative overflow-hidden"
                      whileTap={{ scale: 0.95 }}>
                      <span className="text-white font-bold text-sm relative z-10">
                        {banner.discount}
                      </span>
                      <FiArrowRight className="text-white text-sm relative z-10" />
                    </motion.div>
                  </div>
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>

        {/* Indicator Dots */}
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5 z-20">
          {resolvedBanners.map((_, index) => (
            <button
              key={index}
              onClick={() => setCurrentBanner(index)}
              className="focus:outline-none">
              <motion.div
                animate={{
                  width: index === currentBanner ? 24 : 6,
                  opacity: index === currentBanner ? 1 : 0.5,
                }}
                transition={{ duration: 0.3 }}
                className={`h-1.5 rounded-full bg-white ${index === currentBanner ? "w-6" : "w-1.5"
                  }`}
              />
            </button>
          ))}
        </div>
      </div>
    </div >
  );
};

export default AnimatedBanner;
