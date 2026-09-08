import { Server } from 'socket.io';
import DeliveryBoy from '../models/DeliveryBoy.model.js';
import { db } from '../config/firebase.js';

let io;
const locationCache = new Map(); // Store { deliveryBoyId: { coordinates: [lng, lat], updatedAt: timestamp } }
const DB_UPDATE_INTERVAL = 30000; // 30 seconds

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

    io.on('connection', (socket) => {
        console.log(`🔌 [SOCKET CONNECT] Client: ${socket.id}`);

        socket.on('join_room', (room) => {
            socket.join(room);
            console.log(`🏠 [ROOM JOIN] Client ${socket.id} joined: ${room}`);
        });

        socket.on('leave_room', (room) => {
            socket.leave(room);
            console.log(`🏠 [ROOM LEAVE] Client ${socket.id} left: ${room}`);
        });

        // Targeted registration based on ID and role (for targeted notifications)
        socket.on('delivery_register', (deliveryBoyId) => {
            const room = `delivery_${deliveryBoyId}`;
            socket.join(room);
            socket.join('delivery_partners'); // Global room for new broadcasts
            socket.deliveryBoyId = deliveryBoyId; // Track for disconnect
            console.log(`🚴 [DELIVERY REGISTER] Partner: ${deliveryBoyId}, Room: ${room}`);
        });

        socket.on('batch_register', (batchId) => {
            const room = `batch_${batchId}`;
            socket.join(room);
            console.log(`📦 [BATCH REGISTER] Batch: ${batchId}, Room: ${room}`);
        });

        socket.on('vendor_register', (vendorId) => {
            const room = `vendor_${vendorId}`;
            socket.join(room);
            console.log(`🏪 [VENDOR REGISTER] Vendor: ${vendorId}, Room: ${room}`);
        });

        socket.on('user_register', (userId) => {
            const room = `user_${userId}`;
            socket.join(room);
            console.log(`👤 [USER REGISTER] User: ${userId}, Room: ${room}`);
        });

        // --- Delivery Tracking System ---

        // Join specific order room (for customers tracking an order)
        socket.on('join_order_room', (orderId) => {
            const room = `order_${orderId}`;
            socket.join(room);
            console.log(`📦 [ORDER ROOM JOIN] Client ${socket.id} joined tracking: ${room}`);
        });

        // Delivery boy updates their location
        socket.on('update_location', async (payload) => {
            const { lat, lng, deliveryBoyId, orderId, batchId } = payload;
            
            if (!lat || !lng || !deliveryBoyId) return;

            console.log(`📍 [LOCATION UPDATE] ID: ${deliveryBoyId}, Pos: (${lat}, ${lng}), Order: ${orderId || 'N/A'}`);

            // 1. Update In-Memory Cache for performance (Mongo Persistence)
            locationCache.set(deliveryBoyId, {
                coordinates: [lng, lat], // GeoJSON order
                updatedAt: Date.now()
            });

            // 2. Sync to Firebase Realtime Database for high-frequency tracking
            if (db) {
                try {
                    const trackingData = {
                        lat,
                        lng,
                        deliveryBoyId,
                        timestamp: Date.now(),
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
                const room = `order_${orderId}`;
                io.to(room).emit('location_updated', {
                    lat,
                    lng,
                    deliveryBoyId,
                    orderId,
                    timestamp: Date.now()
                });
            }

            if (batchId) {
                const room = `batch_${batchId}`;
                io.to(room).emit('location_updated', {
                    lat,
                    lng,
                    deliveryBoyId,
                    batchId,
                    timestamp: Date.now()
                });
            }

            io.to('admin_tracking').emit('delivery_boy_moved', {
                lat, lng, deliveryBoyId
            });
        });


        socket.on('disconnect', async () => {
            console.log(`🔌 [SOCKET DISCONNECT] Client: ${socket.id}`);
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
 * Uses the delivery_<id> room as the source of truth
 * @param {string} deliveryBoyId 
 * @returns {boolean}
 */
export const isDeliveryBoyConnected = (deliveryBoyId) => {
    if (!io) return false;
    const room = io.sockets.adapter.rooms.get(`delivery_${deliveryBoyId}`);
    return room && room.size > 0;
};
