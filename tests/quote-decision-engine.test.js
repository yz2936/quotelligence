import assert from "node:assert/strict";
import test from "node:test";

import { buildQuoteDecisionRecommendation, normalizeDecisionWorkbook } from "../server/quote-decision-engine.js";

test("normalizeDecisionWorkbook maps expected workbook sheets into normalized tables", () => {
  const workbook = normalizeDecisionWorkbook({
    fileName: "historical_quote_kb_sample.xlsx",
    workbook: {
      sheets: [
        {
          sheetName: "Historical_Orders",
          rows: [
            {
              "Order ID": "ORD-001",
              "Product Category": "Seamless Pipe",
              "Material Grade": "ASTM A312 TP316L",
              "Quoted Price USD Per Ton": "1250",
            },
          ],
        },
        {
          sheetName: "Ongoing_Deals",
          rows: [{ "Primary Workcenter": "WC-02", "Booked Capacity Pct": "82" }],
        },
        {
          sheetName: "Suppliers",
          rows: [{ "Supplier ID": "MILL-A", "Reliability Score 100": "87" }],
        },
        {
          sheetName: "Customers",
          rows: [{ "Customer ID": "C-001", "Customer Region": "APAC" }],
        },
      ],
    },
  });

  assert.equal(workbook.tables.historical_orders[0].order_id, "ORD-001");
  assert.equal(workbook.tables.historical_orders[0].quoted_price_usd_per_ton, 1250);
  assert.equal(workbook.counts.ongoing_deals, 1);
});

test("buildQuoteDecisionRecommendation returns deterministic recommendation from workbook data and RFQ", () => {
  const decisionWorkbook = normalizeDecisionWorkbook({
    fileName: "historical_quote_kb_sample.xlsx",
    workbook: {
      sheets: [
        {
          sheetName: "Historical_Orders",
          rows: [
            {
              "Order ID": "ORD-001",
              "Product Category": "Seamless Pipe",
              "Manufacturing Route": "Seamless",
              "Material Grade": "ASTM A312 TP316L",
              "Grade Family": "316",
              "Outer Diameter MM": "60.3",
              "Wall Thickness MM": "3.91",
              "Total Weight Tons": "8",
              "Complexity Score": "6",
              "Tolerance Level": "Standard",
              "Test Requirements": "PMI, Hydrotest",
              "Cert Requirements": "EN 10204 3.1",
              "Supplier ID": "MILL-A",
              "Customer Type": "Existing EPC",
              "Relationship Level": "Key",
              "Quoted Price USD Per Ton": "1320",
              "Actual Lead Time Days": "34",
              "Promised Lead Time Days": "30",
              "Gross Margin Pct": "18",
              "Order Outcome": "Won",
              "Primary Workcenter": "WC-02",
            },
            {
              "Order ID": "ORD-002",
              "Product Category": "Seamless Pipe",
              "Manufacturing Route": "Seamless",
              "Material Grade": "ASTM A312 TP316L",
              "Grade Family": "316",
              "Outer Diameter MM": "60.3",
              "Wall Thickness MM": "5.54",
              "Total Weight Tons": "9",
              "Complexity Score": "7",
              "Tolerance Level": "Standard",
              "Test Requirements": "PMI, Hydrotest",
              "Cert Requirements": "EN 10204 3.1",
              "Supplier ID": "MILL-A",
              "Customer Type": "Existing EPC",
              "Relationship Level": "Key",
              "Quoted Price USD Per Ton": "1360",
              "Actual Lead Time Days": "38",
              "Promised Lead Time Days": "33",
              "Gross Margin Pct": "17",
              "Order Outcome": "Won",
              "Primary Workcenter": "WC-02",
            },
          ],
        },
        {
          sheetName: "Ongoing_Deals",
          rows: [
            { "Primary Workcenter": "WC-02", "Booked Capacity Pct": "46", "Booked Hours": "190" },
            { "Primary Workcenter": "WC-02", "Booked Capacity Pct": "41", "Booked Hours": "150" },
          ],
        },
        {
          sheetName: "Suppliers",
          rows: [
            {
              "Supplier ID": "MILL-A",
              "Avg Promised Lead Days": "29",
              "Avg Actual Lead Days": "36",
              "On Time Rate Pct": "78",
              "Reliability Score 100": "74",
            },
          ],
        },
        {
          sheetName: "Customers",
          rows: [
            {
              "Customer ID": "GCPS-01",
              "Customer Name": "Gulf Coast Process Systems",
              "Customer Region": "Americas",
              "Customer Type": "Existing EPC",
              "Relationship Level": "Key",
            },
          ],
        },
      ],
    },
  });

  const result = buildQuoteDecisionRecommendation({
    language: "en",
    caseRecord: {
      caseId: "QC-100",
      customerName: "Gulf Coast Process Systems",
      aiSummary: {},
      extractedFields: [
        { fieldName: "Inspection Requirements", value: "PMI, Hydrotest" },
        { fieldName: "Documentation Requirements", value: "EN 10204 3.1" },
        { fieldName: "Delivery Request", value: "4 weeks" },
      ],
      productItems: [
        {
          label: "316L Seamless Pipe",
          productType: "Seamless Pipe",
          materialGrade: "ASTM A312 TP316L",
          outsideDimension: '2.375 in',
          wallThickness: '0.154 in',
          lengthPerPiece: "6m",
          quantity: "8 tons",
        },
      ],
    },
    knowledgeFiles: [
      {
        knowledgeFileId: "kf-1",
        name: "historical_quote_kb_sample.xlsx",
        category: "Quote Decision Workbook",
        decisionWorkbook,
      },
    ],
  });

  assert.equal(result.sourceFiles[0], "historical_quote_kb_sample.xlsx");
  assert.equal(result.recommendation.riskLevel, "High");
  assert.ok(result.recommendation.recommendedPricePerTonLow > 0);
  assert.ok(result.recommendation.recommendedLeadTimeDaysHigh >= result.recommendation.recommendedLeadTimeDaysLow);
  assert.ok(result.matchedCases.length >= 2);
  assert.match(result.summary, /Strategy/);
});
