# AutoQuote AI Decision Log

Status: Active
Owner: Codex
Date: 2026-03-29
Source PRD: `/Users/ericzhuang/Downloads/AutoQuote_AI_PRD_v2_ClaudeCode.md` v2.0
Next Step: Break the remaining PRD gaps into explicit backlog items.

## Decision Statement

Implement the PRD’s highest-value missing user workflows on top of the current Quotelligence architecture instead of replacing the whole stack in one rewrite.

## Context

The source PRD specifies a greenfield Python/FastAPI/React product with a fuller relational data model than the current app. The current repository already contains meaningful intake, knowledge, quote, and workflow functionality. The most user-visible missing value was not the framework mismatch. It was the absence of quote lifecycle review, sent-state tracking, outcome logging, and dashboard insights.

## Options Considered

- Rebuild the repository to the exact PRD stack now.
- Preserve the current architecture and add the missing value-loop features first.

## Decision Criteria

- Speed to a usable pilot
- Risk of breaking the live app
- Ability to close the largest user-facing gaps quickly

## Recommendation

Preserve the current stack and implement the quote lifecycle, follow-up, and insight layer first. Treat the full PRD schema migration as a second-phase technical program.

## Risks

- Some PRD concepts are approximated heuristically rather than backed by the target database model.
- The current dashboard and margin insights are useful but not yet as rigorous as the PRD intends.

## Follow-Up Actions

- Add explicit supplier-cost and historical-order tables to the persistent store.
- Strengthen line-level confidence and margin calculations with dedicated pricing evidence models.
- Expand dashboard analytics once the richer pricing/outcome data exists.
