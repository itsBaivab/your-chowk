# Your Chowk — Admin Dashboard

> Real-time admin dashboard for monitoring and managing the Your Chowk digital labour marketplace.

Built with **Next.js 16**, **React 19**, and **Tailwind CSS 4**.

---

## 🎨 Features

- 📊 **Dashboard** — Real-time statistics and analytics
  - Total workers, contractors, jobs
  - Job fill rates and application acceptance rates
  - Attendance tracking
  
- 👥 **User Management** — View and filter all users
  - Filter by role (worker/contractor)
  - Filter by city
  - Pagination support
  
- 📋 **Job Management** — Monitor all job postings
  - View job details and applications
  - Filter by status (OPEN, FILLED, CANCELLED)
  - Filter by city
  - See which workers applied
  
- 📍 **Attendance Tracking** — OTP-verified attendance records
  - View all attendance records
  - Filter by date
  - Pagination support

---

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- Backend server running on `http://localhost:3000` (or configure `NEXT_PUBLIC_API_URL`)

### Installation

```bash
# Install dependencies
npm install

# Create environment file
cp .env.example .env.local
```

### Configuration

Edit `.env.local`:

```env
NEXT_PUBLIC_API_URL=http://localhost:3000
```

### Development

```bash
npm run dev
```

Open [http://localhost:3001](http://localhost:3001) with your browser.

**Default login credentials:**
- Email: `admin@yourchawk.com`
- Password: `admin123`

⚠️ **Important:** Change these credentials in production via backend environment variables.

### Build for Production

```bash
npm run build
npm start
```

---

## 📁 Project Structure

```
admin/
├── src/
│   └── app/
│       ├── components/       # Reusable components
│       │   └── Sidebar.tsx   # Navigation sidebar
│       ├── dashboard/        # Dashboard pages
│       │   ├── page.tsx      # Stats overview
│       │   ├── users/        # User management
│       │   ├── jobs/         # Job management
│       │   └── attendance/   # Attendance tracking
│       ├── layout.tsx        # Root layout
│       └── page.tsx          # Landing page
├── public/                   # Static assets
├── next.config.ts            # Next.js configuration
├── tailwind.config.ts        # Tailwind configuration
└── tsconfig.json             # TypeScript configuration
```

---

## 🎨 Styling

This project uses:
- **Tailwind CSS 4** — Utility-first CSS framework
- **CSS Variables** — Custom theming support
- **Glass-morphism** — Modern UI aesthetic

### Theme Variables

Custom CSS variables defined in `app/globals.css`:

- `--bg-primary` — Main background
- `--bg-secondary` — Secondary background
- `--accent` — Primary accent color
- `--text-primary` — Main text color
- `--text-secondary` — Secondary text color
- `--success` — Success state color

---

## 🔌 API Integration

The dashboard communicates with the backend via REST API:

| Endpoint | Used By |
|----------|---------|
| `GET /api/dashboard/stats` | Dashboard overview |
| `GET /api/dashboard/users` | User management page |
| `GET /api/dashboard/jobs` | Job management page |
| `GET /api/dashboard/attendance` | Attendance page |
| `POST /api/auth/login` | Login functionality |

---

## 🚢 Deployment

### Deploy to Vercel (Recommended)

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel
```

Or use the [Vercel Dashboard](https://vercel.com/new) for GitHub integration.

**Environment variables to set:**
- `NEXT_PUBLIC_API_URL` — Your backend API URL (e.g., `https://api.yourchowk.com`)

### Other Platforms

This is a standard Next.js app and can be deployed to:
- Netlify
- Railway
- AWS Amplify
- Self-hosted with PM2

---

## 📝 Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server (port 3000) |
| `npm run build` | Build production bundle |
| `npm start` | Start production server |
| `npm run lint` | Run ESLint |

---

## 🔐 Security Notes

- No authentication is implemented client-side (relies on backend token validation)
- Ensure backend API is secured with proper authentication
- Use HTTPS in production
- Change default admin credentials

---

## 🤝 Contributing

Please see the main repository README for contribution guidelines.

---

## 📄 License

MIT License — see LICENSE file in the root directory.

---

**Part of the Your Chowk project** — For main documentation, see [root README](../README.md)
