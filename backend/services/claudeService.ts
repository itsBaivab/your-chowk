// ============================================
// Claude Service — AI-powered conversation engine
// ============================================
// Uses Anthropic TypeScript SDK with tool use (betaZodTool + toolRunner)
// Each WhatsApp message → Claude processes with conversation history + tools

import Anthropic from '@anthropic-ai/sdk';
import { betaZodTool } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import logger from '../utils/logger';
import { sendMessage } from '../bot/baileysClient';
import { getJidForPhone } from '../bot/messageHandler';
import * as broadcastQueue from './broadcastQueue';

const prisma = new PrismaClient();
const client = new Anthropic();

// ============================================
// City Name Normalizer — Correct spellings
// ============================================
const CITY_MAP: Record<string, string> = {
    'bengalore': 'Bangalore', 'bengaluru': 'Bangalore', 'blr': 'Bangalore', 'banglore': 'Bangalore',
    'mumbai': 'Mumbai', 'bombay': 'Mumbai',
    'delhi': 'Delhi', 'new delhi': 'Delhi', 'dilli': 'Delhi',
    'kolkata': 'Kolkata', 'calcutta': 'Kolkata', 'kolkatta': 'Kolkata',
    'chennai': 'Chennai', 'madras': 'Chennai',
    'hyderabad': 'Hyderabad', 'hydrabad': 'Hyderabad',
    'pune': 'Pune', 'poona': 'Pune',
    'ahmedabad': 'Ahmedabad', 'amdavad': 'Ahmedabad',
    'jaipur': 'Jaipur', 'jaypur': 'Jaipur',
    'lucknow': 'Lucknow', 'lakhnau': 'Lucknow',
    'noida': 'Noida', 'noyda': 'Noida',
    'gurgaon': 'Gurugram', 'gurugram': 'Gurugram',
    'patna': 'Patna', 'bhopal': 'Bhopal', 'indore': 'Indore',
    'chandigarh': 'Chandigarh', 'surat': 'Surat', 'vadodara': 'Vadodara',
    'nagpur': 'Nagpur', 'coimbatore': 'Coimbatore', 'kochi': 'Kochi',
    'visakhapatnam': 'Visakhapatnam', 'vizag': 'Visakhapatnam',
    'mysore': 'Mysuru', 'mysuru': 'Mysuru', 'mangalore': 'Mangaluru', 'mangaluru': 'Mangaluru',
    'guwahati': 'Guwahati', 'ranchi': 'Ranchi', 'raipur': 'Raipur',
    'thiruvananthapuram': 'Thiruvananthapuram', 'trivandrum': 'Thiruvananthapuram',
};

function normalizeCity(city: string): string {
    const lower = city.trim().toLowerCase();
    return CITY_MAP[lower] || city.charAt(0).toUpperCase() + city.slice(1).toLowerCase();
}

// ============================================
// Markdown Stripper — WhatsApp plain text only
// ============================================
function stripMarkdown(text: string): string {
    return text
        .replace(/#{1,6}\s/g, '')           // headers
        .replace(/\*\*(.+?)\*\*/g, '$1')    // bold
        .replace(/\*(.+?)\*/g, '$1')        // italic
        .replace(/__(.+?)__/g, '$1')        // bold underscore
        .replace(/_(.+?)_/g, '$1')          // italic underscore
        .replace(/~~(.+?)~~/g, '$1')        // strikethrough
        .replace(/`{1,3}([^`]+)`{1,3}/g, '$1') // code
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // links
        .replace(/^[-*+]\s/gm, '• ')        // bullets → dot
        .replace(/^\d+\.\s/gm, (m) => m)    // keep numbered lists
        .trim();
}

// ============================================
// System Prompt — Defines Claude's behavior
// ============================================
const SYSTEM_PROMPT = `You are "Your Chawk" — a WhatsApp-based assistant that connects contractors with physical labourers (daily-wage construction workers) in India.

## YOUR ROLE
You help match:
- Contractors who need physical labourers (masons, painters, plumbers, electricians, carpenters, helpers, welders, bar benders, tile workers, etc.)
- Workers/Labourers who need daily-wage construction and physical labour jobs

This is ONLY for physical/construction labour. NOT for services like plumbing repairs at homes (that's Urban Company). This is for labourers who work on construction sites, building projects, painting contracts, etc.

## LANGUAGE RULES
- ALWAYS detect the user's language from their message
- Respond in the SAME language the user writes in
- Supported languages: English (en), Hindi (hi), Kannada (kn), Bengali (bn)
- When you first interact with a new user, ask their language preference
- Store their preference using the register_user tool

## FORMATTING RULES (CRITICAL)
- NEVER use markdown formatting. No **, *, #, _, ~~, backticks, or links.
- Use plain text only with emojis for emphasis.
- Use line breaks and numbered lists (1. 2. 3.) for structure.
- Keep messages short and simple — these are WhatsApp messages to labourers.

## ONBOARDING FLOW
When a user first contacts (lookup_user returns no user or isOnboarded=false):

1. Ask language preference. Present options in all 4 languages:
   "Welcome to Your Chawk! 🏗️
   Choose your language / अपनी भाषा चुनें / ನಿಮ್ಮ ಭಾಷೆ ಆಯ್ಕೆ / আপনার ভাষা নির্বাচন:
   1️⃣ English
   2️⃣ हिन्दी
   3️⃣ ಕನ್ನಡ
   4️⃣ বাংলা"

2. Ask role: "Are you a Contractor (Thekedar/ठेकेदार) or a Worker/Labourer (Mazdoor/मजदूर)?"

3. Collect details based on role:
   - Worker: Name, City, Primary Skill (mason/painter/plumber/electrician/carpenter/helper/welder/etc.), 12-digit Aadhaar card number
   - Contractor: Name, City, PAN card number, 12-digit Aadhaar card number

4. Use register_user tool to save their details with isOnboarded=true

## CONTRACTOR FLOW
When a contractor wants to post a job:
- Ask about: skill needed, number of workers, city, specific location/area, meeting point (where workers should come on day 1), daily wage, start date, end date, insurance provided (yes/no)
- Cross-question intelligently (e.g., if wage seems too low for the skill, mention market rates)
- Use post_job tool to save the job
- IMMEDIATELY after posting, use search_workers tool to find available workers in the same city with matching skill
- For EACH matching worker found, use send_whatsapp_message to notify them IN THEIR preferred language:
  "🏗️ New work available!
  Skill: [skill]
  Location: [city], [location]
  Wage: [wage]/day
  Duration: [startDate] to [endDate]
  Meeting point: [meetingPoint]
  Insurance: [yes/no]
  Reply HAAN/YES/ಹೌದು/হ্যাঁ to accept this job.
  Job ID: [jobId]"
- Tell the contractor how many workers were notified

## WORKER FLOW
When a worker wants to find jobs or replies YES/HAAN to a notification:
- If they say YES or accept, use respond_to_job tool
- This will automatically:
  1. Generate an OTP for the worker
  2. Send the OTP to the worker with instructions to share it with the contractor at the meeting point
  3. Notify the contractor that a worker has accepted

When a worker wants to browse available jobs:
- Use get_open_jobs tool to find jobs matching their city and skill
- Present available jobs clearly with all details
- Let them accept by saying YES

## OTP VERIFICATION FLOW
The flow works like this:
1. Worker accepts job → gets OTP automatically
2. Worker goes to meeting point and shares OTP with contractor verbally
3. Contractor sends the OTP to this WhatsApp bot
4. Bot verifies OTP using verify_otp tool
5. On success: contractor sees worker details (name, Aadhaar), worker is marked unavailable until job end date
6. Both parties get confirmation

## CANCELLATION
- Both workers and contractors can cancel before work starts (before CONTRACTOR_CONFIRMED status)
- Use cancel_application tool
- The other party gets notified about the cancellation

## CITY NAME NORMALIZATION
- ALWAYS normalize city names to their correct English spelling before saving.
- Examples: bengalore → Bangalore, bombay → Mumbai, calcutta → Kolkata, dilli → Delhi
- Use the proper canonical name when calling register_user or post_job.

## NOTIFICATION TRANSLATION RULES
- When notifying a contractor about a worker, translate ALL details (including worker name) to the contractor's preferred language.
- When notifying a worker about a job, translate ALL details to the worker's preferred language.
- Names should be transliterated if needed (e.g., if worker registered in Hindi, transliterate to English for an English-speaking contractor).

## IMPORTANT RULES
- Be conversational but concise (WhatsApp messages should be short)
- Use emojis appropriately 🏗️👷‍♂️✅❌
- NEVER use markdown formatting. Plain text only.
- Never make up information — always use tools to get real data
- Phone numbers in the system are in format "91XXXXXXXXXX" (country code + 10 digits)
- When the user asks something unrelated, gently redirect them to physical labour/construction topics
- When there are no matching jobs or workers, be honest about it
- Only notify workers whose availableFrom is null or in the past (they are currently available)
- Dates should be in DD/MM/YYYY format for display
- Keep your responses SHORT. Do not write long paragraphs. 2-4 lines max per message.
`;

// ============================================
// Tool Definitions — Claude's capabilities
// ============================================
const tools = [
    // --- User Management ---
    betaZodTool({
        name: 'lookup_user',
        description: 'Look up a user by their phone number. Returns their profile details, role, onboarding status, availability, etc. Always call this first when handling a new message to understand who you are talking to.',
        inputSchema: z.object({
            phoneNumber: z.string().describe('Phone number in format 91XXXXXXXXXX'),
        }),
        run: async (input) => {
            try {
                const user = await prisma.worker.findUnique({
                    where: { phoneNumber: input.phoneNumber },
                    include: { applications: { include: { job: true }, orderBy: { createdAt: 'desc' }, take: 5 } },
                });
                if (!user) return JSON.stringify({ found: false });
                return JSON.stringify({ found: true, ...user });
            } catch (error) {
                logger.serviceError('tool:lookup_user', error as Error);
                return JSON.stringify({ error: 'Failed to look up user' });
            }
        },
    }),

    betaZodTool({
        name: 'register_user',
        description: 'Register a new user or update an existing user profile. Use this during onboarding and whenever user details change.',
        inputSchema: z.object({
            phoneNumber: z.string().describe('Phone number in format 91XXXXXXXXXX'),
            role: z.enum(['worker', 'contractor']).describe('User role'),
            name: z.string().optional().describe('Full name'),
            city: z.string().optional().describe('City name'),
            skill: z.string().optional().describe('Primary skill (mason, painter, plumber, electrician, carpenter, helper, welder, bar bender, tile worker, etc.)'),
            preferredLanguage: z.enum(['en', 'hi', 'kn', 'bn']).optional().describe('Preferred language code'),
            aadhaarNumber: z.string().optional().describe('12-digit Aadhaar card number'),
            panNumber: z.string().optional().describe('PAN card number (for contractors)'),
            isOnboarded: z.boolean().optional().describe('Whether onboarding is complete'),
        }),
        run: async (input) => {
            try {
                const user = await prisma.worker.upsert({
                    where: { phoneNumber: input.phoneNumber },
                    update: {
                        ...(input.name && { name: input.name }),
                        ...(input.city && { city: normalizeCity(input.city) }),
                        ...(input.skill && { skill: input.skill }),
                        ...(input.preferredLanguage && { preferredLanguage: input.preferredLanguage }),
                        ...(input.role && { role: input.role }),
                        ...(input.aadhaarNumber && { aadhaarNumber: input.aadhaarNumber }),
                        ...(input.panNumber && { panNumber: input.panNumber }),
                        ...(input.isOnboarded !== undefined && { isOnboarded: input.isOnboarded }),
                    },
                    create: {
                        phoneNumber: input.phoneNumber,
                        role: input.role,
                        name: input.name,
                        city: input.city ? normalizeCity(input.city) : undefined,
                        skill: input.skill,
                        preferredLanguage: input.preferredLanguage || 'en',
                        aadhaarNumber: input.aadhaarNumber,
                        panNumber: input.panNumber,
                        isOnboarded: input.isOnboarded || false,
                    },
                });
                return JSON.stringify({ success: true, user });
            } catch (error) {
                logger.serviceError('tool:register_user', error as Error);
                return JSON.stringify({ error: 'Failed to register user' });
            }
        },
    }),

    // --- Job Management ---
    betaZodTool({
        name: 'post_job',
        description: 'Create a new job posting. Called after the contractor has provided all job details. After posting, you MUST search for matching workers and notify them.',
        inputSchema: z.object({
            contractorPhone: z.string().describe('Contractor phone number'),
            title: z.string().optional().describe('Job title/description'),
            skillRequired: z.string().describe('Required skill (mason, painter, plumber, electrician, carpenter, helper, welder, etc.)'),
            wage: z.string().describe('Daily wage amount (e.g., "800/day", "₹600")'),
            city: z.string().describe('City where work is needed'),
            location: z.string().optional().describe('Specific area/address within city'),
            meetingPoint: z.string().optional().describe('Where workers should meet on day 1'),
            workersNeeded: z.number().default(1).describe('Number of workers needed'),
            startDate: z.string().describe('Job start date in YYYY-MM-DD format'),
            endDate: z.string().describe('Job end date in YYYY-MM-DD format'),
            insuranceProvided: z.boolean().default(false).describe('Whether contractor provides insurance'),
        }),
        run: async (input) => {
            try {
                const job = await prisma.job.create({
                    data: {
                        contractorPhone: input.contractorPhone,
                        title: input.title,
                        skillRequired: input.skillRequired,
                        wage: input.wage,
                        city: normalizeCity(input.city),
                        location: input.location,
                        meetingPoint: input.meetingPoint,
                        workersNeeded: input.workersNeeded,
                        startDate: new Date(input.startDate),
                        endDate: new Date(input.endDate),
                        insuranceProvided: input.insuranceProvided,
                    },
                });
                return JSON.stringify({ success: true, jobId: job.id, job });
            } catch (error) {
                logger.serviceError('tool:post_job', error as Error);
                return JSON.stringify({ error: 'Failed to post job' });
            }
        },
    }),

    betaZodTool({
        name: 'get_job_details',
        description: 'Get full details of a specific job including its applications and worker info.',
        inputSchema: z.object({
            jobId: z.string().describe('Job ID'),
        }),
        run: async (input) => {
            try {
                const job = await prisma.job.findUnique({
                    where: { id: input.jobId },
                    include: { applications: { include: { worker: true } } },
                });
                if (!job) return JSON.stringify({ found: false });
                return JSON.stringify({ found: true, ...job });
            } catch (error) {
                logger.serviceError('tool:get_job_details', error as Error);
                return JSON.stringify({ error: 'Failed to get job details' });
            }
        },
    }),

    betaZodTool({
        name: 'get_open_jobs',
        description: 'Find open jobs matching a worker\'s city and/or skill. Use this when a worker asks about available jobs.',
        inputSchema: z.object({
            city: z.string().optional().describe('City to filter by'),
            skill: z.string().optional().describe('Skill to filter by'),
        }),
        run: async (input) => {
            try {
                const jobs = await prisma.job.findMany({
                    where: {
                        status: 'OPEN',
                        startDate: { gte: new Date() }, // only future/current jobs
                        ...(input.city && { city: { contains: input.city, mode: 'insensitive' as const } }),
                        ...(input.skill && { skillRequired: { contains: input.skill, mode: 'insensitive' as const } }),
                    },
                    orderBy: { createdAt: 'desc' },
                    take: 10,
                });
                return JSON.stringify({ count: jobs.length, jobs });
            } catch (error) {
                logger.serviceError('tool:get_open_jobs', error as Error);
                return JSON.stringify({ error: 'Failed to search jobs' });
            }
        },
    }),

    // --- Worker Matching & Notifications ---
    betaZodTool({
        name: 'search_workers',
        description: 'Search for AVAILABLE workers by city and/or skill. Only returns workers who are not currently busy (availableFrom is null or in the past). Used to find matching workers for a job posting.',
        inputSchema: z.object({
            city: z.string().describe('City to search in'),
            skill: z.string().optional().describe('Skill to filter by'),
        }),
        run: async (input) => {
            try {
                const now = new Date();
                const workers = await prisma.worker.findMany({
                    where: {
                        role: 'worker',
                        isOnboarded: true,
                        city: { contains: input.city, mode: 'insensitive' as const },
                        ...(input.skill && { skill: { contains: input.skill, mode: 'insensitive' as const } }),
                        OR: [
                            { availableFrom: null },
                            { availableFrom: { lte: now } },
                        ],
                    },
                    take: 50,
                });
                return JSON.stringify({ count: workers.length, workers });
            } catch (error) {
                logger.serviceError('tool:search_workers', error as Error);
                return JSON.stringify({ error: 'Failed to search workers' });
            }
        },
    }),

    betaZodTool({
        name: 'send_whatsapp_message',
        description: 'Send a WhatsApp message to a specific phone number. Use this to notify workers about new jobs, send OTPs, or send any notification. The message should ALREADY be translated to the recipient\'s preferred language. NEVER use markdown in messages.',
        inputSchema: z.object({
            phoneNumber: z.string().describe('Recipient phone number in format 91XXXXXXXXXX'),
            message: z.string().describe('Plain text message to send (no markdown, already translated)'),
        }),
        run: async (input) => {
            try {
                const jid = getJidForPhone(input.phoneNumber);
                const plainMessage = stripMarkdown(input.message);
                broadcastQueue.enqueue(jid, plainMessage);
                return JSON.stringify({ success: true, message: 'Message queued for delivery' });
            } catch (error) {
                logger.serviceError('tool:send_whatsapp_message', error as Error);
                return JSON.stringify({ error: 'Failed to send message' });
            }
        },
    }),

    betaZodTool({
        name: 'respond_to_job',
        description: 'Worker accepts a job. This will: 1) Create application with WORKER_ACCEPTED status, 2) Generate OTP and send it to the worker, 3) Notify the contractor that a worker accepted. Call this when a worker says YES/HAAN/accept.',
        inputSchema: z.object({
            jobId: z.string().describe('Job ID to respond to'),
            workerPhone: z.string().describe('Worker phone number'),
        }),
        run: async (input) => {
            try {
                const job = await prisma.job.findUnique({ where: { id: input.jobId } });
                if (!job) return JSON.stringify({ success: false, message: 'Job not found' });
                if (job.status !== 'OPEN') return JSON.stringify({ success: false, message: 'Job is no longer open' });

                const worker = await prisma.worker.findUnique({ where: { phoneNumber: input.workerPhone } });
                if (!worker) return JSON.stringify({ success: false, message: 'Worker not found' });

                // Check if worker is available
                if (worker.availableFrom && worker.availableFrom > new Date()) {
                    return JSON.stringify({ success: false, message: 'Worker is currently busy on another job until ' + worker.availableFrom.toLocaleDateString('en-IN') });
                }

                // Generate 6-digit OTP
                const otp = Math.floor(100000 + Math.random() * 900000).toString();
                const otpExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

                // Create or update application
                const application = await prisma.application.upsert({
                    where: { jobId_workerPhone: { jobId: input.jobId, workerPhone: input.workerPhone } },
                    update: { status: 'WORKER_ACCEPTED', otp, otpExpiresAt },
                    create: {
                        jobId: input.jobId,
                        workerPhone: input.workerPhone,
                        status: 'WORKER_ACCEPTED',
                        otp,
                        otpExpiresAt,
                    },
                });

                // Send OTP to worker
                const workerLang = worker.preferredLanguage || 'en';
                const otpMessages: Record<string, string> = {
                    en: `✅ You accepted the job!\n\nYour OTP is: ${otp}\n\nShare this OTP with the contractor at the meeting point: ${job.meetingPoint || job.location || job.city}\n\nThe contractor will verify this OTP to confirm your attendance.`,
                    hi: `✅ आपने काम स्वीकार किया!\n\nआपका OTP है: ${otp}\n\nयह OTP ठेकेदार को मिलने की जगह पर दें: ${job.meetingPoint || job.location || job.city}\n\nठेकेदार इस OTP से आपकी हाज़िरी पक्की करेंगे।`,
                    kn: `✅ ನೀವು ಕೆಲಸ ಒಪ್ಪಿಕೊಂಡಿದ್ದೀರಿ!\n\nನಿಮ್ಮ OTP: ${otp}\n\nಈ OTP ಅನ್ನು ಗುತ್ತಿಗೆದಾರರಿಗೆ ಭೇಟಿ ಸ್ಥಳದಲ್ಲಿ ಹಂಚಿಕೊಳ್ಳಿ: ${job.meetingPoint || job.location || job.city}`,
                    bn: `✅ আপনি কাজ গ্রহণ করেছেন!\n\nআপনার OTP: ${otp}\n\nএই OTP ঠিকাদারকে মিটিং পয়েন্টে দিন: ${job.meetingPoint || job.location || job.city}`,
                };
                const workerJid = getJidForPhone(input.workerPhone);
                broadcastQueue.enqueue(workerJid, otpMessages[workerLang] || otpMessages['en']);

                // Notify contractor
                const contractor = await prisma.worker.findUnique({ where: { phoneNumber: job.contractorPhone } });
                const contractorLang = contractor?.preferredLanguage || 'en';
                const contractorMessages: Record<string, string> = {
                    en: `👷 Worker ${worker.name || 'A worker'} has accepted your job "${job.title || job.skillRequired}"!\n\nThey will come to the meeting point: ${job.meetingPoint || job.location || job.city}\n\nAsk them for the OTP and send it here to verify their attendance.`,
                    hi: `👷 मजदूर ${worker.name || 'एक मजदूर'} ने आपका काम "${job.title || job.skillRequired}" स्वीकार किया!\n\nवे मिलने की जगह पर आएंगे: ${job.meetingPoint || job.location || job.city}\n\nउनसे OTP लें और यहाँ भेजें।`,
                    kn: `👷 ಕೆಲಸಗಾರ ${worker.name || 'ಒಬ್ಬ ಕೆಲಸಗಾರ'} ನಿಮ್ಮ ಕೆಲಸ "${job.title || job.skillRequired}" ಒಪ್ಪಿಕೊಂಡಿದ್ದಾರೆ!\n\nOTP ಕೇಳಿ ಇಲ್ಲಿ ಕಳುಹಿಸಿ.`,
                    bn: `👷 শ্রমিক ${worker.name || 'একজন শ্রমিক'} আপনার কাজ "${job.title || job.skillRequired}" গ্রহণ করেছে!\n\nতাদের কাছ থেকে OTP নিন এবং এখানে পাঠান।`,
                };
                const contractorJid = getJidForPhone(job.contractorPhone);
                broadcastQueue.enqueue(contractorJid, contractorMessages[contractorLang] || contractorMessages['en']);

                return JSON.stringify({
                    success: true,
                    application,
                    message: 'Worker accepted. OTP sent to worker, contractor notified.',
                    otp,
                });
            } catch (error) {
                logger.serviceError('tool:respond_to_job', error as Error);
                return JSON.stringify({ error: 'Failed to respond to job' });
            }
        },
    }),

    // --- OTP Verification (by Contractor) ---
    betaZodTool({
        name: 'verify_otp',
        description: 'Contractor submits an OTP received from a worker at the meeting point. On success: marks attendance, reveals worker details (name, Aadhaar), and marks worker as unavailable until job end date. Call this when a contractor sends a 6-digit number.',
        inputSchema: z.object({
            contractorPhone: z.string().describe('Contractor phone number who is verifying'),
            otp: z.string().describe('6-digit OTP received from the worker'),
        }),
        run: async (input) => {
            try {
                // Find the application with this OTP for a job owned by this contractor
                const application = await prisma.application.findFirst({
                    where: {
                        otp: input.otp,
                        status: 'WORKER_ACCEPTED',
                        otpExpiresAt: { gte: new Date() },
                        job: { contractorPhone: input.contractorPhone },
                    },
                    include: { job: true, worker: true },
                });

                if (!application) return JSON.stringify({ success: false, message: 'Invalid or expired OTP. Make sure the worker gave you the correct OTP.' });

                // Mark application as confirmed
                await prisma.application.update({
                    where: { id: application.id },
                    data: {
                        status: 'CONTRACTOR_CONFIRMED',
                        attendanceStatus: 'PRESENT',
                        attendanceMarkedAt: new Date(),
                        otp: null,
                        otpExpiresAt: null,
                    },
                });

                // Mark worker as unavailable until job end date
                await prisma.worker.update({
                    where: { phoneNumber: application.workerPhone },
                    data: { availableFrom: application.job.endDate },
                });

                // Check if job is now filled
                const confirmedCount = await prisma.application.count({
                    where: { jobId: application.jobId, status: 'CONTRACTOR_CONFIRMED' },
                });
                if (confirmedCount >= application.job.workersNeeded) {
                    await prisma.job.update({ where: { id: application.jobId }, data: { status: 'FILLED' } });
                }

                // Notify worker
                const workerLang = application.worker.preferredLanguage || 'en';
                const workerMessages: Record<string, string> = {
                    en: `✅ Attendance confirmed for "${application.job.title || application.job.skillRequired}"!\n\nWork dates: ${application.job.startDate.toLocaleDateString('en-IN')} to ${application.job.endDate.toLocaleDateString('en-IN')}\nWage: ${application.job.wage}/day`,
                    hi: `✅ हाज़िरी पक्की! "${application.job.title || application.job.skillRequired}"\n\nकाम: ${application.job.startDate.toLocaleDateString('en-IN')} से ${application.job.endDate.toLocaleDateString('en-IN')}\nमजदूरी: ${application.job.wage}/दिन`,
                    kn: `✅ ಹಾಜರಾತಿ ದೃಢೀಕರಿಸಲಾಗಿದೆ! "${application.job.title || application.job.skillRequired}"`,
                    bn: `✅ উপস্থিতি নিশ্চিত! "${application.job.title || application.job.skillRequired}"`,
                };
                const workerJid = getJidForPhone(application.workerPhone);
                broadcastQueue.enqueue(workerJid, workerMessages[workerLang] || workerMessages['en']);

                return JSON.stringify({
                    success: true,
                    message: 'OTP verified! Attendance confirmed.',
                    workerDetails: {
                        name: application.worker.name,
                        phone: application.worker.phoneNumber,
                        aadhaarNumber: application.worker.aadhaarNumber,
                        skill: application.worker.skill,
                        city: application.worker.city,
                    },
                    jobTitle: application.job.title || application.job.skillRequired,
                });
            } catch (error) {
                logger.serviceError('tool:verify_otp', error as Error);
                return JSON.stringify({ error: 'Failed to verify OTP' });
            }
        },
    }),

    // --- Cancellation ---
    betaZodTool({
        name: 'cancel_application',
        description: 'Cancel a job application. Can be used by either the worker or the contractor before work starts (before CONTRACTOR_CONFIRMED status). The other party will be notified.',
        inputSchema: z.object({
            jobId: z.string().describe('Job ID'),
            workerPhone: z.string().describe('Worker phone number'),
            cancelledBy: z.enum(['worker', 'contractor']).describe('Who is cancelling'),
        }),
        run: async (input) => {
            try {
                const application = await prisma.application.findUnique({
                    where: { jobId_workerPhone: { jobId: input.jobId, workerPhone: input.workerPhone } },
                    include: { job: true, worker: true },
                });

                if (!application) return JSON.stringify({ success: false, message: 'Application not found' });
                if (application.status === 'CONTRACTOR_CONFIRMED' || application.status === 'COMPLETED') {
                    return JSON.stringify({ success: false, message: 'Cannot cancel — work has already been confirmed or completed' });
                }

                // Update application
                await prisma.application.update({
                    where: { id: application.id },
                    data: { status: 'CANCELLED', cancelledBy: input.cancelledBy, otp: null, otpExpiresAt: null },
                });

                // Notify the other party
                if (input.cancelledBy === 'worker') {
                    // Notify contractor
                    const contractor = await prisma.worker.findUnique({ where: { phoneNumber: application.job.contractorPhone } });
                    const lang = contractor?.preferredLanguage || 'en';
                    const msgs: Record<string, string> = {
                        en: `❌ Worker ${application.worker.name || 'A worker'} cancelled for job "${application.job.title || application.job.skillRequired}".`,
                        hi: `❌ मजदूर ${application.worker.name || 'एक मजदूर'} ने काम "${application.job.title || application.job.skillRequired}" रद्द किया।`,
                        kn: `❌ ಕೆಲಸಗಾರ ${application.worker.name || 'ಒಬ್ಬ ಕೆಲಸಗಾರ'} ಕೆಲಸ ರದ್ದು ಮಾಡಿದ್ದಾರೆ.`,
                        bn: `❌ শ্রমিক ${application.worker.name || 'একজন শ্রমিক'} কাজ বাতিল করেছে।`,
                    };
                    broadcastQueue.enqueue(getJidForPhone(application.job.contractorPhone), msgs[lang] || msgs['en']);
                } else {
                    // Notify worker
                    const lang = application.worker.preferredLanguage || 'en';
                    const msgs: Record<string, string> = {
                        en: `❌ The contractor cancelled your job "${application.job.title || application.job.skillRequired}". You are now available for other jobs.`,
                        hi: `❌ ठेकेदार ने आपका काम "${application.job.title || application.job.skillRequired}" रद्द किया। अब आप दूसरे काम ले सकते हैं।`,
                        kn: `❌ ಗುತ್ತಿಗೆದಾರ ನಿಮ್ಮ ಕೆಲಸ ರದ್ದು ಮಾಡಿದ್ದಾರೆ.`,
                        bn: `❌ ঠিকাদার আপনার কাজ বাতিল করেছে।`,
                    };
                    broadcastQueue.enqueue(getJidForPhone(input.workerPhone), msgs[lang] || msgs['en']);
                }

                return JSON.stringify({ success: true, message: 'Application cancelled. Other party notified.' });
            } catch (error) {
                logger.serviceError('tool:cancel_application', error as Error);
                return JSON.stringify({ error: 'Failed to cancel application' });
            }
        },
    }),
];

// ============================================
// Conversation History Management
// ============================================
const MAX_HISTORY_MESSAGES = 30; // Keep last 30 — more causes rate limits/timeouts

async function getConversationHistory(phoneNumber: string): Promise<Anthropic.Beta.Messages.BetaMessageParam[]> {
    try {
        const history = await prisma.conversationHistory.findMany({
            where: { phoneNumber },
            orderBy: { createdAt: 'desc' },
            take: MAX_HISTORY_MESSAGES,
        });

        // Reverse to get chronological order
        history.reverse();

        return history.map((h) => ({
            role: h.role as 'user' | 'assistant',
            content: h.content,
        }));
    } catch (error) {
        logger.serviceError('getConversationHistory', error as Error);
        return [];
    }
}

async function saveToHistory(phoneNumber: string, role: 'user' | 'assistant', content: string): Promise<void> {
    try {
        await prisma.conversationHistory.create({
            data: { phoneNumber, role, content },
        });

        // Prune old messages (keep last MAX_HISTORY_MESSAGES * 2 to avoid constant pruning)
        const count = await prisma.conversationHistory.count({ where: { phoneNumber } });
        if (count > MAX_HISTORY_MESSAGES * 2) {
            const oldest = await prisma.conversationHistory.findMany({
                where: { phoneNumber },
                orderBy: { createdAt: 'asc' },
                take: count - MAX_HISTORY_MESSAGES,
                select: { id: true },
            });
            await prisma.conversationHistory.deleteMany({
                where: { id: { in: oldest.map((o) => o.id) } },
            });
        }
    } catch (error) {
        logger.serviceError('saveToHistory', error as Error);
    }
}

// ============================================
// Main Process Message Function
// ============================================
async function processMessage(phoneNumber: string, messageText: string): Promise<string> {
    logger.info({ event: 'claude_process_start', phoneNumber, textPreview: messageText.substring(0, 50) });

    try {
        // Save user message to history
        await saveToHistory(phoneNumber, 'user', messageText);

        // Load conversation history
        const history = await getConversationHistory(phoneNumber);

        // Build the prompt with context about who is messaging
        const contextNote = `[System context: The user's phone number is ${phoneNumber}. Use this when calling tools. Today's date is ${new Date().toLocaleDateString('en-IN')}.]`;

        // Prepend phone context to the first user message
        const messages: Anthropic.Beta.Messages.BetaMessageParam[] = history.length > 0
            ? [
                { role: 'user' as const, content: contextNote },
                { role: 'assistant' as const, content: 'Understood. I will use this phone number when calling tools and format dates for India.' },
                ...history,
            ]
            : [
                { role: 'user' as const, content: contextNote },
                { role: 'assistant' as const, content: 'Understood. I will use this phone number when calling tools and format dates for India.' },
                { role: 'user' as const, content: messageText },
            ];

        // Call Claude with toolRunner — with retry for rate limits
        const callClaude = async (retries = 3): Promise<Anthropic.Beta.Messages.BetaMessage> => {
            try {
                return await client.beta.messages.toolRunner({
                    model: 'claude-sonnet-4-20250514',
                    max_tokens: 1024,
                    system: SYSTEM_PROMPT,
                    messages,
                    tools,
                });
            } catch (err: any) {
                if (retries > 0 && (err?.status === 429 || err?.status === 529)) {
                    const wait = (4 - retries) * 2000; // 2s, 4s, 6s backoff
                    logger.info({ event: 'claude_retry', retries, wait });
                    await new Promise(r => setTimeout(r, wait));
                    return callClaude(retries - 1);
                }
                throw err;
            }
        };
        const finalMessage = await callClaude();

        // Extract text response from the final message
        let responseText = '';

        for (const block of finalMessage.content) {
            if (block.type === 'text') {
                responseText += block.text;
            }
        }

        // Strip any accidental markdown from Claude's response
        responseText = stripMarkdown(responseText);

        // Fallback if no text response
        if (!responseText) {
            responseText = '🤖 I processed your request. Please let me know if you need anything else!';
        }

        // Save assistant response to history
        await saveToHistory(phoneNumber, 'assistant', responseText);

        logger.info({ event: 'claude_process_done', phoneNumber, responsePreview: responseText.substring(0, 50) });
        return responseText;

    } catch (error) {
        logger.serviceError('claudeService.processMessage', error as Error);
        return '❌ Sorry, something went wrong. Please try again.';
    }
}

export { processMessage };
