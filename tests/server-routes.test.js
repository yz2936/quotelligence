import assert from "node:assert/strict";
import { Readable } from "node:stream";
import test from "node:test";

import { handleRequest } from "../server.js";
import { __resetStoreForTests, saveCase, saveKnowledgeFile } from "../server/store.js";

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

test("knowledge upload accepts unreadable PDFs and stores a fallback summary", async () => {
  __resetStoreForTests();

  const formData = new FormData();
  formData.append(
    "knowledge_files",
    new File(["%PDF-1.6 unreadable"], "reference.pdf", { type: "application/pdf" })
  );
  formData.append("language", "en");

  const request = new Request("http://localhost/api/knowledge/upload", {
    method: "POST",
    body: formData,
  });

  const response = await invokeRoute({
    method: "POST",
    url: "/api/knowledge/upload",
    headers: Object.fromEntries(request.headers.entries()),
    body: Buffer.from(await request.arrayBuffer()),
  });

  assert.equal(response.statusCode, 201);
  assert.match(String(response.headers["content-type"] || ""), /application\/json/i);
  const payload = JSON.parse(response.body);
  assert.equal(payload.knowledgeFiles.length, 1);
  assert.match(payload.knowledgeFiles[0].summary, /uploaded|not enough text|文本/i);
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

test("delete knowledge route removes a stored knowledge file", async () => {
  __resetStoreForTests();
  await saveKnowledgeFile({
    knowledgeFileId: "KF-DELETE",
    uploadedAt: "2026-04-04T12:00:00.000Z",
    name: "obsolete-reference.pdf",
    type: "PDF",
    category: "Certificates",
    summary: "Old reference file.",
  });

  const response = await invokeRoute({
    method: "DELETE",
    url: "/api/knowledge/KF-DELETE",
  });

  assert.equal(response.statusCode, 200);
  assert.equal(JSON.parse(response.body).deletedKnowledgeFileId, "KF-DELETE");
});

test("complaints routes store and return complaint records", async () => {
  __resetStoreForTests();

  const formData = new FormData();
  formData.append("complaint_title", "Damaged shipment");
  formData.append("customer_name", "HeatEx");
  formData.append("email_text", "Customer reported bent tubes on arrival.");
  formData.append("language", "en");
  formData.append("complaint_files", new File(["inspection notes"], "inspection.txt", { type: "text/plain" }));

  const request = new Request("http://localhost/api/complaints", {
    method: "POST",
    body: formData,
  });

  const createResponse = await invokeRoute({
    method: "POST",
    url: "/api/complaints",
    headers: Object.fromEntries(request.headers.entries()),
    body: Buffer.from(await request.arrayBuffer()),
  });

  assert.equal(createResponse.statusCode, 201);
  const created = JSON.parse(createResponse.body).complaint;
  assert.equal(created.customerName, "HeatEx");
  assert.equal(created.attachments.length, 1);

  const listResponse = await invokeRoute({
    method: "GET",
    url: "/api/complaints",
  });

  assert.equal(listResponse.statusCode, 200);
  assert.equal(JSON.parse(listResponse.body).complaints.length, 1);

  const detailResponse = await invokeRoute({
    method: "GET",
    url: `/api/complaints/${created.complaintId}`,
  });

  assert.equal(detailResponse.statusCode, 200);
  assert.equal(JSON.parse(detailResponse.body).complaint.complaintTitle, "Damaged shipment");
});

test("delete complaint route removes a stored complaint record", async () => {
  __resetStoreForTests();

  const formData = new FormData();
  formData.append("complaint_title", "Damaged shipment");
  formData.append("customer_name", "HeatEx");
  formData.append("email_text", "Customer reported bent tubes on arrival.");
  formData.append("language", "en");

  const request = new Request("http://localhost/api/complaints", {
    method: "POST",
    body: formData,
  });

  const createResponse = await invokeRoute({
    method: "POST",
    url: "/api/complaints",
    headers: Object.fromEntries(request.headers.entries()),
    body: Buffer.from(await request.arrayBuffer()),
  });

  const complaintId = JSON.parse(createResponse.body).complaint.complaintId;
  const deleteResponse = await invokeRoute({
    method: "DELETE",
    url: `/api/complaints/${complaintId}`,
  });

  assert.equal(deleteResponse.statusCode, 200);
  assert.equal(JSON.parse(deleteResponse.body).deletedComplaintId, complaintId);
});

test("analyst messages route stores and returns persisted chat history", async () => {
  __resetStoreForTests();

  const saveResponse = await invokeRoute({
    method: "PUT",
    url: "/api/analyst/messages",
    headers: {
      "content-type": "application/json",
    },
    body: Buffer.from(
      JSON.stringify({
        messages: [
          {
            id: "msg-1",
            role: "user",
            text: "Summarize the active quote risks.",
            createdAt: "2026-04-04T12:00:00.000Z",
          },
        ],
      })
    ),
  });

  assert.equal(saveResponse.statusCode, 200);

  const loadResponse = await invokeRoute({
    method: "GET",
    url: "/api/analyst/messages",
  });

  assert.equal(loadResponse.statusCode, 200);
  assert.equal(JSON.parse(loadResponse.body).messages.length, 1);
});

test("complaints route expands .eml uploads into full email context and extracted attachments", async () => {
  __resetStoreForTests();

  const eml = [
    "From: lisa.lee@example.com",
    "To: service@brava-steel.com",
    "Subject: Bent tubes from March shipment",
    "MIME-Version: 1.0",
    'Content-Type: multipart/mixed; boundary="complaint-boundary"',
    "",
    "--complaint-boundary",
    'Content-Type: text/plain; charset="utf-8"',
    "",
    "We found bent tubes in the latest shipment. Please investigate the lot and advise corrective action.",
    "",
    "--complaint-boundary",
    'Content-Type: text/plain; name="notes.txt"',
    "Content-Transfer-Encoding: base64",
    'Content-Disposition: attachment; filename="notes.txt"',
    "",
    Buffer.from("Internal inspection note: 12 tubes bent near bundle edge.").toString("base64"),
    "--complaint-boundary--",
    "",
  ].join("\r\n");

  const formData = new FormData();
  formData.append("complaint_title", "");
  formData.append("customer_name", "HeatEx");
  formData.append("email_text", "");
  formData.append("language", "en");
  formData.append("complaint_files", new File([eml], "complaint.eml", { type: "message/rfc822" }));

  const request = new Request("http://localhost/api/complaints", {
    method: "POST",
    body: formData,
  });

  const response = await invokeRoute({
    method: "POST",
    url: "/api/complaints",
    headers: Object.fromEntries(request.headers.entries()),
    body: Buffer.from(await request.arrayBuffer()),
  });

  assert.equal(response.statusCode, 201);
  const complaint = JSON.parse(response.body).complaint;
  assert.match(complaint.complaintTitle, /Bent tubes from March shipment/);
  assert.match(complaint.emailText, /Subject: Bent tubes from March shipment/);
  assert.match(complaint.emailText, /Please investigate the lot/);
  assert.equal(complaint.attachments.length, 1);
  assert.equal(complaint.attachments[0].name, "notes.txt");
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
  await saveKnowledgeFile({
    knowledgeFileId: "KF-DASH",
    uploadedAt: "2026-03-29T12:00:00.000Z",
    name: "pricing-reference.xlsx",
    type: "Spreadsheet",
    category: "Pricing",
    summary: "Recent price list.",
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
  assert.equal(typeof payload.stats.revenueInPlay, "number");
  assert.ok(Array.isArray(payload.stats.blockedQuotes));
  assert.ok(payload.stats.pipelineCounts);
  assert.ok(Array.isArray(payload.stats.narrative));
  assert.ok(payload.stats.casesByKnowledgeStatus);
  assert.ok(Array.isArray(payload.stats.knowledgeCategoryMix));
});

test("pending outcomes route includes sent quotes even before they are overdue", async () => {
  __resetStoreForTests();
  await saveCase({
    caseId: "QC-PENDING",
    createdAt: "2026-03-29",
    updatedAt: "2026-03-29",
    customerName: "Acme",
    projectName: "Pilot",
    quoteEstimate: {
      currency: "USD",
      total: 9500,
      lineItems: [{ reviewFlag: "GREEN" }],
    },
    quoteLifecycle: {
      status: "sent",
      sentAt: "2026-03-29T10:00:00.000Z",
      followUpDue: "2099-03-30T10:00:00.000Z",
    },
  });

  const response = await invokeRoute({
    method: "GET",
    url: "/api/outcomes/pending",
  });

  assert.equal(response.statusCode, 200);
  const payload = JSON.parse(response.body);
  assert.equal(payload.items.length, 1);
  assert.equal(payload.items[0].caseId, "QC-PENDING");
  assert.equal(payload.items[0].status, "sent");
  assert.ok(Array.isArray(payload.completedItems));
  assert.equal(typeof payload.summary.activeCount, "number");
});

test("pending outcomes route returns completed negotiation records", async () => {
  __resetStoreForTests();
  await saveCase({
    caseId: "QC-WON",
    createdAt: "2026-03-29",
    updatedAt: "2026-03-29",
    customerName: "HeatEx",
    projectName: "Expansion",
    quoteEstimate: {
      currency: "USD",
      total: 12000,
      lineItems: [{ reviewFlag: "GREEN" }],
    },
    quoteLifecycle: {
      status: "won",
      outcome: "won",
      recordedAt: "2026-03-30T10:00:00.000Z",
      recordedBy: "eric@company.com",
      finalPrice: 11800,
    },
  });

  const response = await invokeRoute({
    method: "GET",
    url: "/api/outcomes/pending",
  });

  assert.equal(response.statusCode, 200);
  const payload = JSON.parse(response.body);
  assert.equal(payload.completedItems.length, 1);
  assert.equal(payload.completedItems[0].caseId, "QC-WON");
  assert.equal(payload.completedItems[0].outcome, "won");
});

test("outcomes route can move no-response deals back into negotiating with a new follow-up date", async () => {
  __resetStoreForTests();
  await saveCase({
    caseId: "QC-NO-RESPONSE",
    createdAt: "2026-03-29",
    updatedAt: "2026-03-29",
    customerName: "HeatEx",
    projectName: "Requote",
    quoteEstimate: {
      currency: "USD",
      total: 6400,
      lineItems: [{ reviewFlag: "GREEN" }],
    },
    quoteLifecycle: {
      status: "no_response",
      outcome: "no_response",
      recordedAt: "2026-03-30T10:00:00.000Z",
      followUpDue: "2026-03-31",
    },
  });

  const response = await invokeRoute({
    method: "POST",
    url: "/api/outcomes",
    headers: { "content-type": "application/json" },
    body: Buffer.from(
      JSON.stringify({
        caseId: "QC-NO-RESPONSE",
        result: "negotiating",
        followUpDue: "2026-04-10",
        actor: "eric@company.com",
      })
    ),
  });

  assert.equal(response.statusCode, 200);
  const payload = JSON.parse(response.body);
  assert.equal(payload.case.quoteLifecycle.status, "negotiating");
  assert.equal(payload.case.quoteLifecycle.followUpDue, "2026-04-10");
});

test("follow-up schedule route saves automatic send settings on the case", async () => {
  __resetStoreForTests();
  await saveCase({
    caseId: "QC-SCHEDULE-FOLLOWUP",
    createdAt: "2026-03-29",
    updatedAt: "2026-03-29",
    customerName: "HeatEx",
    projectName: "Requote",
    quoteEstimate: {
      currency: "USD",
      total: 6400,
      terms: {
        buyerEmail: "buyer@example.com",
      },
      lineItems: [{ reviewFlag: "GREEN" }],
    },
    quoteLifecycle: {
      status: "no_response",
      outcome: "no_response",
      recordedAt: "2026-03-30T10:00:00.000Z",
    },
  });

  const response = await invokeRoute({
    method: "POST",
    url: "/api/follow-ups/schedule",
    headers: { "content-type": "application/json" },
    body: Buffer.from(
      JSON.stringify({
        caseId: "QC-SCHEDULE-FOLLOWUP",
        language: "en",
        sendAt: "2026-04-15T09:00",
        actor: "eric@company.com",
      })
    ),
  });

  assert.equal(response.statusCode, 200);
  const payload = JSON.parse(response.body);
  assert.equal(payload.case.quoteLifecycle.autoFollowUp.enabled, true);
  assert.equal(payload.case.quoteLifecycle.autoFollowUp.sendAt, "2026-04-15T09:00");
});

test("follow-up send route can send immediately through json transport", async () => {
  __resetStoreForTests();
  process.env.SMTP_JSON_TRANSPORT = "true";
  process.env.SMTP_FROM_EMAIL = "sales@example.com";
  process.env.SMTP_FROM_NAME = "Sales Team";

  await saveCase({
    caseId: "QC-SEND-FOLLOWUP",
    createdAt: "2026-03-29",
    updatedAt: "2026-03-29",
    customerName: "HeatEx",
    projectName: "Requote",
    quoteEstimate: {
      currency: "USD",
      total: 6400,
      terms: {
        buyerEmail: "buyer@example.com",
      },
      lineItems: [{ reviewFlag: "GREEN" }],
    },
    quoteLifecycle: {
      status: "no_response",
      outcome: "no_response",
      recordedAt: "2026-03-30T10:00:00.000Z",
    },
  });

  const response = await invokeRoute({
    method: "POST",
    url: "/api/follow-ups/send",
    headers: { "content-type": "application/json" },
    body: Buffer.from(
      JSON.stringify({
        caseId: "QC-SEND-FOLLOWUP",
        language: "en",
        followUpDue: "2026-04-11",
        actor: "eric@company.com",
      })
    ),
  });

  delete process.env.SMTP_JSON_TRANSPORT;
  delete process.env.SMTP_FROM_EMAIL;
  delete process.env.SMTP_FROM_NAME;

  assert.equal(response.statusCode, 200);
  const payload = JSON.parse(response.body);
  assert.equal(payload.case.quoteLifecycle.status, "negotiating");
  assert.equal(payload.case.quoteLifecycle.followUpDue, "2026-04-11");
});

test("quote approval route allows manually overridden red lines with final prices", async () => {
  __resetStoreForTests();
  await saveCase({
    caseId: "QC-OVERRIDE",
    createdAt: "2026-03-29",
    updatedAt: "2026-03-29",
    customerName: "Acme",
    projectName: "Pilot",
    productItems: [{ productId: "product-1", label: "Pipe", quantity: "10 pcs" }],
    quoteEstimate: {
      currency: "USD",
      total: 1200,
      lineItems: [
        {
          lineId: "line-1",
          productId: "product-1",
          productLabel: "Pipe",
          quantityText: "10 pcs",
          quantityValue: 10,
          quantityUnit: "pcs",
          unitPrice: 0,
          finalPrice: 120,
          reviewFlag: "RED",
          manualOverride: true,
        },
      ],
    },
  });

  const response = await invokeRoute({
    method: "POST",
    url: "/api/quote/approve",
    headers: { "content-type": "application/json" },
    body: Buffer.from(JSON.stringify({ caseId: "QC-OVERRIDE", language: "en" })),
  });

  assert.equal(response.statusCode, 200);
  assert.equal(JSON.parse(response.body).case.quoteLifecycle.status, "approved");
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
