import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation } from 'react-router-dom';
import { FiGift, FiSave, FiSearch, FiAlertTriangle, FiX, FiRefreshCw } from 'react-icons/fi';
import toast from 'react-hot-toast';
import {
    getReferralProgramSettings,
    updateReferralProgramSettings,
    getReferrals,
    getReferralDetail,
    voidReferral,
    rewardReferralNow,
    getReferralReport,
} from '../services/adminService';
import { formatCurrency, formatDateTime } from '../utils/adminHelpers';

// Refer & Earn admin: referrals list, program + wallet settings and a short report.
// Rules live on the server (docs/REFER_AND_EARN_AND_WALLET.md); this page only edits them.

const STATUS_LABELS = {
    pending: 'Signed up',
    order_placed: 'Order placed',
    qualified: 'Delivered, waiting',
    rewarded: 'Rewarded',
    void: 'Void',
};
const STATUS_STYLES = {
    pending: 'bg-gray-100 text-gray-700',
    order_placed: 'bg-blue-50 text-blue-700',
    qualified: 'bg-amber-50 text-amber-700',
    rewarded: 'bg-emerald-50 text-emerald-700',
    void: 'bg-red-50 text-red-600',
};
const OPEN_STATUSES = ['pending', 'order_placed', 'qualified'];

const StatusBadge = ({ status }) => (
    <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold ${STATUS_STYLES[status] || STATUS_STYLES.pending}`}>
        {STATUS_LABELS[status] || status}
    </span>
);

// ─── Referrals tab ────────────────────────────────────────────────────────────
const ReferralDetailModal = ({ id, basePath, onClose, onChanged }) => {
    const [data, setData] = useState(null);
    const [reason, setReason] = useState('');
    const [busy, setBusy] = useState(false);

    const load = useCallback(() => {
        getReferralDetail(id).then((res) => setData(res?.data || null)).catch(() => onClose());
    }, [id, onClose]);
    useEffect(() => { load(); }, [load]);

    const handleVoid = async () => {
        if (!reason.trim()) {
            toast.error('Please write why this referral is being voided.');
            return;
        }
        setBusy(true);
        try {
            await voidReferral(id, reason.trim());
            toast.success('Referral voided.');
            onChanged();
            load();
            setReason('');
        } catch { /* toast shown by api client */ } finally { setBusy(false); }
    };

    const handleReward = async () => {
        if (!window.confirm('Pay this reward now? This skips the waiting time but still checks returns and limits.')) return;
        setBusy(true);
        try {
            await rewardReferralNow(id);
            toast.success('Reward paid to the wallet.');
            onChanged();
            load();
        } catch { /* toast shown by api client */ } finally { setBusy(false); }
    };

    // Portal to <body>: the admin layout animates its content, which would otherwise
    // trap this overlay inside the content area.
    return createPortal(
        <div className="fixed inset-0 z-[200] bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-white rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between px-5 py-4 border-b">
                    <h3 className="font-bold text-gray-900">Referral</h3>
                    <button onClick={onClose} className="p-1 text-gray-500 hover:text-gray-800"><FiX /></button>
                </div>
                {!data ? (
                    <p className="p-5 text-sm text-gray-500">Loading…</p>
                ) : (
                    <div className="p-5 space-y-4 text-sm">
                        <div className="flex items-center justify-between">
                            <StatusBadge status={data.status} />
                            <span className="text-gray-500">Code {data.code}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="rounded-lg bg-gray-50 p-3">
                                <p className="text-xs text-gray-500">Referrer</p>
                                <p className="font-semibold text-gray-900">{data.referrer?.name || '—'}</p>
                                <p className="text-xs text-gray-500">{data.referrer?.phone}</p>
                                {data.referrer?._id && (
                                    <Link to={`${basePath}/customers/${data.referrer._id}?tab=wallet`} className="text-xs text-primary-600 font-semibold">
                                        Wallet {formatCurrency(data.referrer.walletBalance || 0)}
                                    </Link>
                                )}
                            </div>
                            <div className="rounded-lg bg-gray-50 p-3">
                                <p className="text-xs text-gray-500">Friend</p>
                                <p className="font-semibold text-gray-900">{data.referee?.name || '—'}</p>
                                <p className="text-xs text-gray-500">{data.referee?.phone}</p>
                                <p className="text-xs text-gray-500">Joined {formatDateTime(data.createdAt)}</p>
                            </div>
                        </div>
                        {data.firstOrder && (
                            <div className="rounded-lg border p-3">
                                <p className="text-xs text-gray-500">First order</p>
                                <Link to={`${basePath}/orders/${data.firstOrder._id}`} className="font-semibold text-primary-600">
                                    {data.firstOrder.orderId}
                                </Link>
                                <p className="text-xs text-gray-500">
                                    {data.firstOrder.status} · {formatCurrency(data.firstOrder.total)} · {data.firstOrder.paymentMethod}
                                    {data.keptValue ? ` · kept ${formatCurrency(data.keptValue)}` : ''}
                                </p>
                            </div>
                        )}
                        {data.rewardDueAt && data.status === 'qualified' && (
                            <p className="text-gray-600">Reward due at {formatDateTime(data.rewardDueAt)}</p>
                        )}
                        {data.status === 'rewarded' && (
                            <p className="text-emerald-700 font-semibold">
                                Paid {formatCurrency(data.referrerReward)} to the referrer
                                {data.refereeReward ? ` and ${formatCurrency(data.refereeReward)} to the friend` : ''} on {formatDateTime(data.rewardedAt)}
                            </p>
                        )}
                        {data.status === 'void' && (
                            <p className="text-red-600">Void: {data.voidReason}{data.voidedBy?.name ? ` (by ${data.voidedBy.name})` : ''}</p>
                        )}
                        {data.fraudFlags?.length > 0 && (
                            <div className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-amber-800">
                                <FiAlertTriangle className="mt-0.5 shrink-0" />
                                <span>Check before paying: {data.fraudFlags.map((f) => f.replace(/_/g, ' ')).join(', ')}</span>
                            </div>
                        )}

                        {OPEN_STATUSES.includes(data.status) && (
                            <div className="space-y-3 border-t pt-4">
                                {data.status === 'qualified' && (
                                    <button
                                        onClick={handleReward}
                                        disabled={busy}
                                        className="w-full py-2.5 rounded-lg bg-emerald-600 text-white font-semibold hover:bg-emerald-700 disabled:opacity-50"
                                    >
                                        Pay reward now
                                    </button>
                                )}
                                <textarea
                                    value={reason}
                                    onChange={(e) => setReason(e.target.value)}
                                    rows={2}
                                    placeholder="Reason for voiding (required)"
                                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                                />
                                <button
                                    onClick={handleVoid}
                                    disabled={busy}
                                    className="w-full py-2.5 rounded-lg border border-red-200 text-red-600 font-semibold hover:bg-red-50 disabled:opacity-50"
                                >
                                    Void referral
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>,
        document.body
    );
};

const ReferralsTab = ({ basePath }) => {
    const [filters, setFilters] = useState({ status: '', search: '', flagged: false });
    const [searchInput, setSearchInput] = useState('');
    const [page, setPage] = useState(1);
    const [data, setData] = useState({ items: [], total: 0, summary: null });
    const [loading, setLoading] = useState(true);
    const [openId, setOpenId] = useState(null);
    const limit = 20;

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await getReferrals({
                page,
                limit,
                ...(filters.status ? { status: filters.status } : {}),
                ...(filters.search ? { search: filters.search } : {}),
                ...(filters.flagged ? { flagged: 'true' } : {}),
            });
            setData(res?.data || { items: [], total: 0, summary: null });
        } catch { /* toast shown by api client */ } finally { setLoading(false); }
    }, [filters, page]);
    useEffect(() => { load(); }, [load]);

    const summary = data.summary || {};
    const pages = Math.max(1, Math.ceil((data.total || 0) / limit));

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {Object.keys(STATUS_LABELS).map((s) => (
                    <button
                        key={s}
                        onClick={() => { setPage(1); setFilters((f) => ({ ...f, status: f.status === s ? '' : s })); }}
                        className={`text-left rounded-xl border p-3 transition ${filters.status === s ? 'border-primary-600 bg-primary-50' : 'border-gray-200 bg-white hover:bg-gray-50'}`}
                    >
                        <p className="text-xs text-gray-500">{STATUS_LABELS[s]}</p>
                        <p className="text-xl font-bold text-gray-900">{summary[s] || 0}</p>
                    </button>
                ))}
                <div className="rounded-xl border border-gray-200 bg-white p-3">
                    <p className="text-xs text-gray-500">Rewards paid</p>
                    <p className="text-xl font-bold text-gray-900">{formatCurrency(summary.rewardsPaid || 0)}</p>
                </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
                <form
                    className="flex-1 flex items-center gap-2 border border-gray-200 rounded-lg px-3 bg-white"
                    onSubmit={(e) => { e.preventDefault(); setPage(1); setFilters((f) => ({ ...f, search: searchInput.trim() })); }}
                >
                    <FiSearch className="text-gray-400" />
                    <input
                        value={searchInput}
                        onChange={(e) => setSearchInput(e.target.value)}
                        placeholder="Search name, phone, email or code"
                        className="flex-1 py-2.5 text-sm outline-none bg-transparent"
                    />
                </form>
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 px-3">
                    <input
                        type="checkbox"
                        checked={filters.flagged}
                        onChange={(e) => { setPage(1); setFilters((f) => ({ ...f, flagged: e.target.checked })); }}
                    />
                    Needs a check only
                </label>
                <button onClick={load} className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-gray-200 bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50">
                    <FiRefreshCw /> Refresh
                </button>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
                <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-left text-xs text-gray-500 uppercase">
                        <tr>
                            <th className="px-4 py-3">Referrer</th>
                            <th className="px-4 py-3">Friend</th>
                            <th className="px-4 py-3">First order</th>
                            <th className="px-4 py-3">Status</th>
                            <th className="px-4 py-3">Reward</th>
                            <th className="px-4 py-3">Joined</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {data.items.length === 0 && (
                            <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-500">{loading ? 'Loading…' : 'No referrals found.'}</td></tr>
                        )}
                        {data.items.map((r) => (
                            <tr key={r._id} onClick={() => setOpenId(r._id)} className="cursor-pointer hover:bg-gray-50">
                                <td className="px-4 py-3">
                                    <p className="font-semibold text-gray-900">{r.referrer?.name || '—'}</p>
                                    <p className="text-xs text-gray-500">{r.code}</p>
                                </td>
                                <td className="px-4 py-3">
                                    <p className="font-semibold text-gray-900">{r.referee?.name || '—'}</p>
                                    <p className="text-xs text-gray-500">{r.referee?.phone}</p>
                                </td>
                                <td className="px-4 py-3 text-gray-700">
                                    {r.firstOrder ? `${r.firstOrder.orderId} · ${formatCurrency(r.firstOrder.total)}` : '—'}
                                </td>
                                <td className="px-4 py-3">
                                    <div className="flex items-center gap-1.5">
                                        <StatusBadge status={r.status} />
                                        {r.fraudFlags?.length > 0 && <FiAlertTriangle className="text-amber-500" title="Needs a check" />}
                                    </div>
                                </td>
                                <td className="px-4 py-3 text-gray-700">{r.status === 'rewarded' ? formatCurrency(r.referrerReward) : '—'}</td>
                                <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{formatDateTime(r.createdAt)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {pages > 1 && (
                <div className="flex items-center justify-end gap-2 text-sm">
                    <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="px-3 py-1.5 rounded border disabled:opacity-40">Previous</button>
                    <span className="text-gray-600">Page {page} of {pages}</span>
                    <button disabled={page >= pages} onClick={() => setPage((p) => p + 1)} className="px-3 py-1.5 rounded border disabled:opacity-40">Next</button>
                </div>
            )}

            {openId && (
                <ReferralDetailModal id={openId} basePath={basePath} onClose={() => setOpenId(null)} onChanged={load} />
            )}
        </div>
    );
};

// ─── Settings tab ─────────────────────────────────────────────────────────────
const Section = ({ title, subtitle, children }) => (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 bg-gray-50 border-b border-gray-200">
            <p className="text-sm font-bold text-gray-900">{title}</p>
            {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
        </div>
        <div className="px-5 divide-y divide-gray-100">{children}</div>
    </div>
);

const Row = ({ label, hint, children }) => (
    <div className="flex flex-col sm:flex-row sm:items-center gap-2 py-3.5">
        <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-800">{label}</p>
            {hint && <p className="text-xs text-gray-500 mt-0.5">{hint}</p>}
        </div>
        <div className="w-full sm:w-56 shrink-0">{children}</div>
    </div>
);

const NumberInput = ({ value, onChange, prefix, suffix, step = 1 }) => (
    <div className="flex items-center gap-2">
        {prefix && <span className="text-gray-400 text-sm font-bold">{prefix}</span>}
        <input
            type="number"
            min={0}
            step={step}
            value={value ?? ''}
            onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-semibold text-gray-900 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
        {suffix && <span className="text-gray-400 text-xs font-semibold shrink-0">{suffix}</span>}
    </div>
);

const Toggle = ({ checked, onChange }) => (
    <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative w-11 h-6 rounded-full transition ${checked ? 'bg-primary-600' : 'bg-gray-300'}`}
        aria-pressed={checked}
    >
        <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${checked ? 'left-[22px]' : 'left-0.5'}`} />
    </button>
);

const SettingsTab = () => {
    const [referral, setReferral] = useState(null);
    const [wallet, setWallet] = useState(null);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        getReferralProgramSettings()
            .then((res) => {
                setReferral(res?.data?.referral || null);
                setWallet(res?.data?.wallet || null);
            })
            .catch(() => {});
    }, []);

    if (!referral || !wallet) return <p className="text-sm text-gray-500">Loading…</p>;

    const setR = (patch) => setReferral((r) => ({ ...r, ...patch }));
    const setW = (patch) => setWallet((w) => ({ ...w, ...patch }));
    const isPercent = referral.referrerReward.type === 'percent';

    const handleSave = async () => {
        if (referral.enabled && !wallet.enabled) {
            if (!window.confirm('Refer & Earn is on but customers cannot spend wallet money at checkout. Save anyway?')) return;
        }
        setSaving(true);
        try {
            const res = await updateReferralProgramSettings({ referral, wallet });
            setReferral(res?.data?.referral || referral);
            setWallet(res?.data?.wallet || wallet);
            toast.success('Settings saved.');
        } catch { /* toast shown by api client */ } finally { setSaving(false); }
    };

    return (
        <div className="space-y-5 max-w-3xl">
            <Section title="Refer & Earn" subtitle="The referrer is rewarded only when the friend's first order is delivered and kept.">
                <Row label="Program on" hint="When off, new sign-ups cannot use a code. Referrals already started still finish.">
                    <Toggle checked={referral.enabled} onChange={(v) => setR({ enabled: v })} />
                </Row>
                <Row label="Reward type">
                    <select
                        value={referral.referrerReward.type}
                        onChange={(e) => setR({ referrerReward: { ...referral.referrerReward, type: e.target.value } })}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50"
                    >
                        <option value="flat">Fixed amount</option>
                        <option value="percent">Percent of first order</option>
                    </select>
                </Row>
                <Row label={isPercent ? 'Reward percent' : 'Reward amount'} hint="Paid into the referrer's CLOSH wallet.">
                    <NumberInput
                        value={referral.referrerReward.value}
                        prefix={isPercent ? null : '₹'}
                        suffix={isPercent ? '%' : null}
                        onChange={(v) => setR({ referrerReward: { ...referral.referrerReward, value: v } })}
                    />
                </Row>
                {isPercent && (
                    <Row label="Maximum reward" hint="0 means no maximum.">
                        <NumberInput
                            value={referral.referrerReward.maxAmount}
                            prefix="₹"
                            onChange={(v) => setR({ referrerReward: { ...referral.referrerReward, maxAmount: v } })}
                        />
                    </Row>
                )}
                <Row label="Also reward the friend" hint="Credited to the friend's wallet at the same time.">
                    <Toggle
                        checked={referral.refereeReward.enabled}
                        onChange={(v) => setR({ refereeReward: { ...referral.refereeReward, enabled: v } })}
                    />
                </Row>
                {referral.refereeReward.enabled && (
                    <Row label="Friend's reward">
                        <NumberInput
                            value={referral.refereeReward.value}
                            prefix="₹"
                            onChange={(v) => setR({ refereeReward: { ...referral.refereeReward, value: v } })}
                        />
                    </Row>
                )}
                <Row label="Minimum first order" hint="Value of the items kept, after coupon discount.">
                    <NumberInput value={referral.minFirstOrderValue} prefix="₹" onChange={(v) => setR({ minFirstOrderValue: v })} />
                </Row>
                <Row label="Wait after delivery" hint="Time allowed for a return before the reward is paid.">
                    <NumberInput value={referral.rewardDelayHours} suffix="hours" onChange={(v) => setR({ rewardDelayHours: v })} />
                </Row>
                <Row label="Count cash on delivery orders">
                    <Toggle checked={referral.allowCod} onChange={(v) => setR({ allowCod: v })} />
                </Row>
                <Row label="Only the very first order" hint="On: if the first order is cancelled, the referral ends. Off: the next order can still qualify.">
                    <Toggle checked={referral.firstOrderStrict} onChange={(v) => setR({ firstOrderStrict: v })} />
                </Row>
                <Row label="Rewards per referrer (lifetime)" hint="0 means no limit.">
                    <NumberInput value={referral.maxRewardsPerReferrer} onChange={(v) => setR({ maxRewardsPerReferrer: v })} />
                </Row>
                <Row label="Rewards per referrer (per month)" hint="0 means no limit.">
                    <NumberInput value={referral.monthlyRewardCap} onChange={(v) => setR({ monthlyRewardCap: v })} />
                </Row>
                <div className="py-3.5 space-y-2">
                    <p className="text-sm font-semibold text-gray-800">Share message</p>
                    <p className="text-xs text-gray-500">{'{CODE}'} and {'{LINK}'} are replaced with the customer's code and invite link.</p>
                    <textarea
                        value={referral.shareMessage}
                        onChange={(e) => setR({ shareMessage: e.target.value })}
                        rows={2}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50"
                    />
                </div>
                <div className="py-3.5 space-y-2">
                    <p className="text-sm font-semibold text-gray-800">Terms shown to customers</p>
                    <textarea
                        value={referral.termsText}
                        onChange={(e) => setR({ termsText: e.target.value })}
                        rows={3}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50"
                    />
                </div>
            </Section>

            <Section title="CLOSH Wallet" subtitle="How customers can spend wallet money at checkout.">
                <Row label="Use wallet at checkout" hint="When off, balances are kept but cannot be spent.">
                    <Toggle checked={wallet.enabled} onChange={(v) => setW({ enabled: v })} />
                </Row>
                <Row label="Maximum share of an order" hint="100% lets the wallet pay for the whole order.">
                    <NumberInput value={wallet.maxWalletPercentPerOrder} suffix="%" onChange={(v) => setW({ maxWalletPercentPerOrder: v })} />
                </Row>
                <Row label="Maximum amount per order" hint="0 means no maximum.">
                    <NumberInput value={wallet.maxWalletAmountPerOrder} prefix="₹" onChange={(v) => setW({ maxWalletAmountPerOrder: v })} />
                </Row>
                <Row label="Minimum order to use wallet" hint="Items total after coupon discount. 0 means any order.">
                    <NumberInput value={wallet.minOrderValueForWallet} prefix="₹" onChange={(v) => setW({ minOrderValueForWallet: v })} />
                </Row>
                <Row label="Reward money expires after" hint="Applies to new credits. 0 means it never expires.">
                    <NumberInput value={wallet.creditValidityDays} suffix="days" onChange={(v) => setW({ creditValidityDays: v })} />
                </Row>
                <Row label="Refunded wallet money valid for" hint="If refunded money has already expired, it gets this many more days.">
                    <NumberInput value={wallet.refundGraceDays} suffix="days" onChange={(v) => setW({ refundGraceDays: v })} />
                </Row>
                <Row label="Allow with a coupon">
                    <Toggle checked={wallet.allowWithCoupon} onChange={(v) => setW({ allowWithCoupon: v })} />
                </Row>
            </Section>

            <div className="flex justify-end">
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-primary-600 text-white font-semibold hover:bg-primary-700 disabled:opacity-50"
                >
                    <FiSave /> {saving ? 'Saving…' : 'Save settings'}
                </button>
            </div>
        </div>
    );
};

// ─── Report tab ───────────────────────────────────────────────────────────────
const SOURCE_LABELS = {
    referral_reward: 'Referral rewards',
    referee_reward: 'Friend rewards',
    order_payment: 'Spent on orders',
    order_refund: 'Refunded to wallet',
    expiry: 'Expired',
    admin_adjustment: 'Admin adjustments',
};

const ReportTab = () => {
    const [data, setData] = useState(null);
    useEffect(() => { getReferralReport().then((res) => setData(res?.data || null)).catch(() => {}); }, []);
    if (!data) return <p className="text-sm text-gray-500">Loading…</p>;

    const f = data.funnel || {};
    const joined = Object.values(f).reduce((s, n) => s + n, 0);
    const cards = [
        { label: 'Wallet money owed to customers', value: formatCurrency(data.walletLiability) },
        { label: 'Customers with a balance', value: data.walletHolders },
        { label: 'Expiring in the next 30 days', value: formatCurrency(data.expiringNext30Days) },
        { label: 'Friends who signed up', value: joined },
        { label: 'Rewarded', value: `${f.rewarded || 0}${joined ? ` (${Math.round(((f.rewarded || 0) / joined) * 100)}%)` : ''}` },
    ];

    return (
        <div className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                {cards.map((c) => (
                    <div key={c.label} className="rounded-xl border border-gray-200 bg-white p-4">
                        <p className="text-xs text-gray-500">{c.label}</p>
                        <p className="text-xl font-bold text-gray-900 mt-1">{c.value}</p>
                    </div>
                ))}
            </div>
            <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
                <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-left text-xs text-gray-500 uppercase">
                        <tr><th className="px-4 py-3">Wallet entries</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">Count</th><th className="px-4 py-3">Total</th></tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {(data.ledger || []).length === 0 && (
                            <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-500">No wallet activity yet.</td></tr>
                        )}
                        {(data.ledger || []).map((l) => (
                            <tr key={`${l.type}-${l.source}`}>
                                <td className="px-4 py-3 font-medium text-gray-900">{SOURCE_LABELS[l.source] || l.source}</td>
                                <td className="px-4 py-3 text-gray-600">{l.type === 'credit' ? 'Money in' : 'Money out'}</td>
                                <td className="px-4 py-3 text-gray-600">{l.count}</td>
                                <td className="px-4 py-3 font-semibold text-gray-900">{formatCurrency(l.total)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

// ─── Page ─────────────────────────────────────────────────────────────────────
const TABS = [
    { id: 'referrals', label: 'Referrals' },
    { id: 'settings', label: 'Settings' },
    { id: 'report', label: 'Report' },
];

const ReferEarn = () => {
    const location = useLocation();
    // Staff panels live under /staff/<role>; keep links inside the same panel.
    const basePath = location.pathname.split('/refer-earn')[0] || '/admin';
    const [tab, setTab] = useState(() => new URLSearchParams(location.search).get('tab') || 'referrals');

    return (
        <div className="space-y-5">
            <div className="flex items-center gap-3">
                <span className="w-10 h-10 rounded-xl bg-primary-50 text-primary-600 flex items-center justify-center"><FiGift /></span>
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Refer &amp; Earn</h1>
                    <p className="text-sm text-gray-500">Customers earn wallet money when a friend's first order is delivered.</p>
                </div>
            </div>
            <div className="flex gap-1 border-b border-gray-200 overflow-x-auto">
                {TABS.map((t) => (
                    <button
                        key={t.id}
                        onClick={() => setTab(t.id)}
                        className={`px-5 py-3 text-sm font-semibold border-b-2 -mb-px whitespace-nowrap ${tab === t.id ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-600 hover:text-gray-800'}`}
                    >
                        {t.label}
                    </button>
                ))}
            </div>
            {tab === 'referrals' && <ReferralsTab basePath={basePath} />}
            {tab === 'settings' && <SettingsTab />}
            {tab === 'report' && <ReportTab />}
        </div>
    );
};

export default ReferEarn;
