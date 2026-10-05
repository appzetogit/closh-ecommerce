import { Server } from 'socket.io';
import mongoose from 'mongoose';
import DeliveryBoy from '../models/DeliveryBoy.model.js';
import User from '../models/User.model.js';
import Vendor from '../models/Vendor.model.js';
import Admin from '../models/Admin.model.js';
import Order from '../models/Order.model.js';
import ReturnRequest from '../models/ReturnRequest.model.js';
import DeliveryBatch from '../models/DeliveryBatch.model.js';
import SupportTicket from '../models/SupportTicket.model.js';
import { verifyAccessToken } from '../config/jwt.js';
import { db } from '../config/firebase.js';

let io;
const locationCache = new Map(); // Store { deliveryBoyId: { coordinates: [lng, lat], updatedAt: timestamp } }
const DB_UPDATE_INTERVAL = 30000; // 30 seconds
const MIN_LOCATION_INTERVAL_MS = 500; // per-socket flood guard for update_location

// ─── Authentication & room authorization ─────────────────────────────────────
//
// Until now the socket server trusted every client: anyone could connect, join any room by
// name (`admin`, `user_<id>`, `order_<id>`, ...) and receive its events (customer OTPs, order
// and payout data), register as any rider, and push fake GPS positions for any rider.
//
// Now:
//   1. The connection must present a valid access token (the same JWT the REST API uses) in
//      `auth.token`, and the account behind it must still be active.
//   2. Identity comes from the token only. The id a client passes to *_register is ignored.
//   3. A room is joined only if this identity is entitled to it (see authorizeRoom).
//   4. update_location only accepts the rider's own position, for an order/batch they hold.

const isAdminRole = (role) => !['customer', 'vendor', 'delivery'].includes(role);

const ADMIN_ROOMS = new Set(['admin', 'admin_products', 'admin_support', 'admin_tracking', 'admin_delivery']);

const objectIdOrNull = (value) => (mongoose.isValidObjectId(value) ? value : null);

const accountIsActive = async ({ id, role }) => {
    if (role === 'customer') {
        const user = await User.findById(id).select('isActive isDeleted').lean();
        return !!user && user.isActive !== false && !user.isDeleted;
    }
    if (role === 'vendor') {
        const vendor = await Vendor.findById(id).select('status').lean();
        return !!vendor && vendor.status === 'approved';
    }
    if (role === 'delivery') {
        const rider = await DeliveryBoy.findById(id).select('applicationStatus isActive').lean();
        return !!rider && rider.applicationStatus === 'approved' && rider.isActive !== false;
    }
    const admin = await Admin.findById(id).select('isActive').lean();
    return !!admin && admin.isActive !== false;
};

// Does this identity have a legitimate relationship with the order / return / ticket / batch?
const canAccessOrder = async (user, key) => {
    if (isAdminRole(user.role)) return true;
    const order = await Order.findOne({ $or: [{ orderId: key }, ...(objectIdOrNull(key) ? [{ _id: key }] : [])] })
        .select('userId deliveryBoyId vendorItems.vendorId').lean();
    if (!order) return false;
    if (user.role === 'customer') return String(order.userId) === user.id;
    if (user.role === 'delivery') return String(order.deliveryBoyId) === user.id;
    if (user.role === 'vendor') return (order.vendorItems || []).some((v) => String(v.vendorId) === user.id);
    return false;
};

const canAccessReturn = async (user, key) => {
    if (isAdminRole(user.role)) return true;
    if (!objectIdOrNull(key)) return false;
    const ret = await ReturnRequest.findById(key)
        .select('userId vendorId vendorDropoffs.vendorId deliveryBoyId originalDeliveryBoyId').lean();
    if (!ret) return false;
    if (user.role === 'customer') return String(ret.userId) === user.id;
    if (user.role === 'delivery') return [ret.deliveryBoyId, ret.originalDeliveryBoyId].some((r) => r && String(r) === user.id);
    if (user.role === 'vendor') {
        return String(ret.vendorId) === user.id || (ret.vendorDropoffs || []).some((d) => String(d.vendorId) === user.id);
    }
    return false;
};

const canAccessTicket = async (user, key) => {
    if (isAdminRole(user.role)) return true;
    if (!objectIdOrNull(key)) return false;
    const ticket = await SupportTicket.findById(key).select('userId vendorId').lean();
    if (!ticket) return false;
    if (user.role === 'customer') return String(ticket.userId) === user.id;
    if (user.role === 'vendor') return String(ticket.vendorId) === user.id;
    return false;
};

const canAccessBatch = async (user, key) => {
    if (isAdminRole(user.role)) return true;
    const batch = await DeliveryBatch.findOne({ $or: [{ batchId: key }, ...(objectIdOrNull(key) ? [{ _id: key }] : [])] })
        .select('deliveryBoyId customerId').lean();
    if (!batch) return false;
    if (user.role === 'delivery') return String(batch.deliveryBoyId) === user.id;
    if (user.role === 'customer') return String(batch.customerId) === user.id;
    return false;
};

/**
 * May `user` ({ id, role }) join `room`? Unknown room names are denied, so any new room an
 * emitter starts using must be added here on purpose.
 */
export const authorizeRoom = async (user, room) => {
    if (!user || typeof room !== 'string' || room.length > 120) return false;
    const { id, role } = user;

    if (ADMIN_ROOMS.has(room)) return isAdminRole(role);
    if (room === 'delivery_partners') return role === 'delivery';

    const match = room.match(/^(admin|user|vendor|delivery|order|return|ticket|batch)_(.+)$/);
    if (!match) return false;
    const [, kind, key] = match;

    switch (kind) {
        case 'admin': return isAdminRole(role) && key === id;
        case 'user': return role === 'customer' && key === id;
        case 'vendor': return role === 'vendor' && key === id;
        case 'delivery': return role === 'delivery' && key === id;
        case 'order': return canAccessOrder(user, key);
        case 'return': return canAccessReturn(user, key);
        case 'ticket': return canAccessTicket(user, key);
        case 'batch': return canAccessBatch(user, key);
        default: return false;
    }
};

// Join `room` if authorized; remembers the decision for the life of the socket.
const joinIfAllowed = async (socket, room) => {
    const user = socket.data.user;
    if (socket.data.allowedRooms.has(room)) { socket.join(room); return true; }
    let allowed = false;
    try { allowed = await authorizeRoom(user, room); } catch (err) {
        console.error('[SOCKET] room authorization failed:', err.message);
    }
    if (!allowed) {
        socket.emit('room_denied', { room });
        return false;
    }
    socket.data.allowedRooms.add(room);
    socket.join(room);
    return true;
};

// Access tokens expire (24h by default) but a socket can outlive that. Check on every event.
const tokenStillValid = (socket) => {
    const exp = socket.data.exp;
    if (exp && Date.now() / 1000 >= exp) {
        socket.emit('auth_expired');
        socket.disconnect(true);
        return false;
    }
    return true;
};

// Wrap an event handler: needs an authenticated, unexpired socket; never throws into socket.io.
const guarded = (socket, handler) => async (...args) => {
    if (!socket.data.user || !tokenStillValid(socket)) return;
    try { await handler(...args); } catch (err) {
        console.error('[SOCKET] handler error:', err.message);
    }
};

const validCoordinate = (lat, lng) =>
    Number.isFinite(lat) && Number.isFinite(lng) &&
    Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0);

export const initSocket = (server) => {
    io = new Server(server, {
        cors: {
            origin: [
                process.env.CLIENT_URL,
                'https://www.closh.in',
                'https://closh.in',
                'http://localhost:3000',
                'http://localhost:5173',
                /\.vercel\.app$/ // Allow all Vercel deployments
            ].filter(Boolean),
            methods: ['GET', 'POST'],
            credentials: true,
        },
    });

    // 1. Authenticate every connection with the REST access token.
    io.use(async (socket, next) => {
        try {
            const header = socket.handshake.headers?.authorization || '';
            const token = socket.handshake.auth?.token || (header.startsWith('Bearer ') ? header.slice(7) : '');
            if (!token) return next(new Error('unauthorized'));

            const payload = verifyAccessToken(token);
            const user = { id: String(payload.id), role: String(payload.role || '').toLowerCase() };
            if (!user.id || !user.role) return next(new Error('unauthorized'));
            if (!(await accountIsActive(user))) return next(new Error('unauthorized'));

            socket.data.user = user;
            socket.data.exp = payload.exp;
            socket.data.allowedRooms = new Set();
            return next();
        } catch {
            return next(new Error('unauthorized'));
        }
    });

    io.on('connection', async (socket) => {
        const { id, role } = socket.data.user;
        console.log(`🔌 [SOCKET CONNECT] ${role}:${id} (${socket.id})`);

        // Every identity is put in its own room automatically; nothing the client says can change it.
        const ownRoom = { customer: `user_${id}`, vendor: `vendor_${id}`, delivery: `delivery_${id}` }[role];
        if (ownRoom) await joinIfAllowed(socket, ownRoom);
        if (role === 'delivery') {
            await joinIfAllowed(socket, 'delivery_partners');
            socket.deliveryBoyId = id; // Track for disconnect
        }

        // The client refreshed its access token: extend this socket's lifetime instead of dropping
        // it at expiry. Only a valid token for the SAME identity is accepted. Deliberately not
        // `guarded`, so it also works right after the old token expired.
        socket.on('reauth', (token) => {
            try {
                const payload = verifyAccessToken(String(token || ''));
                if (String(payload.id) === id && String(payload.role || '').toLowerCase() === role) {
                    socket.data.exp = payload.exp;
                }
            } catch { /* invalid/expired token: ignore; the old expiry still applies */ }
        });

        socket.on('join_room', guarded(socket, async (room) => { await joinIfAllowed(socket, room); }));

        socket.on('leave_room', (room) => {
            if (typeof room === 'string') socket.leave(room);
        });

        // Kept for older clients that still emit these. The id they send is ignored: identity
        // comes from the token, so a client can only ever register as itself.
        socket.on('delivery_register', guarded(socket, async () => {
            if (role === 'delivery') {
                await joinIfAllowed(socket, `delivery_${id}`);
                await joinIfAllowed(socket, 'delivery_partners');
            }
        }));
        socket.on('vendor_register', guarded(socket, async () => {
            if (role === 'vendor') await joinIfAllowed(socket, `vendor_${id}`);
        }));
        socket.on('user_register', guarded(socket, async () => {
            if (role === 'customer') await joinIfAllowed(socket, `user_${id}`);
        }));

        socket.on('batch_register', guarded(socket, async (batchId) => {
            await joinIfAllowed(socket, `batch_${batchId}`);
        }));

        // --- Delivery Tracking System ---

        // Join specific order room (customers, the assigned rider, the vendor, admins)
        socket.on('join_order_room', guarded(socket, async (orderId) => {
            await joinIfAllowed(socket, `order_${orderId}`);
        }));

        // Delivery boy updates their own location
        socket.on('update_location', guarded(socket, async (payload = {}) => {
            if (role !== 'delivery') return;

            const now = Date.now();
            if (socket.data.lastLocationAt && now - socket.data.lastLocationAt < MIN_LOCATION_INTERVAL_MS) return;
            socket.data.lastLocationAt = now;

            const lat = Number(payload.lat);
            const lng = Number(payload.lng);
            if (!validCoordinate(lat, lng)) return;

            // The rider is whoever the token says, never what the payload claims.
            const deliveryBoyId = id;
            let { orderId, batchId } = payload;

            // The order/batch rooms only get this rider's position if this rider actually holds it.
            if (orderId && !(await joinIfAllowed(socket, `order_${orderId}`))) orderId = undefined;
            if (batchId && !(await joinIfAllowed(socket, `batch_${batchId}`))) batchId = undefined;

            // 1. Update In-Memory Cache for performance (Mongo Persistence)
            locationCache.set(deliveryBoyId, {
                coordinates: [lng, lat], // GeoJSON order
                updatedAt: now
            });

            // 2. Sync to Firebase Realtime Database for high-frequency tracking
            if (db) {
                try {
                    const trackingData = {
                        lat,
                        lng,
                        deliveryBoyId,
                        timestamp: now,
                        status: 'tracking'
                    };

                    // Update broad tracking for the rider
                    await db.ref(`delivery_boys/${deliveryBoyId}`).set(trackingData);

                    // Update specific tracking for the order
                    if (orderId) {
                        await db.ref(`tracking/${orderId}`).set(trackingData);
                    }
                    // Update specific tracking for the batch
                    if (batchId) {
                        await db.ref(`tracking/batch/${batchId}`).set(trackingData);
                    }
                } catch (fbError) {
                    console.error('❌ Firebase RTDB sync failed:', fbError.message);
                }
            }

            // 3. Broadcast to Socket.io rooms (fallback or web support)
            if (orderId) {
                io.to(`order_${orderId}`).emit('location_updated', {
                    lat,
                    lng,
                    deliveryBoyId,
                    orderId,
                    timestamp: now
                });
            }

            if (batchId) {
                io.to(`batch_${batchId}`).emit('location_updated', {
                    lat,
                    lng,
                    deliveryBoyId,
                    batchId,
                    timestamp: now
                });
            }

            io.to('admin_tracking').emit('delivery_boy_moved', {
                lat, lng, deliveryBoyId
            });
        }));

        socket.on('disconnect', async () => {
            console.log(`🔌 [SOCKET DISCONNECT] ${role}:${id} (${socket.id})`);
            // Note: We no longer auto-mark riders as offline on disconnect.
            // Mobile network blips and page refreshes cause disconnects.
            // Riders must explicitly go offline via the toggle UI.
        });
    });

    // --- Periodic DB Persistence ---
    setInterval(async () => {
        if (locationCache.size === 0) return;

        const entries = Array.from(locationCache.entries());
        locationCache.clear(); // Clear for next interval

        console.log(`💾 Persisting ${entries.length} delivery boy locations to DB...`);

        const bulkOps = entries.map(([id, data]) => ({
            updateOne: {
                filter: { _id: id },
                update: {
                    $set: {
                        'currentLocation.coordinates': data.coordinates,
                        'currentLocation.type': 'Point'
                    }
                }
            }
        }));

        try {
            await DeliveryBoy.bulkWrite(bulkOps);
        } catch (err) {
            console.error('❌ Failed to persist locations to DB:', err);
        }
    }, DB_UPDATE_INTERVAL);

    return io;
};

export const getIO = () => {
    if (!io) {
        throw new Error('Socket.io not initialized!');
    }
    return io;
};

/**
 * Emit events to specific rooms
 * @param {string} room - room name (e.g. user_123, vendor_456, delivery_partners)
 * @param {string} event - event name
 * @param {object} data - payload
 */
export const emitEvent = (room, event, data) => {
    if (io) {
        io.to(room).emit(event, data);
    }
};

/**
 * Check if a delivery boy is currently connected to the socket server
 * Uses the delivery_<id> room as the source of truth. Since only the authenticated rider can
 * join their own delivery_<id> room, this can no longer be faked by another client.
 * @param {string} deliveryBoyId
 * @returns {boolean}
 */
export const isDeliveryBoyConnected = (deliveryBoyId) => {
    if (!io) return false;
    const room = io.sockets.adapter.rooms.get(`delivery_${deliveryBoyId}`);
    return room && room.size > 0;
};
