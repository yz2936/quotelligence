import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import {
  buildKnowledgeComparison,
  buildKnowledgeFilesFromUpload,
  buildQuoteEstimate,
  normalizeStoredQuoteEstimate,
  summarizeKnowledgeFile,
} from "../server/knowledge-service.js";

const execFileAsync = promisify(execFile);

test("buildKnowledgeFilesFromUpload classifies pricing and certification files", async () => {
  const files = [
    new File(["USD 1250 per ton for ASTM A312 TP316L pipe"], "pricing-sheet.txt", { type: "text/plain" }),
    new File(["EN 10204 3.1 certificate for ASTM A312 TP316L"], "cert-3.1.txt", { type: "text/plain" }),
  ];

  const uploaded = await buildKnowledgeFilesFromUpload({
    files,
    now: new Date("2026-03-25T04:00:00Z"),
  });

  assert.equal(uploaded.length, 2);
  assert.equal(uploaded[0].category, "Pricing Tool");
  assert.equal(uploaded[1].category, "Certificate");
});

test("buildKnowledgeFilesFromUpload suppresses unreadable pdf binary previews", async () => {
  const files = [
    new File(
      ["%PDF-1.6 470 0 obj <</Linearized 1/L 175467/O 472/E 105424/N 7/T 175044/H [ 491 285]>> endobj"],
      "ASTM-A312_A312M-2013a.pdf",
      { type: "application/pdf" }
    ),
  ];

  const uploaded = await buildKnowledgeFilesFromUpload({
    files,
    now: new Date("2026-03-25T04:00:00Z"),
  });

  assert.equal(uploaded[0].category, "Standards Reference");
  assert.equal(uploaded[0].extractedText, "");
  assert.match(uploaded[0].summary, /insufficient/i);
});

test("buildKnowledgeComparison falls back to heuristic support grouping", async () => {
  const caseRecord = {
    caseId: "QC-001",
    customerName: "HeatEx",
    projectName: "RFQ Review",
    owner: "Avery",
    status: "Needs Clarification",
    productItems: [
      {
        label: "316L Pipe",
        productType: "Pipe",
        materialGrade: "ASTM A312 TP316L",
        dimensions: "2 in SCH40",
        quantity: "120 lengths",
      },
    ],
    extractedFields: [
      { fieldName: "Requested Standards", value: "EN 10204 3.1, NACE" },
      { fieldName: "Inspection Requirements", value: "PMI, Hydrotest" },
      { fieldName: "Documentation Requirements", value: "EN 10204 3.1 MTC" },
    ],
  };

  const knowledgeFiles = await buildKnowledgeFilesFromUpload({
    files: [
      new File(["ASTM A312 TP316L pipe cert with EN 10204 3.1 and PMI"], "support-cert.txt", { type: "text/plain" }),
      new File(["General capability matrix"], "capability.txt", { type: "text/plain" }),
    ],
    now: new Date("2026-03-25T04:00:00Z"),
  });

  const comparison = await buildKnowledgeComparison({
    caseRecord,
    knowledgeFiles,
    language: "en",
  });

  assert.ok(comparison.matchingSupport.length + comparison.partialSupport.length > 0);
  assert.ok(["Under Knowledge Review", "Partially Supported", "Ready to Quote"].includes(comparison.recommendedStatus));
});

test("buildQuoteEstimate falls back to pricing evidence when OpenAI is unavailable", async () => {
  const caseRecord = {
    caseId: "QC-001",
    productItems: [
      {
        productId: "product-1",
        label: "316L Pipe",
        quantity: "120 lengths",
      },
    ],
  };

  const knowledgeFiles = await buildKnowledgeFilesFromUpload({
    files: [
      new File(["USD 1250 per ton for ASTM A312 TP316L pipe"], "pricing-sheet.txt", { type: "text/plain" }),
    ],
    now: new Date("2026-03-25T04:00:00Z"),
  });

  const quoteEstimate = await buildQuoteEstimate({
    caseRecord,
    knowledgeFiles,
    language: "en",
  });

  assert.equal(quoteEstimate.currency, "USD");
  assert.equal(quoteEstimate.lineItems.length, 1);
  assert.equal(quoteEstimate.lineItems[0].baseUnitPrice, 1250);
  assert.equal(quoteEstimate.lineItems[0].lineTotal, 150000);
  assert.equal(quoteEstimate.total, 150000);
});

test("normalizeStoredQuoteEstimate recalculates totals from editable pricing fields", () => {
  const normalized = normalizeStoredQuoteEstimate({
    caseRecord: {
      caseId: "QC-002",
      productItems: [
        {
          productId: "product-1",
          label: "304L Tube",
          quantity: "10 pcs",
        },
      ],
    },
    quoteEstimate: {
      currency: "USD",
      lineItems: [
        {
          lineId: "line-1",
          productId: "product-1",
          productLabel: "304L Tube",
          quantityText: "10 pcs",
          baseUnitPrice: "50",
          adjustmentAmount: "5",
          pricingBasis: "Manual override",
          supportingFiles: [],
        },
      ],
      additionalCharges: [
        { chargeId: "charge-freight", label: "Freight", amount: "100" },
      ],
    },
  });

  assert.equal(normalized.lineItems[0].unitPrice, 55);
  assert.equal(normalized.lineItems[0].lineTotal, 550);
  assert.equal(normalized.subtotal, 550);
  assert.equal(normalized.total, 650);
  assert.equal(normalized.lineItems[0].reviewFlag, "RED");
  assert.ok(Array.isArray(normalized.reviewChecklist));
  assert.equal(normalized.flagCounts.red, 1);
});

test("summarizeKnowledgeFile falls back cleanly when text is missing", async () => {
  const result = await summarizeKnowledgeFile({
    knowledgeFile: {
      knowledgeFileId: "kf-1",
      name: "scan.pdf",
      type: "PDF",
      category: "Certificate",
      extractedText: "",
    },
    language: "en",
  });

  assert.match(result.summary, /enough readable text/i);
});

test("buildKnowledgeFilesFromUpload recognizes a quote decision workbook from xlsx sheets", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "quotecase-decision-kb-"));
  const xlDir = path.join(tempDir, "xl");
  const worksheetsDir = path.join(xlDir, "worksheets");
  const relsDir = path.join(tempDir, "_rels");

  await fs.mkdir(worksheetsDir, { recursive: true });
  await fs.mkdir(relsDir, { recursive: true });
  await fs.mkdir(path.join(xlDir, "_rels"), { recursive: true });
  await fs.writeFile(path.join(tempDir, "[Content_Types].xml"), `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
</Types>`);
  await fs.writeFile(path.join(relsDir, ".rels"), `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`);
  await fs.writeFile(path.join(xlDir, "workbook.xml"), `<?xml version="1.0" encoding="UTF-8"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Historical_Orders" sheetId="1" r:id="rId1"/>
    <sheet name="Ongoing_Deals" sheetId="2" r:id="rId2"/>
    <sheet name="Suppliers" sheetId="3" r:id="rId3"/>
    <sheet name="Customers" sheetId="4" r:id="rId4"/>
  </sheets>
</workbook>`);
  await fs.writeFile(path.join(xlDir, "_rels", "workbook.xml.rels"), `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet3.xml"/>
  <Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet4.xml"/>
</Relationships>`);
  await fs.writeFile(path.join(worksheetsDir, "sheet1.xml"), `<?xml version="1.0" encoding="UTF-8"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>
  <row r="1"><c r="A1" t="inlineStr"><is><t>Order ID</t></is></c><c r="B1" t="inlineStr"><is><t>Quoted Price USD Per Ton</t></is></c></row>
  <row r="2"><c r="A2" t="inlineStr"><is><t>ORD-1</t></is></c><c r="B2"><v>1250</v></c></row>
</sheetData></worksheet>`);
  await fs.writeFile(path.join(worksheetsDir, "sheet2.xml"), `<?xml version="1.0" encoding="UTF-8"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>
  <row r="1"><c r="A1" t="inlineStr"><is><t>Primary Workcenter</t></is></c></row>
  <row r="2"><c r="A2" t="inlineStr"><is><t>WC-01</t></is></c></row>
</sheetData></worksheet>`);
  await fs.writeFile(path.join(worksheetsDir, "sheet3.xml"), `<?xml version="1.0" encoding="UTF-8"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>
  <row r="1"><c r="A1" t="inlineStr"><is><t>Supplier ID</t></is></c></row>
  <row r="2"><c r="A2" t="inlineStr"><is><t>MILL-A</t></is></c></row>
</sheetData></worksheet>`);
  await fs.writeFile(path.join(worksheetsDir, "sheet4.xml"), `<?xml version="1.0" encoding="UTF-8"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>
  <row r="1"><c r="A1" t="inlineStr"><is><t>Customer ID</t></is></c></row>
  <row r="2"><c r="A2" t="inlineStr"><is><t>C-1</t></is></c></row>
</sheetData></worksheet>`);

  const archivePath = path.join(tempDir, "historical_quote_kb_sample.xlsx");
  await execFileAsync("zip", ["-qr", archivePath, "."], { cwd: tempDir });
  const buffer = await fs.readFile(archivePath);

  const uploaded = await buildKnowledgeFilesFromUpload({
    files: [new File([buffer], "historical_quote_kb_sample.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })],
    now: new Date("2026-03-25T04:00:00Z"),
  });

  assert.equal(uploaded[0].category, "Quote Decision Workbook");
  assert.equal(uploaded[0].decisionWorkbook.counts.historical_orders, 1);
  assert.match(uploaded[0].summary, /quote decision workbook/i);

  await fs.rm(tempDir, { recursive: true, force: true });
});
