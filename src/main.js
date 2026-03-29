import { renderApp } from "./app.js";
import {
  compareKnowledge,
  createCaseFromIntake,
  deleteCase as deleteCaseRequest,
  fetchCase,
  fetchCases,
  fetchKnowledgeBase,
  fetchKnowledgeFile,
  fetchSystemStatus,
  createQuoteSnapshot,
  generateQuoteEmail,
  generateQuoteEstimate,
  queryWorkspace,
  submitCheckpointDecision,
  summarizeKnowledgeFile,
  updateCase,
  uploadKnowledgeFiles,
} from "./api.js";
import { confidenceLabel, t } from "./i18n.js";
import {
  configureSupabaseClient,
  getCurrentSession,
  onSupabaseAuthStateChange,
  signInWithPassword,
  signOutSession,
} from "./supabase.js";

const root = document.querySelector("#app");
const storedLanguage = globalThis.localStorage?.getItem("quotecase_language");
const CASE_CACHE_KEY = "quotelligence_case_cache_v2";
const DEFAULT_ALLOWED_STATUSES = [
  "New",
  "Parsing",
  "Ready for Review",
  "Needs Clarification",
  "Under Knowledge Review",
  "Partially Supported",
  "Ready to Quote",
  "Escalate Internally",
];
let authSubscription = null;
let authClientConfigKey = "";

const state = {
  language: storedLanguage === "zh" ? "zh" : "en",
  sidebarCollapsed: false,
  intakeDraft: {
    files: [],
    emailText: "",
  },
  intake: {
    status: "idle",
    parsingStatus: "New",
    progress: 0,
    message: "",
    activity: [],
  },
  cases: [],
  allowedStatuses: [],
  selectedCaseId: null,
  selectedCase: null,
  selectedProductIndex: 0,
  caseProductSelections: {},
  modalOpen: false,
  loadingCases: false,
  error: "",
  system: {
    backendAvailable: false,
    aiConfigured: false,
    model: "",
    storageMode: "",
    storageHealthy: true,
    storageDetails: "",
    supabase: {
      configured: false,
      url: "",
      anonKey: "",
    },
  },
  auth: {
    ready: false,
    configured: false,
    loading: false,
    email: "",
    password: "",
    error: "",
    session: null,
    user: null,
  },
  analyst: {
    open: true,
    question: "",
    loading: false,
    messages: [],
  },
  knowledge: {
    files: [],
    categories: [],
    uploading: false,
    uploadFeedback: "",
    previewOpen: false,
    selectedFile: null,
    summaryLoadingId: "",
  },
  quote: {
    selectedCaseId: null,
    selectedCase: null,
    comparing: false,
    quoteLoading: false,
    emailLoading: false,
    emailDraft: null,
    sendFeedback: "",
  },
};

resetIdleIntakeMessage();

function mount(options = {}) {
  const preserveView = options.preserveView !== false;
  const viewState = preserveView ? captureViewState() : null;

  renderApp(
    root,
    {
      ...state,
      ui: {
        animateRouteChange: Boolean(options.animateRouteChange),
      },
    },
    window.location.hash || "#/intake"
  );

  if (viewState) {
    restoreViewState(viewState);
  }
}

window.addEventListener("hashchange", async () => {
  if (shouldBlockProtectedRoutes()) {
    mount({ animateRouteChange: true, preserveView: false });
    return;
  }

  mount({ animateRouteChange: true, preserveView: false });
  try {
    await syncRouteData();
  } catch (error) {
    state.error = error instanceof Error ? error.message : String(error);
  }
  mount();
});

root.addEventListener("click", async (event) => {
  const target = event.target.closest("[data-action]");

  if (!target) {
    return;
  }

  const action = target.dataset.action;

  try {
    if (
      action === "close-case-modal" &&
      target.classList.contains("modal-overlay") &&
      event.target.closest(".modal-window")
    ) {
      return;
    }

    if (action === "set-language") {
      event.preventDefault();
      state.language = target.dataset.language === "zh" ? "zh" : "en";
      globalThis.localStorage?.setItem("quotecase_language", state.language);
      if (state.intake.status === "idle") {
        resetIdleIntakeMessage();
      }
      mount();
      return;
    }

    if (action === "submit-login") {
      event.preventDefault();
      await submitLogin();
      return;
    }

    if (action === "sign-out") {
      event.preventDefault();
      await logout();
      return;
    }

    if (action === "toggle-sidebar") {
      event.preventDefault();
      state.sidebarCollapsed = !state.sidebarCollapsed;
      mount();
      return;
    }

    if (action === "open-file-picker") {
      event.preventDefault();
      root.querySelector("#rfq-file-input")?.click();
      return;
    }

    if (action === "connect-email-thread") {
      event.preventDefault();
      state.intakeDraft.emailText =
        state.language === "zh"
          ? "Customer: HeatEx Procurement Team\n请报价不锈钢无缝管，目的地为新加坡，要求 EN 10204 3.1 文件。请说明是否支持见证检验和 NACE 要求。"
          : "Customer: HeatEx Procurement Team\nPlease quote stainless seamless pipe for Singapore with EN 10204 3.1 documentation. Please advise on witness inspection and NACE compliance support.";
      mount();
      return;
    }

    if (action === "start-intake-parse") {
      event.preventDefault();
      if (!state.intakeDraft.files.length && !state.intakeDraft.emailText.trim()) {
        return;
      }

      await submitIntake();
      return;
    }

    if (action === "toggle-analyst") {
      event.preventDefault();
      state.analyst.open = !state.analyst.open;
      mount();
      return;
    }

    if (action === "open-knowledge-picker") {
      event.preventDefault();
      root.querySelector("#knowledge-file-input")?.click();
      return;
    }

    if (action === "preview-knowledge-file") {
      event.preventDefault();
      await openKnowledgePreview(target.dataset.knowledgeFileId);
      return;
    }

    if (action === "summarize-knowledge-file") {
      event.preventDefault();
      await runKnowledgeSummary(target.dataset.knowledgeFileId);
      return;
    }

    if (action === "open-case") {
      event.preventDefault();
      await openCase(target.dataset.caseId);
      return;
    }

    if (action === "delete-case") {
      event.preventDefault();
      await deleteCase(target.dataset.caseId);
      return;
    }

    if (action === "add-product-item" && state.selectedCase) {
      event.preventDefault();
      const productItems = ensureProductItems(state.selectedCase);
      const nextItems = [
        ...productItems,
        createEmptyProductItem(productItems.length + 1),
      ];
      const response = await updateCase(state.selectedCase.caseId, {
        productItems: nextItems,
      });
      replaceCaseSummary(response.case);
      state.selectedCase = withProductItems(response.case);
      state.selectedProductIndex = nextItems.length - 1;
      mount();
      return;
    }

    if (action === "submit-analyst-question") {
      event.preventDefault();
      await submitWorkspaceQuestion();
      return;
    }

    if (action === "analyst-example") {
      event.preventDefault();
      state.analyst.question = target.dataset.prompt || "";
      mount();
      return;
    }

    if (action === "run-knowledge-compare") {
      event.preventDefault();
      await runKnowledgeComparison();
      return;
    }

    if (action === "workflow-decision" && state.selectedCase) {
      event.preventDefault();
      const checkpointId = target.dataset.checkpointId || "";
      const decision = target.dataset.decision || "";
      const note = readCheckpointNote(checkpointId);
      const response = await submitCheckpointDecision(state.selectedCase.caseId, checkpointId, {
        action: decision,
        note,
        actor: "user",
      });
      replaceCaseSummary(response.case);
      state.selectedCase = withProductItems(response.case);
      mount();
      return;
    }

    if (action === "generate-quote-estimate") {
      event.preventDefault();
      await runQuoteEstimate();
      return;
    }

    if (action === "generate-quote-email") {
      event.preventDefault();
      await runQuoteEmailGeneration();
      return;
    }

    if (action === "save-quote-snapshot") {
      event.preventDefault();
      await saveQuoteSnapshot();
      return;
    }

    if (action === "send-quote-email") {
      event.preventDefault();
      sendQuoteEmail();
      return;
    }

    if (action === "close-case-modal") {
      event.preventDefault();
      state.modalOpen = false;
      mount();
    }

    if (action === "close-knowledge-preview") {
      event.preventDefault();
      state.knowledge.previewOpen = false;
      mount();
    }
  } catch (error) {
    state.error = error instanceof Error ? error.message : String(error);
    mount();
  }
});

root.addEventListener("change", async (event) => {
  const target = event.target;

  try {
    if (target.id === "rfq-file-input") {
      state.intakeDraft.files = Array.from(target.files || []);
      mount();
      return;
    }

    if (target.id === "knowledge-file-input") {
      const files = Array.from(target.files || []);

      if (!files.length) {
        return;
      }

      await submitKnowledgeUpload(files);
      target.value = "";
      return;
    }

    if (target.matches("[data-field-name]") && state.selectedCase) {
      const nextFields = state.selectedCase.extractedFields.map((field) =>
        field.fieldName === target.dataset.fieldName
          ? {
              ...field,
              value: target.value,
              isUserEdited: true,
              confidence: "high",
              confidenceLabel: "Ready for Review",
            }
          : field
      );

      const response = await updateCase(state.selectedCase.caseId, {
        extractedFields: nextFields,
      });

      replaceCaseSummary(response.case);
      state.selectedCase = response.case;
      mount();
      return;
    }

    if (target.matches("[data-product-index]") && state.selectedCase) {
      state.selectedProductIndex = Number(target.value) || 0;
      mount();
      return;
    }

    if (target.matches("[data-case-product-index]")) {
      state.caseProductSelections[target.dataset.caseId] = Number(target.value) || 0;
      mount();
      return;
    }

      if (target.matches("[data-quote-case-select]")) {
        state.quote.selectedCaseId = target.value || null;
        state.quote.emailDraft = null;
        state.quote.sendFeedback = "";

        if (state.quote.selectedCaseId) {
          if (state.selectedCase?.caseId === state.quote.selectedCaseId) {
            state.quote.selectedCase = withProductItems(state.selectedCase);
            state.quote.emailDraft = state.selectedCase.quoteEmailDraft || null;
          } else {
            const caseRecord = await loadCaseDetail(state.quote.selectedCaseId);
            state.quote.selectedCase = withProductItems(caseRecord);
            state.quote.emailDraft = caseRecord.quoteEmailDraft || null;
          }
        } else {
          state.quote.selectedCase = null;
        }

      mount();
      return;
    }

    if (target.matches("[data-product-field]") && state.selectedCase) {
      const productItems = ensureProductItems(state.selectedCase).map((item, index) =>
        index === state.selectedProductIndex
          ? {
              ...item,
              [target.dataset.productField]: target.value,
            }
          : item
      );

      const response = await updateCase(state.selectedCase.caseId, {
        productItems,
      });

      replaceCaseSummary(response.case);
      state.selectedCase = withProductItems(response.case);
      mount();
      return;
    }

    if (target.matches("[data-quote-header]") && state.quote.selectedCase) {
      const quoteEstimate = {
        ...ensureQuoteEstimate(state.quote.selectedCase),
        [target.dataset.quoteHeader]: target.value,
      };

      const response = await updateCase(state.quote.selectedCase.caseId, {
        quoteEstimate,
      });

      syncUpdatedCase(response.case);
      mount();
      return;
    }

    if (target.matches("[data-quote-term]") && state.quote.selectedCase) {
      const quoteEstimate = ensureQuoteEstimate(state.quote.selectedCase);
      const terms = {
        ...(quoteEstimate.terms || {}),
        [target.dataset.quoteTerm]: target.value,
      };

      const response = await updateCase(state.quote.selectedCase.caseId, {
        quoteEstimate: {
          ...quoteEstimate,
          terms,
        },
      });

      syncUpdatedCase(response.case);
      mount();
      return;
    }

    if (target.matches("[data-quote-charge]") && state.quote.selectedCase) {
      const quoteEstimate = ensureQuoteEstimate(state.quote.selectedCase);
      const additionalCharges = (quoteEstimate.additionalCharges || []).map((charge) =>
        charge.chargeId === target.dataset.chargeId
          ? {
              ...charge,
              amount: target.value,
            }
          : charge
      );

      const response = await updateCase(state.quote.selectedCase.caseId, {
        quoteEstimate: {
          ...quoteEstimate,
          additionalCharges,
        },
      });

      syncUpdatedCase(response.case);
      mount();
      return;
    }

    if (target.matches("[data-quote-line-field]") && state.quote.selectedCase) {
      const quoteEstimate = ensureQuoteEstimate(state.quote.selectedCase);
      const lineItems = (quoteEstimate.lineItems || []).map((item) =>
        item.lineId === target.dataset.lineId
          ? {
              ...item,
              [target.dataset.quoteLineField]: target.value,
            }
          : item
      );

      const response = await updateCase(state.quote.selectedCase.caseId, {
        quoteEstimate: {
          ...quoteEstimate,
          lineItems,
        },
      });

      syncUpdatedCase(response.case);
      mount();
      return;
    }

    if (target.matches("[data-case-status]") && state.selectedCase) {
      const response = await updateCase(state.selectedCase.caseId, {
        status: target.value,
      });

      replaceCaseSummary(response.case);
      state.selectedCase = response.case;
      mount();
    }
  } catch (error) {
    state.error = error instanceof Error ? error.message : String(error);
    mount();
  }
});

root.addEventListener("input", (event) => {
  const target = event.target;

  if (target.id === "email-intake-text") {
    state.intakeDraft.emailText = target.value;
    const createCaseButton = root.querySelector('[data-action="start-intake-parse"]');

    if (createCaseButton) {
      const canParse = state.intakeDraft.files.length > 0 || state.intakeDraft.emailText.trim().length > 0;
      createCaseButton.disabled = !canParse;
      createCaseButton.classList.toggle("button--disabled", !canParse);
    }
    return;
  }

  if (target.id === "analyst-question") {
    state.analyst.question = target.value;
    return;
  }

  if (target.id === "login-email") {
    state.auth.email = target.value;
    return;
  }

  if (target.id === "login-password") {
    state.auth.password = target.value;
  }
});

await bootstrap();

async function syncRouteData() {
  await syncSystemStatus();

  const needsCaseData =
    window.location.hash === "#/case" ||
    window.location.hash === "#/knowledge" ||
    window.location.hash === "#/quote" ||
    !window.location.hash;

  if (needsCaseData) {
    const shouldShowLoadingState = !state.cases.length;

    state.loadingCases = shouldShowLoadingState;
    state.error = "";
    if (shouldShowLoadingState) {
      mount();
    }
    try {
      const { cases, allowedStatuses } = await loadCaseSummaries();
      state.cases = cases;
      state.allowedStatuses = allowedStatuses;
      reconcileSelectedCases();

      if (window.location.hash === "#/knowledge" || window.location.hash === "#/quote") {
        const knowledgeResponse = await fetchKnowledgeBase();
        state.knowledge.files = knowledgeResponse.knowledgeFiles;
        state.knowledge.categories = knowledgeResponse.categories;
      }

      if (window.location.hash === "#/quote" && state.quote.selectedCaseId) {
        try {
          const caseRecord = await loadCaseDetail(state.quote.selectedCaseId);
          state.quote.selectedCase = withProductItems(caseRecord);
          state.quote.emailDraft = caseRecord.quoteEmailDraft || null;
        } catch (error) {
          if (!isCaseNotFoundError(error)) {
            throw error;
          }

          state.quote.selectedCaseId = state.cases[0]?.caseId || null;
          state.quote.selectedCase = null;
          state.quote.emailDraft = null;

          if (state.quote.selectedCaseId) {
            const fallbackCase = await loadCaseDetail(state.quote.selectedCaseId);
            state.quote.selectedCase = withProductItems(fallbackCase);
            state.quote.emailDraft = fallbackCase.quoteEmailDraft || null;
          }
        }
      } else if (window.location.hash === "#/quote") {
        state.quote.selectedCase = null;
        state.quote.emailDraft = null;
      }
    } finally {
      state.loadingCases = false;
    }
  }
}

async function syncSystemStatus() {
  try {
    const response = await fetchSystemStatus();
    state.system = response.system;
    if (response.system.storageMode === "database") {
      clearCaseCache();
    }
    await syncSupabaseAuthClient(response.system.supabase || {});
  } catch {
    state.system = {
      backendAvailable: false,
      aiConfigured: false,
      model: "",
      storageMode: "",
      storageHealthy: false,
      storageDetails: "",
      supabase: {
        configured: false,
        url: "",
        anonKey: "",
      },
    };
    state.auth.ready = true;
    state.auth.configured = false;
  }
}

async function submitIntake() {
  state.error = "";
  state.intake = {
    status: "parsing",
    parsingStatus: "Parsing",
    progress: 15,
    message:
      state.language === "zh"
        ? "正在上传文件并开始解析。"
        : "Uploading files and starting parsing.",
    activity: [
      createIntakeActivity("running", state.language === "zh" ? "接收 RFQ 文件与邮件内容" : "Receiving RFQ files and email content"),
    ],
  };
  mount();

  await tickProgress(
    32,
    state.language === "zh"
      ? "正在提取产品、合规和交付信息。"
      : "Extracting product, compliance, and delivery details."
  );

  pushIntakeActivity(
    "running",
    state.language === "zh" ? "解析产品明细并标准化字段" : "Parsing product details and normalizing fields"
  );

  await tickProgress(
    58,
    state.language === "zh"
      ? "正在检查需求完整性与潜在风险。"
      : "Checking completeness and potential risk."
  );

  const response = await createCaseFromIntake({
    files: state.intakeDraft.files,
    emailText: state.intakeDraft.emailText,
    language: state.language,
  });

  syncIntakeActivityFromCase(response.case);

  await tickProgress(100, state.language === "zh" ? "案例已创建。" : "Case created.");

  state.intake = {
    status: "completed",
    parsingStatus: "Ready for Review",
    progress: 100,
    message:
      state.language === "zh"
        ? "解析完成，并已创建案例记录。"
        : "Parsing completed and a case record was created.",
    activity: state.intake.activity,
  };
  state.intakeDraft = { files: [], emailText: "" };
  state.selectedCaseId = response.case.caseId;
  state.quote.selectedCaseId = response.case.caseId;
  state.selectedCase = response.case;
  state.selectedProductIndex = 0;
  state.modalOpen = true;
  cacheCaseRecord(response.case);
  replaceCaseSummary(response.case);
  window.location.hash = "#/case";
  await syncRouteData();
  state.selectedCase = response.case;
  state.modalOpen = true;
  mount();
}

async function tickProgress(progress, message) {
  state.intake = {
    ...state.intake,
    progress,
    message,
  };
  mount();
  await new Promise((resolve) => window.setTimeout(resolve, 150));
}

function createIntakeActivity(status, text) {
  return {
    id: `intake-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    status,
    text,
  };
}

function pushIntakeActivity(status, text) {
  state.intake = {
    ...state.intake,
    activity: [...(state.intake.activity || []), createIntakeActivity(status, text)],
  };
  mount();
}

function syncIntakeActivityFromCase(caseRecord) {
  const checkpoints = caseRecord.workflow?.checkpoints || [];
  const relevant = checkpoints.slice(0, 5);
  const activity = relevant.map((checkpoint) =>
    createIntakeActivity(checkpoint.isBlocking ? "waiting" : "done", `${checkpoint.title}: ${checkpoint.summary}`)
  );

  if (caseRecord.workflow?.paused) {
    const current = checkpoints.find((entry) => entry.checkpointId === caseRecord.workflow.currentCheckpointId);
    if (current?.unresolvedIssues?.length) {
      activity.push(
        createIntakeActivity(
          "waiting",
          `${current.title}: ${current.unresolvedIssues[0]}`
        )
      );
    }
  }

  state.intake = {
    ...state.intake,
    activity,
  };
}

async function openCase(caseId) {
  const caseRecord = await loadCaseDetail(caseId);
  state.selectedCaseId = caseId;
  state.quote.selectedCaseId = caseId;
  state.selectedCase = withProductItems(caseRecord);
  state.selectedProductIndex = 0;
  state.modalOpen = true;
  mount();
}

async function deleteCase(caseId) {
  if (!caseId) {
    return;
  }

  const confirmed = globalThis.confirm?.(t(state.language, "deleteCaseConfirm"));

  if (confirmed === false) {
    return;
  }

  state.error = "";
  await deleteCaseRequest(caseId);
  removeCaseFromState(caseId);
  reconcileSelectedCases();

  if (window.location.hash === "#/quote" && state.quote.selectedCaseId) {
    const nextCase = await loadCaseDetail(state.quote.selectedCaseId);
    state.quote.selectedCase = withProductItems(nextCase);
    state.quote.emailDraft = nextCase.quoteEmailDraft || null;
  } else if (!state.quote.selectedCaseId) {
    state.quote.selectedCase = null;
    state.quote.emailDraft = null;
  }

  mount();
}

async function submitKnowledgeUpload(files) {
  state.error = "";
  state.knowledge.uploading = true;
  state.knowledge.uploadFeedback = "";
  mount();

  try {
    const response = await uploadKnowledgeFiles({
      files,
      language: state.language,
    });

    if (shouldUseBackendAuthoritativeData()) {
      const knowledgeResponse = await fetchKnowledgeBase();
      state.knowledge.files = knowledgeResponse.knowledgeFiles;
      state.knowledge.categories = knowledgeResponse.categories;
    } else {
      state.knowledge.files = mergeKnowledgeFiles(state.knowledge.files, response.knowledgeFiles);
    }
    state.knowledge.uploadFeedback =
      state.language === "zh"
        ? `已上传 ${response.knowledgeFiles.length} 个知识文件。`
        : `${response.knowledgeFiles.length} knowledge files uploaded.`;
  } finally {
    state.knowledge.uploading = false;
    mount();
  }
}

async function openKnowledgePreview(knowledgeFileId) {
  const response = await fetchKnowledgeFile(knowledgeFileId);
  state.knowledge.selectedFile = response.knowledgeFile;
  state.knowledge.previewOpen = true;
  mount();
}

async function runKnowledgeSummary(knowledgeFileId) {
  state.error = "";
  state.knowledge.summaryLoadingId = knowledgeFileId;
  mount();

  try {
    const response = await summarizeKnowledgeFile(knowledgeFileId, state.language);
    state.knowledge.files = mergeKnowledgeFiles(state.knowledge.files, [response.knowledgeFile]);

    if (state.knowledge.selectedFile?.knowledgeFileId === knowledgeFileId) {
      state.knowledge.selectedFile = response.knowledgeFile;
      state.knowledge.previewOpen = true;
    }
  } finally {
    state.knowledge.summaryLoadingId = "";
    mount();
  }
}

async function runKnowledgeComparison() {
  if (!state.quote.selectedCaseId) {
    return;
  }

  state.error = "";
  state.quote.comparing = true;
  mount();

  try {
    const response = await compareKnowledge(
      state.quote.selectedCaseId,
      state.language,
      state.quote.selectedCase || state.selectedCase || null
    );
    state.knowledge.files = mergeKnowledgeFiles(state.knowledge.files, response.knowledgeFiles);
    syncUpdatedCase(response.case);
  } finally {
    state.quote.comparing = false;
    mount();
  }
}

async function runQuoteEstimate() {
  if (!state.quote.selectedCaseId) {
    return;
  }

  state.error = "";
  state.quote.quoteLoading = true;
  mount();

  try {
    const response = await generateQuoteEstimate(
      state.quote.selectedCaseId,
      state.language,
      state.quote.selectedCase || state.selectedCase || null
    );
    syncUpdatedCase(response.case);
  } finally {
    state.quote.quoteLoading = false;
    mount();
  }
}

async function runQuoteEmailGeneration() {
  if (!state.quote.selectedCase) {
    return;
  }

  state.error = "";
  state.quote.emailLoading = true;
  state.quote.sendFeedback = "";
  mount();

  try {
    const response = await generateQuoteEmail(
      state.quote.selectedCase.caseId,
      ensureQuoteEstimate(state.quote.selectedCase),
      state.language
    );
    syncUpdatedCase(response.case);
    state.quote.emailDraft = response.emailDraft;
  } finally {
    state.quote.emailLoading = false;
    mount();
  }
}

async function saveQuoteSnapshot() {
  if (!state.quote.selectedCase) {
    return;
  }

  state.error = "";
  state.quote.sendFeedback = "";
  mount();

  const response = await createQuoteSnapshot(
    state.quote.selectedCase.caseId,
    ensureQuoteEstimate(state.quote.selectedCase),
    state.language
  );

  syncUpdatedCase(response.case);
  state.quote.sendFeedback =
    state.language === "zh"
      ? "已保存报价版本记录。"
      : "Quote version saved to history.";
  mount();
}

function sendQuoteEmail() {
  const emailDraft = state.quote.emailDraft;

  if (!emailDraft || !emailDraft.to) {
    state.quote.sendFeedback =
      state.language === "zh"
        ? "请先填写买家邮箱并生成邮件草稿。"
        : "Add the buyer email and generate the email draft first.";
    mount();
    return;
  }

  const params = new URLSearchParams({
    subject: emailDraft.subject,
    body: emailDraft.body,
  });

  if (emailDraft.cc) {
    params.set("cc", emailDraft.cc);
  }

  globalThis.location.href = `mailto:${encodeURIComponent(emailDraft.to)}?${params.toString()}`;
  state.quote.sendFeedback =
    state.language === "zh"
      ? "已打开默认邮件客户端。"
      : "Opened your default mail client.";
  mount();
}

function replaceCaseSummary(caseRecord) {
  const normalizedCase = withProductItems(caseRecord);
  const summary = buildCaseSummary(normalizedCase);

  const index = state.cases.findIndex((entry) => entry.caseId === summary.caseId);

  if (index >= 0) {
    state.cases[index] = summary;
  } else {
    state.cases.unshift(summary);
  }

  cacheCaseRecord(normalizedCase);
}

function syncUpdatedCase(caseRecord) {
  replaceCaseSummary(caseRecord);

  if (state.selectedCaseId === caseRecord.caseId) {
    state.selectedCase = withProductItems(caseRecord);
  }

  if (state.quote.selectedCaseId === caseRecord.caseId) {
    state.quote.selectedCase = withProductItems(caseRecord);
    state.quote.emailDraft = caseRecord.quoteEmailDraft || state.quote.emailDraft;
  }
}

async function submitWorkspaceQuestion() {
  const question = state.analyst.question.trim();

  if (!question) {
    return;
  }

  state.analyst.loading = true;
  state.error = "";
  state.analyst.messages.unshift({
    role: "user",
    text: question,
  });
  mount();

  try {
    const response = await queryWorkspace(question, state.language);
    state.analyst.messages.unshift({
      role: "assistant",
      text: response.answer.answer,
      meta: `${confidenceLabel(state.language, response.answer.confidence)} • ${response.answer.basis}`,
    });
    state.analyst.question = "";
  } finally {
    state.analyst.loading = false;
    mount();
  }
}

function resetIdleIntakeMessage() {
  state.intake.message =
    state.language === "zh"
      ? "请上传 RFQ 文件或粘贴客户邮件以开始接收。"
      : "Attach RFQ files or paste the customer email to begin intake.";
}

function withProductItems(caseRecord) {
  if (caseRecord.productItems?.length) {
    return caseRecord;
  }

  return {
    ...caseRecord,
    productItems: [buildProductFromExtractedFields(caseRecord)],
  };
}

function ensureProductItems(caseRecord) {
  return withProductItems(caseRecord).productItems;
}

function ensureQuoteEstimate(caseRecord) {
  if (caseRecord.quoteEstimate) {
    return caseRecord.quoteEstimate;
  }

  return {
    pricingStatus: "Draft quote",
    currency: "USD",
    incoterm: "Not clearly stated",
    lineItems: ensureProductItems(caseRecord).map((item, index) => ({
      lineId: `line-${index + 1}`,
      productId: item.productId || `product-${index + 1}`,
      productLabel: item.label || `Product ${index + 1}`,
      quantityText: item.quantity || "Not clearly stated",
      quantityValue: 0,
      quantityUnit: "",
      baseUnitPrice: 0,
      adjustmentAmount: 0,
      unitPrice: 0,
      lineTotal: 0,
      pricingBasis: "No uploaded pricing evidence matched this item.",
      supportingFiles: [],
    })),
    additionalCharges: [
      { chargeId: "charge-freight", label: "Freight", amount: 0 },
      { chargeId: "charge-other", label: "Other", amount: 0 },
    ],
    subtotal: 0,
    total: 0,
    terms: {
      buyerName: "",
      buyerEmail: "",
      ccEmails: "",
      sellerEntity: "Your Sales Team",
      paymentTerms: "To be confirmed",
      validityTerms: "30 days",
      leadTime: "To be confirmed",
      shippingTerms: "To be confirmed",
      quoteNotes: "",
    },
    assumptions: [],
    risks: [],
    supportingFiles: [],
    recommendedNextStep: "",
    summary: "",
  };
}

function readCheckpointNote(checkpointId) {
  const input = root.querySelector(`[data-checkpoint-note-for="${checkpointId}"]`);
  return input instanceof HTMLTextAreaElement ? input.value.trim() : "";
}

function buildProductFromExtractedFields(caseRecord) {
  return {
    productId: "product-1",
    label: "Product 1",
    productType: fieldValue(caseRecord, "Product Type"),
    materialGrade: fieldValue(caseRecord, "Material / Grade"),
    dimensions: fieldValue(caseRecord, "Dimensions"),
    outsideDimension: fieldValue(caseRecord, "Outside Dimension"),
    wallThickness: fieldValue(caseRecord, "Wall Thickness"),
    schedule: fieldValue(caseRecord, "Schedule"),
    lengthPerPiece: fieldValue(caseRecord, "Length Per Piece"),
    quantity: fieldValue(caseRecord, "Quantity"),
  };
}

function fieldValue(caseRecord, fieldName) {
  return caseRecord.extractedFields.find((field) => field.fieldName === fieldName)?.value || "Not clearly stated";
}

function createEmptyProductItem(index) {
  return {
    productId: `product-${index}`,
    label: `Product ${index}`,
    productType: "Not clearly stated",
    materialGrade: "Not clearly stated",
    dimensions: "Not clearly stated",
    outsideDimension: "Not clearly stated",
    wallThickness: "Not clearly stated",
    schedule: "Not clearly stated",
    lengthPerPiece: "Not clearly stated",
    quantity: "Not clearly stated",
  };
}

function mergeKnowledgeFiles(existingFiles, incomingFiles) {
  const fileMap = new Map(existingFiles.map((file) => [file.knowledgeFileId, file]));

  for (const file of incomingFiles) {
    fileMap.set(file.knowledgeFileId, file);
  }

  return [...fileMap.values()].sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
}

async function loadCaseDetail(caseId) {
  if (state.selectedCase?.caseId === caseId) {
    return state.selectedCase;
  }

  if (state.quote.selectedCase?.caseId === caseId) {
    return state.quote.selectedCase;
  }

  try {
    const response = await fetchCase(caseId);
    cacheCaseRecord(response.case);
    return response.case;
  } catch (error) {
    if (shouldUseBackendAuthoritativeData()) {
      throw error;
    }

    const cached = readCachedCase(caseId);

    if (cached) {
      return cached;
    }

    throw error;
  }
}

async function loadCaseSummaries() {
  try {
    const response = await fetchCases();
    if (shouldUseBackendAuthoritativeData()) {
      syncCaseCacheFromRemote(response.cases);
    }
    return {
      cases: shouldUseBackendAuthoritativeData() ? response.cases : mergeCaseSummariesWithCache(response.cases),
      allowedStatuses: response.allowedStatuses,
    };
  } catch (error) {
    if (shouldUseBackendAuthoritativeData()) {
      throw error;
    }

    const cachedCases = mergeCaseSummariesWithCache([]);

    if (!cachedCases.length) {
      throw error;
    }

    return {
      cases: cachedCases,
      allowedStatuses: state.allowedStatuses.length ? state.allowedStatuses : DEFAULT_ALLOWED_STATUSES,
    };
  }
}

function buildCaseSummary(caseRecord) {
  const normalizedCase = withProductItems(caseRecord);
  const primaryProduct = normalizedCase.productItems[0];

  return {
    caseId: normalizedCase.caseId,
    customerName: normalizedCase.customerName,
    projectName: normalizedCase.projectName,
    owner: normalizedCase.owner,
    status: normalizedCase.status,
    createdAt: normalizedCase.createdAt,
    updatedAt: normalizedCase.updatedAt,
    productType: primaryProduct?.productType || normalizedCase.extractedFields.find((field) => field.fieldName === "Product Type")?.value || "",
    material: primaryProduct?.materialGrade || normalizedCase.extractedFields.find((field) => field.fieldName === "Material / Grade")?.value || "",
    quantity: primaryProduct?.quantity || normalizedCase.extractedFields.find((field) => field.fieldName === "Quantity")?.value || "",
    productItems: normalizedCase.productItems,
    knowledgeStatus: normalizedCase.knowledgeComparison?.recommendedStatus || "",
  };
}

function mergeCaseSummariesWithCache(remoteSummaries) {
  const merged = new Map();

  for (const summary of remoteSummaries || []) {
    merged.set(summary.caseId, summary);
  }

  for (const caseRecord of Object.values(readCachedCaseMap())) {
    const summary = buildCaseSummary(caseRecord);

    if (!merged.has(summary.caseId)) {
      merged.set(summary.caseId, summary);
    }
  }

  return [...merged.values()].sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
}

function cacheCaseRecord(caseRecord) {
  if (shouldUseBackendAuthoritativeData()) {
    return;
  }

  if (!caseRecord?.caseId) {
    return;
  }

  const cache = readCachedCaseMap();
  cache[caseRecord.caseId] = withProductItems(caseRecord);
  writeCachedCaseMap(cache);
}

function readCachedCase(caseId) {
  const cache = readCachedCaseMap();
  return cache[caseId] || null;
}

function readCachedCaseMap() {
  try {
    const raw = globalThis.localStorage?.getItem(CASE_CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeCachedCaseMap(cache) {
  try {
    globalThis.localStorage?.setItem(CASE_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Ignore local cache write failures.
  }
}

function clearCaseCache() {
  try {
    globalThis.localStorage?.removeItem("quotelligence_case_cache_v1");
    globalThis.localStorage?.removeItem(CASE_CACHE_KEY);
  } catch {
    // Ignore local cache cleanup failures.
  }
}

async function bootstrap() {
  try {
    await syncSystemStatus();
    if (state.auth.user) {
      await syncRouteData();
    } else if (state.auth.configured) {
      window.location.hash = "#/login";
    }
  } catch (error) {
    state.error = error instanceof Error ? error.message : String(error);
  }

  mount({ animateRouteChange: true, preserveView: false });
}

async function syncSupabaseAuthClient(supabaseConfig) {
  const configured = Boolean(supabaseConfig?.configured && supabaseConfig?.url && supabaseConfig?.anonKey);
  state.auth.configured = configured;

  if (!configured) {
    if (authSubscription?.data?.subscription) {
      authSubscription.data.subscription.unsubscribe();
      authSubscription = null;
    }
    authClientConfigKey = "";
    state.auth.ready = true;
    state.auth.session = null;
    state.auth.user = null;
    return;
  }

  const nextConfigKey = `${supabaseConfig.url}::${supabaseConfig.anonKey}`;
  await configureSupabaseClient({
    url: supabaseConfig.url,
    anonKey: supabaseConfig.anonKey,
  });

  if (!authSubscription || authClientConfigKey !== nextConfigKey) {
    if (authSubscription?.data?.subscription) {
      authSubscription.data.subscription.unsubscribe();
    }

    authSubscription = onSupabaseAuthStateChange(async (session) => {
      applyAuthSession(session);

      if (!session) {
        clearWorkspaceState();
        window.location.hash = "#/login";
        mount({ preserveView: false });
        return;
      }

      if (state.system.backendAvailable) {
        try {
          await syncRouteData();
        } catch (error) {
          state.error = error instanceof Error ? error.message : String(error);
        }
        mount();
      }
    });
    authClientConfigKey = nextConfigKey;
  }

  const session = await getCurrentSession();
  applyAuthSession(session);
}

function applyAuthSession(session) {
  state.auth.ready = true;
  state.auth.session = session || null;
  state.auth.user = session?.user || null;
}

async function submitLogin() {
  if (!state.auth.configured) {
    return;
  }

  state.auth.loading = true;
  state.auth.error = "";
  mount();

  try {
    const session = await signInWithPassword({
      email: state.auth.email.trim(),
      password: state.auth.password,
    });
    applyAuthSession(session);
    state.auth.password = "";
    window.location.hash = "#/intake";
    await syncRouteData();
  } catch (error) {
    state.auth.error = error instanceof Error ? error.message : String(error);
  } finally {
    state.auth.loading = false;
    mount({ preserveView: false });
  }
}

async function logout() {
  await signOutSession();
  clearWorkspaceState();
  state.auth.password = "";
  window.location.hash = "#/login";
  mount({ preserveView: false });
}

function clearWorkspaceState() {
  state.cases = [];
  state.allowedStatuses = [];
  state.selectedCaseId = null;
  state.selectedCase = null;
  state.quote.selectedCaseId = null;
  state.quote.selectedCase = null;
  state.knowledge.files = [];
}

function shouldBlockProtectedRoutes() {
  return state.auth.ready && state.auth.configured && !state.auth.user;
}

function shouldUseBackendAuthoritativeData() {
  return state.system.backendAvailable && state.system.storageMode === "database";
}

function reconcileSelectedCases() {
  const availableCaseIds = new Set((state.cases || []).map((entry) => entry.caseId));
  const defaultCaseId =
    state.selectedCaseId && availableCaseIds.has(state.selectedCaseId)
      ? state.selectedCaseId
      : state.cases[0]?.caseId || null;

  if (!state.selectedCaseId || !availableCaseIds.has(state.selectedCaseId)) {
    state.selectedCaseId = defaultCaseId;
  }

  if (state.selectedCase && !availableCaseIds.has(state.selectedCase.caseId)) {
    state.selectedCase = null;
    state.modalOpen = false;
  }

  if (!state.quote.selectedCaseId || !availableCaseIds.has(state.quote.selectedCaseId)) {
    state.quote.selectedCaseId = defaultCaseId;
  }

  if (state.quote.selectedCase && !availableCaseIds.has(state.quote.selectedCase.caseId)) {
    state.quote.selectedCase = null;
    state.quote.emailDraft = null;
  }
}

function removeCaseFromState(caseId) {
  state.cases = state.cases.filter((entry) => entry.caseId !== caseId);
  delete state.caseProductSelections[caseId];

  if (!shouldUseBackendAuthoritativeData()) {
    const cache = readCachedCaseMap();
    delete cache[caseId];
    writeCachedCaseMap(cache);
  }
}

function isCaseNotFoundError(error) {
  return /case not found/i.test(error instanceof Error ? error.message : String(error));
}

function syncCaseCacheFromRemote(remoteCases) {
  const cache = {};

  for (const summary of remoteCases || []) {
    const existing = readCachedCase(summary.caseId);
    if (existing) {
      cache[summary.caseId] = existing;
    }
  }

  writeCachedCaseMap(cache);
}

function captureViewState() {
  const activeElement = document.activeElement;
  const descriptor = buildFocusableDescriptor(activeElement);

  return {
    scrollX: window.scrollX,
    scrollY: window.scrollY,
    focus: descriptor,
  };
}

function restoreViewState(viewState) {
  window.requestAnimationFrame(() => {
    window.scrollTo(viewState.scrollX, viewState.scrollY);

    if (!viewState.focus?.selector) {
      return;
    }

    const nextElement = root.querySelector(viewState.focus.selector);

    if (!nextElement || typeof nextElement.focus !== "function") {
      return;
    }

    nextElement.focus({ preventScroll: true });

    if (
      "selectionStart" in nextElement &&
      typeof nextElement.setSelectionRange === "function" &&
      Number.isInteger(viewState.focus.selectionStart) &&
      Number.isInteger(viewState.focus.selectionEnd)
    ) {
      nextElement.setSelectionRange(viewState.focus.selectionStart, viewState.focus.selectionEnd);
    }
  });
}

function buildFocusableDescriptor(element) {
  if (!(element instanceof HTMLElement) || !root.contains(element)) {
    return null;
  }

  const selector = selectorForElement(element);

  if (!selector) {
    return null;
  }

  return {
    selector,
    selectionStart: "selectionStart" in element ? element.selectionStart : null,
    selectionEnd: "selectionEnd" in element ? element.selectionEnd : null,
  };
}

function selectorForElement(element) {
  if (element.id) {
    return `#${escapeSelectorValue(element.id)}`;
  }

  const dataSelectorMap = [
    ["quoteLineField", ["lineId"]],
    ["quoteTerm", []],
    ["quoteCharge", ["chargeId"]],
    ["quoteHeader", []],
    ["fieldName", []],
    ["productField", []],
    ["checkpointNoteFor", []],
    ["productIndex", []],
    ["caseProductIndex", []],
    ["caseStatus", []],
  ];

  for (const [attribute, extraAttributes] of dataSelectorMap) {
    if (!element.dataset?.[attribute]) {
      continue;
    }

    const segments = [`[data-${toKebabCase(attribute)}="${escapeAttributeValue(element.dataset[attribute])}"]`];

    for (const extraAttribute of extraAttributes) {
      const extraValue = element.dataset?.[extraAttribute];

      if (extraValue) {
        segments.push(`[data-${toKebabCase(extraAttribute)}="${escapeAttributeValue(extraValue)}"]`);
      }
    }

    return segments.join("");
  }

  return null;
}

function toKebabCase(value) {
  return value.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`);
}

function escapeSelectorValue(value) {
  if (globalThis.CSS?.escape) {
    return globalThis.CSS.escape(value);
  }

  return String(value).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
}

function escapeAttributeValue(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
