import assert from "node:assert/strict";
import test from "node:test";

import {
  buildKnowledgeLibraryContext,
  buildWorkspaceCaseContext,
  extractPdfTextWithOpenAI,
  normalizeCaseAnalysis,
  normalizeKnowledgeComparison,
  normalizeQuoteEmailDraft,
  normalizeKnowledgeFileMetadata,
  normalizeKnowledgeFileSummary,
  normalizeQuoteEstimate,
} from "../server/openai-client.js";

test("buildWorkspaceCaseContext includes case metadata and extracted fields", () => {
  const context = buildWorkspaceCaseContext([
    {
      caseId: "QC-001",
      customerName: "HeatEx",
      projectName: "Singapore RFQ Review",
      owner: "Avery Chen",
      status: "Needs Clarification",
      createdAt: "2026-03-24",
      updatedAt: "2026-03-24",
      extractedFields: [
        { fieldName: "Quantity", value: "1,200 meters" },
        { fieldName: "Material / Grade", value: "ASTM A312 TP316L" },
      ],
    },
  ]);

  assert.match(context, /QC-001/);
  assert.match(context, /HeatEx/);
  assert.match(context, /1,200 meters/);
  assert.match(context, /ASTM A312 TP316L/);
});

test("normalizeCaseAnalysis keeps product fields clean and trimmed", () => {
  const normalized = normalizeCaseAnalysis({
    customer_name: "  HeatEx Procurement Team  ",
    project_name: "",
    product_items: [
      {
        label: " 316L Pipe ",
        product_type: " Pipe ",
        material_grade: " ASTM A312 TP316L ",
        dimensions: " 2 in SCH40, 6m ",
        outside_dimension: " 2 in ",
        wall_thickness: " 0.154 in ",
        schedule: " sch40 ",
        length_per_piece: " 6m ",
        quantity: " 120 lengths ",
      },
      {
        label: " 304L Tube ",
        product_type: " Tube ",
        material_grade: " ASTM A312 304L ",
        dimensions: " 1.5 in x 3m ",
        outside_dimension: " 1.5 in ",
        wall_thickness: " Not clearly stated ",
        schedule: " Not clearly stated ",
        length_per_piece: " 3m ",
        quantity: " 80 lengths ",
      },
    ],
    product_type: "  Seamless Pipe  ",
    material_grade: " ASTM A312 TP316L ",
    dimensions: " 2 in SCH40, 6m ",
    outside_dimension: " 2 in ",
    wall_thickness: " 0.154 in ",
    schedule: " sch40 ",
    length_per_piece: " 6m ",
    quantity: " 1,200 meters ",
    requested_standards: " EN 10204 3.1 , NACE ",
    inspection_requirements: " PMI,  Hydrotest ",
    documentation_requirements: " EN 10204 3.1 certs ",
    delivery_request: " 6 weeks ",
    destination: " Singapore ",
    special_notes: "  Customer requests expedited review. ",
    missing_fields: ["  Delivery incoterm not stated. "],
    ambiguous_requirements: ["  Exact NACE standard reference still needs confirmation. "],
    low_confidence_items: ["  Dimensions: 2 in SCH40, 6m "],
    suggested_questions: ["  Please confirm the exact NACE standard. "],
    ai_summary: {
      what_customer_needs: "  Stainless seamless pipe for project delivery. ",
      straightforward: "  Material appears straightforward. ",
      needs_clarification: "  NACE detail still unclear. ",
      knowledge_base_checks: "  Check certificates and prior quotes. ",
      recommended_next_step: "  Confirm compliance details. ",
      main_risks: ["  Compliance detail may block quote. "],
    },
    current_status: " Needs Clarification ",
  });

  assert.equal(normalized.project_name, "Customer RFQ Review");
  assert.equal(normalized.product_type, "Seamless Pipe");
  assert.equal(normalized.product_items.length, 2);
  assert.equal(normalized.product_items[0].label, "316L Pipe");
  assert.equal(normalized.product_items[1].product_type, "Tube");
  assert.equal(normalized.material_grade, "ASTM A312 TP316L");
  assert.equal(normalized.outside_dimension, "2 in");
  assert.equal(normalized.wall_thickness, "0.154 in");
  assert.equal(normalized.schedule, "sch40");
  assert.equal(normalized.length_per_piece, "6m");
  assert.equal(normalized.requested_standards, "EN 10204 3.1, NACE");
  assert.equal(normalized.current_status, "Needs Clarification");
});

test("normalizeKnowledgeComparison trims results and supporting files", () => {
  const normalized = normalizeKnowledgeComparison({
    matching_support: [
      {
        requirement: " EN 10204 3.1 ",
        status: " Supported ",
        explanation: " Strong cert evidence found. ",
        supporting_files: [" cert-3.1.pdf "],
      },
    ],
    partial_support: [],
    missing_support: [],
    suggested_review_areas: [" Confirm pricing sheet freshness. "],
    analysis_summary: " 1 supported requirement found. ",
    recommended_status: " Ready to Quote ",
    supporting_files_used: [" cert-3.1.pdf "],
  });

  assert.equal(normalized.matchingSupport[0].requirement, "EN 10204 3.1");
  assert.equal(normalized.matchingSupport[0].status, "Supported");
  assert.equal(normalized.recommendedStatus, "Ready to Quote");
  assert.equal(normalized.supportingFilesUsed[0], "cert-3.1.pdf");
});

test("normalizeQuoteEstimate keeps quote fields compact", () => {
  const normalized = normalizeQuoteEstimate({
    pricing_status: " Draft quote ready ",
    currency: " USD ",
    incoterm: " FOB ",
    line_items: [
      {
        line_id: " line-1 ",
        product_id: " product-1 ",
        product_label: " 316L Pipe ",
        quantity_text: " 120 lengths ",
        quantity_value: 120,
        quantity_unit: " lengths ",
        base_unit_price: 1250,
        adjustment_amount: 25,
        unit_price: 1275,
        line_total: 153000,
        pricing_basis: " Prior quote sheet ",
        supporting_files: [" quote-history.xlsx "],
      },
    ],
    additional_charges: [
      {
        charge_id: " charge-freight ",
        label: " Freight ",
        amount: 1200,
      },
    ],
    subtotal: 153000,
    total: 154200,
    terms: {
      buyer_name: " Alex Morgan ",
      buyer_email: " alex@example.com ",
      cc_emails: " sales@example.com ",
      seller_entity: " Quotelligence Metals ",
      payment_terms: " Net 30 ",
      validity_terms: " 30 days ",
      lead_time: " 4 weeks ",
      shipping_terms: " FOB Houston ",
      quote_notes: " Subject to final mill confirmation. ",
    },
    assumptions: [" Freight excluded "],
    risks: [" Alloy surcharge may move "],
    supporting_files: [" quote-history.xlsx "],
    recommended_next_step: " Review before issue ",
    summary: " Draft quote created from prior quote evidence. ",
  });

  assert.equal(normalized.currency, "USD");
  assert.equal(normalized.lineItems[0].lineId, "line-1");
  assert.equal(normalized.lineItems[0].productLabel, "316L Pipe");
  assert.equal(normalized.lineItems[0].quantityText, "120 lengths");
  assert.equal(normalized.lineItems[0].baseUnitPrice, 1250);
  assert.equal(normalized.lineItems[0].unitPrice, 1275);
  assert.equal(normalized.lineItems[0].supportingFiles[0], "quote-history.xlsx");
  assert.equal(normalized.additionalCharges[0].amount, 1200);
  assert.equal(normalized.subtotal, 153000);
  assert.equal(normalized.total, 154200);
  assert.equal(normalized.terms.buyerEmail, "alex@example.com");
  assert.equal(normalized.terms.shippingTerms, "FOB Houston");
});

test("normalizeQuoteEmailDraft trims buyer-ready email fields", () => {
  const normalized = normalizeQuoteEmailDraft({
    to: " buyer@example.com ",
    cc: " sales@example.com ",
    subject: " QC-001 Draft Quote ",
    body: " Dear Customer,\nPlease find our quote attached. ",
    preview: " Draft quote prepared for HeatEx. ",
  });

  assert.equal(normalized.to, "buyer@example.com");
  assert.equal(normalized.cc, "sales@example.com");
  assert.equal(normalized.subject, "QC-001 Draft Quote");
  assert.match(normalized.body, /Please find our quote/);
});

test("normalizeKnowledgeFileMetadata keeps category and summary grounded", () => {
  const normalized = normalizeKnowledgeFileMetadata({
    category: " Standards Reference ",
    summary: " ASTM A312/A312M standard for seamless and welded stainless steel pipe. ",
    confidence: " high ",
  });

  assert.equal(normalized.category, "Standards Reference");
  assert.equal(normalized.summary, "ASTM A312/A312M standard for seamless and welded stainless steel pipe.");
  assert.equal(normalized.confidence, "high");
});

test("extractPdfTextWithOpenAI sends the PDF as an input_file and returns extracted text", async () => {
  const originalFetch = global.fetch;
  const originalApiKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-key";

  let requestBody = null;
  global.fetch = async (_url, options) => {
    requestBody = JSON.parse(options.body);
    return {
      ok: true,
      async json() {
        return {
          output_text: "ASTM A312 TP316L\nQuantity: 1200 meters",
        };
      },
    };
  };

  try {
    const text = await extractPdfTextWithOpenAI({
      fileName: "rfq.pdf",
      buffer: Buffer.from("fake-pdf"),
    });

    assert.match(text, /ASTM A312 TP316L/);
    assert.equal(requestBody.model, "gpt-5");
    assert.equal(requestBody.input[0].content[0].type, "input_file");
    assert.equal(requestBody.input[0].content[0].filename, "rfq.pdf");
    assert.match(requestBody.input[0].content[0].file_data, /^data:application\/pdf;base64,/);
  } finally {
    global.fetch = originalFetch;
    process.env.OPENAI_API_KEY = originalApiKey;
  }
});

test("normalizeKnowledgeFileSummary trims grounded document summaries", () => {
  const normalized = normalizeKnowledgeFileSummary({
    summary: " ASTM A312 standard covering seamless and welded stainless steel pipe requirements. ",
  });

  assert.equal(normalized.summary, "ASTM A312 standard covering seamless and welded stainless steel pipe requirements.");
});

test("buildKnowledgeLibraryContext includes category and summary", () => {
  const context = buildKnowledgeLibraryContext([
    {
      knowledgeFileId: "kf-1",
      name: "pricing-sheet.txt",
      type: "TXT",
      category: "Pricing Tool",
      summary: "Pricing Tool: USD 1250 per ton",
      extractedText: "USD 1250 per ton for ASTM A312 TP316L pipe",
    },
  ]);

  assert.match(context, /Pricing Tool/);
  assert.match(context, /pricing-sheet\.txt/);
  assert.match(context, /USD 1250/);
});
