# AutoQuote AI Intake

Status: Active
Owner: Codex
Date: 2026-03-29
Source PRD: `/Users/ericzhuang/Downloads/AutoQuote_AI_PRD_v2_ClaudeCode.md` v2.0
Next Step: Continue closing PRD-to-product gaps, starting with deeper database modeling and richer historical pricing ingestion.

## Executive Summary

The PRD defines AutoQuote AI as a four-stage RFQ-to-quote workflow with human review, quote sending, outcome capture, and dashboard insights. The existing Quotelligence codebase already covered intake, normalization-style parsing, knowledge review, quote drafting, and guided workspace decisions, but it was missing the strongest value loop from the PRD: quote lifecycle review, sent-status tracking, outcome logging, and KPI visibility.

This implementation pass aligns the product more closely to the PRD by:

- preserving quote line review state
- adding review flags and checklist generation
- adding quote approval and mark-sent actions
- adding outcome follow-up logging
- adding dashboard statistics and follow-up visibility

## Goals

- Give sales users a reviewable draft quote instead of only a transient pricing table.
- Make the tool useful after quote generation by tracking approval, send, and outcome states.
- Surface operational insights that help users prioritize follow-up and understand quote quality.

## Non-Goals

- Rebuild the app into the exact Python/FastAPI/React/Tailwind stack described in the PRD.
- Replace the existing case-centric data model with the full PRD relational schema in one pass.
- Implement pgvector semantic search or a full historical order warehouse in this iteration.

## Actors

- Sales rep reviewing incoming RFQs and draft quotes
- Quote reviewer approving or adjusting flagged lines
- Sales manager tracking outcomes and follow-ups

## Requirement Inventory

- `REQ-001`: Intake RFQ documents and create structured case records.
- `REQ-002`: Produce human-reviewable quote drafts with per-line signals.
- `REQ-003`: Require manual attention for weak or unsupported quote lines.
- `REQ-004`: Allow quote approval and sent-state tracking.
- `REQ-005`: Prompt sales users to record quote outcomes.
- `REQ-006`: Provide KPI and follow-up insights from stored quote activity.

## Constraints And Dependencies

- Existing codebase is Node/vanilla JS, not the PRD’s greenfield Python/React stack.
- Persistence depends on the configured runtime database connection.
- Pricing confidence is limited by uploaded knowledge quality and current pricing evidence.

## Risks And Open Questions

- The current quote review flags are heuristic and not yet backed by the PRD’s full supplier-cost schema.
- Dashboard margin metrics currently depend on draft pricing signals rather than a full supplier-cost ledger.
- Historical pricing and outcome learning remain shallower than the PRD’s target state.

## Recommended Next Skills

- `product-manager`
- `technical-spec-writer`
- `implementation-planner`
- `qa-release-manager`

