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
                        <div className="inline-flex items-center gap-1.5 bg-white/[0.08] border border-white/10 rounded-full px-2.5 py-1 mb-2.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#FFC629]" />
                            <p className="text-[9px] md:text-[11px] font-black uppercase tracking-[0.18em] text-[#C4B5FD]">
                                CLOSH exclusive
                            </p>
                        </div>
                        <h2 className="text-[22px] md:text-[34px] font-black leading-none tracking-tight">
                            Try before you buy.
                        </h2>
                        <p className="text-[11px] md:text-[14px] text-white/70 font-medium mt-1.5 max-w-md">
                            No fitting-room guesswork. Try the whole order at home and keep only what you love.
                        </p>

                        <div className="relative grid grid-cols-3 gap-2 md:gap-4 mt-4 md:mt-7">
                            {/* Connects the three steps into one flow instead of three floating cards */}
                            <div className="hidden xs:block absolute top-[22px] md:top-8 left-[16.5%] right-[16.5%] h-px bg-gradient-to-r from-white/0 via-white/20 to-white/0" />

                            {STEPS.map(({ icon: Icon, title, sub }, i) => (
                                <div
                                    key={title}
                                    className="relative rounded-xl md:rounded-2xl bg-white/[0.06] border border-white/10 px-2.5 py-3 md:px-4 md:py-5 transition-colors hover:bg-white/[0.09]"
                                >
                                    <div className="relative w-9 h-9 md:w-12 md:h-12 rounded-full bg-[#7C5CFF]/20 border border-white/10 flex items-center justify-center mb-2 md:mb-3">
                                        <Icon size={16} className="text-[#C4B5FD] md:size-[20px]" />
                                        <span className="absolute -top-1.5 -right-1.5 w-4.5 h-4.5 md:w-5 md:h-5 rounded-full bg-[#FFC629] text-gray-900 text-[9px] md:text-[10px] font-black flex items-center justify-center ring-2 ring-[#0F0B1F]">
                                            {i + 1}
                                        </span>
                                    </div>
                                    <p className="text-[11px] md:text-[15px] font-black leading-tight">{title}</p>
                                    <p className="text-[9px] md:text-[12px] text-white/60 font-medium leading-snug mt-0.5">{sub}</p>
                                </div>
                            ))}
                        </div>

                        <button
                            onClick={() => navigate('/products')}
                            className="group mt-4 md:mt-7 inline-flex items-center gap-1.5 bg-[#FFC629] text-gray-900 text-[11px] md:text-[13px] font-black px-4 py-2.5 md:px-6 md:py-3 rounded-lg md:rounded-xl shadow-[0_8px_24px_rgba(255,198,41,0.35)] active:scale-95 transition-transform hover:shadow-[0_10px_30px_rgba(255,198,41,0.45)]"
                        >
                            Shop Try &amp; Buy <ArrowRight size={14} className="transition-transform group-hover:translate-x-1" />
                        </button>
                    </div>
                </div>
            </div>
        </section>
    );
};

export default TryAndBuyExplainer;
