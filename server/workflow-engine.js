const CHECKPOINT_ORDER = [
  { checkpointId: "intake_parsing", title: "Intake / Parsing" },
  { checkpointId: "product_normalization", title: "Product Normalization" },
  { checkpointId: "requirements_completeness", title: "Requirements Completeness" },
  { checkpointId: "historical_case_retrieval", title: "Historical Case Retrieval" },
  { checkpointId: "feasibility_analysis", title: "Feasibility Analysis" },
  { checkpointId: "pricing_recommendation", title: "Pricing Recommendation" },
  { checkpointId: "lead_time_recommendation", title: "Lead-Time Recommendation" },
  { checkpointId: "risk_review", title: "Risk Review" },
  { checkpointId: "clarification_follow_up", title: "Clarification / Follow-Up Need" },
  { checkpointId: "final_sales_decision_gate", title: "Final Sales Decision Gate" },
  { checkpointId: "outbound_draft_generation", title: "Outbound Draft Generation" },
  { checkpointId: "case_close_learning_capture", title: "Case Close / Learning Capture" },
];

const DECISION_ACTIONS = [
  "approve",
  "override",
  "revise",
  "add_missing_info",
  "request_follow_up",
  "skip_with_reason",
];

export function initializeCaseWorkflow({ caseRecord, actor = "system", now = new Date() }) {
  return syncCaseWorkflow({
    previousCase: null,
    nextCase: caseRecord,
    actor,
    source: "case_created",
    now,
  });
}

export function syncCaseWorkflow({ previousCase, nextCase, actor = "system", source = "workflow_sync", now = new Date() }) {
  const workflow = buildWorkflowState({
    caseRecord: nextCase,
    previousWorkflow: {
      ...(previousCase?.workflow || {}),
      ...(nextCase.workflow || {}),
      decisions: {
        ...(previousCase?.workflow?.decisions || {}),
        ...(nextCase.workflow?.decisions || {}),
      },
    },
    now,
  });
  const timeline = [
    ...(previousCase?.timeline || nextCase.timeline || []),
    ...buildCheckpointTimelineEntries(previousCase?.workflow?.checkpoints || [], workflow.checkpoints, actor, source, now),
    ...buildCaseChangeEntries(previousCase, nextCase, actor, source, now),
  ];

  return {
    ...nextCase,
    workflow,
    timeline,
  };
}

export function applyCheckpointDecision({
  caseRecord,
  checkpointId,
  action,
  note = "",
  actor = "user",
  now = new Date(),
}) {
  if (!DECISION_ACTIONS.includes(action)) {
    throw new Error("Unsupported checkpoint action.");
  }

  const decisions = {
    ...(caseRecord.workflow?.decisions || {}),
    [checkpointId]: {
      action,
      note: String(note || "").trim(),
      actor,
      timestamp: now.toISOString(),
    },
  };

  const withDecision = {
    ...caseRecord,
    workflow: {
      ...(caseRecord.workflow || {}),
      decisions,
    },
  };

  const synced = syncCaseWorkflow({
    previousCase: caseRecord,
    nextCase: withDecision,
    actor,
    source: "checkpoint_decision",
    now,
  });

  return {
    ...synced,
    timeline: [
      ...synced.timeline,
      createTimelineEntry({
        type: "checkpoint.decision",
        actor,
        source: "checkpoint_decision",
        checkpointId,
        title: checkpointTitle(checkpointId),
        status: synced.workflow.checkpoints.find((entry) => entry.checkpointId === checkpointId)?.status || "",
        summary: `Decision recorded: ${action}`,
        details: {
          note: String(note || "").trim(),
          action,
        },
        now,
      }),
    ],
  };
}

function buildWorkflowState({ caseRecord, previousWorkflow, now }) {
  const previousCheckpoints = Object.fromEntries(
    (previousWorkflow?.checkpoints || []).map((checkpoint) => [checkpoint.checkpointId, checkpoint])
  );
  const decisions = { ...(previousWorkflow?.decisions || {}) };
  const checkpoints = [];
  let progressionBlocked = false;
  let currentCheckpointId = "";

  for (const definition of CHECKPOINT_ORDER) {
    const previousCheckpoint = previousCheckpoints[definition.checkpointId];
    const decision = decisions[definition.checkpointId] || previousCheckpoint?.decision || null;
    const validation = validateCheckpoint(definition.checkpointId, caseRecord);
    const checkpoint = finalizeCheckpoint({
      definition,
      validation,
      decision,
      progressionBlocked,
      previousCheckpoint,
      now,
    });

    checkpoints.push(checkpoint);

    if (!currentCheckpointId && checkpoint.isBlocking) {
      currentCheckpointId = checkpoint.checkpointId;
    }

    if (checkpoint.isBlocking) {
      progressionBlocked = true;
    }
  }

  return {
    currentCheckpointId,
    paused: Boolean(currentCheckpointId),
    lastEvaluatedAt: now.toISOString(),
    decisions,
    checkpoints,
  };
}

function finalizeCheckpoint({ definition, validation, decision, progressionBlocked, previousCheckpoint, now }) {
  const overrideProceed = decision && ["override", "skip_with_reason"].includes(decision.action);
  const approvedProceed = decision && decision.action === "approve";
  const checkpoint = {
    checkpointId: definition.checkpointId,
    title: definition.title,
    summary: validation.summary,
    checkedItems: validation.checkedItems,
    unresolvedIssues: validation.unresolvedIssues,
    availableActions: validation.availableActions,
    requiresDecision: validation.requiresDecision,
    canProceedAutomatically: validation.canProceedAutomatically,
    lastUpdatedAt: now.toISOString(),
    decision,
    status: "Checked — Requirement met",
    isBlocking: false,
  };

  if (progressionBlocked) {
    checkpoint.status = "Blocked pending resolution";
    checkpoint.isBlocking = true;
    checkpoint.requiresDecision = false;
    checkpoint.availableActions = [];
    return checkpoint;
  }

  if (overrideProceed) {
    checkpoint.status = "Overridden by user";
    checkpoint.isBlocking = false;
    return checkpoint;
  }

  if (definition.checkpointId === "final_sales_decision_gate") {
    if (approvedProceed) {
      checkpoint.status = "Completed and moved forward";
      checkpoint.isBlocking = false;
    } else if (validation.canProceedAutomatically) {
      checkpoint.status = "Waiting for user decision";
      checkpoint.isBlocking = true;
    } else {
      checkpoint.status = "Blocked pending resolution";
      checkpoint.isBlocking = true;
    }

    return checkpoint;
  }

  if (definition.checkpointId === "case_close_learning_capture") {
    if (approvedProceed || overrideProceed) {
      checkpoint.status = "Completed and moved forward";
      checkpoint.isBlocking = false;
    } else if (validation.canProceedAutomatically) {
      checkpoint.status = "Waiting for user decision";
      checkpoint.isBlocking = true;
    } else {
      checkpoint.status = "Blocked pending resolution";
      checkpoint.isBlocking = true;
    }

    return checkpoint;
  }

  switch (validation.result) {
    case "met":
      checkpoint.status = previousCheckpoint?.status === "Completed and moved forward" ? previousCheckpoint.status : "Completed and moved forward";
      checkpoint.isBlocking = false;
      break;
    case "partial":
      checkpoint.status = approvedProceed ? "Completed and moved forward" : "Checked — Partially met";
      checkpoint.isBlocking = validation.requiresDecision && !approvedProceed;
      if (checkpoint.isBlocking) {
        checkpoint.status = "Waiting for user decision";
      }
      break;
    case "missing":
      checkpoint.status = validation.requiresDecision ? "Waiting for user decision" : "Checked — Missing information";
      checkpoint.isBlocking = true;
      break;
    case "risk":
      checkpoint.status = validation.requiresDecision ? "Waiting for user decision" : "Checked — Risk threshold exceeded";
      checkpoint.isBlocking = true;
      break;
    default:
      checkpoint.status = "Blocked pending resolution";
      checkpoint.isBlocking = true;
      break;
  }

  if (decision && ["revise", "add_missing_info", "request_follow_up"].includes(decision.action) && checkpoint.isBlocking) {
    checkpoint.status = "Waiting for user decision";
  }

  return checkpoint;
}

function validateCheckpoint(checkpointId, caseRecord) {
  switch (checkpointId) {
    case "intake_parsing":
      return validateIntakeParsing(caseRecord);
    case "product_normalization":
      return validateProductNormalization(caseRecord);
    case "requirements_completeness":
      return validateRequirementsCompleteness(caseRecord);
    case "historical_case_retrieval":
      return validateHistoricalRetrieval(caseRecord);
    case "feasibility_analysis":
      return validateFeasibility(caseRecord);
    case "pricing_recommendation":
      return validatePricing(caseRecord);
    case "lead_time_recommendation":
      return validateLeadTime(caseRecord);
    case "risk_review":
      return validateRiskReview(caseRecord);
    case "clarification_follow_up":
      return validateClarification(caseRecord);
    case "final_sales_decision_gate":
      return validateFinalSalesGate(caseRecord);
    case "outbound_draft_generation":
      return validateOutboundDraft(caseRecord);
    case "case_close_learning_capture":
      return validateCaseClose(caseRecord);
    default:
      return unresolved("No validator configured for this checkpoint.");
  }
}

function validateIntakeParsing(caseRecord) {
  const hasSourceFiles = (caseRecord.sourceFiles || []).length > 0;
  const hasFields = (caseRecord.extractedFields || []).length > 0;
  const hasSummary = Boolean(caseRecord.aiSummary?.whatCustomerNeeds || caseRecord.aiSummary?.recommendedNextStep);
  const checkedItems = [
    item("RFQ source captured", hasSourceFiles || hasFields, hasSourceFiles ? "Files linked to case." : "Email-only intake."),
    item("Structured extraction available", hasFields, `${caseRecord.extractedFields?.length || 0} extracted fields.`),
    item("AI intake summary available", hasSummary, hasSummary ? "Summary and next step present." : "Summary missing."),
  ];

  if (hasFields && hasSummary) {
    return result("met", "Intake package was parsed into a structured case.", checkedItems);
  }

  if (hasFields) {
    return result("partial", "Intake parsing is incomplete and should be reviewed.", checkedItems, [
      "AI summary is missing or incomplete.",
    ]);
  }

  return result("missing", "Intake parsing did not produce usable case structure.", checkedItems, [
    "Structured extraction is missing.",
  ]);
}

function validateProductNormalization(caseRecord) {
  const productItems = caseRecord.productItems || [];
  const normalizedCount = productItems.filter(isNormalizedProduct).length;
  const checkedItems = [
    item("Product items separated", productItems.length > 0, `${productItems.length} product items available.`),
    item("Quotable specs normalized", normalizedCount === productItems.length && productItems.length > 0, `${normalizedCount}/${productItems.length} items have core fields.`),
  ];

  if (productItems.length && normalizedCount === productItems.length) {
    return result("met", "Product normalization is ready for downstream workflow steps.", checkedItems);
  }

  if (productItems.length) {
    return result("partial", "Some product rows still need normalization before safe automation.", checkedItems, [
      "At least one product item is missing grade, dimensions, or quantity.",
    ]);
  }

  return result("missing", "No normalized product rows are available yet.", checkedItems, [
    "Product list is empty.",
  ]);
}

function validateRequirementsCompleteness(caseRecord) {
  const missingFields = caseRecord.missingInfo?.missingFields || [];
  const ambiguous = caseRecord.missingInfo?.ambiguousRequirements || [];
  const lowConfidence = caseRecord.missingInfo?.lowConfidenceItems || [];
  const checkedItems = [
    item("Required fields present", missingFields.length === 0, `${missingFields.length} missing fields.`),
    item("Ambiguous requirements cleared", ambiguous.length === 0, `${ambiguous.length} ambiguous items.`),
    item("Low-confidence items limited", lowConfidence.length <= 1, `${lowConfidence.length} low-confidence items.`),
  ];

  if (!missingFields.length && !ambiguous.length && lowConfidence.length <= 1) {
    return result("met", "Requirements are sufficiently complete for automated progression.", checkedItems);
  }

  if (!missingFields.length && (!ambiguous.length || lowConfidence.length <= 3)) {
    return result(
      "partial",
      "Requirements are partially complete and may need a human decision before proceeding.",
      checkedItems,
      [...ambiguous, ...lowConfidence]
    );
  }

  return result(
    "missing",
    "Requirements completeness gate failed because key quote inputs are still unresolved.",
    checkedItems,
    [...missingFields, ...ambiguous]
  );
}

function validateHistoricalRetrieval(caseRecord) {
  const matchedCases = caseRecord.quoteEstimate?.decisionRecommendation?.matchedCases || [];
  const checkedItems = [
    item("Historical workbook linked", Boolean(caseRecord.quoteEstimate?.decisionRecommendation), caseRecord.quoteEstimate?.decisionRecommendation ? "Decision workbook was applied." : "No decision workbook output yet."),
    item("Matched historical cases found", matchedCases.length >= 3, `${matchedCases.length} matches available.`),
  ];

  if (matchedCases.length >= 3) {
    return result("met", "Historical case retrieval returned a usable evidence set.", checkedItems);
  }

  if (matchedCases.length > 0) {
    return result("partial", "Historical retrieval returned thin evidence and should be reviewed.", checkedItems, [
      "Matched case set is smaller than the target review set.",
    ]);
  }

  return result("missing", "Historical case retrieval has not been grounded yet.", checkedItems, [
    "Build the quote recommendation to retrieve historical matches.",
  ]);
}

function validateFeasibility(caseRecord) {
  const comparison = caseRecord.knowledgeComparison;
  const checkedItems = [
    item("Knowledge review completed", Boolean(comparison), comparison ? comparison.analysisSummary : "No knowledge review yet."),
    item("Required support coverage acceptable", comparison?.recommendedStatus === "Ready to Quote", comparison?.recommendedStatus || "Pending"),
  ];

  if (comparison?.recommendedStatus === "Ready to Quote") {
    return result("met", "Feasibility analysis passed on current knowledge support.", checkedItems);
  }

  if (comparison) {
    return result("partial", "Feasibility analysis found partial support and needs review.", checkedItems, comparison.suggestedReviewAreas || []);
  }

  return result("missing", "Feasibility analysis has not been run yet.", checkedItems, [
    "Run knowledge comparison before proceeding.",
  ]);
}

function validatePricing(caseRecord) {
  const quoteEstimate = caseRecord.quoteEstimate;
  const lineItems = quoteEstimate?.lineItems || [];
  const pricedItems = lineItems.filter((item) => Number(item.baseUnitPrice || 0) > 0);
  const hasRange = Number(quoteEstimate?.decisionRecommendation?.recommendation?.recommendedPricePerTonLow || 0) > 0;
  const checkedItems = [
    item("Draft quote exists", Boolean(quoteEstimate), quoteEstimate ? quoteEstimate.summary : "No quote estimate yet."),
    item("Pricing evidence available", pricedItems.length > 0 || hasRange, `${pricedItems.length} priced lines; range ${hasRange ? "available" : "missing"}.`),
  ];

  if (pricedItems.length > 0 || hasRange) {
    return result("met", "Pricing recommendation is available for decision review.", checkedItems);
  }

  if (quoteEstimate) {
    return result("partial", "Pricing workspace exists but pricing is still incomplete.", checkedItems, [
      "No priced lines or decision range available yet.",
    ]);
  }

  return result("missing", "Pricing recommendation has not been generated yet.", checkedItems, [
    "Build the draft quote first.",
  ]);
}

function validateLeadTime(caseRecord) {
  const leadTimeText = caseRecord.quoteEstimate?.terms?.leadTime || "";
  const leadRange = caseRecord.quoteEstimate?.decisionRecommendation?.recommendation;
  const hasLeadTime = !/to be confirmed|待确认/i.test(leadTimeText) && Boolean(leadTimeText);
  const checkedItems = [
    item("Lead time recommendation available", hasLeadTime || Boolean(leadRange?.recommendedLeadTimeDaysLow), hasLeadTime ? leadTimeText : "No lead-time recommendation yet."),
  ];

  if (hasLeadTime || leadRange?.recommendedLeadTimeDaysLow) {
    return result("met", "Lead-time recommendation is available.", checkedItems);
  }

  return result("missing", "Lead-time recommendation has not been prepared yet.", checkedItems, [
    "Generate the quote recommendation to derive lead time.",
  ]);
}

function validateRiskReview(caseRecord) {
  const recommendation = caseRecord.quoteEstimate?.decisionRecommendation?.recommendation;
  const riskScore = Number(recommendation?.riskScore0To100 || 0);
  const checkedItems = [
    item("Risk score available", Boolean(recommendation), recommendation ? `${riskScore}/100` : "No risk score."),
    item("Risk within auto-forward threshold", riskScore > 0 && riskScore <= 55, recommendation?.riskLevel || "Pending"),
  ];

  if (recommendation && riskScore <= 55) {
    return result("met", "Risk is within the auto-forward threshold.", checkedItems);
  }

  if (recommendation && riskScore > 0) {
    return result("risk", "Risk review requires a human decision before proceeding.", checkedItems, recommendation.explanationBullets || []);
  }

  return result("missing", "Risk review cannot run until the decision recommendation exists.", checkedItems, [
    "Build the quote recommendation first.",
  ]);
}

function validateClarification(caseRecord) {
  const unresolved = [
    ...(caseRecord.missingInfo?.missingFields || []),
    ...(caseRecord.missingInfo?.ambiguousRequirements || []),
    ...(caseRecord.suggestedQuestions || []),
  ];
  const checkedItems = [
    item("Open clarification items cleared", unresolved.length === 0, `${unresolved.length} open clarification items.`),
  ];

  if (!unresolved.length) {
    return result("met", "No follow-up clarification blockers remain.", checkedItems);
  }

  return result("partial", "Clarification or follow-up is still needed.", checkedItems, unresolved);
}

function validateFinalSalesGate(caseRecord) {
  const recommendation = caseRecord.quoteEstimate?.decisionRecommendation?.recommendation;
  const checkedItems = [
    item("Quote recommendation prepared", Boolean(caseRecord.quoteEstimate), caseRecord.quoteEstimate ? caseRecord.quoteEstimate.summary : "No quote draft yet."),
    item("Risk review completed", Boolean(recommendation), recommendation ? recommendation.riskLevel : "Pending"),
  ];

  return {
    result: "partial",
    summary: "Final sales decision requires an explicit human approval or override.",
    checkedItems,
    unresolvedIssues: [],
    requiresDecision: true,
    canProceedAutomatically: Boolean(caseRecord.quoteEstimate),
    availableActions: ["approve", "override", "revise", "request_follow_up", "skip_with_reason"],
  };
}

function validateOutboundDraft(caseRecord) {
  const emailDraft = caseRecord.quoteEmailDraft;
  const checkedItems = [
    item("Outbound draft generated", Boolean(emailDraft), emailDraft ? emailDraft.subject : "No outbound draft yet."),
  ];

  if (emailDraft) {
    return result("met", "Outbound draft generation is complete.", checkedItems, [], false, []);
  }

  return unresolved("Generate the outbound quote draft after final sales approval.", checkedItems);
}

function validateCaseClose(caseRecord) {
  const checkedItems = [
    item("Outbound draft exists", Boolean(caseRecord.quoteEmailDraft), caseRecord.quoteEmailDraft ? "Draft generated." : "Pending outbound draft."),
    item("Learning note captured", Boolean(caseRecord.workflow?.decisions?.case_close_learning_capture?.note), caseRecord.workflow?.decisions?.case_close_learning_capture?.note || "No learning note yet."),
  ];

  return {
    result: "partial",
    summary: "Case close requires a final learning capture or close-out decision.",
    checkedItems,
    unresolvedIssues: [],
    requiresDecision: true,
    canProceedAutomatically: Boolean(caseRecord.quoteEmailDraft),
    availableActions: ["approve", "override", "revise", "skip_with_reason"],
  };
}

function buildCheckpointTimelineEntries(previousCheckpoints, nextCheckpoints, actor, source, now) {
  const previousById = Object.fromEntries(previousCheckpoints.map((checkpoint) => [checkpoint.checkpointId, checkpoint]));
  const entries = [];

  for (const checkpoint of nextCheckpoints) {
    const previous = previousById[checkpoint.checkpointId];

    if (!previous || previous.status !== checkpoint.status || previous.summary !== checkpoint.summary) {
      entries.push(
        createTimelineEntry({
          type: "checkpoint.status",
          actor,
          source,
          checkpointId: checkpoint.checkpointId,
          title: checkpoint.title,
          status: checkpoint.status,
          summary: checkpoint.summary,
          details: {
            unresolvedIssues: checkpoint.unresolvedIssues,
          },
          now,
        })
      );
    }
  }

  return entries;
}

function buildCaseChangeEntries(previousCase, nextCase, actor, source, now) {
  if (!previousCase) {
    return [
      createTimelineEntry({
        type: "case.created",
        actor,
        source,
        summary: "Case created.",
        status: nextCase.status,
        now,
      }),
    ];
  }

  const entries = [];

  if (JSON.stringify(previousCase.extractedFields) !== JSON.stringify(nextCase.extractedFields)) {
    entries.push(
      createTimelineEntry({
        type: "case.fields_updated",
        actor,
        source,
        summary: "Extracted details updated.",
        details: {
          before: previousCase.extractedFields,
          after: nextCase.extractedFields,
        },
        now,
      })
    );
  }

  if (JSON.stringify(previousCase.productItems) !== JSON.stringify(nextCase.productItems)) {
    entries.push(
      createTimelineEntry({
        type: "case.products_updated",
        actor,
        source,
        summary: "Product normalization details updated.",
        details: {
          before: previousCase.productItems,
          after: nextCase.productItems,
        },
        now,
      })
    );
  }

  if (previousCase.status !== nextCase.status) {
    entries.push(
      createTimelineEntry({
        type: "case.status_updated",
        actor,
        source,
        status: nextCase.status,
        summary: `Case status changed from ${previousCase.status} to ${nextCase.status}.`,
        now,
      })
    );
  }

  if (JSON.stringify(previousCase.knowledgeComparison) !== JSON.stringify(nextCase.knowledgeComparison) && nextCase.knowledgeComparison) {
    entries.push(
      createTimelineEntry({
        type: "case.knowledge_updated",
        actor,
        source,
        summary: "Knowledge comparison refreshed.",
        details: {
          after: nextCase.knowledgeComparison,
        },
        now,
      })
    );
  }

  if (JSON.stringify(previousCase.quoteEstimate) !== JSON.stringify(nextCase.quoteEstimate) && nextCase.quoteEstimate) {
    entries.push(
      createTimelineEntry({
        type: "case.quote_updated",
        actor,
        source,
        summary: "Quote recommendation updated.",
        details: {
          before: previousCase.quoteEstimate,
          after: nextCase.quoteEstimate,
        },
        now,
      })
    );
  }

  if (!previousCase.quoteEmailDraft && nextCase.quoteEmailDraft) {
    entries.push(
      createTimelineEntry({
        type: "case.outbound_draft_generated",
        actor,
        source,
        summary: "Outbound quote draft generated.",
        details: {
          after: nextCase.quoteEmailDraft,
        },
        now,
      })
    );
  }

  return entries;
}

function createTimelineEntry({ type, actor, source, checkpointId = "", title = "", status = "", summary = "", details = {}, now }) {
  return {
    eventId: `evt-${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: now.toISOString(),
    type,
    actor,
    source,
    checkpointId,
    title,
    status,
    summary,
    details,
  };
}

function item(label, passed, detail = "") {
  return {
    label,
    status: passed ? "met" : "issue",
    detail,
  };
}

function result(type, summary, checkedItems = [], unresolvedIssues = [], requiresDecision = true, availableActions = defaultActions(type)) {
  return {
    result: type,
    summary,
    checkedItems,
    unresolvedIssues,
    requiresDecision,
    canProceedAutomatically: type === "met",
    availableActions,
  };
}

function unresolved(summary, checkedItems = []) {
  return {
    result: "missing",
    summary,
    checkedItems,
    unresolvedIssues: [summary],
    requiresDecision: false,
    canProceedAutomatically: false,
    availableActions: [],
  };
}

function defaultActions(type) {
  if (type === "met") {
    return [];
  }

  return ["approve", "override", "revise", "add_missing_info", "request_follow_up", "skip_with_reason"];
}

function isNormalizedProduct(item) {
  return Boolean(item?.label && item?.productType && item?.materialGrade && item?.dimensions && item?.quantity);
}

function checkpointTitle(checkpointId) {
  return CHECKPOINT_ORDER.find((entry) => entry.checkpointId === checkpointId)?.title || checkpointId;
}
