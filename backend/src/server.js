import "dotenv/config";
import app from "./app.js";
import connectDB from "./config/db.js";
import { validateEnv } from "./config/env.js";

import http from 'http';
import { initSocket } from './services/socket.service.js';
import { connectRedis } from './config/redis.js';
import { WalletService } from './services/wallet.service.js';
import { startRewardJobs } from './services/rewardJobs.service.js';

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    validateEnv();
    await connectDB();
    await connectRedis();

    // Wrap Express app with HTTP server
    const server = http.createServer(app);

    // Initialize Socket.io
    initSocket(server);

    // Re-attempt rider/vendor credits that failed at delivery time. Idempotent and
    // safe on every instance (see WalletService.processOrderCompletion).
    setInterval(() => {
      WalletService.retryFailedCompletions().catch((err) =>
        console.error('[Wallet] Retry sweep error:', err.message)
      );
    }, 5 * 60 * 1000).unref();

    // Refer & Earn rewards, unpaid wallet orders and wallet expiry (rewardJobs.service.js).
    startRewardJobs();

    server.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
      console.log(`🚀 Environment: ${process.env.NODE_ENV || "development"}`);
      console.log(`📡 Socket.io initialized.`);
    });
  } catch (error) {
    console.error("📦 Server startup failed:", error.message);
    process.exit(1);
  }
};

startServer();
 
