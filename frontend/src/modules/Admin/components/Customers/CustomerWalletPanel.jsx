import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { getCustomerWallet, adjustCustomerWallet } from '../../services/adminService';
import { formatCurrency, formatDateTime } from '../../utils/adminHelpers';

// Customer's CLOSH wallet in the admin panel: balance, ledger and a manual credit/debit.
const SOURCE_LABELS = {
    referral_reward: 'Referral reward',
    referee_reward: 'Sign-up reward',
    order_payment: 'Paid for order',
    order_refund: 'Order refund',
    expiry: 'Expired',
    admin_adjustment: 'Admin adjustment',
};

const newRequestId = () =>
    (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

const CustomerWalletPanel = ({ customerId }) => {
    const [data, setData] = useState({ balance: 0, items: [], total: 0 });
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(true);
    const [form, setForm] = useState({ type: 'credit', amount: '', note: '' });
    const [saving, setSaving] = useState(false);
    // Kept for the same form entry so a retry after a network error is not applied twice.
    const requestIdRef = useRef(newRequestId());
    const limit = 20;

    const load = useCallback(async (p = 1) => {
        setLoading(true);
        try {
            const res = await getCustomerWallet(customerId, { page: p, limit });
            setData(res?.data || { balance: 0, items: [], total: 0 });
            setPage(p);
        } catch { /* toast shown by api client */ } finally { setLoading(false); }
    }, [customerId]);
    useEffect(() => { load(1); }, [load]);

    const updateForm = (patch) => {
        requestIdRef.current = newRequestId();
        setForm((f) => ({ ...f, ...patch }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        const amount = Number(form.amount);
        if (!(amount > 0)) { toast.error('Enter an amount.'); return; }
        if (form.note.trim().length < 3) { toast.error('Add a note explaining the adjustment.'); return; }
        const verb = form.type === 'credit' ? 'Add' : 'Remove';
        if (!window.confirm(`${verb} ${formatCurrency(amount)} ${form.type === 'credit' ? 'to' : 'from'} this customer's wallet?`)) return;
        setSaving(true);
        try {
            await adjustCustomerWallet(customerId, {
                type: form.type,
                amount,
                note: form.note.trim(),
                requestId: requestIdRef.current,
            });
            toast.success('Wallet updated.');
            requestIdRef.current = newRequestId();
            setForm({ type: form.type, amount: '', note: '' });
            load(1);
        } catch { /* toast shown by api client */ } finally { setSaving(false); }
    };

    const pages = Math.max(1, Math.ceil((data.total || 0) / limit));

    return (
        <div className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="rounded-xl bg-gray-900 text-white p-5">
                    <p className="text-xs uppercase text-white/60 font-semibold">Wallet balance</p>
                    <p className="text-3xl font-bold mt-2">{formatCurrency(data.balance || 0)}</p>
                    {data.user?.referralCode && <p className="text-xs text-white/60 mt-2">Referral code {data.user.referralCode}</p>}
                </div>
                <form onSubmit={handleSubmit} className="md:col-span-2 rounded-xl border border-gray-200 p-5 space-y-3">
                    <p className="text-sm font-bold text-gray-900">Adjust wallet</p>
                    <div className="flex flex-col sm:flex-row gap-3">
                        <select
                            value={form.type}
                            onChange={(e) => updateForm({ type: e.target.value })}
                            className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50"
                        >
                            <option value="credit">Add money</option>
                            <option value="debit">Remove money</option>
                        </select>
                        <input
                            type="number"
                            min={1}
                            step="0.01"
                            value={form.amount}
                            onChange={(e) => updateForm({ amount: e.target.value })}
                            placeholder="Amount (₹)"
                            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50"
                        />
                    </div>
                    <input
                        value={form.note}
                        onChange={(e) => updateForm({ note: e.target.value })}
                        placeholder="Note (shown to the customer for credits)"
                        maxLength={500}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50"
                    />
                    <button
                        type="submit"
                        disabled={saving}
                        className="px-5 py-2 rounded-lg bg-primary-600 text-white text-sm font-semibold hover:bg-primary-700 disabled:opacity-50"
                    >
                        {saving ? 'Saving…' : 'Save adjustment'}
                    </button>
                </form>
            </div>

            <div className="rounded-xl border border-gray-200 overflow-x-auto">
                <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-left text-xs text-gray-500 uppercase">
                        <tr>
                            <th className="px-4 py-3">Date</th>
                            <th className="px-4 py-3">Entry</th>
                            <th className="px-4 py-3">Order</th>
                            <th className="px-4 py-3">Amount</th>
                            <th className="px-4 py-3">Balance after</th>
                            <th className="px-4 py-3">Expires</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {data.items.length === 0 && (
                            <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-500">{loading ? 'Loading…' : 'No wallet activity yet.'}</td></tr>
                        )}
                        {data.items.map((t) => {
                            const isCredit = t.type === 'credit';
                            return (
                                <tr key={t._id}>
                                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{formatDateTime(t.createdAt)}</td>
                                    <td className="px-4 py-3">
                                        <p className="font-medium text-gray-900">{SOURCE_LABELS[t.source] || t.source}</p>
                                        {t.note && <p className="text-xs text-gray-500">{t.note}</p>}
                                    </td>
                                    <td className="px-4 py-3 text-gray-600">{t.order?.orderId || '—'}</td>
                                    <td className={`px-4 py-3 font-semibold ${isCredit ? 'text-emerald-600' : 'text-gray-900'}`}>
                                        {isCredit ? '+' : '-'}{formatCurrency(t.amount)}
                                    </td>
                                    <td className="px-4 py-3 text-gray-600">{t.balanceAfter != null ? formatCurrency(t.balanceAfter) : '—'}</td>
                                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                                        {isCredit && t.expiresAt ? `${formatDateTime(t.expiresAt)}${t.remaining > 0 ? ` (${formatCurrency(t.remaining)} left)` : ''}` : '—'}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {pages > 1 && (
                <div className="flex items-center justify-end gap-2 text-sm">
                    <button disabled={page <= 1 || loading} onClick={() => load(page - 1)} className="px-3 py-1.5 rounded border disabled:opacity-40">Previous</button>
                    <span className="text-gray-600">Page {page} of {pages}</span>
                    <button disabled={page >= pages || loading} onClick={() => load(page + 1)} className="px-3 py-1.5 rounded border disabled:opacity-40">Next</button>
                </div>
            )}
        </div>
    );
};

export default CustomerWalletPanel;
