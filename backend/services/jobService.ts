// ============================================
// Job Service — Database operations for jobs
// ============================================
// Pure DB operations — conversational flows handled by Claude AI

import { PrismaClient, Job } from '@prisma/client';
import logger from '../utils/logger';

const prisma = new PrismaClient();

/**
 * Create a new job posting.
 */
async function createJob(data: {
    contractorPhone: string;
    title?: string;
    skillRequired: string;
    wage: string;
    city: string;
    location?: string;
    workersNeeded?: number;
    durationDays?: number;
    insuranceProvided?: boolean;
}): Promise<Job | null> {
    try {
        return await prisma.job.create({ data });
    } catch (error) {
        logger.serviceError('jobService.createJob', error as Error);
        return null;
    }
}

/**
 * Find a job by ID.
 */
async function findJob(jobId: string): Promise<Job | null> {
    try {
        return await prisma.job.findUnique({
            where: { id: jobId },
            include: { applications: { include: { worker: true } } },
        });
    } catch (error) {
        logger.serviceError('jobService.findJob', error as Error);
        return null;
    }
}

/**
 * Get open jobs with optional filters.
 */
async function getOpenJobs(filters?: { city?: string; skill?: string }): Promise<Job[]> {
    try {
        const where: any = { status: 'OPEN' };
        if (filters?.city) where.city = { contains: filters.city, mode: 'insensitive' };
        if (filters?.skill) where.skillRequired = { contains: filters.skill, mode: 'insensitive' };

        return await prisma.job.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            take: 10,
        });
    } catch (error) {
        logger.serviceError('jobService.getOpenJobs', error as Error);
        return [];
    }
}

/**
 * Update job status.
 */
async function updateJobStatus(jobId: string, status: string): Promise<Job | null> {
    try {
        return await prisma.job.update({
            where: { id: jobId },
            data: { status },
        });
    } catch (error) {
        logger.serviceError('jobService.updateJobStatus', error as Error);
        return null;
    }
}

export {
    createJob,
    findJob,
    getOpenJobs,
    updateJobStatus,
};
