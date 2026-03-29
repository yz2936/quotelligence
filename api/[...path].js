import { handleRequest } from "../server.js";

export default async function handler(req, res) {
  try {
    await handleRequest(req, res);
  } catch (err) {
    if (!res.headersSent) {
      res.writeHead(500, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: "Server error", details: String(err) }));
    }
  }
}
