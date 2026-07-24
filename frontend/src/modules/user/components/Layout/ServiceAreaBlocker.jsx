import React, { useEffect, useState } from 'react';
import { MapPin, Search, Navigation } from 'lucide-react';
import { useUserLocation } from '../../context/LocationContext';
import { useLocation } from 'react-router-dom';
import { useAuthStore } from '../../../../shared/store/authStore';

const ServiceAreaBlocker = ({ children }) => {
    const { activeAddress, serviceability } = useUserLocation();
    const location = useLocation();
    const { isAuthenticated } = useAuthStore();

    // Pages that should NEVER be blocked, even if out of service area
    const unblockedPaths = [
        '/profile', '/orders', '/addresses', '/login', '/register', 
        '/terms', '/privacy', '/about', '/contact', '/support', '/legal',
        '/refund', '/return', '/shipping'
    ];

    const isUnblocked = unblockedPaths.some(path => location.pathname.startsWith(path));

    if (isUnblocked) {
        return children;
    }

    // If still loading serviceability, we can either wait or show children.
    if (serviceability?.loading) {
        return children; // Let normal skeletons handle loading states
    }

    const openLocationModal = () => {
        window.dispatchEvent(new Event('openLocationModal'));
    };

    // Case 1: No address selected at all
    // If user is NOT logged in, let them browse freely without location requirement
    if (!activeAddress) {
        if (!isAuthenticated) {
            return children;
        }
        return (
            <div className="flex flex-col items-center justify-center min-h-[70vh] px-4 text-center animate-fadeIn">
                <div className="w-24 h-24 bg-gray-50 rounded-full flex items-center justify-center mb-6 shadow-inner">
                    <MapPin size={40} className="text-gray-400" />
                </div>
                <h2 className="text-2xl font-black text-black mb-3">Where are you?</h2>
                <p className="text-gray-500 font-medium mb-8 max-w-sm">
                    Please select your location so we can show you products available in your area.
                </p>
                <button
                    onClick={openLocationModal}
                    className="bg-black text-white px-8 py-4 rounded-2xl font-bold flex items-center gap-2 hover:bg-gray-900 transition-all active:scale-95 shadow-xl shadow-black/10"
                >
                    <Search size={20} />
                    Select Location
                </button>
            </div>
        );
    }

    // Case 2: Address selected, but NOT serviceable (only block for logged-in users)
    if (isAuthenticated && serviceability && serviceability.isServiceable === false) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[70vh] px-4 text-center animate-fadeIn">
                <div className="w-24 h-24 bg-red-50 rounded-full flex items-center justify-center mb-6 shadow-inner relative overflow-hidden">
                    <div className="absolute inset-0 bg-red-100/50 animate-pulse" />
                    <Navigation size={40} className="text-red-500 relative z-10" />
                </div>
                <h2 className="text-3xl font-black text-black mb-3 tracking-tight">Out of Delivery Zone</h2>
                <p className="text-gray-500 font-medium mb-8 max-w-md">
                    {serviceability.message || "We don't currently deliver to this location. We are expanding rapidly and hope to serve you soon!"}
                </p>
                
                <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
                    <button
                        onClick={openLocationModal}
                        className="bg-black text-white px-8 py-4 rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-gray-900 transition-all active:scale-95 shadow-xl shadow-black/10"
                    >
                        <MapPin size={20} />
                        Change Location
                    </button>
                    
                    <button
                        onClick={() => window.location.reload()}
                        className="bg-white text-black border-2 border-gray-100 px-8 py-4 rounded-2xl font-bold hover:border-gray-200 transition-all active:scale-95"
                    >
                        Retry
                    </button>
                </div>

                <div className="mt-12 p-4 bg-gray-50 rounded-2xl border border-gray-100 max-w-sm w-full text-left">
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Current Selected Location</p>
                    <p className="text-sm font-bold text-gray-900 line-clamp-2">{activeAddress.address || activeAddress.city}</p>
                </div>
            </div>
        );
    }

    // Normal behavior (serviceable)
    return children;
};

export default ServiceAreaBlocker;
