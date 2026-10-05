import { io } from 'socket.io-client';
import toast from 'react-hot-toast';

import { IMAGE_BASE_URL } from './constants.js';

// Socket.io is attached to the same HTTP server as the REST API (see
// backend/src/server.js — initSocket() takes the same http.createServer()
// instance Express uses), so it is always the same origin as the API/image
// base. There is no separate socket port to hardcode.
const SOCKET_URL = IMAGE_BASE_URL;

// The socket server only accepts connections that present a valid access token (the same JWT the
// REST API uses). Pick the token for the area the user is currently in, mirroring api.js.
const getSocketToken = () => {
    try {
        const path = window.location.pathname || '/';
        if (path.startsWith('/admin')) return localStorage.getItem('adminToken');
        if (path.startsWith('/vendor')) return localStorage.getItem('vendor-token');
        if (path.startsWith('/delivery')) return localStorage.getItem('delivery-token');
        return localStorage.getItem('token');
    } catch {
        return null;
    }
};

class SocketService {
    constructor() {
        this.socket = null;
        this.rooms = new Set();
        this._queuedListeners = [];
    }

    connect() {
        if (this.socket?.connected) return;

        // Not signed in: there is nothing a socket could be authorized for, so don't open one.
        // (Pages call connect() again after login, via the *Register helpers below.)
        if (!getSocketToken()) return;

        // Reuse the existing socket (its auth callback re-reads the current token on every attempt).
        if (this.socket) {
            this.socket.connect();
            return;
        }

        this.socket = io(SOCKET_URL, {
            // Evaluated on every (re)connection attempt, so a refreshed token is picked up.
            auth: (cb) => cb({ token: getSocketToken() }),
            withCredentials: true,
            autoConnect: true,
            reconnection: true,
            reconnectionAttempts: 20,
            reconnectionDelay: 1000,
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
                this.socket.connect();
            }
        });

        this.socket.on('connect_error', (error) => {
            console.error('🔌 [SOCKET] Connection error:', error.message);
            // The server rejects an expired/invalid token and socket.io does not retry on its own.
            // REST calls refresh the token in the background, so try again once it has changed.
            if (error.message === 'unauthorized') {
                const triedToken = getSocketToken();
                setTimeout(() => {
                    const current = getSocketToken();
                    if (current && current !== triedToken && this.socket && !this.socket.connected) {
                        this.socket.connect();
                    }
                }, 4000);
            }
        });

        // Token expired while connected: reconnect with whatever the app has refreshed it to.
        this.socket.on('auth_expired', () => {
            setTimeout(() => {
                if (getSocketToken() && this.socket && !this.socket.connected) this.socket.connect();
            }, 2000);
        });
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
