import assert from "node:assert/strict";
import test from "node:test";

import { buildFallbackQuoteEmail } from "../server/quote-service.js";

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
  assert.match(email.subject, /QC-100/);
  assert.match(email.body, /Quoted total: USD 25000.00/);
  assert.match(email.body, /Payment terms: Net 30/);
});
