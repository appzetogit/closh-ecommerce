import { io } from 'socket.io-client';
import toast from 'react-hot-toast';

import { IMAGE_BASE_URL } from './constants.js';
import { getAuthScopeForPath, getAccessTokenForScope, refreshAccessTokenForScope } from './api.js';

// Socket.io is attached to the same HTTP server as the REST API (see
// backend/src/server.js — initSocket() takes the same http.createServer()
// instance Express uses), so it is always the same origin as the API/image
// base. There is no separate socket port to hardcode.
const SOCKET_URL = IMAGE_BASE_URL;

// The socket server only accepts connections that present a valid access token (the same JWT the
// REST API uses). Use the token of the area the user is currently in (admin/vendor/delivery/user).
const currentScope = () => {
    try { return getAuthScopeForPath(window.location.pathname || '/'); } catch { return 'user'; }
};
const getSocketToken = () => {
    try { return getAccessTokenForScope(currentScope()); } catch { return null; }
};

const readJwt = (token) => {
    try {
        const part = String(token).split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
        return JSON.parse(atob(part));
    } catch {
        return null;
    }
};

// Seconds until a JWT expires (negative once expired); null if it can't be read.
const secondsUntilExpiry = (token) => {
    const payload = readJwt(token);
    return payload?.exp ? payload.exp - Date.now() / 1000 : null;
};

// How long before expiry to refresh: 2 minutes, or a quarter of the token's lifetime if shorter.
const refreshLeadSeconds = (token) => {
    const payload = readJwt(token);
    const lifetime = payload?.exp && payload?.iat ? payload.exp - payload.iat : null;
    return lifetime ? Math.min(REFRESH_BEFORE_EXPIRY_S, lifetime / 4) : REFRESH_BEFORE_EXPIRY_S;
};

// Why this exists: the server rejects an expired token. Access tokens expire while a vendor/rider
// app sits open or in the background; on the next reconnect (phone resumed, network blip) the
// socket presented the stale token, got 'unauthorized', and - because socket.io does not retry a
// rejected handshake - stayed dead. No socket means no new-order event and no buzzer. So:
//   * before (re)connecting with an expired token, refresh it first (same single-flight refresh as
//     the REST client, so they never race on the rotating refresh token);
//   * on 'unauthorized' / 'auth_expired', refresh and retry with backoff;
//   * refresh shortly before expiry while connected and hand the new token to the server (reauth);
//   * reconnect when the app comes back to the foreground or the network returns.
const AUTH_RETRY_DELAYS_MS = [1000, 3000, 7000, 15000, 30000, 60000];
const MAX_AUTH_RETRIES = 10;
const REFRESH_BEFORE_EXPIRY_S = 120;
const MAX_TIMER_MS = 2147483647;

class SocketService {
    constructor() {
        this.socket = null;
        this.rooms = new Set();
        this._queuedListeners = [];
        this._authRetries = 0;
        this._authRetryTimer = null;
        this._refreshTimer = null;
        this._recovering = null;
        this._lifecycleBound = false;
    }

    connect() {
        if (this.socket?.connected) return;

        // Not signed in: there is nothing a socket could be authorized for, so don't open one.
        // (Pages call connect() again after login, via the *Register helpers below.)
        if (!getSocketToken()) return;

        this._bindLifecycle();

        // Reuse the existing socket; _recover refreshes the token first if it has expired.
        if (this.socket) {
            this._recover();
            return;
        }

        this.socket = io(SOCKET_URL, {
            // Evaluated on every (re)connection attempt, so a refreshed token is picked up.
            auth: (cb) => cb({ token: getSocketToken() }),
            withCredentials: true,
            // Connect via _recover() so an already-expired stored token is refreshed first.
            autoConnect: false,
            reconnection: true,
            reconnectionAttempts: Infinity,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 10000,
            transports: ['websocket', 'polling'],
        });

        // Attach any queued listeners
        if (this._queuedListeners.length > 0) {
            this._queuedListeners.forEach(({ event, callback }) => {
                this.socket.on(event, callback);
            });
            this._queuedListeners = [];
        }

        this.socket.on('connect', () => {
            console.log('🔌 [SOCKET] Connected:', this.socket.id);
            toast.success('System Connected (Live)', { icon: '⚡', id: 'socket-status' });
            this._authRetries = 0;
            this._scheduleProactiveRefresh();

            // Re-join all general rooms
            this.rooms.forEach(room => this.socket.emit('join_room', room));

            // Critical: Re-register Delivery Partners
            const storedDeliveryId = localStorage.getItem('delivery_boy_id');
            if (storedDeliveryId) {
                 console.log(`🚴 [SOCKET] Auto-restoring Delivery registration for: ${storedDeliveryId}`);
                 this.socket.emit('delivery_register', storedDeliveryId);
            }

            // Critical: Re-register Vendors
            const storedVendorId = localStorage.getItem('vendor_id');
            if (storedVendorId) {
                 console.log(`🏪 [SOCKET] Auto-restoring Vendor registration for: ${storedVendorId}`);
                 this.socket.emit('vendor_register', storedVendorId);
            }

            // Critical: Re-register Users
            const storedUserId = localStorage.getItem('user_id_socket');
            if (storedUserId) {
                 console.log(`👤 [SOCKET] Auto-restoring User registration for: ${storedUserId}`);
                 this.socket.emit('user_register', storedUserId);
            }
        });

        this.socket.on('disconnect', (reason) => {
            console.warn('🔌 [SOCKET] Disconnected:', reason);
            if (reason === 'io server disconnect') {
                // The server closed it (e.g. token expired); socket.io won't reconnect by itself.
                this._recover();
            }
        });

        this.socket.on('connect_error', (error) => {
            console.error('🔌 [SOCKET] Connection error:', error.message);
            // A rejected handshake is not retried by socket.io: refresh the token and try again.
            // (Network errors are retried by socket.io's own reconnection.)
            if (error.message === 'unauthorized') this._scheduleAuthRetry();
        });

        // The server says our token expired while connected: refresh and reconnect.
        this.socket.on('auth_expired', () => this._scheduleAuthRetry(0));

        this._recover();
    }

    // Connect (or reconnect) the socket, refreshing the access token first when it has expired or
    // when `forceRefresh` is set (after the server rejected it). Single-flight; never throws.
    _recover({ forceRefresh = false } = {}) {
        if (!this.socket || this.socket.connected) return Promise.resolve();
        if (this._recovering) return this._recovering;

        this._recovering = (async () => {
            try {
                let token = getSocketToken();
                if (!token) return; // signed out

                const left = secondsUntilExpiry(token);
                if (forceRefresh || (left !== null && left < 30)) {
                    try {
                        token = await refreshAccessTokenForScope(currentScope());
                    } catch (err) {
                        console.warn('🔌 [SOCKET] Token refresh failed:', err?.message);
                        // No token left means the session ended (the REST layer logs the user out).
                        if (getSocketToken()) this._scheduleAuthRetry();
                        return;
                    }
                }
                if (this.socket && !this.socket.connected) this.socket.connect();
            } finally {
                this._recovering = null;
            }
        })();
        return this._recovering;
    }

    _scheduleAuthRetry(delayOverrideMs) {
        if (this._authRetryTimer) return;
        if (this._authRetries >= MAX_AUTH_RETRIES) {
            console.warn('🔌 [SOCKET] Giving up re-authenticating until the app is reopened or the user signs in again.');
            return;
        }
        const delay = delayOverrideMs ?? AUTH_RETRY_DELAYS_MS[Math.min(this._authRetries, AUTH_RETRY_DELAYS_MS.length - 1)];
        this._authRetries += 1;
        this._authRetryTimer = setTimeout(() => {
            this._authRetryTimer = null;
            this._recover({ forceRefresh: true });
        }, delay);
    }

    // Refresh the token shortly before it expires and give it to the live connection, so the server
    // never has to drop the socket (riders send location updates constantly).
    _scheduleProactiveRefresh() {
        clearTimeout(this._refreshTimer);
        const current = getSocketToken();
        const left = secondsUntilExpiry(current);
        if (left === null) return;
        const lead = refreshLeadSeconds(current);
        const inMs = Math.min(Math.max(5, left - lead) * 1000, MAX_TIMER_MS);
        this._refreshTimer = setTimeout(async () => {
            try {
                let token = getSocketToken();
                // The REST layer may already have refreshed it; only refresh if it is still near expiry.
                if ((secondsUntilExpiry(token) ?? 0) < refreshLeadSeconds(token) + 5) {
                    token = await refreshAccessTokenForScope(currentScope());
                }
                if (this.socket?.connected && token) this.socket.emit('reauth', token);
            } catch (err) {
                console.warn('🔌 [SOCKET] Proactive token refresh failed:', err?.message);
            }
            this._scheduleProactiveRefresh();
        }, inMs);
    }

    // Browsers freeze timers and drop sockets in the background; reconnect as soon as the app is
    // visible again or the network is back.
    _bindLifecycle() {
        if (this._lifecycleBound || typeof window === 'undefined') return;
        this._lifecycleBound = true;
        const wake = () => {
            if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
            if (!this.socket || !getSocketToken()) return;
            if (this.socket.connected) {
                this._scheduleProactiveRefresh(); // timers may have been frozen; recompute
            } else {
                this._authRetries = 0;
                this._recover();
            }
        };
        document.addEventListener('visibilitychange', wake);
        window.addEventListener('online', wake);
        window.addEventListener('focus', wake);
    }

    deliveryRegister(deliveryBoyId) {
        if (!deliveryBoyId) return;
        localStorage.setItem('delivery_boy_id', deliveryBoyId);
        console.log(`🚴 [SOCKET] Registering: ${deliveryBoyId}`);
        if (this.socket?.connected) {
            this.socket.emit('delivery_register', deliveryBoyId);
        } else {
            this.connect(); // first call after login: the token exists now
        }
    }

    userRegister(userId) {
        if (!userId) return;
        localStorage.setItem('user_id_socket', userId);
        console.log(`👤 [SOCKET] Registering User: ${userId}`);
        if (this.socket?.connected) {
            this.socket.emit('user_register', userId);
        } else {
            this.connect();
        }
    }

    vendorRegister(vendorId) {
        if (!vendorId) return;
        localStorage.setItem('vendor_id', vendorId);
        console.log(`🏪 [SOCKET] Registering Vendor: ${vendorId}`);
        if (this.socket?.connected) {
            this.socket.emit('vendor_register', vendorId);
        } else {
            this.connect();
        }
    }

    joinRoom(room) {
        if (!room) return;
        this.rooms.add(room);
        console.log(`🏠 [SOCKET] Joining room: ${room}`);
        if (this.socket && this.socket.connected) {
            this.socket.emit('join_room', room);
        }
    }

    leaveRoom(room) {
        if (!room) return;
        this.rooms.delete(room);
        console.log(`🏠 [SOCKET] Leaving room: ${room}`);
        if (this.socket) {
            this.socket.emit('leave_room', room);
        }
    }

    on(event, callback) {
        console.log(`👂 [SOCKET] Listening for: ${event}`);
        if (this.socket) {
            this.socket.on(event, callback);
        } else {
            console.log(`⏳ [SOCKET] Queuing listener for: ${event}`);
            this._queuedListeners.push({ event, callback });
        }
    }

    off(event, callback) {
        if (this.socket) {
            if (callback) {
                this.socket.off(event, callback);
            } else {
                this.socket.off(event);
            }
        }
        if (callback) {
            this._queuedListeners = this._queuedListeners.filter(l => !(l.event === event && l.callback === callback));
        } else {
            this._queuedListeners = this._queuedListeners.filter(l => l.event !== event);
        }
    }

    disconnect() {
        clearTimeout(this._refreshTimer);
        clearTimeout(this._authRetryTimer);
        this._authRetryTimer = null;
        this._authRetries = 0;
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
            this.rooms.clear();
            this._queuedListeners = [];
        }
    }
}

const socketService = new SocketService();
export default socketService;
