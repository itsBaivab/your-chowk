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

/**
 * Main message handler — processes all incoming WhatsApp messages.
 * All messages are routed through Claude AI via claudeService.
 */
async function handleMessage(sock: WASocket, message: any): Promise<void> {
    const jid: string = message.key.remoteJid;
    const cleanPhone = jid.replace('@s.whatsapp.net', '');

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
