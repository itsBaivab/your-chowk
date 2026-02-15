// ============================================
// Worker Service — Registration Flow
// ============================================
// Handles step-by-step worker registration via WhatsApp
// Steps: greeting → awaiting_name → awaiting_skill → awaiting_location → awaiting_id_image → registered

import { ConversationState } from '@prisma/client';
import prisma from '../prisma/prismaClient';
import * as stateService from './stateService';
import * as translationService from './translationService';
import { parseIdCard } from './aiService';
import { downloadMedia, saveMediaToFile, uploadToStorage, getExtensionFromMime } from '../utils/mediaHandler';
import logger from '../utils/logger';

import type makeWASocket from '@whiskeysockets/baileys';
type WASocket = ReturnType<typeof makeWASocket>;

// Common skills for validation/suggestion
const COMMON_SKILLS: string[] = [
    'painter', 'electrician', 'plumber', 'carpenter', 'mason',
    'welder', 'driver', 'cleaner', 'helper', 'labourer',
    'cook', 'security guard', 'gardener',
];

/**
 * Handle a worker registration message based on current state.
 */
async function handleRegistration(
    sock: WASocket,
    phoneNumber: string,
    text: string,
    state: ConversationState | null,
    detectedLang: string
): Promise<string> {
    const currentStep = state?.currentStep || 'start';
    const context = ((state?.contextData as Record<string, any>) || {}) as Record<string, any>;

    switch (currentStep) {
        // ----- Step 0: Start registration -----
        case 'start': {
            // Store the detected language
            context.preferredLanguage = detectedLang;

            await stateService.setState(phoneNumber, 'awaiting_name', context, 'worker');
            return '👋 Welcome to Kaam Milega!\n\nI help daily-wage workers find jobs near them.\n\nLet\'s get you registered. What is your name?';
        }

        // ----- Step 1: Collect name -----
        case 'awaiting_name': {
            const name = text.trim();
            if (name.length < 2) {
                return 'Please enter a valid name (at least 2 characters).';
            }

            context.name = name;
            await stateService.setState(phoneNumber, 'awaiting_skill', context, 'worker');

            const skillList = COMMON_SKILLS.slice(0, 8).join(', ');
            return `Nice to meet you, ${name}! 🙏\n\nWhat is your primary skill?\nExamples: ${skillList}\n\nYou can type your skill or choose from the list above.`;
        }

        // ----- Step 2: Collect skill -----
        case 'awaiting_skill': {
            const skill = text.trim().toLowerCase();
            if (skill.length < 2) {
                return 'Please enter a valid skill (e.g., painter, electrician, plumber).';
            }

            context.skill = skill;
            await stateService.setState(phoneNumber, 'awaiting_location', context, 'worker');
            return '📍 What is your work location or area?\n\nType the area/city name (e.g., "Andheri, Mumbai" or "Sector 62, Noida").';
        }

        // ----- Step 3: Collect location -----
        case 'awaiting_location': {
            const location = text.trim();
            if (location.length < 2) {
                return 'Please enter a valid location (e.g., "Sector 62, Noida").';
            }

            context.location = location;
            await stateService.setState(phoneNumber, 'awaiting_id_image', context, 'worker');
            return '📸 (Optional) Send a photo of your ID card (Aadhaar/PAN/Voter ID).\n\nThis helps contractors verify your identity.\n\nType "skip" to skip this step.';
        }

        // ----- Step 4: Collect ID image (optional) -----
        case 'awaiting_id_image': {
            // Check if user wants to skip
            const lowerText = text.toLowerCase().trim();
            if (lowerText === 'skip' || lowerText === 'no') {
                return await completeRegistration(phoneNumber, context, detectedLang);
            }

            // If text received instead of image, prompt again
            return '📸 Please send a photo of your ID card, or type "skip" to skip.';
        }

        default: {
            return 'Something went wrong. Type "hi" to start over.';
        }
    }
}

/**
 * Handle an image upload during registration (ID card).
 */
async function handleIdImageUpload(
    sock: WASocket,
    phoneNumber: string,
    message: any,
    state: ConversationState,
    detectedLang: string
): Promise<string> {
    if (state?.currentStep !== 'awaiting_id_image') {
        return 'I received an image, but I\'m not expecting one right now. Type "hi" to start registration.';
    }

    try {
        const context = ((state.contextData as Record<string, any>) || {}) as Record<string, any>;

        // Download and save the image
        const buffer = await downloadMedia(message, sock);
        const mimetype: string = message.message?.imageMessage?.mimetype || 'image/jpeg';
        const ext = getExtensionFromMime(mimetype);
        const filePath = saveMediaToFile(buffer, ext);
        const imageUrl = await uploadToStorage(filePath);

        context.idImageUrl = imageUrl;

        // Try to parse the ID card using Gemini Vision
        const idData = await parseIdCard(filePath);
        if (idData.name && !context.name) {
            context.name = idData.name;
        }

        logger.info({ event: 'id_card_uploaded', phoneNumber, parsedName: idData.name, hasId: !!idData.idNumber });

        return await completeRegistration(phoneNumber, context, detectedLang);
    } catch (error) {
        logger.serviceError('workerService.handleIdImageUpload', error as Error);
        return 'Failed to process your ID image. You can try again or type "skip" to continue without it.';
    }
}

/**
 * Complete the worker registration — save to database.
 */
async function completeRegistration(
    phoneNumber: string,
    context: Record<string, any>,
    detectedLang: string
): Promise<string> {
    try {
        // Clean phone number (remove @s.whatsapp.net)
        const cleanPhone = phoneNumber.replace('@s.whatsapp.net', '');

        // Upsert worker in database
        await prisma.worker.upsert({
            where: { phoneNumber: cleanPhone },
            update: {
                name: context.name,
                skill: context.skill,
                location: context.location,
                preferredLanguage: context.preferredLanguage || detectedLang || 'en',
                idImageUrl: context.idImageUrl || null,
            },
            create: {
                phoneNumber: cleanPhone,
                name: context.name,
                skill: context.skill,
                location: context.location,
                preferredLanguage: context.preferredLanguage || detectedLang || 'en',
                idImageUrl: context.idImageUrl || null,
                role: 'worker',
            },
        });

        // Clear conversation state
        await stateService.clearState(phoneNumber);

        logger.info({ event: 'worker_registered', phoneNumber: cleanPhone, name: context.name, skill: context.skill });

        return `✅ Registration complete!\n\n📋 Your Details:\n• Name: ${context.name}\n• Skill: ${context.skill}\n• Location: ${context.location}\n• ID: ${context.idImageUrl ? 'Uploaded ✓' : 'Not provided'}\n\nYou will receive job notifications matching your skill and location. 🔔`;
    } catch (error) {
        logger.serviceError('workerService.completeRegistration', error as Error);
        return 'Sorry, there was an error saving your registration. Please try again by typing "hi".';
    }
}

export {
    handleRegistration,
    handleIdImageUpload,
    completeRegistration,
};
