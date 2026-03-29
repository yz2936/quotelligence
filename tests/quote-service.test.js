import assert from "node:assert/strict";
import test from "node:test";

import { buildFallbackQuoteEmail, buildQuoteDocument } from "../server/quote-service.js";

test("buildFallbackQuoteEmail creates a buyer-ready email from quote terms", () => {
  const email = buildFallbackQuoteEmail({
    caseRecord: {
      caseId: "QC-100",
      customerName: "HeatEx",
    },
    quoteEstimate: {
      currency: "USD",
      total: 25000,
      lineItems: [
        {
          productLabel: "316L Pipe",
          quantityText: "20 lengths",
        },
      ],
      terms: {
        buyerName: "Alex",
        buyerEmail: "alex@example.com",
        ccEmails: "sales@example.com",
        sellerEntity: "Quotelligence Metals",
        paymentTerms: "Net 30",
        validityTerms: "30 days",
        leadTime: "4 weeks",
        shippingTerms: "FOB Houston",
        quoteNotes: "Subject to final confirmation.",
      },
    },
    language: "en",
  });

  assert.equal(email.to, "alex@example.com");
  assert.equal(email.cc, "sales@example.com");
  assert.match(email.subject, /Formal Quotation|正式报价/);
  assert.match(email.body, /Commercial Terms|商务条款/);
  assert.match(email.body, /Payment Terms: Net 30/);
  assert.match(email.body, /attached/i);
  assert.match(String(email.attachmentFileName || ""), /\.pdf$/i);
});

test("buildQuoteDocument creates a PDF buffer with a formal filename", async () => {
  const result = await buildQuoteDocument({
    caseRecord: {
      caseId: "QC-200",
      customerName: "HeatEx",
      projectName: "Turnaround RFQ",
      quoteLifecycle: { quoteNumber: "Q-20260329-0200" },
    },
    quoteEstimate: {
      currency: "USD",
      total: 10000,
      subtotal: 9500,
      incoterm: "FOB Houston",
      lineItems: [
        {
          productLabel: "316L Pipe",
          quantityText: "10 lengths",
          finalPrice: 1000,
          unitPrice: 1000,
          lineTotal: 10000,
        },
      ],
      terms: {
        sellerEntity: "Quotelligence Metals",
        paymentTerms: "Net 30",
        validityTerms: "30 days",
        leadTime: "4 weeks",
        shippingTerms: "FOB Houston",
        quoteNotes: "Subject to mill confirmation.",
      },
    },
    language: "en",
  });

  assert.equal(result.contentType, "application/pdf");
  assert.match(result.fileName, /^Q-20260329-0200/i);
  assert.ok(result.buffer.length > 1000);
  assert.equal(result.buffer.slice(0, 4).toString("utf8"), "%PDF");
});
