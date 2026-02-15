// ============================================
// Matching Service — Job ↔ Worker Matching
// ============================================
// Finds workers matching a job's skill + location,
// sends notifications, and handles job acceptance
// with race-condition-safe Prisma transactions.

import { Job, Worker } from '@prisma/client';
import prisma from '../prisma/prismaClient';
import * as broadcastQueue from './broadcastQueue';
import * as translationService from './translationService';
import logger from '../utils/logger';

import type makeWASocket from '@whiskeysockets/baileys';
type WASocket = ReturnType<typeof makeWASocket>;

/**
 * Find workers that match a job's requirements.
 * Matches by skill (case-insensitive partial) and location (case-insensitive partial).
 */
async function findMatchingWorkers(job: Job): Promise<Worker[]> {
    try {
        const workers = await prisma.worker.findMany({
            where: {
                role: 'worker',
                skill: {
                    contains: job.skillRequired,
                    mode: 'insensitive',
                },
                // Match location partially (e.g., "Mumbai" matches "Andheri, Mumbai")
                location: {
                    contains: job.location.split(',')[0].trim(),
                    mode: 'insensitive',
                },
            },
        });

        logger.debug({
            event: 'workers_matched',
            jobId: job.id,
            skill: job.skillRequired,
            location: job.location,
            matchCount: workers.length,
        });

        return workers;
    } catch (error) {
        logger.serviceError('matchingService.findMatchingWorkers', error as Error);
        return [];
    }
}

/**
 * Find matching workers and notify them via WhatsApp.
 * This is the main entry point called after job creation.
 */
async function matchAndNotify(sock: WASocket, job: Job): Promise<void> {
    let workers = await findMatchingWorkers(job);

    // If no exact matches, try matching by skill only
    if (workers.length === 0) {
        workers = await prisma.worker.findMany({
            where: {
                role: 'worker',
                skill: {
                    contains: job.skillRequired,
                    mode: 'insensitive',
                },
            },
        });
        logger.debug({ event: 'skill_only_match', matchCount: workers.length });
    }

    if (workers.length === 0) {
        logger.info({ event: 'no_workers_matched', jobId: job.id });
        // Notify contractor that no workers were found
        const contractorJid = `${job.contractorPhone}@s.whatsapp.net`;
        broadcastQueue.enqueue(
            contractorJid,
            `⚠️ No workers found matching skill "${job.skillRequired}" near "${job.location}". Workers will be notified when they register.`
        );
        return;
    }

    // Build notification message for each worker (translated to their language)
    for (const worker of workers) {
        const jid = `${worker.phoneNumber}@s.whatsapp.net`;

        let message = `🔔 *New Job Available!*\n\n` +
            `📋 Title: ${job.title || 'General Work'}\n` +
            `🔧 Skill: ${job.skillRequired}\n` +
            `💰 Wage: ${job.wage}\n` +
            `📍 Location: ${job.location}\n` +
            `👷 Workers needed: ${job.workersNeeded}\n\n` +
            `Reply *YES* to accept this job.\n` +
            `(Job ID: ${job.id.substring(0, 8)})`;

        // Translate to worker's preferred language
        if (worker.preferredLanguage && worker.preferredLanguage !== 'en') {
            try {
                message = await translationService.translateFromEnglish(message, worker.preferredLanguage);
            } catch (_) {
                // Send in English if translation fails
            }
        }

        broadcastQueue.enqueue(jid, message);
    }

    logger.broadcastSent(workers.length, job.id);
}

/**
 * Handle a worker accepting a job.
 * Uses Prisma $transaction to prevent race conditions.
 */
async function acceptJob(
    workerPhone: string,
    jobId: string
): Promise<{ success: boolean; message: string }> {
    try {
        // Find the job — support partial ID matching
        let job: Job | null = null;
        if (jobId.length < 36) {
            // Partial ID — find by prefix
            const jobs = await prisma.job.findMany({
                where: {
                    id: { startsWith: jobId },
                    status: 'OPEN',
                },
                take: 1,
            });
            job = jobs[0] || null;
        } else {
            job = await prisma.job.findUnique({ where: { id: jobId } });
        }

        if (!job) {
            return { success: false, message: '❌ Job not found or already filled.' };
        }

        if (job.status !== 'OPEN') {
            return { success: false, message: '❌ Sorry, this job has already been filled.' };
        }

        // Use a transaction for atomic acceptance
        const result = await prisma.$transaction(async (tx) => {
            // Re-check job status inside transaction
            const currentJob = await tx.job.findUnique({
                where: { id: job!.id },
            });

            if (!currentJob || currentJob.status !== 'OPEN' || currentJob.workersNeeded <= 0) {
                throw new Error('JOB_FILLED');
            }

            // Check if worker already applied
            const existing = await tx.application.findUnique({
                where: {
                    jobId_workerPhone: {
                        jobId: job!.id,
                        workerPhone,
                    },
                },
            });

            if (existing) {
                throw new Error('ALREADY_APPLIED');
            }

            // Create application
            await tx.application.create({
                data: {
                    jobId: job!.id,
                    workerPhone,
                    status: 'ACCEPTED',
                },
            });

            // Decrement workers needed
            const updatedJob = await tx.job.update({
                where: { id: job!.id },
                data: {
                    workersNeeded: { decrement: 1 },
                    status: currentJob.workersNeeded <= 1 ? 'FILLED' : 'OPEN',
                },
            });

            return updatedJob;
        });

        logger.workerAssigned(workerPhone, job.id);

        // Notify contractor
        const contractorJid = `${job.contractorPhone}@s.whatsapp.net`;
        broadcastQueue.enqueue(
            contractorJid,
            `✅ Worker ${workerPhone} has accepted your job "${job.title || job.skillRequired}".\nWorkers still needed: ${result.workersNeeded}`
        );

        // If job is now filled, notify remaining workers
        if (result.status === 'FILLED') {
            broadcastQueue.enqueue(
                contractorJid,
                `🎉 All positions for "${job.title || job.skillRequired}" have been filled!`
            );
        }

        return {
            success: true,
            message: `✅ You have been assigned to the job!\n\n📋 Job: ${job.title || job.skillRequired}\n💰 Wage: ${job.wage}\n📍 Location: ${job.location}\n📞 Contractor: ${job.contractorPhone}\n\nPlease reach out to the contractor for further details.`,
        };
    } catch (error) {
        if ((error as Error).message === 'JOB_FILLED') {
            return { success: false, message: '❌ Sorry, this job has already been filled.' };
        }
        if ((error as Error).message === 'ALREADY_APPLIED') {
            return { success: false, message: '⚠️ You have already accepted this job.' };
        }

        logger.serviceError('matchingService.acceptJob', error as Error);
        return { success: false, message: '❌ Something went wrong. Please try again.' };
    }
}

/**
 * Find the most recent open job that was sent to a worker.
 * Used when worker replies "YES" without specifying job ID.
 */
async function findRecentJobForWorker(workerPhone: string): Promise<Job | null> {
    try {
        // Find the worker's skill
        const worker = await prisma.worker.findUnique({
            where: { phoneNumber: workerPhone },
        });

        if (!worker) return null;

        // Find the most recent open job matching the worker's skill
        const job = await prisma.job.findFirst({
            where: {
                status: 'OPEN',
                skillRequired: {
                    contains: worker.skill || '',
                    mode: 'insensitive',
                },
            },
            orderBy: { createdAt: 'desc' },
        });

        return job;
    } catch (error) {
        logger.serviceError('matchingService.findRecentJobForWorker', error as Error);
        return null;
    }
}

export {
    findMatchingWorkers,
    matchAndNotify,
    acceptJob,
    findRecentJobForWorker,
};
