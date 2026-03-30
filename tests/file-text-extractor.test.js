import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import { extractEmailPackageFromBuffer, extractTextFromBuffer, extractWorkbookSheetsFromBuffer } from "../server/file-text-extractor.js";

const execFileAsync = promisify(execFile);

test("extractTextFromBuffer reads text from xlsx worksheets", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "quotecase-xlsx-test-"));
  const xlDir = path.join(tempDir, "xl");
  const worksheetsDir = path.join(xlDir, "worksheets");
  const relsDir = path.join(tempDir, "_rels");

  await fs.mkdir(worksheetsDir, { recursive: true });
  await fs.mkdir(relsDir, { recursive: true });
  await fs.writeFile(path.join(tempDir, "[Content_Types].xml"), `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
</Types>`);
  await fs.writeFile(path.join(relsDir, ".rels"), `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`);
  await fs.mkdir(path.join(xlDir, "_rels"), { recursive: true });
  await fs.writeFile(path.join(xlDir, "workbook.xml"), `<?xml version="1.0" encoding="UTF-8"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Historical_Orders" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`);
  await fs.writeFile(path.join(xlDir, "_rels", "workbook.xml.rels"), `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`);
  await fs.writeFile(path.join(xlDir, "sharedStrings.xml"), `<?xml version="1.0" encoding="UTF-8"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="2" uniqueCount="2">
  <si><t>Material</t></si>
  <si><t>ASTM A312 TP316L</t></si>
</sst>`);
  await fs.writeFile(path.join(worksheetsDir, "sheet1.xml"), `<?xml version="1.0" encoding="UTF-8"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>
    <row r="1">
      <c r="A1" t="s"><v>0</v></c>
      <c r="B1" t="s"><v>1</v></c>
    </row>
    <row r="2">
      <c r="A2"><v>120</v></c>
      <c r="B2" t="inlineStr"><is><t>lengths</t></is></c>
    </row>
  </sheetData>
</worksheet>`);

  const archivePath = path.join(tempDir, "sample.xlsx");
  await execFileAsync("zip", ["-qr", archivePath, "."], {
    cwd: tempDir,
  });

  const buffer = await fs.readFile(archivePath);
  const extracted = await extractTextFromBuffer({
    fileName: "sample.xlsx",
    type: "XLSX",
    buffer,
  });

  assert.match(extracted, /Historical_Orders/);
  assert.match(extracted, /120 \| lengths/);

  await fs.rm(tempDir, { recursive: true, force: true });
});

test("extractWorkbookSheetsFromBuffer keeps sheet names and record structure", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "quotecase-xlsx-struct-test-"));
  const xlDir = path.join(tempDir, "xl");
  const worksheetsDir = path.join(xlDir, "worksheets");
  const relsDir = path.join(tempDir, "_rels");

  await fs.mkdir(worksheetsDir, { recursive: true });
  await fs.mkdir(relsDir, { recursive: true });
  await fs.mkdir(path.join(xlDir, "_rels"), { recursive: true });
  await fs.writeFile(path.join(tempDir, "[Content_Types].xml"), `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
</Types>`);
  await fs.writeFile(path.join(relsDir, ".rels"), `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`);
  await fs.writeFile(path.join(xlDir, "workbook.xml"), `<?xml version="1.0" encoding="UTF-8"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Historical_Orders" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`);
  await fs.writeFile(path.join(xlDir, "_rels", "workbook.xml.rels"), `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`);
  await fs.writeFile(path.join(worksheetsDir, "sheet1.xml"), `<?xml version="1.0" encoding="UTF-8"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>
    <row r="1">
      <c r="A1" t="inlineStr"><is><t>Order ID</t></is></c>
      <c r="B1" t="inlineStr"><is><t>Material Grade</t></is></c>
    </row>
    <row r="2">
      <c r="A2" t="inlineStr"><is><t>ORD-001</t></is></c>
      <c r="B2" t="inlineStr"><is><t>ASTM A312 TP316L</t></is></c>
    </row>
  </sheetData>
</worksheet>`);

  const archivePath = path.join(tempDir, "structured.xlsx");
  await execFileAsync("zip", ["-qr", archivePath, "."], {
    cwd: tempDir,
  });

  const buffer = await fs.readFile(archivePath);
  const workbook = await extractWorkbookSheetsFromBuffer({
    fileName: "structured.xlsx",
    type: "XLSX",
    buffer,
  });

  assert.equal(workbook.sheets[0].sheetName, "Historical_Orders");
  assert.equal(workbook.sheets[0].rows[0]["Order ID"], "ORD-001");
  assert.equal(workbook.sheets[0].rows[0]["Material Grade"], "ASTM A312 TP316L");

  await fs.rm(tempDir, { recursive: true, force: true });
});

test("extractWorkbookSheetsFromBuffer skips leading description rows before the real header", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "quotecase-xlsx-header-test-"));
  const xlDir = path.join(tempDir, "xl");
  const worksheetsDir = path.join(xlDir, "worksheets");
  const relsDir = path.join(tempDir, "_rels");

  await fs.mkdir(worksheetsDir, { recursive: true });
  await fs.mkdir(relsDir, { recursive: true });
  await fs.mkdir(path.join(xlDir, "_rels"), { recursive: true });
  await fs.writeFile(path.join(tempDir, "[Content_Types].xml"), `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
</Types>`);
  await fs.writeFile(path.join(relsDir, ".rels"), `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`);
  await fs.writeFile(path.join(xlDir, "workbook.xml"), `<?xml version="1.0" encoding="UTF-8"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Historical_Orders" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`);
  await fs.writeFile(path.join(xlDir, "_rels", "workbook.xml.rels"), `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`);
  await fs.writeFile(path.join(worksheetsDir, "sheet1.xml"), `<?xml version="1.0" encoding="UTF-8"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>
    <row r="1">
      <c r="A1" t="inlineStr"><is><t>Synthetic historical quote dataset for calibration.</t></is></c>
    </row>
    <row r="2">
      <c r="A2" t="inlineStr"><is><t>order_id</t></is></c>
      <c r="B2" t="inlineStr"><is><t>material_grade</t></is></c>
      <c r="C2" t="inlineStr"><is><t>quoted_price_usd_per_ton</t></is></c>
    </row>
    <row r="3">
      <c r="A3" t="inlineStr"><is><t>ORD-001</t></is></c>
      <c r="B3" t="inlineStr"><is><t>ASTM A312 TP316L</t></is></c>
      <c r="C3"><v>1250</v></c>
    </row>
  </sheetData>
</worksheet>`);

  const archivePath = path.join(tempDir, "headered.xlsx");
  await execFileAsync("zip", ["-qr", archivePath, "."], { cwd: tempDir });

  const buffer = await fs.readFile(archivePath);
  const workbook = await extractWorkbookSheetsFromBuffer({
    fileName: "headered.xlsx",
    type: "XLSX",
    buffer,
  });

  assert.equal(workbook.sheets[0].rows[0].order_id, "ORD-001");
  assert.equal(workbook.sheets[0].rows[0].material_grade, "ASTM A312 TP316L");

  await fs.rm(tempDir, { recursive: true, force: true });
});

test("extractEmailPackageFromBuffer reads email body and attachments from eml", () => {
  const eml = Buffer.from(
    [
      "From: buyer@example.com",
      "To: rfq@example.com",
      "Subject: RFQ HX-42",
      "MIME-Version: 1.0",
      'Content-Type: multipart/mixed; boundary="frontier"',
      "",
      "--frontier",
      'Content-Type: text/plain; charset="utf-8"',
      "",
      "Please quote the attached ASTM A312 TP316L pipe package for Singapore.",
      "",
      "--frontier",
      'Content-Type: text/plain; name="spec.txt"',
      'Content-Disposition: attachment; filename="spec.txt"',
      "Content-Transfer-Encoding: base64",
      "",
      Buffer.from("ASTM A312 TP316L\nQuantity: 1200 meters\nDestination: Singapore").toString("base64"),
      "--frontier--",
      "",
    ].join("\r\n"),
    "utf8"
  );

  const result = extractEmailPackageFromBuffer({
    fileName: "rfq.eml",
    buffer: eml,
  });

  assert.match(result.bodyText, /RFQ HX-42/);
  assert.match(result.bodyText, /Please quote the attached/);
  assert.equal(result.attachments.length, 1);
  assert.equal(result.attachments[0].name, "spec.txt");
  assert.match(result.attachments[0].buffer.toString("utf8"), /ASTM A312 TP316L/);
});
