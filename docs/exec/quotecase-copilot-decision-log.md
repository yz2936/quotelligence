# QuoteCase Copilot Decision Log

- Date: 2026-03-25
- Owner: Codex
- Status: Updated for workbook-backed quote decision engine
- Linked PRD: `/incoming/prd/QuoteCase_Copilot_Product_Documentation.md`
- Next Step: Expand workbook alias coverage and decide when to persist normalized decision tables

## Decision Statement

Add a deterministic workbook-driven quote decision engine inside the existing knowledge and quote workflow instead of introducing a separate service or opaque model path first.

## Context

- The delivery doc `docs/delivery/codex_prompt_quote_decision_engine.md` requires historical matching plus load/supplier dependency adjustments.
- Users want to upload Excel knowledge sheets directly into the current knowledge base and get tailored RFQ decisions without leaving the product.
- The repo already has a live Node-based intake, knowledge, and quote stack, so a second backend stack would add immediate technical debt.

## Options Considered

- Leave workbook uploads as plain text knowledge files and rely only on LLM summarization.
- Create a separate Python microservice now for workbook ingestion and recommendation.
- Extend the current backend with deterministic workbook normalization and recommendation modules.

## Decision Criteria

- Smallest safe change set
- Interpretability for pricing and strategy output
- Reuse of existing upload and quote routes
- Low risk of breaking current UI and API behavior

## Recommendation

Implement the third option. Recognize structured Excel workbooks during knowledge upload, normalize them in the backend, then feed deterministic recommendation output into the existing quote builder and case overview.

## Risks

- Workbook schemas may drift from the expected sheet names and column aliases
- Memory-only storage means normalized tables disappear on restart
- Users may over-trust recommendations if workbook quality is poor

## Follow-up Actions

- Expand alias coverage as real workbooks arrive
- Add persistence for normalized workbook tables
- Tighten UI copy around recommendation confidence and advisory use

## Prior Decision

Activate the knowledge workspace now with real uploads, evidence-based comparison, and a constrained draft quote builder instead of waiting for a full persistence or CPQ layer.

## Context

- The PRD includes knowledge comparison in V1.
- The current code already has real intake and case APIs but the knowledge area is still a placeholder.
- The user explicitly wants uploaded MTCs, certifications, standards, and pricing tools to influence case review and quote output.
- The next critical milestone is fast commercial usability, which requires editable pricing lines and totals inside the case workspace.

## Options Considered

- Keep the knowledge page stubbed until a full persistence layer exists.
- Add upload plus comparison only, but leave pricing entirely absent.
- Add upload, comparison, and a constrained draft quote builder backed by uploaded pricing evidence.

## Decision Criteria

- Smallest viable change set
- Reuse of the existing backend boundary
- Ability to test real documents immediately
- Avoidance of a premature CPQ abstraction

## Recommendation

Implement the third option. Treat quote generation as an evidence-based draft artifact, not a final quote engine.

## Risks

- Users may over-trust draft quotes
- Memory-only storage limits repeatability
- Weak document extraction will lower evidence quality

## Follow-up Actions

- Add knowledge-file storage and APIs
- Add comparison and draft-quote routines
- Keep all AI prompts modular for later refinement

## Additional Decision

Add a reusable Decision Checkpoint Engine inside the current case workflow instead of handling missing information, risk review, and final quote approval as ad hoc UI state.

## Context

- The product now has real intake, knowledge review, historical retrieval, deterministic recommendation, and outbound draft steps.
- Users need the system to pause, explain why it is pausing, capture the human decision, and then resume safely from the blocked point.
- The case record is already the shared object across these workflow stages, so it is the correct home for checkpoint state and timeline audit entries.

## Recommendation

Keep checkpoint evaluation in the backend and store the resulting workflow and timeline on the case. The frontend should render checkpoint state and submit explicit user decisions, but it should not own the gating logic.
