/**
 * Try & Buy auto-returns are the ReturnRequests the system opens when a customer
 * rejects items at the door. Older documents predate the explicit flag, so fall back
 * to the reason text they were created with.
 */
export const TRY_BUY_AUTO_RETURN_REASON = 'Try & Buy Auto-Return';

export const isTryBuyAutoReturn = (returnRequest) =>
    returnRequest?.isTryBuyAutoReturn === true || returnRequest?.reason === TRY_BUY_AUTO_RETURN_REASON;
