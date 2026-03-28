You are implementing a first-version industrial quote decision engine. The business context is stainless steel / alloy pipe and tube manufacturing where quote decisions must consider historical outcomes plus current load from ongoing deals. Use the workbook `historical_quote_kb_sample.xlsx` as the starting knowledge base and design the code so the same pipeline can later ingest real ERP exports.

# Goal
Build an end-to-end workflow that:
1. ingests the workbook,
2. normalizes the sheets into machine-usable tables,
3. accepts a new RFQ input,
4. retrieves the most similar historical cases,
5. adjusts recommendations using supplier reliability and ongoing-deal load dependencies,
6. returns a recommendation for:
   - price range,
   - target lead-time range,
   - risk score,
   - strategy recommendation,
   - explanation of the main drivers.

Do NOT build a black-box ML model first. The first version must be interpretable, deterministic, and easy to debug.

# Tech requirements
- Backend: Python 3.11+
- Prefer FastAPI for the API layer.
- Use pandas/openpyxl for workbook ingestion.
- Use a simple local persistence layer first: SQLite or DuckDB.
- Keep the recommendation engine in a separate service/module so it can later be swapped with a more advanced model.
- Add unit tests for normalization, similarity scoring, and recommendation generation.
- Structure the project cleanly.

# Expected repository structure
Create something close to:

/app
  /api
    main.py
    routes_quotes.py
    schemas.py
  /core
    config.py
  /data
    ingest_workbook.py
    normalize.py
    seed_db.py
  /engine
    similarity.py
    dependency_adjustments.py
    recommendation.py
    explanation.py
  /models
    db.py
    entities.py
  /tests
    test_ingest.py
    test_similarity.py
    test_recommendation.py
README.md
requirements.txt

# Workbook ingestion requirements
The workbook contains these sheets:
- Historical_Orders
- Ongoing_Deals
- Suppliers
- Workcenters
- Customers
- Data_Dictionary

Implement an ingestion script that:
1. reads all sheets,
2. standardizes column names to snake_case,
3. converts dates to ISO or datetime,
4. converts blank actual_* fields to null,
5. enforces numeric types for dimensions, weight, load, price, lead time, margin, and capacity fields,
6. stores the normalized records in local tables.

Create at least these normalized tables:
- historical_orders
- ongoing_deals
- suppliers
- workcenters
- customers

# New RFQ input schema
Implement a request schema for a new quote request with at least:
- customer_id (optional)
- customer_region
- customer_type
- relationship_level
- product_category
- manufacturing_route
- material_grade
- grade_family (optional, derive if absent)
- finish
- outer_diameter_mm
- wall_thickness_mm
- length_m
- quantity_units
- total_weight_tons
- complexity_score
- tolerance_level
- test_requirements
- cert_requirements
- supplier_id (optional)
- requested_lead_time_days (optional)
- priority_level (optional)
- incoterm (optional)

If some optional fields are missing, derive or default them in a transparent way and include the assumptions in the explanation payload.

# Recommendation engine design
The engine must use three layers:

## Layer 1: similarity retrieval from historical cases
Retrieve the top 10-20 most similar historical orders using weighted similarity.

Use weighted similarity across:
- product_category: very high weight
- manufacturing_route: high weight
- material_grade: very high weight
- grade_family: medium weight
- outer_diameter_mm: high weight with tolerance bands
- wall_thickness_mm: high weight with tolerance bands
- total_weight_tons: medium weight
- complexity_score: very high weight
- tolerance_level: medium weight
- test_requirements: medium weight
- cert_requirements: medium weight
- supplier_id: medium weight when present
- customer_type / relationship_level: low to medium weight

Implement similarity as an interpretable weighted score, not embeddings for v1.

Recommended pattern:
- exact categorical match -> full points
- family-level match -> partial points
- numeric closeness -> inverse distance score with normalization
- missing value -> neutral, not automatic zero

Return the matched historical cases and the similarity scores.

## Layer 2: dependency adjustments
This is critical. Recommendation outputs must not be based on historical matches alone.

Adjust the outputs using:
1. Ongoing deal load:
   - aggregate booked hours and booked_capacity_pct by primary_workcenter,
   - estimate incremental queue pressure if the new RFQ is accepted,
   - add lead-time risk when the target workcenter is near or above practical capacity.
2. Supplier risk:
   - use suppliers.avg_promised_lead_days, avg_actual_lead_days, on_time_rate_pct, reliability_score_100,
   - penalize lead time confidence if the chosen supplier has low reliability or large promised-vs-actual gaps.
3. Material supply tightness:
   - infer from historical data if not explicitly provided,
   - increase risk for special grades with historically volatile supply.
4. Price/margin dependency:
   - compare the proposed price vs matched historical prices and realized margins,
   - if the suggested price is too low relative to cases with similar complexity and load, raise margin risk.
5. Requested lead time:
   - if customer requested lead time is materially shorter than the historical adjusted expectation, raise risk and suggest either a split delivery or a revised promise.

Explicitly model dependency flow. For example:
supplier reliability -> material arrival variance -> production start variance -> lead-time risk
current workcenter load -> queue delay -> actual lead time variance -> strategy recommendation
price discounting -> lower margin buffer -> higher downside if delays or overruns happen

## Layer 3: recommendation output
Return:
- recommended_price_per_ton_low
- recommended_price_per_ton_high
- recommended_total_price_low
- recommended_total_price_high
- recommended_lead_time_days_low
- recommended_lead_time_days_high
- risk_score_0_to_100
- risk_level (Low / Medium / High)
- win_probability_estimate
- recommended_strategy
- explanation_bullets
- matched_case_ids

# Recommendation logic expectations
Implement deterministic logic roughly like this:

1. Retrieve similar historical cases.
2. Build historical baseline stats:
   - median quoted_price_usd_per_ton of top cases
   - median actual_lead_time_days of won top cases
   - delay rate of won top cases
   - median gross_margin_pct of won top cases
3. Apply dependency adjustments:
   - load adjustment from ongoing deals
   - supplier adjustment from suppliers table
   - urgency adjustment from requested lead time
   - complexity adjustment
4. Produce recommended ranges, not single-point estimates.
5. Choose strategy from a small finite set:
   - balanced
   - aggressive
   - hold_margin
   - protect_capacity
   - offer_split_delivery
6. Generate human-readable explanations citing concrete drivers.

# Suggested strategy rules
These are starting rules; implement them cleanly and make them easy to tune:
- If risk score is high and current load is high -> recommend protect_capacity or offer_split_delivery.
- If margin history is thin and supplier reliability is poor -> do not recommend aggressive pricing.
- If customer is key/existing and load is moderate -> balanced may be acceptable.
- If requested lead time is much shorter than adjusted baseline -> offer_split_delivery or revised promise.
- If risk is low and historical win rates are weak at higher prices -> allow aggressive within a controlled floor.

# API endpoints
Implement at least:

1. POST /ingest/workbook
   - Accept a workbook path or uploaded workbook.
   - Normalize and seed the database.
   - Return counts by table.

2. POST /quotes/recommend
   - Accept a new RFQ payload.
   - Return recommendation payload with matched cases and explanations.

3. GET /quotes/matches/{quote_id}
   - Return the matched historical cases for debugging / review.

4. GET /health
   - Return simple health status.

# Output shape for /quotes/recommend
Return JSON like:

{
  "input_summary": {...},
  "recommendation": {
    "recommended_price_per_ton_low": 0,
    "recommended_price_per_ton_high": 0,
    "recommended_total_price_low": 0,
    "recommended_total_price_high": 0,
    "recommended_lead_time_days_low": 0,
    "recommended_lead_time_days_high": 0,
    "risk_score_0_to_100": 0,
    "risk_level": "Medium",
    "win_probability_estimate": 0.0,
    "recommended_strategy": "balanced"
  },
  "drivers": [
    "Supplier MILL-B has a large promised-vs-actual lead gap in history.",
    "WC-02 is heavily loaded based on current ongoing deals.",
    "Matched 8 similar 316L seamless jobs with median actual lead time of 33 days."
  ],
  "matched_cases": [
    {"order_id": "ORD-0007", "similarity_score": 0.89},
    {"order_id": "ORD-0018", "similarity_score": 0.86}
  ],
  "assumptions": [
    "grade_family derived from material_grade",
    "primary workcenter inferred from manufacturing route and complexity"
  ]
}

# Implementation notes
- Use a transparent scoring config object so weights can be tuned without rewriting the engine.
- Keep all calculations modular and testable.
- Prefer median and percentile-based ranges over averages when sample size is small.
- If there are fewer than 5 good matches, widen recommendation ranges and lower confidence.
- If supplier_id is absent in the RFQ, compare 2-3 likely suppliers and return the best/safer option in the explanation.
- Separate "baseline from history" from "adjustments from live dependencies" in the code and response.
- Add clear logging for:
  - number of matches,
  - top match ids,
  - baseline stats,
  - each adjustment applied,
  - final recommendation.

# Deliverables
Provide:
1. working code,
2. requirements.txt,
3. README with setup and example curl requests,
4. tests,
5. a small demo script that:
   - ingests the workbook,
   - submits one sample RFQ,
   - prints the recommendation.

# Acceptance criteria
The implementation is acceptable only if:
- it ingests the workbook successfully,
- it returns recommendations based on both historical matches and ongoing dependencies,
- each recommendation is explainable,
- it is easy to tune,
- and it does not rely on opaque ML in v1.

Start by generating the project structure and the workbook ingestion pipeline, then build the recommendation engine, then expose the API, then add tests and the demo script.
