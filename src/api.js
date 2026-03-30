import { getAccessToken } from "./supabase.js";

export async function createCaseFromIntake({ files, emailText, language }) {
  const formData = new FormData();

  for (const file of files) {
    formData.append("rfq_files", file);
  }

  formData.append("email_text", emailText);
  formData.append("language", language);

  const response = await apiFetch("/api/intake", {
    method: "POST",
    body: formData,
  });

  return handleJson(response, { files, operation: "rfq_intake" });
}

export async function fetchCases() {
  const response = await apiFetch("/api/cases");
  return handleJson(response);
}

export async function fetchComplaints() {
  const response = await apiFetch("/api/complaints");
  return handleJson(response);
}

export async function fetchComplaint(complaintId) {
  const response = await apiFetch(`/api/complaints/${encodeURIComponent(complaintId)}`);
  return handleJson(response);
}

export async function createComplaintRecord({ complaintTitle, customerName, emailText, files, language }) {
  const formData = new FormData();

  formData.append("complaint_title", complaintTitle);
  formData.append("customer_name", customerName);
  formData.append("email_text", emailText);
  formData.append("language", language);

  for (const file of files) {
    formData.append("complaint_files", file);
  }

  const response = await apiFetch("/api/complaints", {
    method: "POST",
    body: formData,
  });

  return handleJson(response);
}

export async function fetchCase(caseId) {
  const response = await apiFetch(`/api/cases/${encodeURIComponent(caseId)}`);
  return handleJson(response);
}

export async function fetchSystemStatus() {
  const response = await fetch("/api/system/status");
  return handleJson(response);
}

export async function updateCase(caseId, payload) {
  const response = await apiFetch(`/api/cases/${encodeURIComponent(caseId)}`, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  return handleJson(response);
}

export async function deleteCase(caseId) {
  const response = await apiFetch(`/api/cases/${encodeURIComponent(caseId)}`, {
    method: "DELETE",
  });

  return handleJson(response);
}

export async function submitCheckpointDecision(caseId, checkpointId, payload) {
  const response = await apiFetch(
    `/api/cases/${encodeURIComponent(caseId)}/checkpoints/${encodeURIComponent(checkpointId)}/decision`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    }
  );

  return handleJson(response);
}

export async function queryWorkspace(question, language) {
  const response = await apiFetch("/api/workspace/query", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ question, language }),
  });

  return handleJson(response);
}

export async function fetchKnowledgeBase() {
  const response = await apiFetch("/api/knowledge");
  return handleJson(response);
}

export async function fetchKnowledgeFile(knowledgeFileId) {
  const response = await apiFetch(`/api/knowledge/${encodeURIComponent(knowledgeFileId)}`);
  return handleJson(response);
}

export async function uploadKnowledgeFiles({ files, language }) {
  const formData = new FormData();

  for (const file of files) {
    formData.append("knowledge_files", file);
  }

  formData.append("language", language);

  const response = await apiFetch("/api/knowledge/upload", {
    method: "POST",
    body: formData,
  });

  return handleJson(response, { files, operation: "knowledge_upload" });
}

export async function compareKnowledge(caseId, language, caseSnapshot = null) {
  const response = await apiFetch("/api/knowledge/compare", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ caseId, language, caseSnapshot }),
  });

  return handleJson(response);
}

export async function summarizeKnowledgeFile(knowledgeFileId, language) {
  const response = await apiFetch(`/api/knowledge/${encodeURIComponent(knowledgeFileId)}/summarize`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ language }),
  });

  return handleJson(response);
}

export async function generateQuoteEstimate(caseId, language, caseSnapshot = null) {
  const response = await apiFetch("/api/quote/build", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ caseId, language, caseSnapshot }),
  });

  return handleJson(response, { operation: "quote_build" });
}

export async function approveQuote(caseId, quoteEstimate, language, caseSnapshot = null) {
  const response = await apiFetch("/api/quote/approve", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ caseId, quoteEstimate, language, caseSnapshot, actor: "user" }),
  });

  return handleJson(response);
}

export async function markQuoteSent(caseId, quoteEstimate, language, caseSnapshot = null) {
  const response = await apiFetch("/api/quote/mark-sent", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ caseId, quoteEstimate, language, caseSnapshot, actor: "user" }),
  });

  return handleJson(response);
}

export async function fetchQuoteDocument(caseId, quoteEstimate, language, caseSnapshot = null) {
  const response = await apiFetch("/api/quote/document", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ caseId, quoteEstimate, language, caseSnapshot }),
  });

  return handleJson(response);
}

export async function generateQuoteEmail(caseId, quoteEstimate, language, caseSnapshot = null) {
  const response = await apiFetch("/api/quote/email", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ caseId, quoteEstimate, language, caseSnapshot }),
  });

  return handleJson(response);
}

export async function createQuoteSnapshot(caseId, quoteEstimate, language, caseSnapshot = null) {
  const response = await apiFetch("/api/quote/snapshot", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ caseId, quoteEstimate, language, actor: "user", caseSnapshot }),
  });

  return handleJson(response);
}

export async function fetchPendingOutcomes() {
  const response = await apiFetch("/api/outcomes/pending");
  return handleJson(response);
}

export async function logQuoteOutcome(payload) {
  const response = await apiFetch("/api/outcomes", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  return handleJson(response);
}

export async function fetchDashboardStats() {
  const response = await apiFetch("/api/dashboard/stats");
  return handleJson(response);
}

async function apiFetch(input, init = {}) {
  const token = await getAccessToken();
  const headers = new Headers(init.headers || {});

  if (token) {
    headers.set("authorization", `Bearer ${token}`);
  }

  return fetch(input, {
    ...init,
    headers,
  });
}

async function handleJson(response, context = {}) {
  const contentType = response.headers.get("content-type") || "";

  if (!contentType.includes("application/json")) {
    const body = await response.text();
    throw new Error(inferNonJsonApiError({ body, context, response }));
  }

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.details || payload.error || "Request failed");
  }

  return payload;
}

function inferNonJsonApiError({ body, context, response }) {
  const trimmed = String(body || "").trim();
  const lowered = trimmed.toLowerCase();
  const files = Array.isArray(context.files) ? context.files : [];
  const operation = String(context.operation || "");
  const hasPdf = files.some((file) => {
    const name = String(file?.name || "").toLowerCase();
    const type = String(file?.type || "").toLowerCase();
    return name.endsWith(".pdf") || type === "application/pdf";
  });
  const hasSpreadsheet = files.some((file) => {
    const name = String(file?.name || "").toLowerCase();
    const type = String(file?.type || "").toLowerCase();
    return (
      name.endsWith(".xlsx") ||
      name.endsWith(".xls") ||
      name.endsWith(".csv") ||
      type.includes("spreadsheet") ||
      type.includes("excel") ||
      type === "text/csv"
    );
  });

  if (
    hasPdf &&
    (response.status >= 500 ||
      response.status === 413 ||
      /payload|too large|entity too large|body exceeded|function invocation failed|internal server error/i.test(trimmed))
  ) {
    return "cannot parse PDF";
  }

  if (response.status === 413 || /payload|too large|entity too large|body exceeded/i.test(trimmed)) {
    return "Uploaded file is too large for the current deployment.";
  }

  if (operation === "quote_build" && response.status !== 404) {
    return "Draft quote generation failed before the backend returned JSON. Retry once, then check the Vercel function logs for /api/quote/build.";
  }

  if (operation === "knowledge_upload" && response.status !== 404) {
    return "Knowledge file upload failed before the backend returned JSON. Retry once, then check the Vercel function logs for /api/knowledge/upload.";
  }

  if (
    operation === "rfq_intake" &&
    hasSpreadsheet &&
    (response.status >= 500 ||
      /function invocation failed|internal server error|gateway|timed out|timeout|runtime exited|deployment error/i.test(lowered))
  ) {
    return "Excel intake parsing failed before the backend returned JSON. Retry once, then check the Vercel function logs for /api/intake.";
  }

  if (
    response.status === 404 &&
    (trimmed.startsWith("<") ||
      trimmed.startsWith("Cannot ") ||
      trimmed === "" ||
      lowered.includes("not found"))
  ) {
    return "Backend API is not available on this server. Open the app from the Node.js server preview instead of a static file server.";
  }

  if (response.status >= 500) {
    return "Backend request failed before returning JSON. Check the server logs for the failing route.";
  }

  return "Backend API returned a non-JSON response.";
}

export const __apiInternals = {
  inferNonJsonApiError,
};
