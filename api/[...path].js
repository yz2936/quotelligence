import { handleRequest } from "../server.js";

// Disable Vercel's default body parser so the raw body stream is available
// for multipart form data and manual JSON parsing in server.js
export const config = {
  api: {
    bodyParser: false,
  },
};

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
