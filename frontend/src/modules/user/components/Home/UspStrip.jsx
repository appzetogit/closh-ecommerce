import React from 'react';
import { Timer, Shirt, RotateCcw, Wallet } from 'lucide-react';

/**
 * Scannable row of the platform's actual promises. Every line maps to a real
 * feature in the codebase — 60-minute delivery (header), Try & Buy order type,
 * the 24-hour return window enforced by the API, and COD / UPI at checkout —
 * so nothing here is marketing copy the product can't back.
 */
const USPS = [
    { icon: Timer, title: '60-min delivery', sub: 'Across serviceable areas' },
    { icon: Shirt, title: 'Try & Buy at home', sub: 'Pay only for what you keep' },
    { icon: RotateCcw, title: '24-hr easy returns', sub: 'On Check & Buy orders' },
    { icon: Wallet, title: 'COD, UPI & cards', sub: 'Pay how you like' },
];

const UspStrip = () => (
    <section className="w-full bg-white pt-1 pb-3 md:py-4">
        <div className="max-w-[1600px] mx-auto md:px-8">
            <div className="flex md:grid md:grid-cols-4 gap-2.5 md:gap-4 overflow-x-auto scrollbar-hide px-4 md:px-0 snap-x">
                {USPS.map(({ icon: Icon, title, sub }) => (
                    <div
                        key={title}
                        className="shrink-0 snap-start flex items-center gap-2.5 md:gap-3 min-w-[196px] md:min-w-0 rounded-xl md:rounded-2xl bg-[#F6F6F8] border border-black/[0.04] px-3 py-2.5 md:px-4 md:py-3.5"
                    >
                        <div className="shrink-0 w-9 h-9 md:w-11 md:h-11 rounded-full bg-white shadow-[0_2px_8px_rgba(0,0,0,0.06)] flex items-center justify-center text-gray-900">
                            <Icon size={18} strokeWidth={2} />
                        </div>
                        <div className="min-w-0">
                            <p className="text-[12px] md:text-[14px] font-black text-gray-900 leading-tight truncate">{title}</p>
                            <p className="text-[10px] md:text-[12px] text-gray-500 font-medium leading-tight truncate">{sub}</p>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    </section>
);

export default UspStrip;
