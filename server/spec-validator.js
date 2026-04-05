/**
 * spec-validator.js
 *
 * Feature 1: Spec Conflict Detector & Auto-Completion Engine
 *
 * Validates product specs against ASME B36.19M / B36.10M pipe schedule tables.
 * - Detects conflicts: stated WT ≠ table WT for given OD + Schedule
 * - Derives missing fields: OD + Schedule → WT; OD + WT → Schedule
 * - Attaches specFlags[] to each productItem (no LLM call — pure deterministic lookup)
 */

// ─── ASME B36.19M + B36.10M Pipe Schedule Table ──────────────────────────────
// Keys: nominal OD in mm (string, e.g. "60.3")
// Values: map of normalized schedule key → wall thickness in mm
// Schedules covered: 5S, 10S, 40S/STD, 80S/XS, 160, XXS
// Note: 40S/STD are identical for most sizes; 80S/XS are identical for most sizes.

const ASME_TABLE = {
  "10.3":  { "5S": 1.24, "10S": 1.73, "40S": 2.41, "80S": 3.02 },
  "13.7":  { "5S": 1.65, "10S": 2.24, "40S": 2.77, "80S": 3.40 },
  "17.1":  { "5S": 1.65, "10S": 2.31, "40S": 3.20, "80S": 3.96 },
  "21.3":  { "5S": 1.65, "10S": 2.11, "40S": 2.77, "80S": 3.73, "160": 4.78, "XXS": 7.47 },
  "26.7":  { "5S": 1.65, "10S": 2.11, "40S": 2.87, "80S": 3.91, "160": 5.56, "XXS": 7.82 },
  "33.4":  { "5S": 1.65, "10S": 2.77, "40S": 3.38, "80S": 4.55, "160": 6.35, "XXS": 9.09 },
  "42.2":  { "5S": 1.65, "10S": 2.77, "40S": 3.56, "80S": 4.85, "160": 6.35, "XXS": 9.70 },
  "48.3":  { "5S": 1.65, "10S": 2.77, "40S": 3.68, "80S": 5.08, "160": 7.14, "XXS": 10.16 },
  "60.3":  { "5S": 1.65, "10S": 2.77, "40S": 3.91, "80S": 5.54, "160": 8.74, "XXS": 11.07 },
  "73.0":  { "5S": 2.11, "10S": 3.05, "40S": 5.16, "80S": 7.01, "160": 9.53, "XXS": 14.02 },
  "88.9":  { "5S": 2.11, "10S": 3.05, "40S": 5.49, "80S": 7.62, "160": 11.13, "XXS": 15.24 },
  "101.6": { "5S": 2.11, "10S": 3.05, "40S": 5.74, "80S": 8.08 },
  "114.3": { "5S": 2.11, "10S": 3.05, "40S": 6.02, "80S": 8.56, "160": 11.13, "XXS": 17.12 },
  "141.3": { "5S": 2.77, "10S": 3.40, "40S": 6.55, "80S": 9.53, "160": 12.70, "XXS": 19.05 },
  "168.3": { "5S": 2.77, "10S": 3.40, "40S": 7.11, "80S": 10.97, "160": 14.27, "XXS": 21.95 },
  "219.1": { "5S": 2.77, "10S": 3.76, "40S": 8.18, "80S": 12.70, "160": 18.26, "XXS": 22.23 },
  "273.0": { "5S": 3.40, "10S": 4.19, "40S": 9.27, "80S": 15.09, "160": 21.44, "XXS": 25.40 },
  "323.8": { "5S": 3.96, "10S": 4.57, "40S": 9.53, "80S": 17.48, "160": 25.40, "XXS": 25.40 },
  "355.6": { "5S": 3.96, "10S": 6.35, "40S": 9.53, "80S": 12.70 },
  "406.4": { "5S": 4.19, "10S": 6.35, "40S": 9.53, "80S": 12.70 },
  "457.0": { "5S": 4.19, "10S": 6.35, "40S": 9.53, "80S": 12.70 },
  "508.0": { "5S": 4.78, "10S": 6.35, "40S": 9.53, "80S": 12.70 },
  "609.6": { "5S": 5.54, "10S": 6.35, "40S": 9.53, "80S": 12.70 },
};

// ASME B36.19M OD lookup table — nominal pipe size (inches label) → OD (mm)
const NPS_TO_OD_MM = {
  "1/8": 10.3, "1/4": 13.7, "3/8": 17.1,
  "1/2": 21.3, "3/4": 26.7,
  "1": 33.4, "1.25": 42.2, "1-1/4": 42.2,
  "1.5": 48.3, "1-1/2": 48.3,
  "2": 60.3, "2.5": 73.0, "2-1/2": 73.0,
  "3": 88.9, "3.5": 101.6, "3-1/2": 101.6,
  "4": 114.3, "5": 141.3, "6": 168.3,
  "8": 219.1, "10": 273.0, "12": 323.8,
  "14": 355.6, "16": 406.4, "18": 457.0,
  "20": 508.0, "24": 609.6,
};

// Sorted OD values for nearest-match lookups
const KNOWN_ODS = Object.keys(ASME_TABLE).map(Number).sort((a, b) => a - b);

// ─── Schedule Normalization ───────────────────────────────────────────────────

/**
 * Normalize a schedule string to a canonical key used in ASME_TABLE.
 * Returns one of: "5S", "10S", "40S", "80S", "160", "XXS", or null if unrecognized.
 */
function normalizeSchedule(raw) {
  if (!raw) return null;
  const s = String(raw).trim().toUpperCase().replace(/\s+/g, "").replace(/^SCH\.?/, "");

  // Direct S-series
  if (s === "5S")   return "5S";
  if (s === "10S")  return "10S";
  if (s === "20S")  return "10S"; // approximate to 10S
  if (s === "40S" || s === "40")   return "40S";
  if (s === "80S" || s === "80")   return "80S";
  if (s === "160")  return "160";
  if (s === "XXS" || s === "DXXS") return "XXS";

  // Aliases
  if (s === "STD" || s === "STANDARD") return "40S";
  if (s === "XS" || s === "XH")        return "80S";
  if (s === "XH")                      return "80S";

  // Non-S carbon steel schedules — map to approximate stainless equivalent
  if (s === "5")   return "5S";
  if (s === "10")  return "10S";
  if (s === "20" || s === "30") return "10S";
  if (s === "60") return "40S";
  if (s === "100") return "80S";
  if (s === "120") return "80S";
  if (s === "140") return "160";

  return null;
}

// ─── Dimension Parsing ────────────────────────────────────────────────────────

function parseMillimeters(text) {
  if (!text) return null;
  const s = String(text).trim().toLowerCase();
  const numeric = parseFloat(s.replace(/[^\d.]/g, ""));
  if (Number.isNaN(numeric) || numeric <= 0) return null;

  // Explicit mm
  if (/mm/.test(s)) return numeric;
  // Explicit inches — convert to mm
  if (/in\b|"/.test(s)) return parseFloat((numeric * 25.4).toFixed(3));
  // NPS fraction notation → look up OD
  const fractMatch = s.match(/^(\d+)\/(\d+)/);
  if (fractMatch) {
    const key = `${fractMatch[1]}/${fractMatch[2]}`;
    return NPS_TO_OD_MM[key] || null;
  }
  // Check if it looks like a nominal pipe size (small whole number → treat as NPS → look up OD)
  if (numeric <= 24 && Number.isInteger(numeric)) {
    const npsOd = NPS_TO_OD_MM[String(numeric)];
    if (npsOd) return npsOd; // caller must distinguish OD vs NPS usage
  }

  // Default: assume mm for anything > 20, inches for anything ≤ 20 and no unit
  return numeric > 20 ? numeric : parseFloat((numeric * 25.4).toFixed(3));
}

// ─── ASME Table Lookup ────────────────────────────────────────────────────────

/**
 * Find the closest known OD key in ASME_TABLE for a given OD in mm.
 * Returns the exact key string or null if too far from any known size.
 */
function findClosestOdKey(odMm) {
  if (!odMm || odMm <= 0) return null;
  let closest = null;
  let minDiff = Infinity;
  for (const known of KNOWN_ODS) {
    const diff = Math.abs(known - odMm);
    if (diff < minDiff) { minDiff = diff; closest = known; }
  }
  // Accept match only within 2mm tolerance (tight enough to distinguish adjacent sizes)
  return minDiff <= 2 ? String(closest) : null;
}

/**
 * Look up expected WT for an OD + schedule combination.
 * Returns { expectedWt: number, odKey: string, scheduleKey: string } or null.
 */
function lookupExpectedWT(odMm, scheduleRaw) {
  const schedKey = normalizeSchedule(scheduleRaw);
  if (!schedKey) return null;
  const odKey = findClosestOdKey(odMm);
  if (!odKey) return null;
  const row = ASME_TABLE[odKey];
  if (!row) return null;
  const wt = row[schedKey];
  if (wt == null || wt === null) return null;
  return { expectedWt: wt, odKey, scheduleKey: schedKey };
}

/**
 * Given OD + WT, find which schedule matches within tolerance.
 * Returns the schedule key string or null.
 */
function reverseScheduleLookup(odMm, wtMm) {
  const odKey = findClosestOdKey(odMm);
  if (!odKey) return null;
  const row = ASME_TABLE[odKey];
  if (!row) return null;
  for (const [sched, tableWt] of Object.entries(row)) {
    if (tableWt == null) continue;
    if (Math.abs(tableWt - wtMm) / tableWt <= 0.05) return sched; // within 5%
  }
  return null;
}

// ─── Public API ───────────────────────────────────────────────────────────────

let _flagCounter = 0;
function nextFlagId() { return `sf-${++_flagCounter}`; }

/**
 * Validate and auto-complete spec fields on an array of productItems.
 * Attaches `specFlags[]` to each item. Returns a new array (does not mutate).
 */
export function validateProductItemSpecs(productItems) {
  _flagCounter = 0;
  return (productItems || []).map((item) => {
    const flags = [];
    const odMm    = parseMillimeters(item.outsideDimension);
    const wtMm    = parseMillimeters(item.wallThickness);
    const schedRaw = item.schedule && !/not clearly stated/i.test(item.schedule) ? item.schedule : null;
    const schedKey = schedRaw ? normalizeSchedule(schedRaw) : null;
    const hasOd    = odMm && odMm > 0;
    const hasWt    = wtMm && wtMm > 0;
    const hasSched = Boolean(schedKey);

    if (hasOd && hasSched && hasWt) {
      // All three present — validate consistency
      const lookup = lookupExpectedWT(odMm, schedRaw);
      if (lookup) {
        const delta = Math.abs(lookup.expectedWt - wtMm);
        const pct   = delta / lookup.expectedWt;
        if (pct > 0.05) {
          flags.push({
            flagId: nextFlagId(),
            type: "conflict",
            field: "wallThickness",
            detectedValue: `${wtMm}mm`,
            expectedValue: `${lookup.expectedWt}mm`,
            derivedFrom: ["outsideDimension", "schedule"],
            message: `OD ${lookup.odKey}mm ${schedRaw} expects WT ${lookup.expectedWt}mm per ASME B36.19M, but stated WT is ${wtMm}mm (${Math.round(pct * 100)}% deviation).`,
            severity: pct > 0.15 ? "blocker" : "warning",
          });
        }
      }
    } else if (hasOd && hasSched && !hasWt) {
      // OD + Schedule known, WT missing — derive it
      const lookup = lookupExpectedWT(odMm, schedRaw);
      if (lookup) {
        flags.push({
          flagId: nextFlagId(),
          type: "derived",
          field: "wallThickness",
          detectedValue: null,
          expectedValue: `${lookup.expectedWt}mm`,
          derivedFrom: ["outsideDimension", "schedule"],
          message: `WT derived as ${lookup.expectedWt}mm from OD ${lookup.odKey}mm + ${schedRaw} per ASME B36.19M.`,
          severity: "info",
          derivedValue: `${lookup.expectedWt}mm`,
        });
      }
    } else if (hasOd && hasWt && !hasSched) {
      // OD + WT known, Schedule missing — reverse-lookup
      const matched = reverseScheduleLookup(odMm, wtMm);
      if (matched) {
        flags.push({
          flagId: nextFlagId(),
          type: "derived",
          field: "schedule",
          detectedValue: null,
          expectedValue: matched,
          derivedFrom: ["outsideDimension", "wallThickness"],
          message: `Schedule derived as ${matched} from OD ${findClosestOdKey(odMm)}mm + WT ${wtMm}mm per ASME B36.19M.`,
          severity: "info",
          derivedValue: matched,
        });
      } else {
        flags.push({
          flagId: nextFlagId(),
          type: "assumed",
          field: "schedule",
          detectedValue: null,
          expectedValue: null,
          derivedFrom: ["outsideDimension", "wallThickness"],
          message: `WT ${wtMm}mm does not match any standard schedule for OD ${findClosestOdKey(odMm) || odMm}mm — confirm schedule or non-standard WT.`,
          severity: "warning",
        });
      }
    }

    return { ...item, specFlags: flags };
  });
}

/**
 * Summarize spec flags across all product items.
 */
export function buildSpecValidationSummary(productItems) {
  const allFlags = (productItems || []).flatMap((item) => item.specFlags || []);
  return {
    totalFlags: allFlags.length,
    conflictCount: allFlags.filter((f) => f.type === "conflict").length,
    derivedCount:  allFlags.filter((f) => f.type === "derived").length,
    assumedCount:  allFlags.filter((f) => f.type === "assumed").length,
    blockersPresent: allFlags.some((f) => f.severity === "blocker"),
  };
}

/**
 * Collect blocker conflict messages as strings (for missingInfo.ambiguousRequirements).
 */
export function extractConflictMessages(productItems) {
  return (productItems || [])
    .flatMap((item) => item.specFlags || [])
    .filter((f) => f.type === "conflict" && f.severity === "blocker")
    .map((f) => f.message);
}
