// ============================================
// Job Service — Contractor Job Posting Flow
// ============================================
// Handles step-by-step job creation via WhatsApp
// Steps: post_job → awaiting_job_title → awaiting_skill_required → awaiting_wage
//        → awaiting_job_location → awaiting_workers_needed → job_posted

import { ConversationState } from '@prisma/client';
import prisma from '../prisma/prismaClient';
import * as stateService from './stateService';
import * as matchingService from './matchingService';
import logger from '../utils/logger';

import type makeWASocket from '@whiskeysockets/baileys';
type WASocket = ReturnType<typeof makeWASocket>;

/**
 * Handle a contractor job posting message based on current state.
 */
async function handleJobPosting(
    sock: WASocket,
    phoneNumber: string,
    text: string,
    state: ConversationState | null
): Promise<string> {
    const currentStep = state?.currentStep || 'start_job';
    const context = ((state?.contextData as Record<string, any>) || {}) as Record<string, any>;

    switch (currentStep) {
        // ----- Step 0: Start job posting -----
        case 'start_job': {
            await stateService.setState(phoneNumber, 'awaiting_job_title', context, 'contractor');
            return '📝 Let\'s post a new job!\n\nWhat is the job title?\n(e.g., "House Painting Work", "Electrical Wiring")';
        }

        // ----- Step 1: Collect job title -----
        case 'awaiting_job_title': {
            const title = text.trim();
            if (title.length < 3) {
                return 'Please enter a valid job title (at least 3 characters).';
            }

            context.title = title;
            await stateService.setState(phoneNumber, 'awaiting_skill_required', context, 'contractor');
            return `Got it: "${title}"\n\n🔧 What skill is required for this job?\n(e.g., painter, electrician, plumber, carpenter, mason)`;
        }

        // ----- Step 2: Collect skill required -----
        case 'awaiting_skill_required': {
            const skill = text.trim().toLowerCase();
            if (skill.length < 2) {
                return 'Please enter a valid skill (e.g., painter, electrician).';
            }

            context.skillRequired = skill;
            await stateService.setState(phoneNumber, 'awaiting_wage', context, 'contractor');
            return '💰 What is the daily wage for this job?\n(e.g., "500", "800/day", "₹600")';
        }

        // ----- Step 3: Collect wage -----
        case 'awaiting_wage': {
            const wage = text.trim();
            if (wage.length < 1) {
                return 'Please enter the wage amount.';
            }

            context.wage = wage;
            await stateService.setState(phoneNumber, 'awaiting_job_location', context, 'contractor');
            return '📍 Where is the job location?\n(e.g., "Andheri West, Mumbai" or "Sector 18, Noida")';
        }

        // ----- Step 4: Collect location -----
        case 'awaiting_job_location': {
            const location = text.trim();
            if (location.length < 2) {
                return 'Please enter a valid location.';
            }

            context.location = location;
            await stateService.setState(phoneNumber, 'awaiting_workers_needed', context, 'contractor');
            return '👷 How many workers do you need?\n(Enter a number, e.g., 1, 2, 5)';
        }

        // ----- Step 5: Collect workers needed -----
        case 'awaiting_workers_needed': {
            const count = parseInt(text.trim(), 10);
            if (isNaN(count) || count < 1 || count > 100) {
                return 'Please enter a valid number of workers (1-100).';
            }

            context.workersNeeded = count;

            // Create the job
            return await createJob(sock, phoneNumber, context);
        }

        default: {
            return 'Something went wrong. Type "post job" to start over.';
        }
    }
}

/**
 * Create the job in the database and trigger worker matching.
 */
async function createJob(
    sock: WASocket,
    phoneNumber: string,
    context: Record<string, any>
): Promise<string> {
    try {
        const cleanPhone = phoneNumber.replace('@s.whatsapp.net', '');

        // Ensure contractor exists in workers table
        await prisma.worker.upsert({
            where: { phoneNumber: cleanPhone },
            update: { role: 'contractor' },
            create: {
                phoneNumber: cleanPhone,
                name: 'Contractor',
                role: 'contractor',
            },
        });

        // Create job in database
        const job = await prisma.job.create({
            data: {
                contractorPhone: cleanPhone,
                title: context.title,
                skillRequired: context.skillRequired,
                wage: context.wage,
                location: context.location,
                workersNeeded: context.workersNeeded,
                status: 'OPEN',
            },
        });

        // Clear conversation state
        await stateService.clearState(phoneNumber);

        logger.jobCreated(job.id, cleanPhone, context.skillRequired, context.location);

        // Trigger worker matching in background (don't block response)
        matchingService.matchAndNotify(sock, job).catch((err: Error) => {
            logger.serviceError('jobService.matchAndNotify', err);
        });

        return `✅ Job posted successfully!\n\n📋 Job Details:\n• Title: ${context.title}\n• Skill: ${context.skillRequired}\n• Wage: ${context.wage}\n• Location: ${context.location}\n• Workers needed: ${context.workersNeeded}\n\n🔔 Notifying matching workers now...`;
    } catch (error) {
        logger.serviceError('jobService.createJob', error as Error);
        return 'Sorry, there was an error posting the job. Please try again by typing "post job".';
    }
}

export {
    handleJobPosting,
};
