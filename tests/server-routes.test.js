import assert from "node:assert/strict";
import { Readable } from "node:stream";
import test from "node:test";

import { handleRequest } from "../server.js";

test("system status route returns JSON", async () => {
  const response = await invokeRoute({
    method: "GET",
    url: "/api/system/status",
  });

  assert.equal(response.statusCode, 200);
  assert.match(String(response.headers["content-type"] || ""), /application\/json/i);

  const payload = JSON.parse(response.body);
  assert.equal(payload.system.backendAvailable, true);
});

test("intake route returns JSON 422 when a PDF cannot be parsed", async () => {
  const formData = new FormData();
  formData.append(
    "rfq_files",
    new File(["%PDF-1.6 unreadable"], "broken.pdf", { type: "application/pdf" })
  );
  formData.append("email_text", "");
  formData.append("language", "en");

  const request = new Request("http://localhost/api/intake", {
    method: "POST",
    body: formData,
  });

  const response = await invokeRoute({
    method: "POST",
    url: "/api/intake",
    headers: Object.fromEntries(request.headers.entries()),
    body: Buffer.from(await request.arrayBuffer()),
  });

  assert.equal(response.statusCode, 422);
  assert.match(String(response.headers["content-type"] || ""), /application\/json/i);
  assert.equal(JSON.parse(response.body).error, "cannot parse PDF");
});

async function invokeRoute({ method, url, headers = {}, body = Buffer.alloc(0) }) {
  const req = Readable.from(body);
  req.method = method;
  req.url = url;
  req.headers = headers;

  const response = {
    statusCode: 200,
    headers: {},
    body: "",
  };

  const res = {
    headersSent: false,
    writeHead(statusCode, nextHeaders = {}) {
      response.statusCode = statusCode;
      response.headers = Object.fromEntries(
        Object.entries(nextHeaders).map(([key, value]) => [key.toLowerCase(), value])
      );
      this.headersSent = true;
      return this;
    },
    end(chunk = "") {
      response.body += Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
      this.headersSent = true;
    },
  };

  await handleRequest(req, res);
  return response;
}
