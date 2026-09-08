import React, { useState } from 'react';
import AccountLayout from '../../components/Profile/AccountLayout';
import { Copy, Share2, Flame, Lock } from 'lucide-react';

const ReferPage = () => {
    const [referralCode] = useState('19VIHR');
    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
        navigator.clipboard.writeText(referralCode);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const howItWorks = [
        {
            id: 1,
            title: 'Share Your Code',
            desc: `Invite friends by sharing your referral code: ${referralCode}`
        },
        {
            id: 2,
            title: 'Your Friend Signs Up',
            desc: 'They register using your code and receive their own shopping discount code.'
        },
        {
            id: 3,
            title: 'They Place an Order',
            desc: 'Your friend completes a purchase of ₹1000 or more (after discount).'
        },
        {
            id: 4,
            title: 'You Earn Rewards',
            desc: 'You receive ₹250 once their order is confirmed.'
        }
    ];

    return (
        <AccountLayout>
            <div className="bg-white -m-6 md:-m-10 min-h-screen">
                {/* Stats Dashboard */}
                <div className="bg-white p-6 border-b border-gray-100 flex justify-center gap-16 md:gap-32">
                    <div className="text-center group cursor-default">
                        <p className="text-[13px] font-bold text-gray-400 mb-1">Total Earning</p>
                        <p className="text-2xl font-bold text-gray-900 group-hover:scale-110 transition-transform">₹0</p>
                    </div>
                    <div className="text-center group cursor-default">
                        <p className="text-[13px] font-bold text-gray-400 mb-1">Friend's Signup</p>
                        <p className="text-2xl font-bold text-gray-900 group-hover:scale-110 transition-transform">0</p>
                    </div>
                </div>

                <div className="p-6 md:p-10">
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                        <div className="p-6 md:p-10 space-y-8">
                            {/* Headline */}
                            <div className="flex items-center gap-2">
                                <span className="text-xl">🔥</span>
                                <h2 className="text-[19px] font-bold text-gray-900">
                                    Earn ₹250 for each friend you refer!!
                                </h2>
                            </div>

                            {/* Description */}
                            <div className="space-y-4 text-[15px] leading-relaxed text-gray-600 font-medium">
                                <p>
                                    Refer your friends and enjoy exclusive rewards! Once your friend signs up using your referral code, they will receive a unique discount code. When they place their first order worth ₹999 or more (post-discount) using that code, your referral bonus gets activated.
                                </p>
                                <div className="flex items-start gap-2 bg-white p-4 rounded-xl border border-gray-100">
                                    <span className="mt-0.5">🔒</span>
                                    <div>
                                        <p className="text-gray-900 font-bold mb-1">Important Note</p>
                                        <p className="text-gray-500 text-[14px]">Referral rewards will not be granted if the order is cancelled for any reason.</p>
                                    </div>
                                </div>
                            </div>

                            {/* How it Works */}
                            <div className="space-y-8 pt-4">
                                <h3 className="text-[14px] font-bold text-gray-400 uppercase ">How It Works</h3>
                                <div className="space-y-10">
                                    {howItWorks.map((step) => (
                                        <div key={step.id} className="relative flex gap-6">
                                            {step.id !== 4 && (
                                                <div className="absolute left-[7px] top-5 w-[2px] h-[calc(100%+24px)] bg-gray-100" />
                                            )}
                                            <div className="relative z-10 w-4 h-4 rounded-full bg-white border-2 border-gray-200 mt-1.5" />
                                            <div className="space-y-1">
                                                <h4 className="text-[16px] font-bold text-gray-900">
                                                    {step.id}. {step.title}
                                                </h4>
                                                <p className="text-[14px] text-gray-500 font-medium leading-relaxed">
                                                    {step.desc}
                                                </p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Code & Action */}
                            <div className="pt-8 space-y-4">
                                <div className="flex items-center justify-between bg-white border-2 border-dashed border-gray-200 p-4 rounded-2xl group hover:border-[#a03040] transition-all">
                                    <span className="text-xl font-bold text-gray-900 pl-2 uppercase">{referralCode}</span>
                                    <button
                                        onClick={handleCopy}
                                        className="flex items-center gap-2 text-orange-400 font-bold px-4 py-1.5 rounded-lg hover:bg-orange-50 transition-all uppercase text-sm"
                                    >
                                        <Copy size={16} />
                                        {copied ? 'Copied!' : 'Copy'}
                                    </button>
                                </div>
                                <button className="w-full bg-black text-white flex items-center justify-center gap-3 py-4 rounded-xl font-bold hover:bg-gray-800 transition-all shadow-lg active:scale-[0.98]">
                                    <Share2 size={20} />
                                    <span>Invite Friends</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </AccountLayout>
    );
};

export default ReferPage;
