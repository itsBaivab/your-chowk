// ============================================
// Seed Script — Demo Data for Hackathon
// ============================================
// Run: npm run seed
// Or: POST /api/seed

import prisma from './prismaClient';

interface DemoWorker {
    phoneNumber: string;
    name: string;
    skill: string;
    city: string;
    preferredLanguage: string;
    role: string;
    isOnboarded: boolean;
}

interface DemoJob {
    contractorPhone: string;
    title: string;
    skillRequired: string;
    wage: string;
    city: string;
    location: string;
    workersNeeded: number;
    status: string;
}

const DEMO_WORKERS: DemoWorker[] = [
    {
        phoneNumber: '919876543210',
        name: 'Rajesh Kumar',
        skill: 'painter',
        city: 'Mumbai',
        preferredLanguage: 'hi',
        role: 'worker',
        isOnboarded: true,
    },
    {
        phoneNumber: '919876543211',
        name: 'Amit Das',
        skill: 'electrician',
        city: 'Kolkata',
        preferredLanguage: 'bn',
        role: 'worker',
        isOnboarded: true,
    },
    {
        phoneNumber: '919876543212',
        name: 'Suresh Yadav',
        skill: 'plumber',
        city: 'Noida',
        preferredLanguage: 'hi',
        role: 'worker',
        isOnboarded: true,
    },
    {
        phoneNumber: '919876543213',
        name: 'Manoj Singh',
        skill: 'carpenter',
        city: 'Delhi',
        preferredLanguage: 'hi',
        role: 'worker',
        isOnboarded: true,
    },
    {
        phoneNumber: '919876543214',
        name: 'Bikram Roy',
        skill: 'mason',
        city: 'Kolkata',
        preferredLanguage: 'bn',
        role: 'worker',
        isOnboarded: true,
    },
];

const DEMO_JOBS: DemoJob[] = [
    {
        contractorPhone: '919999999901',
        title: 'House Painting — 3BHK Flat',
        skillRequired: 'painter',
        wage: '₹700/day',
        city: 'Mumbai',
        location: 'Andheri West, Mumbai',
        workersNeeded: 2,
        status: 'OPEN',
    },
    {
        contractorPhone: '919999999902',
        title: 'Electrical Wiring — New Office',
        skillRequired: 'electrician',
        wage: '₹800/day',
        city: 'Kolkata',
        location: 'Salt Lake, Kolkata',
        workersNeeded: 1,
        status: 'OPEN',
    },
];

async function seed(): Promise<void> {
    console.log('🌱 Seeding demo data...\n');

    // Upsert workers
    for (const worker of DEMO_WORKERS) {
        await prisma.worker.upsert({
            where: { phoneNumber: worker.phoneNumber },
            update: worker,
            create: worker,
        });
        console.log(`  ✅ Worker: ${worker.name} (${worker.skill}) — ${worker.phoneNumber}`);
    }

    // Upsert contractor entries for demo jobs
    for (const job of DEMO_JOBS) {
        await prisma.worker.upsert({
            where: { phoneNumber: job.contractorPhone },
            update: { role: 'contractor' },
            create: {
                phoneNumber: job.contractorPhone,
                name: 'Demo Contractor',
                role: 'contractor',
            },
        });
    }

    // Create jobs
    for (const job of DEMO_JOBS) {
        const created = await prisma.job.create({ data: job });
        console.log(`  ✅ Job: ${job.title} — ${job.skillRequired} at ${job.location} (ID: ${created.id.substring(0, 8)})`);
    }

    console.log('\n🎉 Seed complete! Demo data loaded.\n');
    console.log('  Workers:', DEMO_WORKERS.length);
    console.log('  Jobs:', DEMO_JOBS.length);
}

// Run directly if executed as a script
if (require.main === module) {
    seed()
        .then(() => process.exit(0))
        .catch((err: Error) => {
            console.error('❌ Seed failed:', err);
            process.exit(1);
        });
}

export default seed;
