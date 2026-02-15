// ============================================
// AI Service — Gemini-powered intent & OCR
// ============================================

import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs';
import logger from '../utils/logger';

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
const visionModel = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

// -----------------------------------------------
// Intent Detection
// -----------------------------------------------

interface IntentResult {
    intent: string;
    skill: string | null;
}

/**
 * Detect intent and extract skill from a user message.
 * Uses Gemini to return structured JSON.
 */
async function detectIntent(text: string): Promise<IntentResult> {
    try {
        const prompt = `You are an intent classifier for a job matching WhatsApp bot for daily-wage labourers in India.

Given the following user message, extract the intent and any mentioned skill.

User message: "${text}"

Return ONLY a valid JSON object with these fields:
- "intent": one of "register", "job_search", "post_job", "accept_job", "greeting", "unknown"
- "skill": the skill mentioned (e.g., "painter", "electrician", "plumber", "carpenter", "mason"), or null if none

Rules:
- Messages like "hi", "hello", "namaste", "register" → intent: "greeting"
- Messages about finding work, job search → intent: "job_search"
- Messages about posting a job, hiring workers → intent: "post_job"  
- Messages like "yes", "haan", "ha", "accept" → intent: "accept_job"
- If unsure, return intent: "unknown"

Respond with ONLY the JSON, no markdown, no explanation.`;

        const result = await model.generateContent(prompt);
        const response = result.response.text().trim();

        // Parse JSON from response (strip markdown code fences if present)
        const jsonStr = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        const parsed = JSON.parse(jsonStr);

        logger.debug({ event: 'intent_detected', text: text.substring(0, 50), intent: parsed.intent, skill: parsed.skill });
        return {
            intent: parsed.intent || 'unknown',
            skill: parsed.skill || null,
        };
    } catch (error) {
        logger.serviceError('aiService.detectIntent', error as Error);
        return { intent: 'unknown', skill: null };
    }
}

// -----------------------------------------------
// ID Card OCR (Gemini Vision)
// -----------------------------------------------

interface IdCardResult {
    name: string | null;
    idNumber: string | null;
    rawText: string;
}

/**
 * Parse an ID card image using Gemini Vision.
 * Extracts name, ID number, and other fields.
 */
async function parseIdCard(imagePath: string): Promise<IdCardResult> {
    try {
        const imageBuffer = fs.readFileSync(imagePath);
        const base64Image = imageBuffer.toString('base64');

        // Determine MIME type
        const ext = imagePath.split('.').pop()?.toLowerCase() || 'jpg';
        const mimeMap: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
        const mimeType = mimeMap[ext] || 'image/jpeg';

        const prompt = `You are an OCR system for Indian government ID cards (Aadhaar, PAN, Voter ID, etc).

Analyze this ID card image and extract the following information:
- "name": Full name as written on the card
- "idNumber": The ID/Aadhaar/PAN number
- "rawText": All text visible on the card

Return ONLY a valid JSON object with these three fields.
If a field cannot be determined, set it to null.

Respond with ONLY the JSON, no markdown, no explanation.`;

        const imagePart = {
            inlineData: {
                data: base64Image,
                mimeType,
            },
        };

        const result = await visionModel.generateContent([prompt, imagePart]);
        const response = result.response.text().trim();
        const jsonStr = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        const parsed = JSON.parse(jsonStr);

        logger.info({ event: 'id_card_parsed', hasName: !!parsed.name, hasId: !!parsed.idNumber });
        return {
            name: parsed.name || null,
            idNumber: parsed.idNumber || null,
            rawText: parsed.rawText || '',
        };
    } catch (error) {
        logger.serviceError('aiService.parseIdCard', error as Error);
        return { name: null, idNumber: null, rawText: '' };
    }
}

export {
    detectIntent,
    parseIdCard,
};

export type { IntentResult, IdCardResult };
