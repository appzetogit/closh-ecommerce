import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Wallet, ArrowDownLeft, ArrowUpRight, Gift, AlertTriangle, ChevronRight } from 'lucide-react';
import AccountLayout from '../../components/Profile/AccountLayout';
import api from '../../../../shared/utils/api';
import { formatPrice } from '../../../../shared/utils/helpers';

// CLOSH wallet: balance, money expiring soon and every credit/debit (GET /user/wallet...).
const formatDate = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '');

const WalletPage = () => {
    const [wallet, setWallet] = useState(null);
    const [items, setItems] = useState([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(true);

    const load = useCallback(async (nextPage = 1) => {
        setLoading(true);
        try {
            const [w, tx] = await Promise.all([
                nextPage === 1 ? api.get('/user/wallet') : Promise.resolve(null),
                api.get('/user/wallet/transactions', { params: { page: nextPage, limit: 20 } }),
            ]);
            if (w) setWallet(w.data);
            setItems((prev) => (nextPage === 1 ? tx?.data?.items || [] : [...prev, ...(tx?.data?.items || [])]));
            setTotal(tx?.data?.total || 0);
            setPage(nextPage);
        } catch {
            /* toast already shown by the api client */
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(1); }, [load]);

    const expiring = wallet?.expiringSoon || [];
    const expiringTotal = expiring.reduce((s, e) => s + e.amount, 0);

    return (
        <AccountLayout>
            <div className="bg-white -m-6 md:-m-10 min-h-screen p-6 md:p-10 space-y-6">
                <div className="rounded-2xl bg-black text-white p-6 md:p-8">
                    <div className="flex items-center gap-2 text-white/70 text-[13px] font-bold uppercase">
                        <Wallet size={16} /> CLOSH wallet
                    </div>
                    <p className="text-4xl font-bold mt-3">{formatPrice(wallet?.balance || 0)}</p>
                    <p className="text-[13px] text-white/60 mt-2">
                        {wallet?.settings?.enabled
                            ? `Use it at checkout to pay${wallet.settings.maxWalletPercentPerOrder < 100 ? ` up to ${wallet.settings.maxWalletPercentPerOrder}% of` : ' for'} your order.`
                            : 'Using the wallet at checkout is paused right now. Your balance is safe.'}
                    </p>
                </div>

                {expiringTotal > 0 && (
                    <div className="flex items-start gap-3 rounded-xl border border-amber-100 bg-amber-50 p-4">
                        <AlertTriangle className="text-amber-600 mt-0.5" size={18} />
                        <p className="text-[14px] text-amber-800 font-medium">
                            {formatPrice(expiringTotal)} expires soon (first on {formatDate(expiring[0].expiresAt)}). Use it on your next order.
                        </p>
                    </div>
                )}

                <Link
                    to="/refer"
                    className="flex items-center gap-3 rounded-2xl border border-amber-100 bg-amber-50/60 p-4 hover:bg-amber-50 transition-colors"
                >
                    <span className="w-10 h-10 shrink-0 rounded-full bg-white flex items-center justify-center shadow-sm">
                        <Gift className="text-amber-500" size={20} />
                    </span>
                    <span className="flex-1 min-w-0">
                        <span className="block font-bold text-gray-900 text-[14px] leading-snug">Refer friends, earn wallet money</span>
                        <span className="block text-[12px] text-gray-500 leading-snug mt-0.5">Get rewarded when a friend's first order is delivered</span>
                    </span>
                    <span className="shrink-0 flex items-center gap-1 rounded-full bg-black text-white text-[12px] font-bold px-3.5 py-2">
                        Invite <ChevronRight size={14} />
                    </span>
                </Link>

                <div className="rounded-2xl border border-gray-100 p-6">
                    <h3 className="text-[14px] font-bold text-gray-400 uppercase mb-4">History</h3>
                    {items.length === 0 && !loading ? (
                        <p className="text-[14px] text-gray-500 font-medium">No wallet activity yet.</p>
                    ) : (
                        <ul className="divide-y divide-gray-50">
                            {items.map((t) => {
                                const isCredit = t.type === 'credit';
                                return (
                                    <li key={t.id} className="py-3 flex items-center justify-between gap-3">
                                        <div className="flex items-center gap-3 min-w-0">
                                            <span className={`w-9 h-9 shrink-0 rounded-full flex items-center justify-center ${isCredit ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-50 text-gray-500'}`}>
                                                {isCredit ? <ArrowDownLeft size={18} /> : <ArrowUpRight size={18} />}
                                            </span>
                                            <div>
                                                <p className="font-bold text-gray-900 text-[14px]">{t.label}</p>
                                                <p className="text-[12px] text-gray-400">
                                                    {formatDate(t.createdAt)}
                                                    {t.orderId ? ` · ${t.orderId}` : ''}
                                                    {isCredit && t.expiresAt ? ` · valid till ${formatDate(t.expiresAt)}` : ''}
                                                </p>
                                                {t.note && <p className="text-[12px] text-gray-500">{t.note}</p>}
                                            </div>
                                        </div>
                                        <span className={`shrink-0 whitespace-nowrap font-bold text-[15px] ${isCredit ? 'text-emerald-600' : 'text-gray-900'}`}>
                                            {isCredit ? '+' : '-'}{formatPrice(t.amount)}
                                        </span>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                    {items.length < total && (
                        <button
                            onClick={() => load(page + 1)}
                            disabled={loading}
                            className="mt-4 w-full py-3 rounded-xl border border-gray-200 font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                        >
                            {loading ? 'Loading…' : 'Show more'}
                        </button>
                    )}
                </div>
            </div>
        </AccountLayout>
    );
};

export default WalletPage;
