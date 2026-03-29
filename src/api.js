export async function createCaseFromIntake({ files, emailText, language }) {
  const formData = new FormData();

  for (const file of files) {
    formData.append("rfq_files", file);
  }

  formData.append("email_text", emailText);
  formData.append("language", language);

  const response = await fetch("/api/intake", {
    method: "POST",
    body: formData,
  });

  return handleJson(response, { files, operation: "rfq_intake" });
}

export async function fetchCases() {
  const response = await fetch("/api/cases");
  return handleJson(response);
}

export async function fetchCase(caseId) {
  const response = await fetch(`/api/cases/${encodeURIComponent(caseId)}`);
  return handleJson(response);
}

export async function fetchSystemStatus() {
  const response = await fetch("/api/system/status");
  return handleJson(response);
}

export async function updateCase(caseId, payload) {
  const response = await fetch(`/api/cases/${encodeURIComponent(caseId)}`, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  return handleJson(response);
}

export async function submitCheckpointDecision(caseId, checkpointId, payload) {
  const response = await fetch(
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
  const response = await fetch("/api/workspace/query", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ question, language }),
  });

  return handleJson(response);
}

export async function fetchKnowledgeBase() {
  const response = await fetch("/api/knowledge");
  return handleJson(response);
}

export async function fetchKnowledgeFile(knowledgeFileId) {
  const response = await fetch(`/api/knowledge/${encodeURIComponent(knowledgeFileId)}`);
  return handleJson(response);
}

export async function uploadKnowledgeFiles({ files, language }) {
  const formData = new FormData();

  for (const file of files) {
    formData.append("knowledge_files", file);
  }

  formData.append("language", language);

  const response = await fetch("/api/knowledge/upload", {
    method: "POST",
    body: formData,
  });

  return handleJson(response, { files, operation: "knowledge_upload" });
}

export async function compareKnowledge(caseId, language) {
  const response = await fetch("/api/knowledge/compare", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ caseId, language }),
  });

  return handleJson(response);
}

export async function summarizeKnowledgeFile(knowledgeFileId, language) {
  const response = await fetch(`/api/knowledge/${encodeURIComponent(knowledgeFileId)}/summarize`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ language }),
  });

  return handleJson(response);
}

export async function generateQuoteEstimate(caseId, language) {
  const response = await fetch("/api/quote/build", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ caseId, language }),
  });

  return handleJson(response);
}

export async function generateQuoteEmail(caseId, quoteEstimate, language) {
  const response = await fetch("/api/quote/email", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ caseId, quoteEstimate, language }),
  });

  return handleJson(response);
}

export async function createQuoteSnapshot(caseId, quoteEstimate, language) {
  const response = await fetch("/api/quote/snapshot", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ caseId, quoteEstimate, language, actor: "user" }),
  });

  return handleJson(response);
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
  const hasPdf = files.some((file) => {
    const name = String(file?.name || "").toLowerCase();
    const type = String(file?.type || "").toLowerCase();
    return name.endsWith(".pdf") || type === "application/pdf";
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

  if (
    trimmed.startsWith("<") ||
    trimmed.startsWith("Cannot ") ||
    trimmed === "" ||
    response.status === 404 ||
    lowered.includes("not found")
  ) {
    return "Backend API is not available on this server. Open the app from the Node.js server preview instead of a static file server.";
  }

  return "Backend API returned a non-JSON response.";
}

export const __apiInternals = {
  inferNonJsonApiError,
};
