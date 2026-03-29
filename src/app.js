import { fieldLabel, t } from "./i18n.js";
import {
  renderMetadataList,
  renderSection,
  renderStatusBadge,
  renderTagList,
} from "./ui.js";

const routes = {
  "#/intake": renderIntakeScreen,
  "#/case": renderCaseWorkspace,
  "#/knowledge": renderKnowledgeComparison,
  "#/quote": renderQuoteWorkspace,
  "#/outcomes": renderOutcomesPage,
  "#/dashboard": renderDashboardPage,
};

export function renderApp(root, state, currentHash) {
  if (!state.auth?.ready) {
    root.innerHTML = renderAuthLoading(state.language);
    return;
  }

  if (!state.auth?.user) {
    root.innerHTML = renderLoginPage(state);
    return;
  }

  const activeRoute = routes[currentHash] ? currentHash : "#/intake";
  const screen = routes[activeRoute](state);
  const currentCase = state.selectedCase || state.cases[0] || null;
  const language = state.language;
  stateForRender = {
    selectedProductIndex: state.selectedProductIndex || 0,
    summaryLoadingId: state.knowledge.summaryLoadingId || "",
  };
  root.innerHTML = `
    <div class="app-shell ${state.sidebarCollapsed ? "app-shell--collapsed" : ""}">
      <aside class="sidebar">
        <div class="sidebar__brand-row">
          <div class="sidebar__brand-mark">QC</div>
          <button class="sidebar__toggle" data-action="toggle-sidebar" aria-label="${t(language, "toggleSidebar")}">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
              ${state.sidebarCollapsed
                ? '<path d="M3 7H11M8 4l3 3-3 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>'
                : '<path d="M11 7H3M6 4L3 7l3 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>'}
            </svg>
          </button>
        </div>
        <div class="sidebar__brand">
          <h1>QuoteCase Copilot</h1>
          <p>${t(language, "appSubtitle")}</p>
        </div>
        <nav class="sidebar__nav">
          ${renderNavLink("#/intake", t(language, "chatIntake"), activeRoute, svgIntakeIcon(), state.sidebarCollapsed)}
          ${renderNavLink("#/case", t(language, "caseWorkspace"), activeRoute, svgCaseIcon(), state.sidebarCollapsed)}
          ${renderNavLink("#/knowledge", t(language, "knowledgeLibraryNav"), activeRoute, svgKnowledgeIcon(), state.sidebarCollapsed)}
          ${renderNavLink("#/quote", t(language, "quoteBuilderNav"), activeRoute, svgQuoteIcon(), state.sidebarCollapsed)}
          ${renderNavLink("#/outcomes", t(language, "outcomesNav"), activeRoute, svgOutcomeIcon(), state.sidebarCollapsed)}
          ${renderNavLink("#/dashboard", t(language, "dashboardNav"), activeRoute, svgDashboardIcon(), state.sidebarCollapsed)}
        </nav>
        <section class="sidebar__panel">
          <p class="eyebrow">${t(language, "latestCase")}</p>
          <h2>${currentCase ? currentCase.caseId : t(language, "noCaseYet")}</h2>
          <p class="muted">${currentCase ? `${currentCase.customerName} · ${currentCase.projectName}` : t(language, "startCreateCase")}</p>
          ${renderStatusBadge(currentCase ? currentCase.status : "New", language)}
        </section>
      </aside>
      <main class="main-panel ${state.analyst.open ? "main-panel--with-analyst" : ""}">
        <header class="topbar">
          <div class="topbar__title">
            <button class="topbar-icon-button" data-action="toggle-sidebar" aria-label="${t(language, "toggleSidebar")}">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
            </button>
            <div>
              <p class="eyebrow">${state.system.aiConfigured ? (state.system.model || "AI Ready") : "QuoteCase Copilot"}</p>
              <h2>${screen.title}</h2>
            </div>
          </div>
          <div class="topbar__actions">
            <div class="language-toggle">
              <button class="language-toggle__button ${language === "en" ? "language-toggle__button--active" : ""}" data-action="set-language" data-language="en">${t(language, "englishShort")}</button>
              <button class="language-toggle__button ${language === "zh" ? "language-toggle__button--active" : ""}" data-action="set-language" data-language="zh">${t(language, "chineseShort")}</button>
            </div>
            <span class="topbar-user">${escapeHtml(state.auth.user.email || "")}</span>
            <button class="topbar-link topbar-link--button" data-action="sign-out">${t(language, "signOut")}</button>
            <a class="topbar-link" href="#/intake">${t(language, "newIntake")}</a>
            <a class="topbar-link" href="#/case">${t(language, "openWorkspace")}</a>
            <button class="topbar-analyst-button" data-action="toggle-analyst" aria-label="${state.analyst.open ? t(language, "collapseAnalyst") : t(language, "expandAnalyst")}" title="${state.analyst.open ? t(language, "collapseAnalyst") : t(language, "expandAnalyst")}">
              <span class="topbar-analyst-button__icon">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="5" r="2.5" stroke="currentColor" stroke-width="1.4"/><path d="M3 12c0-2.2 1.8-4 4-4s4 1.8 4 4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
              </span>
            </button>
          </div>
        </header>
        ${state.system.storageHealthy === false ? `<div class="error-banner">${t(language, "storageIssue")}: ${escapeHtml(state.system.storageDetails || state.system.storageMode || "unknown")}</div>` : ""}
        ${state.error ? `<div class="error-banner">${state.error}</div>` : ""}
        <section class="screen-content ${state.analyst.open ? "screen-content--with-analyst" : ""} ${state.ui?.animateRouteChange ? "screen-content--animated" : ""}">
          ${screen.body}
        </section>
        ${state.analyst.open ? renderAnalystWindow(state) : ""}
        ${state.modalOpen && state.selectedCase ? renderCaseModal(state.selectedCase, language) : ""}
        ${state.knowledge.previewOpen && state.knowledge.selectedFile ? renderKnowledgePreviewModal(state.knowledge.selectedFile, language) : ""}
      </main>
    </div>
  `;
}

function renderAuthLoading(language) {
  return `
    <div class="auth-shell">
      <div class="auth-card">
        <p class="eyebrow">${t(language, "authLoadingEyebrow")}</p>
        <h1>${t(language, "authLoadingTitle")}</h1>
        <p class="muted">${t(language, "authLoadingBody")}</p>
      </div>
    </div>
  `;
}

function renderLoginPage(state) {
  const language = state.language;
  const authConfigured = Boolean(state.auth.configured);
  const authMode = state.auth.mode === "signup" ? "signup" : "login";
  const submitLabel =
    authMode === "signup"
      ? state.auth.loading
        ? t(language, "signupWorking")
        : t(language, "signupSubmit")
      : state.auth.loading
        ? t(language, "loginWorking")
        : t(language, "loginSubmit");

  return `
    <div class="auth-shell">
      <div class="auth-card">
        <p class="eyebrow">${t(language, "loginEyebrow")}</p>
        <h1>${authMode === "signup" ? t(language, "signupSubmit") : t(language, "loginTitle")}</h1>
        <p class="muted">${t(language, "loginBody")}</p>
        ${!authConfigured ? `<div class="error-banner">${t(language, "loginConfigMissing")}</div>` : ""}
        ${state.auth.notice ? `<div class="summary-card"><p>${escapeHtml(state.auth.notice)}</p></div>` : ""}
        ${state.auth.error ? `<div class="error-banner">${escapeHtml(state.auth.error)}</div>` : ""}
        <label class="form-label" for="login-email">${t(language, "loginEmail")}</label>
        <input
          id="login-email"
          class="text-input"
          type="email"
          autocomplete="email"
          value="${escapeAttribute(state.auth.email || "")}"
        />
        <label class="form-label" for="login-password">${t(language, "loginPassword")}</label>
        <input
          id="login-password"
          class="text-input"
          type="password"
          autocomplete="current-password"
          value="${escapeAttribute(state.auth.password || "")}"
        />
        <div class="auth-actions">
          <button class="button button--secondary" data-action="switch-auth-mode" ${state.auth.loading ? "disabled" : ""}>
            ${authMode === "signup" ? t(language, "authSwitchToLogin") : t(language, "authSwitchToSignup")}
          </button>
          <button class="button ${state.auth.loading || !authConfigured ? "button--disabled" : ""}" data-action="${authMode === "signup" ? "submit-signup" : "submit-login"}" ${state.auth.loading || !authConfigured ? "disabled" : ""}>
            ${submitLabel}
          </button>
        </div>
      </div>
    </div>
  `;
}

function renderNavLink(href, label, activeRoute, icon, collapsed = false) {
  const className = href === activeRoute ? "nav-link nav-link--active" : "nav-link";
  return `
    <a class="${className}" href="${href}" title="${label}">
      <span class="nav-link__icon">${icon}</span>
      <span class="nav-link__label ${collapsed ? "nav-link__label--hidden" : ""}">${label}</span>
    </a>
  `;
}

function svgIntakeIcon() {
  return `<svg width="15" height="15" viewBox="0 0 15 15" fill="none"><path d="M7.5 1.5v8M4.5 6.5l3 3 3-3M2 10.5v2a1 1 0 001 1h9a1 1 0 001-1v-2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

function svgCaseIcon() {
  return `<svg width="15" height="15" viewBox="0 0 15 15" fill="none"><rect x="1.5" y="1.5" width="5" height="5" rx="1" stroke="currentColor" stroke-width="1.4"/><rect x="8.5" y="1.5" width="5" height="5" rx="1" stroke="currentColor" stroke-width="1.4"/><rect x="1.5" y="8.5" width="5" height="5" rx="1" stroke="currentColor" stroke-width="1.4"/><rect x="8.5" y="8.5" width="5" height="5" rx="1" stroke="currentColor" stroke-width="1.4"/></svg>`;
}

function svgKnowledgeIcon() {
  return `<svg width="15" height="15" viewBox="0 0 15 15" fill="none"><path d="M2 3.5h11M2 7.5h11M2 11.5h7" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>`;
}

function svgQuoteIcon() {
  return `<svg width="15" height="15" viewBox="0 0 15 15" fill="none"><path d="M9.5 1.5H3a1 1 0 00-1 1v10a1 1 0 001 1h9a1 1 0 001-1V5.5L9.5 1.5z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M9.5 1.5V5.5H13.5M5 8.5h5M5 11h3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

function svgOutcomeIcon() {
  return `<svg width="15" height="15" viewBox="0 0 15 15" fill="none"><path d="M2 12.5h11M3.5 10l2.5-2.5 2 2 3.5-4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

function svgDashboardIcon() {
  return `<svg width="15" height="15" viewBox="0 0 15 15" fill="none"><path d="M2.5 12.5V8.5M7.5 12.5V4.5M12.5 12.5V6.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><path d="M1.5 12.5h12" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>`;
}

function renderIntakeScreen(state) {
  const language = state.language;
  const canParse = state.intakeDraft.files.length > 0 || state.intakeDraft.emailText.trim().length > 0;

  return {
    title: t(language, "chatIntake"),
    body: `
      <div class="intake-simple">
        <div class="intake-simple__inner">
          <div class="intake-simple__header">
            <p class="eyebrow">${t(language, "conversation")}</p>
            <h3 class="intake-simple__title">${t(language, "intakeHeroTitle")}</h3>
            <p class="intake-simple__subtitle">${t(language, "intakeHeroSubtitle")}</p>
          </div>
          <div class="intake-simple__panel">
            <input id="rfq-file-input" class="visually-hidden" type="file" multiple />
            <textarea
              id="email-intake-text"
              class="intake-simple__textarea"
              placeholder="${t(language, "composerPlaceholder")}"
            >${escapeHtml(state.intakeDraft.emailText)}</textarea>
            <div class="intake-simple__toolbar">
              <div class="intake-simple__toolbar-left">
                <button class="button button--secondary" data-action="open-file-picker">${t(language, "uploadRfqFiles")}</button>
                <button class="button button--secondary" data-action="connect-email-thread">${t(language, "connectEmailThread")}</button>
              </div>
              <button class="button ${canParse ? "" : "button--disabled"}" data-action="start-intake-parse" ${canParse ? "" : "disabled"}>${t(language, "createCase")}</button>
            </div>
          </div>
          <div class="intake-simple__meta">
            <div class="intake-simple__meta-row">
              <span class="eyebrow">${t(language, "parsingStatus")}</span>
              ${renderStatusBadge(state.intake.parsingStatus, language)}
            </div>
            <div class="progress-bar">
              <span style="width: ${state.intake.progress}%"></span>
            </div>
            <p class="muted">${state.intake.message || t(language, "intakeDescription")}</p>
            ${state.intakeDraft.files.length
              ? `<div class="tag-list">${state.intakeDraft.files
                  .map((file) => `<span class="tag"><svg width="12" height="12" viewBox="0 0 12 12" fill="none" style="display:inline-block;vertical-align:middle;margin-right:4px;opacity:.6"><path d="M7 1H3a1 1 0 00-1 1v8a1 1 0 001 1h6a1 1 0 001-1V4L7 1z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M7 1v3h3" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>${escapeHtml(file.name)}</span>`)
                  .join("")}</div>`
              : ""}
            ${state.intake.activity && state.intake.activity.length
              ? `<div class="intake-activity-list">
                  ${state.intake.activity.map((item) => `
                    <div class="intake-activity-item">
                      <span class="intake-activity-item__dot intake-activity-item__dot--${item.status}"></span>
                      <span>${escapeHtml(item.text)}</span>
                    </div>
                  `).join("")}
                </div>`
              : ""}
          </div>
        </div>
      </div>
    `,
  };
}

function renderCaseWorkspace(state) {
  const language = state.language;
  return {
    title: t(language, "caseWorkspace"),
    body: `
      ${renderSection({
        title: t(language, "parsedCases"),
        description: t(language, "parsedCasesDescription"),
        language,
        body: renderCaseTable(state),
      })}
    `,
  };
}

function renderCaseTable(state) {
  const language = state.language;
  if (state.loadingCases) {
    return `
      <div class="table-shell">
        <table class="case-table">
          <thead><tr>
            <th>${t(language, "caseId")}</th>
            <th>${t(language, "customer")}</th>
            <th>${t(language, "project")}</th>
            <th>${t(language, "status")}</th>
          </tr></thead>
          <tbody>
            ${[1,2,3].map(() => `
              <tr class="loading-row">
                <td><span class="shimmer" style="width:80px"></span></td>
                <td><span class="shimmer" style="width:120px"></span></td>
                <td><span class="shimmer" style="width:160px"></span></td>
                <td><span class="shimmer" style="width:90px"></span></td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  if (!state.cases.length) {
    return `
      <div class="state-empty">
        <div class="state-empty__icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M9 12h6M9 16h4M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9l-6-6z" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M14 3v6h6" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>
        </div>
        <p>${t(language, "noParsedCases")}</p>
      </div>
    `;
  }

  return `
    <div class="table-shell">
      <table class="case-table">
        <thead>
          <tr>
            <th>${t(language, "caseId")}</th>
            <th>${t(language, "customer")}</th>
            <th>${t(language, "project")}</th>
            <th>${t(language, "product")}</th>
            <th>${t(language, "material")}</th>
            <th>${t(language, "quantity")}</th>
            <th>${t(language, "quoteStage")}</th>
            <th>${t(language, "flagMix")}</th>
            <th>${t(language, "total")}</th>
            <th>${t(language, "status")}</th>
            <th>${t(language, "updatedCol")}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${state.cases
            .map((entry) => {
              const productItems = entry.productItems || [];
              const selectedIndex = state.caseProductSelections[entry.caseId] ?? 0;
              const activeProduct = productItems[selectedIndex] || productItems[0] || null;

              return `
                <tr class="case-table__row">
                  <td>${entry.caseId}</td>
                  <td>${entry.customerName}</td>
                  <td>${entry.projectName}</td>
                  <td class="case-table__cell case-table__cell--compact">
                    ${productItems.length
                      ? `
                        <label class="visually-hidden" for="case-product-${entry.caseId}">${t(language, "includedProducts")}</label>
                        <select
                          id="case-product-${entry.caseId}"
                          class="select-input select-input--compact"
                          data-case-product-index
                          data-case-id="${entry.caseId}"
                        >
                          ${productItems
                            .map(
                              (item, index) =>
                                `<option value="${index}" ${index === selectedIndex ? "selected" : ""}>${escapeHtml(item.label)}</option>`
                            )
                            .join("")}
                        </select>
                        <p class="case-table__subtext">${escapeHtml(activeProduct?.productType || entry.productType || "Not clearly stated")}</p>
                      `
                      : `<div>${entry.productType || "Not clearly stated"}</div><p class="case-table__subtext">${t(language, "noParsedProducts")}</p>`}
                  </td>
                  <td class="case-table__cell case-table__cell--compact">${escapeHtml(activeProduct?.materialGrade || entry.material || "Not clearly stated")}</td>
                  <td class="case-table__cell case-table__cell--compact">${escapeHtml(activeProduct?.quantity || entry.quantity || "Not clearly stated")}</td>
                  <td>${escapeHtml(formatQuoteStage(entry.quoteLifecycle, language))}</td>
                  <td>${renderFlagMix(entry.quoteSummary?.flagCounts || null)}</td>
                  <td>${entry.quoteSummary ? formatMoneyValue(entry.quoteSummary.currency || "USD", entry.quoteSummary.total) : "—"}</td>
                  <td>${renderStatusBadge(entry.status, language)}</td>
                  <td>${entry.updatedAt}</td>
                  <td class="case-table__actions">
                    <button class="button button--small" data-action="open-case" data-case-id="${entry.caseId}">
                      ${t(language, "caseDetail")}
                    </button>
                    ${entry.quoteSummary ? `<button class="button button--small button--secondary" data-action="open-quote" data-case-id="${entry.caseId}">${t(language, "reviewQuote")}</button>` : ""}
                    <button class="button button--secondary button--small" data-action="delete-case" data-case-id="${entry.caseId}">
                      ${t(language, "deleteCase")}
                    </button>
                  </td>
                </tr>
              `;
            })
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderCaseModal(caseData, language) {
  const productItems = caseData.productItems?.length ? caseData.productItems : [];
  return `
    <div class="modal-overlay" data-action="close-case-modal">
      <div class="modal-window" role="dialog" aria-modal="true" aria-label="Case details">
        <div class="modal-header">
          <div>
            <p class="eyebrow">${t(language, "caseDetail")}</p>
            <h3>${caseData.caseId}</h3>
            <p class="muted">${caseData.customerName} • ${caseData.projectName}</p>
          </div>
          <button class="button button--secondary" data-action="close-case-modal">${t(language, "close")}</button>
        </div>
        <div class="content-stack">
          <div class="content-grid">
            ${renderSection({
              title: t(language, "productSpecifications"),
              description: t(language, "productSpecificationsDescription"),
              language,
              body: renderProductTable(productItems, language),
            })}
            ${renderSection({
              title: t(language, "aiSummary"),
              description: t(language, "simpleSummaryDescription"),
              language,
              body: `
                <div class="summary-structure">
                  <div><p class="eyebrow">${t(language, "whatCustomerNeeds")}</p><p>${caseData.aiSummary.whatCustomerNeeds}</p></div>
                  <div><p class="eyebrow">${t(language, "recommendedNextStep")}</p><p>${caseData.aiSummary.recommendedNextStep}</p></div>
                </div>
              `,
            })}
          </div>
          <div class="content-grid">
            ${renderSection({
              title: t(language, "potentialRiskTitle"),
              description: t(language, "potentialRiskDescription"),
              language,
              body: `
                <div class="info-stack">
                  <div><p class="eyebrow">${t(language, "potentialRiskTitle")}</p>${renderTagList(caseData.aiSummary.mainRisks || [], language)}</div>
                  <div><p class="eyebrow">${t(language, "unresolvedIssuesTitle")}</p>${renderTagList(buildCaseIssues(caseData), language)}</div>
                </div>
              `,
            })}
            ${renderSection({
              title: t(language, "recommendationTitle"),
              description: t(language, "recommendationDescription"),
              language,
            body: renderCompactRecommendation(caseData, language),
          })}
        </div>
      </div>
    </div>
  `;
}

function buildCaseIssues(caseData) {
  return [
    ...(caseData.missingInfo?.missingFields || []),
    ...(caseData.missingInfo?.ambiguousRequirements || []),
    ...(caseData.missingInfo?.lowConfidenceItems || []),
  ].slice(0, 6);
}

function renderCompactRecommendation(caseData, language) {
  const recommendation = caseData.quoteEstimate?.decisionRecommendation?.recommendation;

  if (recommendation) {
    return `
      <div class="summary-structure">
        <div>
          <p class="eyebrow">${t(language, "recommendedStrategyTitle")}</p>
          <p>${escapeHtml(recommendation.recommendedStrategy || t(language, "noneLabel"))}</p>
        </div>
        <div>
          <p class="eyebrow">${t(language, "priceRangeTitle")}</p>
          <p>${formatMoneyValue(caseData.quoteEstimate.currency || "USD", recommendation.recommendedPricePerTonLow)} - ${formatMoneyValue(caseData.quoteEstimate.currency || "USD", recommendation.recommendedPricePerTonHigh)} / ton</p>
        </div>
        <div>
          <p class="eyebrow">${t(language, "leadTimeRangeTitle")}</p>
          <p>${escapeHtml(`${recommendation.recommendedLeadTimeDaysLow || 0}-${recommendation.recommendedLeadTimeDaysHigh || 0} ${language === "zh" ? "天" : "days"}`)}</p>
        </div>
      </div>
    `;
  }

  return `
    <div class="summary-structure">
      <div>
        <p class="eyebrow">${t(language, "recommendedNextStep")}</p>
        <p>${escapeHtml(caseData.aiSummary.recommendedNextStep || t(language, "noneLabel"))}</p>
      </div>
      <div>
        <p class="eyebrow">${t(language, "knowledgeOverviewTitle")}</p>
        <p>${escapeHtml(caseData.knowledgeComparison?.analysisSummary || t(language, "noKnowledgeOverviewYet"))}</p>
      </div>
    </div>
  `;
}

let stateForRender = { selectedProductIndex: 0 };

function renderProductTable(productItems, language) {
  if (!productItems.length) {
    return `<p class="muted">${t(language, "noItemsYet")}</p>`;
  }

  return `
    <div class="table-shell">
      <table class="case-table product-detail-table">
        <thead>
          <tr>
            <th>${t(language, "productLabel")}</th>
            <th>${t(language, "productType")}</th>
            <th>${t(language, "materialGrade")}</th>
            <th>${t(language, "outsideDimension")}</th>
            <th>${t(language, "wallThickness")}</th>
            <th>${t(language, "schedule")}</th>
            <th>${t(language, "lengthPerPiece")}</th>
            <th>${t(language, "quantity")}</th>
          </tr>
        </thead>
        <tbody>
          ${productItems
            .map(
              (item, index) => `
                <tr class="case-table__row">
                  <td>${escapeHtml(item.label || `${t(language, "product")} ${index + 1}`)}</td>
                  <td>${escapeHtml(item.productType || t(language, "noneLabel"))}</td>
                  <td>${escapeHtml(item.materialGrade || t(language, "noneLabel"))}</td>
                  <td>${escapeHtml(item.outsideDimension || item.dimensions || t(language, "noneLabel"))}</td>
                  <td>${escapeHtml(item.wallThickness || t(language, "noneLabel"))}</td>
                  <td>${escapeHtml(item.schedule || t(language, "noneLabel"))}</td>
                  <td>${escapeHtml(item.lengthPerPiece || t(language, "noneLabel"))}</td>
                  <td>${escapeHtml(item.quantity || t(language, "noneLabel"))}</td>
                </tr>
              `
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderAnalystWindow(state) {
  const language = state.language;
  return `
    <aside class="analyst-window analyst-window--expanded">
      <div class="analyst-window__header">
        <div class="analyst-window__title-group">
          <div class="analyst-window__icon">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="6" r="3" stroke="white" stroke-width="1.5"/><path d="M3 14c0-2.76 2.24-5 5-5s5 2.24 5 5" stroke="white" stroke-width="1.5" stroke-linecap="round"/></svg>
          </div>
          <div>
            <h3>${t(language, "workspaceAnalyst")}</h3>
          </div>
        </div>
        <button class="button button--secondary analyst-window__toggle" data-action="toggle-analyst">${t(language, "collapseAnalyst")}</button>
      </div>
      <div class="analyst-thread">
        ${state.analyst.messages.length
          ? state.analyst.messages
              .slice()
              .reverse()
              .map(
                (message) => `
                  <article class="analyst-message analyst-message--${message.role}">
                    <p>${message.text}</p>
                    ${message.meta ? `<p class="muted analyst-message__meta">${message.meta}</p>` : ""}
                  </article>
                `
              )
              .join("")
          : `<p class="muted">${t(language, "noAnalystQuestions")}</p>`}
      </div>
      <div class="analyst-composer">
        <div class="analyst-examples">
          <button class="tag tag--button" data-action="analyst-example" data-prompt="${escapeAttribute(language === "zh" ? "请统计近一个月请求的总数量，并说明依据。" : "How many items were requested in the past month?")}">${t(language, "analystExamplePastMonth")}</button>
          <button class="tag tag--button" data-action="analyst-example" data-prompt="${escapeAttribute(language === "zh" ? "哪些客户的案例当前处于需要澄清状态？" : "Which customers have cases needing clarification?")}">${t(language, "analystExampleClarification")}</button>
          <button class="tag tag--button" data-action="analyst-example" data-prompt="${escapeAttribute(language === "zh" ? "请总结当前案例中最常见的材质。" : "Summarize the most common requested materials in the stored cases.")}">${t(language, "analystExampleMaterials")}</button>
        </div>
        <textarea id="analyst-question" class="text-area text-area--compact analyst-composer__input" placeholder="${t(language, "analystPlaceholder")}">${escapeHtml(state.analyst.question)}</textarea>
        <div class="intake-actions analyst-actions">
          <button class="button ${state.analyst.loading ? "button--disabled" : ""}" data-action="submit-analyst-question" ${state.analyst.loading ? "disabled" : ""}>${state.analyst.loading ? t(language, "analyzing") : t(language, "askAnalyst")}</button>
        </div>
      </div>
    </aside>
  `;
}

function renderKnowledgeComparison(state) {
  const language = state.language;

  return {
    title: t(language, "knowledgeLibraryNav"),
    body: `
      <div class="content-stack knowledge-stack quote-workspace">
        ${renderSection({
          title: t(language, "knowledgeLibrary"),
          description: t(language, "knowledgeLibraryDescription"),
          language,
          body: `
            <div class="intake-actions">
              <button class="button" data-action="open-knowledge-picker">${t(language, "uploadKnowledgeFiles")}</button>
              <input id="knowledge-file-input" class="visually-hidden" type="file" multiple />
              ${state.knowledge.uploadFeedback ? `<p class="muted">${state.knowledge.uploadFeedback}</p>` : ""}
            </div>
            ${renderKnowledgeFileTable(state.knowledge.files, language)}
          `,
        })}
        <div class="summary-card">
          <p class="eyebrow">${t(language, "knowledgeLibraryPurposeTitle")}</p>
          <p>${t(language, "knowledgeLibraryPurposeBody")}</p>
        </div>
      </div>
    `,
  };
}

function renderQuoteWorkspace(state) {
  const language = state.language;
  const selectedCaseId = state.quote.selectedCaseId || state.cases[0]?.caseId || "";
  const selectedCase = state.quote.selectedCase;
  const canRun = Boolean(selectedCaseId);

  return {
    title: t(language, "quoteBuilderNav"),
    body: `
      <div class="content-stack knowledge-stack">
        ${renderSection({
          title: t(language, "quoteWorkspaceTitle"),
          description: t(language, "quoteWorkspaceDescription"),
          language,
          body: `
            ${renderQuoteRegistryTable(state.cases, selectedCaseId, language)}
            <label class="form-label" for="quote-case-select">${t(language, "selectCaseForQuote")}</label>
            <select id="quote-case-select" class="select-input" data-quote-case-select>
              ${state.cases
                .map(
                  (entry) =>
                    `<option value="${entry.caseId}" ${entry.caseId === selectedCaseId ? "selected" : ""}>${escapeHtml(entry.caseId)} • ${escapeHtml(entry.customerName)}</option>`
                )
                .join("")}
            </select>
            <div class="intake-actions">
              <button class="button ${canRun ? "" : "button--disabled"}" data-action="generate-quote-estimate" ${canRun ? "" : "disabled"}>${state.quote.quoteLoading ? t(language, "generatingQuoteEstimate") : t(language, "generateQuoteEstimate")}</button>
            </div>
            ${
              selectedCase?.knowledgeComparison
                ? `
                  <div class="summary-structure">
                    <div>
                      <p class="eyebrow">${t(language, "analysisSummary")}</p>
                      <p>${escapeHtml(selectedCase.knowledgeComparison.analysisSummary)}</p>
                    </div>
                    <div>
                      <p class="eyebrow">${t(language, "recommendedStatus")}</p>
                      ${renderStatusBadge(selectedCase.knowledgeComparison.recommendedStatus, language)}
                    </div>
                  </div>
                `
                : `<p class="muted">${t(language, "knowledgeAwaitingRun")}</p>`
            }
          `,
        })}
        ${renderSection({
          title: t(language, "quoteBuilderTitle"),
          description: t(language, "quoteBuilderDescription"),
          language,
          body: renderQuoteBuilder(selectedCase, state.quote.emailDraft, state.quote, language),
        })}
      </div>
    `,
  };
}

function renderQuoteRegistryTable(cases, selectedCaseId, language) {
  const quoteCases = (cases || []).filter((entry) => entry.quoteEstimate || (entry.quoteHistory || []).length);

  if (!quoteCases.length) {
    return `<p class="muted">${language === "zh" ? "暂无已保存的报价记录。生成首个草稿报价后会显示在这里。" : "No saved quotes yet. Built draft quotes will appear here."}</p>`;
  }

  return `
    <div class="table-shell">
      <table class="case-table quote-registry-table">
        <thead>
          <tr>
            <th>${t(language, "caseDetail")}</th>
            <th>${t(language, "currentStatus")}</th>
            <th>${t(language, "quoteStage")}</th>
            <th>${t(language, "updatedCol")}</th>
            <th>${t(language, "total")}</th>
            <th>${t(language, "actions")}</th>
          </tr>
        </thead>
        <tbody>
          ${quoteCases
            .map((entry) => {
              const quoteSummary = entry.quoteSummary || entry.quoteEstimate || {};
              const lifecycle = entry.quoteLifecycle || {};
              const isSelected = entry.caseId === selectedCaseId;

              return `
                <tr class="case-table__row ${isSelected ? "case-table__row--active" : ""}">
                  <td>
                    <strong>${escapeHtml(entry.caseId)}</strong>
                    <p class="case-table__subtext">${escapeHtml(entry.customerName || t(language, "noneLabel"))}</p>
                  </td>
                  <td>${renderStatusBadge(entry.status, language)}</td>
                  <td>${escapeHtml(formatQuoteStage(lifecycle, language))}</td>
                  <td>${escapeHtml(String(entry.updatedAt || entry.createdAt || "").slice(0, 16).replace("T", " "))}</td>
                  <td>${quoteSummary.total ? formatMoneyValue(quoteSummary.currency || "USD", quoteSummary.total) : "—"}</td>
                  <td>
                    <div class="case-table__actions">
                      <button class="button button--small ${isSelected ? "" : "button--secondary"}" data-action="open-quote" data-case-id="${entry.caseId}">
                        ${isSelected ? (language === "zh" ? "当前查看" : "Viewing") : t(language, "reviewQuote")}
                      </button>
                    </div>
                  </td>
                </tr>
              `;
            })
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderKnowledgeFileTable(files, language) {
  if (!files.length) {
    return `
      <div class="state-empty">
        <div class="state-empty__icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M12 3v13M5 10l7 7 7-7M3 21h18" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </div>
        <p>${t(language, "noKnowledgeFiles")}</p>
      </div>
    `;
  }

  return `
    <div class="table-shell knowledge-table-shell">
      <table class="case-table knowledge-table">
        <thead>
          <tr>
            <th>${t(language, "documentName")}</th>
            <th>${t(language, "documentType")}</th>
            <th>${t(language, "documentationCategory")}</th>
            <th>${t(language, "updatedCol")}</th>
            <th>${t(language, "documentSummary")}</th>
            <th>${t(language, "actions")}</th>
          </tr>
        </thead>
        <tbody>
          ${files
            .map(
              (file) => `
                <tr class="case-table__row">
                  <td class="knowledge-table__name">${escapeHtml(file.name)}</td>
                  <td class="knowledge-table__type">${escapeHtml(file.type)}</td>
                  <td class="knowledge-table__category"><span class="tag tag--compact">${escapeHtml(file.category)}</span></td>
                  <td class="knowledge-table__date">${escapeHtml(file.uploadedAt.slice(0, 10))}</td>
                  <td class="knowledge-table__summary">${escapeHtml(file.summary)}</td>
                  <td class="knowledge-table__actions">
                    <div class="case-table__actions">
                      <button class="button button--small" data-action="preview-knowledge-file" data-knowledge-file-id="${file.knowledgeFileId}">
                        ${t(language, "preview")}
                      </button>
                      <button class="button button--small button--secondary" data-action="summarize-knowledge-file" data-knowledge-file-id="${file.knowledgeFileId}">
                        ${file.knowledgeFileId === stateForRender.summaryLoadingId ? t(language, "summarizing") : t(language, "summarize")}
                      </button>
                    </div>
                  </td>
                </tr>
              `
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderKnowledgePreviewModal(knowledgeFile, language) {
  return `
    <div class="modal-overlay" data-action="close-knowledge-preview">
      <div class="modal-window modal-window--narrow" role="dialog" aria-modal="true" aria-label="Knowledge file preview">
        <div class="modal-header">
          <div>
            <p class="eyebrow">${t(language, "knowledgeFilePreview")}</p>
            <h3>${escapeHtml(knowledgeFile.name)}</h3>
            <p class="muted">${escapeHtml(knowledgeFile.type)} • ${escapeHtml(knowledgeFile.category)}</p>
          </div>
          <button class="button button--secondary" data-action="close-knowledge-preview">${t(language, "close")}</button>
        </div>
        <div class="content-stack">
          <div class="summary-card">
            <p class="eyebrow">${t(language, "documentSummary")}</p>
            <p>${escapeHtml(knowledgeFile.summary || t(language, "noneLabel"))}</p>
          </div>
          <div class="summary-card">
            <p class="eyebrow">${t(language, "documentPreviewText")}</p>
            ${
              knowledgeFile.previewAvailable
                ? `<pre class="email-draft">${escapeHtml(knowledgeFile.previewText || "")}</pre>`
                : `<p class="muted">${t(language, "noDocumentPreviewAvailable")}</p>`
            }
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderKnowledgeOverview(caseData, language) {
  const comparison = caseData.knowledgeComparison;
  const quoteEstimate = caseData.quoteEstimate;
  const decisionRecommendation = quoteEstimate?.decisionRecommendation;

  if (!comparison && !quoteEstimate && !decisionRecommendation) {
    return `<p class="muted">${t(language, "noKnowledgeOverviewYet")}</p>`;
  }

  return `
    <div class="summary-structure">
      ${
        comparison
          ? `
            <div>
              <p class="eyebrow">${t(language, "recommendedStatus")}</p>
              ${renderStatusBadge(comparison.recommendedStatus, language)}
            </div>
            <div>
              <p class="eyebrow">${t(language, "analysisSummary")}</p>
              <p>${escapeHtml(comparison.analysisSummary)}</p>
            </div>
            <div>
              <p class="eyebrow">${t(language, "documentationCoverageTitle")}</p>
              <p>${escapeHtml(buildCoverageSummary(comparison, language))}</p>
            </div>
            <div>
              <p class="eyebrow">${t(language, "suggestedReviewAreasTitle")}</p>
              ${renderTagList(comparison.suggestedReviewAreas || [], language)}
            </div>
            <div>
              <p class="eyebrow">${t(language, "supportingFiles")}</p>
              ${renderTagList(comparison.supportingFilesUsed || [], language)}
            </div>
          `
          : ""
      }
      ${
        quoteEstimate
          ? `
            <div>
              <p class="eyebrow">${t(language, "quoteBuilderTitle")}</p>
              <p>${escapeHtml(quoteEstimate.summary)}</p>
            </div>
            <div>
              <p class="eyebrow">${t(language, "total")}</p>
              <p>${formatMoneyValue(quoteEstimate.currency, quoteEstimate.total)}</p>
            </div>
          `
          : ""
      }
      ${decisionRecommendation ? renderDecisionRecommendation(decisionRecommendation, quoteEstimate?.currency || "USD", language) : ""}
    </div>
  `;
}

function buildCoverageSummary(comparison, language) {
  const supported = comparison.matchingSupport?.length || 0;
  const partial = comparison.partialSupport?.length || 0;
  const missing = comparison.missingSupport?.length || 0;

  if (language === "zh") {
    return `已支持 ${supported} 项，部分支持 ${partial} 项，缺失支持 ${missing} 项。`;
  }

  return `${supported} supported, ${partial} partial, ${missing} missing.`;
}

function renderQuoteBuilder(caseData, emailDraft, quoteState, language) {
  const quoteEstimate = caseData?.quoteEstimate;
  const quoteLifecycle = caseData?.quoteLifecycle || null;

  if (!caseData || !quoteEstimate) {
    return `<p class="muted">${t(language, "quoteBuilderEmpty")}</p>`;
  }

  return `
    <div class="content-stack">
      <div class="content-grid">
        <article class="summary-card">
          <p class="eyebrow">${t(language, "pricingStatus")}</p>
          <h3>${escapeHtml(quoteEstimate.pricingStatus)}</h3>
          <p>${escapeHtml(quoteEstimate.summary)}</p>
          <p class="muted">${t(language, "quoteStage")}: ${escapeHtml(formatQuoteStage(quoteLifecycle, language))}</p>
        </article>
        <article class="summary-card">
          <label class="form-label" for="quote-currency">${t(language, "currency")}</label>
          <input id="quote-currency" class="text-input" type="text" value="${escapeAttribute(quoteEstimate.currency || "USD")}" data-quote-header="currency" />
          <label class="form-label" for="quote-incoterm">${t(language, "incoterm")}</label>
          <input id="quote-incoterm" class="text-input" type="text" value="${escapeAttribute(quoteEstimate.incoterm || "")}" data-quote-header="incoterm" />
        </article>
      </div>
      <div class="summary-card">
        <div class="result-card__header">
          <div>
            <p class="eyebrow">${t(language, "reviewActionsTitle")}</p>
            <h3>${t(language, "reviewActionsDescription")}</h3>
          </div>
        </div>
        <div class="summary-structure">
          <div>
            <p class="eyebrow">${t(language, "reviewChecklistTitle")}</p>
            ${renderTagList(quoteEstimate.reviewChecklist || [], language)}
          </div>
          <div>
            <p class="eyebrow">${t(language, "flagMix")}</p>
            <p>${renderInlineFlagMix(quoteEstimate.flagCounts || {})}</p>
            <p class="muted">${t(language, "blendedMarginLabel")}: ${Number(quoteEstimate.blendedMarginPct || 0).toFixed(2)}%</p>
          </div>
        </div>
      </div>
      ${quoteEstimate.decisionRecommendation ? renderDecisionPanel(quoteEstimate.decisionRecommendation, quoteEstimate.currency, language) : ""}
      <div class="table-shell">
        <table class="case-table quote-builder-table">
          <thead>
            <tr>
              <th>${t(language, "product")}</th>
              <th>${t(language, "quantity")}</th>
              <th>${t(language, "reviewFlag")}</th>
              <th>${t(language, "baseUnitPrice")}</th>
              <th>${t(language, "adjustmentAmount")}</th>
              <th>${t(language, "suggestedUnitPrice")}</th>
              <th>${t(language, "finalReviewPrice")}</th>
              <th>${t(language, "lineTotal")}</th>
              <th>${t(language, "pricingBasis")}</th>
            </tr>
          </thead>
          <tbody>
            ${quoteEstimate.lineItems
              .map(
                (item) => `
                  <tr class="case-table__row">
                    <td>
                      <input class="text-input text-input--table" type="text" value="${escapeAttribute(item.productLabel)}" data-quote-line-field="productLabel" data-line-id="${item.lineId}" />
                      <p class="case-table__subtext">${escapeHtml((item.supportingFiles || []).join(", ") || t(language, "noEvidenceLinked"))}</p>
                    </td>
                    <td>
                      <input class="text-input text-input--table" type="text" value="${escapeAttribute(item.quantityText)}" data-quote-line-field="quantityText" data-line-id="${item.lineId}" />
                      <p class="case-table__subtext">${escapeHtml(formatQuantityBasis(item, language))}</p>
                    </td>
                    <td>
                      <span class="quote-flag quote-flag--${String(item.reviewFlag || "").toLowerCase()}">${escapeHtml(item.reviewFlag || "GREEN")}</span>
                      ${item.manualOverride ? `<span class="quote-override-pill">${t(language, "overrideApplied")}</span>` : ""}
                      <p class="case-table__subtext">${escapeHtml(item.reviewReason || t(language, "noneLabel"))}</p>
                    </td>
                    <td>
                      <input class="text-input text-input--table" type="number" step="0.01" value="${escapeAttribute(item.baseUnitPrice)}" data-quote-line-field="baseUnitPrice" data-line-id="${item.lineId}" />
                      <p class="case-table__subtext">${escapeHtml(formatMoneyValue(quoteEstimate.currency, item.baseUnitPrice))} / ${escapeHtml(item.quantityUnit || (language === "zh" ? "单位" : "unit"))}</p>
                    </td>
                    <td>
                      <input class="text-input text-input--table" type="number" step="0.01" value="${escapeAttribute(item.adjustmentAmount)}" data-quote-line-field="adjustmentAmount" data-line-id="${item.lineId}" />
                    </td>
                    <td>${formatMoneyValue(quoteEstimate.currency, item.unitPrice)}</td>
                    <td>
                      <input class="text-input text-input--table text-input--flag-${String(item.reviewFlag || "").toLowerCase()}" type="number" step="0.01" value="${escapeAttribute(item.finalPrice ?? "")}" data-quote-line-final-price data-line-id="${item.lineId}" />
                      <p class="case-table__subtext">${item.humanReviewed ? t(language, "reviewedByHuman") : t(language, "pendingHumanReview")}</p>
                      ${item.decisionGuidance ? `<p class="case-table__subtext">${escapeHtml(formatDecisionLineGuidance(item.decisionGuidance, quoteEstimate.currency, language))}</p>` : ""}
                      <div class="case-table__actions quote-line-actions">
                        <button class="button button--secondary button--small" data-action="toggle-line-override" data-line-id="${item.lineId}">
                          ${item.manualOverride ? t(language, "removeOverride") : t(language, "overrideLine")}
                        </button>
                      </div>
                    </td>
                    <td>
                      ${formatMoneyValue(quoteEstimate.currency, item.lineTotal)}
                      <p class="case-table__subtext">${escapeHtml(formatLineTotalBasis(item, quoteEstimate.currency, language))}</p>
                    </td>
                    <td>
                      <input class="text-input text-input--table" type="text" value="${escapeAttribute(item.pricingBasis)}" data-quote-line-field="pricingBasis" data-line-id="${item.lineId}" />
                    </td>
                  </tr>
                `
              )
              .join("")}
          </tbody>
        </table>
      </div>
      <div class="content-grid">
        <article class="summary-card">
          <p class="eyebrow">${t(language, "commercialTermsTitle")}</p>
          ${renderQuoteTerms(quoteEstimate.terms || {}, language)}
        </article>
        <article class="summary-card">
          <p class="eyebrow">${t(language, "additionalCharges")}</p>
          <div class="quote-charge-list">
            ${(quoteEstimate.additionalCharges || [])
              .map(
                (charge) => `
                  <label class="form-label" for="${charge.chargeId}">${escapeHtml(charge.label)}</label>
                  <input id="${charge.chargeId}" class="text-input" type="number" step="0.01" value="${escapeAttribute(charge.amount)}" data-quote-charge data-charge-id="${charge.chargeId}" />
                `
              )
              .join("")}
          </div>
        </article>
        <article class="summary-card">
          <p class="eyebrow">${t(language, "quoteTotals")}</p>
          <p>${t(language, "subtotal")}: ${formatMoneyValue(quoteEstimate.currency, quoteEstimate.subtotal)}</p>
          <p>${t(language, "total")}: ${formatMoneyValue(quoteEstimate.currency, quoteEstimate.total)}</p>
          ${quoteLifecycle?.followUpDue ? `<p class="muted">${t(language, "followUpDueLabel")}: ${escapeHtml(String(quoteLifecycle.followUpDue).slice(0, 10))}</p>` : ""}
          <p class="muted">${t(language, "recommendedNextStep")}: ${escapeHtml(quoteEstimate.recommendedNextStep || t(language, "noneLabel"))}</p>
        </article>
      </div>
      ${renderQuoteHistory(caseData, language)}
      <div class="content-grid">
        <article class="summary-card">
          <p class="eyebrow">${t(language, "assumptionsTitle")}</p>
          ${renderTagList(quoteEstimate.assumptions || [], language)}
        </article>
        <article class="summary-card">
          <p class="eyebrow">${t(language, "risksTitle")}</p>
          ${renderTagList(quoteEstimate.risks || [], language)}
        </article>
      </div>
      <div class="summary-card">
        <div class="result-card__header">
          <div>
            <p class="eyebrow">${t(language, "quoteEmailTitle")}</p>
            <h3>${t(language, "quoteEmailDescription")}</h3>
          </div>
          <div class="case-table__actions">
            <button class="button button--secondary" data-action="download-quote-pdf">${t(language, "downloadQuotePdf")}</button>
            <button class="button button--secondary" data-action="generate-quote-email">${quoteState.emailLoading ? t(language, "generatingEmail") : t(language, "generateQuoteEmail")}</button>
            <button class="button" data-action="send-quote-email">${t(language, "sendQuoteEmail")}</button>
          </div>
        </div>
        ${quoteState.sendFeedback ? `<p class="muted">${escapeHtml(quoteState.sendFeedback)}</p>` : ""}
        ${renderQuoteEmailDraft(emailDraft, language)}
      </div>
    </div>
  `;
}

function renderDecisionPanel(decisionRecommendation, currency, language) {
  const recommendation = decisionRecommendation.recommendation || {};
  const lineRecommendations = decisionRecommendation.lineRecommendations || [];

  return `
    <article class="summary-card">
      <div class="summary-structure">
        <div>
          <p class="eyebrow">${t(language, "decisionEngineTitle")}</p>
          <h3>${escapeHtml(decisionRecommendation.summary || t(language, "noneLabel"))}</h3>
          <p class="muted">${escapeHtml((decisionRecommendation.sourceFiles || []).join(", ") || t(language, "noneLabel"))}</p>
        </div>
        <div>
          <p class="eyebrow">${t(language, "recommendedStrategyTitle")}</p>
          <p>${escapeHtml(recommendation.recommendedStrategy || t(language, "noneLabel"))}</p>
        </div>
        <div>
          <p class="eyebrow">${language === "zh" ? "整单报价建议" : "Recommended Quote Total"}</p>
          <p>${formatMoneyRange(currency, recommendation.recommendedTotalPriceLow, recommendation.recommendedTotalPriceHigh)}</p>
          <p class="muted">${language === "zh" ? "各产品明细的目标价格见下方。" : "See the line-level target prices below for each item."}</p>
        </div>
        <div>
          <p class="eyebrow">${t(language, "leadTimeRangeTitle")}</p>
          <p>${escapeHtml(`${recommendation.recommendedLeadTimeDaysLow || 0}-${recommendation.recommendedLeadTimeDaysHigh || 0} ${language === "zh" ? "天" : "days"}`)}</p>
        </div>
        <div>
          <p class="eyebrow">${t(language, "riskScoreTitle")}</p>
          <p>${escapeHtml(`${recommendation.riskLevel || t(language, "noneLabel")} (${recommendation.riskScore0To100 || 0}/100)`)}</p>
        </div>
        <div>
          <p class="eyebrow">${t(language, "winProbabilityTitle")}</p>
          <p>${escapeHtml(`${Math.round((recommendation.winProbabilityEstimate || 0) * 100)}%`)}</p>
        </div>
      </div>
      ${
        lineRecommendations.length
          ? `
            <div>
              <p class="eyebrow">${language === "zh" ? "各行定价建议" : "Line Pricing Targets"}</p>
              <div class="decision-line-grid">
                ${lineRecommendations
                  .map(
                    (item) => `
                      <div class="decision-line-card">
                        <strong>${escapeHtml(item.productLabel || t(language, "product"))}</strong>
                        <p>${escapeHtml(formatDecisionLineGuidance(item, currency, language))}</p>
                        <p class="muted">${escapeHtml(item.basis || t(language, "noneLabel"))}</p>
                      </div>
                    `
                  )
                  .join("")}
              </div>
            </div>
          `
          : ""
      }
      <div class="content-grid">
        <div>
          <p class="eyebrow">${t(language, "mainDriversTitle")}</p>
          ${renderTagList(decisionRecommendation.drivers || [], language)}
        </div>
        <div>
          <p class="eyebrow">${t(language, "matchedCasesTitle")}</p>
          ${renderTagList((decisionRecommendation.matchedCases || []).map((match) => `${match.orderId} (${Math.round((match.similarityScore || 0) * 100)}%)`), language)}
        </div>
      </div>
    </article>
  `;
}

function renderDecisionRecommendation(decisionRecommendation, currency, language) {
  const recommendation = decisionRecommendation.recommendation || {};

  return `
    <div>
      <p class="eyebrow">${t(language, "decisionEngineTitle")}</p>
      <p>${escapeHtml(decisionRecommendation.summary || t(language, "noneLabel"))}</p>
    </div>
    <div>
      <p class="eyebrow">${t(language, "recommendedStrategyTitle")}</p>
      <p>${escapeHtml(recommendation.recommendedStrategy || t(language, "noneLabel"))}</p>
    </div>
    <div>
      <p class="eyebrow">${language === "zh" ? "整单报价建议" : "Recommended Quote Total"}</p>
      <p>${formatMoneyRange(currency, recommendation.recommendedTotalPriceLow, recommendation.recommendedTotalPriceHigh)}</p>
    </div>
    <div>
      <p class="eyebrow">${t(language, "leadTimeRangeTitle")}</p>
      <p>${escapeHtml(`${recommendation.recommendedLeadTimeDaysLow || 0}-${recommendation.recommendedLeadTimeDaysHigh || 0} ${language === "zh" ? "天" : "days"}`)}</p>
    </div>
  `;
}

function renderQuoteTerms(terms, language) {
  const fields = [
    ["buyerName", t(language, "buyerName")],
    ["buyerEmail", t(language, "buyerEmail")],
    ["ccEmails", t(language, "ccEmails")],
    ["sellerEntity", t(language, "sellerEntity")],
    ["paymentTerms", t(language, "paymentTerms")],
    ["validityTerms", t(language, "validityTerms")],
    ["leadTime", t(language, "leadTime")],
    ["shippingTerms", t(language, "shippingTerms")],
    ["quoteNotes", t(language, "quoteNotes")],
  ];

  return `
    <div class="quote-terms-grid">
      ${fields
        .map(
          ([key, label]) => `
            <article class="quote-term-field ${key === "quoteNotes" ? "quote-term-field--wide" : ""}">
              <label class="form-label" for="quote-term-${key}">${label}</label>
              ${
                key === "quoteNotes"
                  ? `
                    <textarea
                      id="quote-term-${key}"
                      class="text-area text-area--compact quote-term-field__input"
                      data-quote-term="${key}"
                    >${escapeHtml(terms[key] || "")}</textarea>
                  `
                  : `
                    <input
                      id="quote-term-${key}"
                      class="text-input quote-term-field__input"
                      type="text"
                      value="${escapeAttribute(terms[key] || "")}"
                      data-quote-term="${key}"
                    />
                  `
              }
            </article>
          `
        )
        .join("")}
    </div>
  `;
}

function renderQuoteHistory(caseData, language) {
  const history = caseData.quoteHistory || [];

  return `
    <article class="summary-card">
      <div class="result-card__header">
        <div>
          <p class="eyebrow">${t(language, "quoteHistoryTitle")}</p>
          <h3>${t(language, "quoteHistoryDescription")}</h3>
        </div>
      </div>
      ${
        history.length
          ? `
            <div class="table-shell">
              <table class="case-table quote-history-table">
                <thead>
                  <tr>
                    <th>${t(language, "updatedCol")}</th>
                    <th>${t(language, "quoteHistoryEvent")}</th>
                    <th>${language === "zh" ? "阶段" : "Stage"}</th>
                    <th>${language === "zh" ? "产品明细" : "Items"}</th>
                    <th>${t(language, "total")}</th>
                  </tr>
                </thead>
                <tbody>
                  ${history
                    .slice()
                    .reverse()
                    .map(
                      (entry) => `
                        <tr class="case-table__row">
                          <td>${escapeHtml(entry.createdAt.slice(0, 16).replace("T", " "))}</td>
                          <td>
                            <strong>${escapeHtml(entry.title)}</strong>
                            <p class="case-table__subtext">${escapeHtml(entry.actor || "system")}</p>
                          </td>
                          <td>${escapeHtml(entry.lifecycleStage || inferQuoteHistoryStage(entry, language))}</td>
                          <td>${renderQuoteHistoryProducts(entry, language)}</td>
                          <td>
                            <strong>${formatMoneyValue(entry.currency, entry.total)}</strong>
                            <p class="case-table__subtext">${escapeHtml(formatQuoteHistoryCommercialsSummary(entry, language))}</p>
                          </td>
                        </tr>
                      `
                    )
                    .join("")}
                </tbody>
              </table>
            </div>
          `
          : `<p class="muted">${t(language, "noQuoteHistory")}</p>`
      }
    </article>
  `;
}

function inferQuoteHistoryStage(entry, language) {
  const title = String(entry.title || "").toLowerCase();

  if (title.includes("sent")) {
    return t(language, "quoteStageSent");
  }

  if (title.includes("approved")) {
    return t(language, "quoteStageApproved");
  }

  return t(language, "quoteStageDraft");
}

function renderQuoteHistoryProducts(entry, language) {
  const items = entry.lineItems || [];

  if (!items.length) {
    return `<span class="muted">${t(language, "noItemsYet")}</span>`;
  }

  return items
    .map(
      (item) =>
        `<div class="quote-history-list-item"><strong>${escapeHtml(item.productLabel || t(language, "product"))}</strong><span class="case-table__subtext">${escapeHtml(item.quantityText || t(language, "noneLabel"))} • ${formatMoneyValue(entry.currency, item.lineTotal)}</span></div>`
    )
    .join("");
}

function renderQuoteHistoryCommercials(entry, language) {
  const parts = [
    entry.incoterm ? `Incoterm: ${entry.incoterm}` : "",
    entry.terms?.paymentTerms ? `${t(language, "paymentTerms")}: ${entry.terms.paymentTerms}` : "",
    entry.terms?.leadTime ? `${t(language, "leadTime")}: ${entry.terms.leadTime}` : "",
    entry.terms?.validityTerms ? `${t(language, "validityTerms")}: ${entry.terms.validityTerms}` : "",
  ].filter(Boolean);

  if (!parts.length) {
    return `<span class="muted">${t(language, "noneLabel")}</span>`;
  }

  return parts.map((part) => `<div class="quote-history-list-item">${escapeHtml(part)}</div>`).join("");
}

function formatQuoteHistoryCommercialsSummary(entry, language) {
  const parts = [
    entry.incoterm ? `Incoterm: ${entry.incoterm}` : "",
    entry.terms?.paymentTerms ? `${t(language, "paymentTerms")}: ${entry.terms.paymentTerms}` : "",
    entry.terms?.leadTime ? `${t(language, "leadTime")}: ${entry.terms.leadTime}` : "",
  ].filter(Boolean);

  return parts.join(" | ") || t(language, "noneLabel");
}

function renderQuoteEmailDraft(emailDraft, language) {
  if (!emailDraft) {
    return `<p class="muted">${t(language, "noQuoteEmailYet")}</p>`;
  }

  return `
    <div class="summary-structure">
      <div><p class="eyebrow">${t(language, "emailTo")}</p><p>${escapeHtml(emailDraft.to || t(language, "noneLabel"))}</p></div>
      <div><p class="eyebrow">${t(language, "emailCc")}</p><p>${escapeHtml(emailDraft.cc || t(language, "noneLabel"))}</p></div>
      <div><p class="eyebrow">${t(language, "emailSubject")}</p><p>${escapeHtml(emailDraft.subject)}</p></div>
      <div><p class="eyebrow">${t(language, "emailAttachment")}</p><p>${escapeHtml(emailDraft.attachmentFileName || t(language, "noneLabel"))}</p></div>
      <div><p class="eyebrow">${t(language, "emailPreview")}</p><p>${escapeHtml(emailDraft.preview)}</p></div>
      <div><p class="eyebrow">${t(language, "emailBody")}</p><pre class="email-draft">${escapeHtml(emailDraft.body)}</pre></div>
    </div>
  `;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll('"', "&quot;");
}

function formatMoneyValue(currency, value) {
  const numeric = Number(value || 0);
  return `${escapeHtml(currency || "USD")} ${numeric.toFixed(2)}`;
}

function formatMoneyRange(currency, low, high) {
  return `${formatMoneyValue(currency, low)} - ${formatMoneyValue(currency, high)}`;
}

function formatQuantityBasis(item, language) {
  const quantityValue = Number(item.quantityValue || 0);
  const quantityUnit = item.quantityUnit || (language === "zh" ? "单位" : "unit");

  if (!quantityValue) {
    return language === "zh" ? "数量未能解析为数值。" : "Quantity could not be parsed into a numeric total.";
  }

  return language === "zh"
    ? `计价数量: ${quantityValue} ${quantityUnit}`
    : `Priced quantity: ${quantityValue} ${quantityUnit}`;
}

function formatLineTotalBasis(item, currency, language) {
  const quantityValue = Number(item.quantityValue || 0);
  const quantityUnit = item.quantityUnit || (language === "zh" ? "单位" : "unit");
  const unitPrice = formatMoneyValue(currency, item.unitPrice);

  if (!quantityValue) {
    return language === "zh" ? "总价待数量确认" : "Total pending quantity confirmation";
  }

  return language === "zh"
    ? `${quantityValue} ${quantityUnit} × ${unitPrice}`
    : `${quantityValue} ${quantityUnit} × ${unitPrice}`;
}

function formatDecisionLineGuidance(guidance, currency, language) {
  const unit = guidance.quantityUnit || (language === "zh" ? "单位" : "unit");
  const hasUnitRange = Number(guidance.recommendedUnitPriceLow || 0) > 0 && Number(guidance.recommendedUnitPriceHigh || 0) > 0;
  const hasLineTotal = Number(guidance.recommendedLineTotalLow || 0) > 0 && Number(guidance.recommendedLineTotalHigh || 0) > 0;
  const parts = [];

  if (hasUnitRange) {
    parts.push(
      language === "zh"
        ? `建议单价 ${formatMoneyRange(currency, guidance.recommendedUnitPriceLow, guidance.recommendedUnitPriceHigh)} / ${unit}`
        : `Target unit price ${formatMoneyRange(currency, guidance.recommendedUnitPriceLow, guidance.recommendedUnitPriceHigh)} / ${unit}`
    );
  }

  if (hasLineTotal) {
    parts.push(
      language === "zh"
        ? `建议行总价 ${formatMoneyRange(currency, guidance.recommendedLineTotalLow, guidance.recommendedLineTotalHigh)}`
        : `Target line total ${formatMoneyRange(currency, guidance.recommendedLineTotalLow, guidance.recommendedLineTotalHigh)}`
    );
  }

  return parts.join(language === "zh" ? "；" : " | ");
}

function renderOutcomesPage(state) {
  const language = state.language;
  const items = state.outcomes.items || [];

  return {
    title: t(language, "outcomesNav"),
    body: `
      <div class="content-stack quote-workspace">
        ${renderSection({
          title: t(language, "outcomesTitle"),
          description: t(language, "outcomesDescription"),
          language,
          body:
            items.length
              ? items
                  .map((item) => {
                    const form = state.outcomes.forms[item.caseId] || {};
                    const result = form.result || "";
                    return `
                      <article class="summary-card outcome-card">
                        <div class="result-card__header">
                          <div>
                            <p class="eyebrow">${escapeHtml(item.quoteNumber || item.caseId)}</p>
                            <h3>${escapeHtml(item.customerName)} • ${escapeHtml(item.projectName || t(language, "noneLabel"))}</h3>
                            <p class="muted">${t(language, "followUpDueLabel")}: ${escapeHtml(String(item.followUpDue || "").slice(0, 10))} • ${t(language, "daysOverdueLabel")}: ${escapeHtml(String(item.daysOverdue || 0))}</p>
                          </div>
                          <div><p>${formatMoneyValue(item.currency || "USD", item.totalValue || 0)}</p></div>
                        </div>
                        <div class="outcome-button-row">
                          ${["won", "lost", "negotiating", "no_response"]
                            .map(
                              (entry) => `
                                <button class="button ${result === entry ? "" : "button--secondary"}" data-action="set-outcome-result" data-case-id="${item.caseId}" data-outcome-result="${entry}">
                                  ${t(language, `outcome_${entry}`)}
                                </button>
                              `
                            )
                            .join("")}
                        </div>
                        ${
                          result === "won"
                            ? `
                              <label class="form-label">${t(language, "actualFinalPrice")}</label>
                              <input class="text-input" type="number" step="0.01" value="${escapeAttribute(form.finalPrice || "")}" data-outcome-field="finalPrice" data-case-id="${item.caseId}" />
                            `
                            : ""
                        }
                        ${
                          result === "lost"
                            ? `
                              <label class="form-label">${t(language, "lossReasonLabel")}</label>
                              <input class="text-input" type="text" value="${escapeAttribute(form.lossReason || "")}" data-outcome-field="lossReason" data-case-id="${item.caseId}" />
                              <label class="form-label">${t(language, "competitorPriceLabel")}</label>
                              <input class="text-input" type="number" step="0.01" value="${escapeAttribute(form.competitorPrice || "")}" data-outcome-field="competitorPrice" data-case-id="${item.caseId}" />
                            `
                            : ""
                        }
                        <div class="intake-actions">
                          <button class="button ${result ? "" : "button--disabled"}" data-action="submit-outcome" data-case-id="${item.caseId}" ${result ? "" : "disabled"}>
                            ${t(language, "submitOutcome")}
                          </button>
                        </div>
                      </article>
                    `;
                  })
                  .join("")
              : `<div class="state-empty"><p>${t(language, "noPendingOutcomes")}</p></div>`,
        })}
      </div>
    `,
  };
}

function renderDashboardPage(state) {
  const language = state.language;
  const stats = state.dashboard.stats;

  if (!stats) {
    return {
      title: t(language, "dashboardNav"),
      body: `<div class="summary-card"><p>${t(language, "dashboardLoading")}</p></div>`,
    };
  }

  return {
    title: t(language, "dashboardNav"),
    body: `
      <div class="content-stack quote-workspace">
        ${
          stats.pendingFollowUps > 0
            ? `<div class="summary-card"><p><strong>${t(language, "pendingFollowUpsBanner")} ${escapeHtml(String(stats.pendingFollowUps))}</strong></p><p class="muted"><a href="#/outcomes">${t(language, "goToOutcomes")}</a></p></div>`
            : ""
        }
        <div class="content-grid">
          ${renderMetricCard(t(language, "winRateCard"), `${Number(stats.winRate30d || 0).toFixed(2)}%`)}
          ${renderMetricCard(t(language, "avgMarginCard"), `${Number(stats.avgMargin30d || 0).toFixed(2)}%`)}
          ${renderMetricCard(t(language, "quotesSentCard"), String(stats.quotesSent30d || 0))}
          ${renderMetricCard(t(language, "pendingFollowUpsCard"), String(stats.pendingFollowUps || 0))}
        </div>
        <div class="content-grid">
          <article class="summary-card">
            <p class="eyebrow">${t(language, "flagDistributionTitle")}</p>
            <p>${renderInlineFlagMix(stats.flagDistribution90d || {})}</p>
            <p class="muted">${t(language, "avgTurnaroundCard")}: ${Number(stats.avgTurnaroundHours || 0).toFixed(2)}h</p>
          </article>
          <article class="summary-card">
            <p class="eyebrow">${t(language, "weeklyVolumeTitle")}</p>
            <div class="table-shell">
              <table class="case-table quote-history-table">
                <thead>
                  <tr>
                    <th>${t(language, "weekLabel")}</th>
                    <th>${t(language, "flagMix")}</th>
                  </tr>
                </thead>
                <tbody>
                  ${(stats.quoteVolumeByWeek || [])
                    .map(
                      (entry) => `
                        <tr class="case-table__row">
                          <td>${escapeHtml(entry.week)}</td>
                          <td>${renderInlineFlagMix(entry)}</td>
                        </tr>
                      `
                    )
                    .join("")}
                </tbody>
              </table>
            </div>
          </article>
        </div>
        <article class="summary-card">
          <p class="eyebrow">${t(language, "topCustomersTitle")}</p>
          <div class="table-shell">
            <table class="case-table quote-history-table">
              <thead>
                <tr>
                  <th>${t(language, "customer")}</th>
                  <th>${t(language, "quotesSentCard")}</th>
                  <th>${t(language, "total")}</th>
                </tr>
              </thead>
              <tbody>
                ${(stats.topCustomers || [])
                  .map(
                    (entry) => `
                      <tr class="case-table__row">
                        <td>${escapeHtml(entry.customerName)}</td>
                        <td>${escapeHtml(String(entry.quoteCount || 0))}</td>
                        <td>${formatMoneyValue("USD", entry.totalValue || 0)}</td>
                      </tr>
                    `
                  )
                  .join("")}
              </tbody>
            </table>
          </div>
        </article>
      </div>
    `,
  };
}

function renderMetricCard(label, value) {
  return `
    <article class="summary-card">
      <p class="eyebrow">${escapeHtml(label)}</p>
      <h3>${escapeHtml(value)}</h3>
    </article>
  `;
}

function formatQuoteStage(quoteLifecycle, language) {
  const stage = String(quoteLifecycle?.status || "").trim().toLowerCase();

  if (!stage || stage === "not_started") {
    return t(language, "quoteNotStarted");
  }

  const key = {
    draft: "quoteStageDraft",
    approved: "quoteStageApproved",
    sent: "quoteStageSent",
    won: "quoteStageWon",
    lost: "quoteStageLost",
    negotiating: "quoteStageNegotiating",
    no_response: "quoteStageNoResponse",
  }[stage];

  return key ? t(language, key) : stage.replace(/_/g, " ");
}

function renderFlagMix(flagCounts) {
  return `<span class="flag-mix">${renderInlineFlagMix(flagCounts || {})}</span>`;
}

function renderInlineFlagMix(flagCounts) {
  const green = Number(flagCounts.green || 0);
  const yellow = Number(flagCounts.yellow || 0);
  const red = Number(flagCounts.red || 0);

  return `
    <span class="quote-flag quote-flag--green">G ${green}</span>
    <span class="quote-flag quote-flag--yellow">Y ${yellow}</span>
    <span class="quote-flag quote-flag--red">R ${red}</span>
  `;
}
