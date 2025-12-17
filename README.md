# Relationship Overlap Check

Minimal Next.js + Supabase app that lets users declare a partner identifier and get an anonymous alert when the same identifier is declared by 2+ users. Identifiers are normalized and hashed+salted server-side; alerts never reveal who else declared.

## Prereqs
- Node 18+
- Supabase project with email OTP enabled (or phone OTP if you prefer)

## Setup
1) Copy env: `cp .env.local.example .env.local` and fill:
   - `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` from Supabase settings
   - `SUPABASE_SERVICE_ROLE_KEY` (server-side only; never ship to client)
   - `HASH_SALT` (choose a long random string)
2) In Supabase SQL editor, run `supabase/schema.sql` to create tables, indexes, and RLS.
3) In Supabase Auth settings, add your site URL to Redirect URLs (e.g., `http://localhost:3000`).
4) Install deps: `npm install`
5) Run dev: `npm run dev` (or `npm run build && npm start` for prod).

## API routes (internal)
- `POST /api/declare` (auth bearer) body `{ partner, intent }`
- `GET /api/alerts` (auth bearer)
- `POST /api/alerts/read` (auth bearer)
- `GET/POST /api/profile` (auth bearer)

## Notes
- Service-role key is only used server-side in API routes; RLS blocks anon direct access. Partners table has no policies so only the service role can touch it.
- Overlap logic: if a partner hash appears in 2+ declarations, all linked users get/keep an alert (upsert ensures idempotent). Alerts mark as read via `/api/alerts/read`.
- Identifiers are normalized (lowercase, whitespace/hyphen stripped) and hashed with `HASH_SALT` using SHA-256.
- OTP/magic link flow: Supabase sends the email; when redirected back with `code`, the client exchanges it for a session.

## Deploy
- Push env vars to your host (Vercel/Render/Fly). Include `SUPABASE_SERVICE_ROLE_KEY` and `HASH_SALT` as server-only secrets.
- Ensure the deployed URL is whitelisted in Supabase Auth redirect URLs.
- Use a persistent Postgres (Supabase handles it). No local SQLite is used.
