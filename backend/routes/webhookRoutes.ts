// ============================================
// Webhook Routes — REST API + Admin Dashboard API
// ============================================

import express, { Request, Response, Router } from 'express';
import prisma from '../prisma/prismaClient';
import logger from '../utils/logger';

const router: Router = express.Router();

// =============================================
// Public Routes
// =============================================

// ----- Health Check -----
router.get('/health', (_req: Request, res: Response) => {
    res.json({
        status: 'ok',
        service: 'your-chowk-backend',
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

// ----- Get Queue Status -----
router.get('/api/queue', (_req: Request, res: Response) => {
    const broadcastQueue = require('../services/broadcastQueue');
    res.json(broadcastQueue.getStatus());
});

// =============================================
// Admin Dashboard API
// =============================================

// ----- Admin Login -----
router.post('/api/auth/login', (req: Request, res: Response) => {
    const { email, password } = req.body;
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@yourchawk.com';
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';

    if (email === adminEmail && password === adminPassword) {
        res.json({ success: true, token: 'admin-session-token', user: { email: adminEmail, role: 'admin' } });
    } else {
        res.status(401).json({ success: false, error: 'Invalid credentials' });
    }
});

// ----- Dashboard Stats -----
router.get('/api/dashboard/stats', async (_req: Request, res: Response) => {
    try {
        const [
            totalWorkers,
            totalContractors,
            totalJobs,
            openJobs,
            filledJobs,
            totalApplications,
            acceptedApplications,
            attendanceMarked,
        ] = await Promise.all([
            prisma.worker.count({ where: { role: 'worker' } }),
            prisma.worker.count({ where: { role: 'contractor' } }),
            prisma.job.count(),
            prisma.job.count({ where: { status: 'OPEN' } }),
            prisma.job.count({ where: { status: 'FILLED' } }),
            prisma.application.count(),
            prisma.application.count({ where: { status: 'ACCEPTED' } }),
            prisma.application.count({ where: { attendanceStatus: 'PRESENT' } }),
        ]);

        res.json({
            totalWorkers,
            totalContractors,
            totalJobs,
            openJobs,
            filledJobs,
            totalApplications,
            acceptedApplications,
            attendanceMarked,
        });
    } catch (error) {
        logger.serviceError('routes.dashboardStats', error as Error);
        res.status(500).json({ error: 'Failed to fetch stats' });
    }
});

// ----- Dashboard Users -----
router.get('/api/dashboard/users', async (req: Request, res: Response) => {
    try {
        const { role, city, page = '1', limit = '20' } = req.query;
        const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

        const where: any = {};
        if (role) where.role = role;
        if (city) where.city = { contains: city as string, mode: 'insensitive' };

        const [users, total] = await Promise.all([
            prisma.worker.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip,
                take: parseInt(limit as string),
            }),
            prisma.worker.count({ where }),
        ]);

        res.json({ total, page: parseInt(page as string), limit: parseInt(limit as string), users });
    } catch (error) {
        logger.serviceError('routes.dashboardUsers', error as Error);
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

// ----- Dashboard Jobs -----
router.get('/api/dashboard/jobs', async (req: Request, res: Response) => {
    try {
        const { status, city, page = '1', limit = '20' } = req.query;
        const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

        const where: any = {};
        if (status) where.status = status;
        if (city) where.city = { contains: city as string, mode: 'insensitive' };

        const [jobs, total] = await Promise.all([
            prisma.job.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                include: { applications: { include: { worker: true } } },
                skip,
                take: parseInt(limit as string),
            }),
            prisma.job.count({ where }),
        ]);

        res.json({ total, page: parseInt(page as string), limit: parseInt(limit as string), jobs });
    } catch (error) {
        logger.serviceError('routes.dashboardJobs', error as Error);
        res.status(500).json({ error: 'Failed to fetch jobs' });
    }
});

// ----- Dashboard Attendance -----
router.get('/api/dashboard/attendance', async (req: Request, res: Response) => {
    try {
        const { page = '1', limit = '20' } = req.query;
        const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

        const [records, total] = await Promise.all([
            prisma.application.findMany({
                where: { attendanceStatus: { not: 'NOT_MARKED' } },
                orderBy: { attendanceMarkedAt: 'desc' },
                include: { job: true, worker: true },
                skip,
                take: parseInt(limit as string),
            }),
            prisma.application.count({ where: { attendanceStatus: { not: 'NOT_MARKED' } } }),
        ]);

        res.json({ total, page: parseInt(page as string), limit: parseInt(limit as string), records });
    } catch (error) {
        logger.serviceError('routes.dashboardAttendance', error as Error);
        res.status(500).json({ error: 'Failed to fetch attendance records' });
    }
});

export default router;
