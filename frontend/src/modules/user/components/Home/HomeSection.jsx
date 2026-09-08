import React from 'react';
import { useNavigate } from 'react-router-dom';
import { FiChevronRight } from 'react-icons/fi';

/**
 * Shared frame for every home-page block: bold title with a short accent
 * underline, optional subtitle, optional "View all" link on the right.
 */
const HomeSection = ({ title, subtitle, viewAllTo, children, className = '', titleClassName = '' }) => {
    const navigate = useNavigate();

    return (
        <section className={`w-full bg-white py-4 md:py-6 ${className}`}>
            <div className="max-w-[1600px] mx-auto px-4 md:px-8">
                {(title || viewAllTo) && (
                    <div className="flex items-end justify-between gap-3 mb-3 md:mb-4">
                        <div className="min-w-0">
                            {title && (
                                <h2 className={`text-[17px] md:text-[24px] font-black text-gray-900 tracking-tight leading-none truncate ${titleClassName}`}>
                                    {title}
                                </h2>
                            )}
                            {subtitle && (
                                <p className="text-[11px] md:text-[13px] text-gray-500 font-medium mt-1 truncate">{subtitle}</p>
                            )}
                            {title && <div className="w-8 h-[3px] bg-gray-900 rounded-full mt-2" />}
                        </div>
                        {viewAllTo && (
                            <button
                                onClick={() => navigate(viewAllTo)}
                                className="shrink-0 flex items-center gap-0.5 text-[11px] md:text-[12px] font-bold text-gray-500 hover:text-gray-900 transition-colors whitespace-nowrap"
                            >
                                View all <FiChevronRight className="w-3.5 h-3.5" />
                            </button>
                        )}
                    </div>
                )}
                {children}
            </div>
        </section>
    );
};

export default HomeSection;
