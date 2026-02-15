// ============================================
// State Service — Conversation State Management
// ============================================
// Tracks multi-step flows (registration, job posting)
// Persisted in DB via Prisma ConversationState model

import { ConversationState, Prisma } from '@prisma/client';
import prisma from '../prisma/prismaClient';
import logger from '../utils/logger';

/**
 * Get the current conversation state for a phone number.
 */
async function getState(phoneNumber: string): Promise<ConversationState | null> {
    try {
        const state = await prisma.conversationState.findUnique({
            where: { phoneNumber },
        });
        return state;
    } catch (error) {
        logger.serviceError('stateService.getState', error as Error);
        return null;
    }
}

/**
 * Set or update the conversation state for a phone number.
 * Uses upsert to create or update.
 */
async function setState(
    phoneNumber: string,
    currentStep: string,
    contextData: Prisma.InputJsonValue = {},
    role: string = 'worker'
): Promise<void> {
    try {
        await prisma.conversationState.upsert({
            where: { phoneNumber },
            update: {
                currentStep,
                contextData,
                role,
            },
            create: {
                phoneNumber,
                currentStep,
                contextData,
                role,
            },
        });
        logger.debug({ event: 'state_set', phoneNumber, currentStep, role });
    } catch (error) {
        logger.serviceError('stateService.setState', error as Error);
    }
}

/**
 * Clear the conversation state (flow completed or cancelled).
 */
async function clearState(phoneNumber: string): Promise<void> {
    try {
        await prisma.conversationState.delete({
            where: { phoneNumber },
        }).catch(() => {
            // Ignore if state doesn't exist
        });
        logger.debug({ event: 'state_cleared', phoneNumber });
    } catch (error) {
        logger.serviceError('stateService.clearState', error as Error);
    }
}

export {
    getState,
    setState,
    clearState,
};
