import path from "node:path";
import { extractTextFromBuffer } from "./file-text-extractor.js";
import { extractPdfTextWithOpenAI, generateCaseAnalysis } from "./openai-client.js";
import { initializeCaseWorkflow } from "./workflow-engine.js";
import { runAgent1, runAgent2, mapPipelineToCaseFields } from "./agent-pipeline.js";

const ALLOWED_CASE_STATUSES = [
  "New",
  "Parsing",
  "Ready for Review",
  "Needs Clarification",
  "Under Knowledge Review",
  "Partially Supported",
  "Ready to Quote",
  "Escalate Internally",
];

export function getAllowedCaseStatuses() {
  return [...ALLOWED_CASE_STATUSES];
}

export async function buildCaseFromSubmission({ files, emailText, language = "en", now = new Date() }) {
  const parsedFiles = await Promise.all(files.map(normalizeUploadedFile));
  const sourceContext = buildSourceContext({ emailText, parsedFiles });
  const llmResult = normalizeAnalysisResult(
    await createAnalysisWithFallback({ emailText, parsedFiles, language })
  );
  const extractedFields = [
    createField("Product Type", llmResult.product_type, inferConfidence(llmResult.product_type), sourceReferenceForField(parsedFiles, "Product Type")),
    createField("Material / Grade", llmResult.material_grade, inferConfidence(llmResult.material_grade), sourceReferenceForField(parsedFiles, "Material / Grade")),
    createField("Dimensions", llmResult.dimensions, inferConfidence(llmResult.dimensions), sourceReferenceForField(parsedFiles, "Dimensions")),
    createField("Outside Dimension", llmResult.outside_dimension, inferConfidence(llmResult.outside_dimension), sourceReferenceForField(parsedFiles, "Outside Dimension")),
    createField("Wall Thickness", llmResult.wall_thickness, inferConfidence(llmResult.wall_thickness), sourceReferenceForField(parsedFiles, "Wall Thickness")),
    createField("Schedule", llmResult.schedule, inferConfidence(llmResult.schedule), sourceReferenceForField(parsedFiles, "Schedule")),
    createField("Length Per Piece", llmResult.length_per_piece, inferConfidence(llmResult.length_per_piece), sourceReferenceForField(parsedFiles, "Length Per Piece")),
    createField("Quantity", llmResult.quantity, inferConfidence(llmResult.quantity), sourceReferenceForField(parsedFiles, "Quantity")),
    createField("Requested Standards", llmResult.requested_standards, inferConfidence(llmResult.requested_standards), sourceReferenceForField(parsedFiles, "Requested Standards")),
    createField("Inspection Requirements", llmResult.inspection_requirements, inferConfidence(llmResult.inspection_requirements), sourceReferenceForField(parsedFiles, "Inspection Requirements")),
    createField("Documentation Requirements", llmResult.documentation_requirements, inferConfidence(llmResult.documentation_requirements), sourceReferenceForField(parsedFiles, "Documentation Requirements")),
    createField("Delivery Request", llmResult.delivery_request, inferConfidence(llmResult.delivery_request), sourceReferenceForField(parsedFiles, "Delivery Request")),
    createField("Destination", llmResult.destination, inferConfidence(llmResult.destination), sourceReferenceForField(parsedFiles, "Destination")),
    createField("Special Notes", llmResult.special_notes, inferConfidence(llmResult.special_notes), "Intake summary"),
  ];
  const productItems = buildProductItems(llmResult);

  const missingInfo = buildDerivedMissingInfo({ llmResult, sourceContext });
  const status = llmResult.current_status || deriveCaseStatus(missingInfo);
  const derivedAiSummary = buildDerivedAiSummary({ llmResult, missingInfo, sourceContext });
  const aiSummary = {
    whatCustomerNeeds: derivedAiSummary.what_customer_needs,
    straightforward: derivedAiSummary.straightforward,
    needsClarification: derivedAiSummary.needs_clarification,
    knowledgeBaseChecks: derivedAiSummary.knowledge_base_checks,
    recommendedNextStep: derivedAiSummary.recommended_next_step,
    mainRisks: derivedAiSummary.main_risks,
    currentStatus: status,
  };
  const suggestedQuestions = buildDerivedSuggestedQuestions({
    llmResult,
    missingInfo,
    sourceContext,
  });
  const timestamp = now.toISOString().slice(0, 10);

  return initializeCaseWorkflow({
    actor: "system",
    now,
    caseRecord: {
    caseId: createCaseId(now),
    title: buildTitle(llmResult.customer_name, llmResult.product_type),
    customerName: llmResult.customer_name || "Unspecified Customer",
    projectName: llmResult.project_name || "Customer RFQ Review",
    owner: "Unassigned",
    status,
    createdAt: timestamp,
    updatedAt: timestamp,
    sourceFiles: parsedFiles.map((file, index) => ({
      fileId: `src-${index + 1}`,
      name: file.name,
      type: file.type,
      sourceReference: file.sourceReference,
      })),
    productItems,
    extractedFields,
    missingInfo,
    aiSummary,
    suggestedQuestions,
    knowledgeComparison: null,
    quoteEstimate: null,
    quoteEmailDraft: null,
    quoteHistory: [],
    workflow: null,
    timeline: [],
    },
  });
}

async function createAnalysisWithFallback({ emailText, parsedFiles, language }) {
  const hasConfiguredOpenAI = Boolean(String(process.env.OPENAI_API_KEY || "").trim());

  if (hasConfiguredOpenAI) {
    // Try Agent 1+2 pipeline first (richer extraction + technical normalization)
    try {
      const agent1Result = await runAgent1({ emailText, files: parsedFiles, language });
      const agent2Result = await runAgent2({ agent1Result, language });
      return mapPipelineToCaseFields(agent1Result, agent2Result);
    } catch (pipelineError) {
      console.error("Agent pipeline (1+2) failed, falling back to standard analysis:", pipelineError);
    }

    // Fall back to single-step generateCaseAnalysis
    try {
      return await generateCaseAnalysis({ emailText, files: parsedFiles, language });
    } catch (error) {
      throw new Error(
        `OpenAI intake parsing failed while AI parsing is enabled: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  console.error("No OpenAI API key configured, using heuristic parsing.");
  return buildHeuristicAnalysis({ emailText, parsedFiles });
}

export function deriveMissingInfo(extractedFields) {
  const read = (fieldName) =>
    extractedFields.find((field) => field.fieldName === fieldName)?.value.toLowerCase() || "";

  const lowConfidenceItems = extractedFields
    .filter((field) => field.confidence !== "high")
    .map((field) => `${field.fieldName}: ${field.value}`);

  const missingFields = [];
  const ambiguousRequirements = [];

  if (!read("Destination") || read("Destination").includes("not clearly stated")) {
    missingFields.push("Destination is not clearly stated.");
  }

  if (!read("Requested Standards").includes("nace")) {
    ambiguousRequirements.push("Exact NACE requirement is not stated.");
  } else {
    ambiguousRequirements.push("Exact NACE standard reference still needs confirmation.");
  }

  if (!read("Inspection Requirements").includes("witness")) {
    ambiguousRequirements.push("Third-party inspection witness requirement is unclear.");
  } else {
    ambiguousRequirements.push("Witness inspection scope requires manual confirmation.");
  }

  if (!read("Delivery Request") || read("Delivery Request").includes("not clearly stated")) {
    missingFields.push("Delivery request is not clearly stated.");
  }

  ambiguousRequirements.push("Partial shipment acceptance is not specified.");

  return { missingFields, ambiguousRequirements, lowConfidenceItems };
}

export function deriveCaseStatus(missingInfo) {
  const missingFields = Array.isArray(missingInfo?.missingFields) ? missingInfo.missingFields : [];
  const ambiguousRequirements = Array.isArray(missingInfo?.ambiguousRequirements)
    ? missingInfo.ambiguousRequirements
    : [];
  const lowConfidenceItems = Array.isArray(missingInfo?.lowConfidenceItems)
    ? missingInfo.lowConfidenceItems
    : [];

  if (missingFields.length > 0 || ambiguousRequirements.length > 0) {
    return "Needs Clarification";
  }

  if (lowConfidenceItems.length > 0) {
    return "Ready for Review";
  }

  return "Ready to Quote";
}

export function normalizeAnalysisResult(result) {
  const normalizedProductItems = normalizeProductItems(
    result?.product_items,
    result?.productItems
  );
  const extractedFieldLookup = buildExtractedFieldLookup(result?.extractedFields);
  const aiSummary = normalizeAiSummary(result?.ai_summary, result?.aiSummary);
  const missingInfo = normalizeMissingInfo(result);

  return {
    customer_name: firstDefinedText(
      result?.customer_name,
      result?.customerName,
      "Unspecified Customer"
    ),
    project_name: firstDefinedText(
      result?.project_name,
      result?.projectName,
      "Customer RFQ Review"
    ),
    product_type: firstDefinedText(
      result?.product_type,
      extractedFieldLookup["Product Type"],
      normalizedProductItems[0]?.product_type
    ),
    material_grade: firstDefinedText(
      result?.material_grade,
      extractedFieldLookup["Material / Grade"],
      normalizedProductItems[0]?.material_grade
    ),
    dimensions: firstDefinedText(
      result?.dimensions,
      extractedFieldLookup.Dimensions,
      normalizedProductItems[0]?.dimensions
    ),
    outside_dimension: firstDefinedText(
      result?.outside_dimension,
      extractedFieldLookup["Outside Dimension"],
      normalizedProductItems[0]?.outside_dimension
    ),
    wall_thickness: firstDefinedText(
      result?.wall_thickness,
      extractedFieldLookup["Wall Thickness"],
      normalizedProductItems[0]?.wall_thickness
    ),
    schedule: firstDefinedText(
      result?.schedule,
      extractedFieldLookup.Schedule,
      normalizedProductItems[0]?.schedule
    ),
    length_per_piece: firstDefinedText(
      result?.length_per_piece,
      extractedFieldLookup["Length Per Piece"],
      normalizedProductItems[0]?.length_per_piece
    ),
    quantity: firstDefinedText(
      result?.quantity,
      extractedFieldLookup.Quantity,
      normalizedProductItems[0]?.quantity
    ),
    requested_standards: firstDefinedText(
      result?.requested_standards,
      extractedFieldLookup["Requested Standards"]
    ),
    inspection_requirements: firstDefinedText(
      result?.inspection_requirements,
      extractedFieldLookup["Inspection Requirements"]
    ),
    documentation_requirements: firstDefinedText(
      result?.documentation_requirements,
      extractedFieldLookup["Documentation Requirements"]
    ),
    delivery_request: firstDefinedText(
      result?.delivery_request,
      extractedFieldLookup["Delivery Request"]
    ),
    destination: firstDefinedText(
      result?.destination,
      extractedFieldLookup.Destination
    ),
    special_notes: firstDefinedText(
      result?.special_notes,
      extractedFieldLookup["Special Notes"],
      ""
    ),
    missing_fields: missingInfo.missingFields,
    ambiguous_requirements: missingInfo.ambiguousRequirements,
    low_confidence_items: missingInfo.lowConfidenceItems,
    suggested_questions: normalizeStringArray(result?.suggested_questions, result?.suggestedQuestions),
    product_items: normalizedProductItems,
    ai_summary: aiSummary,
    current_status: firstDefinedText(
      result?.current_status,
      result?.status,
      deriveCaseStatus(missingInfo)
    ),
  };
}

function createField(fieldName, value, confidence, sourceReference) {
  return {
    fieldName,
    value,
    confidence,
    confidenceLabel: confidence === "high" ? "Ready for Review" : confidence === "medium" ? "Needs Clarification" : "Escalate Internally",
    sourceReference,
    isUserEdited: false,
    notes: confidence === "high" ? "" : "Requires manual review.",
  };
}

function buildProductItems(llmResult) {
  if (Array.isArray(llmResult.product_items) && llmResult.product_items.length) {
    return llmResult.product_items.map((item, index) => ({
      productId: `product-${index + 1}`,
      label: item.label || `Product ${index + 1}`,
      productType: item.product_type,
      materialGrade: item.material_grade,
      dimensions: item.dimensions,
      outsideDimension: item.outside_dimension,
      wallThickness: item.wall_thickness,
      schedule: item.schedule,
      lengthPerPiece: item.length_per_piece,
      quantity: item.quantity,
    }));
  }

  return [
    {
      productId: "product-1",
      label: "Product 1",
      productType: llmResult.product_type,
      materialGrade: llmResult.material_grade,
      dimensions: llmResult.dimensions,
      outsideDimension: llmResult.outside_dimension,
      wallThickness: llmResult.wall_thickness,
      schedule: llmResult.schedule,
      lengthPerPiece: llmResult.length_per_piece,
      quantity: llmResult.quantity,
    },
  ];
}

function inferConfidence(value) {
  if (!value || value === "Not clearly stated") {
    return "low";
  }

  return value.length < 6 ? "medium" : "high";
}

function sourceReferenceForField(parsedFiles) {
  return parsedFiles[0]?.sourceReference || "Parsed intake text";
}

function normalizeMissingInfo(result) {
  return {
    missingFields: normalizeStringArray(
      result?.missing_fields,
      result?.missingInfo?.missingFields
    ),
    ambiguousRequirements: normalizeStringArray(
      result?.ambiguous_requirements,
      result?.missingInfo?.ambiguousRequirements
    ),
    lowConfidenceItems: normalizeStringArray(
      result?.low_confidence_items,
      result?.missingInfo?.lowConfidenceItems
    ),
  };
}

function normalizeAiSummary(snakeCaseSummary, camelCaseSummary) {
  return {
    what_customer_needs: firstDefinedText(
      snakeCaseSummary?.what_customer_needs,
      camelCaseSummary?.whatCustomerNeeds
    ),
    straightforward: firstDefinedText(
      snakeCaseSummary?.straightforward,
      camelCaseSummary?.straightforward
    ),
    needs_clarification: firstDefinedText(
      snakeCaseSummary?.needs_clarification,
      camelCaseSummary?.needsClarification
    ),
    knowledge_base_checks: firstDefinedText(
      snakeCaseSummary?.knowledge_base_checks,
      camelCaseSummary?.knowledgeBaseChecks
    ),
    recommended_next_step: firstDefinedText(
      snakeCaseSummary?.recommended_next_step,
      camelCaseSummary?.recommendedNextStep
    ),
    main_risks: normalizeStringArray(
      snakeCaseSummary?.main_risks,
      camelCaseSummary?.mainRisks
    ),
  };
}

function normalizeProductItems(snakeCaseItems, camelCaseItems) {
  if (Array.isArray(snakeCaseItems) && snakeCaseItems.length) {
    return snakeCaseItems.map((item, index) => ({
      label: firstDefinedText(item?.label, `Product ${index + 1}`),
      product_type: firstDefinedText(item?.product_type),
      material_grade: firstDefinedText(item?.material_grade),
      dimensions: firstDefinedText(item?.dimensions),
      outside_dimension: firstDefinedText(item?.outside_dimension),
      wall_thickness: firstDefinedText(item?.wall_thickness),
      schedule: firstDefinedText(item?.schedule),
      length_per_piece: firstDefinedText(item?.length_per_piece),
      quantity: firstDefinedText(item?.quantity),
    }));
  }

  if (Array.isArray(camelCaseItems) && camelCaseItems.length) {
    return camelCaseItems.map((item, index) => ({
      label: firstDefinedText(item?.label, `Product ${index + 1}`),
      product_type: firstDefinedText(item?.productType),
      material_grade: firstDefinedText(item?.materialGrade),
      dimensions: firstDefinedText(item?.dimensions),
      outside_dimension: firstDefinedText(item?.outsideDimension),
      wall_thickness: firstDefinedText(item?.wallThickness),
      schedule: firstDefinedText(item?.schedule),
      length_per_piece: firstDefinedText(item?.lengthPerPiece),
      quantity: firstDefinedText(item?.quantity),
    }));
  }

  return [];
}

function buildExtractedFieldLookup(extractedFields) {
  if (!Array.isArray(extractedFields)) {
    return {};
  }

  return extractedFields.reduce((lookup, field) => {
    if (field?.fieldName) {
      lookup[field.fieldName] = firstDefinedText(field.value);
    }

    return lookup;
  }, {});
}

function normalizeStringArray(...candidates) {
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate
        .map((value) => (typeof value === "string" ? value.trim() : String(value || "").trim()))
        .filter(Boolean);
    }
  }

  return [];
}

function firstDefinedText(...candidates) {
  for (const candidate of candidates) {
    if (typeof candidate === "string") {
      const trimmed = candidate.trim();
      if (trimmed) {
        return trimmed;
      }
    }
  }

  return "Not clearly stated";
}

async function normalizeUploadedFile(file) {
  const name = file.name || "uploaded-file";
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
      });
    } catch (error) {
      console.error("OpenAI PDF OCR fallback failed during intake:", error);
    }
  }

  if (type === "PDF" && !extractedText.trim()) {
    throw new Error("cannot parse PDF");
  }

  return {
    name,
    type,
    extractedText,
    sourceReference: extractedText ? `${name} extracted text` : `${name} metadata only`,
  };
}

function extractCustomerName(emailText) {
  const match = emailText.match(/customer[:\-]\s*(.+)/i);
  return match?.[1]?.trim() || "";
}

function detectProductType(text) {
  if (text.includes("seamless pipe")) {
    return detected("Seamless Pipe");
  }

  if (text.includes("pipe")) {
    return detected("Pipe", "medium");
  }

  return unknown();
}

function detectMaterial(text) {
  const astmGradeMatch = text.match(/\b(astm\s+a\d+\s+tp\s*\d+[a-z]*)\b/i);
  if (astmGradeMatch) {
    return detected(astmGradeMatch[1].replace(/\s+/g, " ").toUpperCase());
  }

  if (text.includes("a312 tp316l") || text.includes("316l")) {
    return detected("ASTM A312 TP316L");
  }

  if (text.includes("304l")) {
    return detected("ASTM A312 TP304L");
  }

  return unknown();
}

function detectDimensions(text) {
  const match = text.match(/(\d+(\.\d+)?\s?(in|inch|”|")\s*sch\s*\d+\s*,?\s*\d+\s?m)/i);
  return match ? detected(match[1], "medium") : unknown();
}

function detectOutsideDimension(text) {
  const match = text.match(/(\d+(\.\d+)?\s?(in|inch|”|"))/i);
  return match ? detected(match[1], "medium") : unknown();
}

function detectWallThickness(text) {
  const match = text.match(/(\d+(\.\d+)?\s?(mm|in|inch)\s*(wt|wall thickness))/i);
  return match ? detected(match[1], "medium") : unknown();
}

function detectSchedule(text) {
  const match = text.match(/(sch\s*\d+)/i);
  return match ? detected(match[1].toUpperCase(), "medium") : unknown();
}

function detectLengthPerPiece(text) {
  const match = text.match(/(\d+(\.\d+)?\s?(m|meter|meters|ft|feet)\s*(each|per piece)?)/i);
  return match ? detected(match[1], "medium") : unknown();
}

function detectQuantity(text) {
  const match = text.match(/(\d[\d,]*\s*(meters|meter|pcs|pieces|tons))/i);
  return match ? detected(match[1], "medium") : unknown();
}

function detectRequestedStandards(text) {
  const values = [];

  const astmMatch = text.match(/\b(astm\s+a\d+)\b/i);
  if (astmMatch) {
    values.push(astmMatch[1].replace(/\s+/g, " ").toUpperCase());
  }

  if (text.includes("en 10204 3.1")) {
    values.push("EN 10204 3.1");
  }

  if (text.includes("nace")) {
    values.push("NACE");
  }

  return values.length ? detected(values.join(", "), values.length > 1 ? "medium" : "medium") : unknown();
}

function detectInspectionRequirements(text) {
  const values = [];

  if (text.includes("pmi")) {
    values.push("PMI");
  }

  if (text.includes("hydrotest")) {
    values.push("Hydrotest");
  }

  if (text.includes("witness")) {
    values.push("Witness Inspection");
  }

  return values.length ? detected(values.join(", "), "medium") : unknown();
}

function detectDocumentationRequirements(text) {
  if (text.includes("en 10204 3.1")) {
    return detected("EN 10204 3.1");
  }

  return unknown();
}

function detectDeliveryRequest(text) {
  const match = text.match(/(\d+\s*(weeks|week|days|day))/i);
  return match ? detected(match[1], "medium") : unknown();
}

function detectDestination(text) {
  const match = text.match(/(?:destination|deliver(?:y|ed)?\s+to|ship(?:ped)?\s+to)\s*[:\-]?\s*([a-z][a-z\s,-]{2,40})/i);
  if (match) {
    return detected(match[1].trim().replace(/\.$/, ""), "medium");
  }

  if (text.includes("singapore")) {
    return detected("Singapore");
  }

  return unknown();
}

function extractSpecialNotes(emailText) {
  if (emailText.trim()) {
    return {
      value: emailText.trim().slice(0, 200),
      confidence: "medium",
      sourceReference: "Pasted email text",
    };
  }

  return unknown();
}

function buildAiSummary(extractedFields, missingInfo) {
  return {
    whatCustomerNeeds: summarizeField(extractedFields, "Product Type", "Customer product need is not yet clear."),
    straightforward: summarizeField(extractedFields, "Material / Grade", "No clear straightforward item detected yet."),
    needsClarification:
      missingInfo.ambiguousRequirements[0] || missingInfo.missingFields[0] || "Manual clarification still required.",
    knowledgeBaseChecks:
      "Check capability files, prior quote records, and compliance certificates against the extracted requirements.",
    recommendedNextStep:
      "Review the parsed case table, confirm unclear fields, and then move the case into knowledge review.",
    mainRisks: [
      ...missingInfo.missingFields,
      ...missingInfo.ambiguousRequirements,
    ].slice(0, 3),
    currentStatus: deriveCaseStatus(missingInfo),
  };
}

function buildSuggestedQuestions(missingInfo) {
  const questions = [];

  if (missingInfo.ambiguousRequirements.some((item) => item.toLowerCase().includes("nace"))) {
    questions.push("Please confirm whether NACE compliance is required and to which exact standard.");
  }

  if (
    missingInfo.ambiguousRequirements.some((item) => item.toLowerCase().includes("witness"))
  ) {
    questions.push("Please confirm whether third-party witness inspection is required.");
  }

  if (missingInfo.missingFields.some((item) => item.toLowerCase().includes("destination"))) {
    questions.push("Please confirm the final delivery destination.");
  }

  if (missingInfo.missingFields.some((item) => item.toLowerCase().includes("delivery"))) {
    questions.push("Please confirm the requested delivery timing.");
  }

  questions.push("Please confirm whether partial shipment is acceptable.");

  return questions.slice(0, 8);
}

function buildSourceContext({ emailText, parsedFiles }) {
  const sourceText = [emailText, ...parsedFiles.map((file) => file.extractedText)]
    .filter(Boolean)
    .join("\n");

  return {
    sourceText,
    normalizedText: sourceText.toLowerCase(),
  };
}

function buildDerivedMissingInfo({ llmResult, sourceContext }) {
  const missingFields = [];
  const ambiguousRequirements = [];
  const lowConfidenceItems = [];
  const productItems = Array.isArray(llmResult.product_items) ? llmResult.product_items : [];
  const primaryItem = productItems[0] || {};

  addUnique(missingFields, !hasMeaningfulValue(llmResult.product_type), "Product type is not clearly stated.");
  addUnique(missingFields, !hasMeaningfulValue(llmResult.material_grade), "Material grade is not clearly stated.");
  addUnique(missingFields, !hasMeaningfulValue(llmResult.quantity), "Quantity is not clearly stated.");
  addUnique(missingFields, !hasMeaningfulValue(llmResult.destination), "Destination is not clearly stated.");
  addUnique(missingFields, !hasMeaningfulValue(llmResult.delivery_request), "Requested delivery timing is not clearly stated.");

  addUnique(
    ambiguousRequirements,
    mentionsTerm(sourceContext.normalizedText, "nace") && !/(mr0175|mr0103|iso\s*15156)/i.test(sourceContext.sourceText),
    "Exact NACE standard reference still needs confirmation."
  );
  addUnique(
    ambiguousRequirements,
    mentionsTerm(sourceContext.normalizedText, "witness") && !/(third[- ]party|tpi|inspection agency|surveyor)/i.test(sourceContext.sourceText),
    "Witness inspection scope and responsible party still need confirmation."
  );
  addUnique(
    ambiguousRequirements,
    mentionsTerm(sourceContext.normalizedText, "pmi") && productItems.length > 1,
    "Please confirm whether PMI applies to all line items or selected products only."
  );
  addUnique(
    ambiguousRequirements,
    mentionsTerm(sourceContext.normalizedText, "hydro") && productItems.length > 1,
    "Please confirm whether hydrotest is required for all line items or selected products only."
  );

  addUnique(
    lowConfidenceItems,
    productItems.some((item) => !hasMeaningfulValue(item.outside_dimension || item.dimensions)),
    "At least one product is missing a confirmed outside dimension."
  );
  addUnique(
    lowConfidenceItems,
    productItems.some((item) => !hasMeaningfulValue(item.wall_thickness) && !hasMeaningfulValue(item.schedule)),
    "At least one product is missing a confirmed wall thickness or schedule."
  );
  addUnique(
    lowConfidenceItems,
    hasMeaningfulValue(primaryItem.quantity) && !/\b(meters?|pcs?|pieces?|tons?|kg|sets?|lots?)\b/i.test(primaryItem.quantity),
    `Quantity unit may be ambiguous: ${cleanValue(primaryItem.quantity)}`
  );

  return {
    missingFields: dedupeStrings(missingFields),
    ambiguousRequirements: dedupeStrings(ambiguousRequirements),
    lowConfidenceItems: dedupeStrings(lowConfidenceItems),
  };
}

function buildDerivedAiSummary({ llmResult, missingInfo, sourceContext }) {
  const productSummary = summarizeRequestedProducts(llmResult.product_items);
  const requirementSummary = summarizeRequirements(llmResult);
  const blockerSummary = [...missingInfo.missingFields, ...missingInfo.ambiguousRequirements].slice(0, 2);
  const risks = buildMainRisks({ llmResult, missingInfo, sourceContext });

  return {
    what_customer_needs:
      productSummary && requirementSummary
        ? `${productSummary}. ${requirementSummary}.`
        : productSummary || requirementSummary || llmResult.ai_summary.what_customer_needs,
    straightforward:
      missingInfo.missingFields.length || missingInfo.ambiguousRequirements.length
        ? "Core product requirements are partially extracted, but commercial quoting is still blocked by unresolved technical or compliance details."
        : "Core product, delivery, and compliance requirements are sufficiently defined for pricing review.",
    needs_clarification:
      blockerSummary.length
        ? blockerSummary.join(" ")
        : llmResult.ai_summary.needs_clarification || "No major clarification blockers identified from the current RFQ text.",
    knowledge_base_checks: buildKnowledgeCheckSummary(llmResult),
    recommended_next_step:
      blockerSummary.length
        ? "Send the clarification questions to the customer, then confirm supplier and compliance support before pricing."
        : "Validate supplier capability against the extracted specifications and move into pricing review.",
    main_risks: risks.length ? risks : llmResult.ai_summary.main_risks,
  };
}

function buildDerivedSuggestedQuestions({ llmResult, missingInfo, sourceContext }) {
  const questions = [];

  addUnique(
    questions,
    missingInfo.missingFields.some((item) => item.toLowerCase().includes("destination")),
    "Please confirm the final delivery destination and consignee location."
  );
  addUnique(
    questions,
    missingInfo.missingFields.some((item) => item.toLowerCase().includes("delivery")),
    "Please confirm the required delivery date or maximum acceptable lead time."
  );
  addUnique(
    questions,
    missingInfo.missingFields.some((item) => item.toLowerCase().includes("material")),
    "Please confirm the required material grade for the quoted item."
  );
  addUnique(
    questions,
    missingInfo.ambiguousRequirements.some((item) => item.toLowerCase().includes("nace")),
    "Please confirm whether NACE is required and specify the exact standard, such as MR0175 or ISO 15156."
  );
  addUnique(
    questions,
    missingInfo.ambiguousRequirements.some((item) => item.toLowerCase().includes("witness")),
    "Please confirm whether witness inspection is required, who will witness it, and what scope should be covered."
  );
  addUnique(
    questions,
    missingInfo.ambiguousRequirements.some((item) => item.toLowerCase().includes("pmi")),
    "Please confirm whether PMI applies to all items or only selected line items."
  );
  addUnique(
    questions,
    missingInfo.ambiguousRequirements.some((item) => item.toLowerCase().includes("hydrotest")),
    "Please confirm whether hydrotest is required for all items or only selected line items."
  );
  addUnique(
    questions,
    !hasMeaningfulValue(llmResult.documentation_requirements) && /en\s*10204|3\.1|3\.2|mill test certificate|mtc/i.test(sourceContext.sourceText),
    "Please confirm the exact document package required with the shipment, including whether EN 10204 3.1 or 3.2 certification is needed."
  );

  return dedupeStrings(questions).slice(0, 8);
}

function summarizeRequestedProducts(productItems) {
  if (!Array.isArray(productItems) || !productItems.length) {
    return "";
  }

  const parts = productItems.slice(0, 2).map((item) => {
    const descriptors = [
      cleanValue(item.product_type),
      cleanValue(item.material_grade),
      cleanValue(item.outside_dimension || item.dimensions),
      cleanValue(item.wall_thickness || item.schedule),
      cleanValue(item.length_per_piece),
      cleanValue(item.quantity),
    ].filter(Boolean);

    return descriptors.join(", ");
  });

  const prefix = productItems.length > 1 ? "Customer is requesting multiple items including" : "Customer is requesting";
  return `${prefix} ${parts.join(" and ")}`;
}

function summarizeRequirements(llmResult) {
  const parts = [
    hasMeaningfulValue(llmResult.destination) ? `delivery to ${cleanValue(llmResult.destination)}` : "",
    hasMeaningfulValue(llmResult.delivery_request) ? `requested lead time ${cleanValue(llmResult.delivery_request)}` : "",
    hasMeaningfulValue(llmResult.documentation_requirements) ? `documents ${cleanValue(llmResult.documentation_requirements)}` : "",
    hasMeaningfulValue(llmResult.inspection_requirements) ? `inspection/testing ${cleanValue(llmResult.inspection_requirements)}` : "",
    hasMeaningfulValue(llmResult.requested_standards) ? `standards ${cleanValue(llmResult.requested_standards)}` : "",
  ].filter(Boolean);

  return parts.length ? `Key requirements include ${parts.join(", ")}` : "";
}

function buildKnowledgeCheckSummary(llmResult) {
  const checks = [];

  if (hasMeaningfulValue(llmResult.material_grade)) {
    checks.push(`supplier capability for ${cleanValue(llmResult.material_grade)}`);
  }

  if (hasMeaningfulValue(llmResult.requested_standards)) {
    checks.push(`compliance evidence for ${cleanValue(llmResult.requested_standards)}`);
  }

  if (hasMeaningfulValue(llmResult.documentation_requirements)) {
    checks.push(`document package support for ${cleanValue(llmResult.documentation_requirements)}`);
  }

  if (hasMeaningfulValue(llmResult.inspection_requirements)) {
    checks.push(`inspection support for ${cleanValue(llmResult.inspection_requirements)}`);
  }

  return checks.length
    ? `Check ${checks.join(", ")} in the knowledge base and prior quote history.`
    : "Check capability files, prior quote records, and compliance certificates against the extracted requirements.";
}

function buildMainRisks({ llmResult, missingInfo, sourceContext }) {
  const risks = [
    ...missingInfo.missingFields,
    ...missingInfo.ambiguousRequirements,
  ];

  addUnique(
    risks,
    hasMeaningfulValue(llmResult.delivery_request) && /(\b[1-3]\s*(day|days|week|weeks)\b)/i.test(llmResult.delivery_request),
    `Requested delivery timing may be aggressive: ${cleanValue(llmResult.delivery_request)}.`
  );
  addUnique(
    risks,
    hasMeaningfulValue(llmResult.documentation_requirements) || /en\s*10204|3\.1|3\.2|mtc/i.test(sourceContext.sourceText),
    "Documentation requirements must align with supplier certificates before quoting."
  );
  addUnique(
    risks,
    hasMeaningfulValue(llmResult.inspection_requirements),
    `Inspection requirements may affect cost and lead time: ${cleanValue(llmResult.inspection_requirements)}.`
  );

  return dedupeStrings(risks).slice(0, 5);
}

function hasMeaningfulValue(value) {
  return Boolean(cleanValue(value));
}

function cleanValue(value) {
  if (typeof value !== "string") {
    return "";
  }

  const trimmed = value.trim();
  if (!trimmed || /^not clearly stated$/i.test(trimmed)) {
    return "";
  }

  return trimmed;
}

function mentionsTerm(text, term) {
  return text.includes(term);
}

function addUnique(items, condition, value) {
  if (condition && value) {
    items.push(value);
  }
}

function dedupeStrings(items) {
  const seen = new Set();
  const deduped = [];

  for (const item of items) {
    const normalized = String(item || "").trim();

    if (!normalized) {
      continue;
    }

    const key = normalized.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(normalized);
    }
  }

  return deduped;
}

function detected(value, confidence = "high") {
  return {
    value,
    confidence,
    sourceReference: "Parsed from uploaded intake",
  };
}

function unknown() {
  return {
    value: "Not clearly stated",
    confidence: "low",
    sourceReference: "No clear evidence found in uploaded intake",
  };
}

function buildHeuristicAnalysis({ emailText, parsedFiles }) {
  const combinedText = [emailText, ...parsedFiles.map((file) => file.extractedText)]
    .filter(Boolean)
    .join("\n")
    .toLowerCase();

  const customerName = extractCustomerName(emailText) || "Unspecified Customer";
  const productType = detectProductType(combinedText);
  const material = detectMaterial(combinedText);
  const dimensions = detectDimensions(combinedText);
  const outsideDimension = detectOutsideDimension(combinedText);
  const wallThickness = detectWallThickness(combinedText);
  const schedule = detectSchedule(combinedText);
  const lengthPerPiece = detectLengthPerPiece(combinedText);
  const quantity = detectQuantity(combinedText);
  const requestedStandards = detectRequestedStandards(combinedText);
  const inspectionRequirements = detectInspectionRequirements(combinedText);
  const documentationRequirements = detectDocumentationRequirements(combinedText);
  const deliveryRequest = detectDeliveryRequest(combinedText);
  const destination = detectDestination(combinedText);
  const specialNotes = extractSpecialNotes(emailText);
  const heuristicFields = [
    createField("Product Type", productType.value, productType.confidence, productType.sourceReference),
    createField("Material / Grade", material.value, material.confidence, material.sourceReference),
    createField("Dimensions", dimensions.value, dimensions.confidence, dimensions.sourceReference),
    createField("Quantity", quantity.value, quantity.confidence, quantity.sourceReference),
    createField("Requested Standards", requestedStandards.value, requestedStandards.confidence, requestedStandards.sourceReference),
    createField("Inspection Requirements", inspectionRequirements.value, inspectionRequirements.confidence, inspectionRequirements.sourceReference),
    createField("Documentation Requirements", documentationRequirements.value, documentationRequirements.confidence, documentationRequirements.sourceReference),
    createField("Delivery Request", deliveryRequest.value, deliveryRequest.confidence, deliveryRequest.sourceReference),
    createField("Destination", destination.value, destination.confidence, destination.sourceReference),
    createField("Special Notes", specialNotes.value, specialNotes.confidence, specialNotes.sourceReference),
  ];
  const missingInfo = deriveMissingInfo(heuristicFields);

  return {
    customer_name: customerName,
    project_name:
      destination.value !== "Not clearly stated" ? `${destination.value} RFQ Review` : "Customer RFQ Review",
    product_items: [
      {
        label: "Product 1",
        product_type: productType.value,
        material_grade: material.value,
        dimensions: dimensions.value,
        outside_dimension: outsideDimension.value,
        wall_thickness: wallThickness.value,
        schedule: schedule.value,
        length_per_piece: lengthPerPiece.value,
        quantity: quantity.value,
      },
    ],
    product_type: productType.value,
    material_grade: material.value,
    dimensions: dimensions.value,
    outside_dimension: outsideDimension.value,
    wall_thickness: wallThickness.value,
    schedule: schedule.value,
    length_per_piece: lengthPerPiece.value,
    quantity: quantity.value,
    requested_standards: requestedStandards.value,
    inspection_requirements: inspectionRequirements.value,
    documentation_requirements: documentationRequirements.value,
    delivery_request: deliveryRequest.value,
    destination: destination.value,
    special_notes: specialNotes.value,
    missing_fields: missingInfo.missingFields,
    ambiguous_requirements: missingInfo.ambiguousRequirements,
    low_confidence_items: missingInfo.lowConfidenceItems,
    suggested_questions: buildSuggestedQuestions(missingInfo),
    ai_summary: {
      what_customer_needs: summarizeField(heuristicFields, "Product Type", "Customer product need is not yet clear."),
      straightforward: summarizeField(heuristicFields, "Material / Grade", "No clear straightforward item detected yet."),
      needs_clarification:
        missingInfo.ambiguousRequirements[0] || missingInfo.missingFields[0] || "Manual clarification still required.",
      knowledge_base_checks:
        "Check capability files, prior quote records, and compliance certificates against the extracted requirements.",
      recommended_next_step:
        "Review the parsed case table, confirm unclear fields, and then move the case into knowledge review.",
      main_risks: [...missingInfo.missingFields, ...missingInfo.ambiguousRequirements].slice(0, 3),
    },
    current_status: deriveCaseStatus(missingInfo),
  };
}

function summarizeField(fields, fieldName, fallback) {
  return fields.find((field) => field.fieldName === fieldName)?.value || fallback;
}

function inferType(fileName) {
  return path.extname(fileName).replace(".", "").toUpperCase() || "FILE";
}

function createCaseId(now) {
  const stamp = now.toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  return `QC-${stamp}`;
}

function buildTitle(customerName, productType) {
  return `${customerName} ${productType}`.trim();
}
