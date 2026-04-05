import nodemailer from "nodemailer";

import { buildQuoteDocument } from "./quote-service.js";
import { normalizeStoredQuoteEstimate } from "./knowledge-service.js";

let transporterPromise = null;

export function getEmailDeliveryPublicConfig() {
  const host = String(process.env.SMTP_HOST || "").trim();
  const user = String(process.env.SMTP_USER || "").trim();
  const fromEmail = String(process.env.SMTP_FROM_EMAIL || "").trim();

  return {
    configured: Boolean(host && user && fromEmail),
    fromEmail,
    fromName: String(process.env.SMTP_FROM_NAME || "").trim(),
  };
}

export function buildFollowUpEmailDraft({ caseRecord, language = "en" }) {
  const lifecycle = caseRecord.quoteLifecycle || {};
  const quoteEstimate = normalizeStoredQuoteEstimate({
    caseRecord,
    quoteEstimate: caseRecord.quoteEstimate,
    language,
  });
  const terms = quoteEstimate.terms || {};
  const quoteNumber = lifecycle.quoteNumber || `Q-${caseRecord.caseId}`;
  const to = terms.buyerEmail || "";
  const cc = terms.ccEmails || "";

  if (language === "zh") {
    return {
      to,
      cc,
      subject: `跟进报价 ${quoteNumber} | ${caseRecord.customerName}`,
      preview: `已准备对 ${caseRecord.customerName} 的报价跟进邮件。`,
      includeQuotePdf: true,
      body: [
        `尊敬的${terms.buyerName || "客户"}，`,
        "",
        `您好。想就我们此前发送的报价 ${quoteNumber} 做一次简短跟进。`,
        `如贵司仍在评审中，我们可以配合补充技术资料、认证文件、交期确认或商务调整。`,
        "",
        `报价摘要：`,
        `客户：${caseRecord.customerName}`,
        `项目：${caseRecord.projectName || "客户询价"}`,
        `报价总计：${quoteEstimate.currency || "USD"} ${Number(quoteEstimate.total || 0).toFixed(2)}`,
        "",
        `如方便，烦请告知当前状态或需要我们补充的内容。`,
        "",
        "此致",
        "敬礼",
        "",
        `${terms.sellerEntity || "Quotelligence Metals"}`,
        "Sales Team",
      ].join("\n"),
    };
  }

  return {
    to,
    cc,
    subject: `Follow-Up on Quotation ${quoteNumber} | ${caseRecord.customerName}`,
    preview: `Follow-up email prepared for ${caseRecord.customerName}.`,
    includeQuotePdf: true,
    body: [
      `Dear ${terms.buyerName || "Customer"},`,
      "",
      `I wanted to follow up on our quotation ${quoteNumber} that we previously sent for your review.`,
      `If your team is still evaluating the offer, we can support with additional technical documents, certifications, lead-time confirmation, or commercial revisions as needed.`,
      "",
      `Quote summary:`,
      `Customer: ${caseRecord.customerName}`,
      `Project: ${caseRecord.projectName || "Customer RFQ Review"}`,
      `Quoted Total: ${quoteEstimate.currency || "USD"} ${Number(quoteEstimate.total || 0).toFixed(2)}`,
      "",
      `Please let us know your current status or any revisions you would like us to prepare.`,
      "",
      "Sincerely,",
      `${terms.sellerEntity || "Quotelligence Metals"}`,
      "Sales Team",
    ].join("\n"),
  };
}

export function buildAutoFollowUpConfig({ caseRecord, draft, sendAt, actor }) {
  return {
    enabled: true,
    sendAt,
    to: draft.to || "",
    cc: draft.cc || "",
    subject: draft.subject || "",
    body: draft.body || "",
    includeQuotePdf: draft.includeQuotePdf !== false,
    scheduledBy: actor || "user",
    scheduledAt: new Date().toISOString(),
    lastStatus: "scheduled",
    lastError: "",
    sentAt: "",
  };
}

export async function sendFollowUpEmail({ caseRecord, draft, language = "en" }) {
  const normalizedQuote = normalizeStoredQuoteEstimate({
    caseRecord,
    quoteEstimate: caseRecord.quoteEstimate,
    language,
  });

  if (!draft.to) {
    throw new Error("Buyer email is missing for this follow-up.");
  }

  const mail = {
    from: formatFromAddress(),
    to: draft.to,
    cc: draft.cc || undefined,
    subject: draft.subject,
    text: draft.body,
    attachments: [],
  };

  if (draft.includeQuotePdf !== false) {
    const document = await buildQuoteDocument({
      caseRecord,
      quoteEstimate: normalizedQuote,
      language,
    });
    mail.attachments.push({
      filename: document.fileName,
      content: document.buffer,
      contentType: document.contentType,
    });
  }

  const transporter = await getTransporter();
  const info = await transporter.sendMail(mail);

  return {
    messageId: info.messageId || "",
    accepted: info.accepted || [],
  };
}

export async function processDueAutoFollowUps({ cases, language = "en", now = new Date() }) {
  const processed = [];

  for (const caseRecord of cases) {
    const config = caseRecord?.quoteLifecycle?.autoFollowUp;
    if (!config?.enabled || !config.sendAt || config.sentAt) {
      continue;
    }

    const sendAt = new Date(config.sendAt);
    if (Number.isNaN(sendAt.getTime()) || sendAt > now) {
      continue;
    }

    try {
      const result = await sendFollowUpEmail({
        caseRecord,
        draft: config,
        language,
      });
      processed.push({
        caseId: caseRecord.caseId,
        ok: true,
        result,
      });
    } catch (error) {
      processed.push({
        caseId: caseRecord.caseId,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return processed;
}

function formatFromAddress() {
  const email = String(process.env.SMTP_FROM_EMAIL || "").trim();
  const name = String(process.env.SMTP_FROM_NAME || "").trim();

  if (!email) {
    throw new Error("SMTP_FROM_EMAIL is not configured.");
  }

  return name ? `${name} <${email}>` : email;
}

async function getTransporter() {
  if (!transporterPromise) {
    transporterPromise = Promise.resolve().then(async () => {
      if (String(process.env.SMTP_JSON_TRANSPORT || "").trim().toLowerCase() === "true") {
        return nodemailer.createTransport({ jsonTransport: true });
      }

      const host = String(process.env.SMTP_HOST || "").trim();
      const port = Number(process.env.SMTP_PORT || 465);
      const secure = String(process.env.SMTP_SECURE || "true").trim().toLowerCase() !== "false";
      const user = String(process.env.SMTP_USER || "").trim();
      const pass = String(process.env.SMTP_PASSWORD || "").trim();

      if (!host || !user || !pass) {
        throw new Error("SMTP is not configured. Set SMTP_HOST, SMTP_USER, SMTP_PASSWORD, and SMTP_FROM_EMAIL.");
      }

      return nodemailer.createTransport({
        host,
        port,
        secure,
        auth: {
          user,
          pass,
        },
      });
    });
  }

  return transporterPromise;
}
