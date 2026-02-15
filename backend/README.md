# Kaam Milega — WhatsApp Backend

> A WhatsApp-based platform connecting daily-wage labourers with contractors in India.  
> Built for hackathon speed with production-grade structure.

## Architecture

```
┌──────────────────────────────────────────────────────┐
│                   WhatsApp User                       │
│              (Worker / Contractor)                     │
└──────────────┬───────────────────────────────────────┘
               │  Text / Voice / Image
               ▼
┌──────────────────────────────────────────────────────┐
│              Baileys WhatsApp Client                  │
│         (bot/baileysClient.js)                        │
│  • QR Auth  • Auto-Reconnect  • Message Listener     │
└──────────────┬───────────────────────────────────────┘
               ▼
┌──────────────────────────────────────────────────────┐
│            Message Handler (Router)                   │
│         (bot/messageHandler.js)                       │
│  • Language Detection  • Voice→Text  • Intent AI     │
└──────┬──────────┬──────────┬────────────────────────┘
       ▼          ▼          ▼
┌──────────┐ ┌──────────┐ ┌───────────────┐
│  Worker  │ │   Job    │ │   Matching    │
│ Service  │ │ Service  │ │   Service     │
│ Register │ │ Post Job │ │ Match & Notify│
└──────────┘ └──────────┘ └───────────────┘
       │          │          │
       ▼          ▼          ▼
┌──────────────────────────────────────────────────────┐
│           Supabase PostgreSQL (via Prisma)            │
│   Workers │ Jobs │ Applications │ ConversationState   │
└──────────────────────────────────────────────────────┘
```

## Tech Stack

| Component       | Technology                        |
|----------------|-----------------------------------|
| Runtime        | Node.js                           |
| Web Framework  | Express                           |
| WhatsApp API   | Baileys (@whiskeysockets/baileys) |
| Database       | Supabase PostgreSQL               |
| ORM            | Prisma                            |
| AI             | Gemini API (all AI tasks)         |
| Audio Convert  | FFmpeg                            |
| Logging        | Pino                              |

## Prerequisites

- **Node.js** 18+ 
- **FFmpeg** installed and in PATH
  - Windows: `winget install ffmpeg` or download from [ffmpeg.org](https://ffmpeg.org/download.html)  
  - Mac: `brew install ffmpeg`
  - Linux: `sudo apt install ffmpeg`
- **Supabase** account with a PostgreSQL database
- **Google Gemini API key** from [Google AI Studio](https://aistudio.google.com/apikey)

## Setup Instructions

### 1. Install Dependencies

```bash
cd backend
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` and fill in:
- `DATABASE_URL` — your Supabase PostgreSQL connection string
- `GEMINI_API_KEY` — your Google Gemini API key

### 3. Setup Database (Prisma)

```bash
# Validate schema
npx prisma validate

# Generate Prisma Client
npx prisma generate

# Run migration (creates tables in Supabase)
npx prisma migrate dev --name init
```

### 4. Seed Demo Data (Optional)

```bash
npm run seed
```

This creates 5 sample workers and 2 sample jobs.

### 5. Run the Server

```bash
# Development (with hot reload)
npm run dev

# Production
npm start
```

### 6. Connect WhatsApp

1. A QR code will appear in the terminal
2. Open WhatsApp on your phone → Settings → Linked Devices → Link a Device
3. Scan the QR code
4. The bot is now connected! ✅

Session is saved to `auth_info/` — you won't need to scan again unless you log out.

## How It Works

### Worker Registration
Send **"Hi"** or **"Register"** to the bot:
1. Bot asks for your **name**
2. Bot asks for your **skill** (painter, electrician, etc.)
3. Bot asks for your **location**
4. Bot asks for **ID card photo** (optional)
5. ✅ Registration complete — you'll receive job notifications

### Contractor Job Posting
Send **"Post Job"** to the bot:
1. Bot asks for **job title**
2. Bot asks for **skill required**
3. Bot asks for **daily wage**
4. Bot asks for **location**
5. Bot asks for **number of workers needed**
6. ✅ Job posted — matching workers are notified automatically

### Job Acceptance
When a worker receives a job notification:
- Reply **"YES"** to accept
- First worker to accept gets assigned (race-condition safe)
- Contractor is notified of the assignment

### Multilingual Support
- Send messages in **Hindi**, **Bengali**, or **English**
- Voice messages in any language are transcribed and processed
- Bot replies are translated to the user's detected language

## Gemini API Integration

All AI features use the **Gemini API** — no other AI providers needed:

```javascript
// Intent Detection
const { detectIntent } = require('./services/aiService');
const result = await detectIntent("I need a painter for my house");
// → { intent: "post_job", skill: "painter" }

// Language Detection + Translation
const { detectLanguage, translateToEnglish } = require('./services/translationService');
const lang = await detectLanguage("मुझे काम चाहिए");
// → "hi"
const english = await translateToEnglish("मुझे काम चाहिए", "hi");
// → "I need work"

// ID Card OCR
const { parseIdCard } = require('./services/aiService');
const data = await parseIdCard('./id_card.jpg');
// → { name: "Rajesh Kumar", idNumber: "1234 5678 9012" }

// Voice Transcription
const { processVoiceMessage } = require('./services/voiceService');
const text = await processVoiceMessage('./voice.ogg');
// → "I am looking for painting work"
```

## API Endpoints

| Method | Endpoint           | Description                |
|--------|-------------------|----------------------------|
| GET    | `/health`         | Health check               |
| GET    | `/api/workers`    | List all workers           |
| GET    | `/api/jobs`       | List all jobs              |
| GET    | `/api/applications` | List applications        |
| POST   | `/api/seed`       | Seed demo data             |
| GET    | `/api/queue`      | Broadcast queue status     |

## Project Structure

```
backend/
├── bot/
│   ├── baileysClient.js      # WhatsApp connection & auth
│   └── messageHandler.js     # Central message router
├── services/
│   ├── aiService.js           # Gemini intent detection & OCR
│   ├── translationService.js  # Gemini language detection & translation
│   ├── voiceService.js        # FFmpeg + Gemini audio transcription
│   ├── workerService.js       # Worker registration flow
│   ├── jobService.js          # Contractor job posting flow
│   ├── matchingService.js     # Job-worker matching & acceptance
│   ├── stateService.js        # Conversation state management
│   └── broadcastQueue.js      # Throttled message broadcasting
├── prisma/
│   ├── schema.prisma          # Database models
│   ├── prismaClient.js        # Singleton Prisma client
│   └── seed.js                # Demo data seeder
├── routes/
│   └── webhookRoutes.js       # REST API endpoints
├── utils/
│   ├── logger.js              # Structured logging (Pino)
│   └── mediaHandler.js        # Media download & storage
├── server.js                  # Entry point
├── package.json
├── .env.example
└── .gitignore
```

## Debug Mode

Set `DEBUG_MODE=true` in `.env` for:
- Verbose Prisma query logging
- Detailed event logs for every message
- Service-level debug output

## License

MIT — Built for hackathon use.
