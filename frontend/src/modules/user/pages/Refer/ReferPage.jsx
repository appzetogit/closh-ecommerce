import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Copy, Share2, Wallet, Clock, CheckCircle2, XCircle, Gift } from 'lucide-react';
import AccountLayout from '../../components/Profile/AccountLayout';
import api from '../../../../shared/utils/api';
import { formatPrice } from '../../../../shared/utils/helpers';

// Refer & Earn: the code, the rules and the friends referred all come from the server
// (GET /user/referral). Rewards are paid into the CLOSH wallet only when a friend's FIRST
// order is delivered - see docs/REFER_AND_EARN_AND_WALLET.md.
const statusStyle = {
    pending: { icon: Clock, cls: 'text-gray-500 bg-gray-50' },
    order_placed: { icon: Clock, cls: 'text-amber-700 bg-amber-50' },
    qualified: { icon: Clock, cls: 'text-amber-700 bg-amber-50' },
    rewarded: { icon: CheckCircle2, cls: 'text-emerald-700 bg-emerald-50' },
    void: { icon: XCircle, cls: 'text-gray-400 bg-gray-50' },
};

const rewardText = (reward) => {
    if (!reward) return '';
    if (reward.type === 'percent') {
        return `${reward.value}% of your friend's first order${reward.maxAmount ? ` (up to ${formatPrice(reward.maxAmount)})` : ''}`;
    }
    return formatPrice(reward.value);
};

const ReferPage = () => {
    const [data, setData] = useState(null);
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(true);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        let alive = true;
        Promise.all([api.get('/user/referral'), api.get('/user/referral/history')])
            .then(([summary, hist]) => {
                if (!alive) return;
                setData(summary?.data || null);
                setHistory(hist?.data?.items || []);
            })
            .catch(() => {})
            .finally(() => alive && setLoading(false));
        return () => { alive = false; };
    }, []);

    const code = data?.code || '';

    const handleCopy = async () => {
        if (!code) return;
        try {
            await navigator.clipboard.writeText(code);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            toast.error('Could not copy. Please copy the code manually.');
        }
    };

    const handleShare = async () => {
        if (!data) return;
        const text = data.shareMessage;
        if (navigator.share) {
            try {
                await navigator.share({ title: 'Shop on CLOSH', text, url: data.link });
                return;
            } catch (err) {
                if (err?.name === 'AbortError') return;
            }
        }
        window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
    };

    const reward = data?.reward;
    const howItWorks = [
        { id: 1, title: 'Share your code', desc: `Send your code ${code} or your invite link to friends.` },
        { id: 2, title: 'Your friend signs up', desc: 'They create a new CLOSH account using your code.' },
        {
            id: 3,
            title: 'They place their first order',
            desc: `Their first order must be worth ${formatPrice(reward?.minFirstOrderValue || 0)} or more (after discounts) and be delivered and kept.`,
        },
        {
            id: 4,
            title: 'You earn',
            desc: `${rewardText(reward)} is added to your CLOSH wallet${reward?.rewardDelayHours ? ` about ${reward.rewardDelayHours} hours after delivery` : ' after delivery'}. Use it on your next order.`,
        },
    ];

    return (
        <AccountLayout>
            <div className="bg-white -m-6 md:-m-10 min-h-screen">
                {/* Stats */}
                <div className="bg-white px-3 py-4 md:p-6 border-b border-gray-100 grid grid-cols-3 gap-2 md:gap-4 text-center">
                    <div>
                        <p className="text-[13px] font-bold text-gray-400 mb-1">Total earned</p>
                        <p className="text-2xl font-bold text-gray-900">{formatPrice(data?.stats?.earned || 0)}</p>
                    </div>
                    <div>
                        <p className="text-[13px] font-bold text-gray-400 mb-1">Friends joined</p>
                        <p className="text-2xl font-bold text-gray-900">{data?.stats?.invited || 0}</p>
                    </div>
                    <div>
                        <p className="text-[13px] font-bold text-gray-400 mb-1">Rewards</p>
                        <p className="text-2xl font-bold text-gray-900">{data?.stats?.rewarded || 0}</p>
                    </div>
                </div>

                <div className="px-3 py-4 md:p-10 space-y-4 md:space-y-6">
                    {!loading && data && !data.enabled && (
                        <div className="rounded-xl border border-amber-100 bg-amber-50 p-4 text-[14px] text-amber-800 font-medium">
                            Refer &amp; Earn is paused right now. Friends who already joined with your code still count.
                        </div>
                    )}

                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                        <div className="p-4 md:p-10 space-y-6 md:space-y-8">
                            <div className="flex items-center gap-2">
                                <Gift className="text-[#ffcc00]" size={22} />
                                <h2 className="text-[19px] font-bold text-gray-900">
                                    {loading ? 'Loading…' : `Earn ${rewardText(reward)} for every friend's first order`}
                                </h2>
                            </div>

                            <div className="space-y-4 text-[15px] leading-relaxed text-gray-600 font-medium">
                                {data?.terms && <p>{data.terms}</p>}
                                <div className="flex items-start gap-2 bg-gray-50 p-3 md:p-4 rounded-xl border border-gray-100">
                                    <span className="mt-0.5">🔒</span>
                                    <div>
                                        <p className="text-gray-900 font-bold mb-1">Only the first order counts</p>
                                        <p className="text-gray-500 text-[14px]">
                                            Sharing your code or a friend signing up does not earn a reward. You earn once, when your friend's first order is delivered and not returned or cancelled.
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* How it works */}
                            <div className="space-y-6 md:space-y-8 pt-2 md:pt-4">
                                <h3 className="text-[14px] font-bold text-gray-400 uppercase">How it works</h3>
                                <div className="space-y-7 md:space-y-10">
                                    {howItWorks.map((step) => (
                                        <div key={step.id} className="relative flex gap-4 md:gap-6">
                                            {step.id !== howItWorks.length && (
                                                <div className="absolute left-[7px] top-5 w-[2px] h-[calc(100%+24px)] bg-gray-100" />
                                            )}
                                            <div className="relative z-10 w-4 h-4 rounded-full bg-white border-2 border-gray-200 mt-1.5" />
                                            <div className="space-y-1">
                                                <h4 className="text-[16px] font-bold text-gray-900">{step.id}. {step.title}</h4>
                                                <p className="text-[14px] text-gray-500 font-medium leading-relaxed">{step.desc}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Code & share */}
                            <div className="pt-4 md:pt-8 space-y-3 md:space-y-4">
                                <div className="flex items-center justify-between bg-white border-2 border-dashed border-gray-200 p-4 rounded-2xl hover:border-[#a03040] transition-all">
                                    <span className="text-xl font-bold text-gray-900 pl-2 uppercase tracking-wider">{code || '--------'}</span>
                                    <button
                                        onClick={handleCopy}
                                        disabled={!code}
                                        className="flex items-center gap-2 text-orange-400 font-bold px-4 py-1.5 rounded-lg hover:bg-orange-50 transition-all uppercase text-sm disabled:opacity-40"
                                    >
                                        <Copy size={16} />
                                        {copied ? 'Copied!' : 'Copy'}
                                    </button>
                                </div>
                                <button
                                    onClick={handleShare}
                                    disabled={!code}
                                    className="w-full bg-black text-white flex items-center justify-center gap-3 py-4 rounded-xl font-bold hover:bg-gray-800 transition-all shadow-lg active:scale-[0.98] disabled:opacity-40"
                                >
                                    <Share2 size={20} />
                                    <span>Invite friends</span>
                                </button>
                                <Link to="/wallet" className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-gray-700 border border-gray-200 hover:bg-gray-50">
                                    <Wallet size={18} />
                                    <span>View my wallet</span>
                                </Link>
                            </div>
                        </div>
                    </div>

                    {/* Friends */}
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 md:p-8">
                        <h3 className="text-[14px] font-bold text-gray-400 uppercase mb-4">Your referrals</h3>
                        {history.length === 0 ? (
                            <p className="text-[14px] text-gray-500 font-medium">No friends have joined with your code yet.</p>
                        ) : (
                            <ul className="divide-y divide-gray-50">
                                {history.map((r) => {
                                    const st = statusStyle[r.status] || statusStyle.pending;
                                    const Icon = st.icon;
                                    return (
                                        <li key={r.id} className="py-3 flex items-center justify-between gap-3">
                                            <div>
                                                <p className="font-bold text-gray-900 text-[15px]">{r.friend}</p>
                                                <p className="text-[12px] text-gray-400">Joined {new Date(r.joinedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                                            </div>
                                            <span className={`flex items-center gap-1.5 text-[12px] font-bold px-2.5 py-1 rounded-full ${st.cls}`}>
                                                <Icon size={14} />
                                                {r.status === 'rewarded' ? `+${formatPrice(r.reward)}` : r.statusLabel}
                                            </span>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </div>
                </div>
            </div>
        </AccountLayout>
    );
};

export default ReferPage;
