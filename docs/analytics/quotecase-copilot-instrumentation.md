# QuoteCase Copilot Instrumentation

- Date: 2026-03-25
- Owner: Codex
- Status: Deferred but updated
- Linked PRD: `/incoming/prd/QuoteCase_Copilot_Product_Documentation.md`
- Next Step: Add lightweight event capture once persistence is introduced

## Priority Events

- Intake started
- Files attached
- Case created
- Case field edited
- Knowledge file uploaded
- Knowledge comparison run
- Draft quote generated
- Draft quote line edited
- Draft quote charges edited
- Analyst question submitted

## Notes

- No runtime analytics pipeline is being added in this slice.
- Event names should stay aligned to the active workflows so later telemetry can be wired with minimal UI churn.
