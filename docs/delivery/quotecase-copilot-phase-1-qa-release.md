# QuoteCase Copilot QA And Release

- Date: 2026-03-24
- Owner: Codex
- Status: Updated for backend intake slice
- Linked PRD: `/incoming/prd/QuoteCase_Copilot_Product_Documentation.md`
- Next Step: Add manual browser checks for `PDF` and `EML` uploads

## Checks

- Syntax checks for backend and frontend source files
- Node tests for intake-service parsing and status logic
- Import smoke checks for key frontend and backend modules

## Release Notes

- The app now runs behind a Node server instead of a static file server.
- Intake and case editing use real API calls.
- Case records are temporary and reset when the server restarts.
