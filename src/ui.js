import { statusLabel, t } from "./i18n.js";

const STATUS_TONES = {
  New: "neutral",
  Parsing: "warning",
  "Ready for Review": "info",
  "Needs Clarification": "warning",
  "Under Knowledge Review": "info",
  "Partially Supported": "warning",
  "Ready to Quote": "success",
  "Escalate Internally": "danger",
  Supported: "success",
  "Likely Supported": "info",
  Unclear: "warning",
  "Not Found": "danger",
  "Checked — Requirement met": "success",
  "Checked — Partially met": "info",
  "Checked — Missing information": "warning",
  "Checked — Risk threshold exceeded": "danger",
  "Waiting for user decision": "warning",
  "Overridden by user": "info",
  "Blocked pending resolution": "danger",
  "Completed and moved forward": "success",
};

export function renderStatusBadge(status, language = "en") {
  const tone = STATUS_TONES[status] || "neutral";
  return `<span class="status-badge status-badge--${tone}">${statusLabel(language, status)}</span>`;
}

export function renderSection({ title, description, body, language = "en" }) {
  return `
    <section class="section-card">
      <div class="section-card__header">
        <h3>${title}</h3>
        ${description ? `<p class="muted">${description}</p>` : ""}
      </div>
      <div class="section-card__body">
        ${body}
      </div>
    </section>
  `;
}

export function renderMetadataList(items) {
  return `
    <dl class="metadata-list">
      ${items
        .map(
          (item) => `
            <div class="metadata-list__item">
              <dt>${item.label}</dt>
              <dd>${item.value}</dd>
            </div>
          `
        )
        .join("")}
    </dl>
  `;
}

export function renderTagList(items, language = "en") {
  if (!items.length) {
    return `<p class="muted">${t(language, "noItemsYet")}</p>`;
  }

  return `
    <div class="tag-list">
      ${items.map((item) => `<span class="tag">${item}</span>`).join("")}
    </div>
  `;
}

export function renderComparisonResultList(results, language = "en") {
  if (!results.length) {
    return `<p class="muted">${t(language, "noCategoryItems")}</p>`;
  }

  return `
    <div class="result-list">
      ${results
        .map(
          (result) => `
            <article class="result-card">
              <div class="result-card__header">
                <h4>${result.requirement}</h4>
                ${renderStatusBadge(result.status, language)}
              </div>
              <p>${result.explanation}</p>
              <p class="muted">${t(language, "supportingFiles")}: ${result.supportingFiles.join(", ") || t(language, "noneLabel")}</p>
            </article>
          `
        )
        .join("")}
    </div>
  `;
}
