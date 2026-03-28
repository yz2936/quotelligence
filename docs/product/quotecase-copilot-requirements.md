# QuoteCase Copilot Requirements

- Date: 2026-03-25
- Owner: Codex
- Status: Updated for draft quote builder
- Linked PRD: `/incoming/prd/QuoteCase_Copilot_Product_Documentation.md`
- Next Step: Validate the editable draft quote flow against real pricing files

## Requirement Inventory

- `REQ-001` Intake must support RFQ file upload and pasted email text and create one case per RFQ.
- `REQ-002` Case records must store extracted product, commercial, and compliance details in structured editable form.
- `REQ-003` Cases may contain multiple product items and users must be able to review them individually.
- `REQ-004` The knowledge library must allow upload of internal support files including MTCs, certificates, standards references, past quotes, pricing sheets, and related documentation.
- `REQ-005` The system must classify or label uploaded knowledge files so users can understand what evidence is available.
- `REQ-006` Users must be able to select a case and compare it against the uploaded knowledge library from the quote workflow.
- `REQ-007` Comparison output must group findings into matching support, partial support, missing support, and suggested review areas.
- `REQ-008` Comparison output must cite supporting files where practical.
- `REQ-009` Case status after knowledge review must stay within the PRD status set.
- `REQ-010` The system must support a draft quote builder generated from pricing-oriented knowledge files and past quote evidence.
- `REQ-011` The draft quote builder must expose editable line items, evidence-backed pricing basis, and computed totals.
- `REQ-012` Draft quote output must make assumptions and supporting files visible and must not claim to be a final approved quote.
- `REQ-013` The quote workflow must expose editable commercial terms and business terms including buyer contact, payment terms, validity, lead time, shipping/commercial terms, and notes.
- `REQ-014` The quote workflow must generate a buyer-facing outbound email draft from the current quote and terms.
- `REQ-015` AI behaviors for extraction, comparison, pricing, and quote-email drafting must remain modular so prompts and persistence can evolve without rewriting the UI.

## Non-Goals

- `NGR-001` No ERP writeback.
- `NGR-002` No formal CPQ or approval workflow.
- `NGR-003` No persistent database in this slice.
- `NGR-004` No guaranteed deep binary parsing for every office file format.

## Open Questions

- `Q-001` Should knowledge files eventually be global to the workspace, customer-specific, or business-unit-specific?
- `Q-002` Should draft quotes become versioned artifacts on the case record?
- `Q-003` What pricing guardrails are required before a quote estimate can be exposed to production users?
