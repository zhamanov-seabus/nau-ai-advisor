# Contributing to NAU AI Academic Advisor

Thank you for your interest in contributing. This document explains how to set up a development environment, how we handle branches and pull requests, and the conventions we expect from contributions.

By participating in this project you agree to abide by our [Code of Conduct](./CODE_OF_CONDUCT.md).

## Development setup

This is an npm-workspaces monorepo with two applications: `apps/api` (NestJS) and `apps/web` (Next.js), plus a Python embedding server used by the RAG layer.

Prerequisites:

- Node.js (current LTS) and npm
- Python 3 with `fastembed` installed (for the embedding server)
- Docker (for PostgreSQL with pgvector, and Redis)

Steps (run from the repository root unless noted):

1. Install dependencies for all workspaces:

   ```bash
   npm install
   ```

2. Start PostgreSQL (pgvector) and Redis:

   ```bash
   docker compose up -d
   ```

3. Configure the API environment:

   ```bash
   cp apps/api/.env.example apps/api/.env
   ```

   Fill in the required variables (see `apps/api/.env.example`). Set `DATABASE_URL` to match the exposed PostgreSQL port (the bundled `docker-compose.yml` uses `5433`), and provide `JWT_SECRET`, `ENCRYPTION_KEY`, and any LLM/email keys you need for the area you are working on.

4. Start the embedding server (keeps the model warm on `127.0.0.1:9430`):

   ```bash
   python3 apps/api/src/rag/embedding_server.py
   ```

5. Run both apps in development:

   ```bash
   npm run dev
   ```

Useful root scripts (defined in the root `package.json`):

- `npm run dev` — run API and web dev servers concurrently
- `npm run build` — build both apps
- `npm run lint` — lint both apps
- `npm run test` — run the API test suite

You can also run scripts against a single workspace, e.g. `npm run test --workspace=apps/api`.

## Before you open a pull request

- **Lint and test.** Run `npm run lint` and `npm run test` and make sure they pass.
- **Keep changes focused.** One logical change per pull request. If the description needs the word "and", consider splitting it.
- **Do not commit secrets.** Never commit real API keys, database URLs, or credentials. Use `.env` (git-ignored) for local configuration.
- **Update docs.** If you change behavior, configuration, or setup, update the relevant documentation in the same pull request.

## Branch and pull-request conventions

- Create one branch per change, branched from the default branch. Suggested prefixes: `feat/`, `fix/`, `docs/`, `chore/`, `refactor/`, `test/` (for example, `feat/degree-audit-export`).
- Open a pull request against the default branch. In the description, explain **what** changed, **why**, and **how to test it**, and note any follow-ups.
- Link related issues.
- A maintainer reviews every pull request. Address review comments; if you disagree with a comment, say why rather than silently ignoring it. See [GOVERNANCE.md](./GOVERNANCE.md) for how decisions are made.

## Commit style

- Use [Conventional Commits](https://www.conventionalcommits.org/): `type(scope): summary`, for example `feat(rag): add source citations to answers` or `fix(auth): reject expired OTP codes`.
- Write the summary in the imperative, present tense, and keep the first line under 72 characters.
- Explain the "why" in the commit body when it is not obvious from the summary.

## Developer Certificate of Origin (sign-off)

This project uses the [Developer Certificate of Origin](https://developercertificate.org/) (DCO). By signing off on your commits you certify that you wrote the contribution or otherwise have the right to submit it under the project's license.

Add a sign-off line to each commit:

```
Signed-off-by: Your Name <your.email@example.com>
```

You can do this automatically with:

```bash
git commit -s
```

The name and email in the sign-off must match the commit author.

## Code of Conduct

All participation is governed by our [Code of Conduct](./CODE_OF_CONDUCT.md). Please report unacceptable behavior through the contact listed there.
