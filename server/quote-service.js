import PDFDocument from "pdfkit";
import { generateQuoteEmailDraft } from "./openai-client.js";
import { buildQuoteEstimate, normalizeStoredQuoteEstimate } from "./knowledge-service.js";

export async function buildQuoteDraft({ caseRecord, knowledgeFiles, language = "en" }) {
  const quoteEstimate = await buildQuoteEstimate({
    caseRecord,
    knowledgeFiles,
    language,
  });

  return normalizeStoredQuoteEstimate({
    caseRecord,
    quoteEstimate,
    language,
  });
}

export async function buildQuoteEmail({ caseRecord, quoteEstimate, language = "en" }) {
  const structuredDraft = buildStructuredQuoteEmail({ caseRecord, quoteEstimate, language });

  try {
    const aiDraft = await generateQuoteEmailDraft({
      caseRecord,
      quoteEstimate,
      language,
    });
    return {
      ...structuredDraft,
      ...aiDraft,
      subject: aiDraft.subject || structuredDraft.subject,
      body: mergeStructuredEmailBody(structuredDraft.body, aiDraft.body),
      preview: aiDraft.preview || structuredDraft.preview,
      attachmentFileName: structuredDraft.attachmentFileName,
    };
  } catch (error) {
    console.error("OpenAI quote email generation failed, falling back to template email:", error);
    return structuredDraft;
  }
}

export function buildFallbackQuoteEmail({ caseRecord, quoteEstimate, language = "en" }) {
  return buildStructuredQuoteEmail({ caseRecord, quoteEstimate, language });
}

export async function buildQuoteDocument({ caseRecord, quoteEstimate, language = "en" }) {
  const normalizedQuote = normalizeStoredQuoteEstimate({
    caseRecord,
    quoteEstimate,
    language,
  });
  const quoteNumber = caseRecord.quoteLifecycle?.quoteNumber || `Q-${caseRecord.caseId}`;
  const fileName = `${quoteNumber.replace(/[^a-z0-9_-]+/gi, "_")}.pdf`;
  const buffer = await renderQuotePdf({
    caseRecord,
    quoteEstimate: normalizedQuote,
    quoteNumber,
    language,
  });

  return {
    fileName,
    contentType: "application/pdf",
    buffer,
  };
}

function buildStructuredQuoteEmail({ caseRecord, quoteEstimate, language = "en" }) {
  const normalizedQuote = normalizeStoredQuoteEstimate({
    caseRecord,
    quoteEstimate,
    language,
  });
  const terms = normalizedQuote?.terms || {};
  const lineSummary = (normalizedQuote?.lineItems || [])
    .map((item, index) =>
      language === "zh"
        ? `${index + 1}. ${item.productLabel} | 数量 ${item.quantityText} | 单价 ${currencyValue(normalizedQuote?.currency, item.finalPrice ?? item.unitPrice)} | 行合计 ${currencyValue(normalizedQuote?.currency, item.lineTotal)}`
        : `${index + 1}. ${item.productLabel} | Qty ${item.quantityText} | Unit ${currencyValue(normalizedQuote?.currency, item.finalPrice ?? item.unitPrice)} | Line Total ${currencyValue(normalizedQuote?.currency, item.lineTotal)}`
    )
    .filter(Boolean)
    .join("\n");
  const currency = normalizedQuote?.currency || "USD";
  const total = Number(normalizedQuote?.total || 0).toFixed(2);
  const to = terms.buyerEmail || "";
  const cc = terms.ccEmails || "";
  const quoteNumber = caseRecord.quoteLifecycle?.quoteNumber || `Q-${caseRecord.caseId}`;
  const attachmentFileName = `${quoteNumber.replace(/[^a-z0-9_-]+/gi, "_")}.pdf`;

  if (language === "zh") {
    return {
      to,
      cc,
      subject: `正式报价 ${quoteNumber} | ${caseRecord.customerName}`,
      preview: `已生成正式报价邮件和可下载 PDF：${attachmentFileName}`,
      attachmentFileName,
      body: [
        `尊敬的${terms.buyerName || "客户"}，`,
        "",
        `感谢贵司给予询价机会。现随函提交正式报价，报价编号为 ${quoteNumber}。附件为正式 PDF 报价文件，供内部审批与回签使用。`,
        "",
        `一、报价摘要`,
        `客户：${caseRecord.customerName}`,
        `项目：${caseRecord.projectName || "Customer RFQ Review"}`,
        `报价总计：${currency} ${total}`,
        "",
        `二、产品明细`,
        lineSummary || "请见附件中的报价明细表。",
        "",
        `三、商务条款`,
        `付款条款：${terms.paymentTerms || "待确认"}`,
        `报价有效期：${terms.validityTerms || "待确认"}`,
        `交期：${terms.leadTime || "待确认"}`,
        `贸易/运输条款：${terms.shippingTerms || "待确认"}`,
        `Incoterm：${normalizedQuote?.incoterm || "待确认"}`,
        "",
        `四、补充说明`,
        terms.quoteNotes || "如需补充技术附件、认证资料或商务澄清，请随时告知。",
        "",
        "烦请查收附件，并如需进一步调整，请直接回复此邮件。",
        "",
        "此致",
        "敬礼",
        "",
        `${terms.sellerEntity || "Quotelligence Metals"}`,
        "Sales Team",
      ]
        .filter(Boolean)
        .join("\n"),
    };
  }

  return {
    to,
    cc,
    subject: `Formal Quotation ${quoteNumber} | ${caseRecord.customerName}`,
    preview: `Formal quote email and downloadable PDF prepared: ${attachmentFileName}`,
    attachmentFileName,
    body: [
      `Dear ${terms.buyerName || "Customer"},`,
      "",
      `Thank you for the opportunity to quote. Please find our formal quotation ${quoteNumber} attached for your review and approval routing.`,
      "",
      `1. Quote Summary`,
      `Customer: ${caseRecord.customerName}`,
      `Project: ${caseRecord.projectName || "Customer RFQ Review"}`,
      `Quoted Total: ${currency} ${total}`,
      "",
      `2. Line Item Summary`,
      lineSummary || "Please refer to the attached formal quotation for the detailed line item schedule.",
      "",
      `3. Commercial Terms`,
      `Payment Terms: ${terms.paymentTerms || "To be confirmed"}`,
      `Quote Validity: ${terms.validityTerms || "To be confirmed"}`,
      `Lead Time: ${terms.leadTime || "To be confirmed"}`,
      `Commercial / Shipping Terms: ${terms.shippingTerms || "To be confirmed"}`,
      `Incoterm: ${normalizedQuote?.incoterm || "To be confirmed"}`,
      "",
      `4. Additional Notes`,
      terms.quoteNotes || "Please let us know if you need any supporting documents, revisions, or clarifications.",
      "",
      "Kindly review the attached PDF quotation and advise if any revisions are required.",
      "",
      "Sincerely,",
      `${terms.sellerEntity || "Quotelligence Metals"}`,
      "Sales Team",
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

function mergeStructuredEmailBody(structuredBody, aiBody) {
  const body = String(aiBody || "").trim();

  if (!body) {
    return structuredBody;
  }

  const formalHasCoreSections = /payment terms|quote validity|lead time|commercial|incoterm/i.test(body);
  return formalHasCoreSections ? body : structuredBody;
}

function currencyValue(currency, amount) {
  return `${currency || "USD"} ${Number(amount || 0).toFixed(2)}`;
}

async function renderQuotePdf({ caseRecord, quoteEstimate, quoteNumber, language = "en" }) {
  const doc = new PDFDocument({
    size: "A4",
    margin: 50,
    bufferPages: true,
  });
  const chunks = [];

  doc.on("data", (chunk) => chunks.push(chunk));

  const completion = new Promise((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  drawCompanyHeader(doc, quoteEstimate.terms?.sellerEntity || "Quotelligence Metals");
  drawQuoteMeta(doc, { caseRecord, quoteEstimate, quoteNumber, language });
  drawLineItemsTable(doc, quoteEstimate, language);
  drawCommercialTerms(doc, quoteEstimate, language);
  drawSignatureSection(doc, quoteEstimate, language);
  drawPageNumbers(doc);
  doc.end();

  return completion;
}

function drawCompanyHeader(doc, companyName) {
  doc.roundedRect(50, 42, 42, 42, 10).fill("#1D4ED8");
  doc.fillColor("white").fontSize(18).font("Helvetica-Bold").text("Q", 63, 54, { align: "center", width: 16 });
  doc.fillColor("#0F172A").fontSize(20).font("Helvetica-Bold").text(companyName, 106, 48);
  doc.fontSize(9).fillColor("#475569").text("Formal Quotation", 106, 72);
  doc.moveDown(2);
}

function drawQuoteMeta(doc, { caseRecord, quoteEstimate, quoteNumber, language }) {
  const startY = 110;
  const details = [
    [language === "zh" ? "报价编号" : "Quote Number", quoteNumber],
    [language === "zh" ? "案例编号" : "Case ID", caseRecord.caseId],
    [language === "zh" ? "客户" : "Customer", caseRecord.customerName],
    [language === "zh" ? "项目" : "Project", caseRecord.projectName],
    [language === "zh" ? "日期" : "Date", new Date().toISOString().slice(0, 10)],
    [language === "zh" ? "币种" : "Currency", quoteEstimate.currency || "USD"],
  ];

  doc.font("Helvetica").fontSize(10);
  let y = startY;
  for (const [label, value] of details) {
    doc.fillColor("#475569").text(label, 50, y, { width: 120 });
    doc.fillColor("#0F172A").font("Helvetica-Bold").text(String(value || ""), 170, y, { width: 360 });
    y += 18;
    doc.font("Helvetica");
  }

  doc.moveTo(50, y + 6).lineTo(545, y + 6).strokeColor("#CBD5E1").stroke();
  doc.y = y + 20;
}

function drawLineItemsTable(doc, quoteEstimate, language) {
  const headers = [
    language === "zh" ? "产品" : "Product",
    language === "zh" ? "数量" : "Quantity",
    language === "zh" ? "最终单价" : "Final Unit Price",
    language === "zh" ? "行合计" : "Line Total",
  ];
  const widths = [220, 110, 95, 100];
  let y = doc.y;

  doc.font("Helvetica-Bold").fontSize(10);
  let x = 50;
  headers.forEach((header, index) => {
    doc.rect(x, y, widths[index], 22).fillAndStroke("#E2E8F0", "#CBD5E1");
    doc.fillColor("#0F172A").text(header, x + 6, y + 7, { width: widths[index] - 12 });
    x += widths[index];
  });

  y += 22;
  doc.font("Helvetica").fontSize(9);

  for (const item of quoteEstimate.lineItems || []) {
    const row = [
      item.productLabel || "",
      item.quantityText || "",
      currencyValue(quoteEstimate.currency, item.finalPrice ?? item.unitPrice),
      currencyValue(quoteEstimate.currency, item.lineTotal),
    ];
    const rowHeight = 34;
    x = 50;

    ensurePdfSpace(doc, rowHeight + 20);

    row.forEach((value, index) => {
      doc.rect(x, y, widths[index], rowHeight).stroke("#E2E8F0");
      doc.fillColor("#0F172A").text(String(value), x + 6, y + 8, { width: widths[index] - 12, height: rowHeight - 10 });
      x += widths[index];
    });

    y += rowHeight;
    doc.y = y;
  }

  doc.moveDown(1);
  doc.font("Helvetica-Bold").fontSize(10).fillColor("#0F172A");
  doc.text(`${language === "zh" ? "小计" : "Subtotal"}: ${currencyValue(quoteEstimate.currency, quoteEstimate.subtotal)}`);
  doc.text(`${language === "zh" ? "总计" : "Total"}: ${currencyValue(quoteEstimate.currency, quoteEstimate.total)}`);
  doc.moveDown(1);
}

function drawCommercialTerms(doc, quoteEstimate, language) {
  const terms = quoteEstimate.terms || {};
  const items = [
    [language === "zh" ? "付款条款" : "Payment Terms", terms.paymentTerms || (language === "zh" ? "待确认" : "To be confirmed")],
    [language === "zh" ? "报价有效期" : "Quote Validity", terms.validityTerms || (language === "zh" ? "待确认" : "To be confirmed")],
    [language === "zh" ? "交期" : "Lead Time", terms.leadTime || (language === "zh" ? "待确认" : "To be confirmed")],
    [language === "zh" ? "贸易/运输条款" : "Commercial / Shipping Terms", terms.shippingTerms || (language === "zh" ? "待确认" : "To be confirmed")],
    [language === "zh" ? "Incoterm" : "Incoterm", quoteEstimate.incoterm || (language === "zh" ? "待确认" : "To be confirmed")],
  ];

  ensurePdfSpace(doc, 180);
  doc.font("Helvetica-Bold").fontSize(12).fillColor("#0F172A").text(language === "zh" ? "商务条款" : "Commercial Terms");
  doc.moveDown(0.4);
  doc.font("Helvetica").fontSize(10);
  for (const [label, value] of items) {
    doc.fillColor("#475569").text(`${label}:`, { continued: true });
    doc.fillColor("#0F172A").text(` ${value}`);
  }

  if (terms.quoteNotes) {
    doc.moveDown(0.4);
    doc.fillColor("#475569").text(language === "zh" ? "备注:" : "Notes:", { continued: true });
    doc.fillColor("#0F172A").text(` ${terms.quoteNotes}`);
  }

  doc.moveDown(1);
}

function drawSignatureSection(doc, quoteEstimate, language) {
  const terms = quoteEstimate.terms || {};
  ensurePdfSpace(doc, 140);
  doc.moveDown(1);
  doc.font("Helvetica-Bold").fontSize(12).fillColor("#0F172A").text(language === "zh" ? "签署" : "Signature");
  doc.moveDown(0.8);
  doc.font("Helvetica").fontSize(10);
  doc.text(terms.sellerEntity || "Quotelligence Metals");
  doc.text(language === "zh" ? "销售团队" : "Sales Team");
  doc.text(language === "zh" ? "授权签发" : "Authorized for quotation issue");
  doc.moveDown(1.4);
  doc.strokeColor("#94A3B8").moveTo(50, doc.y).lineTo(230, doc.y).stroke();
  doc.moveDown(0.4);
  doc.fillColor("#475569").text(language === "zh" ? "签字 / Signature" : "Signature");
}

function ensurePdfSpace(doc, requiredHeight) {
  if (doc.y + requiredHeight <= doc.page.height - doc.page.margins.bottom) {
    return;
  }

  doc.addPage();
}

function drawPageNumbers(doc) {
  const range = doc.bufferedPageRange();

  for (let index = 0; index < range.count; index += 1) {
    doc.switchToPage(index);
    doc.fontSize(8).fillColor("#64748B").text(`Page ${index + 1} of ${range.count}`, 50, doc.page.height - 36, {
      align: "right",
      width: doc.page.width - 100,
    });
  }
}
