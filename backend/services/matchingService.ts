// ============================================
// Matching Service — Worker-Job Matching
// ============================================
// Finds workers matching a job's city and skill requirements

import { PrismaClient, Job, Worker } from '@prisma/client';
import logger from '../utils/logger';
import * as broadcastQueue from './broadcastQueue';

const prisma = new PrismaClient();

/**
 * Find workers matching a job's requirements (same city, matching skill).
 */
async function findMatchingWorkers(job: Job): Promise<Worker[]> {
    try {
        return await prisma.worker.findMany({
            where: {
                role: 'worker',
                isOnboarded: true,
                city: {
                    contains: job.city,
                    mode: 'insensitive',
                },
                ...(job.skillRequired && {
                    skill: {
                        contains: job.skillRequired,
                        mode: 'insensitive',
                    },
                }),
            },
            take: 50,
        });
    } catch (error) {
        logger.serviceError('matchingService.findMatchingWorkers', error as Error);
        return [];
    }
}

/**
 * Find a recent open job for a worker based on their skill and city.
 */
async function findRecentJobForWorker(workerPhone: string): Promise<Job | null> {
    try {
        const worker = await prisma.worker.findUnique({
            where: { phoneNumber: workerPhone },
        });

        if (!worker) return null;

        return await prisma.job.findFirst({
            where: {
                status: 'OPEN',
                ...(worker.city && { city: { contains: worker.city, mode: 'insensitive' as const } }),
                ...(worker.skill && { skillRequired: { contains: worker.skill, mode: 'insensitive' as const } }),
            },
            orderBy: { createdAt: 'desc' },
        });
    } catch (error) {
        logger.serviceError('matchingService.findRecentJobForWorker', error as Error);
        return null;
    }
}

/**
 * Accept a job. Creates an application with ACCEPTED status.
 */
async function acceptJob(workerPhone: string, jobId: string): Promise<{ success: boolean; message: string }> {
    try {
        const job = await prisma.job.findUnique({ where: { id: jobId } });
        if (!job) return { success: false, message: 'Job not found' };
        if (job.status !== 'OPEN') return { success: false, message: 'Job is no longer open' };

        await prisma.application.upsert({
            where: { jobId_workerPhone: { jobId, workerPhone } },
            update: { status: 'ACCEPTED' },
            create: { jobId, workerPhone, status: 'ACCEPTED' },
        });

        // Check if job is now filled
        const acceptedCount = await prisma.application.count({
            where: { jobId, status: 'ACCEPTED' },
        });

        if (acceptedCount >= job.workersNeeded) {
            await prisma.job.update({
                where: { id: jobId },
                data: { status: 'FILLED' },
            });
        }

        return { success: true, message: `✅ Job accepted: ${job.title || job.skillRequired}` };
    } catch (error) {
        logger.serviceError('matchingService.acceptJob', error as Error);
        return { success: false, message: 'Failed to accept job' };
    }
}

export {
    findMatchingWorkers,
    findRecentJobForWorker,
    acceptJob,
};
