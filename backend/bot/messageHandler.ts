// ============================================
// Message Handler — Central Message Router
// ============================================
// Receives raw Baileys messages, extracts text,
// and routes everything through Claude AI.

import { getContentType } from '@whiskeysockets/baileys';
import { sendMessage, WASocket } from './baileysClient';
import { processMessage } from '../services/claudeService';
import { processVoiceMessage } from '../services/voiceService';
import { downloadMedia, saveMediaToFile } from '../utils/mediaHandler';
import logger from '../utils/logger';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ============================================
// JID → Phone Number utility
// ============================================
// WhatsApp sends JIDs in two formats:
//   - Classic: 91XXXXXXXXXX@s.whatsapp.net
//   - LID:     XXXXXXXXXX@lid (newer linked device IDs)
// We need to handle both and store the actual JID for sending replies/notifications.

// In-memory map: phoneNumber → actual JID (for notifications)
const jidMap = new Map<string, string>();

function cleanPhoneFromJid(jid: string): string {
    // Remove @s.whatsapp.net or @lid suffix
    let phone = jid.replace(/@s\.whatsapp\.net$/i, '').replace(/@lid$/i, '');

    // If it doesn't start with country code, prepend 91 (India)
    if (phone.length === 10 && /^\d{10}$/.test(phone)) {
        phone = '91' + phone;
    }

    return phone;
}

/**
 * Get the actual JID for a phone number (for sending notifications).
 * First checks our in-memory map, then falls back to standard format.
 */
export function getJidForPhone(phoneNumber: string): string {
    // Check if we have a stored JID for this phone
    const stored = jidMap.get(phoneNumber);
    if (stored) return stored;

    // Fallback: try standard @s.whatsapp.net format
    return `${phoneNumber}@s.whatsapp.net`;
}

/**
 * Main message handler — processes all incoming WhatsApp messages.
 * All messages are routed through Claude AI via claudeService.
 */
async function handleMessage(sock: WASocket, message: any): Promise<void> {
    const jid: string = message.key.remoteJid;
    const cleanPhone = cleanPhoneFromJid(jid);

    // Store the JID mapping so we can send notifications later
    jidMap.set(cleanPhone, jid);

    try {
        // ----- Determine message type -----
        const messageType = getContentType(message.message);
        let text = '';

        // Extract text from different message types
        if (messageType === 'conversation') {
            text = message.message.conversation || '';
        } else if (messageType === 'extendedTextMessage') {
            text = message.message.extendedTextMessage?.text || '';
        } else if (messageType === 'audioMessage') {
            // Handle voice messages — transcribe first
            try {
                await sendMessage(jid, '🎤 Processing your voice message...');
                const buffer = await downloadMedia(message, sock);
                const filePath = saveMediaToFile(buffer, 'ogg');
                text = await processVoiceMessage(filePath);
                logger.debug({ event: 'voice_transcribed', text: text.substring(0, 50) });
            } catch (error) {
                logger.serviceError('messageHandler.voiceProcessing', error as Error);
                await sendMessage(jid, '❌ Sorry, I could not process your voice message. Please try sending a text message instead.');
                return;
            }
        } else if (messageType === 'imageMessage') {
            // For images, tell Claude an image was received
            text = '[User sent an image. Ask them what they want to do with it, or if they are trying to register, guide them through the process.]';
        } else {
            logger.debug({ event: 'unsupported_message_type', messageType, jid });
            return;
        }

        // ----- Skip empty text -----
        if (!text || text.trim().length === 0) return;

        logger.incomingMessage(cleanPhone, messageType || 'unknown', text);

        // ----- Route through Claude AI -----
        const reply = await processMessage(cleanPhone, text);
        await sendMessage(jid, reply);

    } catch (error) {
        logger.serviceError('messageHandler.handleMessage', error as Error);
        try {
            await sendMessage(jid, '❌ Sorry, something went wrong. Please try again.');
        } catch (_) {
            // Ignore send errors during error handling
        }
    }
}

export { handleMessage };
