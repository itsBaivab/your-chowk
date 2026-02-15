// ============================================
// Webhook Routes — REST API for debugging/demo
// ============================================

import express, { Request, Response, Router } from 'express';
import prisma from '../prisma/prismaClient';
import logger from '../utils/logger';

const router: Router = express.Router();

// ----- Health Check -----
router.get('/health', (_req: Request, res: Response) => {
    res.json({
        status: 'ok',
        service: 'kaam-milega-backend',
        timestamp: new Date().toISOString(),
    });
});

// ----- List Workers -----
router.get('/api/workers', async (_req: Request, res: Response) => {
    try {
        const workers = await prisma.worker.findMany({
            orderBy: { createdAt: 'desc' },
        });
        res.json({ count: workers.length, workers });
    } catch (error) {
        logger.serviceError('routes.getWorkers', error as Error);
        res.status(500).json({ error: 'Failed to fetch workers' });
    }
});

// ----- List Jobs -----
router.get('/api/jobs', async (_req: Request, res: Response) => {
    try {
        const jobs = await prisma.job.findMany({
            orderBy: { createdAt: 'desc' },
            include: {
                applications: true,
            },
        });
        res.json({ count: jobs.length, jobs });
    } catch (error) {
        logger.serviceError('routes.getJobs', error as Error);
        res.status(500).json({ error: 'Failed to fetch jobs' });
    }
});

// ----- List Applications -----
router.get('/api/applications', async (_req: Request, res: Response) => {
    try {
        const applications = await prisma.application.findMany({
            orderBy: { createdAt: 'desc' },
            include: {
                job: true,
                worker: true,
            },
        });
        res.json({ count: applications.length, applications });
    } catch (error) {
        logger.serviceError('routes.getApplications', error as Error);
        res.status(500).json({ error: 'Failed to fetch applications' });
    }
});

// ----- Trigger Seed (Demo Mode) -----
router.post('/api/seed', async (_req: Request, res: Response) => {
    try {
        const { default: seed } = await import('../prisma/seed');
        await seed();
        res.json({ status: 'ok', message: 'Database seeded with demo data' });
    } catch (error) {
        logger.serviceError('routes.seed', error as Error);
        res.status(500).json({ error: 'Seed failed' });
    }
});

// ----- Get Queue Status -----
router.get('/api/queue', (_req: Request, res: Response) => {
    const broadcastQueue = require('../services/broadcastQueue');
    res.json(broadcastQueue.getStatus());
});

export default router;
