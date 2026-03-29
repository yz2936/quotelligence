# QuoteCase Copilot QA / Release

- Date: 2026-03-25
- Owner: Codex
- Status: Draft
- Linked PRD: `/incoming/prd/QuoteCase_Copilot_Product_Documentation.md`
- Next Step: Run automated checks and manual preview validation

## Test Focus

- Knowledge files upload successfully and appear in the list.
- Structured Excel knowledge workbooks are recognized and normalized without breaking ordinary document uploads.
- Knowledge page remains document-library focused and does not mix in quote controls.
- Comparison handles empty libraries, thin evidence, and strong evidence paths.
- Draft-quote generation shows assumptions, supporting files, editable line items, and computed totals.
- Workbook-backed quote recommendation shows interpretable price range, lead-time range, risk level, strategy, and matched historical cases.
- Checkpoint workflow pauses on missing information, partial support, or risk review and resumes only after a recorded decision or case revision.
- Every checkpoint transition and checkpoint decision adds an audit entry to the case timeline.
- Case-level quote edits recalculate line totals, subtotal, and total on the backend.
- Quote email generation produces a buyer-facing draft from current quote terms.
- Case status remains within allowed workflow states after comparison.
- Chinese and English labels still render correctly on the knowledge screen.

## Release Risks

- Uploaded files and generated artifacts disappear on restart.
- Draft quotes may overfit to poor pricing evidence if users upload weak source files.
- Workbook column drift may weaken similarity scoring or dependency adjustments until column aliases are expanded.
- Users may interpret draft quote output as approved quote output unless it is clearly labeled as draft guidance.
- Checkpoint decisions and audit history currently rely on the `/tmp` store and are not truly durable across redeploys.
