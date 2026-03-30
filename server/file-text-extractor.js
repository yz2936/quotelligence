import path from "node:path";
import JSZip from "jszip";

export async function extractTextFromBuffer({ fileName, type, buffer }) {
  const normalizedType = String(type || inferType(fileName)).toUpperCase();

  if (["TXT", "CSV", "MD"].includes(normalizedType)) {
    return buffer.toString("utf8");
  }

  if (normalizedType === "EML") {
    return extractEmailPackageFromBuffer({ fileName, buffer }).bodyText;
  }

  if (normalizedType === "PDF") {
    return extractPdfText(buffer);
  }

  if (normalizedType === "XLSX") {
    return extractXlsxText(buffer);
  }

  if (normalizedType === "DOCX") {
    return extractDocxText(buffer);
  }

  return "";
}

export async function extractWorkbookSheetsFromBuffer({ fileName, type, buffer }) {
  const normalizedType = String(type || inferType(fileName)).toUpperCase();

  if (normalizedType !== "XLSX") {
    return null;
  }

  try {
    const zip = await JSZip.loadAsync(buffer);
    const sharedStrings = parseSharedStrings(await readZipEntry(zip, "xl/sharedStrings.xml"));
    const workbookXml = await readZipEntry(zip, "xl/workbook.xml");
    const relsXml = await readZipEntry(zip, "xl/_rels/workbook.xml.rels");
    const sheets = parseWorkbookSheets(workbookXml, relsXml);

    const populatedSheets = [];

    for (const sheet of sheets) {
      const sheetXml = await readZipEntry(zip, sheet.path);
      const rows = parseWorksheetRecords(sheetXml, sharedStrings);

      populatedSheets.push({
        sheetName: sheet.name,
        rows,
      });
    }

    return {
      fileName,
      sheets: populatedSheets,
    };
  } catch {
    return null;
  }
}

export function extractEmailPackageFromBuffer({ fileName, buffer }) {
  const rawMessage = Buffer.isBuffer(buffer) ? buffer.toString("latin1") : Buffer.from(buffer).toString("latin1");
  const parsed = parseMimeEntity(rawMessage);
  const context = {
    bodyParts: [],
    htmlParts: [],
    attachments: [],
  };

  collectEmailContent(parsed, context);

  const headerMap = parsed.headers || {};
  const subject = decodeMimeHeaderValue(firstHeaderValue(headerMap, "subject"));
  const from = decodeMimeHeaderValue(firstHeaderValue(headerMap, "from"));
  const to = decodeMimeHeaderValue(firstHeaderValue(headerMap, "to"));
  const cc = decodeMimeHeaderValue(firstHeaderValue(headerMap, "cc"));
  const bodyText = sanitizePlainText(
    [
      subject ? `Subject: ${subject}` : "",
      from ? `From: ${from}` : "",
      to ? `To: ${to}` : "",
      cc ? `Cc: ${cc}` : "",
      context.bodyParts.join("\n\n") || htmlToText(context.htmlParts.join("\n\n")),
    ]
      .filter(Boolean)
      .join("\n")
  );

  return {
    fileName,
    subject,
    from,
    to,
    cc,
    bodyText,
    attachments: context.attachments,
  };
}

async function extractPdfText(buffer) {
  try {
    const pdfjs = await loadPdfJs();
    pdfjs.GlobalWorkerOptions.workerSrc = undefined;
    const loadingTask = pdfjs.getDocument({
      data: new Uint8Array(buffer),
      useWorkerFetch: false,
      isEvalSupported: false,
      disableFontFace: true,
    });
    const document = await loadingTask.promise;
    const pages = [];

    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const text = content.items
        .map((item) => ("str" in item ? item.str : ""))
        .join(" ");

      if (text.trim()) {
        pages.push(text);
      }
    }

    return sanitizePlainText(pages.join("\n\n"));
  } catch {
    return "";
  }
}

let pdfJsModulePromise = null;

async function loadPdfJs() {
  ensurePdfNodePolyfills();

  if (!pdfJsModulePromise) {
    pdfJsModulePromise = import("pdfjs-dist/legacy/build/pdf.mjs");
  }

  return pdfJsModulePromise;
}

function ensurePdfNodePolyfills() {
  if (!globalThis.DOMMatrix) {
    globalThis.DOMMatrix = class DOMMatrix {
      constructor() {}
      multiplySelf() { return this; }
      preMultiplySelf() { return this; }
      invertSelf() { return this; }
      translate() { return this; }
      scale() { return this; }
    };
  }

  if (!globalThis.ImageData) {
    globalThis.ImageData = class ImageData {
      constructor(data = new Uint8ClampedArray(), width = 0, height = 0) {
        this.data = data;
        this.width = width;
        this.height = height;
      }
    };
  }

  if (!globalThis.Path2D) {
    globalThis.Path2D = class Path2D {
      addPath() {}
      closePath() {}
      moveTo() {}
      lineTo() {}
      bezierCurveTo() {}
      rect() {}
    };
  }
}

async function extractXlsxText(buffer) {
  const workbook = await extractWorkbookSheetsFromBuffer({ fileName: "upload.xlsx", type: "XLSX", buffer });

  if (!workbook) {
    return "";
  }

  return sanitizePlainText(
    workbook.sheets
      .map((sheet) =>
        [sheet.sheetName, ...sheet.rows.map((row) => Object.values(row).join(" | "))].filter(Boolean).join("\n")
      )
      .join("\n\n")
  );
}

async function extractDocxText(buffer) {
  try {
    const zip = await JSZip.loadAsync(buffer);
    const documentXml = await readZipEntry(zip, "word/document.xml");
    return sanitizePlainText(parseXmlText(documentXml).join("\n"));
  } catch {
    return "";
  }
}

async function readZipEntry(zip, entry) {
  const file = zip.file(entry);
  return file ? file.async("string") : "";
}

function parseSharedStrings(xml) {
  return parseXmlText(xml);
}

function parseWorksheetRecords(xml, sharedStrings) {
  const rows = parseWorksheetCellGrid(xml, sharedStrings);
  const headerIndex = findHeaderRowIndex(rows);
  const firstDataRow = headerIndex >= 0 ? rows[headerIndex] : rows.find((row) => row.some(Boolean));

  if (!firstDataRow) {
    return [];
  }

  const headers = firstDataRow.map((value, index) => normalizeHeader(value) || `column_${index + 1}`);
  const records = [];

  for (const row of rows.slice(headerIndex + 1)) {
    if (!row.some(Boolean)) {
      continue;
    }

    const record = {};

    headers.forEach((header, index) => {
      record[header] = row[index] || "";
    });

    records.push(record);
  }

  return records;
}

function findHeaderRowIndex(rows) {
  let bestIndex = -1;
  let bestScore = -1;

  rows.slice(0, 12).forEach((row, index) => {
    const nonEmpty = row.filter((value) => String(value || "").trim());

    if (nonEmpty.length < 2) {
      return;
    }

    const headerish = nonEmpty.filter((value) => isHeaderLikeCell(value)).length;
    const score = headerish * 3 + nonEmpty.length;

    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  });

  return bestIndex;
}

function parseWorksheetCellGrid(xml, sharedStrings) {
  const rows = [];
  const rowMatches = xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/gi);

  for (const match of rowMatches) {
    const rowXml = match[1];
    const cells = [];
    const cellMatches = rowXml.matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/gi);

    for (const cellMatch of cellMatches) {
      const attrs = cellMatch[1] || "";
      const cellXml = cellMatch[2] || "";
      const type = /t="([^"]+)"/i.exec(attrs)?.[1] || "";
      const ref = /r="([^"]+)"/i.exec(attrs)?.[1] || "";
      const columnIndex = columnLettersToIndex(ref.replace(/\d+/g, ""));

      while (cells.length < columnIndex) {
        cells.push("");
      }

      cells[columnIndex] = parseWorksheetCellValue(cellXml, type, sharedStrings);
    }

    rows.push(cells);
  }

  return rows;
}

function parseWorkbookSheets(workbookXml, relsXml) {
  const relationshipMap = Object.fromEntries(
    [...String(relsXml || "").matchAll(/<Relationship\b([^>]*)\/?>/gi)]
      .map((match) => {
        const attrs = match[1] || "";
        const id = /(?:^|\s)Id="([^"]+)"/i.exec(attrs)?.[1] || "";
        const target = /(?:^|\s)Target="([^"]+)"/i.exec(attrs)?.[1] || "";
        return id && target ? [id, normalizeWorkbookTarget(target)] : null;
      })
      .filter(Boolean)
  );

  return [...String(workbookXml || "").matchAll(/<sheet\b([^>]*)\/?>/gi)]
    .map((match) => {
      const attrs = match[1] || "";
      const name = /(?:^|\s)name="([^"]+)"/i.exec(attrs)?.[1] || "";
      const relationshipId = /(?:^|\s)r:id="([^"]+)"/i.exec(attrs)?.[1] || "";

      if (!name || !relationshipId) {
        return null;
      }

      return {
        name: decodeXmlEntities(name),
        path: relationshipMap[relationshipId] || "",
      };
    })
    .filter(Boolean);
}

function normalizeWorkbookTarget(target) {
  const normalized = String(target || "").replace(/^\/+/, "");
  return normalized.startsWith("xl/") ? normalized : `xl/${normalized}`;
}

function parseWorksheetCellValue(cellXml, type, sharedStrings) {
  if (type === "s") {
    const index = Number(/<v>([\s\S]*?)<\/v>/i.exec(cellXml)?.[1] || "-1");
    return sharedStrings[index] || "";
  }

  if (type === "inlineStr") {
    return parseXmlText(cellXml).join(" ").trim();
  }

  const rawValue = /<v>([\s\S]*?)<\/v>/i.exec(cellXml)?.[1] || "";
  return decodeXmlEntities(rawValue).trim();
}

function normalizeHeader(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function isHeaderLikeCell(value) {
  const text = String(value || "").trim();

  if (!text || text.length > 48) {
    return false;
  }

  if (/^[0-9.%-]+$/.test(text)) {
    return false;
  }

  if (/[.!?]/.test(text) && !/_/.test(text)) {
    return false;
  }

  return /[A-Za-z]/.test(text);
}

function parseXmlText(xml) {
  return [...String(xml || "").matchAll(/<t[^>]*>([\s\S]*?)<\/t>/gi)]
    .map((match) => decodeXmlEntities(match[1]))
    .map((value) => value.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function decodeXmlEntities(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#10;/g, "\n")
    .replace(/&#13;/g, "\r")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

function sanitizePlainText(text) {
  return String(text || "")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[^\S\n]+/g, " ")
    .trim();
}

function parseMimeEntity(rawEntity) {
  const normalized = String(rawEntity || "").replace(/\r\n/g, "\n");
  const separatorIndex = normalized.indexOf("\n\n");
  const headerBlock = separatorIndex >= 0 ? normalized.slice(0, separatorIndex) : normalized;
  const body = separatorIndex >= 0 ? normalized.slice(separatorIndex + 2) : "";
  const headers = parseMimeHeaders(headerBlock);
  const contentType = parseContentType(firstHeaderValue(headers, "content-type"));
  const encoding = String(firstHeaderValue(headers, "content-transfer-encoding") || "").trim().toLowerCase();
  const disposition = parseContentDisposition(firstHeaderValue(headers, "content-disposition"));

  if (contentType.type.startsWith("multipart/") && contentType.params.boundary) {
    return {
      headers,
      contentType,
      disposition,
      parts: splitMultipartBody(body, contentType.params.boundary).map(parseMimeEntity),
    };
  }

  return {
    headers,
    contentType,
    disposition,
    body,
    decodedBody: decodeMimeBody(body, encoding),
  };
}

function collectEmailContent(entity, context) {
  if (Array.isArray(entity.parts) && entity.parts.length) {
    for (const part of entity.parts) {
      collectEmailContent(part, context);
    }
    return;
  }

  const mimeType = String(entity.contentType?.type || "text/plain").toLowerCase();
  const fileName = decodeMimeHeaderValue(entity.disposition?.params?.filename || entity.contentType?.params?.name || "");
  const attachmentLike = Boolean(fileName) || /^attachment$/i.test(entity.disposition?.type || "");

  if (attachmentLike && fileName) {
    context.attachments.push({
      name: fileName,
      contentType: mimeType,
      buffer: entity.decodedBody,
    });
    return;
  }

  if (mimeType === "text/plain") {
    const decoded = sanitizePlainText(entity.decodedBody.toString("utf8"));
    if (decoded) {
      context.bodyParts.push(decoded);
    }
    return;
  }

  if (mimeType === "text/html") {
    const html = entity.decodedBody.toString("utf8");
    if (html.trim()) {
      context.htmlParts.push(html);
    }
  }
}

function parseMimeHeaders(headerBlock) {
  const lines = String(headerBlock || "").split("\n");
  const unfolded = [];

  for (const line of lines) {
    if (/^[ \t]/.test(line) && unfolded.length) {
      unfolded[unfolded.length - 1] += ` ${line.trim()}`;
    } else if (line.trim()) {
      unfolded.push(line.trim());
    }
  }

  const headers = {};

  for (const line of unfolded) {
    const separatorIndex = line.indexOf(":");

    if (separatorIndex < 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim().toLowerCase();
    const value = line.slice(separatorIndex + 1).trim();

    headers[key] = headers[key] || [];
    headers[key].push(value);
  }

  return headers;
}

function firstHeaderValue(headers, key) {
  const values = headers?.[String(key || "").toLowerCase()];
  return Array.isArray(values) ? values[0] || "" : "";
}

function parseContentType(rawValue) {
  const [typePart, ...paramParts] = String(rawValue || "text/plain").split(";");
  return {
    type: String(typePart || "text/plain").trim().toLowerCase(),
    params: parseHeaderParams(paramParts),
  };
}

function parseContentDisposition(rawValue) {
  const [typePart, ...paramParts] = String(rawValue || "").split(";");
  return {
    type: String(typePart || "").trim().toLowerCase(),
    params: parseHeaderParams(paramParts),
  };
}

function parseHeaderParams(parts) {
  const params = {};

  for (const part of parts || []) {
    const separatorIndex = part.indexOf("=");

    if (separatorIndex < 0) {
      continue;
    }

    const key = part.slice(0, separatorIndex).trim().toLowerCase();
    let value = part.slice(separatorIndex + 1).trim();

    value = value.replace(/^"(.*)"$/s, "$1");
    params[key] = value;
  }

  return params;
}

function splitMultipartBody(body, boundary) {
  const normalized = String(body || "").replace(/\r\n/g, "\n");
  const marker = `--${boundary}`;
  const closingMarker = `--${boundary}--`;
  const segments = normalized.split(marker).slice(1);

  return segments
    .map((segment) => segment.replace(/^\n/, ""))
    .filter((segment) => segment && !segment.startsWith("--"))
    .map((segment) => {
      const endIndex = segment.indexOf(closingMarker);
      return (endIndex >= 0 ? segment.slice(0, endIndex) : segment).replace(/\n$/, "");
    })
    .filter(Boolean);
}

function decodeMimeBody(body, encoding) {
  const normalizedEncoding = String(encoding || "").trim().toLowerCase();

  if (normalizedEncoding === "base64") {
    return Buffer.from(String(body || "").replace(/\s+/g, ""), "base64");
  }

  if (normalizedEncoding === "quoted-printable") {
    return decodeQuotedPrintableToBuffer(body);
  }

  return Buffer.from(String(body || ""), "latin1");
}

function decodeQuotedPrintableToBuffer(input) {
  const normalized = String(input || "").replace(/=\n/g, "");
  const bytes = [];

  for (let index = 0; index < normalized.length; index += 1) {
    const character = normalized[index];

    if (character === "=" && /^[0-9A-Fa-f]{2}$/.test(normalized.slice(index + 1, index + 3))) {
      bytes.push(Number.parseInt(normalized.slice(index + 1, index + 3), 16));
      index += 2;
    } else {
      bytes.push(character.charCodeAt(0));
    }
  }

  return Buffer.from(bytes);
}

function decodeMimeHeaderValue(value) {
  return sanitizePlainText(
    String(value || "").replace(/=\?([^?]+)\?([BQbq])\?([^?]*)\?=/g, (_match, charset, encoding, text) => {
      const normalizedEncoding = String(encoding || "").toUpperCase();

      if (normalizedEncoding === "B") {
        return Buffer.from(text, "base64").toString(normalizeMimeCharset(charset));
      }

      const quotedPrintable = text.replace(/_/g, " ");
      return decodeQuotedPrintableToBuffer(quotedPrintable).toString(normalizeMimeCharset(charset));
    })
  );
}

function normalizeMimeCharset(charset) {
  const normalized = String(charset || "utf-8").trim().toLowerCase();
  return normalized === "utf8" ? "utf8" : normalized;
}

function htmlToText(html) {
  return sanitizePlainText(
    String(html || "")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
  );
}

function inferType(fileName) {
  return path.extname(fileName || "").replace(".", "").toUpperCase() || "FILE";
}

function columnLettersToIndex(letters) {
  const normalized = String(letters || "").toUpperCase();

  if (!normalized) {
    return 0;
  }

  let index = 0;

  for (const character of normalized) {
    index = index * 26 + (character.charCodeAt(0) - 64);
  }

  return index - 1;
}
