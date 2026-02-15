// ============================================
// Attendance Service — OTP-based attendance
// ============================================
// Generates OTPs for contractors and verifies them for workers

import { PrismaClient } from '@prisma/client';
import logger from '../utils/logger';

const prisma = new PrismaClient();

/**
 * Generate a 6-digit OTP for attendance marking.
 */
async function generateOTP(jobId: string, workerPhone: string): Promise<{ success: boolean; otp?: string; message: string }> {
    try {
        const application = await prisma.application.findUnique({
            where: { jobId_workerPhone: { jobId, workerPhone } },
        });

        if (!application) return { success: false, message: 'No application found for this job-worker pair' };
        if (application.status !== 'ACCEPTED') return { success: false, message: 'Application is not accepted yet' };

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const otpExpiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 min expiry

        await prisma.application.update({
            where: { id: application.id },
            data: { otp, otpExpiresAt },
        });

        logger.info({ event: 'otp_generated', jobId, workerPhone, otp });
        return { success: true, otp, message: 'OTP generated successfully' };
    } catch (error) {
        logger.serviceError('attendanceService.generateOTP', error as Error);
        return { success: false, message: 'Failed to generate OTP' };
    }
}

/**
 * Verify an OTP and mark attendance.
 */
async function verifyOTP(workerPhone: string, otp: string): Promise<{ success: boolean; message: string }> {
    try {
        const application = await prisma.application.findFirst({
            where: {
                workerPhone,
                otp,
                status: 'ACCEPTED',
                otpExpiresAt: { gte: new Date() },
            },
            include: { job: true },
        });

        if (!application) return { success: false, message: 'Invalid or expired OTP' };

        await prisma.application.update({
            where: { id: application.id },
            data: {
                attendanceStatus: 'PRESENT',
                attendanceMarkedAt: new Date(),
                otp: null,
                otpExpiresAt: null,
            },
        });

        logger.info({ event: 'attendance_marked', workerPhone, jobId: application.jobId });
        return {
            success: true,
            message: `Attendance marked as PRESENT for ${application.job.title || application.job.skillRequired}`,
        };
    } catch (error) {
        logger.serviceError('attendanceService.verifyOTP', error as Error);
        return { success: false, message: 'Failed to verify OTP' };
    }
}

export {
    generateOTP,
    verifyOTP,
};
