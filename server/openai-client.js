const MODEL = "gpt-5.2";
const PDF_OCR_MODEL = "gpt-5";
const API_URL = "https://api.openai.com/v1/responses";

export async function generateCaseAnalysis({ emailText, files, language = "en" }) {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is missing from the environment.");
  }

  const sourceText = buildSourceText({ emailText, files });
  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      instructions:
        [
          "You are an enterprise quoting assistant for manufacturers.",
          "Your job is to read RFQ emails and attached documents like a senior inside sales engineer and produce a precise intake record.",
          "Extract only what is explicitly supported by the intake text.",
          "Return precise, clean-cut product specification fields.",
          "When the RFQ contains multiple distinct products, grades, sizes, or quantities, split them into separate product_items entries.",
          "Each product_items entry must represent one distinct quotable line item.",
          "Read the full intake package before deciding how many product_items exist.",
          "Treat attachments as primary evidence, not just the pasted email.",
          "Separate technical requirements, inspection requirements, documentation requirements, delivery requirements, and commercial notes cleanly.",
          "For pipe and tube RFQs, pay special attention to OD, wall thickness, schedule, length per piece, quantity unit, and governing material standard.",
          "For plate, bar, fittings, flange, and fastener RFQs, still isolate the exact quotable product form, grade, dimensions, and quantity.",
          "When multiple rows are present in a document, preserve them as distinct line items instead of compressing them into a narrative summary.",
          "Use the strongest explicit wording from the source instead of paraphrasing away critical standards or grades.",
          "Do not merge multiple concepts into one field.",
          "Do not include commentary, hedging, or explanations inside extracted value fields.",
          "If a field is missing or not explicit, return exactly 'Not clearly stated'.",
          "Keep values normalized, concise, and usable in a quote case table.",
          "Separate missing information, ambiguous requirements, and low-confidence items clearly.",
          "Never overclaim compliance, capability, or customer requirements.",
          language === "zh"
            ? "Return missing_fields, ambiguous_requirements, low_confidence_items, suggested_questions, and ai_summary in Simplified Chinese. Keep technical grades, standards, and exact source specifications faithful to the intake when possible."
            : "Return narrative fields in English.",
          "Return valid JSON matching the schema exactly.",
        ].join(" "),
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: [
                "Analyze this RFQ intake and return structured quote case data.",
                "",
                "Work in this order:",
                "1. Read all provided email and file text.",
                "2. Identify the customer and project context.",
                "3. Identify every distinct quotable product row or item.",
                "4. Extract clean fields for each product item.",
                "5. Extract shared case-level standards, inspection, documentation, delivery, destination, and notes.",
                "6. List missing blockers, ambiguous requirements, low-confidence items, and suggested clarification questions.",
                "",
                "Extraction rules by field:",
                "- customer_name: exact customer or buying entity only.",
                "- project_name: exact project/job name only. If absent, use 'Customer RFQ Review'.",
                "- product_items: required array. Create one item per distinct product / grade / dimension / quantity combination that would reasonably need its own quote line.",
                "- If the request contains pipe and tube, or multiple grades, or multiple quantity rows, split them into separate product_items entries instead of merging them.",
                "- product_items.label: short label such as 'Product 1', '316L Pipe', or '304L Tube'.",
                "- product_type: product family only, such as 'Seamless Pipe', 'Plate', or 'Tube'. No grade, dimensions, or standards.",
                "- material_grade: exact material/grade/spec only, such as 'ASTM A312 TP316L'. No dimensions or documents.",
                "- dimensions: compact overall size/specification summary only.",
                "- outside_dimension: outside diameter / OD / outer dimension only.",
                "- wall_thickness: wall thickness only. Do not include OD or length.",
                "- schedule: schedule or pipe class only, such as SCH40.",
                "- length_per_piece: exact piece length only.",
                "- quantity: requested commercial quantity only, with unit if provided.",
                "- requested_standards: standards/specification references only.",
                "- inspection_requirements: inspection/testing requirements only.",
                "- documentation_requirements: certificates, reports, MTC/MTR, compliance paperwork only.",
                "- delivery_request: requested timing, shipment timing, or lead time only.",
                "- destination: delivery destination/location only.",
                "- special_notes: residual special commercial or technical notes not already captured elsewhere.",
                "",
                "Normalization rules:",
                "- Keep each field short and exact.",
                "- Remove duplicated wording.",
                "- Do not repeat the field name inside the value.",
                "- Do not place multiple unrelated categories in one field.",
                "- Preserve exact standards and grades when stated.",
                "- Use comma-separated values only when multiple values belong to the same field category.",
                "",
                "Quality rules:",
                "- If the intake only implies something but does not clearly state it, put it in ambiguous_requirements instead of the field value.",
                "- Put missing required information in missing_fields.",
                "- Put uncertain extractions in low_confidence_items.",
                "- If the request includes tables or line-by-line item lists, preserve their row-level separation in product_items.",
                "- If standards or grades differ by line item, keep those values on the correct item.",
                "- If quantity is given in lengths, pieces, tons, kg, meters, or feet, preserve the commercial unit exactly.",
                "- If documentation requests include EN 10204, MTC/MTR, certificate of compliance, PMI reports, hydrotest reports, ITP, or witness inspection, separate them into the correct requirement buckets.",
                "- suggested_questions must focus on blockers to quoting.",
                "- ai_summary must be concise and enterprise-style.",
                "",
                sourceText,
              ].join("\n"),
            },
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "quote_case_analysis",
          strict: true,
          schema: RESPONSE_SCHEMA,
        },
      },
    }),
  });

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error?.message || "OpenAI request failed.");
  }

  const outputText = payload.output_text || extractOutputText(payload);

  if (!outputText) {
    throw new Error("OpenAI response did not include structured output text.");
  }

  return normalizeCaseAnalysis(JSON.parse(outputText));
}

export async function extractPdfTextWithOpenAI({ fileName, buffer, language = "en" }) {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is missing from the environment.");
  }

  const base64Data = Buffer.from(buffer).toString("base64");
  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: PDF_OCR_MODEL,
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_file",
              filename: fileName || "upload.pdf",
              file_data: `data:application/pdf;base64,${base64Data}`,
            },
            {
              type: "input_text",
              text:
                language === "zh"
                  ? [
                      "请读取这个 PDF，并提取其中所有与报价相关的可读文本。",
                      "保留表格、行项目、规格、数量、标准、检验要求、证书要求、交付要求和备注。",
                      "仅返回提取出的文本，不要解释。",
                      "如果这个 PDF 基本无法读取，请只返回 CANNOT_PARSE_PDF。",
                    ].join("\n")
                  : [
                      "Read this PDF and extract the readable text relevant to quoting.",
                      "Preserve tables, line items, specifications, quantities, standards, inspection requirements, document requirements, delivery requirements, and notes.",
                      "Return only the extracted text with no explanation.",
                      "If this PDF is effectively unreadable, return exactly CANNOT_PARSE_PDF.",
                    ].join("\n"),
            },
          ],
        },
      ],
    }),
  });

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error?.message || "OpenAI PDF OCR request failed.");
  }

  const outputText = (payload.output_text || extractOutputText(payload) || "").trim();

  if (!outputText || outputText === "CANNOT_PARSE_PDF") {
    return "";
  }

  return outputText;
}

export async function answerWorkspaceQuestion({ question, cases, language = "en" }) {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is missing from the environment.");
  }

  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      instructions:
        [
          "You are an enterprise workspace analyst.",
          "Answer only from the supplied case data.",
          "If data is insufficient, say so clearly.",
          "Be concise and factual.",
          "When doing counts or time-based summaries, explain the basis briefly.",
          language === "zh" ? "Respond in Simplified Chinese." : "Respond in English.",
        ].join(" "),
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: [
                `QUESTION:\n${question}`,
                "",
                "CASE DATA:",
                buildWorkspaceCaseContext(cases),
              ].join("\n"),
            },
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "workspace_answer",
          strict: true,
          schema: WORKSPACE_ANSWER_SCHEMA,
        },
      },
    }),
  });

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error?.message || "OpenAI workspace query failed.");
  }

  const outputText = payload.output_text || extractOutputText(payload);

  if (!outputText) {
    throw new Error("OpenAI response did not include workspace answer text.");
  }

  return JSON.parse(outputText);
}

export async function generateKnowledgeFileMetadata({ fileName, fileType, extractedText, language = "en" }) {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is missing from the environment.");
  }

  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      instructions:
        [
          "You classify internal manufacturing knowledge documents.",
          "You must read the extracted document text before assigning a category.",
          "Treat the filename as a weak hint only. The document contents are the source of truth.",
          "Do not classify a document as a pricing tool or past quote unless the text clearly contains commercial pricing, quote, or cost evidence.",
          "Standards, specifications, and technical references such as ASTM, ASME, API, ISO, or NACE documents should usually be classified as Standards Reference.",
          "Certificates, inspection records, EN 10204 forms, and compliance certificates should be classified from their actual certificate content.",
          "Summaries must be grounded in what the document actually contains, not guessed from the filename.",
          "If the extracted text is too thin to classify confidently, return Other Support File and say that the readable text is insufficient.",
          language === "zh" ? "Return the summary in Simplified Chinese." : "Return the summary in English.",
          "Return valid JSON matching the schema exactly.",
        ].join(" "),
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: [
                "Classify this uploaded knowledge document.",
                "",
                `FILE NAME: ${fileName}`,
                `FILE TYPE: ${fileType}`,
                "",
                "EXTRACTED DOCUMENT TEXT:",
                extractedText.slice(0, 9000),
              ].join("\n"),
            },
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "knowledge_file_metadata",
          strict: true,
          schema: KNOWLEDGE_FILE_METADATA_SCHEMA,
        },
      },
    }),
  });

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error?.message || "OpenAI knowledge file analysis failed.");
  }

  const outputText = payload.output_text || extractOutputText(payload);

  if (!outputText) {
    throw new Error("OpenAI response did not include knowledge file metadata.");
  }

  return normalizeKnowledgeFileMetadata(JSON.parse(outputText));
}

export async function generateKnowledgeFileSummary({ knowledgeFile, language = "en" }) {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is missing from the environment.");
  }

  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      instructions:
        [
          "You summarize internal manufacturing knowledge documents.",
          "Read the document text before writing the summary.",
          "Keep the summary factual, concise, and grounded in the actual document.",
          "State what kind of document it appears to be, what key standards/commercial/compliance content it contains, and what it may be useful for.",
          "Do not infer content that is not present.",
          language === "zh" ? "Return the summary in Simplified Chinese." : "Return the summary in English.",
          "Return valid JSON matching the schema exactly.",
        ].join(" "),
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: [
                `FILE NAME: ${knowledgeFile.name}`,
                `FILE TYPE: ${knowledgeFile.type}`,
                `CATEGORY: ${knowledgeFile.category}`,
                "",
                "EXTRACTED DOCUMENT TEXT:",
                String(knowledgeFile.extractedText || "").slice(0, 12000),
              ].join("\n"),
            },
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "knowledge_file_summary",
          strict: true,
          schema: KNOWLEDGE_FILE_SUMMARY_SCHEMA,
        },
      },
    }),
  });

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error?.message || "OpenAI knowledge file summary failed.");
  }

  const outputText = payload.output_text || extractOutputText(payload);

  if (!outputText) {
    throw new Error("OpenAI response did not include knowledge file summary.");
  }

  return normalizeKnowledgeFileSummary(JSON.parse(outputText));
}

export async function compareCaseToKnowledgeBase({ caseRecord, knowledgeFiles, language = "en" }) {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is missing from the environment.");
  }

  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      instructions:
        [
          "You are an enterprise manufacturing knowledge-base reviewer.",
          "Use only the supplied case data and uploaded knowledge files.",
          "Do not claim support unless the uploaded evidence is reasonably explicit.",
          "Prefer concrete supporting file names in every supported or partially supported result.",
          "Group results into matching support, partial support, missing support, and suggested review areas.",
          "Choose a recommended case status from the provided enum only.",
          language === "zh" ? "Return narrative fields in Simplified Chinese." : "Return narrative fields in English.",
          "Return valid JSON matching the schema exactly.",
        ].join(" "),
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: [
                "Compare this quote case against the uploaded knowledge library.",
                "",
                "CASE:",
                buildCaseContext(caseRecord),
                "",
                "KNOWLEDGE FILES:",
                buildKnowledgeLibraryContext(knowledgeFiles),
              ].join("\n"),
            },
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "knowledge_comparison",
          strict: true,
          schema: KNOWLEDGE_COMPARISON_SCHEMA,
        },
      },
    }),
  });

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error?.message || "OpenAI knowledge comparison failed.");
  }

  const outputText = payload.output_text || extractOutputText(payload);

  if (!outputText) {
    throw new Error("OpenAI response did not include knowledge comparison text.");
  }

  return normalizeKnowledgeComparison(JSON.parse(outputText));
}

export async function generateQuoteEstimateFromKnowledge({ caseRecord, knowledgeFiles, language = "en" }) {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is missing from the environment.");
  }

  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      instructions:
        [
          "You are an enterprise quote builder for manufacturers.",
          "Use only the supplied case data and pricing-oriented knowledge files.",
          "Build a fast internal draft quote that commercial users can edit.",
          "Do not invent prices or commercial terms without evidence.",
          "Line items must map to the case product items whenever possible.",
          "Read the pricing evidence carefully before assigning a price basis.",
          "Use numeric values for quantity_value, base_unit_price, adjustment_amount, unit_price, line_total, subtotal, and total.",
          "If quantity cannot be safely converted to a number, use 0 for quantity_value and explain the issue in assumptions or risks.",
          "If evidence is insufficient, say so explicitly and keep the quote advisory.",
          language === "zh" ? "Return narrative fields in Simplified Chinese." : "Return narrative fields in English.",
          "Return valid JSON matching the schema exactly.",
        ].join(" "),
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: [
                "Generate a draft quote builder payload from the uploaded pricing evidence.",
                "",
                "CASE:",
                buildCaseContext(caseRecord),
                "",
                "PRICING FILES:",
                buildKnowledgeLibraryContext(knowledgeFiles),
              ].join("\n"),
            },
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "quote_draft",
          strict: true,
          schema: QUOTE_ESTIMATE_SCHEMA,
        },
      },
    }),
  });

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error?.message || "OpenAI quote estimate failed.");
  }

  const outputText = payload.output_text || extractOutputText(payload);

  if (!outputText) {
    throw new Error("OpenAI response did not include quote estimate text.");
  }

  return normalizeQuoteEstimate(JSON.parse(outputText));
}

export async function generateQuoteEmailDraft({ caseRecord, quoteEstimate, language = "en" }) {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is missing from the environment.");
  }

  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      instructions:
        [
          "You draft concise enterprise quote emails for manufacturing sales teams.",
          "Use only the supplied case data and draft quote data.",
          "Do not invent unattested technical or commercial commitments.",
          "The email should be buyer-ready, clear, and professional.",
          "Mention the quoted products and major commercial terms when available.",
          "If data is missing, keep the email conservative and avoid overclaiming.",
          language === "zh" ? "Return the email in Simplified Chinese." : "Return the email in English.",
          "Return valid JSON matching the schema exactly.",
        ].join(" "),
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: [
                "Create a buyer-ready quote email draft.",
                "",
                "CASE:",
                buildCaseContext(caseRecord),
                "",
                "QUOTE DRAFT:",
                JSON.stringify(quoteEstimate),
              ].join("\n"),
            },
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "quote_email_draft",
          strict: true,
          schema: QUOTE_EMAIL_SCHEMA,
        },
      },
    }),
  });

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error?.message || "OpenAI quote email generation failed.");
  }

  const outputText = payload.output_text || extractOutputText(payload);

  if (!outputText) {
    throw new Error("OpenAI response did not include quote email text.");
  }

  return normalizeQuoteEmailDraft(JSON.parse(outputText));
}

function buildSourceText({ emailText, files }) {
  const sections = [];

  if (emailText.trim()) {
    sections.push(`EMAIL TEXT:\n${emailText.trim()}`);
  }

  for (const file of files) {
    sections.push(
      [
        `FILE: ${file.name}`,
        `TYPE: ${file.type}`,
        `EXTRACTED TEXT:`,
        file.extractedText || "No extractable text was available from this file.",
      ].join("\n")
    );
  }

  return sections.join("\n\n");
}

export function buildWorkspaceCaseContext(cases) {
  if (!cases.length) {
    return "No cases are currently stored.";
  }

  return cases
    .map((caseRecord) =>
      JSON.stringify({
        case_id: caseRecord.caseId,
        customer_name: caseRecord.customerName,
        project_name: caseRecord.projectName,
        owner: caseRecord.owner,
        status: caseRecord.status,
        created_at: caseRecord.createdAt,
        updated_at: caseRecord.updatedAt,
        extracted_fields: caseRecord.extractedFields.map((field) => ({
          field_name: field.fieldName,
          value: field.value,
        })),
      })
    )
    .join("\n");
}

export function buildCaseContext(caseRecord) {
  return JSON.stringify({
    case_id: caseRecord.caseId,
    customer_name: caseRecord.customerName,
    project_name: caseRecord.projectName,
    owner: caseRecord.owner,
    status: caseRecord.status,
    product_items: caseRecord.productItems || [],
    extracted_fields: (caseRecord.extractedFields || []).map((field) => ({
      field_name: field.fieldName,
      value: field.value,
    })),
    missing_info: caseRecord.missingInfo || {},
    suggested_questions: caseRecord.suggestedQuestions || [],
  });
}

export function buildKnowledgeLibraryContext(knowledgeFiles) {
  if (!knowledgeFiles.length) {
    return "No knowledge files are currently stored.";
  }

  return knowledgeFiles
    .map((file) =>
      JSON.stringify({
        knowledge_file_id: file.knowledgeFileId,
        name: file.name,
        type: file.type,
        category: file.category,
        summary: file.summary,
        extracted_text: String(file.extractedText || "").slice(0, 3000),
      })
    )
    .join("\n");
}

export function normalizeCaseAnalysis(result) {
  return {
    ...result,
    customer_name: normalizeText(result.customer_name, "Unspecified Customer"),
    project_name: normalizeText(result.project_name, "Customer RFQ Review"),
    product_type: normalizeText(result.product_type),
    material_grade: normalizeText(result.material_grade),
    dimensions: normalizeText(result.dimensions),
    outside_dimension: normalizeText(result.outside_dimension),
    wall_thickness: normalizeText(result.wall_thickness),
    schedule: normalizeText(result.schedule),
    length_per_piece: normalizeText(result.length_per_piece),
    quantity: normalizeText(result.quantity),
    requested_standards: normalizeText(result.requested_standards),
    inspection_requirements: normalizeText(result.inspection_requirements),
    documentation_requirements: normalizeText(result.documentation_requirements),
    delivery_request: normalizeText(result.delivery_request),
    destination: normalizeText(result.destination),
    special_notes: normalizeText(result.special_notes),
    missing_fields: normalizeStringList(result.missing_fields),
    ambiguous_requirements: normalizeStringList(result.ambiguous_requirements),
    low_confidence_items: normalizeStringList(result.low_confidence_items),
    suggested_questions: normalizeStringList(result.suggested_questions),
    product_items: normalizeProductItems(result.product_items),
    ai_summary: {
      what_customer_needs: normalizeText(result.ai_summary?.what_customer_needs),
      straightforward: normalizeText(result.ai_summary?.straightforward),
      needs_clarification: normalizeText(result.ai_summary?.needs_clarification),
      knowledge_base_checks: normalizeText(result.ai_summary?.knowledge_base_checks),
      recommended_next_step: normalizeText(result.ai_summary?.recommended_next_step),
      main_risks: normalizeStringList(result.ai_summary?.main_risks),
    },
    current_status: normalizeText(result.current_status, "Needs Clarification"),
  };
}

export function normalizeKnowledgeComparison(result) {
  return {
    matchingSupport: normalizeComparisonResultList(result.matching_support),
    partialSupport: normalizeComparisonResultList(result.partial_support),
    missingSupport: normalizeComparisonResultList(result.missing_support),
    suggestedReviewAreas: normalizeStringList(result.suggested_review_areas),
    analysisSummary: normalizeText(result.analysis_summary),
    recommendedStatus: normalizeEnum(
      result.recommended_status,
      "Under Knowledge Review",
      ["Under Knowledge Review", "Partially Supported", "Ready to Quote", "Escalate Internally"]
    ),
    supportingFilesUsed: normalizeStringList(result.supporting_files_used),
  };
}

export function normalizeKnowledgeFileMetadata(result) {
  return {
    category: normalizeEnum(result.category, "Other Support File", KNOWLEDGE_FILE_CATEGORIES),
    summary: normalizeText(result.summary, "Readable document text was insufficient for a grounded summary."),
    confidence: normalizeEnum(result.confidence, "low", ["high", "medium", "low"]),
  };
}

export function normalizeKnowledgeFileSummary(result) {
  return {
    summary: normalizeText(result.summary, "Readable document text was insufficient for a grounded summary."),
  };
}

export function normalizeQuoteEstimate(result) {
  return {
    pricingStatus: normalizeText(result.pricing_status),
    currency: normalizeText(result.currency),
    incoterm: normalizeText(result.incoterm),
    lineItems: Array.isArray(result.line_items)
      ? result.line_items.map((item, index) => ({
          lineId: normalizeText(item.line_id, `line-${index + 1}`),
          productId: normalizeText(item.product_id, ""),
          productLabel: normalizeText(item.product_label),
          quantityText: normalizeText(item.quantity_text, item.quantity),
          quantityValue: normalizeNumber(item.quantity_value),
          quantityUnit: normalizeText(item.quantity_unit),
          baseUnitPrice: normalizeNumber(item.base_unit_price),
          adjustmentAmount: normalizeNumber(item.adjustment_amount, 0),
          unitPrice: normalizeNumber(item.unit_price),
          lineTotal: normalizeNumber(item.line_total),
          pricingBasis: normalizeText(item.pricing_basis),
          supportingFiles: normalizeStringList(item.supporting_files),
        }))
      : [],
    additionalCharges: Array.isArray(result.additional_charges)
      ? result.additional_charges.map((charge, index) => ({
          chargeId: normalizeText(charge.charge_id, `charge-${index + 1}`),
          label: normalizeText(charge.label),
          amount: normalizeNumber(charge.amount, 0),
        }))
      : [],
    subtotal: normalizeNumber(result.subtotal),
    total: normalizeNumber(result.total, normalizeNumber(result.subtotal)),
    terms: {
      buyerName: normalizeText(result.terms?.buyer_name, ""),
      buyerEmail: normalizeText(result.terms?.buyer_email, ""),
      ccEmails: normalizeText(result.terms?.cc_emails, ""),
      sellerEntity: normalizeText(result.terms?.seller_entity, ""),
      paymentTerms: normalizeText(result.terms?.payment_terms, ""),
      validityTerms: normalizeText(result.terms?.validity_terms, ""),
      leadTime: normalizeText(result.terms?.lead_time, ""),
      shippingTerms: normalizeText(result.terms?.shipping_terms, ""),
      quoteNotes: normalizeText(result.terms?.quote_notes, ""),
    },
    assumptions: normalizeStringList(result.assumptions),
    risks: normalizeStringList(result.risks),
    supportingFiles: normalizeStringList(result.supporting_files),
    recommendedNextStep: normalizeText(result.recommended_next_step),
    summary: normalizeText(result.summary),
    decisionRecommendation: result.decision_recommendation || null,
  };
}

export function normalizeQuoteEmailDraft(result) {
  return {
    to: normalizeText(result.to, ""),
    cc: normalizeText(result.cc, ""),
    subject: normalizeText(result.subject),
    body: normalizeText(result.body),
    preview: normalizeText(result.preview),
  };
}

function extractOutputText(payload) {
  for (const item of payload.output || []) {
    if (item.type !== "message") {
      continue;
    }

    for (const content of item.content || []) {
      if (content.type === "output_text" && content.text) {
        return content.text;
      }
    }
  }

  return "";
}

const RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "customer_name",
    "project_name",
    "product_items",
    "product_type",
    "material_grade",
    "dimensions",
    "outside_dimension",
    "wall_thickness",
    "schedule",
    "length_per_piece",
    "quantity",
    "requested_standards",
    "inspection_requirements",
    "documentation_requirements",
    "delivery_request",
    "destination",
    "special_notes",
    "missing_fields",
    "ambiguous_requirements",
    "low_confidence_items",
    "suggested_questions",
    "ai_summary",
    "current_status",
  ],
  properties: {
    customer_name: { type: "string", description: "Exact customer or buying entity only." },
    project_name: { type: "string", description: "Exact project/job name only. Use 'Customer RFQ Review' if absent." },
    product_items: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "label",
          "product_type",
          "material_grade",
          "dimensions",
          "outside_dimension",
          "wall_thickness",
          "schedule",
          "length_per_piece",
          "quantity",
        ],
        properties: {
          label: { type: "string", description: "Short distinct label for this line item." },
          product_type: { type: "string" },
          material_grade: { type: "string" },
          dimensions: { type: "string" },
          outside_dimension: { type: "string" },
          wall_thickness: { type: "string" },
          schedule: { type: "string" },
          length_per_piece: { type: "string" },
          quantity: { type: "string" },
        },
      },
    },
    product_type: { type: "string", description: "Product family only, with no grade, dimensions, quantity, or standards." },
    material_grade: { type: "string", description: "Exact material, alloy, grade, or governing material spec only." },
    dimensions: { type: "string", description: "Compact overall dimensions/specification summary only." },
    outside_dimension: { type: "string", description: "Outside diameter / OD / outer dimension only." },
    wall_thickness: { type: "string", description: "Wall thickness only." },
    schedule: { type: "string", description: "Schedule or pipe class only, such as SCH40." },
    length_per_piece: { type: "string", description: "Length per piece only." },
    quantity: { type: "string", description: "Requested quantity only, with unit if present." },
    requested_standards: { type: "string", description: "Standards and specification references only." },
    inspection_requirements: { type: "string", description: "Inspection, testing, witness, or QA requirements only." },
    documentation_requirements: { type: "string", description: "Certificates, MTC/MTR, reports, and documentation requirements only." },
    delivery_request: { type: "string", description: "Lead time, requested shipment timing, or delivery timing only." },
    destination: { type: "string", description: "Delivery location or destination only." },
    special_notes: { type: "string", description: "Residual notes not already captured by another field." },
    missing_fields: {
      type: "array",
      items: { type: "string" },
    },
    ambiguous_requirements: {
      type: "array",
      items: { type: "string" },
    },
    low_confidence_items: {
      type: "array",
      items: { type: "string" },
    },
    suggested_questions: {
      type: "array",
      minItems: 3,
      maxItems: 8,
      items: { type: "string" },
    },
    ai_summary: {
      type: "object",
      additionalProperties: false,
      required: [
        "what_customer_needs",
        "straightforward",
        "needs_clarification",
        "knowledge_base_checks",
        "recommended_next_step",
        "main_risks",
      ],
      properties: {
        what_customer_needs: { type: "string" },
        straightforward: { type: "string" },
        needs_clarification: { type: "string" },
        knowledge_base_checks: { type: "string" },
        recommended_next_step: { type: "string" },
        main_risks: {
          type: "array",
          items: { type: "string" },
        },
      },
    },
    current_status: {
      type: "string",
      enum: [
        "New",
        "Parsing",
        "Ready for Review",
        "Needs Clarification",
        "Under Knowledge Review",
        "Partially Supported",
        "Ready to Quote",
        "Escalate Internally",
      ],
    },
  },
};

const WORKSPACE_ANSWER_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["answer", "basis", "confidence"],
  properties: {
    answer: { type: "string" },
    basis: { type: "string" },
    confidence: {
      type: "string",
      enum: ["high", "medium", "low"],
    },
  },
};

const COMPARISON_RESULT_ITEM_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["requirement", "status", "explanation", "supporting_files"],
  properties: {
    requirement: { type: "string" },
    status: { type: "string", enum: ["Supported", "Likely Supported", "Unclear", "Not Found"] },
    explanation: { type: "string" },
    supporting_files: {
      type: "array",
      items: { type: "string" },
    },
  },
};

const KNOWLEDGE_COMPARISON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "matching_support",
    "partial_support",
    "missing_support",
    "suggested_review_areas",
    "analysis_summary",
    "recommended_status",
    "supporting_files_used",
  ],
  properties: {
    matching_support: { type: "array", items: COMPARISON_RESULT_ITEM_SCHEMA },
    partial_support: { type: "array", items: COMPARISON_RESULT_ITEM_SCHEMA },
    missing_support: { type: "array", items: COMPARISON_RESULT_ITEM_SCHEMA },
    suggested_review_areas: {
      type: "array",
      items: { type: "string" },
    },
    analysis_summary: { type: "string" },
    recommended_status: {
      type: "string",
      enum: ["Under Knowledge Review", "Partially Supported", "Ready to Quote", "Escalate Internally"],
    },
    supporting_files_used: {
      type: "array",
      items: { type: "string" },
    },
  },
};

const QUOTE_ESTIMATE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "pricing_status",
    "currency",
    "incoterm",
    "line_items",
    "additional_charges",
    "subtotal",
    "total",
    "terms",
    "assumptions",
    "risks",
    "supporting_files",
    "recommended_next_step",
    "summary",
  ],
  properties: {
    pricing_status: { type: "string" },
    currency: { type: "string" },
    incoterm: { type: "string" },
    line_items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "line_id",
          "product_id",
          "product_label",
          "quantity_text",
          "quantity_value",
          "quantity_unit",
          "base_unit_price",
          "adjustment_amount",
          "unit_price",
          "line_total",
          "pricing_basis",
          "supporting_files",
        ],
        properties: {
          line_id: { type: "string" },
          product_id: { type: "string" },
          product_label: { type: "string" },
          quantity_text: { type: "string" },
          quantity_value: { type: "number" },
          quantity_unit: { type: "string" },
          base_unit_price: { type: "number" },
          adjustment_amount: { type: "number" },
          unit_price: { type: "number" },
          line_total: { type: "number" },
          pricing_basis: { type: "string" },
          supporting_files: {
            type: "array",
            items: { type: "string" },
          },
        },
      },
    },
    additional_charges: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["charge_id", "label", "amount"],
        properties: {
          charge_id: { type: "string" },
          label: { type: "string" },
          amount: { type: "number" },
        },
      },
    },
    subtotal: { type: "number" },
    total: { type: "number" },
    terms: {
      type: "object",
      additionalProperties: false,
      required: [
        "buyer_name",
        "buyer_email",
        "cc_emails",
        "seller_entity",
        "payment_terms",
        "validity_terms",
        "lead_time",
        "shipping_terms",
        "quote_notes",
      ],
      properties: {
        buyer_name: { type: "string" },
        buyer_email: { type: "string" },
        cc_emails: { type: "string" },
        seller_entity: { type: "string" },
        payment_terms: { type: "string" },
        validity_terms: { type: "string" },
        lead_time: { type: "string" },
        shipping_terms: { type: "string" },
        quote_notes: { type: "string" },
      },
    },
    assumptions: {
      type: "array",
      items: { type: "string" },
    },
    risks: {
      type: "array",
      items: { type: "string" },
    },
    supporting_files: {
      type: "array",
      items: { type: "string" },
    },
    recommended_next_step: { type: "string" },
    summary: { type: "string" },
  },
};

const QUOTE_EMAIL_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["to", "cc", "subject", "body", "preview"],
  properties: {
    to: { type: "string" },
    cc: { type: "string" },
    subject: { type: "string" },
    body: { type: "string" },
    preview: { type: "string" },
  },
};

const KNOWLEDGE_FILE_CATEGORIES = [
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

const KNOWLEDGE_FILE_METADATA_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["category", "summary", "confidence"],
  properties: {
    category: {
      type: "string",
      enum: KNOWLEDGE_FILE_CATEGORIES,
    },
    summary: { type: "string" },
    confidence: {
      type: "string",
      enum: ["high", "medium", "low"],
    },
  },
};

const KNOWLEDGE_FILE_SUMMARY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary"],
  properties: {
    summary: { type: "string" },
  },
};

function normalizeText(value, fallback = "Not clearly stated") {
  const normalized = String(value || "")
    .replace(/\s+/g, " ")
    .replace(/\s+,/g, ",")
    .trim();

  return normalized || fallback;
}

function normalizeStringList(values) {
  return Array.isArray(values)
    ? values
        .map((value) => normalizeText(value, ""))
        .filter(Boolean)
    : [];
}

function normalizeNumber(value, fallback = 0) {
  const numeric =
    typeof value === "number"
      ? value
      : Number.parseFloat(String(value ?? "").replace(/[^0-9.-]+/g, ""));

  return Number.isFinite(numeric) ? Number(numeric.toFixed(2)) : fallback;
}

function normalizeComparisonResultList(results) {
  return Array.isArray(results)
    ? results.map((result) => ({
        requirement: normalizeText(result.requirement),
        status: normalizeEnum(result.status, "Unclear", ["Supported", "Likely Supported", "Unclear", "Not Found"]),
        explanation: normalizeText(result.explanation),
        supportingFiles: normalizeStringList(result.supporting_files),
      }))
    : [];
}

function normalizeEnum(value, fallback, allowedValues) {
  const normalized = normalizeText(value, fallback);
  return allowedValues.includes(normalized) ? normalized : fallback;
}

function normalizeProductItems(items) {
  if (!Array.isArray(items) || !items.length) {
    return [];
  }

  return items.map((item, index) => ({
    label: normalizeText(item.label, `Product ${index + 1}`),
    product_type: normalizeText(item.product_type),
    material_grade: normalizeText(item.material_grade),
    dimensions: normalizeText(item.dimensions),
    outside_dimension: normalizeText(item.outside_dimension),
    wall_thickness: normalizeText(item.wall_thickness),
    schedule: normalizeText(item.schedule),
    length_per_piece: normalizeText(item.length_per_piece),
    quantity: normalizeText(item.quantity),
  }));
}
