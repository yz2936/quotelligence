/**
 * agent-pipeline.js
 *
 * Implements the 4-agent sequential pipeline for industrial RFQ processing:
 *   Agent 1 → RFQ Extraction (procurement analyst)
 *   Agent 2 → Technical Normalization (materials engineering expert)
 *   Agent 3 → Pricing Intelligence (pricing analyst using knowledge files)
 *   Agent 4 → Quotation Draft (sales coordinator applying business rules)
 *
 * Supports all input types: email text, PDF, Excel, Word, CSV, mixed language.
 */

const MODEL = "gpt-5.4";
const API_URL = "https://api.openai.com/v1/responses";

// ─── Core OpenAI Caller ─────────────────────────────────────────────────────

async function callAgent(instructions, userText, schema, schemaName) {
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
      instructions,
      input: [
        {
          role: "user",
          content: [{ type: "input_text", text: userText }],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: schemaName,
          strict: true,
          schema,
        },
      },
    }),
  });

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(
      `Agent "${schemaName}" failed: ${payload.error?.message || "Unknown OpenAI error"}`
    );
  }

  const outputText =
    payload.output_text ||
    extractOutputText(payload);

  if (!outputText) {
    throw new Error(`Agent "${schemaName}" returned no structured output.`);
  }

  return JSON.parse(outputText);
}

function extractOutputText(payload) {
  for (const item of payload.output || []) {
    if (item.type !== "message") continue;
    for (const content of item.content || []) {
      if (content.type === "output_text" && content.text) return content.text;
    }
  }
  return "";
}

// ─── Agent 1: RFQ Extraction ────────────────────────────────────────────────

const AGENT1_INSTRUCTIONS = [
  "You are an expert industrial procurement analyst specializing in steel pipe and alloy products.",
  "Your job is to extract structured information from RFQ documents with high precision.",
  "Products involved: stainless steel pipes, titanium pipes, nickel alloy pipes, flanges, fittings, valves.",
  "Customers are typically from oil & gas, chemical, shipbuilding, nuclear industries.",
  "RFQs may be in English or Chinese, or mixed — process both equally.",
  "RULES:",
  "1. NEVER infer or assume missing information — flag it as a parsing_flag instead.",
  "2. Keep raw_description exactly as written in the source document.",
  "3. If quantity unit is ambiguous (pcs vs meters vs kg), flag it.",
  "4. If same product appears multiple times, create separate line items.",
  "5. Extract certification requirements even if mentioned only in general notes (e.g. EN 10204 3.1).",
  "6. If a field is truly absent, use an empty string — never guess.",
  "7. Preserve all product rows as distinct line items; do not compress multi-row tables.",
  "Return valid JSON matching the schema exactly.",
].join(" ");

const AGENT1_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["rfq_metadata", "line_items", "parsing_flags"],
  properties: {
    rfq_metadata: {
      type: "object",
      additionalProperties: false,
      required: [
        "customer_name", "customer_contact", "rfq_number", "rfq_date",
        "required_delivery", "destination", "currency",
        "special_requirements", "certifications_required",
      ],
      properties: {
        customer_name:          { type: "string" },
        customer_contact:       { type: "string" },
        rfq_number:             { type: "string" },
        rfq_date:               { type: "string" },
        required_delivery:      { type: "string" },
        destination:            { type: "string" },
        currency:               { type: "string" },
        special_requirements:   { type: "array", items: { type: "string" } },
        certifications_required:{ type: "array", items: { type: "string" } },
      },
    },
    line_items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "line_number", "raw_description", "quantity", "unit",
          "material_grade_raw", "size_raw", "standard_raw",
          "surface_finish_raw", "end_condition_raw", "notes",
        ],
        properties: {
          line_number:       { type: "number" },
          raw_description:   { type: "string" },
          quantity:          { type: "number" },
          unit:              { type: "string" },
          material_grade_raw:{ type: "string" },
          size_raw:          { type: "string" },
          standard_raw:      { type: "string" },
          surface_finish_raw:{ type: "string" },
          end_condition_raw: { type: "string" },
          notes:             { type: "string" },
        },
      },
    },
    parsing_flags: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["flag_type", "line_number", "description"],
        properties: {
          flag_type:   { type: "string", description: "missing_info | ambiguous | conflicting" },
          line_number: { type: "number" },
          description: { type: "string" },
        },
      },
    },
  },
};

export async function runAgent1({ emailText, files, language = "en" }) {
  const sections = [];

  if (emailText && emailText.trim()) {
    sections.push(`EMAIL TEXT:\n${emailText.trim()}`);
  }

  for (const file of files || []) {
    sections.push(
      [
        `FILE: ${file.name}`,
        `TYPE: ${file.type || "unknown"}`,
        `EXTRACTED TEXT:`,
        file.extractedText || "(No extractable text — flag any specs from filename if relevant)",
      ].join("\n")
    );
  }

  if (!sections.length) {
    throw new Error("Agent 1: No input text or files provided.");
  }

  const langNote = language === "zh"
    ? "The RFQ is in Chinese or mixed language. Parse all content including Chinese characters accurately. Return all fields in English except where the raw_description must preserve the original text."
    : "Parse all content in English.";

  const userText = [
    `Analyze this RFQ intake and extract all structured data. ${langNote}`,
    "",
    "INTAKE PACKAGE:",
    ...sections,
  ].join("\n");

  return callAgent(AGENT1_INSTRUCTIONS, userText, AGENT1_SCHEMA, "agent1_rfq_extraction");
}

// ─── Agent 2: Technical Normalization ────────────────────────────────────────

const AGENT2_INSTRUCTIONS = [
  "You are a materials engineering expert with deep knowledge of international standards for steel pipes and industrial alloys.",
  "Your job is to normalize raw product descriptions into precise technical specifications.",
  "REFERENCE STANDARDS:",
  "Dimensions: ASME B36.19 (stainless), ASME B36.10 (carbon steel).",
  "Material: ASTM A312 (SS seamless/welded), ASTM B337 (titanium), ASTM B444 (nickel alloy).",
  "Material Equivalents: 316L=S31603=00Cr17Ni14Mo2=1.4404; 304=S30400=0Cr18Ni9=1.4301;",
  "304L=S30403=00Cr19Ni10=1.4307; 321=S32100=1Cr18Ni9Ti=1.4541;",
  "Ti Gr.2=UNS R50400; Inconel 625=UNS N06625.",
  "OD CONVERSIONS: 1/2in=21.3mm; 3/4in=26.7mm; 1in=33.4mm; 1.5in=48.3mm;",
  "2in=60.3mm; 3in=88.9mm; 4in=114.3mm; 6in=168.3mm; 8in=219.1mm.",
  "WALL THICKNESS (2in pipe): SCH10S=2.77mm; SCH40S=3.91mm; SCH80S=5.54mm;",
  "SCH10=3.05mm; SCH40=3.91mm; SCH80=5.54mm; STD=3.91mm; XS=5.54mm.",
  "INTERNAL CODE FORMAT: [Material]-[Grade]-OD[xx.x]mm-WT[xx.xx]mm-[Length]mm-[SMLS|ERW].",
  "Example: SS-316L-OD60.3-WT3.91-6000-SMLS.",
  "CONFIDENCE SCORING: HIGH>0.85 all dimensions confirmed; MEDIUM 0.6-0.85 one inferred; LOW<0.6 ambiguous.",
  "RULES:",
  "1. If size falls between standard values, flag as LOW confidence.",
  "2. Never round dimensions — flag ambiguity instead.",
  "3. If material grade is missing, do not assume 304 or 316L — flag it.",
  "4. Length: if not specified, use 0 for length_mm and RANDOM in internal code.",
  "5. requires_human_review=true for LOW confidence items.",
  "Return valid JSON matching the schema exactly.",
].join(" ");

const AGENT2_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["standardized_items"],
  properties: {
    standardized_items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "line_number", "internal_code", "standardized_spec",
          "quantity", "unit_standardized",
          "confidence_score", "confidence_level",
          "normalization_notes", "requires_human_review", "review_reason",
        ],
        properties: {
          line_number:    { type: "number" },
          internal_code:  { type: "string", description: "e.g. SS-316L-OD60.3-WT3.91-6000-SMLS" },
          standardized_spec: {
            type: "object",
            additionalProperties: false,
            required: [
              "material_grade", "material_standard", "od_mm", "wt_mm",
              "length_mm", "pipe_type", "product_standard", "surface", "end_condition",
            ],
            properties: {
              material_grade:    { type: "string" },
              material_standard: { type: "string", description: "UNS/EN equivalent" },
              od_mm:             { type: "number" },
              wt_mm:             { type: "number" },
              length_mm:         { type: "number" },
              pipe_type:         { type: "string", description: "seamless | welded | unknown" },
              product_standard:  { type: "string", description: "e.g. ASTM A312" },
              surface:           { type: "string" },
              end_condition:     { type: "string" },
            },
          },
          quantity:             { type: "number" },
          unit_standardized:    { type: "string", description: "pcs | meters | kg | sets | lots" },
          confidence_score:     { type: "number" },
          confidence_level:     { type: "string", description: "HIGH | MEDIUM | LOW" },
          normalization_notes:  { type: "string" },
          requires_human_review:{ type: "boolean" },
          review_reason:        { type: "string" },
        },
      },
    },
  },
};

export async function runAgent2({ agent1Result, language = "en" }) {
  const userText = [
    "Normalize these raw RFQ line items into precise technical specifications.",
    "Apply all ASME dimension tables and material standard equivalents from your expertise.",
    "",
    "RFQ METADATA:",
    JSON.stringify(agent1Result.rfq_metadata, null, 2),
    "",
    "RAW LINE ITEMS:",
    JSON.stringify(agent1Result.line_items, null, 2),
    "",
    "PARSING FLAGS FROM AGENT 1 (use these to inform confidence levels):",
    JSON.stringify(agent1Result.parsing_flags, null, 2),
  ].join("\n");

  return callAgent(AGENT2_INSTRUCTIONS, userText, AGENT2_SCHEMA, "agent2_technical_normalization");
}

// ─── Agent 3: Pricing Intelligence ─────────────────────────────────────────

const AGENT3_INSTRUCTIONS = [
  "You are a pricing analyst for an industrial metals trading company.",
  "Your job is to analyze provided historical data sources and generate pricing intelligence for new RFQ line items.",
  "AVAILABLE DATA: You will receive knowledge files including past quotes, pricing tools, supplier price lists, and customer histories.",
  "Analyze these documents to extract: historical selling prices, supplier costs, customer profiles, and market trends.",
  "CONFIDENCE RULES:",
  "HIGH: 10+ historical transactions found, cost confirmed recently, known customer.",
  "MEDIUM: 3-9 transactions OR older cost data OR new customer in known segment.",
  "LOW: Fewer than 3 transactions OR cost data unavailable OR entirely new product.",
  "LOW confidence items must always flag for human pricing decision.",
  "PRICING LOGIC:",
  "1. Start from supplier cost as price floor.",
  "2. Apply customer-specific margin if history exists.",
  "3. Adjust for market index trend.",
  "4. Cap at ceiling based on market range.",
  "5. If no cost data: use market average as reference, flag LOW confidence.",
  "IMPORTANT: Never recommend a price below cost.",
  "If cost data is missing, state explicitly — do not estimate cost.",
  "Flag any item where margin would be below 15%.",
  "Return valid JSON matching the schema exactly.",
].join(" ");

const AGENT3_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["pricing_intelligence"],
  properties: {
    pricing_intelligence: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "line_number", "internal_code",
          "cost_data", "historical_selling_prices", "customer_specific",
          "market_context", "price_recommendation", "data_quality_flags",
        ],
        properties: {
          line_number:   { type: "number" },
          internal_code: { type: "string" },
          cost_data: {
            type: "object",
            additionalProperties: false,
            required: ["latest_supplier_cost", "supplier_cost_date", "cost_validity", "currency"],
            properties: {
              latest_supplier_cost: { type: "number" },
              supplier_cost_date:   { type: "string" },
              cost_validity:        { type: "string", description: "valid | expired | no_data" },
              currency:             { type: "string" },
            },
          },
          historical_selling_prices: {
            type: "object",
            additionalProperties: false,
            required: ["price_range_90days", "price_range_180days", "last_sold_price", "last_sold_date", "sample_size"],
            properties: {
              price_range_90days: {
                type: "object",
                additionalProperties: false,
                required: ["min", "max", "avg"],
                properties: {
                  min: { type: "number" },
                  max: { type: "number" },
                  avg: { type: "number" },
                },
              },
              price_range_180days: {
                type: "object",
                additionalProperties: false,
                required: ["min", "max", "avg"],
                properties: {
                  min: { type: "number" },
                  max: { type: "number" },
                  avg: { type: "number" },
                },
              },
              last_sold_price: { type: "number" },
              last_sold_date:  { type: "string" },
              sample_size:     { type: "number" },
            },
          },
          customer_specific: {
            type: "object",
            additionalProperties: false,
            required: [
              "customer_last_price", "customer_last_date",
              "customer_accepted_margin_avg", "customer_price_sensitivity", "customer_tier",
            ],
            properties: {
              customer_last_price:           { type: "number" },
              customer_last_date:            { type: "string" },
              customer_accepted_margin_avg:  { type: "string" },
              customer_price_sensitivity:    { type: "string", description: "low | medium | high" },
              customer_tier:                 { type: "string", description: "VIP | standard | new" },
            },
          },
          market_context: {
            type: "object",
            additionalProperties: false,
            required: ["material_index_trend", "index_change_30days", "recommended_price_adjustment"],
            properties: {
              material_index_trend:           { type: "string", description: "rising | stable | falling" },
              index_change_30days:            { type: "string" },
              recommended_price_adjustment:   { type: "string" },
            },
          },
          price_recommendation: {
            type: "object",
            additionalProperties: false,
            required: ["suggested_price", "suggested_range", "margin_at_suggested", "confidence_level", "confidence_reason"],
            properties: {
              suggested_price:    { type: "number" },
              suggested_range: {
                type: "object",
                additionalProperties: false,
                required: ["floor", "ceiling"],
                properties: {
                  floor:   { type: "number" },
                  ceiling: { type: "number" },
                },
              },
              margin_at_suggested: { type: "string" },
              confidence_level:    { type: "string", description: "HIGH | MEDIUM | LOW" },
              confidence_reason:   { type: "string" },
            },
          },
          data_quality_flags: { type: "array", items: { type: "string" } },
        },
      },
    },
  },
};

export async function runAgent3({ agent1Result, agent2Result, knowledgeFiles, language = "en" }) {
  const knowledgeContext = buildKnowledgeContext(knowledgeFiles);
  const rfqMetadata = agent1Result.rfq_metadata;

  const userText = [
    "Generate pricing intelligence for each standardized line item.",
    "Analyze the provided knowledge files as your historical data sources.",
    "Extract supplier costs, past selling prices, customer profiles, and market trends from these documents.",
    "",
    `CUSTOMER: ${rfqMetadata.customer_name} | DESTINATION: ${rfqMetadata.destination} | CURRENCY: ${rfqMetadata.currency || "USD"}`,
    "",
    "STANDARDIZED LINE ITEMS (from Agent 2):",
    JSON.stringify(agent2Result.standardized_items, null, 2),
    "",
    "HISTORICAL DATA SOURCES (knowledge files — extract pricing intelligence from these):",
    knowledgeContext,
  ].join("\n");

  return callAgent(AGENT3_INSTRUCTIONS, userText, AGENT3_SCHEMA, "agent3_pricing_intelligence");
}

function buildKnowledgeContext(knowledgeFiles) {
  if (!knowledgeFiles || !knowledgeFiles.length) {
    return "No knowledge files available. All pricing intelligence must be flagged as LOW confidence.";
  }

  return knowledgeFiles
    .map((file) =>
      [
        `--- FILE: ${file.name} | CATEGORY: ${file.category} ---`,
        file.summary ? `SUMMARY: ${file.summary}` : "",
        file.extractedText ? `CONTENT (first 4000 chars):\n${String(file.extractedText).slice(0, 4000)}` : "(No extracted text)",
      ]
        .filter(Boolean)
        .join("\n")
    )
    .join("\n\n");
}

// ─── Agent 4: Quotation Draft ────────────────────────────────────────────────

const AGENT4_INSTRUCTIONS = [
  "You are a senior sales coordinator for an industrial metals trading company.",
  "Your job is to compile pricing intelligence into a complete, professional quotation ready for human review.",
  "COMPANY PRICING RULES:",
  "New customers: add 3% premium vs standard price.",
  "VIP customers: may reduce up to 5% vs standard.",
  "Payment <30 days: standard price.",
  "Payment 30-60 days: add 1.5%.",
  "Payment >60 days: add 3%.",
  "Small orders (<$5000): add 5% handling fee line item.",
  "Rush orders (<15 days): add 8% surcharge.",
  "Quote validity: 30 days standard; 15 days if any material index is rising >3%/month.",
  "FLAG COLOR RULES:",
  "GREEN: confidence HIGH, margin >20%, all rules applied cleanly. Human can approve with one click.",
  "YELLOW: confidence MEDIUM OR margin 15-20% OR payment terms assumed. Human should review price.",
  "RED: confidence LOW OR margin <15% OR missing critical info OR new product. Human must manually set price.",
  "DESCRIPTION FORMAT: [Product Type], [Grade] [Material], OD [xx.x] x WT [xx.xx]mm, [Length]mm, [Standard], [Surface Finish], [End Condition].",
  "IMPORTANT RULES:",
  "1. Never change a RED item to GREEN — only humans can upgrade confidence.",
  "2. Always generate review_checklist — minimum 1 item even for all-green quotes.",
  "3. If total order <$5000, automatically add handling fee line item.",
  "4. Validity must be 15 days if any material index rising flag exists.",
  "5. Internal notes are NOT shown to the customer.",
  "Return valid JSON matching the schema exactly.",
].join(" ");

const AGENT4_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["quotation_draft"],
  properties: {
    quotation_draft: {
      type: "object",
      additionalProperties: false,
      required: [
        "quote_number", "quote_date", "validity_days", "validity_note",
        "customer_name", "attn", "currency", "payment_terms",
        "delivery_weeks", "incoterms", "line_items", "summary",
        "review_checklist", "internal_notes",
      ],
      properties: {
        quote_number:     { type: "string" },
        quote_date:       { type: "string" },
        validity_days:    { type: "number" },
        validity_note:    { type: "string" },
        customer_name:    { type: "string" },
        attn:             { type: "string" },
        currency:         { type: "string" },
        payment_terms:    { type: "string" },
        delivery_weeks:   { type: "string" },
        incoterms:        { type: "string" },
        line_items: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: [
              "line_number", "description", "quantity", "unit",
              "unit_price", "total_price", "currency", "review_flag",
            ],
            properties: {
              line_number:  { type: "number" },
              description:  { type: "string" },
              quantity:     { type: "number" },
              unit:         { type: "string" },
              unit_price:   { type: "number" },
              total_price:  { type: "number" },
              currency:     { type: "string" },
              review_flag: {
                type: "object",
                additionalProperties: false,
                required: ["color", "requires_action", "action_needed", "internal_notes"],
                properties: {
                  color:            { type: "string", description: "GREEN | YELLOW | RED" },
                  requires_action:  { type: "boolean" },
                  action_needed:    { type: "string" },
                  internal_notes:   { type: "string" },
                },
              },
            },
          },
        },
        summary: {
          type: "object",
          additionalProperties: false,
          required: ["subtotal", "surcharges", "total", "overall_margin", "lowest_margin_line", "flags_count"],
          properties: {
            subtotal:           { type: "number" },
            surcharges: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["label", "amount"],
                properties: {
                  label:  { type: "string" },
                  amount: { type: "number" },
                },
              },
            },
            total:              { type: "number" },
            overall_margin:     { type: "string" },
            lowest_margin_line: { type: "number" },
            flags_count: {
              type: "object",
              additionalProperties: false,
              required: ["green", "yellow", "red"],
              properties: {
                green:  { type: "number" },
                yellow: { type: "number" },
                red:    { type: "number" },
              },
            },
          },
        },
        review_checklist: { type: "array", items: { type: "string" } },
        internal_notes:   { type: "string" },
      },
    },
  },
};

export async function runAgent4({ agent1Result, agent2Result, agent3Result, language = "en" }) {
  const rfqMetadata = agent1Result.rfq_metadata;
  const today = new Date().toISOString().slice(0, 10);

  const userText = [
    `Today is ${today}. Generate a complete professional quotation draft.`,
    language === "zh"
      ? "Write product descriptions in professional English but notes/checklist may be in Chinese."
      : "",
    "",
    "RFQ METADATA:",
    JSON.stringify(rfqMetadata, null, 2),
    "",
    "STANDARDIZED LINE ITEMS (Agent 2 — use these for product descriptions):",
    JSON.stringify(agent2Result.standardized_items, null, 2),
    "",
    "PRICING INTELLIGENCE (Agent 3 — use these for prices, flags, and terms):",
    JSON.stringify(agent3Result.pricing_intelligence, null, 2),
    "",
    "Apply all company pricing rules now. Generate the final quotation_draft with proper line items,",
    "GREEN/YELLOW/RED flags, surcharges where applicable, and a review checklist.",
  ]
    .filter(Boolean)
    .join("\n");

  return callAgent(AGENT4_INSTRUCTIONS, userText, AGENT4_SCHEMA, "agent4_quotation_draft");
}

// ─── Full Pipeline ───────────────────────────────────────────────────────────

/**
 * Run the complete 4-agent pipeline.
 * @param {object} params
 * @param {string}   params.emailText      - Pasted email text (may be empty)
 * @param {Array}    params.files          - Parsed file objects [{name, type, extractedText}]
 * @param {Array}    params.knowledgeFiles - Uploaded knowledge files from the library
 * @param {string}   params.language       - "en" | "zh"
 * @returns {Promise<{agent1Result, agent2Result, agent3Result, agent4Result}>}
 */
export async function runFullAgentPipeline({ emailText = "", files = [], knowledgeFiles = [], language = "en" }) {
  const agent1Result = await runAgent1({ emailText, files, language });
  const agent2Result = await runAgent2({ agent1Result, language });
  const agent3Result = await runAgent3({ agent1Result, agent2Result, knowledgeFiles, language });
  const agent4Result = await runAgent4({ agent1Result, agent2Result, agent3Result, language });

  return { agent1Result, agent2Result, agent3Result, agent4Result };
}

// ─── Mapping: Pipeline → Case fields ────────────────────────────────────────

/**
 * Map Agent 1+2 results to extractedFields and productItems for the case record.
 */
export function mapPipelineToCaseFields(agent1Result, agent2Result) {
  const meta = agent1Result.rfq_metadata;

  // Build extractedFields from shared RFQ metadata + first line item as representative
  const firstItem = agent1Result.line_items[0] || {};
  const firstStd  = agent2Result.standardized_items[0] || {};
  const spec       = firstStd.standardized_spec || {};

  const extractedFields = [
    makeField("Product Type",               firstStd.internal_code ? inferProductTypeFromCode(firstStd.internal_code) : firstItem.material_grade_raw, firstStd.confidence_level),
    makeField("Material / Grade",           spec.material_grade ? `${spec.material_grade} (${spec.material_standard || ""})`.trim() : firstItem.material_grade_raw, firstStd.confidence_level),
    makeField("Dimensions",                 spec.od_mm && spec.wt_mm ? `OD ${spec.od_mm}mm × WT ${spec.wt_mm}mm` : firstItem.size_raw, firstStd.confidence_level),
    makeField("Outside Dimension",          spec.od_mm ? `${spec.od_mm}mm` : "", firstStd.confidence_level),
    makeField("Wall Thickness",             spec.wt_mm ? `${spec.wt_mm}mm` : "", firstStd.confidence_level),
    makeField("Schedule",                   firstItem.size_raw ? extractSchedule(firstItem.size_raw) : "Not clearly stated", "low"),
    makeField("Length Per Piece",           spec.length_mm && spec.length_mm > 0 ? `${spec.length_mm}mm` : "Not clearly stated", firstStd.confidence_level),
    makeField("Quantity",                   `${firstItem.quantity || 0} ${firstItem.unit || ""}`.trim() || "Not clearly stated", "medium"),
    makeField("Requested Standards",        spec.product_standard || firstItem.standard_raw || "Not clearly stated", "medium"),
    makeField("Inspection Requirements",    meta.special_requirements.join("; ") || "Not clearly stated", "medium"),
    makeField("Documentation Requirements", meta.certifications_required.join("; ") || "Not clearly stated", "medium"),
    makeField("Delivery Request",           meta.required_delivery || "Not clearly stated", meta.required_delivery ? "medium" : "low"),
    makeField("Destination",               meta.destination || "Not clearly stated", meta.destination ? "medium" : "low"),
    makeField("Special Notes",             meta.special_requirements.join("; ") || "", "high"),
  ];

  // Build productItems from Agent 2 standardized items
  const productItems = agent2Result.standardized_items.map((item, index) => {
    const s = item.standardized_spec || {};
    const raw = agent1Result.line_items.find((l) => l.line_number === item.line_number) || {};
    return {
      productId:          `product-${index + 1}`,
      label:              item.internal_code || `Product ${index + 1}`,
      productType:        inferProductTypeFromCode(item.internal_code),
      materialGrade:      s.material_grade ? `${s.material_grade} (${s.material_standard || ""})`.trim() : raw.material_grade_raw || "Not clearly stated",
      dimensions:         s.od_mm && s.wt_mm ? `OD ${s.od_mm}mm × WT ${s.wt_mm}mm` : raw.size_raw || "Not clearly stated",
      outsideDimension:   s.od_mm ? `${s.od_mm}mm` : "Not clearly stated",
      wallThickness:      s.wt_mm ? `${s.wt_mm}mm` : "Not clearly stated",
      schedule:           extractSchedule(raw.size_raw || ""),
      lengthPerPiece:     s.length_mm && s.length_mm > 0 ? `${s.length_mm}mm` : "Not clearly stated",
      quantity:           `${item.quantity || raw.quantity || 0} ${item.unit_standardized || raw.unit || "pcs"}`.trim(),
      // Agent-specific enrichment
      internalCode:            item.internal_code,
      confidenceScore:         item.confidence_score,
      confidenceLevel:         item.confidence_level,
      normalizationNotes:      item.normalization_notes,
      requiresHumanReview:     item.requires_human_review,
      reviewReason:            item.review_reason,
      rawDescription:          raw.raw_description || "",
      productStandard:         s.product_standard || raw.standard_raw || "",
      surface:                 s.surface || raw.surface_finish_raw || "",
      endCondition:            s.end_condition || raw.end_condition_raw || "",
    };
  });

  // Enrich missingInfo from Agent 1 parsing_flags
  const parsingFlags = agent1Result.parsing_flags || [];
  const missingFields         = parsingFlags.filter((f) => f.flag_type === "missing_info").map((f) => f.description);
  const ambiguousRequirements = parsingFlags.filter((f) => f.flag_type === "ambiguous").map((f) => f.description);
  const lowConfidenceItems    = agent2Result.standardized_items
    .filter((s) => s.confidence_level === "LOW")
    .map((s) => `${s.internal_code}: ${s.review_reason}`);

  return {
    customerName: meta.customer_name || "Unspecified Customer",
    projectName:  meta.rfq_number ? `RFQ ${meta.rfq_number}` : "Customer RFQ Review",
    extractedFields,
    productItems,
    missingInfo: { missingFields, ambiguousRequirements, lowConfidenceItems },
    pipelineMetadata: {
      rfqMetadata:       meta,
      parsedAt:          new Date().toISOString(),
      totalLineItems:    agent1Result.line_items.length,
      totalParsingFlags: parsingFlags.length,
    },
  };
}

/**
 * Map Agent 3+4 results to quoteEstimate for the case record.
 */
export function mapPipelineToQuoteEstimate(agent3Result, agent4Result) {
  const draft = agent4Result.quotation_draft;
  if (!draft) return null;

  const lineItems = draft.line_items.map((item, index) => {
    const intel = agent3Result.pricing_intelligence.find((p) => p.line_number === item.line_number)
      || agent3Result.pricing_intelligence[index]
      || null;

    return {
      lineId:         `line-${index + 1}`,
      productId:      `product-${index + 1}`,
      productLabel:   item.description,
      quantityText:   `${item.quantity} ${item.unit}`,
      quantityValue:  item.quantity,
      quantityUnit:   item.unit,
      baseUnitPrice:  item.unit_price,
      adjustmentAmount: 0,
      unitPrice:      item.unit_price,
      lineTotal:      item.total_price,
      pricingBasis:   item.review_flag.internal_notes,
      supportingFiles: [],
      // Agent enrichment
      reviewFlag:     item.review_flag.color,
      requiresAction: item.review_flag.requires_action,
      actionNeeded:   item.review_flag.action_needed,
      pricingIntelligence: intel
        ? {
            confidenceLevel:   intel.price_recommendation.confidence_level,
            confidenceReason:  intel.price_recommendation.confidence_reason,
            suggestedRange:    intel.price_recommendation.suggested_range,
            marginAtSuggested: intel.price_recommendation.margin_at_suggested,
            marketTrend:       intel.market_context.material_index_trend,
            dataQualityFlags:  intel.data_quality_flags,
          }
        : null,
    };
  });

  const additionalCharges = (draft.summary.surcharges || []).map((s, index) => ({
    chargeId: `charge-surcharge-${index + 1}`,
    label:    s.label,
    amount:   s.amount,
  }));

  // Always include freight and other baseline charges
  additionalCharges.push(
    { chargeId: "charge-freight", label: "Freight", amount: 0 },
    { chargeId: "charge-other",   label: "Other",   amount: 0 }
  );

  return {
    pricingStatus:      `Agent Pipeline Quote — ${draft.summary.flags_count.red > 0 ? "Needs Review" : "Ready for Approval"}`,
    currency:           draft.currency || "USD",
    incoterm:           draft.incoterms || "Not clearly stated",
    lineItems,
    additionalCharges,
    subtotal:           draft.summary.subtotal,
    total:              draft.summary.total,
    terms: {
      buyerName:      draft.customer_name || "",
      buyerEmail:     "",
      ccEmails:       "",
      sellerEntity:   "Your Sales Team",
      paymentTerms:   draft.payment_terms || "To be confirmed",
      validityTerms:  `${draft.validity_days} days`,
      leadTime:       draft.delivery_weeks || "To be confirmed",
      shippingTerms:  draft.incoterms || "To be confirmed",
      quoteNotes:     draft.internal_notes || "",
    },
    assumptions:          draft.review_checklist || [],
    risks:                extractRedFlags(draft),
    supportingFiles:      [],
    recommendedNextStep:  buildNextStep(draft),
    summary:              buildQuoteSummary(draft),
    // Agent pipeline enrichment
    agentQuoteSummary: {
      overallMargin:     draft.summary.overall_margin,
      lowestMarginLine:  draft.summary.lowest_margin_line,
      flagsCount:        draft.summary.flags_count,
      validityNote:      draft.validity_note,
      reviewChecklist:   draft.review_checklist,
      internalNotes:     draft.internal_notes,
      quoteNumber:       draft.quote_number,
      quoteDate:         draft.quote_date,
    },
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeField(fieldName, value, confidenceLevel) {
  const v = String(value || "").trim() || "Not clearly stated";
  const confidence = mapConfidenceLevel(confidenceLevel);
  return {
    fieldName,
    value:            v,
    confidence,
    confidenceLabel:  confidence === "high" ? "Ready for Review" : confidence === "medium" ? "Needs Clarification" : "Escalate Internally",
    sourceReference:  "Agent Pipeline",
    isUserEdited:     false,
    notes:            confidence === "high" ? "" : "Review recommended.",
  };
}

function mapConfidenceLevel(level) {
  if (!level) return "medium";
  const upper = String(level).toUpperCase();
  if (upper === "HIGH")   return "high";
  if (upper === "LOW")    return "low";
  return "medium";
}

function inferProductTypeFromCode(internalCode) {
  if (!internalCode) return "Not clearly stated";
  const upper = internalCode.toUpperCase();
  if (upper.startsWith("SS"))   return "Stainless Steel Pipe";
  if (upper.startsWith("TI"))   return "Titanium Pipe";
  if (upper.startsWith("NI"))   return "Nickel Alloy Pipe";
  if (upper.startsWith("CS"))   return "Carbon Steel Pipe";
  return "Industrial Pipe";
}

function extractSchedule(sizeRaw) {
  if (!sizeRaw) return "Not clearly stated";
  const match = String(sizeRaw).match(/SCH\s*\w+/i);
  return match ? match[0].replace(/\s+/, "") : "Not clearly stated";
}

function extractRedFlags(draft) {
  return draft.line_items
    .filter((item) => item.review_flag.color === "RED")
    .map((item) => `Line ${item.line_number}: ${item.review_flag.action_needed}`);
}

function buildNextStep(draft) {
  const { green, yellow, red } = draft.summary.flags_count;
  if (red > 0)    return `Manual pricing required for ${red} red-flagged item(s) before sending.`;
  if (yellow > 0) return `Review and confirm pricing for ${yellow} yellow-flagged item(s).`;
  if (green > 0)  return "All items priced with high confidence. Ready for final approval.";
  return "Review quotation draft before sending to buyer.";
}

function buildQuoteSummary(draft) {
  const { green, yellow, red } = draft.summary.flags_count;
  const parts = [];
  if (green  > 0) parts.push(`${green} item(s) GREEN (auto-approve eligible)`);
  if (yellow > 0) parts.push(`${yellow} item(s) YELLOW (review recommended)`);
  if (red    > 0) parts.push(`${red} item(s) RED (manual pricing required)`);
  return parts.length
    ? `Agent Pipeline Quote — Margin: ${draft.summary.overall_margin}. ${parts.join(". ")}.`
    : "Agent Pipeline Quote — ready for review.";
}
