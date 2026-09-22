import { io } from 'socket.io-client';
import toast from 'react-hot-toast';

import { IMAGE_BASE_URL } from './constants.js';

// Socket.io is attached to the same HTTP server as the REST API (see
// backend/src/server.js — initSocket() takes the same http.createServer()
// instance Express uses), so it is always the same origin as the API/image
// base. There is no separate socket port to hardcode.
const SOCKET_URL = IMAGE_BASE_URL;


class SocketService {
    constructor() {
        this.socket = null;
        this.rooms = new Set();
        this._queuedListeners = [];
    }

    connect() {
        if (this.socket?.connected) return;

        this.socket = io(SOCKET_URL, {
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
        });
    }

    deliveryRegister(deliveryBoyId) {
        if (!deliveryBoyId) return;
        localStorage.setItem('delivery_boy_id', deliveryBoyId);
        console.log(`🚴 [SOCKET] Registering: ${deliveryBoyId}`);
        if (this.socket?.connected) {
            this.socket.emit('delivery_register', deliveryBoyId);
        }
    }

    userRegister(userId) {
        if (!userId) return;
        localStorage.setItem('user_id_socket', userId);
        console.log(`👤 [SOCKET] Registering User: ${userId}`);
        if (this.socket?.connected) {
            this.socket.emit('user_register', userId);
        }
    }

    vendorRegister(vendorId) {
        if (!vendorId) return;
        localStorage.setItem('vendor_id', vendorId);
        console.log(`🏪 [SOCKET] Registering Vendor: ${vendorId}`);
        if (this.socket?.connected) {
            this.socket.emit('vendor_register', vendorId);
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
