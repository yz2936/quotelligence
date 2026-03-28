const TARGET_SHEETS = {
  historical_orders: ["historical_orders", "historical orders"],
  ongoing_deals: ["ongoing_deals", "ongoing deals"],
  suppliers: ["suppliers"],
  workcenters: ["workcenters", "work_centers", "work centers"],
  customers: ["customers"],
  data_dictionary: ["data_dictionary", "data dictionary"],
};

const SIMILARITY_WEIGHTS = {
  product_category: 15,
  manufacturing_route: 12,
  material_grade: 15,
  grade_family: 6,
  outer_diameter_mm: 12,
  wall_thickness_mm: 12,
  total_weight_tons: 7,
  complexity_score: 15,
  tolerance_level: 6,
  test_requirements: 6,
  cert_requirements: 6,
  supplier_id: 6,
  customer_type: 4,
  relationship_level: 3,
};

const FIELD_ALIASES = {
  order_id: ["order_id", "quote_id", "rfq_id", "job_id"],
  product_category: ["product_category", "product_type", "product_family", "item_category"],
  manufacturing_route: ["manufacturing_route", "route", "process_route", "route_code"],
  material_grade: ["material_grade", "grade", "material", "material_spec"],
  grade_family: ["grade_family", "alloy_family", "material_family"],
  outer_diameter_mm: ["outer_diameter_mm", "od_mm", "outside_diameter_mm", "outside_dimension_mm"],
  wall_thickness_mm: ["wall_thickness_mm", "wt_mm", "thickness_mm", "wall_mm"],
  total_weight_tons: ["total_weight_tons", "weight_tons", "tonnage", "order_weight_tons"],
  complexity_score: ["complexity_score", "complexity", "job_complexity"],
  tolerance_level: ["tolerance_level", "tolerance", "tolerance_class"],
  test_requirements: ["test_requirements", "inspection_requirements", "testing_requirements"],
  cert_requirements: ["cert_requirements", "documentation_requirements", "certificate_requirements"],
  supplier_id: ["supplier_id", "mill_id", "source_supplier_id"],
  customer_type: ["customer_type"],
  relationship_level: ["relationship_level", "account_tier", "customer_relationship_level"],
  quoted_price_usd_per_ton: ["quoted_price_usd_per_ton", "price_usd_per_ton", "quoted_price_per_ton", "quote_price_usd_ton"],
  actual_price_usd_per_ton: ["actual_price_usd_per_ton", "realized_price_usd_per_ton", "actual_price_per_ton"],
  promised_lead_time_days: ["promised_lead_time_days", "quoted_lead_time_days", "promised_lead_days"],
  actual_lead_time_days: ["actual_lead_time_days", "actual_lead_days", "realized_lead_time_days"],
  gross_margin_pct: ["gross_margin_pct", "margin_pct", "gross_margin_percent"],
  order_outcome: ["order_outcome", "quote_outcome", "status", "result"],
  win_probability: ["win_probability", "win_rate", "win_probability_estimate"],
  primary_workcenter: ["primary_workcenter", "workcenter", "primary_wc"],
  booked_hours: ["booked_hours", "load_hours", "scheduled_hours"],
  booked_capacity_pct: ["booked_capacity_pct", "capacity_pct", "booked_pct"],
  avg_promised_lead_days: ["avg_promised_lead_days", "average_promised_lead_days"],
  avg_actual_lead_days: ["avg_actual_lead_days", "average_actual_lead_days"],
  on_time_rate_pct: ["on_time_rate_pct", "on_time_pct"],
  reliability_score_100: ["reliability_score_100", "supplier_reliability_score", "reliability_score"],
  customer_region: ["customer_region", "region"],
};

export function normalizeDecisionWorkbook({ workbook, fileName = "" }) {
  const byName = Object.fromEntries(
    (workbook?.sheets || []).map((sheet) => [normalizeSheetName(sheet.sheetName), sheet])
  );

  const tables = {};

  for (const [tableName, aliases] of Object.entries(TARGET_SHEETS)) {
    const matchedSheet = aliases
      .map((alias) => byName[normalizeSheetName(alias)])
      .find(Boolean);

    if (!matchedSheet) {
      tables[tableName] = [];
      continue;
    }

    tables[tableName] = normalizeSheetRows(matchedSheet.rows);
  }

  const hasHistoricalOrders = tables.historical_orders.length > 0;
  const auxCount = ["ongoing_deals", "suppliers", "workcenters", "customers"].filter(
    (name) => tables[name].length > 0
  ).length;

  if (!hasHistoricalOrders || auxCount === 0) {
    return null;
  }

  return {
    workbookName: fileName || "uploaded workbook",
    tables,
    counts: Object.fromEntries(Object.entries(tables).map(([name, rows]) => [name, rows.length])),
  };
}

export function buildQuoteDecisionRecommendation({ caseRecord, knowledgeFiles, language = "en" }) {
  const workbooks = knowledgeFiles
    .map((file) => ({ file, workbook: file.decisionWorkbook }))
    .filter((entry) => entry.workbook?.tables?.historical_orders?.length);

  if (!workbooks.length) {
    return null;
  }

  const dataset = combineWorkbooks(workbooks);
  const rfq = deriveRfqInput(caseRecord, dataset, language);
  const rankedMatches = rankHistoricalOrders(rfq, dataset.tables.historical_orders).slice(0, 12);

  if (!rankedMatches.length) {
    return null;
  }

  const baseline = buildBaselineStats(rankedMatches);
  const dependency = buildDependencyAdjustments({
    rfq,
    dataset,
    matches: rankedMatches,
    baseline,
  });
  const recommendation = buildRecommendationPayload({
    rfq,
    baseline,
    dependency,
    matches: rankedMatches,
    language,
  });

  return {
    sourceFiles: workbooks.map((entry) => entry.file.name),
    inputSummary: rfq,
    recommendation,
    drivers: buildDriverBullets({ rfq, baseline, dependency, matches: rankedMatches, language }),
    matchedCases: rankedMatches.map((entry) => ({
      orderId: readField(entry.record, "order_id") || `match-${entry.index + 1}`,
      similarityScore: round(entry.similarityScore, 4),
    })),
    assumptions: rfq.assumptions,
    summary: buildRecommendationSummary(recommendation, language),
  };
}

function combineWorkbooks(workbooks) {
  const emptyTables = Object.fromEntries(Object.keys(TARGET_SHEETS).map((name) => [name, []]));

  return workbooks.reduce(
    (accumulator, entry) => {
      for (const tableName of Object.keys(emptyTables)) {
        accumulator.tables[tableName].push(...(entry.workbook.tables[tableName] || []));
      }
      accumulator.sourceFiles.push(entry.file.name);
      return accumulator;
    },
    { tables: emptyTables, sourceFiles: [] }
  );
}

function normalizeSheetRows(rows) {
  return (rows || []).map((row) =>
    Object.fromEntries(
      Object.entries(row).map(([key, value]) => [toSnakeCase(key), normalizeCellValue(toSnakeCase(key), value)])
    )
  );
}

function normalizeCellValue(key, value) {
  const trimmed = String(value ?? "").trim();

  if (!trimmed) {
    return key.startsWith("actual_") ? null : "";
  }

  if (looksLikeDateColumn(key)) {
    const parsed = tryParseDate(trimmed);
    return parsed || trimmed;
  }

  if (looksNumericColumn(key)) {
    const numeric = toNumber(trimmed);
    return numeric === null ? trimmed : numeric;
  }

  return trimmed;
}

function deriveRfqInput(caseRecord, dataset, language) {
  const fields = Object.fromEntries((caseRecord.extractedFields || []).map((field) => [field.fieldName, field.value]));
  const primaryItem = caseRecord.productItems?.[0] || {};
  const customerRecord = matchCustomerRecord(caseRecord.customerName, dataset.tables.customers);
  const materialGrade = primaryItem.materialGrade || fields["Material / Grade"] || "";
  const requestedLeadTimeDays = parseLeadTimeDays(fields["Delivery Request"] || "");
  const totalWeightTons = parseWeightTons(primaryItem.quantity, fields, primaryItem);
  const complexityScore = deriveComplexityScore(caseRecord, fields, materialGrade);
  const primaryWorkcenter = inferPrimaryWorkcenter(primaryItem, dataset.tables.historical_orders);
  const supplierId = inferSupplierId(caseRecord, dataset.tables.suppliers, materialGrade);
  const assumptions = [];

  if (!extractGradeFamily(materialGrade)) {
    assumptions.push(localize(language, "Grade family could not be derived cleanly from the RFQ."));
  } else {
    assumptions.push(localize(language, "grade_family derived from material_grade"));
  }

  if (primaryWorkcenter) {
    assumptions.push(localize(language, "primary workcenter inferred from manufacturing route and similar orders"));
  }

  if (!requestedLeadTimeDays) {
    assumptions.push(localize(language, "requested lead time was not explicit in the RFQ"));
  }

  return {
    customer_id: customerRecord?.customer_id || "",
    customer_region: customerRecord?.customer_region || deriveCustomerRegion(fields["Destination"], caseRecord.customerName),
    customer_type: customerRecord?.customer_type || "Existing RFQ",
    relationship_level: customerRecord?.relationship_level || "Standard",
    product_category: primaryItem.productType || fields["Product Type"] || "Unspecified Product",
    manufacturing_route: inferManufacturingRoute(primaryItem.productType, materialGrade),
    material_grade: materialGrade || "Not clearly stated",
    grade_family: extractGradeFamily(materialGrade) || "General Stainless",
    finish: deriveFinish(caseRecord, fields),
    outer_diameter_mm: parseDimensionMillimeters(primaryItem.outsideDimension || fields["Outside Dimension"]),
    wall_thickness_mm: parseDimensionMillimeters(primaryItem.wallThickness || fields["Wall Thickness"]),
    length_m: parseLengthMeters(primaryItem.lengthPerPiece || fields["Length Per Piece"]),
    quantity_units: parseQuantityValue(primaryItem.quantity || fields["Quantity"]),
    total_weight_tons: totalWeightTons,
    complexity_score: complexityScore,
    tolerance_level: deriveToleranceLevel(caseRecord, fields),
    test_requirements: fields["Inspection Requirements"] || "",
    cert_requirements: fields["Documentation Requirements"] || "",
    supplier_id: supplierId || "",
    requested_lead_time_days: requestedLeadTimeDays,
    priority_level: derivePriority(fields["Special Notes"], requestedLeadTimeDays),
    incoterm: extractIncoterm(fields["Special Notes"] || ""),
    primary_workcenter: primaryWorkcenter || "",
    assumptions,
  };
}

function matchCustomerRecord(customerName, customers) {
  const target = String(customerName || "").toLowerCase().trim();

  if (!target) {
    return null;
  }

  return customers.find((customer) => {
    const customerId = readField(customer, "customer_id");
    const name = readField(customer, "customer_name");
    return [customerId, name].some((value) => String(value || "").toLowerCase().includes(target));
  }) || null;
}

function rankHistoricalOrders(rfq, historicalOrders) {
  return historicalOrders
    .map((record, index) => ({
      record,
      index,
      similarityScore: computeSimilarityScore(rfq, record),
    }))
    .sort((left, right) => right.similarityScore - left.similarityScore);
}

function computeSimilarityScore(rfq, record) {
  let weightedScore = 0;
  let totalWeight = 0;

  for (const [field, weight] of Object.entries(SIMILARITY_WEIGHTS)) {
    const score = similarityByField(field, rfq[field], readField(record, field));

    if (score === null) {
      continue;
    }

    weightedScore += score * weight;
    totalWeight += weight;
  }

  if (!totalWeight) {
    return 0;
  }

  return weightedScore / totalWeight;
}

function similarityByField(field, left, right) {
  if (isMissing(left) || isMissing(right)) {
    return 0.5;
  }

  if (typeof left === "number" || typeof right === "number") {
    return numericSimilarity(field, toNumber(left), toNumber(right));
  }

  const normalizedLeft = normalizeTextValue(left);
  const normalizedRight = normalizeTextValue(right);

  if (!normalizedLeft || !normalizedRight) {
    return 0.5;
  }

  if (normalizedLeft === normalizedRight) {
    return 1;
  }

  if (field === "material_grade" && shareGradeFamily(normalizedLeft, normalizedRight)) {
    return 0.75;
  }

  if (field === "product_category" || field === "manufacturing_route" || field === "grade_family") {
    return normalizedLeft.includes(normalizedRight) || normalizedRight.includes(normalizedLeft) ? 0.7 : 0;
  }

  const leftTokens = tokenize(normalizedLeft);
  const rightTokens = tokenize(normalizedRight);
  const overlap = leftTokens.filter((token) => rightTokens.includes(token)).length;
  const denominator = Math.max(leftTokens.length, rightTokens.length, 1);

  return overlap ? overlap / denominator : 0;
}

function numericSimilarity(field, left, right) {
  if (left === null || right === null) {
    return 0.5;
  }

  const tolerance = getNumericTolerance(field, left);
  const distance = Math.abs(left - right);

  return clamp(1 - distance / tolerance, 0, 1);
}

function getNumericTolerance(field, value) {
  const absValue = Math.abs(Number(value) || 0);

  switch (field) {
    case "outer_diameter_mm":
      return Math.max(absValue * 0.18, 8);
    case "wall_thickness_mm":
      return Math.max(absValue * 0.25, 1.2);
    case "total_weight_tons":
      return Math.max(absValue * 0.35, 1);
    case "complexity_score":
      return 3;
    default:
      return Math.max(absValue * 0.25, 1);
  }
}

function buildBaselineStats(matches) {
  const wonMatches = matches.filter((entry) => isWonOutcome(readField(entry.record, "order_outcome")));
  const baselinePool = wonMatches.length >= 3 ? wonMatches : matches;
  const priceSeries = pickNumericSeries(baselinePool, ["quoted_price_usd_per_ton", "actual_price_usd_per_ton"]);
  const leadSeries = pickNumericSeries(baselinePool, ["actual_lead_time_days", "promised_lead_time_days"]);
  const marginSeries = pickNumericSeries(baselinePool, ["gross_margin_pct"]);
  const delayRate = computeDelayRate(baselinePool);

  return {
    baselineMatchCount: baselinePool.length,
    medianPricePerTon: median(priceSeries),
    medianLeadTimeDays: median(leadSeries),
    medianGrossMarginPct: median(marginSeries),
    delayRate,
    winRate: computeWinRate(matches),
    primaryWorkcenter: mode(
      baselinePool.map((entry) => readField(entry.record, "primary_workcenter")).filter(Boolean)
    ),
    supplierId: mode(baselinePool.map((entry) => readField(entry.record, "supplier_id")).filter(Boolean)),
  };
}

function buildDependencyAdjustments({ rfq, dataset, matches, baseline }) {
  const primaryWorkcenter = rfq.primary_workcenter || baseline.primaryWorkcenter;
  const workcenterLoad = computeWorkcenterLoad(primaryWorkcenter, dataset.tables.ongoing_deals);
  const supplier = findSupplier(rfq.supplier_id || baseline.supplierId, dataset.tables.suppliers);
  const supplierPenaltyDays = supplier
    ? Math.max(0, toNumber(supplier.avg_actual_lead_days) - toNumber(supplier.avg_promised_lead_days)) * 0.45
    : 0;
  const supplierReliabilityPenalty = supplier
    ? clamp((100 - toNumber(supplier.reliability_score_100, 72)) / 5, 0, 12)
    : 4;
  const materialTightness = computeMaterialTightness(rfq.grade_family, matches);
  const urgencyGapDays = rfq.requested_lead_time_days
    ? Math.max(0, (baseline.medianLeadTimeDays || 0) - rfq.requested_lead_time_days)
    : 0;
  const complexityPenalty = Math.max(0, (rfq.complexity_score || 0) - 5) * 2.2;
  const loadRiskPoints = workcenterLoad.capacityPct >= 95 ? 22 : workcenterLoad.capacityPct >= 85 ? 14 : workcenterLoad.capacityPct >= 70 ? 7 : 0;
  const riskScore = clamp(
    22 +
      loadRiskPoints +
      supplierReliabilityPenalty +
      materialTightness.riskPoints +
      complexityPenalty +
      (baseline.delayRate || 0) * 20 +
      (urgencyGapDays > 0 ? Math.min(18, urgencyGapDays * 1.2) : 0),
    5,
    95
  );
  const priceAdjustmentPct =
    (workcenterLoad.capacityPct >= 85 ? 0.04 : 0) +
    (supplierReliabilityPenalty >= 8 ? 0.03 : 0) +
    (materialTightness.volatilityPct >= 0.2 ? 0.02 : 0) +
    (rfq.complexity_score >= 7 ? 0.025 : 0);
  const leadTimeAdjustmentDays =
    (workcenterLoad.queueDays || 0) +
    supplierPenaltyDays +
    materialTightness.leadPenaltyDays +
    (rfq.complexity_score >= 7 ? 4 : 0);

  return {
    primaryWorkcenter,
    workcenterLoad,
    supplier,
    supplierPenaltyDays,
    supplierReliabilityPenalty,
    materialTightness,
    urgencyGapDays,
    complexityPenalty,
    riskScore,
    priceAdjustmentPct,
    leadTimeAdjustmentDays,
  };
}

function buildRecommendationPayload({ rfq, baseline, dependency, matches, language }) {
  const priceMedian = baseline.medianPricePerTon || 0;
  const adjustedPrice = priceMedian * (1 + dependency.priceAdjustmentPct);
  const priceBandPct = dependency.riskScore >= 75 ? 0.08 : dependency.riskScore >= 55 ? 0.06 : 0.04;
  const priceLow = round(adjustedPrice * (1 - priceBandPct));
  const priceHigh = round(adjustedPrice * (1 + priceBandPct));
  const totalWeight = rfq.total_weight_tons || 0;
  const leadMedian = baseline.medianLeadTimeDays || 0;
  const leadBase = Math.max(leadMedian + dependency.leadTimeAdjustmentDays, rfq.requested_lead_time_days || 0);
  const leadLow = Math.max(1, Math.round(leadBase - 2));
  const leadHigh = Math.max(leadLow, Math.round(leadBase + (dependency.riskScore >= 70 ? 8 : 5)));
  const riskLevel = dependency.riskScore >= 70 ? "High" : dependency.riskScore >= 45 ? "Medium" : "Low";
  const winProbability = clamp(
    (baseline.winRate || 0.45) -
      dependency.riskScore / 180 +
      (rfq.relationship_level.toLowerCase().includes("key") ? 0.08 : 0) -
      (dependency.workcenterLoad.capacityPct >= 90 ? 0.08 : 0),
    0.12,
    0.92
  );
  const strategy = chooseStrategy({
    riskScore: dependency.riskScore,
    loadPct: dependency.workcenterLoad.capacityPct,
    supplierReliabilityPenalty: dependency.supplierReliabilityPenalty,
    requestedLeadTimeDays: rfq.requested_lead_time_days,
    leadLow,
    leadHigh,
    relationshipLevel: rfq.relationship_level,
    medianGrossMarginPct: baseline.medianGrossMarginPct,
  });

  return {
    recommendedPricePerTonLow: priceLow,
    recommendedPricePerTonHigh: priceHigh,
    recommendedTotalPriceLow: totalWeight ? round(priceLow * totalWeight) : 0,
    recommendedTotalPriceHigh: totalWeight ? round(priceHigh * totalWeight) : 0,
    recommendedLeadTimeDaysLow: leadLow,
    recommendedLeadTimeDaysHigh: leadHigh,
    riskScore0To100: Math.round(dependency.riskScore),
    riskLevel,
    winProbabilityEstimate: round(winProbability, 2),
    recommendedStrategy: strategy,
    explanationBullets: buildDriverBullets({ rfq, baseline, dependency, matches, language }),
    matchedCaseIds: matches.map((entry) => readField(entry.record, "order_id")).filter(Boolean),
  };
}

function buildDriverBullets({ rfq, baseline, dependency, matches, language }) {
  const bullets = [];
  const topMatchCount = matches.length;

  bullets.push(
    localize(
      language,
      `Matched ${topMatchCount} similar historical orders with median quoted price ${formatUsd(baseline.medianPricePerTon)} per ton and median actual lead time ${Math.round(baseline.medianLeadTimeDays || 0)} days.`
    )
  );

  if (dependency.workcenterLoad.capacityPct) {
    bullets.push(
      localize(
        language,
        `${dependency.primaryWorkcenter || "Primary workcenter"} is running at approximately ${Math.round(dependency.workcenterLoad.capacityPct)}% booked capacity, adding about ${round(dependency.workcenterLoad.queueDays, 1)} queue days.`
      )
    );
  }

  if (dependency.supplier) {
    bullets.push(
      localize(
        language,
        `Supplier ${dependency.supplier.supplier_id || dependency.supplier.supplier_name || "selected supplier"} shows reliability ${Math.round(toNumber(dependency.supplier.reliability_score_100, 72))}/100 with average actual lead ${round(toNumber(dependency.supplier.avg_actual_lead_days, 0), 1)} days.`
      )
    );
  }

  if (dependency.materialTightness.volatilityPct >= 0.12) {
    bullets.push(
      localize(
        language,
        `${rfq.grade_family} shows elevated historical lead-time volatility, so the recommendation protects schedule and margin.`
      )
    );
  }

  if (dependency.urgencyGapDays > 0) {
    bullets.push(
      localize(
        language,
        `The requested lead time is about ${Math.round(dependency.urgencyGapDays)} days faster than the adjusted historical baseline.`
      )
    );
  }

  return bullets;
}

function buildRecommendationSummary(recommendation, language) {
  const text = `Strategy ${recommendation.recommendedStrategy}; price ${formatUsd(recommendation.recommendedPricePerTonLow)}-${formatUsd(recommendation.recommendedPricePerTonHigh)} per ton; lead time ${recommendation.recommendedLeadTimeDaysLow}-${recommendation.recommendedLeadTimeDaysHigh} days; risk ${recommendation.riskLevel} (${recommendation.riskScore0To100}/100).`;
  return localize(language, text);
}

function computeWorkcenterLoad(primaryWorkcenter, ongoingDeals) {
  if (!primaryWorkcenter) {
    return { capacityPct: 0, bookedHours: 0, queueDays: 0 };
  }

  const relevant = ongoingDeals.filter(
    (deal) => normalizeTextValue(readField(deal, "primary_workcenter")) === normalizeTextValue(primaryWorkcenter)
  );
  const capacityPct = relevant.reduce((sum, deal) => sum + toNumber(readField(deal, "booked_capacity_pct"), 0), 0);
  const bookedHours = relevant.reduce((sum, deal) => sum + toNumber(readField(deal, "booked_hours"), 0), 0);
  const queueDays = capacityPct >= 100 ? 12 : capacityPct >= 90 ? 8 : capacityPct >= 80 ? 4 : capacityPct >= 70 ? 2 : 0;

  return { capacityPct, bookedHours, queueDays };
}

function findSupplier(supplierId, suppliers) {
  const target = normalizeTextValue(supplierId);

  if (!target) {
    return null;
  }

  return (
    suppliers.find((supplier) => normalizeTextValue(readField(supplier, "supplier_id")) === target) || null
  );
}

function computeMaterialTightness(gradeFamily, matches) {
  const relevantLeads = matches
    .filter((entry) => shareGradeFamily(readField(entry.record, "grade_family"), gradeFamily))
    .map((entry) => toNumber(readField(entry.record, "actual_lead_time_days")))
    .filter((value) => value !== null);
  const mean = average(relevantLeads);
  const deviation = standardDeviation(relevantLeads);
  const volatilityPct = mean ? deviation / mean : 0;

  return {
    volatilityPct,
    riskPoints: clamp(volatilityPct * 40, 0, 14),
    leadPenaltyDays: clamp(volatilityPct * 18, 0, 7),
  };
}

function chooseStrategy({
  riskScore,
  loadPct,
  supplierReliabilityPenalty,
  requestedLeadTimeDays,
  leadLow,
  relationshipLevel,
  medianGrossMarginPct,
}) {
  if (requestedLeadTimeDays && requestedLeadTimeDays < leadLow) {
    return "offer_split_delivery";
  }

  if (riskScore >= 75 && loadPct >= 85) {
    return "protect_capacity";
  }

  if (supplierReliabilityPenalty >= 8 && (medianGrossMarginPct || 0) < 16) {
    return "hold_margin";
  }

  if (riskScore <= 40 && /key|strategic/i.test(relationshipLevel || "")) {
    return "balanced";
  }

  return riskScore <= 35 ? "aggressive" : "balanced";
}

function inferPrimaryWorkcenter(primaryItem, historicalOrders) {
  const route = inferManufacturingRoute(primaryItem.productType, primaryItem.materialGrade);
  const routeMatches = historicalOrders.filter(
    (record) => normalizeTextValue(readField(record, "manufacturing_route")) === normalizeTextValue(route)
  );

  return mode(routeMatches.map((record) => readField(record, "primary_workcenter")).filter(Boolean));
}

function inferSupplierId(caseRecord, suppliers, materialGrade) {
  const notes = `${caseRecord.aiSummary?.whatCustomerNeeds || ""} ${caseRecord.aiSummary?.needsClarification || ""}`.toLowerCase();
  const noteMatch = suppliers.find((supplier) =>
    [readField(supplier, "supplier_id"), readField(supplier, "supplier_name")]
      .filter(Boolean)
      .some((value) => notes.includes(String(value).toLowerCase()))
  );

  if (noteMatch) {
    return readField(noteMatch, "supplier_id");
  }

  const gradeFamily = extractGradeFamily(materialGrade);
  const likely = suppliers.find((supplier) =>
    normalizeTextValue(readField(supplier, "material_focus")) === normalizeTextValue(gradeFamily)
  );
  return readField(likely || {}, "supplier_id") || "";
}

function inferManufacturingRoute(productType, materialGrade) {
  const product = normalizeTextValue(productType);
  const grade = normalizeTextValue(materialGrade);

  if (product.includes("seamless")) {
    return "Seamless";
  }

  if (product.includes("weld")) {
    return "Welded";
  }

  if (grade.includes("duplex") || grade.includes("alloy")) {
    return "High Alloy";
  }

  return "Standard Mill Route";
}

function deriveFinish(caseRecord, fields) {
  const text = `${fields["Requested Standards"] || ""} ${fields["Special Notes"] || ""} ${caseRecord.aiSummary?.whatCustomerNeeds || ""}`.toLowerCase();

  if (text.includes("pickled")) {
    return "Pickled";
  }

  if (text.includes("annealed")) {
    return "Annealed";
  }

  return "Mill Finish";
}

function deriveToleranceLevel(caseRecord, fields) {
  const text = `${fields["Special Notes"] || ""} ${caseRecord.aiSummary?.needsClarification || ""}`.toLowerCase();

  if (/tight|critical|precision/.test(text)) {
    return "Tight";
  }

  return "Standard";
}

function derivePriority(notes, requestedLeadTimeDays) {
  const text = String(notes || "").toLowerCase();

  if (/urgent|expedite|priority/.test(text) || (requestedLeadTimeDays && requestedLeadTimeDays <= 21)) {
    return "High";
  }

  return "Normal";
}

function deriveCustomerRegion(destination, customerName) {
  const text = `${destination || ""} ${customerName || ""}`.toLowerCase();

  if (/singapore|asia|china|korea|japan/.test(text)) {
    return "APAC";
  }

  if (/europe|germany|italy|uk|france/.test(text)) {
    return "EMEA";
  }

  return "Americas";
}

function deriveComplexityScore(caseRecord, fields, materialGrade) {
  let score = 4;
  const inspection = String(fields["Inspection Requirements"] || "").toLowerCase();
  const documentation = String(fields["Documentation Requirements"] || "").toLowerCase();
  const standards = String(fields["Requested Standards"] || "").toLowerCase();
  const grade = String(materialGrade || "").toLowerCase();

  if (/pmi|hydrotest|witness|ut|rt|eddy|nace/.test(inspection)) {
    score += 2;
  }

  if (/3\.2|full trace|mrb|dossier/.test(documentation)) {
    score += 1.5;
  }

  if (/duplex|super duplex|nickel|alloy|625|825/.test(grade)) {
    score += 1.5;
  }

  if (/ped|api|asme|norsok/.test(standards)) {
    score += 1;
  }

  return clamp(round(score, 1), 1, 10);
}

function parseLeadTimeDays(text) {
  const normalized = String(text || "").toLowerCase();

  if (!normalized) {
    return 0;
  }

  const weekMatch = normalized.match(/(\d+(?:\.\d+)?)\s*(week|weeks|wk|wks|周)/);
  if (weekMatch) {
    return Math.round(Number(weekMatch[1]) * 7);
  }

  const dayMatch = normalized.match(/(\d+(?:\.\d+)?)\s*(day|days|d|天)/);
  if (dayMatch) {
    return Math.round(Number(dayMatch[1]));
  }

  return 0;
}

function parseWeightTons(quantity, fields, primaryItem) {
  const weightFields = [
    fields["Quantity"],
    fields["Special Notes"],
    primaryItem.quantity,
    primaryItem.dimensions,
  ].filter(Boolean);

  for (const value of weightFields) {
    const normalized = String(value || "").toLowerCase();
    const numeric = toNumber(normalized);

    if (numeric === null) {
      continue;
    }

    if (/\bton|tons|mt|metric ton/.test(normalized)) {
      return numeric;
    }

    if (/\bkg\b/.test(normalized)) {
      return round(numeric / 1000, 3);
    }

    if (/\blb|lbs\b/.test(normalized)) {
      return round(numeric / 2204.62, 3);
    }
  }

  return 0;
}

function parseQuantityValue(text) {
  const numeric = toNumber(text);
  return numeric || 0;
}

function parseDimensionMillimeters(text) {
  const normalized = String(text || "").toLowerCase();
  const numeric = toNumber(normalized);

  if (numeric === null) {
    return 0;
  }

  if (/\bmm\b/.test(normalized)) {
    return round(numeric, 2);
  }

  if (/\bin\b|\"/.test(normalized)) {
    return round(numeric * 25.4, 2);
  }

  return round(numeric, 2);
}

function parseLengthMeters(text) {
  const normalized = String(text || "").toLowerCase();
  const numeric = toNumber(normalized);

  if (numeric === null) {
    return 0;
  }

  if (/\bmm\b/.test(normalized)) {
    return round(numeric / 1000, 3);
  }

  if (/\bft\b|feet|foot/.test(normalized)) {
    return round(numeric * 0.3048, 3);
  }

  return round(numeric, 3);
}

function extractIncoterm(text) {
  const match = String(text || "").toUpperCase().match(/\b(EXW|FOB|FCA|CFR|CIF|DAP|DDP)\b/);
  return match?.[1] || "";
}

function extractGradeFamily(materialGrade) {
  const normalized = String(materialGrade || "").toLowerCase();

  if (!normalized) {
    return "";
  }

  if (/super duplex/.test(normalized)) {
    return "Super Duplex";
  }

  if (/duplex|s31803|s32205|2205/.test(normalized)) {
    return "Duplex";
  }

  if (/nickel|625|825|alloy/.test(normalized)) {
    return "Nickel Alloy";
  }

  if (/316/.test(normalized)) {
    return "316";
  }

  if (/304/.test(normalized)) {
    return "304";
  }

  return normalizeTextValue(materialGrade).toUpperCase();
}

function readField(record, canonicalName) {
  if (!record) {
    return "";
  }

  for (const candidate of FIELD_ALIASES[canonicalName] || [canonicalName]) {
    if (candidate in record) {
      return record[candidate];
    }
  }

  return "";
}

function pickNumericSeries(rows, fields) {
  return rows
    .map((entry) => {
      for (const field of fields) {
        const value = toNumber(readField(entry.record, field));
        if (value !== null) {
          return value;
        }
      }
      return null;
    })
    .filter((value) => value !== null);
}

function computeDelayRate(rows) {
  const results = rows
    .map((entry) => {
      const promised = toNumber(readField(entry.record, "promised_lead_time_days"));
      const actual = toNumber(readField(entry.record, "actual_lead_time_days"));

      if (promised === null || actual === null) {
        return null;
      }

      return actual > promised ? 1 : 0;
    })
    .filter((value) => value !== null);

  return average(results);
}

function computeWinRate(rows) {
  const outcomes = rows
    .map((entry) => readField(entry.record, "order_outcome"))
    .filter(Boolean);

  if (!outcomes.length) {
    return 0.45;
  }

  return outcomes.filter((outcome) => isWonOutcome(outcome)).length / outcomes.length;
}

function isWonOutcome(value) {
  return /won|win|awarded|booked|confirmed/i.test(String(value || ""));
}

function shareGradeFamily(left, right) {
  return extractGradeFamily(left) && extractGradeFamily(left) === extractGradeFamily(right);
}

function normalizeSheetName(value) {
  return normalizeTextValue(value).replace(/\s+/g, "_");
}

function normalizeTextValue(value) {
  return String(value || "").trim().toLowerCase();
}

function tokenize(value) {
  return String(value || "")
    .split(/[^a-z0-9]+/i)
    .filter((token) => token.length >= 2);
}

function toSnakeCase(value) {
  return String(value || "")
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

function looksNumericColumn(key) {
  return /(price|lead|margin|capacity|load|weight|diameter|thickness|length|quantity|hours|score|pct|percent|rate|probability)/.test(key);
}

function looksLikeDateColumn(key) {
  return /date|updated_at|created_at/.test(key);
}

function tryParseDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function isMissing(value) {
  return value === null || value === undefined || value === "" || value === "Not clearly stated";
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function toNumber(value, fallback = null) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  const numeric = Number.parseFloat(String(value ?? "").replace(/[^0-9.-]+/g, ""));
  return Number.isFinite(numeric) ? numeric : fallback;
}

function average(values) {
  if (!values.length) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values) {
  if (!values.length) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function standardDeviation(values) {
  if (values.length < 2) {
    return 0;
  }

  const mean = average(values);
  const variance = average(values.map((value) => (value - mean) ** 2));
  return Math.sqrt(variance);
}

function mode(values) {
  const counts = new Map();

  for (const value of values) {
    counts.set(value, (counts.get(value) || 0) + 1);
  }

  let winner = "";
  let high = -1;
  for (const [value, count] of counts.entries()) {
    if (count > high) {
      high = count;
      winner = value;
    }
  }

  return winner;
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round((Number(value) || 0) * factor) / factor;
}

function formatUsd(value) {
  return `USD ${round(value, 2).toFixed(2)}`;
}

function localize(language, text) {
  if (language !== "zh") {
    return text;
  }

  const dictionary = new Map([
    ["grade_family derived from material_grade", "grade_family 已根据 material_grade 推导。"],
    ["primary workcenter inferred from manufacturing route and similar orders", "primary workcenter 已根据制造路径和相似订单推导。"],
    ["requested lead time was not explicit in the RFQ", "RFQ 中未明确给出 requested lead time。"],
    ["Grade family could not be derived cleanly from the RFQ.", "无法从 RFQ 中明确推导 grade family。"],
  ]);

  return dictionary.get(text) || text;
}
