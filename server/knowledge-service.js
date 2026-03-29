import path from "node:path";
import { extractTextFromBuffer, extractWorkbookSheetsFromBuffer } from "./file-text-extractor.js";
import { buildQuoteDecisionRecommendation, normalizeDecisionWorkbook } from "./quote-decision-engine.js";
import { runAgent3, runAgent4, mapPipelineToQuoteEstimate } from "./agent-pipeline.js";

import {
  compareCaseToKnowledgeBase,
  extractPdfTextWithOpenAI,
  generateKnowledgeFileMetadata,
  generateKnowledgeFileSummary,
  generateQuoteEstimateFromKnowledge,
} from "./openai-client.js";

const KNOWLEDGE_CATEGORIES = [
  "Quote Decision Workbook",
  "Past Quote",
  "Pricing Tool",
  "Capability Matrix",
  "Certificate",
  "Compliance Document",
  "Standards Reference",
  "Inspection Template",
  "MTC / MTR",
  "Sample Documentation",
  "Other Support File",
];

export function getKnowledgeCategories() {
  return [...KNOWLEDGE_CATEGORIES];
}

export async function buildKnowledgeFilesFromUpload({ files, language = "en", now = new Date() }) {
  return Promise.all(files.map((file, index) => normalizeKnowledgeFile(file, index, now, language)));
}

export async function buildKnowledgeComparison({ caseRecord, knowledgeFiles, language = "en" }) {
  if (!knowledgeFiles.length) {
    return emptyComparison(language);
  }

  try {
    return await compareCaseToKnowledgeBase({
      caseRecord,
      knowledgeFiles,
      language,
    });
  } catch (error) {
    console.error("OpenAI knowledge comparison failed, falling back to heuristic comparison:", error);
    return buildHeuristicKnowledgeComparison({ caseRecord, knowledgeFiles, language });
  }
}

export async function buildQuoteEstimate({ caseRecord, knowledgeFiles, language = "en" }) {
  const pricingFiles = knowledgeFiles.filter((file) =>
    ["Pricing Tool", "Past Quote", "Quote Decision Workbook"].includes(file.category)
  );
  const decisionRecommendation = buildQuoteDecisionRecommendation({
    caseRecord,
    knowledgeFiles,
    language,
  });

  if (!pricingFiles.length && !decisionRecommendation) {
    return emptyQuoteEstimate(caseRecord, language);
  }

  const hasConfiguredOpenAI = Boolean(String(process.env.OPENAI_API_KEY || "").trim());
  let draftQuote;

  // Try Agent 3+4 pipeline first (pricing intelligence + quotation draft with business rules)
  if (hasConfiguredOpenAI && knowledgeFiles.length && shouldUseQuoteAgentPipeline()) {
    try {
      const { agent1Result, agent2Result } = buildSyntheticAgentContext(caseRecord);
      const agent3Result = await runAgent3({ agent1Result, agent2Result, knowledgeFiles, language });
      const agent4Result = await runAgent4({ agent1Result, agent2Result, agent3Result, language });
      draftQuote = mapPipelineToQuoteEstimate(agent3Result, agent4Result);
    } catch (pipelineError) {
      console.error("Agent pipeline (3+4) failed, falling back to standard quote estimate:", pipelineError);
    }
  }

  // Fall back to single-step generateQuoteEstimateFromKnowledge
  if (!draftQuote) {
    try {
      if (pricingFiles.length) {
        draftQuote = await generateQuoteEstimateFromKnowledge({
          caseRecord,
          knowledgeFiles: pricingFiles,
          language,
        });
      }
    } catch (error) {
      console.error("OpenAI quote estimate failed, falling back to heuristic estimate:", error);
      draftQuote = buildHeuristicQuoteEstimate({ caseRecord, knowledgeFiles: pricingFiles, language });
    }
  }

  if (!draftQuote) {
    draftQuote = pricingFiles.length
      ? buildHeuristicQuoteEstimate({ caseRecord, knowledgeFiles: pricingFiles, language })
      : emptyQuoteEstimate(caseRecord, language);
  }

  return recalculateQuoteEstimate(
    applyDecisionRecommendationToQuoteEstimate({
      quoteEstimate: draftQuote,
      decisionRecommendation,
      language,
    }),
    caseRecord,
    language
  );
}

function shouldUseQuoteAgentPipeline() {
  // The 2-step quote pipeline is materially slower than the single-step fallback
  // and can exceed serverless runtime limits during deployment previews.
  if (String(process.env.VERCEL || "").trim()) {
    return false;
  }

  if (String(process.env.AWS_LAMBDA_FUNCTION_NAME || "").trim()) {
    return false;
  }

  return true;
}

/**
 * Reconstruct minimal agent1/agent2 format from a case record so Agent 3+4
 * can be driven without re-running the intake pipeline.
 */
function buildSyntheticAgentContext(caseRecord) {
  const fields = Object.fromEntries(
    (caseRecord.extractedFields || []).map((f) => [f.fieldName, f.value])
  );

  // If the case was created via the agent pipeline, reuse stored metadata directly
  const rfqMetadata = caseRecord.pipelineMetadata?.rfqMetadata || {
    customer_name:           caseRecord.customerName || "",
    customer_contact:        "",
    rfq_number:              "",
    rfq_date:                "",
    required_delivery:       fields["Delivery Request"] || "",
    destination:             fields["Destination"] || "",
    currency:                "USD",
    special_requirements:    fields["Inspection Requirements"] ? [fields["Inspection Requirements"]] : [],
    certifications_required: fields["Documentation Requirements"] ? [fields["Documentation Requirements"]] : [],
  };

  const standardized_items = (caseRecord.productItems || []).map((item, index) => {
    const quantityNum = Number.parseFloat(String(item.quantity || "").replace(/[^\d.]/g, "")) || 0;
    const quantityUnit = String(item.quantity || "pcs").replace(/^[\d.\s]+/, "").trim() || "pcs";

    return {
      line_number:           index + 1,
      internal_code:         item.internalCode || `ITEM-${index + 1}`,
      quantity:              quantityNum,
      unit_standardized:     quantityUnit,
      confidence_score:      typeof item.confidenceScore === "number" ? item.confidenceScore : 5,
      confidence_level:      item.confidenceLevel || "MEDIUM",
      normalization_notes:   Array.isArray(item.normalizationNotes) ? item.normalizationNotes : [],
      requires_human_review: Boolean(item.requiresHumanReview),
      review_reason:         item.reviewReason || "",
      standardized_spec: {
        product_type:      item.productType || "",
        material_grade:    item.materialGrade || "",
        material_standard: item.productStandard || "",
        od_mm:             Number.parseFloat(item.outsideDimension) || 0,
        od_inches:         0,
        wt_mm:             Number.parseFloat(item.wallThickness) || 0,
        schedule:          item.schedule || "",
        length_mm:         Number.parseFloat(item.lengthPerPiece) || 0,
        product_standard:  item.productStandard || "",
        surface:           item.surface || "",
        end_condition:     item.endCondition || "",
      },
    };
  });

  return {
    agent1Result: { rfq_metadata: rfqMetadata, line_items: [], parsing_flags: [] },
    agent2Result: { standardized_items, normalization_summary: { total_items: standardized_items.length, items_requiring_review: 0, average_confidence_score: 5 } },
  };
}

export function normalizeStoredQuoteEstimate({ caseRecord, quoteEstimate, language = "en" }) {
  return recalculateQuoteEstimate(quoteEstimate || emptyQuoteEstimate(caseRecord, language), caseRecord, language);
}

export async function summarizeKnowledgeFile({ knowledgeFile, language = "en" }) {
  if (!knowledgeFile?.extractedText) {
    return {
      summary:
        language === "zh"
          ? "该文件缺少足够的可读文本，暂时无法生成可靠摘要。"
          : "This file does not contain enough readable text for a grounded summary.",
    };
  }

  try {
    return await generateKnowledgeFileSummary({
      knowledgeFile,
      language,
    });
  } catch (error) {
    console.error("OpenAI knowledge file summary failed, falling back to heuristic summary:", error);
    const preview = knowledgeFile.extractedText.replace(/\s+/g, " ").trim().slice(0, 260);
    return {
      summary: `${knowledgeFile.category}: ${preview}${knowledgeFile.extractedText.length > 260 ? "..." : ""}`,
    };
  }
}

export function deriveKnowledgeStatus(comparison) {
  if (comparison.recommendedStatus) {
    return comparison.recommendedStatus;
  }

  if (comparison.missingSupport?.length) {
    return "Partially Supported";
  }

  if (comparison.partialSupport?.length || comparison.suggestedReviewAreas?.length) {
    return "Under Knowledge Review";
  }

  return "Ready to Quote";
}

async function normalizeKnowledgeFile(file, index, now, language) {
  const name = file.name || `knowledge-file-${index + 1}`;
  const type = inferType(name);
  const buffer = Buffer.from(await file.arrayBuffer());
  let extractedText = await extractTextFromBuffer({
    fileName: name,
    type,
    buffer,
  });

  if (type === "PDF" && !extractedText.trim() && String(process.env.OPENAI_API_KEY || "").trim()) {
    try {
      extractedText = await extractPdfTextWithOpenAI({
        fileName: name,
        buffer,
        language,
      });
    } catch (error) {
      console.error("OpenAI PDF OCR fallback failed during knowledge upload:", error);
    }
  }

  const workbook = await extractWorkbookSheetsFromBuffer({
    fileName: name,
    type,
    buffer,
  });
  const decisionWorkbook = workbook
    ? normalizeDecisionWorkbook({
        workbook,
        fileName: name,
      })
    : null;
  const textReadable = isReadableKnowledgeText(extractedText);
  const metadata = await buildKnowledgeMetadata({
    name,
    type,
    extractedText,
    decisionWorkbook,
    textReadable,
    language,
  });

  return {
    knowledgeFileId: `kf-${now.getTime()}-${index + 1}`,
    name,
    type,
    category: metadata.category,
    summary: metadata.summary,
    uploadedAt: now.toISOString(),
    extractedText: textReadable ? extractedText : "",
    decisionWorkbook,
  };
}

function classifyKnowledgeFile(name, extractedText) {
  const text = `${name} ${extractedText}`.toLowerCase();
  const hasCommercialEvidence = /(?:usd|eur|cny|\$|unit price|total price|subtotal|per ton|per kg|per piece|incoterm|validity|lead time)/i.test(text);

  if (/(mtc|mtr|mill test|mill cert)/i.test(text)) {
    return "MTC / MTR";
  }

  if (/(certificate|certification|en 10204|3\.1|3\.2|certificate of compliance)/i.test(text)) {
    return "Certificate";
  }

  if (/(astm|asme|api|nace|iso|standard|specification)/i.test(text) && !hasCommercialEvidence) {
    return "Standards Reference";
  }

  if (/(price|pricing|cost|rate card|quotation sheet|quote sheet)/i.test(text) && hasCommercialEvidence) {
    return "Pricing Tool";
  }

  if (/(past quote|quotation|quoted|proposal|commercial offer)/i.test(text) && hasCommercialEvidence) {
    return "Past Quote";
  }

  if (/(capability|matrix|capabilities)/i.test(text)) {
    return "Capability Matrix";
  }

  if (/(inspection|itp|test plan|qa plan)/i.test(text)) {
    return "Inspection Template";
  }

  if (/(compliance|rohs|reach|ped|tsca)/i.test(text)) {
    return "Compliance Document";
  }

  if (/(sample document|sample cert|sample pack)/i.test(text)) {
    return "Sample Documentation";
  }

  return "Other Support File";
}

function buildHeuristicKnowledgeComparison({ caseRecord, knowledgeFiles, language }) {
  const requirements = buildRequirementSet(caseRecord);
  const grouped = {
    matchingSupport: [],
    partialSupport: [],
    missingSupport: [],
  };

  for (const requirement of requirements) {
    const matches = findSupportingFiles(requirement.value, knowledgeFiles);
    const statuses = matches.map((match) => match.score);
    const bestScore = statuses.length ? Math.max(...statuses) : 0;
    const supportingFiles = matches.map((match) => match.file.name);

    const result = {
      requirement: requirement.label,
      status: bestScore >= 2 ? "Supported" : bestScore === 1 ? "Likely Supported" : "Not Found",
      explanation:
        bestScore >= 2
          ? explain(language, "Strong support found in uploaded files.")
          : bestScore === 1
            ? explain(language, "Some related evidence was found, but manual confirmation is still required.")
            : explain(language, "No direct support was found in the uploaded knowledge library."),
      supportingFiles,
    };

    if (result.status === "Supported") {
      grouped.matchingSupport.push(result);
    } else if (result.status === "Likely Supported") {
      grouped.partialSupport.push(result);
    } else {
      grouped.missingSupport.push(result);
    }
  }

  const suggestedReviewAreas = [
    ...grouped.partialSupport.map((item) => item.requirement),
    ...grouped.missingSupport.map((item) => item.requirement),
  ].slice(0, 5);

  return {
    matchingSupport: grouped.matchingSupport,
    partialSupport: grouped.partialSupport,
    missingSupport: grouped.missingSupport,
    suggestedReviewAreas,
    analysisSummary: summarizeComparison(grouped, language),
    recommendedStatus:
      grouped.missingSupport.length > 0
        ? "Partially Supported"
        : grouped.partialSupport.length > 0
          ? "Under Knowledge Review"
          : "Ready to Quote",
    supportingFilesUsed: unique([
      ...grouped.matchingSupport.flatMap((item) => item.supportingFiles),
      ...grouped.partialSupport.flatMap((item) => item.supportingFiles),
    ]),
  };
}

function buildHeuristicQuoteEstimate({ caseRecord, knowledgeFiles, language }) {
  const priceSignals = knowledgeFiles
    .map((file) => ({ file, signal: extractPriceSignal(file.extractedText, file.category) }))
    .filter((entry) => entry.signal);

  if (!priceSignals.length) {
    return emptyQuoteEstimate(caseRecord, language);
  }

  const primarySignal = priceSignals[0];
  const lineItems = (caseRecord.productItems || []).map((item, index) => {
    const quantity = extractQuantityDetails(item.quantity);
    const baseUnitPrice = primarySignal.signal.amount;

    return {
      lineId: `line-${index + 1}`,
      productId: item.productId || `product-${index + 1}`,
      productLabel: item.label || `Product ${index + 1}`,
      quantityText: item.quantity || explain(language, "Not clearly stated"),
      quantityValue: quantity.value,
      quantityUnit: quantity.unit,
      baseUnitPrice,
      adjustmentAmount: 0,
      unitPrice: baseUnitPrice,
      lineTotal: roundCurrency(quantity.value * baseUnitPrice),
      pricingBasis: explain(
        language,
        `Based on uploaded ${primarySignal.file.category.toLowerCase()} evidence at ${formatMoney(primarySignal.signal.currency, baseUnitPrice)} per ${primarySignal.signal.unit}.`
      ),
      supportingFiles: [primarySignal.file.name],
    };
  });

  return recalculateQuoteEstimate(
    {
      pricingStatus: explain(language, "Draft quote ready"),
      currency: primarySignal.signal.currency,
      incoterm: explain(language, "Not clearly stated"),
      lineItems,
      additionalCharges: [
        { chargeId: "charge-freight", label: explain(language, "Freight"), amount: 0 },
        { chargeId: "charge-other", label: explain(language, "Other"), amount: 0 },
      ],
      subtotal: 0,
      total: 0,
      terms: defaultQuoteTerms(language),
      assumptions: [explain(language, "Pricing evidence is limited and should be reviewed before sending.")],
      risks: [explain(language, "Commercial assumptions may not fully match the current RFQ scope.")],
      supportingFiles: [primarySignal.file.name],
      recommendedNextStep: explain(language, "Review the draft quote and confirm commercial assumptions."),
      summary: explain(language, "A draft quote was created from uploaded pricing evidence."),
    },
    caseRecord,
    language
  );
}

function buildRequirementSet(caseRecord) {
  const firstProduct = caseRecord.productItems?.[0] || {};
  const fields = mapFields(caseRecord.extractedFields || []);

  return [
    {
      label: `${firstProduct.label || "Product"}: ${firstProduct.materialGrade || fields["Material / Grade"] || "Not clearly stated"}`,
      value: [firstProduct.productType, firstProduct.materialGrade, firstProduct.dimensions].filter(Boolean).join(" "),
    },
    {
      label: "Requested Standards",
      value: fields["Requested Standards"] || "Not clearly stated",
    },
    {
      label: "Inspection Requirements",
      value: fields["Inspection Requirements"] || "Not clearly stated",
    },
    {
      label: "Documentation Requirements",
      value: fields["Documentation Requirements"] || "Not clearly stated",
    },
  ].filter((item) => item.value && item.value !== "Not clearly stated");
}

function findSupportingFiles(value, knowledgeFiles) {
  const tokens = tokenize(value);

  return knowledgeFiles
    .map((file) => {
      const haystack = `${file.name} ${file.category} ${file.summary} ${file.extractedText}`.toLowerCase();
      const score = tokens.reduce((count, token) => (haystack.includes(token) ? count + 1 : count), 0);
      return { file, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}

function tokenize(value) {
  return unique(
    String(value || "")
      .toLowerCase()
      .split(/[^a-z0-9.]+/i)
      .filter((token) => token.length >= 3)
  );
}

function extractPriceSignal(text, category) {
  if (!text) {
    return null;
  }

  const currencyMatch = text.match(/\b(USD|EUR|CNY|RMB)\b|\$/i);
  const numericMatch = text.match(/(?:usd|eur|cny|rmb|\$)\s?(\d+(?:,\d{3})*(?:\.\d+)?)/i);

  if (!numericMatch) {
    return null;
  }

  const unitMatch = text.match(/per\s+(ton|kg|piece|pc|pcs|length|meter|m|foot|ft)/i);

  return {
    currency: currencyMatch?.[1]?.toUpperCase() || (currencyMatch?.[0] === "$" ? "USD" : "USD"),
    amount: Number.parseFloat(numericMatch[1].replace(/,/g, "")),
    unit: unitMatch?.[1] || (category === "Past Quote" ? "line" : "unit"),
  };
}

function extractQuantityDetails(quantityText) {
  const text = String(quantityText || "");
  const numeric = Number.parseFloat(text.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/)?.[0] || "0");
  const unit = text.replace(/^[^a-zA-Z]*-?\d+(?:,\d{3})*(?:\.\d+)?\s*/, "").trim() || "units";
  return {
    value: Number.isFinite(numeric) ? numeric : 0,
    unit,
  };
}

function recalculateQuoteEstimate(quoteEstimate, caseRecord, language) {
  const baseDraft = quoteEstimate || {};
  const existingItems = Array.isArray(baseDraft.lineItems) ? baseDraft.lineItems : [];
  const lineItems = (caseRecord.productItems || []).map((productItem, index) => {
    const existing =
      existingItems.find((item) => item.productId === productItem.productId) ||
      existingItems[index] ||
      {};
    const quantity = extractQuantityDetails(existing.quantityText || productItem.quantity);
    const baseUnitPrice = toNumber(existing.baseUnitPrice);
    const adjustmentAmount = toNumber(existing.adjustmentAmount);
    const unitPrice = roundCurrency(baseUnitPrice + adjustmentAmount);
    const supportingFiles = unique(existing.supportingFiles || []);
    const reviewState = deriveLineReviewState({
      existing,
      quantity,
      unitPrice,
      supportingFiles,
      pricingBasis: existing.pricingBasis || "",
    });

    return {
      lineId: existing.lineId || `line-${index + 1}`,
      productId: productItem.productId || existing.productId || `product-${index + 1}`,
      productLabel: existing.productLabel || productItem.label || `Product ${index + 1}`,
      quantityText: existing.quantityText || productItem.quantity || explain(language, "Not clearly stated"),
      quantityValue: quantity.value,
      quantityUnit: existing.quantityUnit || quantity.unit,
      baseUnitPrice,
      adjustmentAmount,
      unitPrice,
      finalPrice: reviewState.finalPrice,
      lineTotal: roundCurrency(quantity.value * (reviewState.finalPrice ?? unitPrice)),
      pricingBasis: existing.pricingBasis || explain(language, "No uploaded pricing evidence matched this item."),
      supportingFiles,
      reviewFlag: reviewState.reviewFlag,
      reviewReason: reviewState.reviewReason,
      humanReviewed: Boolean(existing.humanReviewed),
    };
  });

  const additionalCharges = normalizeCharges(baseDraft.additionalCharges, language);
  const subtotal = roundCurrency(lineItems.reduce((sum, item) => sum + item.lineTotal, 0));
  const total = roundCurrency(subtotal + additionalCharges.reduce((sum, charge) => sum + charge.amount, 0));
  const flagCounts = countReviewFlags(lineItems);
  const reviewChecklist = buildQuoteReviewChecklist({
    lineItems,
    terms: baseDraft.terms,
    risks: baseDraft.risks,
    language,
  });
  const blendedMarginPct = calculateBlendedMarginPct(lineItems);

  return {
    pricingStatus: baseDraft.pricingStatus || explain(language, "Draft quote ready"),
    currency: normalizeCurrency(baseDraft.currency),
    incoterm: baseDraft.incoterm || explain(language, "Not clearly stated"),
    lineItems,
    additionalCharges,
    subtotal,
    total,
    terms: normalizeTerms(baseDraft.terms, language),
    assumptions: unique(baseDraft.assumptions || []),
    risks: unique(baseDraft.risks || []),
    supportingFiles: unique([
      ...(baseDraft.supportingFiles || []),
      ...lineItems.flatMap((item) => item.supportingFiles || []),
    ]),
    recommendedNextStep: baseDraft.recommendedNextStep || explain(language, "Review the draft quote and confirm commercial assumptions."),
    summary:
      baseDraft.summary ||
      explain(language, "A working draft quote is available and can now be adjusted in the case workspace."),
    decisionRecommendation: baseDraft.decisionRecommendation || null,
    reviewChecklist,
    flagCounts,
    blendedMarginPct,
  };
}

function deriveLineReviewState({ existing, quantity, unitPrice, supportingFiles, pricingBasis }) {
  const explicitFinalPrice = toNullableNumber(existing.finalPrice);
  const reviewFlag = normalizeReviewFlag(existing.reviewFlag) || inferReviewFlag({
    quantity,
    unitPrice,
    supportingFiles,
    pricingBasis,
  });

  return {
    reviewFlag,
    reviewReason: existing.reviewReason || inferReviewReason(reviewFlag, { quantity, unitPrice, supportingFiles, pricingBasis }),
    finalPrice: explicitFinalPrice ?? (reviewFlag === "RED" ? null : unitPrice),
  };
}

function inferReviewFlag({ quantity, unitPrice, supportingFiles, pricingBasis }) {
  const basis = String(pricingBasis || "").toLowerCase();

  if (!unitPrice || /no uploaded pricing evidence|insufficient pricing support|manual pricing required/.test(basis)) {
    return "RED";
  }

  if (!supportingFiles.length) {
    return "RED";
  }

  if (!quantity.value || supportingFiles.length === 1 || /review|confirm|limited|fallback|default/.test(basis)) {
    return "YELLOW";
  }

  return "GREEN";
}

function inferReviewReason(reviewFlag, { quantity, unitPrice, supportingFiles, pricingBasis }) {
  if (reviewFlag === "RED") {
    if (!unitPrice) {
      return "No grounded suggested price is available for this line.";
    }

    if (!supportingFiles.length) {
      return "No supporting pricing evidence is linked to this line.";
    }

    return "The pricing basis is too weak for automatic approval.";
  }

  if (reviewFlag === "YELLOW") {
    if (!quantity.value) {
      return "Quoted quantity still needs confirmation.";
    }

    if (supportingFiles.length <= 1) {
      return "Only partial pricing evidence supports this recommendation.";
    }

    if (/review|confirm|limited|fallback|default/i.test(String(pricingBasis || ""))) {
      return "Pricing uses a fallback or still needs manual confirmation.";
    }

    return "Review this line before approval.";
  }

  return "Grounded evidence and a usable draft price are available.";
}

function normalizeReviewFlag(value) {
  const normalized = String(value || "").trim().toUpperCase();
  return ["GREEN", "YELLOW", "RED"].includes(normalized) ? normalized : "";
}

function countReviewFlags(lineItems) {
  return lineItems.reduce(
    (counts, item) => {
      const key = String(item.reviewFlag || "").toLowerCase();

      if (key === "green" || key === "yellow" || key === "red") {
        counts[key] += 1;
      }

      return counts;
    },
    { green: 0, yellow: 0, red: 0 }
  );
}

function buildQuoteReviewChecklist({ lineItems, terms, risks, language }) {
  const checklist = [];
  const redCount = lineItems.filter((item) => item.reviewFlag === "RED").length;
  const yellowCount = lineItems.filter((item) => item.reviewFlag === "YELLOW").length;
  const leadTime = String(terms?.leadTime || "");
  const paymentTerms = String(terms?.paymentTerms || "");

  if (redCount > 0) {
    checklist.push(
      explain(language, `${redCount} line(s) are RED and require manual pricing before approval.`)
    );
  }

  if (yellowCount > 0) {
    checklist.push(
      explain(language, `${yellowCount} line(s) are YELLOW and should be reviewed before sending.`)
    );
  }

  if (!leadTime || /to be confirmed|待确认/i.test(leadTime)) {
    checklist.push(explain(language, "Lead time is not confirmed. Verify delivery before sending."));
  }

  if (!paymentTerms || /to be confirmed|待确认/i.test(paymentTerms)) {
    checklist.push(explain(language, "Payment terms are not confirmed. Align commercial terms before approval."));
  }

  if ((risks || []).length) {
    checklist.push(explain(language, "Review the listed commercial and technical risks before issuing the quote."));
  }

  if (!checklist.length) {
    checklist.push(explain(language, "Review all line items and confirm pricing is acceptable before sending."));
  }

  return unique(checklist).slice(0, 6);
}

function calculateBlendedMarginPct(lineItems) {
  const pricedLines = lineItems.filter((item) => Number(item.baseUnitPrice) > 0 && Number(item.finalPrice ?? item.unitPrice) > 0);

  if (!pricedLines.length) {
    return 0;
  }

  const baseTotal = pricedLines.reduce((sum, item) => sum + roundCurrency(Number(item.baseUnitPrice || 0) * Number(item.quantityValue || 0)), 0);
  const finalTotal = pricedLines.reduce(
    (sum, item) => sum + roundCurrency(Number(item.finalPrice ?? item.unitPrice ?? 0) * Number(item.quantityValue || 0)),
    0
  );

  if (finalTotal <= 0 || baseTotal <= 0 || finalTotal <= baseTotal) {
    return 0;
  }

  return roundCurrency(((finalTotal - baseTotal) / finalTotal) * 100);
}

function toNullableNumber(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const numeric =
    typeof value === "number"
      ? value
      : Number.parseFloat(String(value).replace(/[^0-9.-]+/g, ""));

  return Number.isFinite(numeric) ? numeric : null;
}

function normalizeCharges(charges, language) {
  const defaults = [
    { chargeId: "charge-freight", label: explain(language, "Freight"), amount: 0 },
    { chargeId: "charge-other", label: explain(language, "Other"), amount: 0 },
  ];

  if (!Array.isArray(charges) || !charges.length) {
    return defaults;
  }

  return charges.map((charge, index) => ({
    chargeId: charge.chargeId || `charge-${index + 1}`,
    label: charge.label || defaults[index]?.label || `Charge ${index + 1}`,
    amount: toNumber(charge.amount),
  }));
}

function normalizeTerms(terms, language) {
  const defaults = defaultQuoteTerms(language);
  return {
    buyerName: terms?.buyerName || defaults.buyerName,
    buyerEmail: terms?.buyerEmail || defaults.buyerEmail,
    ccEmails: terms?.ccEmails || defaults.ccEmails,
    sellerEntity: terms?.sellerEntity || defaults.sellerEntity,
    paymentTerms: terms?.paymentTerms || defaults.paymentTerms,
    validityTerms: terms?.validityTerms || defaults.validityTerms,
    leadTime: terms?.leadTime || defaults.leadTime,
    shippingTerms: terms?.shippingTerms || defaults.shippingTerms,
    quoteNotes: terms?.quoteNotes || defaults.quoteNotes,
  };
}

function defaultQuoteTerms(language) {
  return {
    buyerName: "",
    buyerEmail: "",
    ccEmails: "",
    sellerEntity: language === "zh" ? "贵司销售团队" : "Your Sales Team",
    paymentTerms: language === "zh" ? "待确认" : "To be confirmed",
    validityTerms: language === "zh" ? "30 天" : "30 days",
    leadTime: language === "zh" ? "待确认" : "To be confirmed",
    shippingTerms: language === "zh" ? "待确认" : "To be confirmed",
    quoteNotes: "",
  };
}

function toNumber(value) {
  const numeric =
    typeof value === "number"
      ? value
      : Number.parseFloat(String(value ?? "").replace(/[^0-9.-]+/g, ""));

  return Number.isFinite(numeric) ? numeric : 0;
}

function roundCurrency(value) {
  return Number(toNumber(value).toFixed(2));
}

function normalizeCurrency(currency) {
  const normalized = String(currency || "").trim().toUpperCase();
  return normalized || "USD";
}

function formatMoney(currency, amount) {
  return `${normalizeCurrency(currency)} ${roundCurrency(amount).toFixed(2)}`;
}

async function buildKnowledgeMetadata({ name, type, extractedText, decisionWorkbook, textReadable, language }) {
  if (decisionWorkbook) {
    return {
      category: "Quote Decision Workbook",
      summary:
        language === "zh"
          ? `已识别为报价决策工作簿，包含 ${summarizeDecisionWorkbook(decisionWorkbook)}。`
          : `Detected quote decision workbook with ${summarizeDecisionWorkbook(decisionWorkbook)}.`,
    };
  }

  if (!textReadable || !extractedText) {
    return {
      category: classifyKnowledgeFile(name, ""),
      summary: "Readable document text was insufficient for a grounded summary.",
    };
  }

  if (!shouldUseKnowledgeMetadataModel()) {
    const category = classifyKnowledgeFile(name, extractedText);
    const preview = extractedText.replace(/\s+/g, " ").trim().slice(0, 180);

    return {
      category,
      summary: `${category}: ${preview}${extractedText.length > 180 ? "..." : ""}`,
    };
  }

  try {
    return await generateKnowledgeFileMetadata({
      fileName: name,
      fileType: type,
      extractedText,
      language,
    });
  } catch (error) {
    console.error("OpenAI knowledge file analysis failed, falling back to heuristic metadata:", error);
    const category = classifyKnowledgeFile(name, extractedText);
    const preview = extractedText.replace(/\s+/g, " ").trim().slice(0, 180);

    return {
      category,
      summary: `${category}: ${preview}${extractedText.length > 180 ? "..." : ""}`,
    };
  }
}

function shouldUseKnowledgeMetadataModel() {
  if (String(process.env.VERCEL || "").trim()) {
    return false;
  }

  if (String(process.env.AWS_LAMBDA_FUNCTION_NAME || "").trim()) {
    return false;
  }

  return true;
}

function summarizeDecisionWorkbook(decisionWorkbook) {
  const counts = decisionWorkbook?.counts || {};
  return [
    `${counts.historical_orders || 0} historical orders`,
    `${counts.ongoing_deals || 0} ongoing deals`,
    `${counts.suppliers || 0} suppliers`,
    `${counts.workcenters || 0} workcenters`,
    `${counts.customers || 0} customers`,
  ].join(", ");
}

function mapFields(extractedFields) {
  return Object.fromEntries(extractedFields.map((field) => [field.fieldName, field.value]));
}

function emptyComparison(language) {
  return {
    matchingSupport: [],
    partialSupport: [],
    missingSupport: [
      {
        requirement: explain(language, "Knowledge library"),
        status: "Not Found",
        explanation: explain(language, "No knowledge files have been uploaded yet."),
        supportingFiles: [],
      },
    ],
    suggestedReviewAreas: [explain(language, "Upload certificates, standards, prior quotes, or pricing files before review.")],
    analysisSummary: explain(language, "No knowledge files are currently available for comparison."),
    recommendedStatus: "Under Knowledge Review",
    supportingFilesUsed: [],
  };
}

function emptyQuoteEstimate(caseRecord, language) {
  return recalculateQuoteEstimate(
    {
      pricingStatus: explain(language, "Insufficient pricing evidence"),
      currency: "USD",
      incoterm: explain(language, "Not clearly stated"),
      lineItems: (caseRecord.productItems || []).map((item, index) => {
        const quantity = extractQuantityDetails(item.quantity);
        return {
          lineId: `line-${index + 1}`,
          productId: item.productId || `product-${index + 1}`,
          productLabel: item.label,
          quantityText: item.quantity || explain(language, "Not clearly stated"),
          quantityValue: quantity.value,
          quantityUnit: quantity.unit,
          baseUnitPrice: 0,
          adjustmentAmount: 0,
          unitPrice: 0,
          lineTotal: 0,
          pricingBasis: explain(language, "No uploaded pricing evidence matched this item."),
          supportingFiles: [],
        };
      }),
      additionalCharges: [
        { chargeId: "charge-freight", label: explain(language, "Freight"), amount: 0 },
        { chargeId: "charge-other", label: explain(language, "Other"), amount: 0 },
      ],
      subtotal: 0,
      total: 0,
      terms: defaultQuoteTerms(language),
      assumptions: [explain(language, "Upload pricing sheets or prior quotes to generate a draft quote.")],
      risks: [explain(language, "Current pricing support is insufficient for a grounded quote draft.")],
      supportingFiles: [],
      recommendedNextStep: explain(language, "Upload pricing references and rerun the quote builder."),
      summary: explain(language, "A quote draft could not yet be grounded from the current knowledge library."),
      decisionRecommendation: null,
    },
    caseRecord,
    language
  );
}

function applyDecisionRecommendationToQuoteEstimate({ quoteEstimate, decisionRecommendation, language }) {
  if (!decisionRecommendation) {
    return quoteEstimate;
  }

  const recommendation = decisionRecommendation.recommendation;
  const leadRange = `${recommendation.recommendedLeadTimeDaysLow}-${recommendation.recommendedLeadTimeDaysHigh} ${
    language === "zh" ? "天" : "days"
  }`;

  return {
    ...quoteEstimate,
    pricingStatus: quoteEstimate.pricingStatus || explain(language, "Decision recommendation ready"),
    terms: {
      ...(quoteEstimate.terms || {}),
      leadTime:
        quoteEstimate.terms?.leadTime &&
        !/to be confirmed|待确认/i.test(quoteEstimate.terms.leadTime)
          ? quoteEstimate.terms.leadTime
          : leadRange,
    },
    assumptions: unique([...(quoteEstimate.assumptions || []), ...decisionRecommendation.assumptions]),
    risks: unique([...(quoteEstimate.risks || []), ...recommendation.explanationBullets.slice(1, 4)]),
    supportingFiles: unique([...(quoteEstimate.supportingFiles || []), ...decisionRecommendation.sourceFiles]),
    recommendedNextStep:
      quoteEstimate.recommendedNextStep ||
      explain(language, "Review the decision recommendation and confirm pricing strategy before issue."),
    summary:
      quoteEstimate.summary && !/could not yet be grounded|不足以支撑/.test(quoteEstimate.summary)
        ? `${quoteEstimate.summary} ${decisionRecommendation.summary}`
        : decisionRecommendation.summary,
    decisionRecommendation,
  };
}

function summarizeComparison(grouped, language) {
  return explain(
    language,
    `${grouped.matchingSupport.length} supported, ${grouped.partialSupport.length} partially supported, and ${grouped.missingSupport.length} not supported requirements were identified.`
  );
}

function explain(language, text) {
  if (language !== "zh") {
    return text;
  }

  const map = {
    "Strong support found in uploaded files.": "在已上传文件中找到了较强支持证据。",
    "Some related evidence was found, but manual confirmation is still required.": "找到了部分相关证据，但仍需要人工确认。",
    "No direct support was found in the uploaded knowledge library.": "在已上传知识库中未找到直接支持证据。",
    "Draft quote ready": "草稿报价已生成",
    "Not clearly stated": "未明确说明",
    "Freight": "运费",
    "Other": "其他",
    "Pricing evidence is limited and should be reviewed before sending.": "定价证据有限，发送前需要人工复核。",
    "Commercial assumptions may not fully match the current RFQ scope.": "商业假设可能与当前 RFQ 范围不完全一致。",
    "Review the draft quote and confirm commercial assumptions.": "请复核草稿报价并确认商业假设。",
    "A draft quote was created from uploaded pricing evidence.": "已根据上传的定价证据生成草稿报价。",
    "Knowledge library": "知识库",
    "No knowledge files have been uploaded yet.": "尚未上传任何知识文件。",
    "Upload certificates, standards, prior quotes, or pricing files before review.": "请先上传证书、标准、历史报价或定价文件再进行审核。",
    "No knowledge files are currently available for comparison.": "当前没有可用于比对的知识文件。",
    "Insufficient pricing evidence": "定价证据不足",
    "No uploaded pricing evidence matched this item.": "没有与该产品项匹配的已上传定价证据。",
    "Upload pricing sheets or prior quotes to generate a draft quote.": "请上传定价表或历史报价以生成草稿报价。",
    "Current pricing support is insufficient for a grounded quote draft.": "当前定价支持不足，无法形成可靠的报价草稿。",
    "A quote draft could not yet be grounded from the current knowledge library.": "当前知识库不足以支撑报价草稿。",
    "Upload pricing references and rerun the quote builder.": "请上传定价资料后重新运行报价构建器。",
    "A working draft quote is available and can now be adjusted in the case workspace.": "工作报价草稿已生成，可在案例工作区继续调整。",
    "Decision recommendation ready": "决策建议已生成",
    "Review the decision recommendation and confirm pricing strategy before issue.": "请先复核决策建议并确认定价策略，再正式发出报价。",
  };

  if (text in map) {
    return map[text];
  }

  if (/supported, \d+ partially supported, and \d+ not supported requirements were identified\./.test(text)) {
    const numbers = text.match(/\d+/g) || ["0", "0", "0"];
    return `识别出 ${numbers[0]} 项已支持、${numbers[1]} 项部分支持、${numbers[2]} 项未支持的要求。`;
  }

  return text;
}

function isReadableKnowledgeText(text) {
  const normalized = String(text || "").replace(/\s+/g, " ").trim();

  if (!normalized || normalized.length < 24) {
    return false;
  }

  if (/^%pdf-/i.test(normalized)) {
    return false;
  }

  if (/endobj|xref|obj\s*<<|\/linearized|\/catalog|\/pages|stream/gi.test(normalized)) {
    return false;
  }

  const wordCount = (normalized.match(/[a-z]{3,}/gi) || []).length;
  return wordCount >= 4;
}

function inferType(fileName) {
  return path.extname(fileName).replace(".", "").toUpperCase() || "FILE";
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}
