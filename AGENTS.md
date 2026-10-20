# ShadowPersona AI

This repository contains a standalone Next.js App Router application deployed
through Vercel.

## Development

- Install dependencies with `pnpm install --frozen-lockfile`.
- Start the app with `pnpm dev`.
- Run `pnpm lint`, `pnpm typecheck`, and `pnpm build` before submitting changes.
- Node.js 22 and pnpm 10.34.3 are pinned in `.mise.toml` and `package.json`.

## Project structure

- `src/app/` contains the App Router pages and API routes.
- `src/lib/supabase/` contains browser and server Supabase clients.
- `src/types/` contains shared runtime-validated types.
- `supabase/migrations/` contains database and storage setup.
- `src/index.css` contains global styles and Tailwind CSS v4 imports.
- `.env.example` documents required environment variable names. Keep real
  provider credentials in ignored `.env.local` or deployment secret settings.

## Provider integration

Do not invent Qloo endpoints or response formats. Implement the Qloo integration
only against the account's current developer documentation and verified
request/response examples. Never expose provider keys to client-side code.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
