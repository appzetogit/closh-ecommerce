import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ShoppingBag, DoorOpen, Sparkles, ArrowRight } from 'lucide-react';

/**
 * CLOSH's differentiator, explained in three steps. The flow described here is
 * the real Try & Buy order type: the rider waits at the door, the customer
 * accepts or rejects each item, and only the accepted items are charged
 * (cash or UPI at the door).
 */
const STEPS = [
    { icon: ShoppingBag, title: 'Order', sub: 'Pick Try & Buy at checkout' },
    { icon: DoorOpen, title: 'Try at your door', sub: 'Rider waits while you try' },
    { icon: Sparkles, title: 'Keep what fits', sub: 'Pay only for those' },
];

const TryAndBuyExplainer = () => {
    const navigate = useNavigate();

    return (
        <section className="w-full bg-white py-3 md:py-5">
            <div className="max-w-[1600px] mx-auto px-4 md:px-8">
                <div
                    className="relative overflow-hidden rounded-2xl md:rounded-3xl text-white px-4 py-5 md:px-10 md:py-9"
                    style={{ background: 'radial-gradient(120% 140% at 0% 0%, #2A1B5E 0%, #0F0B1F 55%, #090714 100%)' }}
                >
                    {/* Soft highlight so the card doesn't read as a flat black box */}
                    <div className="pointer-events-none absolute -top-16 -right-16 w-56 h-56 md:w-80 md:h-80 rounded-full bg-[#7C5CFF]/25 blur-3xl" />

                    <div className="relative">
                        <p className="text-[9px] md:text-[11px] font-black uppercase tracking-[0.22em] text-[#C4B5FD] mb-1.5">
                            CLOSH exclusive
                        </p>
                        <h2 className="text-[22px] md:text-[34px] font-black leading-none tracking-tight">
                            Try before you buy.
                        </h2>
                        <p className="text-[11px] md:text-[14px] text-white/70 font-medium mt-1.5 max-w-md">
                            No fitting-room guesswork. Try the whole order at home and keep only what you love.
                        </p>

                        <div className="grid grid-cols-3 gap-2 md:gap-4 mt-4 md:mt-7">
                            {STEPS.map(({ icon: Icon, title, sub }, i) => (
                                <div key={title} className="rounded-xl md:rounded-2xl bg-white/[0.06] border border-white/10 px-2.5 py-3 md:px-4 md:py-5">
                                    <div className="flex items-center gap-2 mb-2 md:mb-3">
                                        <span className="w-6 h-6 md:w-8 md:h-8 rounded-full bg-[#FFC629] text-gray-900 text-[10px] md:text-[13px] font-black flex items-center justify-center shrink-0">
                                            {i + 1}
                                        </span>
                                        <Icon size={16} className="text-white/80 shrink-0 hidden xs:block" />
                                    </div>
                                    <p className="text-[11px] md:text-[15px] font-black leading-tight">{title}</p>
                                    <p className="text-[9px] md:text-[12px] text-white/60 font-medium leading-snug mt-0.5">{sub}</p>
                                </div>
                            ))}
                        </div>

                        <button
                            onClick={() => navigate('/products')}
                            className="mt-4 md:mt-7 inline-flex items-center gap-1.5 bg-[#FFC629] text-gray-900 text-[11px] md:text-[13px] font-black px-4 py-2.5 md:px-6 md:py-3 rounded-lg md:rounded-xl shadow-[0_8px_24px_rgba(255,198,41,0.35)] active:scale-95 transition-transform"
                        >
                            Shop Try &amp; Buy <ArrowRight size={14} />
                        </button>
                    </div>
                </div>
            </div>
        </section>
    );
};

export default TryAndBuyExplainer;
