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
