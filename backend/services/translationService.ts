// ============================================
// Translation Service — Gemini-powered i18n
// ============================================
// Supports: Hindi (hi), Bengali (bn), English (en)

import { GoogleGenerativeAI } from '@google/generative-ai';
import logger from '../utils/logger';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

const SUPPORTED_LANGUAGES: string[] = ['hi', 'bn', 'en'];

const LANGUAGE_NAMES: Record<string, string> = {
    hi: 'Hindi',
    bn: 'Bengali',
    en: 'English',
};

// -----------------------------------------------
// Language Detection
// -----------------------------------------------

/**
 * Detect the language of a given text.
 */
async function detectLanguage(text: string): Promise<string> {
    try {
        const prompt = `Detect the language of the following text. 
Return ONLY the language code: "hi" for Hindi, "bn" for Bengali, "en" for English.
If the text is in a mix of languages or you are unsure, return the dominant language.
If it's Romanized Hindi (Hindi written in English letters like "mujhe kaam chahiye"), return "hi".
If it's Romanized Bengali, return "bn".

Text: "${text}"

Return ONLY the two-letter code, nothing else.`;

        const result = await model.generateContent(prompt);
        const lang = result.response.text().trim().toLowerCase().replace(/"/g, '');

        // Validate response
        if (SUPPORTED_LANGUAGES.includes(lang)) {
            logger.debug({ event: 'language_detected', text: text.substring(0, 30), language: lang });
            return lang;
        }

        logger.debug({ event: 'language_fallback', detectedRaw: lang, fallback: 'en' });
        return 'en';
    } catch (error) {
        logger.serviceError('translationService.detectLanguage', error as Error);
        return 'en'; // Default to English on error
    }
}

// -----------------------------------------------
// Translation
// -----------------------------------------------

/**
 * Translate text to English.
 */
async function translateToEnglish(text: string, sourceLang: string): Promise<string> {
    if (sourceLang === 'en') return text;

    try {
        const langName = LANGUAGE_NAMES[sourceLang] || 'Hindi';
        const prompt = `Translate the following ${langName} text to English. 
If the text is already in English or is a mix, translate the non-English parts.
If it's Romanized ${langName} (written in English letters), translate it to English.
Return ONLY the English translation, nothing else.

Text: "${text}"`;

        const result = await model.generateContent(prompt);
        const translated = result.response.text().trim();
        logger.debug({ event: 'translated_to_english', from: sourceLang, original: text.substring(0, 30) });
        return translated;
    } catch (error) {
        logger.serviceError('translationService.translateToEnglish', error as Error);
        return text; // Return original on error
    }
}

/**
 * Translate English text to a target language.
 */
async function translateFromEnglish(text: string, targetLang: string): Promise<string> {
    if (targetLang === 'en') return text;

    try {
        const langName = LANGUAGE_NAMES[targetLang] || 'Hindi';
        const prompt = `Translate the following English text to ${langName} (using ${langName} script, not Romanized).
Keep it simple, conversational, and easy to understand for daily-wage workers.
Return ONLY the translation, nothing else.

Text: "${text}"`;

        const result = await model.generateContent(prompt);
        const translated = result.response.text().trim();
        logger.debug({ event: 'translated_from_english', to: targetLang, original: text.substring(0, 30) });
        return translated;
    } catch (error) {
        logger.serviceError('translationService.translateFromEnglish', error as Error);
        return text; // Return original on error
    }
}

export {
    detectLanguage,
    translateToEnglish,
    translateFromEnglish,
    SUPPORTED_LANGUAGES,
    LANGUAGE_NAMES,
};
