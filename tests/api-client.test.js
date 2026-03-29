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
