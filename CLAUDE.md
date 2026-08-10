# NAU AI Advisor

## Project Overview
AI-powered academic advisor for North American University (NAU) students.
Location: `~/Projects/nau-ai-advisor/`

## Architecture
- **Frontend**: Next.js 16 (`apps/web/`) → port 4001
- **Backend**: NestJS (`apps/api/`) → port 4000
- **Database**: PostgreSQL (TypeORM) → port 5433 (Docker)
- **Embedding Server**: fastembed (BAAI/bge-small-en-v1.5) → port 9430
- **Tunnel**: Cloudflare quick tunnel → `*.trycloudflare.com`

## Two Advisor Modes

### 1. Staff Advisor (`/advisor/`)
- Login required (ADVISOR role)
- Manages students, uploads transcripts
- FERPA-compliant: Presidio NER + AES encryption
- Chat keyed by advisorId + studentId

### 2. Student AI Advisor (`/ask`)
- Email OTP verification (@na.edu + whitelist)
- No login/password — lightweight JWT session (24h)
- General Q&A from RAG knowledge base
- Optional transcript upload (in-memory, not persisted)
- Guardrails: only NAU academic topics, no homework help
- Rate limit: 15 msgs / 5 min per email, 30 msgs per session

## RAG Knowledge Base
- Table: `knowledge_chunks` (513 records)
- Sources: NAU catalogs 2025-26 & 2026-27, student handbook, 20 website pages
- Embedding: fastembed BAAI/bge-small-en-v1.5 (384 dims)
- Also mirrored in Ductor RAG (`ductor_rag` DB, port 5434) for cross-project search

## Key Files
- `apps/api/src/public-advisor/` — student-facing advisor (controller, service, module)
- `apps/api/src/advisor/` — staff advisor
- `apps/api/src/rag/` — RAG service + embedding server
- `apps/web/app/ask/page.tsx` — student chat UI
- `apps/web/app/advisor/` — staff advisor UI

## Services (systemd)
- `nau-frontend.service` — Next.js on port 4001 (enabled)
- `nau-embedding.service` — Embedding server on port 9430 (enabled)
- Backend: manual start (`node dist/main` on port 4000) — needs systemd service
- Cloudflare tunnel: manual process — needs systemd service

## Database
- Connection: `postgresql://nau:nau_dev_password@localhost:5433/nau_advisor`
- Docker container: `nau-ai-advisor-postgres-1`

## Build & Deploy
```bash
# Backend
cd apps/api && npm run build && node --enable-source-maps dist/main

# Frontend
cd apps/web && npx next build
sudo systemctl restart nau-frontend.service
```

## Environment
- `apps/api/.env` — DATABASE_URL, JWT_SECRET, SMTP_*, ANTHROPIC_API_KEY
- `apps/web/.env.local` — NEXT_PUBLIC_API_URL=/backend

## Auth
- Staff: OTP-based, roles ADMIN/ADVISOR/STUDENT
- Student advisor: email OTP, @na.edu domain + whitelist (redacted@na.edu)
- Tokens in localStorage (staff) / sessionStorage (student advisor)
