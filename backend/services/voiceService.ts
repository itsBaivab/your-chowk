// ============================================
// Voice Service — Audio conversion & STT
// ============================================
// Converts WhatsApp voice messages (OGG/Opus) to WAV
// Then transcribes using Anthropic Claude API

import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs';
import path from 'path';
import Anthropic from '@anthropic-ai/sdk';
import logger from '../utils/logger';

const MEDIA_DIR = path.join(__dirname, '..', 'media_downloads');
const client = new Anthropic();

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
            .audioChannels(1)
            .audioFrequency(16000)
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
// Speech-to-Text (Anthropic Claude)
// -----------------------------------------------

/**
 * Transcribe a WAV audio file using Claude.
 * Claude supports audio input via base64 encoding.
 */
async function transcribeAudio(wavPath: string): Promise<string> {
    try {
        // Read audio file and convert to base64
        const audioBuffer = fs.readFileSync(wavPath);
        const base64Audio = audioBuffer.toString('base64');

        const message = await client.messages.create({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 500,
            messages: [
                {
                    role: 'user',
                    content: [
                        {
                            type: 'text',
                            text: `Transcribe the following audio. The audio may be in Hindi, Bengali, Kannada, or English.
Return ONLY the transcribed text, nothing else. No labels, no explanations.
If you cannot understand the audio, return "[inaudible]".`,
                        },
                        {
                            type: 'image', // Audio is passed as base64 inline data
                            source: {
                                type: 'base64',
                                media_type: 'audio/wav',
                                data: base64Audio,
                            },
                        } as any,
                    ],
                },
            ],
        });

        const text = message.content
            .filter((block): block is Anthropic.TextBlock => block.type === 'text')
            .map((block) => block.text)
            .join('')
            .trim();

        logger.info({ event: 'audio_transcribed', textLength: text.length, preview: text.substring(0, 50) });
        return text || '[inaudible]';
    } catch (error) {
        logger.serviceError('voiceService.transcribeAudio', error as Error);
        return '[Could not transcribe voice message]';
    }
}

// -----------------------------------------------
// Full Pipeline: Convert → Transcribe
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
