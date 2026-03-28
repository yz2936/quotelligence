import assert from "node:assert/strict";
import test from "node:test";

import { applyCheckpointDecision, initializeCaseWorkflow, syncCaseWorkflow } from "../server/workflow-engine.js";

function buildBaseCase() {
  return {
    caseId: "QC-200",
    customerName: "Gulf Coast Process Systems",
    projectName: "RFQ Review",
    owner: "Avery",
    status: "Needs Clarification",
    createdAt: "2026-03-25",
    updatedAt: "2026-03-25",
    sourceFiles: [{ fileId: "src-1", name: "rfq.pdf", type: "PDF" }],
    productItems: [
      {
        productId: "product-1",
        label: "316L Seamless Pipe",
        productType: "Seamless Pipe",
        materialGrade: "316L",
        dimensions: "60.3 x 3.91 x 6m",
        outsideDimension: "60.3 mm",
        wallThickness: "3.91 mm",
        schedule: "SCH40",
        lengthPerPiece: "6 m",
        quantity: "2 tons",
      },
    ],
    extractedFields: [{ fieldName: "Delivery Request", value: "4 weeks", confidence: "high" }],
    missingInfo: {
      missingFields: [],
      ambiguousRequirements: [],
      lowConfidenceItems: [],
    },
    aiSummary: {
      whatCustomerNeeds: "Quote for 316L seamless pipe",
      straightforward: "Material and dimensions clear",
      needsClarification: "",
      knowledgeBaseChecks: "",
      recommendedNextStep: "Proceed to quote",
      mainRisks: [],
      currentStatus: "Ready to Quote",
    },
    suggestedQuestions: [],
    knowledgeComparison: {
      recommendedStatus: "Ready to Quote",
      analysisSummary: "Support coverage looks acceptable.",
      suggestedReviewAreas: [],
    },
    quoteEstimate: {
      pricingStatus: "Draft quote ready",
      currency: "USD",
      incoterm: "FOB",
      lineItems: [
        {
          lineId: "line-1",
          productId: "product-1",
          productLabel: "316L Seamless Pipe",
          quantityText: "2 tons",
          quantityValue: 2,
          quantityUnit: "tons",
          baseUnitPrice: 4400,
          adjustmentAmount: 0,
          unitPrice: 4400,
          lineTotal: 8800,
          pricingBasis: "Historical workbook",
          supportingFiles: ["historical_quote_kb_sample.xlsx"],
        },
      ],
      additionalCharges: [],
      subtotal: 8800,
      total: 8800,
      terms: {
        buyerName: "Alex",
        buyerEmail: "alex@example.com",
        ccEmails: "",
        sellerEntity: "QuoteCase",
        paymentTerms: "Net 30",
        validityTerms: "30 days",
        leadTime: "28-35 days",
        shippingTerms: "FOB Houston",
        quoteNotes: "",
      },
      assumptions: [],
      risks: [],
      supportingFiles: ["historical_quote_kb_sample.xlsx"],
      recommendedNextStep: "Review before issue",
      summary: "Draft quote ready.",
      decisionRecommendation: {
        sourceFiles: ["historical_quote_kb_sample.xlsx"],
        matchedCases: [
          { orderId: "ORD-001", similarityScore: 0.88 },
          { orderId: "ORD-014", similarityScore: 0.83 },
          { orderId: "ORD-027", similarityScore: 0.81 },
        ],
        drivers: ["Risk acceptable."],
        assumptions: ["grade_family derived from material_grade"],
        summary: "Balanced recommendation available.",
        recommendation: {
          recommendedPricePerTonLow: 4300,
          recommendedPricePerTonHigh: 4500,
          recommendedTotalPriceLow: 8600,
          recommendedTotalPriceHigh: 9000,
          recommendedLeadTimeDaysLow: 28,
          recommendedLeadTimeDaysHigh: 35,
          riskScore0To100: 42,
          riskLevel: "Medium",
          winProbabilityEstimate: 0.48,
          recommendedStrategy: "balanced",
          explanationBullets: ["Risk acceptable."],
          matchedCaseIds: ["ORD-001", "ORD-014", "ORD-027"],
        },
      },
    },
    quoteEmailDraft: null,
    workflow: null,
    timeline: [],
  };
}

test("initializeCaseWorkflow pauses at requirements completeness when missing information exists", () => {
  const initialized = initializeCaseWorkflow({
    caseRecord: {
      ...buildBaseCase(),
      missingInfo: {
        missingFields: ["Destination missing."],
        ambiguousRequirements: ["NACE reference unclear."],
        lowConfidenceItems: [],
      },
    },
    now: new Date("2026-03-25T12:00:00Z"),
  });

  assert.equal(initialized.workflow.currentCheckpointId, "requirements_completeness");
  assert.equal(
    initialized.workflow.checkpoints.find((entry) => entry.checkpointId === "requirements_completeness").status,
    "Waiting for user decision"
  );
  assert.ok(initialized.timeline.length > 0);
});

test("checkpoint approval resumes the workflow forward to outbound generation", () => {
  const initialized = initializeCaseWorkflow({
    caseRecord: buildBaseCase(),
    now: new Date("2026-03-25T12:00:00Z"),
  });

  assert.equal(initialized.workflow.currentCheckpointId, "final_sales_decision_gate");

  const approved = applyCheckpointDecision({
    caseRecord: initialized,
    checkpointId: "final_sales_decision_gate",
    action: "approve",
    note: "Commercially acceptable to issue.",
    actor: "sales_user",
    now: new Date("2026-03-25T12:05:00Z"),
  });

  assert.equal(
    approved.workflow.checkpoints.find((entry) => entry.checkpointId === "final_sales_decision_gate").status,
    "Completed and moved forward"
  );
  assert.equal(approved.workflow.currentCheckpointId, "outbound_draft_generation");
  assert.ok(approved.timeline.some((entry) => entry.type === "checkpoint.decision"));
});

test("field edits are captured in the workflow timeline before and after re-evaluation", () => {
  const initialized = initializeCaseWorkflow({
    caseRecord: buildBaseCase(),
    now: new Date("2026-03-25T12:00:00Z"),
  });
  const updated = syncCaseWorkflow({
    previousCase: initialized,
    nextCase: {
      ...initialized,
      extractedFields: [{ fieldName: "Delivery Request", value: "6 weeks", confidence: "high" }],
    },
    actor: "sales_user",
    source: "case_patch",
    now: new Date("2026-03-25T12:06:00Z"),
  });

  const entry = updated.timeline.find((item) => item.type === "case.fields_updated");
  assert.ok(entry);
  assert.equal(entry.details.before[0].value, "4 weeks");
  assert.equal(entry.details.after[0].value, "6 weeks");
});
