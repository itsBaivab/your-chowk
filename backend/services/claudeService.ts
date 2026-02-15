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
import * as broadcastQueue from './broadcastQueue';

const prisma = new PrismaClient();
const client = new Anthropic();

// ============================================
// System Prompt — Defines Claude's behavior
// ============================================
const SYSTEM_PROMPT = `You are "Your Chawk" — a WhatsApp-based labour marketplace assistant connecting contractors with daily-wage workers in India.

## YOUR ROLE
You facilitate job matching between:
- **Contractors** who need skilled workers (masons, painters, plumbers, electricians, carpenters, helpers, etc.)
- **Workers/Labourers** who need daily-wage jobs

## LANGUAGE RULES
- ALWAYS detect the user's language from their message
- Respond in the SAME language the user writes in
- Supported languages: English (en), Hindi (hi), Kannada (kn), Bengali (bn)
- When you first interact with a new user, ask their language preference
- Store their preference using the register_user tool

## ONBOARDING FLOW
When a user first contacts (lookup_user returns no user or isOnboarded=false):

1. **Ask language preference**: Present options in all 4 languages:
   "Welcome to Your Chawk! 🏗️
   Choose your language / अपनी भाषा चुनें / ನಿಮ್ಮ ಭಾಷೆ ಆಯ್ಕೆ / আপনার ভাষা নির্বাচন:
   1️⃣ English
   2️⃣ हिन्दी
   3️⃣ ಕನ್ನಡ
   4️⃣ বাংলা"

2. **Ask role**: "Are you a Contractor or a Worker/Labourer?"
3. **Collect details based on role**:
   - **Worker**: Name, City, Primary Skill
   - **Contractor**: Name, City/Company area
4. Use register_user tool to save their details with isOnboarded=true

## CONTRACTOR FLOW
When a contractor wants to post a job:
- Ask about: skill needed, number of workers, city, specific location, daily wage, duration (days), insurance provided
- Cross-question intelligently (e.g., if wage seems too low for the skill, mention market rates)
- Use post_job tool to save
- Then use search_workers tool to find matching workers in the same city
- Use send_whatsapp_message tool to notify matching workers about the job IN THEIR preferred language
  - The notification should include: job title/skill, wage, location, duration, and a prompt "Reply YES to accept"

## WORKER FLOW
When a worker wants to find jobs:
- Use get_open_jobs tool to find jobs matching their city and skill
- Present available jobs clearly with details
- When worker says "YES" or "accept", use respond_to_job to accept

## OTP ATTENDANCE
When a contractor says something about attendance/OTP:
- Use generate_otp tool → gives back a 6-digit OTP
- Tell the contractor to share this OTP with the worker physically
- When a worker sends a 6-digit number, check if it's likely an OTP and use verify_otp

## IMPORTANT RULES
- Be conversational but concise (WhatsApp messages should be short)
- Use emojis appropriately 🏗️👷‍♂️✅
- Never make up information — always use tools to get real data
- If a worker's phone number comes in format "1234567890", prepend "91" if needed
- Phone numbers in the system are in format "91XXXXXXXXXX" (country code + 10 digits)
- When the user asks something unrelated, gently redirect them to job/labour topics
- When there are no matching jobs or workers, be honest about it
`;

// ============================================
// Tool Definitions — Claude's capabilities
// ============================================
const tools = [
    // --- User Management ---
    betaZodTool({
        name: 'lookup_user',
        description: 'Look up a user by their phone number. Returns their profile details, role, onboarding status, etc. Always call this first when handling a new message to understand who you are talking to.',
        inputSchema: z.object({
            phoneNumber: z.string().describe('Phone number in format 91XXXXXXXXXX'),
        }),
        run: async (input) => {
            try {
                const user = await prisma.worker.findUnique({
                    where: { phoneNumber: input.phoneNumber },
                    include: { applications: { include: { job: true } } },
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
            skill: z.string().optional().describe('Primary skill (for workers: mason, painter, plumber, electrician, carpenter, helper, etc.)'),
            preferredLanguage: z.enum(['en', 'hi', 'kn', 'bn']).optional().describe('Preferred language code'),
            isOnboarded: z.boolean().optional().describe('Whether onboarding is complete'),
        }),
        run: async (input) => {
            try {
                const user = await prisma.worker.upsert({
                    where: { phoneNumber: input.phoneNumber },
                    update: {
                        ...(input.name && { name: input.name }),
                        ...(input.city && { city: input.city }),
                        ...(input.skill && { skill: input.skill }),
                        ...(input.preferredLanguage && { preferredLanguage: input.preferredLanguage }),
                        ...(input.role && { role: input.role }),
                        ...(input.isOnboarded !== undefined && { isOnboarded: input.isOnboarded }),
                    },
                    create: {
                        phoneNumber: input.phoneNumber,
                        role: input.role,
                        name: input.name,
                        city: input.city,
                        skill: input.skill,
                        preferredLanguage: input.preferredLanguage || 'en',
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
        description: 'Create a new job posting. Called after the contractor has provided all job details.',
        inputSchema: z.object({
            contractorPhone: z.string().describe('Contractor phone number'),
            title: z.string().optional().describe('Job title'),
            skillRequired: z.string().describe('Required skill (mason, painter, plumber, electrician, carpenter, helper, etc.)'),
            wage: z.string().describe('Daily wage amount (e.g., "800/day", "₹600")'),
            city: z.string().describe('City where work is needed'),
            location: z.string().optional().describe('Specific area/address within city'),
            workersNeeded: z.number().default(1).describe('Number of workers needed'),
            durationDays: z.number().optional().describe('Expected duration in days'),
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
                        city: input.city,
                        location: input.location,
                        workersNeeded: input.workersNeeded,
                        durationDays: input.durationDays,
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
        description: 'Get full details of a specific job including its applications.',
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
        description: 'Search for workers by city and/or skill. Used to find matching workers for a job posting.',
        inputSchema: z.object({
            city: z.string().describe('City to search in'),
            skill: z.string().optional().describe('Skill to filter by'),
        }),
        run: async (input) => {
            try {
                const workers = await prisma.worker.findMany({
                    where: {
                        role: 'worker',
                        isOnboarded: true,
                        city: { contains: input.city, mode: 'insensitive' as const },
                        ...(input.skill && { skill: { contains: input.skill, mode: 'insensitive' as const } }),
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
        description: 'Send a WhatsApp message to a specific phone number. Use this to notify workers about new jobs or send OTPs. The message should ALREADY be translated to the recipient\'s preferred language.',
        inputSchema: z.object({
            phoneNumber: z.string().describe('Recipient phone number in format 91XXXXXXXXXX'),
            message: z.string().describe('Message text to send (already translated to recipient language)'),
        }),
        run: async (input) => {
            try {
                const jid = `${input.phoneNumber}@s.whatsapp.net`;
                broadcastQueue.enqueue(jid, input.message);
                return JSON.stringify({ success: true, message: 'Message queued for delivery' });
            } catch (error) {
                logger.serviceError('tool:send_whatsapp_message', error as Error);
                return JSON.stringify({ error: 'Failed to send message' });
            }
        },
    }),

    betaZodTool({
        name: 'respond_to_job',
        description: 'Worker accepts or rejects a job. Creates or updates the application record.',
        inputSchema: z.object({
            jobId: z.string().describe('Job ID to respond to'),
            workerPhone: z.string().describe('Worker phone number'),
            action: z.enum(['accept', 'reject']).describe('Accept or reject the job'),
        }),
        run: async (input) => {
            try {
                const job = await prisma.job.findUnique({ where: { id: input.jobId } });
                if (!job) return JSON.stringify({ success: false, message: 'Job not found' });
                if (job.status !== 'OPEN') return JSON.stringify({ success: false, message: 'Job is no longer open' });

                if (input.action === 'accept') {
                    const application = await prisma.application.upsert({
                        where: { jobId_workerPhone: { jobId: input.jobId, workerPhone: input.workerPhone } },
                        update: { status: 'ACCEPTED' },
                        create: {
                            jobId: input.jobId,
                            workerPhone: input.workerPhone,
                            status: 'ACCEPTED',
                        },
                    });

                    // Check if job is now filled
                    const acceptedCount = await prisma.application.count({
                        where: { jobId: input.jobId, status: 'ACCEPTED' },
                    });
                    if (acceptedCount >= job.workersNeeded) {
                        await prisma.job.update({ where: { id: input.jobId }, data: { status: 'FILLED' } });
                    }

                    return JSON.stringify({ success: true, application, message: 'Job accepted!' });
                } else {
                    const application = await prisma.application.upsert({
                        where: { jobId_workerPhone: { jobId: input.jobId, workerPhone: input.workerPhone } },
                        update: { status: 'REJECTED' },
                        create: {
                            jobId: input.jobId,
                            workerPhone: input.workerPhone,
                            status: 'REJECTED',
                        },
                    });
                    return JSON.stringify({ success: true, application, message: 'Job rejected' });
                }
            } catch (error) {
                logger.serviceError('tool:respond_to_job', error as Error);
                return JSON.stringify({ error: 'Failed to respond to job' });
            }
        },
    }),

    // --- OTP Attendance ---
    betaZodTool({
        name: 'generate_otp',
        description: 'Generate a 6-digit OTP for attendance marking. Called by a contractor to verify a worker showed up. The OTP should be shared physically with the worker.',
        inputSchema: z.object({
            jobId: z.string().describe('Job ID for attendance'),
            workerPhone: z.string().describe('Worker phone number'),
        }),
        run: async (input) => {
            try {
                const application = await prisma.application.findUnique({
                    where: { jobId_workerPhone: { jobId: input.jobId, workerPhone: input.workerPhone } },
                });
                if (!application) return JSON.stringify({ success: false, message: 'No application found' });
                if (application.status !== 'ACCEPTED') return JSON.stringify({ success: false, message: 'Application not accepted' });

                // Generate 6-digit OTP
                const otp = Math.floor(100000 + Math.random() * 900000).toString();
                const otpExpiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

                await prisma.application.update({
                    where: { id: application.id },
                    data: { otp, otpExpiresAt },
                });

                return JSON.stringify({ success: true, otp, expiresIn: '30 minutes' });
            } catch (error) {
                logger.serviceError('tool:generate_otp', error as Error);
                return JSON.stringify({ error: 'Failed to generate OTP' });
            }
        },
    }),

    betaZodTool({
        name: 'verify_otp',
        description: 'Verify an OTP sent by a worker to mark attendance. The worker typically sends a 6-digit code.',
        inputSchema: z.object({
            workerPhone: z.string().describe('Worker phone number submitting the OTP'),
            otp: z.string().describe('6-digit OTP to verify'),
        }),
        run: async (input) => {
            try {
                const application = await prisma.application.findFirst({
                    where: {
                        workerPhone: input.workerPhone,
                        otp: input.otp,
                        status: 'ACCEPTED',
                        otpExpiresAt: { gte: new Date() },
                    },
                    include: { job: true },
                });

                if (!application) return JSON.stringify({ success: false, message: 'Invalid or expired OTP' });

                await prisma.application.update({
                    where: { id: application.id },
                    data: {
                        attendanceStatus: 'PRESENT',
                        attendanceMarkedAt: new Date(),
                        otp: null,
                        otpExpiresAt: null,
                    },
                });

                return JSON.stringify({
                    success: true,
                    message: 'Attendance marked as PRESENT',
                    jobTitle: application.job?.title || application.job?.skillRequired || 'Unknown Job',
                });
            } catch (error) {
                logger.serviceError('tool:verify_otp', error as Error);
                return JSON.stringify({ error: 'Failed to verify OTP' });
            }
        },
    }),
];

// ============================================
// Conversation History Management
// ============================================
const MAX_HISTORY_MESSAGES = 20; // Keep last 20 messages for context

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
        const contextNote = `[System context: The user's phone number is ${phoneNumber}. Use this when calling tools.]`;

        // Prepend phone context to the first user message
        const messages: Anthropic.Beta.Messages.BetaMessageParam[] = history.length > 0
            ? [
                { role: 'user' as const, content: contextNote },
                { role: 'assistant' as const, content: 'Understood. I will use this phone number when calling tools.' },
                ...history,
            ]
            : [
                { role: 'user' as const, content: contextNote },
                { role: 'assistant' as const, content: 'Understood. I will use this phone number when calling tools.' },
                { role: 'user' as const, content: messageText },
            ];

        // Call Claude with toolRunner — directly awaitable, resolves to BetaMessage
        const finalMessage = await client.beta.messages.toolRunner({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 1024,
            system: SYSTEM_PROMPT,
            messages,
            tools,
        });

        // Extract text response from the final message
        let responseText = '';

        for (const block of finalMessage.content) {
            if (block.type === 'text') {
                responseText += block.text;
            }
        }

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
