# AutoQuote AI Requirements

Status: Draft
Owner: Codex
Date: 2026-03-29
Source PRD: `/Users/ericzhuang/Downloads/AutoQuote_AI_PRD_v2_ClaudeCode.md` v2.0
Next Step: Convert remaining gaps into implementation tickets.

## Functional Requirements

- `REQ-001`: The tool must ingest RFQ text and uploaded files into a structured case.
- `REQ-002`: The tool must generate a draft quote with editable line items and commercial terms.
- `REQ-003`: The tool must classify quote lines into review flags so users can distinguish grounded lines from weak lines.
- `REQ-004`: The tool must prevent quote approval when red lines still lack a final price.
- `REQ-005`: The tool must support quote lifecycle states at least through draft, approved, sent, and outcome logged.
- `REQ-006`: The tool must let users log outcomes as won, lost, negotiating, or no response.
- `REQ-007`: The tool must expose pending follow-ups for sent quotes.
- `REQ-008`: The tool must show dashboard insights for win rate, quote volume, follow-ups, flag distribution, and top customers.

## Insight Requirements

- `INS-001`: Users must see which quote lines are safest to approve automatically.
- `INS-002`: Users must see which lines require manual pricing before approval.
- `INS-003`: Users must see quote-level checklist items before sending.
- `INS-004`: Users must see which sent quotes are overdue for outcome capture.
- `INS-005`: Users must see top-level business metrics without manually exporting data.

## Current Implementation Status

- `REQ-001`: Implemented
- `REQ-002`: Implemented
- `REQ-003`: Implemented in heuristic form
- `REQ-004`: Implemented
- `REQ-005`: Implemented in the current case-centric model
- `REQ-006`: Implemented
- `REQ-007`: Implemented
- `REQ-008`: Implemented in summary form

## Remaining Gaps Against The PRD

- Full relational quote, outcome, and historical order schema is not yet implemented.
- Supplier-cost freshness and margin intelligence do not yet match the PRD’s dedicated pricing agent design.
- Dashboard analytics are derived from current stored case data, not a dedicated reporting model.

