# QuoteCase Copilot Architecture

- Date: 2026-03-25
- Owner: Codex
- Status: Updated for draft quote builder
- Linked PRD: `/incoming/prd/QuoteCase_Copilot_Product_Documentation.md`
- Next Step: Persist cases, knowledge files, and draft quotes beyond memory

## Decision

Extend the current minimal Node backend with a parallel knowledge-library slice and a case-level draft quote builder instead of folding pricing logic into ad hoc frontend state.

## Components

- `server.js`
  Exposes intake, case, knowledge upload, knowledge comparison, quote build, and quote email endpoints.
- `server/intake-service.js`
  Builds structured case records from RFQ intake.
- `server/knowledge-service.js`
  Normalizes uploaded knowledge files, drives comparison, and supports pricing evidence extraction.
- `server/quote-service.js`
  Builds editable draft quotes and generates buyer-email drafts from current quote state.
- `server/openai-client.js`
  Holds modular `gpt-5.4` prompt calls for intake extraction, workspace Q&A, knowledge comparison, and quote building.
- `server/store.js`
  Keeps in-memory `cases[]` and `knowledgeFiles[]`.
- `src/api.js`
  Frontend client for case, knowledge, comparison, and pricing requests.
- `src/main.js`
  Owns browser state for intake, workspace, analyst, and knowledge workflows.
- `src/app.js`
  Renders the knowledge library screen, the separate quote workspace, and the case modal.

## Data Model

- `Case`
  Existing RFQ record plus optional `knowledgeComparison` and `quoteEstimate` used as the current draft quote.
- `KnowledgeFile`
  Workspace document with `knowledgeFileId`, `name`, `type`, `category`, `summary`, `uploadedAt`, and extracted text.
- `KnowledgeComparison`
  `matchingSupport[]`, `partialSupport[]`, `missingSupport[]`, `suggestedReviewAreas[]`, `analysisSummary`, `recommendedStatus`, `supportingFilesUsed[]`.
- `QuoteEstimate`
  `pricingStatus`, `currency`, `incoterm`, `lineItems[]`, `additionalCharges[]`, `subtotal`, `total`, `assumptions[]`, `risks[]`, `supportingFiles[]`, `recommendedNextStep`.

## Data Flow

1. Users upload RFQ files and create a structured case.
2. Users upload knowledge files into a shared in-memory knowledge library.
3. Frontend fetches cases and knowledge files when the knowledge or quote route loads.
4. Users select a case in the quote workspace and run knowledge comparison.
5. Backend sends the case plus knowledge-file evidence into a modular comparison routine and returns grouped support results.
6. Users request a draft quote based on pricing-oriented knowledge files and past quote evidence.
7. Backend stores comparison, draft-quote, and quote-email artifacts back onto the case record for reuse in the UI.
8. Users edit line-item pricing, commercial terms, and additional charges in the quote workspace, and the backend recalculates totals on every save.
9. Users generate a buyer-facing quote email draft from the current quote state, then launch their mail client to send it.

## Risks

- In-memory knowledge files reset on restart.
- Pricing outputs are advisory draft quotes, not approved commercial quotes.
- Large binary documents may contribute little evidence if local extraction is weak.
