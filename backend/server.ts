// ============================================
// Server — Express + Baileys Entry Point
// ============================================

import 'dotenv/config';

import express from 'express';
import cors from 'cors';
import logger from './utils/logger';
import { connectToWhatsApp, sendMessage } from './bot/baileysClient';
import { handleMessage } from './bot/messageHandler';
import * as broadcastQueue from './services/broadcastQueue';
import webhookRoutes from './routes/webhookRoutes';

const app = express();
const PORT = process.env.PORT || 3000;

// ----- Middleware -----
app.use(cors()); // Allow admin dashboard cross-origin requests
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ----- Routes -----
app.use('/', webhookRoutes);

// ----- Start Server -----
async function startServer(): Promise<void> {
    // Start Express
    app.listen(PORT, () => {
        logger.info({ event: 'server_started', port: PORT });
        console.log(`\n🏗️  Your Chawk Backend running on http://localhost:${PORT}`);
        console.log(`   Health check:  http://localhost:${PORT}/health`);
        console.log(`   Workers API:   http://localhost:${PORT}/api/workers`);
        console.log(`   Jobs API:      http://localhost:${PORT}/api/jobs`);
        console.log(`   Dashboard API: http://localhost:${PORT}/api/dashboard/stats\n`);
    });

    // Initialize broadcast queue with sendMessage function
    broadcastQueue.init(sendMessage);

    // Connect to WhatsApp
    try {
        console.log('📱 Connecting to WhatsApp...');
        console.log('   Scan the QR code below with WhatsApp to log in.\n');
        await connectToWhatsApp(handleMessage);
    } catch (error) {
        logger.serviceError('server.whatsappConnect', error as Error);
        console.error('❌ Failed to connect to WhatsApp:', (error as Error).message);
        console.log('   The REST API is still running. WhatsApp will retry automatically.\n');
    }
}

// ----- Graceful Shutdown -----
process.on('SIGINT', async () => {
    logger.info({ event: 'shutting_down' });
    console.log('\n👋 Shutting down Your Chawk...');
    process.exit(0);
});

process.on('unhandledRejection', (reason: any, _promise: Promise<any>) => {
    logger.error({ event: 'unhandled_rejection', reason: reason?.message || reason });
});

process.on('uncaughtException', (error: Error) => {
    logger.error({ event: 'uncaught_exception', message: error.message, stack: error.stack });
});

// ----- Run -----
startServer();
