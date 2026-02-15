# Your_Chawk – Hackathon PRD

## 1. Problem

In many Indian cities, contractors hire daily-wage labourers from physical “labour chawks”.

Problems:
- Unorganized system
- No digital records
- No identity verification
- Workers may not show up
- Contractors waste time every morning

The system is offline, messy, and inefficient.

---

## 2. Solution

Your_Chawk is a WhatsApp-based digital labour chawk.

It allows:
- Contractors to post work
- Labourers to accept work
- OTP-based attendance verification

Everything happens inside WhatsApp.

---

## 3. Tech Stack

- WhatsApp Integration → Baileys
- AI Agent → Claude Agent SDK
- Backend → Node.js
- Database → Supabase (Postgres)
- ORM → Prisma
- Admin Panel → Next.js (basic)

---

## 4. MVP Scope (Hackathon Version)

We will build:

- Language selection (multi-language support)
- Labourer onboarding
- Contractor onboarding
- Job posting flow
- Worker matching by city
- Worker YES/NO response
- OTP-based attendance
- Basic admin dashboard (view users & jobs)

We will NOT build:
- Payments
- Ratings
- Insurance integration
- Advanced analytics

---

## 5. User Flow

### 5.1 First Interaction – Language Selection

User sends “Hi”.

Bot replies:

"Please select your language:
1. English
2. Hindi
3. Kannada
4. Bengali"

User selects a number.

System stores selected language.

All further conversation continues in selected language using Claude.

---

### 5.2 Role Selection

Bot asks:

"Are you:
1. Labourer
2. Contractor"

User selects role.

---

### 5.3 Labourer Onboarding

Bot collects:
- Name
- City
- Skill
- Upload Aadhaar photo

Claude extracts basic details from Aadhaar.

Data stored in database.

---

### 5.4 Contractor Onboarding

Bot collects:
- Name
- City

Data stored in database.

---

### 5.5 Job Posting (Contractor)

Contractor sends message like:

"Need 5 masons in HSR Bangalore for 5 days"

Claude:
- Extracts city
- Extracts skill
- Asks wage
- Confirms job details

Job saved in database.

---

### 5.6 Worker Matching

System:
- Filters labourers by city
- Sends job details in their selected language

Worker replies:
- YES
- NO

Interested workers are shortlisted.

---

### 5.7 Attendance System (OTP)

For selected workers:

- System generates OTP
- Worker receives OTP and location

At site:
- Worker gives OTP to contractor
- Contractor sends OTP in chat
- System verifies attendance

---

## 6. Core Features

- Multi-language support
- WhatsApp-first interaction
- AI-based structured conversation
- City-based worker matching
- OTP attendance verification
- Basic admin panel

---

## 7. Database (Simple Structure)

Users:
- id
- role
- name
- phone
- city
- language

Labourer:
- user_id
- skill

Jobs:
- id
- contractor_id
- city
- skill
- wage
- status

Applications:
- job_id
- labourer_id
- response
- otp
- attendance_status

---

## 8. Success Criteria (Hackathon)

- User selects language
- End-to-end working flow
- Contractor posts job
- Workers receive job in selected language
- Worker accepts
- OTP verifies attendance
- Admin can see records

---

## 9. Vision

Your_Chawk can become digital infrastructure for India’s informal labour market using AI + WhatsApp + multi-language support.
