import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadEnv } from "./server/env.js";
import { buildCaseFromSubmission, deriveCaseStatus, deriveMissingInfo, getAllowedCaseStatuses } from "./server/intake-service.js";
import { answerWorkspaceQuestion } from "./server/openai-client.js";
import { buildKnowledgeComparison, buildKnowledgeFilesFromUpload, deriveKnowledgeStatus, getKnowledgeCategories, normalizeStoredQuoteEstimate, summarizeKnowledgeFile } from "./server/knowledge-service.js";
import { buildQuoteDraft, buildQuoteEmail } from "./server/quote-service.js";
import { getCase, getKnowledgeFile, getStoreMode, listCases, listKnowledgeFiles, saveCase, saveKnowledgeFile } from "./server/store.js";
import { authenticateRequest, getPublicSupabaseConfig } from "./server/supabase-auth.js";
import { applyCheckpointDecision, syncCaseWorkflow } from "./server/workflow-engine.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
loadEnv(__dirname);
const port = Number(process.env.PORT || 4173);

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
      return sendJson(res, 200, {
        system: {
          backendAvailable: true,
          aiConfigured: Boolean(String(process.env.OPENAI_API_KEY || "").trim()),
          model: "gpt-5.2",
          storageMode: getStoreMode(),
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
      const caseRecord = await getCase(caseId);

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

    if ((url.pathname === "/api/quote/build" || url.pathname === "/api/knowledge/quote") && req.method === "POST") {
      const payload = await readJsonBody(req);
      const caseId = String(payload.caseId || "");
      const language = String(payload.language || "en");
      const caseRecord = await getCase(caseId);

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

    if (url.pathname === "/api/quote/email" && req.method === "POST") {
      const payload = await readJsonBody(req);
      const caseId = String(payload.caseId || "");
      const language = String(payload.language || "en");
      const caseRecord = await getCase(caseId);

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

    if (url.pathname === "/api/quote/snapshot" && req.method === "POST") {
      const payload = await readJsonBody(req);
      const caseId = String(payload.caseId || "");
      const language = String(payload.language || "en");
      const caseRecord = await getCase(caseId);

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

async function ensureApiAuth(req) {
  const supabaseConfig = getPublicSupabaseConfig();

  if (!supabaseConfig.configured) {
    return { ok: true };
  }

  return authenticateRequest(req);
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
