import assert from 'node:assert';
import { hasRejectedTryBuyItems } from './orderItemStatus.js';

const rejected = { productId: 'p1', decision: 'rejected' };
const accepted = { productId: 'p2', decision: 'accepted' };

assert.strictEqual(hasRejectedTryBuyItems({ deliveryFlow: { rejectedItems: [rejected] } }), true);
assert.strictEqual(hasRejectedTryBuyItems({ deliveryFlow: { tryAndBuyItems: [accepted, rejected] } }), true);
assert.strictEqual(hasRejectedTryBuyItems({ deliveryFlow: { tryAndBuyItems: [accepted], rejectedItems: [] } }), false);
assert.strictEqual(hasRejectedTryBuyItems({ deliveryFlow: {} }), false);
assert.strictEqual(hasRejectedTryBuyItems({}), false);
assert.strictEqual(hasRejectedTryBuyItems(null), false);

console.log('orderItemStatus tests passed');
