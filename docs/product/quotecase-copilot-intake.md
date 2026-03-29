# QuoteCase Copilot Intake

- Date: 2026-03-25
- Owner: Codex
- Status: Updated for quote-builder expansion
- Linked PRD: `/incoming/prd/QuoteCase_Copilot_Product_Documentation.md`
- Next Step: Verify the editable draft-quote builder with real pricing evidence

## Executive Summary

The original PRD positions QuoteCase Copilot as an RFQ intake and validation workspace, with knowledge comparison included in V1 and pricing excluded from V1. The current requested change expands scope to activate the knowledge base section and add quote generation support from uploaded pricing knowledge. This implementation now treats quote generation as a constrained draft-quote builder with editable line items, not a full pricing engine or CPQ system.

## Facts

- The PRD includes knowledge file upload and comparison analysis in V1.
- The PRD explicitly lists pricing engine and formal quote generation as out of scope for V1.
- The user now wants the knowledge area reactivated and wants quote generation informed by knowledge-base pricing files.
- The current codebase already has backend intake, case storage, case editing, and a routed knowledge screen placeholder.

## Assumptions

- Pricing in this slice means a draft quote builder grounded in uploaded pricing references, past quotes, and spreadsheets.
- In-memory storage remains acceptable for this stage.
- Uploaded documents are shared workspace assets, not per-user private files.
- `TXT`, `EML`, and text-readable `PDF` files will produce the strongest early results; other binary office formats remain best-effort.

## Inferred Delta

- Knowledge comparison moves from placeholder to active workflow.
- The workspace gains a reusable knowledge library for MTCs, certifications, standards notes, pricing sheets, past quotes, and similar support files.
- Users can run a comparison for a selected case and review matched support, partial support, missing support, and caution areas.
- Users can generate a draft quote when pricing-supporting files exist and then adjust it inside the case workspace.

## Risks

- Pricing output quality depends heavily on the quality and structure of uploaded pricing files.
- The app still lacks durable persistence, so uploaded knowledge files and generated comparisons can reset across cold starts or redeploys.
- Some document types may upload successfully but provide weak extraction due to limited local parsing.

## Recommended Next Skills

- `technical-spec-writer`
- `implementation-planner`
- `qa-release-manager`
