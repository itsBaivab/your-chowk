// ============================================
// Media Handler — Download, save, upload media
// ============================================
// Updated to match Baileys v6 API (downloadMediaMessage with reuploadRequest)

import { downloadMediaMessage } from '@whiskeysockets/baileys';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import mime from 'mime-types';
import logger from './logger';

import type makeWASocket from '@whiskeysockets/baileys';
type WASocket = ReturnType<typeof makeWASocket>;

const MEDIA_DIR = path.join(__dirname, '..', 'media_downloads');

// Ensure media directory exists
if (!fs.existsSync(MEDIA_DIR)) {
    fs.mkdirSync(MEDIA_DIR, { recursive: true });
}

/**
 * Download media from a Baileys message.
 * Uses the Baileys downloadMediaMessage API with reuploadRequest support.
 */
async function downloadMedia(message: any, sock: WASocket): Promise<Buffer> {
    try {
        const buffer = await downloadMediaMessage(
            message,
            'buffer',
            {},
            {
                logger: logger as any,
                reuploadRequest: sock.updateMediaMessage,
            }
        );
        logger.debug({ event: 'media_downloaded', size: (buffer as Buffer).length });
        return buffer as Buffer;
    } catch (error) {
        logger.serviceError('mediaHandler.downloadMedia', error as Error);
        throw new Error('Failed to download media from WhatsApp');
    }
}

/**
 * Save a buffer to a file in the media_downloads directory
 */
function saveMediaToFile(buffer: Buffer, ext: string): string {
    const filename = `${Date.now()}_${crypto.randomBytes(4).toString('hex')}.${ext}`;
    const filepath = path.join(MEDIA_DIR, filename);
    fs.writeFileSync(filepath, buffer);
    logger.debug({ event: 'media_saved', filepath, size: buffer.length });
    return filepath;
}

/**
 * Upload file to storage (mock for hackathon — returns local path)
 * In production, this would upload to S3/Cloudinary/Supabase Storage
 */
async function uploadToStorage(filePath: string): Promise<string> {
    logger.debug({ event: 'media_uploaded_mock', filePath });
    return filePath;
}

/**
 * Get the file extension from a MIME type
 */
function getExtensionFromMime(mimetype?: string): string {
    if (mimetype?.includes('ogg')) return 'ogg';
    if (mimetype?.includes('webp')) return 'webp';
    return (mimetype ? mime.extension(mimetype) || 'bin' : 'bin') as string;
}

export {
    downloadMedia,
    saveMediaToFile,
    uploadToStorage,
    getExtensionFromMime,
    MEDIA_DIR,
};
