// ============================================
// Message Handler — Central Message Router
// ============================================
// Receives raw Baileys messages, processes them,
// and routes to the appropriate service.

import { getContentType } from '@whiskeysockets/baileys';
import { sendMessage, WASocket } from './baileysClient';
import * as workerService from '../services/workerService';
import * as jobService from '../services/jobService';
import * as matchingService from '../services/matchingService';
import * as stateService from '../services/stateService';
import * as translationService from '../services/translationService';
import { detectIntent } from '../services/aiService';
import { processVoiceMessage } from '../services/voiceService';
import { downloadMedia, saveMediaToFile, getExtensionFromMime } from '../utils/mediaHandler';
import prisma from '../prisma/prismaClient';
import logger from '../utils/logger';
import { ConversationState } from '@prisma/client';

/**
 * Main message handler — processes all incoming WhatsApp messages.
 * This is passed to baileysClient.connectToWhatsApp() as a callback.
 */
async function handleMessage(sock: WASocket, message: any): Promise<void> {
    const jid: string = message.key.remoteJid;
    const phoneNumber = jid; // Keep full JID for state management
    const cleanPhone = jid.replace('@s.whatsapp.net', '');

    try {
        // ----- Determine message type -----
        const messageType = getContentType(message.message);
        let text = '';
        let isVoice = false;
        let isImage = false;

        // Extract text from different message types
        if (messageType === 'conversation') {
            text = message.message.conversation || '';
        } else if (messageType === 'extendedTextMessage') {
            text = message.message.extendedTextMessage?.text || '';
        } else if (messageType === 'audioMessage') {
            isVoice = true;
        } else if (messageType === 'imageMessage') {
            isImage = true;
        } else {
            logger.debug({ event: 'unsupported_message_type', messageType, jid });
            return; // Skip unsupported message types
        }

        logger.incomingMessage(cleanPhone, messageType || 'unknown', text);

        // ----- Handle voice messages -----
        if (isVoice) {
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
        }

        // ----- Handle image messages -----
        if (isImage) {
            const state = await stateService.getState(phoneNumber);
            if (state?.currentStep === 'awaiting_id_image') {
                // Process ID card image during registration
                const contextData = (state.contextData as Record<string, any>) || {};
                const reply = await workerService.handleIdImageUpload(sock, phoneNumber, message, state, contextData.preferredLanguage || 'en');
                const translatedReply = await translateReply(reply, contextData.preferredLanguage || 'en');
                await sendMessage(jid, translatedReply);
                return;
            }

            // If image received outside registration, acknowledge it
            await sendMessage(jid, '📸 I received your image. If you want to register, type "hi" first.');
            return;
        }

        // ----- Skip empty text -----
        if (!text || text.trim().length === 0) return;

        // ----- Detect language and translate to English -----
        const detectedLang = await translationService.detectLanguage(text);
        const englishText = await translationService.translateToEnglish(text, detectedLang);

        // ----- Check conversation state -----
        const state = await stateService.getState(phoneNumber);

        if (state) {
            // User is in an active flow — route to the appropriate handler
            const contextData = (state.contextData as Record<string, any>) || {};
            const reply = await handleStatefulMessage(sock, phoneNumber, englishText, state, detectedLang);
            const translatedReply = await translateReply(reply, contextData.preferredLanguage || detectedLang);
            await sendMessage(jid, translatedReply);
            return;
        }

        // ----- No active state — detect intent -----
        const { intent, skill } = await detectIntent(englishText);
        logger.debug({ event: 'intent_result', intent, skill, originalText: text.substring(0, 30) });

        let reply = '';

        switch (intent) {
            case 'greeting':
            case 'register': {
                reply = await workerService.handleRegistration(sock, phoneNumber, englishText, null, detectedLang);
                break;
            }

            case 'post_job': {
                reply = await jobService.handleJobPosting(sock, phoneNumber, englishText, null);
                break;
            }

            case 'accept_job': {
                // Try to find and accept the most recent matching job
                const recentJob = await matchingService.findRecentJobForWorker(cleanPhone);
                if (recentJob) {
                    const result = await matchingService.acceptJob(cleanPhone, recentJob.id);
                    reply = result.message;
                } else {
                    reply = '❌ No open jobs found for you right now. You will be notified when new jobs are posted.';
                }
                break;
            }

            case 'job_search': {
                reply = await handleJobSearch(cleanPhone, skill);
                break;
            }

            default: {
                reply = '👋 Welcome to *Kaam Milega*!\n\n' +
                    'I can help you:\n' +
                    '• *Register* as a worker — type "register"\n' +
                    '• *Post a job* as a contractor — type "post job"\n' +
                    '• *Find jobs* — type "find job"\n\n' +
                    'You can send messages in Hindi, Bengali, or English. Voice messages are also supported! 🎤';
            }
        }

        const translatedReply = await translateReply(reply, detectedLang);
        await sendMessage(jid, translatedReply);
    } catch (error) {
        logger.serviceError('messageHandler.handleMessage', error as Error);
        try {
            await sendMessage(jid, '❌ Sorry, something went wrong. Please try again.');
        } catch (_) {
            // Ignore send errors during error handling
        }
    }
}

/**
 * Handle messages when user is in an active conversational flow.
 */
async function handleStatefulMessage(
    sock: WASocket,
    phoneNumber: string,
    text: string,
    state: ConversationState,
    detectedLang: string
): Promise<string> {
    const { currentStep } = state;

    // Worker registration steps
    if (currentStep.startsWith('awaiting_name') ||
        currentStep.startsWith('awaiting_skill') ||
        currentStep.startsWith('awaiting_location') ||
        currentStep.startsWith('awaiting_id_image')) {
        return await workerService.handleRegistration(sock, phoneNumber, text, state, detectedLang);
    }

    // Contractor job posting steps
    if (currentStep.startsWith('awaiting_job') ||
        currentStep.startsWith('awaiting_skill_required') ||
        currentStep.startsWith('awaiting_wage') ||
        currentStep.startsWith('awaiting_workers_needed')) {
        return await jobService.handleJobPosting(sock, phoneNumber, text, state);
    }

    // Unknown state — clear and restart
    await stateService.clearState(phoneNumber);
    return 'I lost track of our conversation. Let\'s start over!\n\nType "register" or "post job" to begin.';
}

/**
 * Handle a job search request.
 */
async function handleJobSearch(workerPhone: string, skill: string | null): Promise<string> {
    try {
        const worker = await prisma.worker.findUnique({
            where: { phoneNumber: workerPhone },
        });

        if (!worker) {
            return '⚠️ You are not registered yet. Type "register" to sign up and receive job notifications.';
        }

        const searchSkill = skill || worker.skill || '';

        const jobs = await prisma.job.findMany({
            where: {
                status: 'OPEN',
                skillRequired: {
                    contains: searchSkill,
                    mode: 'insensitive',
                },
            },
            orderBy: { createdAt: 'desc' },
            take: 3,
        });

        if (jobs.length === 0) {
            return `📭 No open jobs found for "${searchSkill}" right now. You will be notified when new jobs matching your skills are posted.`;
        }

        let message = `📋 *Open Jobs for "${searchSkill}":*\n\n`;
        jobs.forEach((job, i) => {
            message += `${i + 1}. *${job.title || job.skillRequired}*\n`;
            message += `   💰 ${job.wage} | 📍 ${job.location}\n`;
            message += `   👷 ${job.workersNeeded} needed\n`;
            message += `   Reply YES to accept\n\n`;
        });

        return message;
    } catch (error) {
        logger.serviceError('messageHandler.handleJobSearch', error as Error);
        return '❌ Could not search for jobs. Please try again.';
    }
}

/**
 * Translate a reply to the user's preferred language.
 */
async function translateReply(text: string, targetLang: string): Promise<string> {
    if (!targetLang || targetLang === 'en') return text;

    try {
        return await translationService.translateFromEnglish(text, targetLang);
    } catch (_) {
        return text; // Return English if translation fails
    }
}

export {
    handleMessage,
};
