import assert from "node:assert/strict";
import test from "node:test";

import { __apiInternals } from "../src/api.js";

test("inferNonJsonApiError maps failed PDF uploads to cannot parse PDF", () => {
  const message = __apiInternals.inferNonJsonApiError({
    body: "<html><body>Internal Server Error</body></html>",
    context: {
      files: [new File(["fake"], "rfq.pdf", { type: "application/pdf" })],
      operation: "rfq_intake",
    },
    response: {
      status: 500,
    },
  });

  assert.equal(message, "cannot parse PDF");
});

test("inferNonJsonApiError maps missing API routes to the static-server guidance", () => {
  const message = __apiInternals.inferNonJsonApiError({
    body: "<html><body>Not Found</body></html>",
    context: {},
    response: {
      status: 404,
    },
  });

  assert.match(message, /Backend API is not available on this server/i);
});

test("inferNonJsonApiError maps quote build platform failures to a quote-specific message", () => {
  const message = __apiInternals.inferNonJsonApiError({
    body: "<html><body>FUNCTION_INVOCATION_FAILED</body></html>",
    context: {
      operation: "quote_build",
    },
    response: {
      status: 500,
    },
  });

  assert.match(message, /Draft quote generation failed/i);
  assert.match(message, /\/api\/quote\/build/i);
});

test("inferNonJsonApiError maps knowledge upload platform failures to a knowledge-specific message", () => {
  const message = __apiInternals.inferNonJsonApiError({
    body: "<html><body>FUNCTION_INVOCATION_FAILED</body></html>",
    context: {
      operation: "knowledge_upload",
      files: [new File(["fake"], "pricing.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })],
    },
    response: {
      status: 500,
    },
  });

  assert.match(message, /Knowledge file upload failed/i);
  assert.match(message, /\/api\/knowledge\/upload/i);
});

test("inferNonJsonApiError maps spreadsheet intake platform failures to an intake-specific message", () => {
  const message = __apiInternals.inferNonJsonApiError({
    body: "<html><body>FUNCTION_INVOCATION_FAILED</body></html>",
    context: {
      operation: "rfq_intake",
      files: [
        new File(["fake"], "rfq.xlsx", {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        }),
      ],
    },
    response: {
      status: 500,
    },
  });

  assert.match(message, /Excel intake parsing failed/i);
  assert.match(message, /\/api\/intake/i);
});
