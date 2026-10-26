# URL Shortener (NestJS 11, TypeORM/PostgreSQL, Redis, Jest)

## Commands (Windows PowerShell)
- Install: `npm ci`
- Infra: `docker compose up -d` (Postgres :5433, Redis :6379). Copy `.env.example` to `.env`.
- Lint without autofix: `npm run lint:check`. Do NOT run `npm run lint` (it uses --fix).
- Build: `npm run build`
- Test: `npx jest` / coverage: `npx jest --coverage`
  (use npx; PowerShell swallows flags passed as `npm test -- --flag`)

## Rules
- One task per branch. Keep diffs small. Never commit or push: the owner reviews and commits.
- Do not add or upgrade dependencies unless the task says so. Never hand-edit the lockfile.
- Lint/refactor tasks must not change behavior.
- Never silence errors with eslint-disable or `any` casts; fix the types.
- Every bug fix needs a test that fails before the fix and passes after.
- Report evidence: paste real command output instead of saying "should work".
- If you notice problems outside the current task, list them at the end; do not fix them.
- All code, comments, log and error messages, API responses, tests, docs and commit messages are in English. Chat with the owner may be in Vietnamese.

## Code map
- All business logic: `src/urls/urls.service.ts`. Cache keys: `url:<shortCode>`.
- Config: `src/app.module.ts`. Entities: `src/urls/entities/`.