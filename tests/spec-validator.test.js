import assert from "node:assert/strict";
import test from "node:test";

import { extractConflictMessages, validateProductItemSpecs } from "../server/spec-validator.js";

test("validateProductItemSpecs treats unitless wall thickness values as millimeters", () => {
  const [item] = validateProductItemSpecs([
    {
      label: "Pipe",
      outsideDimension: "60.3 mm",
      schedule: "40S",
      wallThickness: "3.91",
    },
  ]);

  assert.equal(item.specFlags.length, 0);
});

test("validateProductItemSpecs does not invent blocker conflicts from unitless decimal OD values", () => {
  const items = validateProductItemSpecs([
    {
      label: "Small tube",
      outsideDimension: "12.7",
      schedule: "10S",
      wallThickness: "1.65",
    },
  ]);

  assert.deepEqual(extractConflictMessages(items), []);
});
