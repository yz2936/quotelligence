import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCaseFromSubmission,
  deriveCaseStatus,
  getAllowedCaseStatuses,
  normalizeAnalysisResult,
} from "../server/intake-service.js";

test("buildCaseFromSubmission parses uploaded intake into a real case record", async () => {
  const file = new File(
    [
      "Customer: HeatEx Procurement Team\nPlease quote seamless pipe ASTM A312 TP316L 2 in SCH40, 6m, 1200 meters, EN 10204 3.1, PMI, hydrotest, delivery 6 weeks to Singapore. NACE may be required.",
    ],
    "rfq.txt",
    { type: "text/plain" }
  );

  const result = await buildCaseFromSubmission({
    files: [file],
    emailText:
      "Customer: HeatEx Procurement Team\nPlease confirm whether witness inspection can be included.",
    now: new Date("2026-03-24T12:34:56Z"),
  });

  assert.equal(result.caseId, "QC-20260324123456");
  assert.equal(result.customerName, "HeatEx Procurement Team");
  assert.equal(result.extractedFields.length, 14);
  assert.equal(result.productItems.length, 1);
  assert.equal(result.status, "Needs Clarification");
  assert.ok(
    result.suggestedQuestions.some((question) => question.toLowerCase().includes("nace"))
  );
});

test("deriveCaseStatus keeps unresolved work out of ready-to-quote", () => {
  assert.equal(
    deriveCaseStatus({
      missingFields: ["Destination is not clearly stated."],
      ambiguousRequirements: [],
      lowConfidenceItems: [],
    }),
    "Needs Clarification"
  );

  assert.equal(
    deriveCaseStatus({
      missingFields: [],
      ambiguousRequirements: [],
      lowConfidenceItems: ["Dimensions: 2 in SCH40"],
    }),
    "Ready for Review"
  );

  assert.equal(
    deriveCaseStatus({
      missingFields: [],
      ambiguousRequirements: [],
      lowConfidenceItems: [],
    }),
    "Ready to Quote"
  );
});

test("deriveCaseStatus tolerates missing arrays", () => {
  assert.equal(deriveCaseStatus({}), "Ready to Quote");
  assert.equal(
    deriveCaseStatus({
      missingFields: ["Destination is not clearly stated."],
    }),
    "Needs Clarification"
  );
});

test("normalizeAnalysisResult accepts agent pipeline response shape", () => {
  const normalized = normalizeAnalysisResult({
    customerName: "HeatEx Procurement Team",
    projectName: "RFQ HX-42",
    extractedFields: [
      { fieldName: "Requested Standards", value: "ASTM A312" },
      { fieldName: "Delivery Request", value: "6 weeks" },
      { fieldName: "Destination", value: "Singapore" },
    ],
    productItems: [
      {
        label: "316L Pipe",
        productType: "Seamless Pipe",
        materialGrade: "ASTM A312 TP316L",
        outsideDimension: "2 in",
        wallThickness: "SCH40",
        lengthPerPiece: "6 m",
        quantity: "1200 meters",
      },
    ],
    missingInfo: {
      missingFields: [],
      ambiguousRequirements: ["Exact NACE requirement is not stated."],
      lowConfidenceItems: [],
    },
    status: "Needs Clarification",
  });

  assert.equal(normalized.customer_name, "HeatEx Procurement Team");
  assert.equal(normalized.project_name, "RFQ HX-42");
  assert.equal(normalized.product_type, "Seamless Pipe");
  assert.equal(normalized.material_grade, "ASTM A312 TP316L");
  assert.equal(normalized.requested_standards, "ASTM A312");
  assert.equal(normalized.delivery_request, "6 weeks");
  assert.equal(normalized.destination, "Singapore");
  assert.deepEqual(normalized.ambiguous_requirements, ["Exact NACE requirement is not stated."]);
  assert.equal(normalized.current_status, "Needs Clarification");
});

test("allowed statuses match the PRD workflow", () => {
  assert.deepEqual(getAllowedCaseStatuses(), [
    "New",
    "Parsing",
    "Ready for Review",
    "Needs Clarification",
    "Under Knowledge Review",
    "Partially Supported",
    "Ready to Quote",
    "Escalate Internally",
  ]);
});
