// ============================================
// Voice Service — Audio conversion & STT
// ============================================
// Converts WhatsApp voice messages (OGG/Opus) to WAV
// Then transcribes using Gemini API

import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs';
import path from 'path';
import { GoogleGenerativeAI } from '@google/generative-ai';
import logger from '../utils/logger';

const MEDIA_DIR = path.join(__dirname, '..', 'media_downloads');

// -----------------------------------------------
// Audio Conversion (OGG/Opus → WAV)
// -----------------------------------------------

/**
 * Convert an audio file to WAV format using FFmpeg.
 * WhatsApp sends voice messages as OGG Opus.
 */
function convertAudio(inputPath: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const outputPath = inputPath.replace(/\.[^.]+$/, '.wav');

        ffmpeg(inputPath)
            .toFormat('wav')
            .audioChannels(1)        // Mono
            .audioFrequency(16000)   // 16kHz for speech recognition
            .on('end', () => {
                logger.debug({ event: 'audio_converted', input: inputPath, output: outputPath });
                resolve(outputPath);
            })
            .on('error', (err: Error) => {
                logger.serviceError('voiceService.convertAudio', err);
                reject(new Error(`Audio conversion failed: ${err.message}`));
            })
            .save(outputPath);
    });
}

// -----------------------------------------------
// Speech-to-Text (Gemini API)
// -----------------------------------------------

/**
 * Transcribe a WAV audio file using Gemini API.
 * Gemini supports audio input natively for transcription.
 */
async function transcribeAudio(wavPath: string): Promise<string> {
    try {
        const apiKey = process.env.GEMINI_API_KEY;

        if (!apiKey) {
            logger.warn({ event: 'gemini_no_api_key' });
            return '[Voice message received — Gemini API key not configured]';
        }

        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

        // Read audio file and convert to base64
        const audioBuffer = fs.readFileSync(wavPath);
        const base64Audio = audioBuffer.toString('base64');

        const prompt = `Transcribe the following audio. The audio may be in Hindi, Bengali, or English.
Return ONLY the transcribed text, nothing else. No labels, no explanations.
If you cannot understand the audio, return "[inaudible]".`;

        const audioPart = {
            inlineData: {
                data: base64Audio,
                mimeType: 'audio/wav',
            },
        };

        const result = await model.generateContent([prompt, audioPart]);
        const text = result.response.text().trim();

        logger.info({ event: 'audio_transcribed', textLength: text.length, preview: text.substring(0, 50) });
        return text;
    } catch (error) {
        logger.serviceError('voiceService.transcribeAudio', error as Error);
        return '[Could not transcribe voice message]';
    }
}

// -----------------------------------------------
// Full Pipeline: Download → Convert → Transcribe
// -----------------------------------------------

/**
 * Process a voice message end-to-end.
 */
async function processVoiceMessage(audioPath: string): Promise<string> {
    const wavPath = await convertAudio(audioPath);
    const text = await transcribeAudio(wavPath);

    // Cleanup WAV file after transcription
    try {
        fs.unlinkSync(wavPath);
    } catch (_) {
        // Ignore cleanup errors
    }

    return text;
}

export {
    convertAudio,
    transcribeAudio,
    processVoiceMessage,
};
