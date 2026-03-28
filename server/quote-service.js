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
  try {
    return await generateQuoteEmailDraft({
      caseRecord,
      quoteEstimate,
      language,
    });
  } catch (error) {
    console.error("OpenAI quote email generation failed, falling back to template email:", error);
    return buildFallbackQuoteEmail({ caseRecord, quoteEstimate, language });
  }
}

export function buildFallbackQuoteEmail({ caseRecord, quoteEstimate, language = "en" }) {
  const terms = quoteEstimate?.terms || {};
  const lineSummary = (quoteEstimate?.lineItems || [])
    .map((item) => `${item.productLabel}: ${item.quantityText}`)
    .filter(Boolean)
    .join(language === "zh" ? "；" : "; ");
  const currency = quoteEstimate?.currency || "USD";
  const total = Number(quoteEstimate?.total || 0).toFixed(2);
  const to = terms.buyerEmail || "";
  const cc = terms.ccEmails || "";

  if (language === "zh") {
    return {
      to,
      cc,
      subject: `${caseRecord.caseId} 报价草稿`,
      preview: `已为 ${caseRecord.customerName} 生成报价邮件草稿。`,
      body: [
        `尊敬的${terms.buyerName || "客户"}，`,
        "",
        `感谢您的询价。基于当前 RFQ，我们已准备好 ${caseRecord.caseId} 的报价草稿。`,
        lineSummary ? `产品范围：${lineSummary}` : "",
        `报价总计：${currency} ${total}`,
        terms.paymentTerms ? `付款条款：${terms.paymentTerms}` : "",
        terms.validityTerms ? `有效期：${terms.validityTerms}` : "",
        terms.leadTime ? `交期：${terms.leadTime}` : "",
        terms.shippingTerms ? `贸易/运输条款：${terms.shippingTerms}` : "",
        terms.quoteNotes ? `备注：${terms.quoteNotes}` : "",
        "",
        "如需我们提供正式版本或补充支持文件，请直接回复此邮件。",
        "",
        `此致`,
        `${terms.sellerEntity || "QuoteCase 团队"}`,
      ]
        .filter(Boolean)
        .join("\n"),
    };
  }

  return {
    to,
    cc,
    subject: `${caseRecord.caseId} Draft Quote`,
    preview: `Draft quote email prepared for ${caseRecord.customerName}.`,
    body: [
      `Dear ${terms.buyerName || "Customer"},`,
      "",
      `Thank you for the opportunity to quote. We have prepared a draft quote for ${caseRecord.caseId}.`,
      lineSummary ? `Quoted scope: ${lineSummary}` : "",
      `Quoted total: ${currency} ${total}`,
      terms.paymentTerms ? `Payment terms: ${terms.paymentTerms}` : "",
      terms.validityTerms ? `Quote validity: ${terms.validityTerms}` : "",
      terms.leadTime ? `Lead time: ${terms.leadTime}` : "",
      terms.shippingTerms ? `Commercial / shipping terms: ${terms.shippingTerms}` : "",
      terms.quoteNotes ? `Notes: ${terms.quoteNotes}` : "",
      "",
      "Please let us know if you would like the formal version issued or if any revisions are needed.",
      "",
      "Best regards,",
      `${terms.sellerEntity || "QuoteCase Team"}`,
    ]
      .filter(Boolean)
      .join("\n"),
  };
}
