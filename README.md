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
- `POSTGRES_URL` or `STORAGE_POSTGRES_URL` also work as database URL sources
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_PUBLISHABLE_KEY` as an alternative to `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `IMAP_HOST`
- `IMAP_PORT`
- `IMAP_SECURE`
- `IMAP_USER`
- `IMAP_PASSWORD`
- `IMAP_FOLDER`
- `IMAP_PROCESSED_FOLDER`
- `IMAP_MAX_MESSAGES_PER_SYNC`
- `PORT` for local development only

## Auth and storage

- The app now shows a standalone email/password login screen before any tool screens render.
- Browser sign-in uses Supabase Auth with `SUPABASE_URL` and either `SUPABASE_ANON_KEY` or `SUPABASE_PUBLISHABLE_KEY`.
- Vercel-style injected names such as `STORAGE_SUPABASE_URL`, `STORAGE_SUPABASE_PUBLISHABLE_KEY`, and `STORAGE_SUPABASE_SERVICE_ROLE_KEY` are also accepted.
- Users can create an account directly from the login screen.
- Backend API requests validate Supabase bearer tokens with `SUPABASE_SERVICE_ROLE_KEY` when Supabase auth is configured.
- Case and knowledge data persist in Postgres through `DATABASE_URL`, `POSTGRES_URL`, or `STORAGE_POSTGRES_URL`.

## Email intake

Quotelligence can pull RFQ emails directly from an IMAP mailbox and auto-create cases from the email body plus attachments.

Set these mailbox variables:

- `IMAP_HOST`
- `IMAP_PORT`
- `IMAP_SECURE`
- `IMAP_USER`
- `IMAP_PASSWORD`
- `IMAP_FOLDER`
- `IMAP_PROCESSED_FOLDER` optional but recommended
- `IMAP_MAX_MESSAGES_PER_SYNC`

Recommended flow:

1. Create or reuse a mailbox for RFQs.
2. Route RFQ emails into a dedicated IMAP folder such as `RFQ Intake`.
3. In the app, open `Chat Intake`.
4. Click `Sync RFQ Mailbox`.
5. Quotelligence imports unread emails from that folder, parses the email body and attachments, and creates cases.

If `IMAP_PROCESSED_FOLDER` is set, imported emails are moved there after a successful sync. Otherwise they are marked as read in the source folder.

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
- `SUPABASE_PUBLISHABLE_KEY` as an alternative to `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `IMAP_HOST`
- `IMAP_PORT`
- `IMAP_SECURE`
- `IMAP_USER`
- `IMAP_PASSWORD`
- `IMAP_FOLDER`
- `IMAP_PROCESSED_FOLDER`
- `IMAP_MAX_MESSAGES_PER_SYNC`

The runtime also accepts Vercel storage-injected equivalents such as:

- `STORAGE_POSTGRES_URL`
- `STORAGE_POSTGRES_PRISMA_URL`
- `STORAGE_SUPABASE_URL`
- `STORAGE_SUPABASE_ANON_KEY`
- `STORAGE_SUPABASE_PUBLISHABLE_KEY`
- `STORAGE_SUPABASE_SERVICE_ROLE_KEY`

After changing any of those values, redeploy the project so both the browser config and serverless functions use the same Supabase project.
