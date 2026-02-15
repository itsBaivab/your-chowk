// ============================================
// Prisma Client — Singleton Instance
// ============================================
// Prevents multiple Prisma Client instances during hot reload

import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
    prisma: PrismaClient | undefined;
};

const prisma =
    globalForPrisma.prisma ??
    new PrismaClient({
        log: process.env.DEBUG_MODE === 'true' ? ['query', 'info', 'warn', 'error'] : ['error'],
    });

if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.prisma = prisma;
}

export default prisma;
