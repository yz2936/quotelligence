# Demo Punchlist

Date: 2026-04-06
Owner: Codex

## P0 Must Fix Before Demo

- Verify the latest Vercel deployment is serving `/` as the standalone landing page and `/app` as the product shell
- Run one live browser walkthrough of the seeded demo workspace on the deployed environment
- Confirm Supabase auth, Postgres persistence, and SMTP settings are aligned in the same deployment

## P1 Should Fix If Time Permits

- Remove the now-unused internal landing route implementation from [`/src/app.js`](/Users/ericzhuang/Downloads/mini-project/quotelligence/src/app.js)
- Add browser automation smoke tests for login, dashboard seed, case open, quote review, and outcomes
- Tighten loading/progress affordances for quote build and knowledge comparison in screen-share scenarios
- Add an explicit dashboard “Open Demo Case” shortcut to jump directly into `QC-DEMO-001`

## P2 Polish Or Future Improvement

- Add admin-only seeded personas and multiple demo scenarios
- Add richer timeline visualization across case, complaint, and negotiation events
- Add downloadable presenter notes inside the product
- Normalize some longer AI summaries into denser executive-style cards
