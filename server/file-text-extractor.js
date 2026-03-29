import path from "node:path";
import JSZip from "jszip";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";

export async function extractTextFromBuffer({ fileName, type, buffer }) {
  const normalizedType = String(type || inferType(fileName)).toUpperCase();

  if (["TXT", "EML", "CSV", "MD"].includes(normalizedType)) {
    return buffer.toString("utf8");
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

async function extractPdfText(buffer) {
  try {
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
