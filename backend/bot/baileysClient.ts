// ============================================
// Baileys Client — WhatsApp Web Connection
// ============================================
// Based on official Baileys v6 example.ts
// https://github.com/WhiskeySockets/Baileys/blob/master/Example/example.ts

import makeWASocket, {
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import qrcode from 'qrcode-terminal';
import path from 'path';
import logger from '../utils/logger';

export type WASocket = ReturnType<typeof makeWASocket>;
export type MessageHandler = (sock: WASocket, message: any) => Promise<void>;

// Auth state directory
const AUTH_DIR = path.join(__dirname, '..', 'auth_info');

// Baileys internal logger (silenced)
const baileysLogger = pino({ level: 'silent' });

// Singleton socket reference
let sock: WASocket | null = null;

/**
 * Initialize and connect the Baileys WhatsApp socket.
 * Follows the official Baileys example pattern using sock.ev.process().
 */
async function connectToWhatsApp(onMessage: MessageHandler): Promise<WASocket> {
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

    // Fetch latest WA Web version
    const { version, isLatest } = await fetchLatestBaileysVersion();
    logger.info({ event: 'wa_version', version: version.join('.'), isLatest });

    // Create socket — following official example.ts pattern
    sock = makeWASocket({
        version,
        logger: baileysLogger,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, baileysLogger),
        },
        generateHighQualityLinkPreview: false,
    });

    // ----- Batch event processing (official pattern) -----
    sock.ev.process(async (events) => {
        // --- Connection update ---
        if (events['connection.update']) {
            const update = events['connection.update'];
            const { connection, lastDisconnect, qr } = update;

            // Display QR code in terminal
            if (qr) {
                console.log('\n📱 Scan this QR code with WhatsApp:\n');
                qrcode.generate(qr, { small: true });
                console.log('');
                logger.info({ event: 'qr_generated', message: 'QR code displayed in terminal' });
            }

            if (connection === 'close') {
                const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
                const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

                logger.warn({
                    event: 'connection_closed',
                    statusCode,
                    shouldReconnect,
                    error: lastDisconnect?.error?.message,
                });

                if (shouldReconnect) {
                    logger.info({ event: 'reconnecting', delay: '3s' });
                    setTimeout(() => connectToWhatsApp(onMessage), 3000);
                } else {
                    logger.error({
                        event: 'logged_out',
                        message: 'Session logged out. Delete auth_info/ folder and re-scan QR.',
                    });
                }
            }

            if (connection === 'open') {
                logger.info({ event: 'connected', message: '✅ WhatsApp connection established!' });
                console.log('\n✅ WhatsApp connected successfully!\n');
            }
        }

        // --- Save credentials on update ---
        if (events['creds.update']) {
            await saveCreds();
        }

        // --- Incoming messages ---
        if (events['messages.upsert']) {
            const upsert = events['messages.upsert'];

            // Only process new notification messages (not history sync)
            if (upsert.type !== 'notify') return;

            for (const message of upsert.messages) {
                // Skip messages sent by us
                if (message.key.fromMe) continue;

                // Skip status broadcasts
                if (message.key.remoteJid === 'status@broadcast') continue;

                // Skip if no message content
                if (!message.message) continue;

                try {
                    await onMessage(sock!, message);
                } catch (error) {
                    logger.serviceError('baileysClient.onMessage', error as Error);
                }
            }
        }
    });

    return sock;
}

/**
 * Send a text message to a WhatsApp JID.
 */
async function sendMessage(jid: string, text: string): Promise<void> {
    if (!sock) {
        logger.error({ event: 'send_failed', reason: 'Socket not connected' });
        return;
    }

    try {
        await sock.sendMessage(jid, { text });
        logger.debug({ event: 'message_sent', jid, textPreview: text.substring(0, 50) });
    } catch (error) {
        logger.serviceError('baileysClient.sendMessage', error as Error);
    }
}

/**
 * Get the current socket instance.
 */
function getSocket(): WASocket | null {
    return sock;
}

export {
    connectToWhatsApp,
    sendMessage,
    getSocket,
};
