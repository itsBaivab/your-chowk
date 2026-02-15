# Your Chowk — Digital Labour Marketplace

> A WhatsApp-based platform connecting daily-wage labourers with contractors in India  
> Built with **WhatsApp Baileys**, **Claude AI**, **Prisma ORM**, **Next.js**, and **Supabase PostgreSQL**

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Node.js](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)

---

## 🎯 Problem Statement

In many Indian cities, contractors hire daily-wage labourers from physical "labour chawks" (gathering points). This system faces several challenges:

- **Unorganized system** — No digital records or tracking
- **No identity verification** — Safety concerns for both parties
- **Unreliable workers** — Workers may not show up as agreed
- **Time waste** — Contractors spend hours every morning finding workers
- **Language barriers** — Diverse workforce speaks different languages

The current system is offline, messy, and inefficient.

---

## 💡 Our Solution

**Your Chowk** digitizes the labour marketplace entirely through **WhatsApp** — the most widely used platform in India. Key features include:

- 🔹 **WhatsApp-First Design** — No app downloads needed, works on any phone
- 🔹 **AI-Powered Conversations** — Claude AI handles natural language in Hindi, Bengali, and English
- 🔹 **Smart Matching** — Automatic worker-job matching based on skill and location
- 🔹 **OTP Attendance** — Secure attendance verification system
- 🔹 **Admin Dashboard** — Real-time monitoring and management
- 🔹 **Multi-language Support** — Seamless translation for diverse workforce

---

## 🏗️ Architecture

```
┌──────────────────────────────────────────────────────────┐
│                    WhatsApp Users                         │
│           (Workers & Contractors)                          │
└──────────────┬───────────────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────────────┐
│          Baileys WhatsApp Client                          │
│     QR Auth • Auto-Reconnect • Message Handling          │
└──────────────┬───────────────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────────────┐
│              Claude AI Agent                              │
│   Intent Detection • Language Translation • OCR • STT    │
└──────────────┬───────────────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────────────┐
│           Business Logic Services                         │
│   Worker Registration • Job Posting • Matching           │
└──────────────┬───────────────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────────────┐
│         Supabase PostgreSQL (via Prisma)                 │
│   Workers • Jobs • Applications • Conversations          │
└──────────────────────────────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────────────┐
│            Next.js Admin Dashboard                        │
│   Stats • User Management • Job Tracking • Attendance    │
└──────────────────────────────────────────────────────────┘
```

---

## 🚀 Tech Stack

| Component       | Technology                        |
|----------------|-----------------------------------|
| **Runtime**    | Node.js 18+                       |
| **Language**   | TypeScript 5.7                    |
| **Backend**    | Express.js                        |
| **WhatsApp**   | Baileys (@whiskeysockets/baileys) |
| **Database**   | Supabase PostgreSQL               |
| **ORM**        | Prisma 6.3                        |
| **AI**         | Claude AI (Anthropic)             |
| **Frontend**   | Next.js 16 + React 19             |
| **Styling**    | Tailwind CSS 4                    |
| **Audio**      | FFmpeg (voice transcription)      |
| **Logging**    | Pino                              |

---

## 📁 Project Structure

```
your-chowk/
├── backend/                 # WhatsApp bot & API server
│   ├── bot/                # Baileys client & message handler
│   ├── services/           # Business logic (worker, job, matching, AI)
│   ├── routes/             # REST API endpoints
│   ├── prisma/             # Database schema & client
│   ├── utils/              # Logger, media handler
│   └── server.ts           # Entry point
│
├── admin/                   # Next.js admin dashboard
│   ├── src/app/            # App router pages
│   │   ├── dashboard/      # Dashboard pages (stats, users, jobs, attendance)
│   │   └── components/     # Reusable components
│   └── public/             # Static assets
│
├── prd.md                   # Product requirements document
└── README.md                # This file
```

---

## 🛠️ Prerequisites

Before you begin, ensure you have:

- **Node.js** 18 or higher ([Download](https://nodejs.org/))
- **FFmpeg** installed ([Download](https://ffmpeg.org/download.html))
  - Windows: `winget install ffmpeg`
  - macOS: `brew install ffmpeg`
  - Linux: `sudo apt install ffmpeg`
- **Supabase** account with PostgreSQL database ([Sign up](https://supabase.com/))
- **Anthropic API key** for Claude AI ([Get key](https://console.anthropic.com/))

---

## 📦 Installation & Setup

### 1️⃣ Clone the Repository

```bash
git clone https://github.com/itsBaivab/your-chowk.git
cd your-chowk
```

### 2️⃣ Backend Setup

```bash
cd backend
npm install
```

**Configure environment variables:**

```bash
cp .env.example .env
```

Edit `.env` and add your credentials:

```env
DATABASE_URL="postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres"
ANTHROPIC_API_KEY="your-anthropic-api-key"
PORT=3000
DEBUG_MODE="false"
ADMIN_EMAIL="admin@yourchowk.com"
ADMIN_PASSWORD="admin123"
```

**Initialize database:**

```bash
npx prisma generate
npx prisma db push
npm run seed  # Optional: Add demo data
```

**Start the backend:**

```bash
npm run dev  # Development mode with hot reload
# or
npm start    # Production mode
```

**Connect WhatsApp:**
1. A QR code will appear in the terminal
2. Open WhatsApp on your phone → Settings → Linked Devices → Link a Device
3. Scan the QR code
4. ✅ Bot is now connected!

### 3️⃣ Admin Dashboard Setup

```bash
cd admin
npm install
```

**Configure API URL** (create `.env.local`):

```env
NEXT_PUBLIC_API_URL=http://localhost:3000
```

**Start the dashboard:**

```bash
npm run dev
```

Open [http://localhost:3001](http://localhost:3001) in your browser.

---

## 📱 How to Use

### For Workers

1. **Send "Hi"** to the WhatsApp bot to start registration
2. Bot asks for:
   - Your name
   - Your skill (painter, electrician, plumber, etc.)
   - Your city/location
   - ID card photo (optional)
3. ✅ Registration complete — you'll receive job notifications automatically

### For Contractors

1. **Send "Post Job"** to the WhatsApp bot
2. Bot asks for:
   - Job title
   - Skill required
   - Daily wage
   - Location
   - Number of workers needed
3. ✅ Job posted — matching workers are notified immediately

### Job Acceptance

- Workers receive job notifications in their preferred language
- Reply **"YES"** to accept a job
- Contractor gets notified of acceptance
- OTP-based attendance system activates

### Multi-language Support

- Send messages in **Hindi**, **Bengali**, or **English**
- Voice messages are automatically transcribed
- Bot replies in your detected language

---

## 🎨 Admin Dashboard Features

Access the dashboard at `http://localhost:3001/dashboard`

**Default credentials:**
- Email: `admin@yourchowk.com`
- Password: `admin123`

**Features:**
- 📊 **Dashboard** — Real-time stats and analytics
- 👥 **Users** — View and filter workers and contractors
- 📋 **Jobs** — Monitor all job postings and applications
- 📍 **Attendance** — Track OTP-verified attendance records

---

## 🔌 API Endpoints

**Base URL:** `http://localhost:3000`

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Health check |
| `GET` | `/api/workers` | List all workers |
| `GET` | `/api/jobs` | List all jobs with applications |
| `GET` | `/api/applications` | List all applications |
| `GET` | `/api/queue` | Broadcast queue status |
| `POST` | `/api/auth/login` | Admin login |
| `GET` | `/api/dashboard/stats` | Dashboard statistics |
| `GET` | `/api/dashboard/users` | Paginated users with filters |
| `GET` | `/api/dashboard/jobs` | Paginated jobs with filters |
| `GET` | `/api/dashboard/attendance` | Paginated attendance records |

---

## 🗄️ Database Schema

### Workers Table
Stores both workers and contractors with their profiles, skills, and preferences.

### Jobs Table
Contains all job postings with required skills, wages, locations, and dates.

### Applications Table
Tracks the complete lifecycle of worker-job relationships including OTP and attendance.

### Conversation History Table
Maintains chat context for Claude AI's conversational continuity.

See `backend/prisma/schema.prisma` for complete schema details.

---

## 🤖 AI Features (Claude AI)

All AI capabilities powered by Claude AI:

1. **Intent Detection** — Understands user messages and routes to correct flow
2. **Language Detection** — Identifies Hindi, Bengali, or English (including Romanized)
3. **Translation** — Seamless bidirectional translation for all supported languages
4. **ID Card OCR** — Extracts information from Aadhaar/PAN/Voter ID images
5. **Voice Transcription** — Converts voice messages to text with language detection

---

## 🚀 Deployment

### Backend Deployment

**Recommended platforms:**
- [Railway](https://railway.app/)
- [Render](https://render.com/)
- [Fly.io](https://fly.io/)

**Required environment variables:**
- `DATABASE_URL`
- `ANTHROPIC_API_KEY`
- `PORT` (usually provided by platform)
- `ADMIN_EMAIL` and `ADMIN_PASSWORD`

**Important:** Ensure FFmpeg is available in the deployment environment.

### Admin Dashboard Deployment

**Recommended platform:** [Vercel](https://vercel.com/)

```bash
cd admin
npm run build
```

Set environment variable:
- `NEXT_PUBLIC_API_URL` — Your backend API URL

---

## 🧪 Development

### Backend Scripts

```bash
npm run dev          # Start with hot reload
npm run build        # Compile TypeScript
npm start           # Run compiled code
npm run seed        # Seed demo data
npm run typecheck   # Type checking
```

### Admin Scripts

```bash
npm run dev         # Development server
npm run build       # Production build
npm start          # Production server
npm run lint       # Run ESLint
```

---

## 🔐 Security

- ✅ WhatsApp session credentials stored locally in `auth_info/` (gitignored)
- ✅ Environment variables for sensitive data
- ✅ OTP-based attendance verification
- ✅ Unique constraints prevent duplicate applications
- ✅ Transaction-safe job acceptance (race condition protected)

**Production recommendations:**
- Use secure admin credentials (change defaults)
- Add JWT authentication for API endpoints
- Enable HTTPS for all communications
- Use Supabase Row Level Security (RLS)
- Rate-limit API endpoints

---

## 📝 License

This project is licensed under the MIT License.

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 📞 Support

For questions or support, please open an issue on GitHub or contact the maintainers.

---

## 🌟 Acknowledgments

- **Baileys** — WhatsApp Web API
- **Anthropic** — Claude AI
- **Supabase** — Database infrastructure
- **Prisma** — Database ORM
- **Next.js** — React framework

---

**Made with ❤️ for the Indian labour workforce**
