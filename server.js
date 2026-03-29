import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadEnv } from "./server/env.js";
import { buildCaseFromSubmission, deriveCaseStatus, deriveMissingInfo, getAllowedCaseStatuses } from "./server/intake-service.js";
import { answerWorkspaceQuestion } from "./server/openai-client.js";
import { buildKnowledgeComparison, buildKnowledgeFilesFromUpload, deriveKnowledgeStatus, getKnowledgeCategories, normalizeStoredQuoteEstimate, summarizeKnowledgeFile } from "./server/knowledge-service.js";
import { buildQuoteDraft, buildQuoteEmail, buildQuoteDocument } from "./server/quote-service.js";
import { deleteCase, getCase, getKnowledgeFile, getStoreHealth, getStoreMode, listCases, listKnowledgeFiles, saveCase, saveKnowledgeFile } from "./server/store.js";
import { authenticateRequest, getPublicSupabaseConfig } from "./server/supabase-auth.js";
import { applyCheckpointDecision, syncCaseWorkflow } from "./server/workflow-engine.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
loadEnv(__dirname);
const port = Number(process.env.PORT || 4173);
const FOLLOW_UP_DAYS = 5;

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
};

export async function handleRequest(req, res) {
  try {
    if (!req.url) {
      return sendJson(res, 400, { error: "Missing request URL" });
    }

    const url = new URL(req.url, `http://${req.headers.host}`);

    if (url.pathname === "/api/system/status" && req.method === "GET") {
      const storeHealth = await getStoreHealth();

      return sendJson(res, 200, {
        system: {
          backendAvailable: true,
          aiConfigured: Boolean(String(process.env.OPENAI_API_KEY || "").trim()),
          model: "gpt-5.2",
          storageMode: getStoreMode(),
          storageHealthy: storeHealth.healthy,
          storageDetails: storeHealth.details || "",
          supabase: getPublicSupabaseConfig(),
        },
      });
    }

    if (url.pathname.startsWith("/api/")) {
      const authResult = await ensureApiAuth(req);

      if (!authResult.ok) {
        return sendJson(res, authResult.statusCode, { error: authResult.error });
      }
    }

    if (url.pathname === "/api/intake" && req.method === "POST") {
      const formData = await toRequest(req, url).formData();
      const emailText = String(formData.get("email_text") || "");
      const language = String(formData.get("language") || "en");
      const files = formData
        .getAll("rfq_files")
        .filter((value) => typeof value === "object" && value !== null && "arrayBuffer" in value);

      const createdCase = await buildCaseFromSubmission({
        files,
        emailText,
        language,
      });

      await saveCase(createdCase);
      return sendJson(res, 201, { case: createdCase });
    }

    if (url.pathname === "/api/cases" && req.method === "GET") {
      const cases = await listCases();
      return sendJson(res, 200, {
        cases: cases.map((entry) => summarizeCase(entry)),
        allowedStatuses: getAllowedCaseStatuses(),
      });
    }

    if (url.pathname === "/api/knowledge" && req.method === "GET") {
      const knowledgeFiles = await listKnowledgeFiles();
      return sendJson(res, 200, {
        knowledgeFiles: knowledgeFiles.map(summarizeKnowledgeFileRecord),
        categories: getKnowledgeCategories(),
      });
    }

    if (req.method === "GET") {
      const knowledgeFileId = matchKnowledgeFileDetailPath(url.pathname);

      if (knowledgeFileId) {
        const knowledgeFile = await getKnowledgeFile(knowledgeFileId);

        if (!knowledgeFile) {
          return sendJson(res, 404, { error: "Knowledge file not found" });
        }

        return sendJson(res, 200, {
          knowledgeFile: detailKnowledgeFile(knowledgeFile),
        });
      }
    }

    if (url.pathname === "/api/knowledge/upload" && req.method === "POST") {
      const formData = await toRequest(req, url).formData();
      const language = String(formData.get("language") || "en");
      const files = formData
        .getAll("knowledge_files")
        .filter((value) => typeof value === "object" && value !== null && "arrayBuffer" in value);

      if (!files.length) {
        return sendJson(res, 400, { error: "At least one knowledge file is required." });
      }

      const uploaded = await buildKnowledgeFilesFromUpload({ files, language });
      await Promise.all(uploaded.map((file) => saveKnowledgeFile(file)));

      return sendJson(res, 201, {
        knowledgeFiles: uploaded.map(summarizeKnowledgeFileRecord),
      });
    }

    if (req.method === "POST") {
      const knowledgeFileId = matchKnowledgeFileSummarizePath(url.pathname);

      if (knowledgeFileId) {
        const payload = await readJsonBody(req);
        const language = String(payload.language || "en");
        const knowledgeFile = await getKnowledgeFile(knowledgeFileId);

        if (!knowledgeFile) {
          return sendJson(res, 404, { error: "Knowledge file not found" });
        }

        const summary = await summarizeKnowledgeFile({
          knowledgeFile,
          language,
        });

        const updatedFile = {
          ...knowledgeFile,
          summary: summary.summary,
        };

        await saveKnowledgeFile(updatedFile);
        return sendJson(res, 200, {
          knowledgeFile: detailKnowledgeFile(updatedFile),
        });
      }
    }

    if (url.pathname.startsWith("/api/cases/") && req.method === "GET") {
      const caseId = decodeURIComponent(url.pathname.split("/").pop());
      const caseRecord = await getCase(caseId);

      if (!caseRecord) {
        return sendJson(res, 404, { error: "Case not found" });
      }

      return sendJson(res, 200, { case: caseRecord });
    }

    if (url.pathname.startsWith("/api/cases/") && req.method === "PATCH") {
      const caseId = decodeURIComponent(url.pathname.split("/").pop());
      const existing = await getCase(caseId);

      if (!existing) {
        return sendJson(res, 404, { error: "Case not found" });
      }

      const payload = await readJsonBody(req);
      const nextFields = Array.isArray(payload.extractedFields) ? payload.extractedFields : existing.extractedFields;
      const nextMissingInfo = deriveMissingInfo(nextFields);
      const nextStatus = getAllowedCaseStatuses().includes(payload.status)
        ? payload.status
        : deriveCaseStatus(nextMissingInfo);

      let updated = {
        ...existing,
        ...payload,
        extractedFields: nextFields,
        missingInfo: nextMissingInfo,
        status: nextStatus,
        updatedAt: new Date().toISOString().slice(0, 10),
        aiSummary: {
          ...existing.aiSummary,
          ...(payload.aiSummary || {}),
          currentStatus: nextStatus,
        },
      };

      if (payload.quoteEstimate || existing.quoteEstimate || payload.productItems) {
        updated.quoteEstimate = normalizeStoredQuoteEstimate({
          caseRecord: updated,
          quoteEstimate: payload.quoteEstimate || existing.quoteEstimate,
        });
      }

      updated = syncCaseWorkflow({
        previousCase: existing,
        nextCase: updated,
        actor: String(payload.actor || "user"),
        source: "case_patch",
        now: new Date(),
      });

      await saveCase(updated);
      return sendJson(res, 200, { case: updated });
    }

    if (url.pathname.startsWith("/api/cases/") && req.method === "DELETE") {
      const caseId = decodeURIComponent(url.pathname.split("/").pop());
      const deleted = await deleteCase(caseId);

      if (!deleted) {
        return sendJson(res, 404, { error: "Case not found" });
      }

      return sendJson(res, 200, {
        deletedCaseId: caseId,
      });
    }

    if (req.method === "POST") {
      const checkpointDecision = matchCheckpointDecisionPath(url.pathname);

      if (checkpointDecision) {
        const existing = await getCase(checkpointDecision.caseId);

        if (!existing) {
          return sendJson(res, 404, { error: "Case not found" });
        }

        const payload = await readJsonBody(req);
        const updated = applyCheckpointDecision({
          caseRecord: existing,
          checkpointId: checkpointDecision.checkpointId,
          action: String(payload.action || ""),
          note: String(payload.note || ""),
          actor: String(payload.actor || "user"),
          now: new Date(),
        });

        await saveCase(updated);
        return sendJson(res, 200, { case: updated });
      }
    }

    if (url.pathname === "/api/workspace/query" && req.method === "POST") {
      const payload = await readJsonBody(req);
      const question = String(payload.question || "").trim();
      const language = String(payload.language || "en");

      if (!question) {
        return sendJson(res, 400, { error: "Question is required." });
      }

      const cases = await listCases();

      const answer = await answerWorkspaceQuestion({
        question,
        cases,
        language,
      });

      return sendJson(res, 200, { answer });
    }

    if (url.pathname === "/api/knowledge/compare" && req.method === "POST") {
      const payload = await readJsonBody(req);
      const caseId = String(payload.caseId || "");
      const language = String(payload.language || "en");
      const caseRecord = await resolveCaseRecord(caseId, payload.caseSnapshot);

      if (!caseRecord) {
        return sendJson(res, 404, { error: "Case not found" });
      }

      const knowledgeFiles = await listKnowledgeFiles();
      const comparison = await buildKnowledgeComparison({
        caseRecord,
        knowledgeFiles,
        language,
      });

      const updated = syncCaseWorkflow({
        previousCase: caseRecord,
        actor: "system",
        source: "knowledge_compare",
        now: new Date(),
        nextCase: {
        ...caseRecord,
        knowledgeComparison: comparison,
        status: deriveKnowledgeStatus(comparison),
        updatedAt: new Date().toISOString().slice(0, 10),
        },
      });

      await saveCase(updated);
      return sendJson(res, 200, {
        comparison,
        case: updated,
        knowledgeFiles: knowledgeFiles.map(summarizeKnowledgeFileRecord),
      });
    }

    if (url.pathname === "/api/quote/build" && req.method === "POST") {
      const payload = await readJsonBody(req);
      const caseId = String(payload.caseId || "");
      const language = String(payload.language || "en");
      const caseRecord = await resolveCaseRecord(caseId, payload.caseSnapshot);

      if (!caseRecord) {
        return sendJson(res, 404, { error: "Case not found" });
      }

      const knowledgeFiles = await listKnowledgeFiles();
      const quoteEstimate = await buildQuoteDraft({
        caseRecord,
        knowledgeFiles,
        language,
      });

      const updated = syncCaseWorkflow({
        previousCase: caseRecord,
        actor: "system",
        source: "quote_build",
        now: new Date(),
        nextCase: {
        ...caseRecord,
        quoteEstimate,
        quoteHistory: appendQuoteHistory(caseRecord.quoteHistory, createQuoteHistoryEntry({
          caseRecord: {
            ...caseRecord,
            quoteEstimate,
          },
          type: "draft_generated",
          title: "Draft quote generated",
          actor: "system",
          now: new Date(),
        })),
        updatedAt: new Date().toISOString().slice(0, 10),
        },
      });

      await saveCase(updated);
      return sendJson(res, 200, {
        quoteEstimate,
        case: updated,
      });
    }

    if (url.pathname === "/api/quote/approve" && req.method === "POST") {
      const payload = await readJsonBody(req);
      const caseId = String(payload.caseId || "");
      const language = String(payload.language || "en");
      const caseRecord = await resolveCaseRecord(caseId, payload.caseSnapshot);

      if (!caseRecord) {
        return sendJson(res, 404, { error: "Case not found" });
      }

      const quoteEstimate = normalizeStoredQuoteEstimate({
        caseRecord,
        quoteEstimate: payload.quoteEstimate || caseRecord.quoteEstimate,
        language,
      });
      const blockingIssues = getQuoteApprovalBlockingIssues(quoteEstimate);

      if (blockingIssues.length) {
        return sendJson(res, 422, {
          error: "Quote approval blocked",
          details: blockingIssues[0],
          issues: blockingIssues,
        });
      }

      const now = new Date();
      const lifecycle = {
        ...ensureQuoteLifecycle(caseRecord),
        status: "approved",
        approvedAt: now.toISOString(),
        sentAt: null,
        followUpDue: null,
        outcome: null,
        recordedAt: null,
        recordedBy: String(payload.actor || "user"),
        totalValue: Number(quoteEstimate.total || 0),
        currency: quoteEstimate.currency || "USD",
        flagCounts: quoteEstimate.flagCounts || countQuoteFlags(quoteEstimate),
      };

      const updated = syncCaseWorkflow({
        previousCase: caseRecord,
        actor: String(payload.actor || "user"),
        source: "quote_approve",
        now,
        nextCase: {
          ...caseRecord,
          quoteEstimate,
          quoteLifecycle: lifecycle,
          quoteHistory: appendQuoteHistory(caseRecord.quoteHistory, createQuoteHistoryEntry({
            caseRecord: {
              ...caseRecord,
              quoteEstimate,
              quoteLifecycle: lifecycle,
            },
            type: "quote_approved",
            title: "Quote approved",
            actor: String(payload.actor || "user"),
            now,
          })),
          updatedAt: now.toISOString().slice(0, 10),
        },
      });

      await saveCase(updated);
      return sendJson(res, 200, { case: updated });
    }

    if (url.pathname === "/api/quote/mark-sent" && req.method === "POST") {
      const payload = await readJsonBody(req);
      const caseId = String(payload.caseId || "");
      const caseRecord = await resolveCaseRecord(caseId, payload.caseSnapshot);

      if (!caseRecord) {
        return sendJson(res, 404, { error: "Case not found" });
      }

      const quoteEstimate = caseRecord.quoteEstimate
        ? normalizeStoredQuoteEstimate({
            caseRecord,
            quoteEstimate: payload.quoteEstimate || caseRecord.quoteEstimate,
            language: String(payload.language || "en"),
          })
        : null;

      if (!quoteEstimate) {
        return sendJson(res, 422, { error: "Draft quote not found" });
      }

      const blockingIssues = getQuoteApprovalBlockingIssues(quoteEstimate);
      if (blockingIssues.length) {
        return sendJson(res, 422, {
          error: "Quote cannot be marked sent yet",
          details: blockingIssues[0],
          issues: blockingIssues,
        });
      }

      const now = new Date();
      const lifecycle = {
        ...ensureQuoteLifecycle(caseRecord),
        status: "sent",
        approvedAt: caseRecord.quoteLifecycle?.approvedAt || now.toISOString(),
        sentAt: now.toISOString(),
        followUpDue: addDays(now, FOLLOW_UP_DAYS).toISOString(),
        totalValue: Number(quoteEstimate.total || 0),
        currency: quoteEstimate.currency || "USD",
        flagCounts: quoteEstimate.flagCounts || countQuoteFlags(quoteEstimate),
      };

      const updated = syncCaseWorkflow({
        previousCase: caseRecord,
        actor: String(payload.actor || "user"),
        source: "quote_mark_sent",
        now,
        nextCase: {
          ...caseRecord,
          quoteEstimate,
          quoteLifecycle: lifecycle,
          quoteHistory: appendQuoteHistory(caseRecord.quoteHistory, createQuoteHistoryEntry({
            caseRecord: {
              ...caseRecord,
              quoteEstimate,
              quoteLifecycle: lifecycle,
            },
            type: "quote_sent",
            title: "Quote sent to customer",
            actor: String(payload.actor || "user"),
            now,
          })),
          updatedAt: now.toISOString().slice(0, 10),
        },
      });

      await saveCase(updated);
      return sendJson(res, 200, { case: updated });
    }

    if (url.pathname === "/api/quote/email" && req.method === "POST") {
      const payload = await readJsonBody(req);
      const caseId = String(payload.caseId || "");
      const language = String(payload.language || "en");
      const caseRecord = await resolveCaseRecord(caseId, payload.caseSnapshot);

      if (!caseRecord) {
        return sendJson(res, 404, { error: "Case not found" });
      }

      const quoteEstimate = normalizeStoredQuoteEstimate({
        caseRecord,
        quoteEstimate: payload.quoteEstimate || caseRecord.quoteEstimate,
        language,
      });

      const emailDraft = await buildQuoteEmail({
        caseRecord,
        quoteEstimate,
        language,
      });

      const updated = syncCaseWorkflow({
        previousCase: caseRecord,
        actor: "system",
        source: "quote_email",
        now: new Date(),
        nextCase: {
        ...caseRecord,
        quoteEstimate,
        quoteEmailDraft: emailDraft,
        quoteHistory: appendQuoteHistory(caseRecord.quoteHistory, createQuoteHistoryEntry({
          caseRecord: {
            ...caseRecord,
            quoteEstimate,
            quoteEmailDraft: emailDraft,
          },
          type: "email_drafted",
          title: "Buyer email drafted",
          actor: "system",
          now: new Date(),
        })),
        updatedAt: new Date().toISOString().slice(0, 10),
        },
      });

      await saveCase(updated);
      return sendJson(res, 200, {
        emailDraft,
        case: updated,
      });
    }

    if (url.pathname === "/api/quote/document" && req.method === "POST") {
      const payload = await readJsonBody(req);
      const caseId = String(payload.caseId || "");
      const language = String(payload.language || "en");
      const caseRecord = await resolveCaseRecord(caseId, payload.caseSnapshot);

      if (!caseRecord) {
        return sendJson(res, 404, { error: "Case not found" });
      }

      const quoteEstimate = normalizeStoredQuoteEstimate({
        caseRecord,
        quoteEstimate: payload.quoteEstimate || caseRecord.quoteEstimate,
        language,
      });

      const document = await buildQuoteDocument({
        caseRecord,
        quoteEstimate,
        language,
      });

      return sendJson(res, 200, {
        fileName: document.fileName,
        contentType: document.contentType,
        fileBase64: document.buffer.toString("base64"),
      });
    }

    if (url.pathname === "/api/quote/snapshot" && req.method === "POST") {
      const payload = await readJsonBody(req);
      const caseId = String(payload.caseId || "");
      const language = String(payload.language || "en");
      const caseRecord = await resolveCaseRecord(caseId, payload.caseSnapshot);

      if (!caseRecord) {
        return sendJson(res, 404, { error: "Case not found" });
      }

      const quoteEstimate = normalizeStoredQuoteEstimate({
        caseRecord,
        quoteEstimate: payload.quoteEstimate || caseRecord.quoteEstimate,
        language,
      });

      const updated = syncCaseWorkflow({
        previousCase: caseRecord,
        actor: String(payload.actor || "user"),
        source: "quote_snapshot",
        now: new Date(),
        nextCase: {
          ...caseRecord,
          quoteEstimate,
          quoteHistory: appendQuoteHistory(caseRecord.quoteHistory, createQuoteHistoryEntry({
            caseRecord: {
              ...caseRecord,
              quoteEstimate,
            },
            type: "version_saved",
            title: "Quote version saved",
            actor: String(payload.actor || "user"),
            now: new Date(),
          })),
          updatedAt: new Date().toISOString().slice(0, 10),
        },
      });

      await saveCase(updated);
      return sendJson(res, 200, { case: updated });
    }

    if (url.pathname === "/api/outcomes/pending" && req.method === "GET") {
      const cases = await listCases();
      return sendJson(res, 200, {
        items: buildPendingOutcomes(cases),
      });
    }

    if (url.pathname === "/api/outcomes" && req.method === "POST") {
      const payload = await readJsonBody(req);
      const caseId = String(payload.caseId || "");
      const caseRecord = await resolveCaseRecord(caseId, payload.caseSnapshot);
      const result = String(payload.result || "").trim().toLowerCase();

      if (!caseRecord) {
        return sendJson(res, 404, { error: "Case not found" });
      }

      if (!["won", "lost", "negotiating", "no_response"].includes(result)) {
        return sendJson(res, 422, { error: "Unsupported outcome result" });
      }

      if (result === "won" && !Number.isFinite(Number(payload.finalPrice))) {
        return sendJson(res, 422, { error: "Final price is required when the quote is won." });
      }

      const now = new Date();
      const lifecycle = {
        ...ensureQuoteLifecycle(caseRecord),
        status: result,
        outcome: result,
        recordedAt: now.toISOString(),
        recordedBy: String(payload.actor || "user"),
        finalPrice: Number.isFinite(Number(payload.finalPrice)) ? Number(payload.finalPrice) : null,
        lossReason: String(payload.lossReason || "").trim(),
        competitorPrice: Number.isFinite(Number(payload.competitorPrice)) ? Number(payload.competitorPrice) : null,
      };

      const updated = syncCaseWorkflow({
        previousCase: caseRecord,
        actor: String(payload.actor || "user"),
        source: "quote_outcome",
        now,
        nextCase: {
          ...caseRecord,
          quoteLifecycle: lifecycle,
          quoteHistory: appendQuoteHistory(caseRecord.quoteHistory, createQuoteHistoryEntry({
            caseRecord: {
              ...caseRecord,
              quoteLifecycle: lifecycle,
            },
            type: "outcome_logged",
            title: `Outcome logged: ${result}`,
            actor: String(payload.actor || "user"),
            now,
          })),
          updatedAt: now.toISOString().slice(0, 10),
        },
      });

      await saveCase(updated);
      return sendJson(res, 200, { case: updated });
    }

    if (url.pathname === "/api/dashboard/stats" && req.method === "GET") {
      const cases = await listCases();
      return sendJson(res, 200, {
        stats: buildDashboardStats(cases),
      });
    }

    if (req.method === "GET") {
      return serveStatic(url.pathname, res);
    }

    return sendJson(res, 404, { error: "Not found" });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (res.headersSent) {
      return;
    }

    if (message === "cannot parse PDF") {
      return sendJson(res, 422, {
        error: "cannot parse PDF",
      });
    }

    return sendJson(res, 500, {
      error: "Server error",
      details: message,
    });
  }
}

export const server = http.createServer(handleRequest);

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  server.listen(port, () => {
    console.log(`QuoteCase Copilot server running at http://127.0.0.1:${port}`);
  });
}

function summarizeCase(caseRecord) {
  const primaryProduct = caseRecord.productItems?.[0];
  const quoteLifecycle = ensureQuoteLifecycle(caseRecord);
  const quoteEstimate = caseRecord.quoteEstimate || null;
  return {
    caseId: caseRecord.caseId,
    customerName: caseRecord.customerName,
    projectName: caseRecord.projectName,
    owner: caseRecord.owner,
    status: caseRecord.status,
    createdAt: caseRecord.createdAt,
    updatedAt: caseRecord.updatedAt,
    productType: primaryProduct?.productType || fieldValue(caseRecord, "Product Type"),
    material: primaryProduct?.materialGrade || fieldValue(caseRecord, "Material / Grade"),
    quantity: primaryProduct?.quantity || fieldValue(caseRecord, "Quantity"),
    knowledgeStatus: caseRecord.knowledgeComparison?.recommendedStatus || "",
    quoteLifecycle,
    quoteSummary: quoteEstimate
      ? {
          total: Number(quoteEstimate.total || 0),
          currency: quoteEstimate.currency || "USD",
          flagCounts: quoteEstimate.flagCounts || countQuoteFlags(quoteEstimate),
          blendedMarginPct: Number(quoteEstimate.blendedMarginPct || 0),
        }
      : null,
    productItems: (caseRecord.productItems || []).map((item, index) => ({
      productId: item.productId || `product-${index + 1}`,
      label: item.label || `Product ${index + 1}`,
      productType: item.productType || "Not clearly stated",
      materialGrade: item.materialGrade || "Not clearly stated",
      quantity: item.quantity || "Not clearly stated",
      outsideDimension: item.outsideDimension || "Not clearly stated",
      wallThickness: item.wallThickness || "Not clearly stated",
      schedule: item.schedule || "Not clearly stated",
      lengthPerPiece: item.lengthPerPiece || "Not clearly stated",
    })),
  };
}

function summarizeKnowledgeFileRecord(file) {
  return {
    knowledgeFileId: file.knowledgeFileId,
    name: file.name,
    type: file.type,
    category: file.category,
    summary: file.summary,
    uploadedAt: file.uploadedAt,
  };
}

function detailKnowledgeFile(file) {
  return {
    ...summarizeKnowledgeFileRecord(file),
    previewText: String(file.extractedText || "").slice(0, 6000),
    previewAvailable: Boolean(file.extractedText),
  };
}

function appendQuoteHistory(existingHistory, nextEntry) {
  return [...(Array.isArray(existingHistory) ? existingHistory : []), nextEntry].slice(-24);
}

function createQuoteHistoryEntry({ caseRecord, type, title, actor = "system", now = new Date() }) {
  const quoteEstimate = caseRecord.quoteEstimate || {};
  return {
    historyId: `qh-${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    title,
    actor,
    createdAt: now.toISOString(),
    summary: quoteEstimate.summary || "",
    currency: quoteEstimate.currency || "USD",
    subtotal: Number(quoteEstimate.subtotal || 0),
    total: Number(quoteEstimate.total || 0),
    incoterm: quoteEstimate.incoterm || "",
    lifecycleStatus: caseRecord.quoteLifecycle?.status || "",
    terms: {
      paymentTerms: quoteEstimate.terms?.paymentTerms || "",
      validityTerms: quoteEstimate.terms?.validityTerms || "",
      leadTime: quoteEstimate.terms?.leadTime || "",
      shippingTerms: quoteEstimate.terms?.shippingTerms || "",
    },
    lineItems: (quoteEstimate.lineItems || []).map((item) => ({
      productLabel: item.productLabel || "",
      quantityText: item.quantityText || "",
      quantityValue: Number(item.quantityValue || 0),
      quantityUnit: item.quantityUnit || "",
      unitPrice: Number(item.unitPrice || 0),
      lineTotal: Number(item.lineTotal || 0),
    })),
    emailSubject: caseRecord.quoteEmailDraft?.subject || "",
  };
}

function ensureQuoteLifecycle(caseRecord) {
  const lifecycle = caseRecord?.quoteLifecycle || {};

  return {
    quoteNumber: lifecycle.quoteNumber || buildQuoteNumber(caseRecord),
    status: lifecycle.status || (caseRecord?.quoteEstimate ? "draft" : "not_started"),
    approvedAt: lifecycle.approvedAt || null,
    sentAt: lifecycle.sentAt || null,
    followUpDue: lifecycle.followUpDue || null,
    outcome: lifecycle.outcome || null,
    recordedAt: lifecycle.recordedAt || null,
    recordedBy: lifecycle.recordedBy || "",
    finalPrice: Number.isFinite(Number(lifecycle.finalPrice)) ? Number(lifecycle.finalPrice) : null,
    lossReason: lifecycle.lossReason || "",
    competitorPrice: Number.isFinite(Number(lifecycle.competitorPrice)) ? Number(lifecycle.competitorPrice) : null,
    totalValue: Number.isFinite(Number(lifecycle.totalValue)) ? Number(lifecycle.totalValue) : Number(caseRecord?.quoteEstimate?.total || 0),
    currency: lifecycle.currency || caseRecord?.quoteEstimate?.currency || "USD",
    flagCounts: lifecycle.flagCounts || countQuoteFlags(caseRecord?.quoteEstimate),
  };
}

function buildQuoteNumber(caseRecord) {
  const createdAt = String(caseRecord?.createdAt || "").replace(/-/g, "");
  return `Q-${createdAt || "00000000"}-${String(caseRecord?.caseId || "0000").slice(-4)}`;
}

function countQuoteFlags(quoteEstimate) {
  const counts = { green: 0, yellow: 0, red: 0 };

  for (const item of quoteEstimate?.lineItems || []) {
    const key = String(item.reviewFlag || "").toLowerCase();

    if (key === "green" || key === "yellow" || key === "red") {
      counts[key] += 1;
    }
  }

  return counts;
}

function getQuoteApprovalBlockingIssues(quoteEstimate) {
  const issues = [];

  for (const item of quoteEstimate?.lineItems || []) {
    const finalPrice = Number(item.finalPrice);
    const label = item.productLabel || item.lineId || "Line item";
    const overridden = Boolean(item.manualOverride);

    if ((item.reviewFlag || "").toUpperCase() === "RED" && !overridden && !(Number.isFinite(finalPrice) && finalPrice > 0)) {
      issues.push(`${label} is RED and still needs a final price.`);
      continue;
    }

    if (!(Number.isFinite(finalPrice) && finalPrice > 0) && !(Number.isFinite(Number(item.unitPrice)) && Number(item.unitPrice) > 0)) {
      issues.push(`${label} does not have a usable final price.`);
    }
  }

  return issues;
}

function buildPendingOutcomes(cases, now = new Date()) {
  return cases
    .filter((caseRecord) => {
      const lifecycle = ensureQuoteLifecycle(caseRecord);
      return lifecycle.status === "sent" && lifecycle.followUpDue && new Date(lifecycle.followUpDue) <= now;
    })
    .map((caseRecord) => {
      const lifecycle = ensureQuoteLifecycle(caseRecord);
      return {
        caseId: caseRecord.caseId,
        quoteNumber: lifecycle.quoteNumber,
        customerName: caseRecord.customerName,
        projectName: caseRecord.projectName,
        sentAt: lifecycle.sentAt,
        followUpDue: lifecycle.followUpDue,
        daysOverdue: differenceInDays(now, lifecycle.followUpDue),
        totalValue: lifecycle.totalValue,
        currency: lifecycle.currency || "USD",
      };
    })
    .sort((a, b) => String(a.followUpDue || "").localeCompare(String(b.followUpDue || "")));
}

function buildDashboardStats(cases, now = new Date()) {
  const lifecycleCases = cases.map((caseRecord) => ({ caseRecord, lifecycle: ensureQuoteLifecycle(caseRecord) }));
  const last30Days = lifecycleCases.filter(({ lifecycle }) => isWithinDays(lifecycle.recordedAt || lifecycle.sentAt, 30, now));
  const sent30d = lifecycleCases.filter(({ lifecycle }) => isWithinDays(lifecycle.sentAt, 30, now));
  const outcomes30d = last30Days.filter(({ lifecycle }) => ["won", "lost"].includes(lifecycle.outcome));
  const won30d = outcomes30d.filter(({ lifecycle }) => lifecycle.outcome === "won");
  const approvedOrSent90d = lifecycleCases.filter(({ lifecycle }) => isWithinDays(lifecycle.approvedAt || lifecycle.sentAt, 90, now));
  const topCustomers = Object.values(
    lifecycleCases.reduce((acc, { caseRecord }) => {
      if (!caseRecord.quoteEstimate) {
        return acc;
      }

      const key = String(caseRecord.customerName || "Unknown Customer");
      acc[key] = acc[key] || { customerName: key, quoteCount: 0, totalValue: 0 };
      acc[key].quoteCount += 1;
      acc[key].totalValue += Number(caseRecord.quoteEstimate?.total || 0);
      return acc;
    }, {})
  )
    .sort((a, b) => b.totalValue - a.totalValue)
    .slice(0, 5);
  const flagDistribution90d = approvedOrSent90d.reduce(
    (counts, { caseRecord }) => {
      const flagCounts = countQuoteFlags(caseRecord.quoteEstimate);
      counts.green += flagCounts.green;
      counts.yellow += flagCounts.yellow;
      counts.red += flagCounts.red;
      return counts;
    },
    { green: 0, yellow: 0, red: 0 }
  );

  return {
    winRate30d: outcomes30d.length ? roundStat((won30d.length / outcomes30d.length) * 100) : 0,
    avgMargin30d: won30d.length
      ? roundStat(won30d.reduce((sum, { caseRecord }) => sum + Number(caseRecord.quoteEstimate?.blendedMarginPct || 0), 0) / won30d.length)
      : 0,
    quotesSent30d: sent30d.length,
    avgTurnaroundHours: sent30d.length
      ? roundStat(
          sent30d.reduce((sum, { caseRecord, lifecycle }) => sum + hoursBetween(caseRecord.createdAt, lifecycle.sentAt), 0) / sent30d.length
        )
      : 0,
    pendingFollowUps: buildPendingOutcomes(cases, now).length,
    flagDistribution90d,
    topCustomers,
    quoteVolumeByWeek: buildQuoteVolumeByWeek(cases, now),
  };
}

function buildQuoteVolumeByWeek(cases, now = new Date()) {
  const buckets = new Map();

  for (let index = 11; index >= 0; index -= 1) {
    const bucketDate = addDays(now, index * -7);
    buckets.set(weekBucketLabel(bucketDate), { week: weekBucketLabel(bucketDate), green: 0, yellow: 0, red: 0 });
  }

  for (const caseRecord of cases) {
    const lifecycle = ensureQuoteLifecycle(caseRecord);

    if (!isWithinDays(lifecycle.approvedAt || lifecycle.sentAt || caseRecord.updatedAt, 90, now)) {
      continue;
    }

    const label = weekBucketLabel(lifecycle.approvedAt || lifecycle.sentAt || caseRecord.updatedAt);
    const bucket = buckets.get(label);

    if (!bucket) {
      continue;
    }

    const flagCounts = countQuoteFlags(caseRecord.quoteEstimate);
    bucket.green += flagCounts.green;
    bucket.yellow += flagCounts.yellow;
    bucket.red += flagCounts.red;
  }

  return [...buckets.values()];
}

function isWithinDays(value, days, now = new Date()) {
  if (!value) {
    return false;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return false;
  }

  return now.getTime() - date.getTime() <= days * 24 * 60 * 60 * 1000;
}

function differenceInDays(now, value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 0;
  }

  return Math.max(0, Math.floor((now.getTime() - date.getTime()) / (24 * 60 * 60 * 1000)));
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function hoursBetween(startValue, endValue) {
  const start = new Date(startValue);
  const end = new Date(endValue);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return 0;
  }

  return (end.getTime() - start.getTime()) / (60 * 60 * 1000);
}

function weekBucketLabel(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const start = new Date(date);
  start.setDate(start.getDate() - start.getDay());
  return start.toISOString().slice(0, 10);
}

function roundStat(value) {
  return Number(Number(value || 0).toFixed(2));
}

async function ensureApiAuth(req) {
  const supabaseConfig = getPublicSupabaseConfig();

  if (!supabaseConfig.configured) {
    return { ok: true };
  }

  return authenticateRequest(req);
}

function normalizeCaseSnapshot(value, expectedCaseId) {
  if (!value || typeof value !== "object") {
    return null;
  }

  if (String(value.caseId || "") !== String(expectedCaseId || "")) {
    return null;
  }

  return value;
}

async function resolveCaseRecord(caseId, caseSnapshotValue) {
  const existing = await getCase(caseId);

  if (existing) {
    return existing;
  }

  const caseSnapshot = normalizeCaseSnapshot(caseSnapshotValue, caseId);

  if (!caseSnapshot) {
    return null;
  }

  await saveCase(caseSnapshot);
  return caseSnapshot;
}

function matchKnowledgeFileDetailPath(pathname) {
  const match = pathname.match(/^\/api\/knowledge\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]) : "";
}

function matchKnowledgeFileSummarizePath(pathname) {
  const match = pathname.match(/^\/api\/knowledge\/([^/]+)\/summarize$/);
  return match ? decodeURIComponent(match[1]) : "";
}

function matchCheckpointDecisionPath(pathname) {
  const match = pathname.match(/^\/api\/cases\/([^/]+)\/checkpoints\/([^/]+)\/decision$/);

  if (!match) {
    return null;
  }

  return {
    caseId: decodeURIComponent(match[1]),
    checkpointId: decodeURIComponent(match[2]),
  };
}

function fieldValue(caseRecord, fieldName) {
  return caseRecord.extractedFields.find((field) => field.fieldName === fieldName)?.value || "";
}

function toRequest(req, url) {
  return new Request(url.toString(), {
    method: req.method,
    headers: req.headers,
    body: req,
    duplex: "half",
  });
}

async function readJsonBody(req) {
  const chunks = [];

  for await (const chunk of req) {
    chunks.push(chunk);
  }

  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

async function serveStatic(requestPath, res) {
  const normalizedPath = requestPath === "/" ? "/index.html" : requestPath;
  const targetPath = path.join(__dirname, normalizedPath);

  if (!targetPath.startsWith(__dirname)) {
    return sendJson(res, 403, { error: "Forbidden" });
  }

  try {
    const file = await fs.readFile(targetPath);
    res.writeHead(200, {
      "cache-control": "no-store, max-age=0",
      "content-type": MIME_TYPES[path.extname(targetPath)] || "application/octet-stream",
    });
    res.end(file);
  } catch {
    const indexFile = await fs.readFile(path.join(__dirname, "index.html"));
    res.writeHead(200, {
      "cache-control": "no-store, max-age=0",
      "content-type": "text/html; charset=utf-8",
    });
    res.end(indexFile);
  }
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}
