# NAU AI Academic Advisor

An open-source, self-hostable AI academic advisor for universities — the first live module of a modular AI-agent ecosystem for higher education.

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](./LICENSE)

## What it is

The NAU AI Academic Advisor is a retrieval-grounded conversational assistant that helps students with course selection, degree requirements, degree audits, GPA planning, academic policies, registration, and campus resources. It answers from an institution's own knowledge base (course catalogs, student handbook, official web pages) rather than from open-ended model recall, and it is built to be run and owned by the university that deploys it — each institution adapts the content, hosts the services, and keeps its own data.

This advisor is the **first live module** of a planned, modular AI-agent ecosystem for universities. The advisor module is implemented and running today; the additional modules and the ecosystem layer described under [The ecosystem](#the-ecosystem) are planned.

## Key features

Grounded in the code in this repository:

- **Two advising surfaces.** A staff/advisor experience (login required, manages students and uploaded transcripts) and a student-facing experience (email one-time-password access, general Q&A). See `apps/api/src/advisor/`, `apps/api/src/public-advisor/`, and the web routes under `apps/web/app/`.
- **Retrieval-augmented answering (RAG).** User questions are embedded and matched against stored knowledge chunks before the model answers, so responses cite institutional sources. See `apps/api/src/rag/rag.service.ts` and the embedding server in `apps/api/src/rag/embedding_server.py`.
- **Local embeddings.** Embeddings are produced by a local `fastembed` model (`BAAI/bge-small-en-v1.5`, 384-dim) served from a small in-process Python HTTP server — no third-party embedding API call. See `apps/api/src/rag/embed.py` and `embedding_server.py`.
- **FERPA-aware input sanitization.** Inbound student messages are scrubbed of personally identifying patterns (email, SSN, phone, student ID, standalone 9-digit IDs) before further processing. See `apps/api/src/common/ferpa-sanitizer.ts`.
- **Encryption of sensitive stored data.** AES-256-GCM authenticated encryption for sensitive fields. See `apps/api/src/common/encryption.service.ts`.
- **Role-based auth with email OTP.** JWT-based sessions with `ADMIN` / `ADVISOR` / `STUDENT` roles and email one-time-password login. See `apps/api/src/auth/`.
- **Transcript ingestion.** PDF/image transcript upload with text extraction (pdf-parse) and OCR (tesseract.js). See `apps/api/src/transcript/`.
- **Knowledge-base management.** Admin surface for documents and chunks. See `apps/api/src/knowledge/` and `apps/api/src/admin/`.
- **Rate limiting** via `@nestjs/throttler`, background jobs via Bull/Redis, and an **OpenAPI/Swagger** spec served at `/api/docs` (see `apps/api/src/main.ts`).
- **Scoped, guarded system prompt.** The advisor is constrained to NAU academic topics and instructed never to invent source URLs. See `apps/api/system_prompt.md`.

## Architecture

```
┌──────────────┐        ┌───────────────────────┐        ┌──────────────────┐
│  Next.js web │  HTTP  │      NestJS API       │  SQL   │  PostgreSQL +    │
│ (apps/web)   │ ─────▶ │     (apps/api)        │ ─────▶ │  pgvector        │
│ chat + admin │        │  auth, advisor, chat, │        │  (docker-compose)│
└──────────────┘        │  knowledge, rag,      │        └──────────────────┘
                        │  transcript, admin    │
                        └───────────┬───────────┘
                                    │ HTTP (127.0.0.1:9430)
                                    ▼
                        ┌───────────────────────┐        ┌──────────────────┐
                        │ Python embedding      │        │  Redis           │
                        │ server (fastembed)    │        │  (Bull queues)   │
                        └───────────────────────┘        └──────────────────┘
```

- **Web** — Next.js 16 / React 19 app (`apps/web`) with student chat and an admin dashboard (students, transcripts, knowledge).
- **API** — NestJS 11 app (`apps/api`) exposing auth, advisor, chat, knowledge, transcript, admin, and RAG modules (`apps/api/src/app.module.ts`).
- **Embedding server** — a standalone Python HTTP service (`apps/api/src/rag/embedding_server.py`) that keeps the `fastembed` model warm in memory and returns 384-dim vectors on `POST /embed`.
- **Datastore** — PostgreSQL with the `pgvector` extension (the provided `docker-compose.yml` uses the `pgvector/pgvector:pg16` image) for relational data and vector similarity search.
- **Redis** — backs Bull job queues (`docker-compose.yml`).

If the embedding server is unavailable, `RagService` logs a warning and falls back to a zero vector rather than crashing (`apps/api/src/rag/rag.service.ts`).

## Privacy & compliance

Universities handle student education records under FERPA, so this project treats student data protection as a first-class concern with concrete, inspectable mechanisms:

- **PII redaction on ingest** — `apps/api/src/common/ferpa-sanitizer.ts` (`FerpaSanitizer.sanitizeUserMessage`) redacts, via regular expressions, email addresses, US SSNs (`###-##-####`), phone numbers, student IDs of the form `S#######`, and standalone 9-digit identifiers, replacing each with an explicit `[REDACTED_*]` token before the text moves downstream.
- **Encryption at the field level** — `apps/api/src/common/encryption.service.ts` (`EncryptionService`) uses AES-256-GCM with a random 96-bit IV per operation and an authentication tag, keyed from `ENCRYPTION_KEY`. Ciphertext is stored as `iv:authTag:ciphertext` (base64).
- **Retrieval-grounded answering** — the advisor answers from institution-provided knowledge chunks retrieved via RAG (`apps/api/src/rag/rag.service.ts`) and is instructed to cite only URLs present in the provided context and never to invent sources (`apps/api/system_prompt.md`). This reduces fabricated policy claims, which matters when the answers concern real students' academic standing.
- **Identity minimization in the prompt** — the system prompt directs the assistant not to use or ask for a student's name or ID and to refer to the student only as "you" (`apps/api/system_prompt.md`).

These are engineering safeguards, not a legal certification. Any institution deploying this system remains responsible for its own FERPA compliance review, data-handling policies, and configuration (keys, retention, access control).

## Tech stack

- **Backend:** TypeScript, NestJS 11, TypeORM, PostgreSQL, pgvector, Bull + Redis, Passport/JWT, `@nestjs/throttler`, Swagger (OpenAPI). LLM access via the Anthropic and OpenAI SDKs; transactional email via Resend/Nodemailer; transcript parsing via `pdf-parse` and `tesseract.js`.
- **Frontend:** TypeScript, Next.js 16, React 19, Tailwind CSS 4, Radix UI / shadcn, `socket.io-client`, `react-markdown`.
- **RAG / embeddings:** Python, `fastembed` (`BAAI/bge-small-en-v1.5`, 384-dim).
- **Tooling:** npm workspaces monorepo, ESLint, Prettier, Jest.

## Quickstart

> Prerequisites: Node.js (LTS), npm, Python 3 with `fastembed` installed, and Docker (for PostgreSQL + Redis).

**1. Clone and install dependencies (from the repo root):**

```bash
npm install
```

This installs both workspaces (`apps/api`, `apps/web`).

**2. Start PostgreSQL (with pgvector) and Redis:**

```bash
docker compose up -d
```

The provided `docker-compose.yml` publishes PostgreSQL on host port **5433** (container 5432) with database `nau_advisor`, user `nau`, and Redis on `6379`.

**3. Configure API environment:**

```bash
cp apps/api/.env.example apps/api/.env
```

Then edit `apps/api/.env`. At minimum set `DATABASE_URL` to point at the database you started (match the exposed port — the bundled compose file uses `5433`), and provide `JWT_SECRET`, `ENCRYPTION_KEY` (a 32-byte hex key), `ANTHROPIC_API_KEY` / `CLAUDE_MODEL`, and email settings. See `apps/api/.env.example` for the full list of variables.

**4. Start the embedding server** (keeps the `fastembed` model warm on `127.0.0.1:9430`):

```bash
python3 apps/api/src/rag/embedding_server.py
```

**5. Run the apps in development** (from the repo root):

```bash
npm run dev
```

This runs the API and web dev servers concurrently (see the root `package.json` scripts). The API serves its OpenAPI docs at `/api/docs`.

**Other root scripts:** `npm run build`, `npm run lint`, `npm run test`.

> Note on ports: the API listens on `PORT` from the environment (`.env.example` sets `3001`; it defaults to `3000` if unset — see `apps/api/src/main.ts`). Set `DATABASE_URL` to match the PostgreSQL port you actually expose.

## Project structure

```
nau-ai-advisor/
├── apps/
│   ├── api/                        # NestJS backend
│   │   ├── src/
│   │   │   ├── auth/               # email-OTP auth, JWT, roles
│   │   │   ├── users/
│   │   │   ├── advisor/            # staff/advisor surface
│   │   │   ├── public-advisor/     # student-facing surface
│   │   │   ├── chat/               # chat sessions & messages
│   │   │   ├── knowledge/          # knowledge documents & chunks
│   │   │   ├── transcript/         # transcript upload + parsing/OCR
│   │   │   ├── admin/              # admin operations
│   │   │   ├── rag/                # rag.service.ts + Python embedding server
│   │   │   ├── common/
│   │   │   │   ├── ferpa-sanitizer.ts
│   │   │   │   ├── encryption.service.ts
│   │   │   │   └── entities/       # user, otp-code, refresh-token,
│   │   │   │                       # transcript, chat-session, message,
│   │   │   │                       # knowledge-document, knowledge-chunk
│   │   │   ├── database/
│   │   │   ├── app.module.ts
│   │   │   └── main.ts             # bootstrap + Swagger at /api/docs
│   │   ├── system_prompt.md        # scoped advisor system prompt
│   │   └── .env.example
│   └── web/                        # Next.js frontend
│       └── app/
│           ├── (admin)/            # dashboard, students, transcripts, knowledge
│           ├── (auth)/             # login
│           ├── (student)/          # chat
│           ├── advisor/
│           └── ask/
├── docker-compose.yml              # PostgreSQL (pgvector) + Redis
├── package.json                    # npm workspaces + root scripts
├── LICENSE
├── NOTICE
├── README.md
├── CONTRIBUTING.md
├── CODE_OF_CONDUCT.md
├── GOVERNANCE.md
└── SECURITY.md
```

## The ecosystem

The academic advisor is the **first module** of a modular, open-source AI-agent ecosystem for universities. Every module is self-hostable, institution-owned, and built on the same shared foundation, and the platform is designed so that any institution can add its own modules.

### Modules

**Student-facing agents**

| Module | Status |
|---|---|
| **Student Advising** (course selection, degree audit, GPA planning, deadlines, policies) | Live / current |
| Tutoring & Learning (subject tutoring, study help, exam prep) | Planned |
| Financial Aid & Scholarships (aid guidance, forms, scholarship match) | Planned |
| Career Services (internships, resumes, job search) | Planned |
| Accessibility & Inclusion (accommodations, inclusive support) | Planned |
| International & SEVIS (I-20, visa, multilingual onboarding) | Planned |

**Staff & institution agents**

| Module | Status |
|---|---|
| Faculty & Research (research, grant search, teaching support) | Planned |
| Admissions & Enrollment (inquiries, applications, credentials) | Planned |
| Administration (operations, reporting, policy Q&A) | Planned |
| Student Affairs (housing, events, wellbeing referrals) | Planned |
| IT & Library Help (help desk, information literacy, citations) | Planned |
| Retention & Early Alert (at-risk detection, success analytics) | Planned |

### Shared foundation (every module)

Retrieval-grounded knowledge base (RAG), FERPA/PII sanitization, role-based access control, encryption at rest, human-in-the-loop escalation, audit logging, per-task model routing (local and cloud), SIS/LMS connectors (Canvas, Banner, Workday), multilingual and voice, citation and safety guardrails, and a no-code admin console.

### Ecosystem & community

What makes this an ecosystem rather than a single application:

- **Module SDK / plugin framework** so other universities can build their own agents
- **Open governance** (maintainers, RFC process) — see [GOVERNANCE.md](./GOVERNANCE.md)
- **Adopter program** with pilot universities
- **Evaluation and evidence**: measurable impact on retention and advising load
- **Interoperability standards** (LTI, Caliper)
- **Documentation and contributor onboarding**

The platform is general: any AI-agent project can be built and released as a module under the same open-source, self-hostable approach. Priorities and sequencing are governed as described in [GOVERNANCE.md](./GOVERNANCE.md).

## Contributing

Contributions are welcome. Please read [CONTRIBUTING.md](./CONTRIBUTING.md) for development setup, branch and commit conventions, and the sign-off requirement, and [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md) before participating.

## Security

Please do not open public issues for security problems. See [SECURITY.md](./SECURITY.md) for the responsible-disclosure process. Because deployments handle student PII under FERPA, security reports are taken seriously.

## License

Licensed under the Apache License, Version 2.0. See [LICENSE](./LICENSE) and [NOTICE](./NOTICE).

Copyright 2026 Azamat Zhamanov and North American University.
