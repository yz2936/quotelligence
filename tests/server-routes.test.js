import assert from "node:assert/strict";
import { Readable } from "node:stream";
import test from "node:test";

import { handleRequest } from "../server.js";
import { __resetStoreForTests, saveCase } from "../server/store.js";

test("system status route returns JSON", async () => {
  const response = await invokeRoute({
    method: "GET",
    url: "/api/system/status",
  });

  assert.equal(response.statusCode, 200);
  assert.match(String(response.headers["content-type"] || ""), /application\/json/i);

  const payload = JSON.parse(response.body);
  assert.equal(payload.system.backendAvailable, true);
});

test("intake route returns JSON 422 when a PDF cannot be parsed", async () => {
  const formData = new FormData();
  formData.append(
    "rfq_files",
    new File(["%PDF-1.6 unreadable"], "broken.pdf", { type: "application/pdf" })
  );
  formData.append("email_text", "");
  formData.append("language", "en");

  const request = new Request("http://localhost/api/intake", {
    method: "POST",
    body: formData,
  });

  const response = await invokeRoute({
    method: "POST",
    url: "/api/intake",
    headers: Object.fromEntries(request.headers.entries()),
    body: Buffer.from(await request.arrayBuffer()),
  });

  assert.equal(response.statusCode, 422);
  assert.match(String(response.headers["content-type"] || ""), /application\/json/i);
  assert.equal(JSON.parse(response.body).error, "cannot parse PDF");
});

test("delete case route removes a stored case", async () => {
  __resetStoreForTests();
  await saveCase({
    caseId: "QC-DELETE",
    createdAt: "2026-03-29",
    updatedAt: "2026-03-29",
    customerName: "Acme",
  });

  const response = await invokeRoute({
    method: "DELETE",
    url: "/api/cases/QC-DELETE",
  });

  assert.equal(response.statusCode, 200);
  assert.equal(JSON.parse(response.body).deletedCaseId, "QC-DELETE");
});

test("quote approval route blocks red lines without final prices", async () => {
  __resetStoreForTests();
  await saveCase({
    caseId: "QC-APPROVAL",
    createdAt: "2026-03-29",
    updatedAt: "2026-03-29",
    customerName: "Acme",
    projectName: "Pilot",
    productItems: [{ productId: "product-1", label: "Pipe", quantity: "10 pcs" }],
    quoteEstimate: {
      currency: "USD",
      total: 0,
      lineItems: [
        {
          lineId: "line-1",
          productId: "product-1",
          productLabel: "Pipe",
          quantityText: "10 pcs",
          quantityValue: 10,
          quantityUnit: "pcs",
          unitPrice: 0,
          finalPrice: null,
          reviewFlag: "RED",
        },
      ],
    },
  });

  const response = await invokeRoute({
    method: "POST",
    url: "/api/quote/approve",
    headers: { "content-type": "application/json" },
    body: Buffer.from(JSON.stringify({ caseId: "QC-APPROVAL", language: "en" })),
  });

  assert.equal(response.statusCode, 422);
  assert.match(JSON.parse(response.body).error, /approval blocked/i);
});

test("dashboard stats route returns JSON insight payload", async () => {
  __resetStoreForTests();
  await saveCase({
    caseId: "QC-DASH",
    createdAt: "2026-03-20",
    updatedAt: "2026-03-29",
    customerName: "Acme",
    projectName: "Pilot",
    quoteEstimate: {
      currency: "USD",
      total: 12500,
      blendedMarginPct: 18.4,
      lineItems: [{ reviewFlag: "GREEN" }, { reviewFlag: "YELLOW" }],
    },
    quoteLifecycle: {
      status: "sent",
      sentAt: "2026-03-28T10:00:00.000Z",
      followUpDue: "2026-03-29T10:00:00.000Z",
    },
  });

  const response = await invokeRoute({
    method: "GET",
    url: "/api/dashboard/stats",
  });

  assert.equal(response.statusCode, 200);
  assert.match(String(response.headers["content-type"] || ""), /application\/json/i);
  const payload = JSON.parse(response.body);
  assert.equal(typeof payload.stats.pendingFollowUps, "number");
  assert.ok(Array.isArray(payload.stats.topCustomers));
});

async function invokeRoute({ method, url, headers = {}, body = Buffer.alloc(0) }) {
  const req = Readable.from(body);
  req.method = method;
  req.url = url;
  req.headers = headers;

  const response = {
    statusCode: 200,
    headers: {},
    body: "",
  };

  const res = {
    headersSent: false,
    writeHead(statusCode, nextHeaders = {}) {
      response.statusCode = statusCode;
      response.headers = Object.fromEntries(
        Object.entries(nextHeaders).map(([key, value]) => [key.toLowerCase(), value])
      );
      this.headersSent = true;
      return this;
    },
    end(chunk = "") {
      response.body += Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
      this.headersSent = true;
    },
  };

  await handleRequest(req, res);
  return response;
}
