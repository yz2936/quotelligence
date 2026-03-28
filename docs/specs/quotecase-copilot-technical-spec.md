# QuoteCase Copilot Technical Spec

- Date: 2026-03-25
- Owner: Codex
- Status: Updated for workbook-driven quote decision engine and checkpoint workflow control
- Linked PRD: `/incoming/prd/QuoteCase_Copilot_Product_Documentation.md`
- Next Step: Validate checkpoint pause/resume behavior across intake, knowledge review, quote build, and outbound draft flow

## Scope

- Keep the existing real intake and case workspace APIs.
- Keep the knowledge library focused on document upload, categorization, and storage.
- Add a separate quote workspace backed only by uploaded pricing references and prior commercial evidence.
- Add buyer-email draft generation from current quote terms and pricing.
- Add a deterministic workbook-driven quote decision engine for uploaded Excel knowledge files.
- Add a reusable decision-checkpoint engine that can pause progression, require a human decision, and append audit events to the case timeline.

## API Surface

- `POST /api/intake`
  Accepts `multipart/form-data` with `rfq_files[]`, `email_text`, `language`. Returns created `case`.
- `GET /api/cases`
  Returns summarized `cases[]` and `allowedStatuses[]`.
- `GET /api/cases/:id`
  Returns full `case`.
- `PATCH /api/cases/:id`
  Accepts editable `extractedFields`, optional `productItems`, optional `status`, optional knowledge artifacts. Returns updated `case`.
- `POST /api/cases/:id/checkpoints/:checkpointId/decision`
  Accepts `{ action, note, actor }`. Records a human decision or override for the target checkpoint, reevaluates workflow state, and returns updated `case`.
- `GET /api/knowledge`
  Returns `knowledgeFiles[]`.
- `POST /api/knowledge/upload`
  Accepts `multipart/form-data` with `knowledge_files[]`, optional `language`. Returns created `knowledgeFiles[]`.
- `POST /api/knowledge/compare`
  Accepts `{ caseId, language }`. Returns `comparison`, `case`, and `knowledgeFiles`.
- `POST /api/quote/build`
  Accepts `{ caseId, language }`. Returns `quoteEstimate` and updated `case`.
- `POST /api/quote/email`
  Accepts `{ caseId, quoteEstimate, language }`. Returns `emailDraft` and updated `case`.

## Data Contracts

- `KnowledgeFile`
  - `knowledgeFileId: string`
  - `name: string`
  - `type: string`
  - `category: string`
  - `summary: string`
  - `uploadedAt: string`
  - `extractedText: string`
  - optional internal `decisionWorkbook` normalized tables when an uploaded Excel file matches the quote-decision workbook pattern
- `ComparisonResultItem`
  - `requirement: string`
  - `status: "Supported" | "Likely Supported" | "Unclear" | "Not Found"`
  - `explanation: string`
  - `supportingFiles: string[]`
- `KnowledgeComparison`
  - `matchingSupport: ComparisonResultItem[]`
  - `partialSupport: ComparisonResultItem[]`
  - `missingSupport: ComparisonResultItem[]`
  - `suggestedReviewAreas: string[]`
  - `analysisSummary: string`
  - `recommendedStatus: "Under Knowledge Review" | "Partially Supported" | "Ready to Quote" | "Escalate Internally"`
  - `supportingFilesUsed: string[]`
- `QuoteEstimate`
  - `pricingStatus: string`
  - `currency: string`
  - `incoterm: string`
  - `lineItems[]` with `lineId`, `productId`, `productLabel`, `quantityText`, `quantityValue`, `quantityUnit`, `baseUnitPrice`, `adjustmentAmount`, `unitPrice`, `lineTotal`, `pricingBasis`, `supportingFiles`
  - `additionalCharges[]` with `chargeId`, `label`, `amount`
  - `subtotal: number`
  - `total: number`
  - `assumptions: string[]`
  - `risks: string[]`
  - `supportingFiles: string[]`
  - `recommendedNextStep: string`
  - `terms` with `buyerName`, `buyerEmail`, `ccEmails`, `sellerEntity`, `paymentTerms`, `validityTerms`, `leadTime`, `shippingTerms`, `quoteNotes`
  - optional `decisionRecommendation` with `sourceFiles`, normalized RFQ `inputSummary`, `recommendation` ranges, `drivers`, `matchedCases`, `assumptions`, and a human-readable `summary`
- `Workflow`
  - `currentCheckpointId: string`
  - `paused: boolean`
  - `lastEvaluatedAt: string`
  - `decisions: Record<string, { action, note, actor, timestamp }>`
  - `checkpoints[]` with `checkpointId`, `title`, `status`, `summary`, `checkedItems`, `unresolvedIssues`, `requiresDecision`, `availableActions`, and `decision`
- `TimelineEntry`
  - `eventId: string`
  - `timestamp: string`
  - `type: string`
  - `actor: string`
  - `source: string`
  - optional `checkpointId`, `title`, `status`
  - `summary: string`
  - optional `details` with before/after payloads
- `QuoteEmailDraft`
  - `to: string`
  - `cc: string`
  - `subject: string`
  - `body: string`
  - `preview: string`

## Workflow Rules

- Comparison must operate on one selected case at a time.
- Comparison should prefer uploaded evidence over inference.
- Missing support should not be upgraded to supported without explicit evidence.
- Draft quote generation should only use pricing-oriented files and past-quote evidence when available.
- Uploaded Excel knowledge files that match the quote-decision workbook pattern should be normalized into deterministic backend tables before quote recommendation logic runs.
- Workbook-based quote recommendations must remain interpretable: weighted historical similarity first, then load/supplier/material dependency adjustments, then strategy/risk output.
- Workflow progression must be stage-gated. When a checkpoint is partial, missing, or over the risk threshold, the system should pause at that node and wait for a human decision or case revision.
- Every checkpoint transition and decision event should append a timeline entry so the case has an audit trail.
- If pricing evidence is thin, the draft quote should say so explicitly and remain advisory.
- Case-level quote edits must be saved back through `PATCH /api/cases/:id`, and totals must be recalculated in the backend.
- Outbound quote email generation should use current case data and draft quote terms, and should remain conservative if data is incomplete.

## Acceptance Criteria

- Users can upload knowledge files and see them listed immediately.
- Users can upload a structured Excel knowledge workbook and have it recognized as a decision workbook.
- Users can compare a selected case against the knowledge library and receive grouped support output.
- Users can generate a draft quote when at least some pricing-related evidence exists.
- Users can see a tailored quote recommendation with price range, lead-time range, risk level, strategy, and matched historical cases when a decision workbook is available.
- Users can see checkpoint cards, unresolved issues, required actions, and case timeline entries in the case workspace.
- Users can approve, override, revise, add missing info, request follow-up, or skip with reason at a checkpoint and have the workflow reevaluate immediately.
- Users can edit draft quote line items, charges, currency, and incoterm from the case workspace.
- Case records preserve the latest comparison and draft-quote artifacts in memory.
