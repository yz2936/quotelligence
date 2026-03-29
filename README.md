# Quotelligence

Quotelligence is a browser-based RFQ intake and quote-workshop tool. It parses uploaded customer files, stores cases and knowledge files, and helps build draft quotes from the backend.

## Local development

1. Create `.env` from `.env.example`.
2. Set the required environment variables.
3. Run `npm install`.
4. Run `npm run dev`.
5. Open `http://127.0.0.1:4173`.

## Environment variables

- `OPENAI_API_KEY`
- `DATABASE_URL`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `PORT` for local development only

## Auth and storage

- The app now shows a standalone email/password login screen before any tool screens render.
- Browser sign-in uses Supabase Auth with `SUPABASE_URL` and `SUPABASE_ANON_KEY`.
- Backend API requests validate Supabase bearer tokens with `SUPABASE_SERVICE_ROLE_KEY` when Supabase auth is configured.
- Case and knowledge data persist in Postgres through `DATABASE_URL`.

## Database reset

To clear all stored cases and knowledge files from the connected Postgres database:

```bash
npm run reset-db
```

That command truncates the `cases` and `knowledge_files` tables using `DATABASE_URL`.

## Vercel deployment

This project deploys to Vercel as:

- static app files from the repo root
- Node serverless API routes under `/api`

Vercel project settings must include:

- `OPENAI_API_KEY`
- `DATABASE_URL`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

After changing any of those values, redeploy the project so both the browser config and serverless functions use the same Supabase project.
