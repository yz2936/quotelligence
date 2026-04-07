# Demo Readiness Audit

Date: 2026-04-06
Owner: Codex
Status: In progress, demo-critical path stabilized
Linked context: existing Quotelligence production codebase

## Current Architecture Summary

Quotelligence is a server-rendered static-plus-API application with:

- Frontend: vanilla JS SPA mounted from [`/src/main.js`](/Users/ericzhuang/Downloads/mini-project/quotelligence/src/main.js) and rendered through [`/src/app.js`](/Users/ericzhuang/Downloads/mini-project/quotelligence/src/app.js)
- App routing: hash-based client routes under `/app`
- Public landing: static root page at `/`
- Backend: single Node HTTP server in [`/server.js`](/Users/ericzhuang/Downloads/mini-project/quotelligence/server.js)
- Storage: Postgres when a database URL is present, otherwise file-backed JSON via [`/server/store.js`](/Users/ericzhuang/Downloads/mini-project/quotelligence/server/store.js)
- Auth: Supabase Auth bearer-token validation via [`/server/supabase-auth.js`](/Users/ericzhuang/Downloads/mini-project/quotelligence/server/supabase-auth.js)
- AI and parsing: OpenAI-backed analysis with heuristic fallbacks via [`/server/openai-client.js`](/Users/ericzhuang/Downloads/mini-project/quotelligence/server/openai-client.js), [`/server/intake-service.js`](/Users/ericzhuang/Downloads/mini-project/quotelligence/server/intake-service.js), and [`/server/knowledge-service.js`](/Users/ericzhuang/Downloads/mini-project/quotelligence/server/knowledge-service.js)
- File extraction: PDFs, spreadsheets, and EML handled in [`/server/file-text-extractor.js`](/Users/ericzhuang/Downloads/mini-project/quotelligence/server/file-text-extractor.js)
- Commercial workflow logic: quote, negotiation, follow-up, and workflow checkpoint logic in [`/server/quote-service.js`](/Users/ericzhuang/Downloads/mini-project/quotelligence/server/quote-service.js), [`/server/follow-up-service.js`](/Users/ericzhuang/Downloads/mini-project/quotelligence/server/follow-up-service.js), and [`/server/workflow-engine.js`](/Users/ericzhuang/Downloads/mini-project/quotelligence/server/workflow-engine.js)

## Route And Feature Inventory

### Public routes

- `/`
  Purpose: standalone product landing page
  Files: [`/index.html`](/Users/ericzhuang/Downloads/mini-project/quotelligence/index.html), [`/src/landing.css`](/Users/ericzhuang/Downloads/mini-project/quotelligence/src/landing.css), [`/src/landing.js`](/Users/ericzhuang/Downloads/mini-project/quotelligence/src/landing.js)
- `/app`
  Purpose: authenticated product shell
  Files: [`/app.html`](/Users/ericzhuang/Downloads/mini-project/quotelligence/app.html)

### App routes

- `#/dashboard`
  Purpose: portfolio summary, recent work, demo controls
- `#/intake`
  Purpose: RFQ intake, file upload, pasted email text, mailbox sync
- `#/case`
  Purpose: case registry and case detail modal
- `#/quote`
  Purpose: quote registry, draft build, PDF/email generation, history
- `#/complaints`
  Purpose: complaint intake, complaint registry, complaint detail
- `#/outcomes`
  Purpose: negotiation tracking, follow-up drafting, send/schedule actions
- `#/knowledge`
  Purpose: knowledge upload, preview, summarize, library management
- `#/login`
  Purpose: sign in / sign up state inside app shell

### API inventory

- System and auth
  - `GET /api/system/status`
- Intake and cases
  - `POST /api/intake`
  - `GET /api/cases`
  - `GET /api/cases/:id`
  - `PATCH /api/cases/:id`
  - `DELETE /api/cases/:id`
  - `POST /api/cases/:id/checkpoints/:checkpointId/decision`
  - `POST /api/cases/:id/compliance-check`
- Email intake
  - `POST /api/email-intake/sync`
- Knowledge
  - `GET /api/knowledge`
  - `POST /api/knowledge/upload`
  - `GET /api/knowledge/:id`
  - `DELETE /api/knowledge/:id`
  - `POST /api/knowledge/:id/summarize`
  - `POST /api/knowledge/compare`
- Workspace analyst
  - `POST /api/workspace/query`
  - `GET /api/analyst/messages`
  - `PUT /api/analyst/messages`
- Quote
  - `POST /api/quote/build`
  - `POST /api/quote/approve`
  - `POST /api/quote/mark-sent`
  - `POST /api/quote/email`
  - `POST /api/quote/document`
  - `POST /api/quote/snapshot`
- Negotiation and follow-up
  - `GET /api/outcomes/pending`
  - `POST /api/outcomes`
  - `POST /api/follow-ups/prepare`
  - `POST /api/follow-ups/send`
  - `POST /api/follow-ups/schedule`
  - `GET /api/follow-ups/process-due`
- Complaints
  - `GET /api/complaints`
  - `POST /api/complaints`
  - `GET /api/complaints/:id`
  - `DELETE /api/complaints/:id`
- Demo controls
  - `POST /api/demo/seed`
  - `POST /api/demo/reset`

## Data Flow Map

### RFQ path

1. User uploads files or pastes email text in `#/intake`
2. Frontend calls `POST /api/intake`
3. Backend expands EML attachments, extracts file text, runs AI/heuristic analysis, validates specs, initializes workflow
4. Case is persisted through store layer
5. Case summaries are reloaded and displayed in `#/case`
6. Selected case can feed:
   - knowledge comparison
   - compliance mapping
   - quote draft generation
   - analyst context

### Knowledge path

1. User uploads support files in `#/knowledge`
2. Frontend calls `POST /api/knowledge/upload`
3. Backend extracts text and workbook metadata, classifies file, stores knowledge record
4. Case workflow can call `POST /api/knowledge/compare`
5. Comparison result is written back onto the case and surfaced in quote flow

### Quote path

1. User selects a case in `#/quote`
2. Frontend calls `POST /api/quote/build`
3. Backend uses knowledge files plus case facts to build quote estimate
4. Quote can be approved, snapshotted, turned into PDF/email, or marked sent
5. Quote lifecycle status drives `#/outcomes` and dashboard metrics

### Complaints path

1. User creates complaint from text and attachments, including `.eml`
2. Complaint is persisted with extracted context and attachment metadata
3. Complaint data is available to workspace analyst and dashboard complaint signals

### Demo path

1. User signs in and opens `#/dashboard`
2. Clicks `Load Demo Workspace`
3. Backend seeds per-user sample cases, knowledge files, complaint, and analyst thread
4. Dashboard, case, quote, negotiation, and complaint views populate immediately

## Integration Map

- Supabase Auth
  - Browser session token from [`/src/supabase.js`](/Users/ericzhuang/Downloads/mini-project/quotelligence/src/supabase.js)
  - Server validation in [`/server/supabase-auth.js`](/Users/ericzhuang/Downloads/mini-project/quotelligence/server/supabase-auth.js)
- Postgres
  - Shared persistence for cases, knowledge, complaints, analyst threads
- OpenAI
  - Case extraction
  - PDF OCR fallback
  - knowledge summaries
  - workspace analyst answers
  - quote email generation
- IMAP
  - RFQ mailbox sync
- SMTP
  - follow-up and quote email send actions

## Broken, Incomplete, Or Inconsistent Areas Found

### Fixed in this pass

- Root and app-shell routing ambiguity created login-loop behavior when the wrong shell was served
- Route tests were contaminated by local `.env` auth/database config, making them unreliable
- Database reset script only cleared cases and knowledge files, leaving complaints and analyst threads behind
- No demo-safe seeded workspace existed for a presenter
- Dashboard did not provide clear first-step controls or a clean empty-state story
- Non-JSON API fallback message referenced an outdated static-server preview workflow

### Still open or worth follow-up

- There is an internal `renderLandingPage` implementation in [`/src/app.js`](/Users/ericzhuang/Downloads/mini-project/quotelligence/src/app.js) that is currently not part of the live route map
- OpenAI-backed flows can log network fallback errors in offline or restricted environments even though heuristics recover
- Mailbox sync remains dependent on external IMAP server compatibility and cloud access rules
- No browser-driven end-to-end automation exists yet for the full presenter path

## Demo-Critical Risk List

### P0 resolved

- Demo data required manual DB manipulation
- Test suite gave false negatives because production-like env leaked into route tests
- Presenter had no obvious dashboard CTA to recover from an empty workspace

### P1 remaining

- Browser-level smoke verification for main demo path
- Cleanup of dead internal landing code path
- More explicit UI progress for some long-running quote/knowledge operations

## Tick-And-Tie Matrix

| Feature | Upstream dependency | Downstream dependency | Current status | Fix applied |
|---|---|---|---|---|
| Public landing | static root route | login entry to `/app#/login` | Working | root/app routing stabilized and smoke-tested |
| Dashboard | cases, knowledge, complaints, outcomes stats | presenter navigation into workflow | Working | demo CTA controls and empty state added |
| New RFQ intake | upload UI, parser, AI/heuristic extraction | case record creation | Working | existing flow retained and covered by passing route tests |
| Case registry | case persistence | quote, compliance, analyst | Working | route tests stabilized through env isolation |
| Knowledge base | upload pipeline and parser | case comparison, quote support | Working | knowledge upload flow remains connected; recent knowledge surfaced in dashboard |
| Quote builder | case detail + knowledge context | approval, sent state, outcomes | Working | unchanged core logic, now easier to demo via seeded data |
| Negotiation follow-up | quote lifecycle | send/schedule outcome actions | Working | seeded demo case includes active sent quote with due follow-up |
| Complaints | complaint intake + attachment parsing | dashboard and analyst context | Working | seeded complaint added for demo continuity |
| Demo reset | store layer | clean rerun of presenter flow | Working | new `/api/demo/reset` plus full workspace clear helper |
| Database reset script | Postgres env vars | clean backend reset | Working | expanded to clear all core tables and alternate DB env names |

## Fixes Made

- Added per-user demo seed and reset APIs
- Added realistic sample workspace dataset in [`/server/demo-data.js`](/Users/ericzhuang/Downloads/mini-project/quotelligence/server/demo-data.js)
- Added dashboard demo controls and clearer empty state
- Added per-user workspace clearing in store layer
- Expanded reset script to clear all persisted entities and support alternate DB env names
- Updated non-JSON API guidance to reference `/app`
- Stabilized route tests and added smoke checks for `/`, `/app`, and demo seed/reset

## Environment And Service Dependencies

- Required for full demo:
  - `SUPABASE_URL`
  - `SUPABASE_ANON_KEY` or `SUPABASE_PUBLISHABLE_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `DATABASE_URL` or accepted Postgres equivalent
- Optional but recommended:
  - `OPENAI_API_KEY`
  - IMAP variables for mailbox sync
  - SMTP variables for send/schedule email actions

## Open Items

- Add browser-level verification of demo script on a deployed environment
- Remove or quarantine unused internal landing-render path
- Add one-click UI exposure for resetting database-backed demo data at admin scope if multi-user demos become frequent
