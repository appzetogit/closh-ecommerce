import { Link, useNavigate } from "react-router-dom";
import { useCartStore, useUIStore } from "../../../../shared/store/useStore";
import { useWishlistStore } from "../../../../shared/store/wishlistStore";
import { useAuthStore } from "../../../../shared/store/authStore";
import { appLogo } from "../../../../data/logos";
import SearchBar from "../../../../shared/components/SearchBar";
import { FiHeart, FiShoppingBag, FiUser, FiLogOut, FiGrid, FiCompass, FiMapPin, FiChevronDown, FiChevronRight } from "react-icons/fi";
import { HiOutlineUserCircle } from "react-icons/hi";
import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useUserNotificationStore } from "../../store/userNotificationStore";
import { categories } from "../../../../data/categories";
import { useUserLocation } from "../../context/LocationContext";
import LocationModal from "./LocationModal";
import { getOptimizedImageUrl } from "../../../../shared/utils/helpers";

const DesktopHeader = () => {
    const navigate = useNavigate();
    const { user, isAuthenticated, logout } = useAuthStore();
    const itemCount = useCartStore((state) => state.getItemCount());
    const wishlistCount = useWishlistStore((state) => state.getItemCount());
    const unreadCount = useUserNotificationStore((state) => state.unreadCount);
    const ensureHydrated = useUserNotificationStore((state) => state.ensureHydrated);
    const toggleCart = useUIStore((state) => state.toggleCart);

    const [showUserMenu, setShowUserMenu] = useState(false);
    const [isLocationModalOpen, setIsLocationModalOpen] = useState(false);
    const userMenuRef = useRef(null);
    const { activeAddress, serviceability } = useUserLocation();

    useEffect(() => {
        ensureHydrated();
    }, [ensureHydrated, isAuthenticated]);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (userMenuRef.current && !userMenuRef.current.contains(event.target)) {
                setShowUserMenu(false);
            }
        };

        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const handleLogout = () => {
        logout();
        setShowUserMenu(false);
        navigate("/home");
    };

    const NavItem = ({ to, icon: Icon, label, badgeCount, onClick }) => {
        const Component = to ? Link : "button";
        return (
            <Component
                to={to}
                onClick={onClick}
                className="flex items-center gap-2.5 group relative px-3 py-2 rounded-xl hover:bg-gray-50 transition-all duration-300"
            >
                <div className="relative flex items-center justify-center">
                    <Icon className="text-xl text-gray-700 group-hover:text-primary-600 transition-colors" />
                    {badgeCount > 0 && (
                        <span className="absolute -top-2.5 -right-2.5 w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center border-2 border-white shadow-sm">
                            {badgeCount > 9 ? "9+" : badgeCount}
                        </span>
                    )}
                </div>
                <span className="text-sm font-bold text-gray-700 group-hover:text-primary-600 transition-colors">
                    {label}
                </span>
            </Component>
        );
    };

    const handleCartClick = (e) => {
        if (!isAuthenticated) {
            e?.preventDefault();
            navigate('/login');
        } else {
            toggleCart();
        }
    };

    return (
        <>
        <header className="hidden md:block sticky top-0 z-[999] bg-white border-b border-gray-100 shadow-sm">
            {/* Serviceability Banner */}
            {!serviceability?.loading && !serviceability?.isServiceable && activeAddress && (
                <div className="w-full bg-red-600 text-white text-[12px] md:text-[14px] font-bold text-center py-2 px-4 shadow-md z-[1000] relative animate-fadeIn">
                    {serviceability?.message || "This service is not available in your city"}
                </div>
            )}
            {/* Main Header Row - Based on Image 1 */}
            <div className="container mx-auto px-4 md:px-6 lg:px-8 h-20 flex items-center justify-between gap-4 lg:gap-8">

                {/* Left Section: Delivery Info (Matching Image 1 Exactly) */}
                <div className="flex items-center gap-4 flex-shrink-0">
                    <Link to="/home" className="flex-shrink-0 mr-4 group no-underline">

                    </Link>

                    <div 
                        className="flex items-center gap-3 cursor-pointer group/loc" 
                        onClick={() => setIsLocationModalOpen(true)}
                    >
                        {/* Black '60' box */}
                        <div className="flex items-center justify-center w-11 h-11 bg-black rounded-[12px] text-white shadow-sm">
                            <span className="text-2xl font-black leading-none tracking-tighter">60</span>
                        </div>
                        {/* Text info */}
                        <div className="flex flex-col justify-center">
                            <span className="text-[15px] font-black text-gray-900 leading-tight">delivery in 60 min</span>
                            <div className="flex items-center gap-0.5 text-[11px] text-gray-400 font-bold whitespace-nowrap hover:text-black transition-colors">
                                {activeAddress ? (
                                    <><span className="truncate max-w-[180px]">{activeAddress.address}</span> <FiChevronDown className="text-gray-400 mt-0.5 ml-0.5 group-hover/loc:text-black transition-colors shrink-0" /></>
                                ) : (
                                    <>Select location <FiChevronDown className="text-gray-400 mt-0.5 ml-0.5 group-hover/loc:text-black transition-colors shrink-0" /></>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Center Section: Search Bar (Centered and Clean) */}
                <div className="flex-1 max-w-xl mx-auto px-4">
                    <div className="relative group">
                        <SearchBar />
                    </div>
                </div>

                {/* Right Section: Navigation Actions (Horizontal Layout) */}
                <div className="flex items-center gap-1 lg:gap-3 flex-shrink-0">
                    <NavItem to="/categories" icon={FiGrid} label="Categories" />
                    <NavItem to="/discover" icon={FiCompass} label="Discover" />
                    <NavItem to="/wishlist" icon={FiHeart} label="Wishlist" badgeCount={wishlistCount} />
                    <NavItem onClick={handleCartClick} icon={FiShoppingBag} label="Cart" badgeCount={itemCount} />

                    {/* User Menu */}
                    <div ref={userMenuRef} className="relative">
                        <button
                            onClick={() => setShowUserMenu(!showUserMenu)}
                            className="flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-gray-50 transition-all duration-300 group"
                        >
                            <div className="relative">
                                {user?.avatar ? (
                                    <img
                                        src={user.avatar}
                                        alt={user.name}
                                        className="w-7 h-7 rounded-full object-cover ring-2 ring-transparent group-hover:ring-primary-100"
                                    />
                                ) : (
                                    <FiUser className="text-xl text-gray-700 group-hover:text-primary-600 transition-colors" />
                                )}
                            </div>
                            <span className="text-sm font-bold text-gray-700 group-hover:text-primary-600 transition-colors">
                                {isAuthenticated ? user?.name?.split(' ')[0] : 'User'}
                            </span>
                        </button>

                        <AnimatePresence>
                            {showUserMenu && (
                                <motion.div
                                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                                    className="absolute right-0 mt-3 bg-white rounded-2xl shadow-2xl border border-gray-100 p-2 z-[60] min-w-[220px]"
                                >
                                    {isAuthenticated ? (
                                        <>
                                            <div className="px-4 py-3 border-b border-gray-50 mb-2">
                                                <p className="font-bold text-gray-900 text-sm">{user?.name}</p>
                                                <p className="text-xs text-gray-500 truncate">{user?.email}</p>
                                            </div>
                                            <div className="space-y-1">
                                                <Link to="/profile" className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 rounded-xl transition-colors text-gray-700" onClick={() => setShowUserMenu(false)}>
                                                    <FiUser className="text-gray-400" />
                                                    <span className="text-sm font-medium">Profile</span>
                                                </Link>
                                                <Link to="/orders" className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 rounded-xl transition-colors text-gray-700" onClick={() => setShowUserMenu(false)}>
                                                    <FiShoppingBag className="text-gray-400" />
                                                    <span className="text-sm font-medium">My Orders</span>
                                                </Link>
                                                <button onClick={handleLogout} className="flex items-center gap-3 px-4 py-2.5 hover:bg-red-50 rounded-xl transition-colors text-red-600 w-full text-left mt-1">
                                                    <FiLogOut className="text-red-500" />
                                                    <span className="text-sm font-semibold">Logout</span>
                                                </button>
                                            </div>
                                        </>
                                    ) : (
                                        <div className="p-4">
                                            <p className="text-sm text-gray-600 mb-4 text-center text-pretty">Login to access your account and orders</p>
                                            <Link to="/login" onClick={() => setShowUserMenu(false)} className="block w-full text-center px-4 py-2.5 bg-black text-white rounded-xl font-bold text-sm hover:bg-gray-800 transition-colors shadow-lg shadow-gray-200">
                                                Login / Sign Up
                                            </Link>
                                        </div>
                                    )}
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </div>
            </div>

            {/* Bottom Row: Category Shortcuts (Preserving functionality with dynamic data) */}
            <div className="bg-gray-50/50 border-t border-gray-100 py-3 overflow-hidden">
                <div className="container mx-auto px-4 md:px-6 lg:px-8">
                    <div className="flex items-center gap-8 lg:gap-12 overflow-x-auto scrollbar-hide">
                        {categories.map((category) => (
                            <Link
                                key={category.id}
                                to={`/category/${category.id}`}
                                className="flex items-center gap-3 group transition-all duration-300"
                            >
                                <div className="w-10 h-10 rounded-full overflow-hidden bg-white border border-gray-100 group-hover:border-primary-500 transition-colors">
                                    <img
                                        src={getOptimizedImageUrl(category.image, 80)} loading="lazy" decoding="async"
                                        alt={category.name}
                                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                                    />
                                </div>
                                <span className="text-xs font-bold text-gray-500 group-hover:text-black whitespace-nowrap uppercase tracking-tighter">
                                    {category.name}
                                </span>
                            </Link>
                        ))}
                    </div>
                </div>
            </div>
        </header>

        <LocationModal
            isOpen={isLocationModalOpen}
            onClose={() => setIsLocationModalOpen(false)}
        />
        </>
    );
};

export default DesktopHeader;
