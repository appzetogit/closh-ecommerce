import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import ProfileSidebar from './ProfileSidebar';
import { History, ShieldCheck, RefreshCcw, Truck, ChevronLeft, MapPin, ChevronDown, RefreshCw } from 'lucide-react';
import { useUserLocation } from '../../context/LocationContext';
import LocationModal from '../../components/Header/LocationModal';

const AccountLayout = ({ children, isMenuPage = false, hideHeader = false }) => {
    const navigate = useNavigate();
    const location = useLocation();
    const { activeAddress } = useUserLocation();
    const [isMobile, setIsMobile] = useState(window.innerWidth < 1024); // lg breakpoint
    const [isLocationModalOpen, setIsLocationModalOpen] = useState(false);
    const [isRefreshing, setIsRefreshing] = useState(false);

    const handleRefresh = useCallback(async () => {
        if (isRefreshing) return;
        setIsRefreshing(true);
        // Dispatch a custom event that child pages can listen to for data re-fetch
        window.dispatchEvent(new CustomEvent('user-panel-refresh'));
        // Give time for the data fetches to initiate and animate the spinner
        await new Promise(resolve => setTimeout(resolve, 1200));
        setIsRefreshing(false);
    }, [isRefreshing]);

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 1024);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Helper to get page title based on path
    const getPageTitle = () => {
        const path = location.pathname;
        if (path.includes('profile')) return 'My Profile';
        if (path.includes('orders')) return 'My Orders';
        if (path.includes('addresses')) return 'My Addresses';
        if (path.includes('offers')) return 'My Offers';
        if (path.includes('wallet')) return 'CLOSH Wallet';
        if (path.includes('refer')) return 'Refer & Earn';
        return 'Account';
    };

    return (
        <div className="bg-white text-gray-900 min-h-screen pb-12">
            <div className="max-w-7xl mx-auto px-4 md:px-8 lg:px-12 py-4 md:py-8">
                {/* Mobile Back Header */}
                {isMobile && !hideHeader && (
                    <div className="flex items-center gap-3 mb-4 bg-gray-50 p-3 rounded-2xl shadow-sm border border-gray-200">
                        <button
                            onClick={() => {
                                if (isMenuPage) {
                                    navigate('/');
                                } else {
                                    navigate('/account');
                                }
                            }}
                            className="w-10 h-10 bg-black text-white rounded-xl flex items-center justify-center active:scale-95 transition-all shadow-[0_0_15px_rgba(212,175,55,0.3)]"
                        >
                            <ChevronLeft size={20} strokeWidth={3} />
                        </button>
                        <h1 className="font-bold text-lg text-gray-900 flex-1 truncate">{getPageTitle()}</h1>
                        <button
                            onClick={handleRefresh}
                            disabled={isRefreshing}
                            className="w-10 h-10 bg-white text-gray-600 rounded-xl flex items-center justify-center active:scale-95 transition-all border border-gray-200 hover:bg-gray-50 hover:text-black disabled:opacity-50"
                            title="Refresh page"
                        >
                            <RefreshCw size={18} strokeWidth={2.5} className={isRefreshing ? 'animate-spin' : ''} />
                        </button>
                    </div>
                )}

                <div className="flex flex-col lg:flex-row gap-8">
                    {/* Hide sidebar on mobile detail pages */}
                    {(!isMobile || isMenuPage) && <ProfileSidebar />}

                    {/* Hide detail content on mobile account menu */}
                    {(!isMobile || !isMenuPage) && (
                        <main className="flex-1">
                            {/* Desktop Header Title & Refresh */}
                            {!isMobile && (
                                <div className="flex items-center justify-between mb-6 px-4">
                                    <h1 className="text-2xl font-black text-black tracking-tight uppercase">
                                        {getPageTitle()}
                                    </h1>
                                    <button
                                        onClick={handleRefresh}
                                        disabled={isRefreshing}
                                        className="flex items-center gap-2 px-4 py-2 bg-white text-gray-600 rounded-xl border border-gray-200 hover:bg-black hover:text-white transition-all active:scale-95 shadow-sm disabled:opacity-50"
                                    >
                                        <RefreshCw size={18} className={isRefreshing ? 'animate-spin' : ''} />
                                        <span className="text-[11px] font-bold uppercase tracking-wider">Refresh Data</span>
                                    </button>
                                </div>
                            )}
                            <div className="bg-gray-50 rounded-[32px] shadow-2xl border border-gray-200 p-4 md:p-8 min-h-[400px] md:min-h-[500px]">
                                {children}
                            </div>
                        </main>
                    )}
                </div>

                {/* Benefits Section - Hide on mobile detail pages to keep it clean */}
                {(!isMobile || isMenuPage) && (
                    <div className="mt-8 overflow-x-auto scrollbar-hide">
                        <div className="flex justify-between min-w-max md:min-w-0 w-full border-t border-gray-200 pt-6 pb-6 lg:pb-8 gap-4 px-2">
                            {[
                                { icon: <ShieldCheck size={20} />, label: 'Secure Payments' },
                                { icon: <History size={20} />, label: 'Genuine Product' },
                                { icon: <RefreshCcw size={20} />, label: 'Click Connect Collect' },
                                { icon: <Truck size={20} />, label: '24 Hour Return' }
                            ].map((item, idx) => (
                                <div key={idx} className="flex flex-col items-center gap-1.5 px-2 flex-1 group min-w-[80px]">
                                    <div className="text-gray-400 group-hover:text-black transition-colors">{item.icon}</div>
                                    <span className="text-[10px] md:text-[12px] font-bold text-gray-500 text-center leading-tight group-hover:text-black transition-colors">{item.label}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            <LocationModal
                isOpen={isLocationModalOpen}
                onClose={() => setIsLocationModalOpen(false)}
            />
        </div>
    );
};

export default AccountLayout;
