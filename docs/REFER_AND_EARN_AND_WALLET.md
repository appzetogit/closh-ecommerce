# Refer & Earn + Customer Wallet — Design Spec

| | |
|---|---|
| Status | Implemented (v1), not yet released |
| Scope | Customer app, Admin panel, Backend API |
| Owner | CLOSH engineering |
| Last updated | 9 Oct 2026 |

> **How v1 differs from this spec**
>
> - **Background jobs are database sweeps, not BullMQ jobs** (§7.5, §7.7 step 6). `services/rewardJobs.service.js` runs three timers in the API process:
>   - pay referrals whose `rewardDueAt` has passed, every 5 min;
>   - cancel unpaid online orders that used wallet money after 30 min, every 5 min;
>   - expire old wallet credits, every hour.
>
>   Each step is idempotent: a unique `idempotencyKey` on the ledger plus conditional status updates. So a missed tick, a restart or two instances running at once cannot pay twice. Nothing to schedule in Redis.
> - **Checkout preview is `POST /api/user/wallet/preview`** (§6.3). It takes the totals the checkout page already shows (subtotal, coupon discount, shipping, platform fee) and returns the wallet amount. It runs the same `computeWalletApplied()` that `placeOrder` uses. `placeOrder` still recomputes everything on the server, and that number is what the order charges. The full `computeOrderTotals()` extraction was not done in v1.
> - **Admin UI:**
>   - one page, **Refer & Earn** (`/admin/refer-earn`), with Referrals, Settings and Report tabs;
>   - a **Wallet** tab on the customer detail page, with balance, ledger and a manual credit/debit.
> - **Defaults for the open decisions (D1–D9):** see §4. Both programmes ship switched **off** (`enabled: false`) until an admin turns them on.

---

## 1. Summary

Two features that work together:

1. **Refer & Earn** — every customer gets a referral code. When a friend signs up with that code and the friend's **first order** is delivered (and kept past the return window), the referrer earns a reward in their **CLOSH wallet**. Nothing is earned for sharing, for sign-ups, or for any order after the first. Every number is **admin-configurable**.
2. **Customer Wallet** — a balance the customer can spend at checkout to **reduce the price they pay**. Referral rewards are the first source of wallet money; the same wallet also receives refunds of wallet-paid amounts and manual admin credits.

```
Friend signs up with code ──► first order placed ──► delivered & kept ──► return window passes ──► referrer wallet +₹X
                                   │                         │
                                   └── cancelled / fully returned / fraud ──► referral void (no reward)

Customer at checkout ──► "Use wallet (₹X available)" ──► payable amount reduced ──► pay the rest (COD / online)
```

### 1.1 Goals

- Grow new customers through existing customers, paying only for **real, kept first orders**.
- Let admins change rewards, limits and eligibility without a deploy.
- Let customers use wallet money at checkout safely — no double spending, no negative balances, correct refunds.

### 1.2 Non-goals (v1)

- Cash withdrawal of wallet balance to bank/UPI.
- Multi-level referrals (friend of a friend).
- Rewards for vendors or delivery partners.
- Wallet top-ups with money (add money to wallet).

---

## 2. Current state (what exists today)

| Area | Today | File |
|---|---|---|
| Refer page | Static UI. Code `19VIHR` and `₹250` are hard-coded; no API. | `frontend/src/modules/user/pages/Refer/ReferPage.jsx` |
| Customer wallet | Does not exist. `User` has no balance field. Vendor/rider wallets live in `services/wallet.service.js` and are unrelated. | `backend/src/models/User.model.js` |
| Sign-up | `POST /api/user/auth/register-otp` creates the user, then `verify-otp` verifies. | `backend/src/modules/user/controllers/auth.controller.js` (`registerOtp`, `verifyOTP`) |
| Order pricing | `placeOrder`: server computes `subtotal`, coupon via `validateCoupon`, then `total = subtotal - couponDiscount + shipping + platformFee`, inside a Mongo transaction; Razorpay order created for prepaid. | `backend/src/modules/user/controllers/order.controller.js` (`placeOrder` ≈ L70–700) |
| Payment verify | `verifyPayment` checks Razorpay signature and marks `paymentStatus: 'paid'`. | same file (`verifyPayment` ≈ L714) |
| Cancel / refund | `cancelOrderInternal` refunds online payments via `refundPayment` and releases the coupon. | same file (≈ L883–1020) |
| Try & Buy pricing | `handleTryAndBuy` recomputes the payable on kept items (coupon re-checked on kept items). | `backend/src/modules/delivery/controllers/order.controller.js` |
| Order completion | Delivered / `try_buy_completed` → `WalletService.processOrderCompletionSafe` credits vendor + rider. | `backend/src/services/wallet.service.js` |
| Admin settings | Key/value store (`Settings` model) — keys in use: `orders`, `shipping`, `tax`, `delivery_fees`, … | `backend/src/models/Settings.model.js` |
| Background jobs | BullMQ queues in `services/queue.service.js` (with an in-process fallback when Redis is down). | `backend/src/services/queue.service.js` |

---

## 3. Business rules

### 3.1 Refer & Earn

| # | Rule |
|---|---|
| R1 | Every customer has exactly one unique referral code. |
| R2 | A referral code can be applied **only at sign-up** (or via a referral link opened before sign-up). It cannot be added later. |
| R3 | A customer can be referred **once**, by one referrer. |
| R4 | **Only the referred friend's first order counts.** A referral qualifies when the friend's first order is delivered, the amount kept meets the minimum order value, and the return window has passed. Second and later orders never earn anything. |
| R5 | Sharing a code or signing up earns **nothing**. |
| R6 | Self-referral is blocked (same phone, email, device, or delivery address as the referrer). |
| R7 | If the qualifying order is cancelled, fully returned, or fully rejected in Try & Buy, the referral is **void**. |
| R8 | A referrer can earn at most `maxRewardsPerReferrer` rewards (lifetime) and `monthlyRewardCap` per calendar month. |
| R9 | Reward amounts are frozen at sign-up time (settings snapshot on the referral). Changing settings later does not change already-created referrals. |
| R10 | Admin can void a referral manually with a reason (fraud review). A rewarded referral can be reversed only by an explicit admin debit. |

> **Decision needed (D1):** if the friend's *first* order is cancelled before delivery, can their *next* order still qualify? Default in this spec: **yes** — "first order" means the friend's first order that is actually delivered and kept (`firstOrderStrict = false`). Set `firstOrderStrict = true` to void on the first cancellation instead.

### 3.2 Wallet

| # | Rule |
|---|---|
| W1 | Wallet balance can never go negative. |
| W2 | At checkout the customer can choose to use the wallet. The server decides the amount — the client only says "use wallet". |
| W3 | Wallet amount used per order = `min(balance, maxWalletPercentPerOrder × payableBeforeWallet, maxWalletAmountPerOrder)`, where `payableBeforeWallet = subtotal − coupon + shipping + platformFee`. |
| W4 | Wallet is applied **after** the coupon, on the full payable including fees. With the default 100% limit a large enough balance pays the whole order. |
| W5 | Wallet money is spent from the **earliest-expiring credit first** (FIFO by expiry). |
| W6 | Credits expire after `creditValidityDays` (0 = never). Expired amounts are removed by a daily job. |
| W7 | If an order paid partly by wallet is cancelled or returned, the wallet-paid part goes **back to the wallet** (with its original expiry, or a minimum grace of `refundGraceDays` if already expired). The online part is refunded to the original payment method (existing Razorpay refund). |
| W8 | The wallet discount is a **platform-funded** discount: vendor earnings are calculated on item prices exactly as today and are not reduced. |
| W9 | Wallet cannot be withdrawn as cash (v1). |

---

## 4. Admin-configurable settings

Stored in `Settings` with `key: 'referral'` and `key: 'wallet'`. Read through a small cached helper (`getReferralSettings()`, `getWalletSettings()`, 60 s cache, invalidated on admin save).

### 4.1 `referral`

| Field | Type | Default | Meaning |
|---|---|---|---|
| `enabled` | bool | `false` | Master switch. When off: codes cannot be applied; existing pending referrals keep their snapshot and can still qualify. |
| `referrerReward.type` | `flat` \| `percent` | `flat` | Flat ₹ or % of the friend's kept first-order subtotal. |
| `referrerReward.value` | number | `250` | ₹ amount or percent. |
| `referrerReward.maxAmount` | number | `250` | Cap when `type = percent`. |
| `refereeReward.enabled` | bool | `false` | Whether the friend also gets wallet credit. |
| `refereeReward.value` | number | `100` | Flat ₹ credited to the friend when the referral is rewarded. |
| `minFirstOrderValue` | number | `999` | Minimum **kept** subtotal after coupon (excluding fees) for the first order to qualify. |
| `rewardDelayHours` | number | `24` | Wait after delivery before rewarding (should be ≥ return window). |
| `allowCod` | bool | `true` | Whether a COD first order can qualify. |
| `firstOrderStrict` | bool | `false` | See D1. |
| `maxRewardsPerReferrer` | number | `50` | Lifetime cap of rewarded referrals per referrer. 0 = unlimited. |
| `monthlyRewardCap` | number | `10` | Max rewarded referrals per referrer per calendar month. 0 = unlimited. |
| `shareMessage` | string | `"Shop on CLOSH with my code {CODE} …"` | Text used by the share sheet; `{CODE}` and `{LINK}` placeholders. |
| `termsText` | string (markdown) | — | Shown on the Refer page. |

### 4.2 `wallet`

| Field | Type | Default | Meaning |
|---|---|---|---|
| `enabled` | bool | `false` | Master switch for using the wallet at checkout (earning still accrues). |
| `maxWalletPercentPerOrder` | number | `100` | % of the payable (subtotal − coupon + fees) that the wallet may cover. |
| `maxWalletAmountPerOrder` | number | `0` | ₹ cap per order. 0 = no cap. |
| `minOrderValueForWallet` | number | `0` | Wallet usable only when (subtotal − coupon) ≥ this. |
| `creditValidityDays` | number | `180` | Expiry for new credits. 0 = never expire. |
| `refundGraceDays` | number | `30` | Minimum validity given to wallet money refunded after its original expiry. |
| `allowWithCoupon` | bool | `true` | Whether wallet can be combined with a coupon. |

Validation (Joi, admin side): all numbers ≥ 0; percents ≤ 100; `rewardDelayHours` ≤ 720; strings ≤ 1000 chars.

---

## 5. Data model

### 5.1 `User` (new fields)

```js
referralCode:    { type: String, unique: true, sparse: true, uppercase: true, trim: true }, // e.g. "RAHUL7K2"
referredBy:      { type: ObjectId, ref: 'User', default: null },
referralAppliedAt: Date,
walletBalance:   { type: Number, default: 0, min: 0 },   // cached sum of open credit lots; source of truth = ledger
signupDeviceId:  { type: String, index: true },           // for anti-fraud (see §9)
```

Code format: first 4 letters of the name (A–Z only, padded with `X`) + 4 random chars from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (no 0/O/1/I). Retry on unique-index collision. Generated in a `pre('save')` hook for new users; existing users are back-filled by a one-off script (§12).

### 5.2 `Referral` (new collection)

```js
{
  referrer:   { type: ObjectId, ref: 'User', required: true, index: true },
  referee:    { type: ObjectId, ref: 'User', required: true, unique: true }, // R3: one per friend
  code:       String,
  status:     { type: String, enum: ['pending', 'order_placed', 'qualified', 'rewarded', 'void'], default: 'pending', index: true },
  firstOrder: { type: ObjectId, ref: 'Order' },
  keptValue:  Number,             // kept subtotal after coupon, used to check minFirstOrderValue
  rewardDueAt: Date,              // deliveredAt + rewardDelayHours
  referrerReward: Number,         // amount actually credited
  refereeReward:  Number,
  settingsSnapshot: Object,       // copy of `referral` settings at sign-up (R9)
  voidReason: String,             // 'order_cancelled' | 'fully_returned' | 'below_min_value' | 'cod_not_allowed' | 'self_referral' | 'cap_reached' | 'admin' ...
  voidedBy:   { type: ObjectId, ref: 'Admin' },
  fraudFlags: [String],           // e.g. ['same_address', 'same_device']
  rewardedAt: Date,
}
// indexes: { referrer: 1, status: 1, rewardedAt: -1 }, { status: 1, rewardDueAt: 1 }
```

Status lifecycle:

```
pending ──(first order placed)──► order_placed ──(delivered & kept ≥ min)──► qualified ──(reward job)──► rewarded
   │                                   │                                        │
   └───────────────────────────────────┴──────── cancel / return / fraud ───────┴──────────────────────► void
                                       │
                                       └─(cancelled & firstOrderStrict=false)──► back to pending
```

### 5.3 `WalletTransaction` (new collection — the ledger)

One document per credit or debit. The balance is the sum of `remaining` over open credit lots; `User.walletBalance` is a cached copy updated in the same transaction.

```js
{
  user:      { type: ObjectId, ref: 'User', required: true, index: true },
  type:      { type: String, enum: ['credit', 'debit'], required: true },
  source:    { type: String, enum: ['referral_reward', 'referee_reward', 'order_payment', 'order_refund', 'expiry', 'admin_adjustment'], required: true },
  amount:    { type: Number, required: true, min: 0.01 },
  remaining: Number,              // credits only: unspent part of this lot
  expiresAt: Date,                // credits only
  order:     { type: ObjectId, ref: 'Order' },
  referral:  { type: ObjectId, ref: 'Referral' },
  allocations: [{ credit: ObjectId, amount: Number }], // debits only: which lots were consumed (FIFO), so refunds restore the same lots
  idempotencyKey: { type: String, unique: true },       // e.g. "referral_reward:<referralId>", "order_payment:<orderId>"
  note:      String,              // admin reason
  createdBy: { type: ObjectId, refPath: 'createdByModel' },
  createdByModel: { type: String, enum: ['Admin', 'System'] },
  balanceAfter: Number,
}
// indexes: { user: 1, createdAt: -1 }, { user: 1, type: 1, remaining: 1, expiresAt: 1 }
```

`idempotencyKey` makes every credit/debit safe to retry: a duplicate insert fails on the unique index and is treated as "already done".

### 5.4 `Order` (new fields)

```js
walletApplied:   { type: Number, default: 0 },   // amount paid from wallet
walletDebitId:   { type: ObjectId, ref: 'WalletTransaction' },
walletRefunded:  { type: Number, default: 0 },   // amount returned to wallet so far
referral:        { type: ObjectId, ref: 'Referral' }, // set when this order is the referee's tracked first order
```

`originalPricing` (already exists) also stores `walletApplied` when Try & Buy rewrites the totals.

---

## 6. Pricing — how wallet changes the order total

### 6.1 Formula (server only)

```
itemsSubtotal  = Σ (variant price × qty)                 // resolveVariantPrice, unchanged
couponDiscount = validateCoupon(code, itemsSubtotal)      // unchanged
eligibleBase        = itemsSubtotal − couponDiscount
payableBeforeWallet = eligibleBase + shipping + platformFee
walletApplied       = useWallet && wallet.enabled && eligibleBase ≥ minOrderValueForWallet
                        ? min(balance,
                              payableBeforeWallet × maxWalletPercentPerOrder / 100,
                              maxWalletAmountPerOrder || ∞)
                        : 0
total (payable)     = payableBeforeWallet − walletApplied
```

Round to 2 decimals. If `total == 0` the order is fully wallet-paid: `paymentMethod = 'wallet'`, `paymentStatus = 'paid'`, no Razorpay order.

### 6.2 Worked examples (₹999 min, flat ₹250 reward, 100% wallet allowed, ₹20 platform fee)

| Case | Subtotal | Coupon | Wallet bal. | Wallet used | Fees | Payable |
|---|---|---|---|---|---|---|
| A. No wallet | 1,200 | 170 | 250 | 0 | 20 | 1,050 |
| B. Use wallet | 1,200 | 170 | 250 | 250 | 20 | 800 |
| C. Wallet > order | 400 | 0 | 600 | 420 | 20 | 0 (wallet-paid) |
| D. 50% cap | 1,000 | 0 | 900 | 510 | 20 | 510 |

### 6.3 Checkout preview API

The checkout page must show the same numbers the order will charge. Add `POST /api/user/checkout/preview` (or extend the existing cart total call) returning `{ subtotal, couponDiscount, walletAvailable, walletApplied, shipping, platformFee, total }` using the exact function `placeOrder` uses (`computeOrderTotals()` extracted into `services/pricing.service.js`). Never compute the wallet amount in the browser.

---

## 7. Flows

### 7.1 Sharing (no reward)

1. Customer opens **Refer & Earn** → `GET /api/user/referral` returns code, link, settings text and stats.
2. Taps **Share** → native share sheet / WhatsApp with `shareMessage` (`{CODE}`, `{LINK}` = `https://www.closh.in/r/{CODE}`).
3. `/r/{CODE}` (frontend route) stores the code in `localStorage` (`closh_ref`, 30-day expiry) and redirects to the home page.

### 7.2 Sign-up with a code

1. Register form shows **Referral code (optional)**, prefilled from `closh_ref`.
2. `POST /api/user/auth/register-otp` accepts `referralCode` and `deviceId` (random UUID kept in `localStorage`).
3. Server stores the code on the pending user only (`pendingReferralCode`). The referral is **created after OTP verification** in `verifyOTP`, so unverified sign-ups cannot farm referrals:
   - feature enabled; code exists; referrer active and not blocked;
   - not self (§9); referee has **no prior orders**;
   - referrer under caps (checked again at reward time).
   - On success: `User.referredBy`, `referralAppliedAt`, new `Referral { status: 'pending', settingsSnapshot }`.
   - On failure: sign-up still succeeds; the response carries `referral: { applied: false, reason }` and the app shows a soft message.
4. `POST /api/user/referral/validate-code` lets the form check a code before submit (rate-limited, returns only valid/invalid + referrer first name).

### 7.3 First order placed

In `placeOrder`, inside the existing transaction, after the order is created:

- If the user has a `Referral` in `pending` and this is their first non-cancelled order → set `order.referral`, `referral.firstOrder`, status `order_placed`.
- If `allowCod = false` and the order is COD → leave the referral `pending` (a later prepaid first-delivered order can still qualify when `firstOrderStrict = false`).

### 7.4 Delivered and kept → qualify

Hook in the places that finish an order (all already call `WalletService.processOrderCompletionSafe`):

- `handleCompleteDelivery` (status `delivered`),
- `finalizeTryBuyOrderAfterAutoReturn` / `markTryBuyVendorReturned` (status `try_buy_completed` or `returned`).

Add `ReferralService.onOrderCompleted(order)`:

1. Find `Referral` with `firstOrder = order._id` and status `order_placed`.
2. `keptValue = order.subtotal − order.couponDiscount` (already rewritten to kept items for Try & Buy).
3. If `keptValue < snapshot.minFirstOrderValue` → `void` (`below_min_value`). If nothing kept → `void` (`fully_returned`).
4. Else → status `qualified`, `rewardDueAt = now + rewardDelayHours`, enqueue `referral-reward` job with `delay = rewardDelayHours` and `jobId = referral:<id>` (dedup).

### 7.5 Reward job (BullMQ `referral-reward-queue`)

Runs at `rewardDueAt` (plus a daily sweeper that picks up any `qualified` referral past due, in case Redis lost the job):

1. Re-load referral (must be `qualified`) and order.
2. Order must still be `delivered`/`try_buy_completed`, with **no open return request**. If a return is open → push `rewardDueAt` by 24 h and re-enqueue. If the order was returned and kept value now < min → `void`.
3. Check referrer caps (lifetime/monthly). Over cap → `void` (`cap_reached`).
4. In one Mongo transaction:
   - `WalletService.credit(referrer, amount, { source: 'referral_reward', referral, idempotencyKey: 'referral_reward:<id>' })`;
   - if `refereeReward.enabled` → credit the friend (`referee_reward:<id>`);
   - referral → `rewarded`, `rewardedAt`.
5. Notify both users (push + in-app): "₹250 added to your CLOSH wallet — Rahul placed their first order".

### 7.6 Void triggers

| Event | Where to hook | Effect |
|---|---|---|
| Order cancelled (user/admin/rider) | `cancelOrderInternal`, admin/delivery cancel paths | `firstOrderStrict` ? `void` : back to `pending` (clear `firstOrder`) |
| Try & Buy fully rejected | `handleTryAndBuy` (nothing kept) | same as cancel |
| Return completed after reward | return completion paths | No automatic clawback (R10). Admin may debit manually. |
| Return during waiting period | reward job step 2 | re-check kept value; `void` if below min |
| Admin void | admin API | `void` with `voidReason: 'admin'`, `voidedBy` |

### 7.7 Paying with wallet at checkout

1. Checkout shows a **Use CLOSH wallet** toggle with the available balance (from preview API) and the amount that will be used.
2. `POST /api/user/orders` with `useWallet: true`.
3. In `placeOrder`, inside the **same transaction** that creates the order and consumes the coupon:
   - compute `walletApplied` (§6.1);
   - `WalletService.debit(user, walletApplied, { source: 'order_payment', order, idempotencyKey: 'order_payment:<orderId>' })`:
     - pick open credit lots ordered by `expiresAt` (nulls last), decrement `remaining`, record `allocations`;
     - `User.updateOne({ _id, walletBalance: { $gte: amount } }, { $inc: { walletBalance: -amount } })` — if `matchedCount === 0` abort with 409 "Wallet balance changed, please retry";
   - set `order.walletApplied`, `order.walletDebitId`, `order.total = payable`.
4. **COD**: rider collects `payable` only (delivery screens already read `order.total` / `finalAmount`).
5. **Online**: Razorpay order amount = `payable` (paise). If payable is 0 → no Razorpay order.
6. **Abandoned online payment**: today unpaid online orders are not cleaned up. Add a `wallet-hold-release` job enqueued at order creation with a 30-minute delay: if the order is still `paymentStatus: 'pending'`, cancel it through `cancelOrderInternal`, which refunds the wallet (7.8) and releases the coupon.

### 7.8 Refunds back to the wallet

`WalletService.refundOrder(order, amount, reason)`:

- `amount` = wallet part to return (never more than `walletApplied − walletRefunded`).
- Restores the original lots from `allocations` (keeps their expiry; if already expired, sets `expiresAt = now + refundGraceDays`). Idempotency key `order_refund:<orderId>:<n>`.
- Increments `order.walletRefunded`.

When to call it:

| Situation | Wallet refund |
|---|---|
| Order cancelled before delivery | Full `walletApplied`. Online part refunded via Razorpay as today. |
| Try & Buy: kept payable < wallet used | `walletApplied − keptPayable` returned; `walletApplied` reduced on the order. Example: wallet ₹500 used, customer keeps one ₹300 item (+₹20 fee = ₹320) → ₹180 back to wallet, COD due ₹0. |
| Try & Buy fully rejected | Full `walletApplied` (platform fee rule unchanged). |
| Customer return after delivery | Refund split **proportionally**: `refund × walletApplied / originalPayableBeforeWallet` goes to wallet, the rest via the existing refund path (UPI/Razorpay). |

### 7.9 Try & Buy recalculation (extends existing `handleTryAndBuy`)

Order of operations on the kept items:

1. Kept subtotal (existing).
2. Coupon re-check on kept items (existing `recomputeTryBuyCouponDiscount`).
3. `keptPayable = keptSubtotal − coupon + shipping + platformFee + hiddenFees`.
4. `walletUsed = min(order.walletApplied, keptPayable)`; refund `order.walletApplied − walletUsed` to the wallet (7.8).
5. `finalAmount = keptPayable − walletUsed` (this is what the rider collects for COD).

---

## 8. API

### 8.1 Customer (`/api/user`, auth required unless noted)

| Method | Path | Purpose |
|---|---|---|
| GET | `/referral` | `{ code, link, shareMessage, terms, reward: {referrer, referee, minFirstOrderValue}, stats: { invited, pending, rewarded, earned } }` |
| GET | `/referral/history?page=` | Friends referred: masked name, status, reward, date |
| POST | `/referral/validate-code` (public, rate-limited) | `{ code }` → `{ valid, referrerFirstName }` |
| GET | `/wallet` | `{ balance, expiringSoon: [{amount, expiresAt}], settings: {enabled, maxPercent, maxAmount} }` |
| GET | `/wallet/transactions?page=` | Ledger entries (newest first) |
| POST | `/checkout/preview` | Totals incl. wallet (§6.3) |
| POST | `/orders` | Existing; new body field `useWallet: boolean` |
| POST | `/auth/register-otp` | Existing; new optional `referralCode`, `deviceId` |

### 8.2 Admin (`/api/admin`, role-checked)

| Method | Path | Purpose |
|---|---|---|
| GET/PUT | `/settings/referral` | Read / update referral settings (Joi-validated) |
| GET/PUT | `/settings/wallet` | Read / update wallet settings |
| GET | `/referrals?status=&from=&to=&search=` | List with filters, fraud flags |
| GET | `/referrals/:id` | Detail incl. order, snapshot, timeline |
| POST | `/referrals/:id/void` | `{ reason }` |
| POST | `/referrals/:id/reward-now` | Force reward (skips wait, keeps all other checks) |
| GET | `/users/:id/wallet` | Balance + ledger |
| POST | `/users/:id/wallet/adjust` | `{ type: 'credit'|'debit', amount, note }` — audited, idempotent per request id |
| GET | `/reports/referral` | Totals: referrals by status, rewards paid, outstanding wallet liability, expiring next 30 days |

All admin wallet changes write a `WalletTransaction` with `createdBy`; nothing edits `walletBalance` directly.

---

## 9. Fraud and abuse controls

| Risk | Control |
|---|---|
| Self-referral with a second number | Block if referee phone, email, `deviceId`, or first delivery address (normalised) matches the referrer's. Flag (don't block) if referee and referrer share an IP /24 on sign-up. |
| Fake orders to trigger rewards | Reward only after delivery + `rewardDelayHours`; COD can be excluded (`allowCod`); min kept value. |
| Order-then-return | Reward job re-checks returns; kept value must stay ≥ min. |
| Code brute force | `validate-code` and `register-otp` rate-limited (existing `authLimiter`); generic error messages. |
| Mass referrals | `maxRewardsPerReferrer`, `monthlyRewardCap`; admin report sorted by rewards per referrer. |
| Double spend (two tabs) | Conditional `$inc` on `walletBalance` + lot updates inside the order transaction; ledger `idempotencyKey`. |
| Race between reward and void | Status transitions use conditional updates (`findOneAndUpdate({ _id, status: 'qualified' }, …)`). |

Flagged referrals stay in `qualified` with `fraudFlags` and are excluded from automatic reward when `autoRewardFlagged = false` (admin reviews them).

---

## 10. Backend implementation plan (files)

| Change | File |
|---|---|
| New models | `models/Referral.model.js`, `models/WalletTransaction.model.js` |
| User fields + code generator | `models/User.model.js`, `utils/referralCode.js` |
| Order fields | `models/Order.model.js` |
| Settings helpers | `services/settings.service.js` (`getReferralSettings`, `getWalletSettings`, cached) |
| Wallet service (customer) | `services/customerWallet.service.js` — `credit`, `debit`, `refundOrder`, `expireCredits`, `getBalance` (all transaction-aware, idempotent) |
| Referral service | `services/referral.service.js` — `applyCodeOnSignup`, `onOrderPlaced`, `onOrderCompleted`, `onOrderCancelled`, `rewardReferral`, `voidReferral` |
| Pricing extraction | `services/pricing.service.js` — `computeOrderTotals()` used by `placeOrder` and the preview API |
| Sign-up hooks | `modules/user/controllers/auth.controller.js` (`registerOtp`, `verifyOTP`) + validator |
| Order hooks | `modules/user/controllers/order.controller.js` (`placeOrder`, `verifyPayment`, `cancelOrderInternal`, returns) |
| Delivery hooks | `modules/delivery/controllers/order.controller.js` (`handleTryAndBuy`, `handleCompleteDelivery`, `finalizeTryBuyOrderAfterAutoReturn`, `markTryBuyVendorReturned`) |
| Queues | `services/queue.service.js` — `referral-reward-queue`, `wallet-hold-release-queue`; daily sweeper + credit expiry job |
| Routes/controllers | `modules/user/routes`, `modules/user/controllers/referral.controller.js`, `wallet.controller.js`; admin equivalents |
| Notifications | `createNotification` types `referral` / `wallet` (add to `Notification.type` enum) |

---

## 11. Frontend implementation plan

### 11.1 Customer app

| Screen | Change |
|---|---|
| Refer & Earn (`pages/Refer/ReferPage.jsx`) | Load from `GET /referral`: real code, copy, share button (Web Share API → WhatsApp fallback), "How it works" from settings, stats cards (invited / pending / earned), history list. Remove hard-coded `19VIHR` / `₹250`. |
| Referral link route | New route `/r/:code` → save `closh_ref` → redirect `/`. |
| Register (`LoginPage.jsx` / `LoginModal.jsx` register step) | Optional "Referral code" input, prefilled; inline validation via `validate-code`; send `deviceId`. |
| Wallet page (new, from Profile) | Balance, "expiring soon" banner, transaction list. |
| Checkout / Payment (`pages/Checkout/CheckoutPage.jsx`, `pages/Payment.jsx`) | "Use CLOSH wallet (₹X available)" toggle; bill details add a **Wallet** line (`−₹Y`); totals always from `checkout/preview`; when payable is 0 hide payment methods and show "Paid with wallet". |
| Order details | Show "Paid from wallet −₹Y" and any "₹Z returned to wallet". |
| Header / Profile | Small wallet balance chip (optional). |

### 11.2 Admin panel

| Screen | Change |
|---|---|
| Settings → Refer & Earn | Form for §4.1 with live preview of the customer "How it works" text. |
| Settings → Wallet | Form for §4.2. |
| Marketing → Referrals | Table: referrer, friend, status, first order, kept value, reward, flags, dates; actions: view, void, reward now. |
| Customers → Customer detail | Wallet tab: balance, ledger, "Adjust balance" dialog (amount, credit/debit, mandatory note). |
| Reports | Referral funnel (invited → order placed → rewarded), rewards paid, outstanding wallet liability. |

### 11.3 Rider app

No change in flow; amounts already come from `order.total` / `deliveryFlow.finalAmount`, which now exclude the wallet part. Show "Paid from wallet ₹Y" on the order card so the rider knows why COD is lower.

---

## 12. Migration and rollout

1. Deploy models + services with both features **disabled** (`enabled: false`).
2. Run `scripts/backfillReferralCodes.js` (idempotent; batches of 500) to give every existing user a code.
3. Admin fills settings; enable `referral` first (earning only). Monitor for a week.
4. Enable `wallet` (spending). Start with `maxWalletPercentPerOrder = 50`.
5. Update the Refer page copy from settings.

Rollback: disable both switches; balances and referrals stay intact.

---

## 13. Edge cases

| Case | Expected behaviour |
|---|---|
| Friend already has an account | Code cannot be applied (R2). |
| Friend's first order is Try & Buy, keeps ₹800 of ₹1,500 (min ₹999) | `void` (`below_min_value`). |
| Friend's first order cancelled, second order delivered | `firstOrderStrict=false`: second order qualifies. `true`: void at first cancel. |
| Referrer account deleted/blocked before reward | `void` (`referrer_inactive`). |
| Settings changed after friend signed up | Referral uses its `settingsSnapshot` (R9). |
| Two checkouts at once using the same wallet | Second fails with 409 and re-prices; balance never negative. |
| Wallet covers the whole order | `paymentMethod: 'wallet'`, `paymentStatus: 'paid'`, no Razorpay order; rider collects ₹0. |
| Online payment abandoned | `wallet-hold-release` cancels after 30 min, wallet and coupon returned. |
| Credit expires while order is placed with it | Debit happened at order time; a later refund restores with `refundGraceDays`. |
| Reward job runs twice | Second run is a no-op (status check + ledger `idempotencyKey`). |
| Redis down | Queues fall back to in-process timers (existing pattern) and the daily sweeper catches anything missed. |

---

## 14. Testing plan

**Unit**
- `computeOrderTotals`: wallet caps (percent, amount, min order), with/without coupon, wallet > payable, rounding.
- `customerWallet.debit`: FIFO by expiry, insufficient balance, idempotency.
- `refundOrder`: restores the same lots, grace on expired lots, never exceeds `walletApplied`.
- `referral.service`: each status transition and each void reason.

**Integration (isolated local Mongo replica set, `seedE2E.js`)**
1. A refers B → B signs up with code → B orders ₹1,200 COD → delivered → advance time → A's wallet +₹250.
2. Same, but B keeps ₹800 in Try & Buy → void.
3. B cancels first order → second order qualifies (non-strict).
4. A uses ₹250 wallet on a ₹1,050 order → payable ₹800; cancel → wallet back to ₹250.
5. A uses wallet on an online order and abandons payment → after 30 min wallet restored.
6. Two parallel `placeOrder` calls with `useWallet` → one succeeds, one 409.
7. Admin changes reward from ₹250 to ₹100 → existing pending referral still pays ₹250.

**Browser end-to-end**: customer, vendor and rider tabs as in previous Try & Buy tests, plus admin settings and referral screens.

---

## 15. Metrics

- Referral funnel: links opened → sign-ups with code → first orders → rewarded; conversion per step.
- Cost per acquired customer = rewards paid / rewarded referrals.
- Wallet: credits issued, spent, expired; outstanding liability; % of orders using wallet; average wallet per order.
- Fraud: flagged referrals, voids by reason.

---

## 16. Decisions to confirm

| # | Question | Default in this spec |
|---|---|---|
| D1 | If the friend's first order is cancelled, can a later order qualify? | Yes (`firstOrderStrict = false`) |
| D2 | Reward form | Wallet credit (spent at checkout) |
| D3 | Does the friend also get a reward? | Off by default; configurable `refereeReward` |
| D4 | Do COD first orders qualify? | Yes (`allowCod = true`) |
| D5 | Can wallet be combined with a coupon? | Yes (`allowWithCoupon = true`) |
| D6 | Max share of an order payable by wallet | 100% (start rollout at 50%) |
| D7 | Credit expiry | 180 days |
| D8 | Clawback if the friend returns after the reward is paid | No automatic clawback; admin can debit |
| D9 | Who funds the wallet discount | Platform (vendor earnings unchanged) |
