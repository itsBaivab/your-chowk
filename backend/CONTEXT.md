# 📘 Kaam Milega — Full Codebase Context

> **Last Updated:** 2026-02-15  
> **Project:** WhatsApp-based platform connecting daily-wage labourers with contractors in India  
> **Stack:** TypeScript · Node.js · Express · Baileys (WhatsApp Web) · Prisma ORM · Supabase PostgreSQL · Gemini AI · FFmpeg · Pino Logger  
> **Runtime:** tsx (TypeScript execution) · tsc (type checking & build)

---

## 📐 High-Level Architecture

```
┌──────────────────────────────────────────────────────┐
│                   WhatsApp User                       │
│              (Worker / Contractor)                     │
│        Sends: Text / Voice / Image messages           │
└──────────────┬───────────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────────┐
│        Baileys WhatsApp Client (bot/baileysClient.ts) │
│  • QR-based auth  • Auto-reconnect  • Msg listener   │
└──────────────┬───────────────────────────────────────┘
               │ Delegates to handleMessage()
               ▼
┌──────────────────────────────────────────────────────┐
│       Message Handler / Router (bot/messageHandler.ts)│
│  • Language detect → Translate to English             │
│  • Voice → STT  • Image → ID OCR                     │
│  • Intent detection (Gemini AI)                       │
│  • Routes to correct service based on intent/state    │
└──────┬──────────┬──────────┬──────────┬──────────────┘
       │          │          │          │
       ▼          ▼          ▼          ▼
┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐
│ Worker   │ │ Job      │ │ Matching │ │  State       │
│ Service  │ │ Service  │ │ Service  │ │  Service     │
│ Register │ │ Post Job │ │ Match &  │ │  Track multi │
│ workers  │ │ by       │ │ Notify   │ │  step flows  │
│          │ │ contrctr │ │ workers  │ │              │
└────┬─────┘ └────┬─────┘ └────┬─────┘ └──────────────┘
     │            │            │
     ▼            ▼            ▼
┌──────────────────────────────────────────────────────┐
│         Supabase PostgreSQL (via Prisma ORM)          │
│  Tables: workers │ jobs │ applications │ conv_states  │
└──────────────────────────────────────────────────────┘
```

### Supporting Services (cross-cutting)

| Service | Role |
|---------|------|
| `aiService.ts` | Gemini-powered intent detection & ID card OCR |
| `translationService.ts` | Gemini-powered language detection & translation (hi/bn/en) |
| `voiceService.ts` | FFmpeg audio conversion (OGG→WAV) + Gemini audio transcription |
| `broadcastQueue.ts` | Throttled message sending (2s delay) to avoid WhatsApp spam detection |
| `logger.ts` | Structured Pino logging with convenience helpers |
| `mediaHandler.ts` | Media download/save/upload utilities for Baileys |

---

## 📂 Project Structure & File Map

```
kaam-milega/
├── CONTEXT.md                ← YOU ARE HERE
├── Readme.md                 ← Root readme (placeholder)
│
└── backend/
    ├── server.ts             ← Entry point: Express + Baileys startup
    ├── package.json          ← Dependencies & scripts
    ├── tsconfig.json         ← TypeScript configuration
    ├── nodemon.json          ← Dev watcher config
    ├── .env                  ← Environment variables (git-ignored)
    ├── .env.example          ← Template for env vars
    ├── .gitignore            ← Ignores: node_modules, .env, auth_info, media_downloads, *.log, dist/
    │
    ├── bot/                  ← WhatsApp bot core
    │   ├── baileysClient.ts  ← WhatsApp Web socket connection & messaging
    │   └── messageHandler.ts ← Central message router & processor
    │
    ├── services/             ← Business logic layer
    │   ├── aiService.ts          ← Gemini intent detection & ID card OCR
    │   ├── translationService.ts ← Gemini language detect & translate
    │   ├── voiceService.ts       ← FFmpeg + Gemini voice transcription
    │   ├── workerService.ts      ← Worker registration multi-step flow
    │   ├── jobService.ts         ← Contractor job posting multi-step flow
    │   ├── matchingService.ts    ← Job↔Worker matching, notifications, acceptance
    │   ├── stateService.ts       ← Conversation state CRUD (multi-step flows)
    │   └── broadcastQueue.ts     ← Throttled WhatsApp message queue
    │
    ├── prisma/               ← Database layer
    │   ├── schema.prisma     ← Data models: Worker, Job, Application, ConversationState
    │   ├── prismaClient.ts   ← Singleton Prisma client instance
    │   └── seed.ts           ← Demo data seeder (5 workers, 2 jobs)
    │
    ├── routes/               ← HTTP API layer
    │   └── webhookRoutes.ts  ← REST endpoints for debugging/demo
    │
    └── utils/                ← Shared utilities
        ├── logger.ts         ← Pino structured logger + helpers
        └── mediaHandler.ts   ← Media download, save, upload (Baileys v6 API)
```

---

## 🗄️ Database Schema (Prisma)

**Database:** Supabase PostgreSQL  
**ORM:** Prisma v6.3.0  
**Schema file:** `backend/prisma/schema.prisma`

### Tables

#### `workers` — Registered users (both workers & contractors)

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PK, auto-generated | Unique ID |
| `phoneNumber` | String | **UNIQUE** | WhatsApp phone (e.g. `919876543210`) |
| `name` | String? | nullable | User's name |
| `skill` | String? | nullable | Primary skill (e.g. `painter`) |
| `location` | String? | nullable | Work area (e.g. `Andheri, Mumbai`) |
| `preferredLanguage` | String | default `"en"` | Language code: `hi`, `bn`, `en` |
| `idImageUrl` | String? | nullable | Path/URL to uploaded ID card image |
| `role` | String | default `"worker"` | `"worker"` or `"contractor"` |
| `createdAt` | DateTime | auto | Creation timestamp |

**Relations:** `applications` → has many `Application`

#### `jobs` — Posted by contractors

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PK | Unique ID |
| `contractorPhone` | String | required | Contractor's phone number |
| `title` | String? | nullable | Job title (e.g. `House Painting`) |
| `skillRequired` | String | required | Skill needed (e.g. `painter`) |
| `wage` | String | required | Daily wage (e.g. `₹700/day`) |
| `location` | String | required | Job location |
| `workersNeeded` | Int | default `1` | How many workers needed |
| `status` | String | default `"OPEN"` | `"OPEN"`, `"FILLED"`, `"CANCELLED"` |
| `createdAt` | DateTime | auto | Creation timestamp |

**Relations:** `applications` → has many `Application`

#### `applications` — Workers applying to jobs

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PK | Unique ID |
| `jobId` | String | FK → `jobs.id` | The job applied for |
| `workerPhone` | String | FK → `workers.phoneNumber` | The applying worker |
| `status` | String | default `"PENDING"` | `"PENDING"`, `"ACCEPTED"`, `"REJECTED"` |
| `createdAt` | DateTime | auto | Creation timestamp |

**Unique constraint:** `(jobId, workerPhone)` — prevents duplicate applications

#### `conversation_states` — Multi-step flow tracker

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `phoneNumber` | String | **PK, UNIQUE** | User's phone number |
| `currentStep` | String | required | e.g. `awaiting_name`, `awaiting_skill` |
| `contextData` | JSON | default `{}` | Partial form data being collected |
| `role` | String | default `"worker"` | `"worker"` or `"contractor"` |
| `updatedAt` | DateTime | auto-updated | Last state change |

---

## 🔀 Message Processing Pipeline

Every incoming WhatsApp message follows this flow:

```
1. Baileys receives message → filters out: fromMe, status@broadcast, no content
                                    │
2. messageHandler.handleMessage(sock, message)
                                    │
3. Determine message type:
   ├─ conversation / extendedTextMessage → extract text
   ├─ audioMessage (voice) → download → FFmpeg OGG→WAV → Gemini transcribe → text
   ├─ imageMessage → check if awaiting_id_image state → OCR via Gemini Vision
   └─ other → skip (unsupported)
                                    │
4. Detect language (Gemini) → translate to English (if non-English)
                                    │
5. Check ConversationState for this phone number
   ├─ HAS STATE → route to handleStatefulMessage():
   │   ├─ awaiting_name/skill/location/id_image → workerService.handleRegistration()
   │   └─ awaiting_job_*/wage/workers_needed → jobService.handleJobPosting()
   │
   └─ NO STATE → detect intent via Gemini AI:
       ├─ "greeting" / "register" → workerService.handleRegistration() (starts flow)
       ├─ "post_job" → jobService.handleJobPosting() (starts flow)
       ├─ "accept_job" → matchingService.findRecentJobForWorker() + acceptJob()
       ├─ "job_search" → handleJobSearch() (queries DB)
       └─ "unknown" → send welcome/help message
                                    │
6. Translate reply back to user's language (if non-English)
                                    │
7. Send reply via baileysClient.sendMessage()
```

---

## 🤖 AI Integrations (All Gemini 2.0 Flash)

All AI features use **Google Gemini API** (`gemini-2.0-flash` model). No other AI providers.

### 1. Intent Detection (`aiService.ts → detectIntent()`)
- **Input:** User message text (English)
- **Output:** `{ intent, skill }` — JSON
- **Intents:** `register`, `job_search`, `post_job`, `accept_job`, `greeting`, `unknown`
- **Skill extraction:** e.g. `"painter"`, `"electrician"`, or `null`

### 2. ID Card OCR (`aiService.ts → parseIdCard()`)
- **Input:** Image file path (Aadhaar/PAN/Voter ID)
- **Output:** `{ name, idNumber, rawText }` — JSON
- Uses Gemini Vision (same `gemini-2.0-flash` model) with base64-encoded image

### 3. Language Detection (`translationService.ts → detectLanguage()`)
- **Input:** Any text (could be Hindi, Bengali, English, or Romanized)
- **Output:** Language code: `"hi"`, `"bn"`, or `"en"`
- Handles Romanized Hindi/Bengali (e.g. "mujhe kaam chahiye" → `"hi"`)

### 4. Translation (`translationService.ts`)
- `translateToEnglish(text, sourceLang)` — Any supported lang → English
- `translateFromEnglish(text, targetLang)` — English → Hindi/Bengali
- Keeps translations "simple, conversational, and easy to understand for daily-wage workers"

### 5. Voice Transcription (`voiceService.ts → processVoiceMessage()`)
- **Pipeline:** OGG/Opus → FFmpeg → WAV (mono, 16kHz) → Gemini audio transcription
- Supports Hindi, Bengali, and English audio
- WAV file is cleaned up after transcription

---

## 👷 Worker Registration Flow

**Service:** `workerService.ts`  
**Steps saved in:** `ConversationState` table  
**Trigger:** User sends "Hi", "Hello", "Register", or any greeting

```
Step 0: start           → Ask for name              → state: awaiting_name
Step 1: awaiting_name   → Ask for skill             → state: awaiting_skill
Step 2: awaiting_skill  → Ask for location           → state: awaiting_location
Step 3: awaiting_location → Ask for ID image (optional) → state: awaiting_id_image
Step 4: awaiting_id_image →
   ├─ User sends image → OCR via Gemini → save to DB → ✅ Complete
   ├─ User types "skip"/"no" → save without image → ✅ Complete
   └─ User sends text → re-prompt for image or "skip"
```

**On completion:** `Worker` upserted in DB → `ConversationState` cleared  
**Common skills:** painter, electrician, plumber, carpenter, mason, welder, driver, cleaner, helper, labourer, cook, security guard, gardener

---

## 📝 Contractor Job Posting Flow

**Service:** `jobService.ts`  
**Steps saved in:** `ConversationState` table  
**Trigger:** User sends "Post job", "Hire workers", etc. (intent: `post_job`)

```
Step 0: start_job                → Ask for job title      → state: awaiting_job_title
Step 1: awaiting_job_title       → Ask for skill required → state: awaiting_skill_required
Step 2: awaiting_skill_required  → Ask for wage           → state: awaiting_wage
Step 3: awaiting_wage            → Ask for location       → state: awaiting_job_location
Step 4: awaiting_job_location    → Ask for workers needed → state: awaiting_workers_needed
Step 5: awaiting_workers_needed  → Create job             → ✅ Complete
```

**On completion:**
1. Contractor upserted in `workers` table (role: `contractor`)
2. `Job` created in DB
3. `ConversationState` cleared
4. `matchingService.matchAndNotify()` triggered **in background** (non-blocking)

---

## 🔗 Job Matching & Acceptance

**Service:** `matchingService.ts`

### Matching Logic (`matchAndNotify()`)
1. **Primary match:** Workers where `skill CONTAINS job.skillRequired` (case-insensitive) AND `location CONTAINS first part of job.location`
2. **Fallback:** If no location match, match by skill only
3. **No matches:** Notify contractor "No workers found"
4. **Notifications:** Each matching worker receives a translated job notification via `broadcastQueue`

### Job Acceptance (`acceptJob()`)
- Uses **Prisma `$transaction()`** for race-condition safety
- Supports **partial Job ID matching** (first 8 chars from notification)
- Steps inside transaction:
  1. Re-check job status (still OPEN?)
  2. Check duplicate application
  3. Create `Application` with status `ACCEPTED`
  4. Decrement `workersNeeded`; set status `FILLED` if reaches 0
- Notifies contractor of each acceptance
- Notifies when all positions filled

### Finding Recent Job (`findRecentJobForWorker()`)
- Used when worker replies "YES" without specifying a job ID
- Finds most recent OPEN job matching the worker's skill

---

## 🌐 REST API Endpoints

**Router:** `routes/webhookRoutes.ts`  
**Base URL:** `http://localhost:3000`

| Method | Endpoint | Description | Response |
|--------|----------|-------------|----------|
| `GET` | `/health` | Health check | `{ status, service, timestamp }` |
| `GET` | `/api/workers` | List all workers (newest first) | `{ count, workers[] }` |
| `GET` | `/api/jobs` | List all jobs with applications | `{ count, jobs[] }` |
| `GET` | `/api/applications` | List all applications with job & worker | `{ count, applications[] }` |
| `POST` | `/api/seed` | Seed demo data (5 workers, 2 jobs) | `{ status, message }` |
| `GET` | `/api/queue` | Broadcast queue status | `{ queueLength, isProcessing }` |

---

## 📨 Broadcast Queue

**Service:** `broadcastQueue.ts`

- **Purpose:** Prevents WhatsApp spam detection/rate-limiting
- **Mechanism:** In-memory FIFO queue, processes one message at a time
- **Delay:** 2 seconds between messages (`MESSAGE_DELAY_MS = 2000`)
- **Init:** `broadcastQueue.init(sendMessage)` — called once at startup with `baileysClient.sendMessage`
- **API:** `enqueue(jid, text)`, `broadcast(jids, text)`, `getStatus()`

---

## 📱 Baileys WhatsApp Client

**File:** `bot/baileysClient.ts`

### Connection Setup
- Uses `makeWASocket` from `@whiskeysockets/baileys` v6
- Auth state persisted to `backend/auth_info/` directory (multi-file auth)
- Uses `makeCacheableSignalKeyStore` for signal key caching
- Baileys internal logger silenced (`pino({ level: 'silent' })`)

### Event Handling (via `sock.ev.process()`)
1. **`connection.update`**
   - QR code → displayed in terminal via `qrcode-terminal`
   - Connection closed → auto-reconnect after 3s (unless logged out)
   - Connection open → log success
2. **`creds.update`** → save credentials
3. **`messages.upsert`** → filter (only `notify` type, not fromMe, not status@broadcast) → call `onMessage(sock, message)`

### Exports
- `connectToWhatsApp(onMessage)` — Initialize and connect
- `sendMessage(jid, text)` — Send a text message
- `getSocket()` — Get current socket reference

---

## 🗂️ Conversation State Management

**Service:** `stateService.ts`

- `getState(phoneNumber)` → returns `{ currentStep, contextData, role }` or `null`
- `setState(phoneNumber, currentStep, contextData, role)` → upsert in DB
- `clearState(phoneNumber)` → delete from DB (flow completed/cancelled)

The `contextData` JSON stores partial form data being collected during multi-step flows:
- **Worker registration context:** `{ name, skill, location, preferredLanguage, idImageUrl }`
- **Job posting context:** `{ title, skillRequired, wage, location, workersNeeded }`

---

## 📁 Media Handling

**File:** `utils/mediaHandler.ts`

- **`downloadMedia(message, sock)`** — Downloads media from Baileys message using `downloadMediaMessage` with `reuploadRequest` support
- **`saveMediaToFile(buffer, ext)`** — Saves to `backend/media_downloads/` with unique timestamped filename
- **`uploadToStorage(filePath)`** — Mock for hackathon (returns local path). In production: S3/Cloudinary/Supabase Storage
- **`getExtensionFromMime(mimetype)`** — MIME → extension (handles WhatsApp-specific types like `audio/ogg; codecs=opus`)

**Media directory:** `backend/media_downloads/` (auto-created, git-ignored)

---

## 📊 Logging

**File:** `utils/logger.ts`

- **Library:** Pino (structured JSON logging)
- **Level:** `debug` when `DEBUG_MODE=true`, otherwise `info`
- **Output:** stdout
- **Convenience helpers:**
  - `logger.incomingMessage(phone, type, text)`
  - `logger.jobCreated(jobId, phone, skill, location)`
  - `logger.workerAssigned(phone, jobId)`
  - `logger.broadcastSent(count, jobId)`
  - `logger.serviceError(service, error)` — includes stack trace

---

## ⚙️ Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | ✅ | Supabase PostgreSQL connection string |
| `GEMINI_API_KEY` | ✅ | Google Gemini API key (for all AI features) |
| `PORT` | ❌ | Server port (default: `3000`) |
| `DEBUG_MODE` | ❌ | `"true"` for verbose logging (default: `"false"`) |

---

## 📦 Dependencies

### Production
| Package | Version | Purpose |
|---------|---------|---------|
| `@google/generative-ai` | ^0.21.0 | Gemini AI SDK (intent, translation, OCR, STT) |
| `@hapi/boom` | ^10.0.1 | HTTP error utilities (used by Baileys) |
| `@prisma/client` | ^6.3.0 | Database ORM client |
| `@whiskeysockets/baileys` | ^6.7.9 | WhatsApp Web API (unofficial) |
| `dotenv` | ^16.4.7 | Environment variable loading |
| `express` | ^4.21.2 | HTTP server framework |
| `fluent-ffmpeg` | ^2.1.3 | FFmpeg wrapper for audio conversion |
| `mime-types` | ^2.1.35 | MIME type detection |
| `pino` | ^9.6.0 | Structured logging |
| `qrcode-terminal` | ^0.12.0 | QR code display for WhatsApp auth |
| `tsx` | ^4.19.2 | TypeScript execution for Node.js |

### Development
| Package | Version | Purpose |
|---------|---------|---------|
| `@types/express` | ^5.0.0 | TypeScript types for Express |
| `@types/fluent-ffmpeg` | ^2.1.27 | TypeScript types for fluent-ffmpeg |
| `@types/mime-types` | ^2.1.4 | TypeScript types for mime-types |
| `@types/node` | ^22.10.5 | TypeScript types for Node.js |
| `nodemon` | ^3.1.9 | Auto-restart on file changes |
| `prisma` | ^6.3.0 | Database migration & schema tool |
| `typescript` | ^5.7.3 | TypeScript compiler |

### System Requirements
- **Node.js** 18+
- **FFmpeg** installed and in PATH
- **Supabase** PostgreSQL database

---

## 🚀 NPM Scripts

| Script | Command | Description |
|--------|---------|-------------|
| `npm start` | `node dist/server.js` | Start in production mode (from compiled JS) |
| `npm run dev` | `nodemon` | Start with hot reload (tsx execution) |
| `npm run build` | `tsc` | Compile TypeScript to JavaScript |
| `npm run seed` | `tsx prisma/seed.ts` | Seed demo data |
| `npm run prisma:generate` | `npx prisma generate` | Generate Prisma client |
| `npm run prisma:migrate` | `npx prisma migrate dev --name init` | Run DB migrations |
| `npm run prisma:validate` | `npx prisma validate` | Validate schema |

---

## 🧩 Module Dependency Graph

```
server.ts
├── utils/logger.ts
├── bot/baileysClient.ts
│   ├── @whiskeysockets/baileys
│   ├── @hapi/boom
│   ├── qrcode-terminal
│   └── utils/logger.ts
├── bot/messageHandler.ts
│   ├── bot/baileysClient.ts (sendMessage)
│   ├── services/workerService.ts
│   │   ├── prisma/prismaClient.ts
│   │   ├── services/stateService.ts
│   │   ├── services/translationService.ts
│   │   ├── services/aiService.ts (parseIdCard)
│   │   └── utils/mediaHandler.ts
│   ├── services/jobService.ts
│   │   ├── prisma/prismaClient.ts
│   │   ├── services/stateService.ts
│   │   └── services/matchingService.ts
│   ├── services/matchingService.ts
│   │   ├── prisma/prismaClient.ts
│   │   ├── services/broadcastQueue.ts
│   │   └── services/translationService.ts
│   ├── services/stateService.ts
│   │   └── prisma/prismaClient.ts
│   ├── services/translationService.ts
│   │   └── @google/generative-ai
│   ├── services/aiService.ts
│   │   └── @google/generative-ai
│   ├── services/voiceService.ts
│   │   ├── fluent-ffmpeg
│   │   └── @google/generative-ai
│   └── utils/mediaHandler.ts
│       └── @whiskeysockets/baileys
├── services/broadcastQueue.ts
│   └── utils/logger.ts
└── routes/webhookRoutes.ts
    ├── prisma/prismaClient.ts
    └── utils/logger.ts
```

---

## 🌍 Multilingual Support

- **Supported languages:** Hindi (`hi`), Bengali (`bn`), English (`en`)
- **Flow:**
  1. Every incoming message → `detectLanguage()` via Gemini
  2. Non-English → `translateToEnglish()` before processing
  3. Reply generated in English
  4. Reply → `translateFromEnglish()` to user's detected language
- **Romanized input handled:** e.g. "mujhe kaam chahiye" detected as Hindi
- **Worker preference saved:** `preferredLanguage` field in DB

---

## 🌱 Seed Data

**File:** `prisma/seed.ts`  
**Run:** `npm run seed` or `POST /api/seed`

### Demo Workers (5)
| Phone | Name | Skill | Location | Language |
|-------|------|-------|----------|----------|
| 919876543210 | Rajesh Kumar | painter | Andheri, Mumbai | hi |
| 919876543211 | Amit Das | electrician | Salt Lake, Kolkata | bn |
| 919876543212 | Suresh Yadav | plumber | Sector 62, Noida | hi |
| 919876543213 | Manoj Singh | carpenter | Lajpat Nagar, Delhi | hi |
| 919876543214 | Bikram Roy | mason | Howrah, Kolkata | bn |

### Demo Jobs (2)
| Title | Skill | Wage | Location | Workers |
|-------|-------|------|----------|---------|
| House Painting — 3BHK Flat | painter | ₹700/day | Andheri West, Mumbai | 2 |
| Electrical Wiring — New Office | electrician | ₹800/day | Salt Lake, Kolkata | 1 |

---

## 🔧 Config Files

### `nodemon.json`
- **Watches:** `bot/`, `services/`, `routes/`, `utils/`, `prisma/prismaClient.ts`, `server.ts`
- **Ignores:** `auth_info/`, `media_downloads/`, `*.log`, `dist/`
- **Extensions:** `.ts`, `.json`
- **Exec:** `tsx` (TypeScript execution)

### `.gitignore`
- `node_modules/`, `.env`, `auth_info/`, `media_downloads/`, `*.log`, `dist/`

### `tsconfig.json`
- **Target:** ES2020
- **Module:** CommonJS
- **Strict mode:** Enabled
- **Output directory:** `dist/`
- **Include:** All `.ts` files in project
- **Exclude:** `node_modules/`, `dist/`

---

## ⚠️ Known Limitations & Design Decisions

1. **Hackathon scope:** `uploadToStorage()` returns local file path (mock). Production needs S3/Cloudinary/Supabase Storage
2. **Broadcast queue is in-memory:** Messages lost on server restart. Production needs Redis/BullMQ
3. **No auth on REST API:** All endpoints are public. Production needs API keys or JWT
4. **Single WhatsApp session:** One device linked at a time via Baileys QR auth
5. **ConversationState uses phone as PK:** Each user can only be in one flow at a time
6. **matching by location uses first part of comma-separated string:** e.g. "Andheri West, Mumbai" → matches on "Andheri West"
7. **Job acceptance is race-condition safe:** Uses Prisma `$transaction()` with re-check inside transaction
8. **Wage stored as string:** Allows flexible formats (`₹700/day`, `800`, etc.) but no numeric comparison
9. **Translation on every message:** Each message incurs 2+ Gemini API calls (detect + translate + translate reply). Consider caching for production
