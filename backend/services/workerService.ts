// ============================================
// Worker Service — Database operations for workers
// ============================================
// Pure DB operations — conversational flows handled by Claude AI

import { PrismaClient, Worker } from '@prisma/client';
import logger from '../utils/logger';

const prisma = new PrismaClient();

/**
 * Find a worker by phone number.
 */
async function findWorker(phoneNumber: string): Promise<Worker | null> {
    try {
        return await prisma.worker.findUnique({
            where: { phoneNumber },
        });
    } catch (error) {
        logger.serviceError('workerService.findWorker', error as Error);
        return null;
    }
}

/**
 * Create or update a worker.
 */
async function upsertWorker(data: {
    phoneNumber: string;
    role: string;
    name?: string;
    city?: string;
    skill?: string;
    preferredLanguage?: string;
    isOnboarded?: boolean;
}): Promise<Worker | null> {
    try {
        return await prisma.worker.upsert({
            where: { phoneNumber: data.phoneNumber },
            update: {
                ...(data.name && { name: data.name }),
                ...(data.city && { city: data.city }),
                ...(data.skill && { skill: data.skill }),
                ...(data.preferredLanguage && { preferredLanguage: data.preferredLanguage }),
                ...(data.role && { role: data.role }),
                ...(data.isOnboarded !== undefined && { isOnboarded: data.isOnboarded }),
            },
            create: {
                phoneNumber: data.phoneNumber,
                role: data.role,
                name: data.name,
                city: data.city,
                skill: data.skill,
                preferredLanguage: data.preferredLanguage || 'en',
                isOnboarded: data.isOnboarded || false,
            },
        });
    } catch (error) {
        logger.serviceError('workerService.upsertWorker', error as Error);
        return null;
    }
}

/**
 * Get all workers with optional filters.
 */
async function getWorkers(filters?: { role?: string; city?: string; skill?: string }): Promise<Worker[]> {
    try {
        const where: any = {};
        if (filters?.role) where.role = filters.role;
        if (filters?.city) where.city = { contains: filters.city, mode: 'insensitive' };
        if (filters?.skill) where.skill = { contains: filters.skill, mode: 'insensitive' };

        return await prisma.worker.findMany({
            where,
            orderBy: { createdAt: 'desc' },
        });
    } catch (error) {
        logger.serviceError('workerService.getWorkers', error as Error);
        return [];
    }
}

export {
    findWorker,
    upsertWorker,
    getWorkers,
};
