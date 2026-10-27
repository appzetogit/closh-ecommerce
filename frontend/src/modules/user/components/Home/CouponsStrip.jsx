import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Tag, ChevronRight } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../../../shared/utils/api';
import { formatPrice } from '../../../../shared/utils/helpers';

const headline = (c) => {
    if (c.type === 'freeship') return 'Free delivery';
    if (c.type === 'percentage') return `${c.value}% OFF`;
    return `${formatPrice(c.value)} OFF`;
};

const detail = (c) => {
    const parts = [];
    if (c.minOrderValue > 0) parts.push(`On orders above ${formatPrice(c.minOrderValue)}`);
    else parts.push('No minimum order');
    if (c.type === 'percentage' && c.maxDiscount) parts.push(`Up to ${formatPrice(c.maxDiscount)}`);
    return parts.join(' · ');
};

const copyCode = async (code) => {
    try {
        await navigator.clipboard.writeText(code);
        toast.success(`${code} copied`);
    } catch {
        toast(`Use code ${code} at checkout`);
    }
};

/**
 * Live coupons from the admin-managed Coupons list (same source as the Offers
 * page), as a swipeable row of cards. Renders nothing when there are none.
 */
const CouponsStrip = () => {
    const [coupons, setCoupons] = useState(null);

    useEffect(() => {
        let cancelled = false;
        api.get('/coupons/available')
            .then((res) => {
                const list = Array.isArray(res?.data) ? res.data : (Array.isArray(res) ? res : []);
                // The API doesn't drop fully-redeemed coupons; a card for one would only disappoint.
                const usable = list.filter((c) => !(c.usageLimit > 0 && c.usedCount >= c.usageLimit));
                if (!cancelled) setCoupons(usable.slice(0, 10));
            })
            .catch(() => { if (!cancelled) setCoupons([]); });
        return () => { cancelled = true; };
    }, []);

    if (!coupons || coupons.length === 0) return null;

    return (
        <section className="w-full bg-white py-3 md:py-5">
            <div className="max-w-[1600px] mx-auto">
                <div className="flex items-center justify-between px-4 md:px-8 mb-2.5 md:mb-4">
                    <h2 className="flex items-center gap-2 text-[15px] md:text-xl font-black text-gray-900 tracking-tight">
                        <Tag size={18} strokeWidth={2.4} /> Offers for you
                    </h2>
                    <Link to="/offers" className="flex items-center text-[12px] md:text-sm font-bold text-gray-600 hover:text-black">
                        View all <ChevronRight size={16} />
                    </Link>
                </div>
                <div className="flex gap-3 overflow-x-auto px-4 md:px-8 pb-1 scroll-px-4 md:scroll-px-8 snap-x snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    {coupons.map((c) => (
                        <div
                            key={c.code}
                            className="snap-start shrink-0 w-[250px] md:w-[300px] flex rounded-xl md:rounded-2xl border border-[#FFC629]/50 bg-[#FFF8E1] overflow-hidden"
                        >
                            <div className="flex-1 min-w-0 p-3 md:p-4">
                                <p className="text-[15px] md:text-lg font-black text-gray-900 leading-tight">{headline(c)}</p>
                                <p className="text-[10px] md:text-[12px] text-gray-600 font-medium leading-snug mt-0.5">{detail(c)}</p>
                                {c.isFirstOrderOnly && (
                                    <p className="text-[9px] md:text-[10px] font-bold text-emerald-700 uppercase tracking-wide mt-1">First order only</p>
                                )}
                            </div>
                            <button
                                type="button"
                                onClick={() => copyCode(c.code)}
                                className="shrink-0 w-[92px] md:w-[104px] border-l-2 border-dashed border-[#FFC629]/70 bg-white/60 flex flex-col items-center justify-center gap-0.5 active:scale-95 transition-transform"
                                aria-label={`Copy coupon code ${c.code}`}
                            >
                                <span className="text-[13px] md:text-[14px] font-black text-gray-900 tracking-tight break-all px-1 text-center leading-tight">{c.code}</span>
                                <span className="text-[9px] md:text-[10px] font-bold text-gray-500 uppercase tracking-widest">Tap to copy</span>
                            </button>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
};

export default CouponsStrip;
