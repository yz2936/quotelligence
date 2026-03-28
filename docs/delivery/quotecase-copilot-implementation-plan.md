# QuoteCase Copilot Implementation Plan

- Date: 2026-03-25
- Owner: Codex
- Status: In Progress, workbook-backed quote decision slice and checkpoint workflow active
- Linked PRD: `/incoming/prd/QuoteCase_Copilot_Product_Documentation.md`
- Next Step: Verify checkpoint pause/resume behavior and timeline audit coverage end to end

## Phase

Implement the smallest coherent workbook-backed quote decision slice on top of the live knowledge and quote workspaces.

## Work Items

1. Keep in-memory knowledge-file storage and API endpoints as the current base.
2. Split the UI so the knowledge page is document-library only and the quote page owns pricing and outbound communication.
3. Upgrade pricing generation from a read-only estimate to an editable draft quote with backend total recalculation.
4. Add buyer-email draft generation from current quote terms and pricing.
5. Normalize uploaded Excel decision workbooks into historical-orders, ongoing-deals, suppliers, workcenters, and customers tables.
6. Run deterministic recommendation logic against the active RFQ using weighted similarity and dependency adjustments.
7. Surface recommendation summary, strategy, risk, and matched cases inside the quote and case workspaces.
8. Add a reusable checkpoint workflow engine with validation gates, decision actions, and case timeline logging.
9. Surface checkpoint cards, unresolved issues, and audit history inside the case modal.
10. Add tests for workbook normalization, decision recommendation generation, checkpoint pause/resume behavior, pricing normalization, recomputation, and quote-email draft behavior.
11. Restart preview server and verify the end-to-end flow manually.

## Dependencies

- Existing case intake API
- Existing `gpt-5.4` backend client
- Existing bilingual frontend framework
- Existing XLSX text extraction path, now extended to structured workbook parsing
- Existing case modal and quote workspace, now extended with checkpoint control UI

## Main Risks

- Weak extraction from binary office files
- Pricing drafts may still be low confidence when workbook columns differ materially from the expected schema
- Memory-only storage makes repeated verification sessions fragile
- The checkpoint engine currently persists only in memory, so audit continuity still resets on server restart
