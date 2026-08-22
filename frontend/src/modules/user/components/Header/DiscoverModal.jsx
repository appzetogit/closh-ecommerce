import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Search, Bookmark, X } from 'lucide-react';
import { useBrandStore } from '../../../../shared/store/brandStore';

const alphabets = ['#', '2', '7', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z'];

const DiscoverModal = ({ isOpen, onClose }) => {
    const navigate = useNavigate();
    const { brands, initialize, isLoading } = useBrandStore();
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        if (isOpen) {
            initialize();
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = 'unset';
        }
        return () => {
            document.body.style.overflow = 'unset';
        };
    }, [isOpen, initialize]);

    const filteredBrands = useMemo(() => {
        if (!brands) return [];
        return brands.filter(brand =>
            brand.name.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [brands, searchTerm]);

    if (!isOpen) return null;

    const handleBrandClick = (brandName) => {
        navigate(`/products?brand=${encodeURIComponent(brandName)}`);
        onClose();
    };

    const getBrandsByInitial = (char) => {
        if (!brands) return [];
        return brands.filter(b => {
            const firstChar = b.name.charAt(0).toUpperCase();
            if (char === '#' && /\d/.test(firstChar)) return true;
            return firstChar === char;
        });
    };

    const modalContent = (
        <div className="fixed inset-0 z-[9999] flex items-start justify-center md:pt-20 md:px-4 overflow-hidden">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/70 backdrop-blur-2xl transition-all duration-500" onClick={onClose} />

            {/* Modal Content */}
            <div className="relative w-full h-full md:h-[600px] md:max-w-[1000px] bg-white md:rounded-[32px] overflow-hidden shadow-2xl animate-fadeInUp flex flex-col md:flex-row border-0 md:border md:border-gray-200">
                {/* Left Side: Search */}
                <div className="w-full md:w-[300px] border-b md:border-b-0 md:border-r border-gray-200 flex flex-col p-4 md:p-6 bg-white shrink-0 md:h-full">
                    <div className="relative">
                        <input
                            type="text"
                            placeholder="Search for Brands"
                            className="w-full bg-gray-50 border border-gray-200 rounded-2xl py-3.5 pl-11 pr-4 text-gray-900 text-[14px] font-medium outline-none focus:border-black/50 transition-colors placeholder:text-gray-400"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                    </div>
                </div>

                {/* Right Side: Brand Grid */}
                <div className="flex-1 flex flex-col overflow-hidden bg-gray-50 h-full">
                    <div className="flex justify-between items-center px-4 md:px-8 py-4 md:py-6 border-b border-gray-200">
                        <h2 className="text-gray-900 text-lg md:text-xl font-bold uppercase ">
                            Featured Brands
                            {filteredBrands.length > 0 && (
                                <span className="ml-2 text-[11px] font-bold text-gray-400 normal-case">
                                    {filteredBrands.length}
                                </span>
                            )}
                        </h2>
                        <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full transition-colors font-bold text-gray-900 md:hidden">
                             <X size={20} />
                        </button>
                        <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full transition-colors font-bold text-gray-900 hidden md:block">
                             <X size={24} />
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 md:p-8">
                        {isLoading && brands.length === 0 ? (
                            <div className="flex items-center justify-center h-full">
                                <div className="text-gray-400 font-bold uppercase tracking-widest animate-pulse">Loading Brands...</div>
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 lg:grid-cols-3 gap-6">
                                {filteredBrands.map((brand, idx) => (
                                    <div
                                        key={brand.id || idx}
                                        onClick={() => handleBrandClick(brand.name)}
                                        className="group relative aspect-square bg-white rounded-[24px] border border-gray-200 flex flex-col items-center justify-center p-6 cursor-pointer hover:border-black/30 hover:bg-gray-50 hover:shadow-lg transition-all duration-500"
                                    >
                                        <Bookmark className="absolute top-4 right-4 text-gray-300 group-hover:text-black transition-colors" size={20} />

                                        <div className="w-24 h-24 mb-4 flex items-center justify-center">
                                            {brand.logo ? (
                                                <img src={brand.logo} alt={brand.name} className="max-w-full max-h-full object-contain transition-all duration-500" />
                                            ) : (
                                                <span className="text-gray-900 text-xl font-bold text-center break-words px-2">{brand.name}</span>
                                            )}
                                        </div>

                                        <span className="absolute bottom-6 text-[12px] font-bold uppercase text-black opacity-0 group-hover:opacity-100 transition-all">Shop Now</span>
                                    </div>
                                ))}
                                {filteredBrands.length === 0 && !isLoading && (
                                    <div className="col-span-full text-center py-20 text-gray-400 font-bold uppercase tracking-tight">
                                        No Brands found for "{searchTerm}"
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );

    return createPortal(modalContent, document.body);
};

export default DiscoverModal;
