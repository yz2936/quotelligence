import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  __resetStoreForTests,
  getCase,
  getKnowledgeFile,
  listCases,
  listKnowledgeFiles,
  saveCase,
  saveKnowledgeFile,
} from "../server/store.js";

test("store persists cases and knowledge files to disk-backed state", () => {
  const storePath = path.join(os.tmpdir(), `quotelligence-store-test-${Date.now()}.json`);
  __resetStoreForTests(storePath);

  saveCase({
    caseId: "QC-100",
    createdAt: "2026-03-28",
    customerName: "Acme Industrial",
  });
  saveKnowledgeFile({
    knowledgeFileId: "kf-100",
    uploadedAt: "2026-03-28T12:00:00.000Z",
    name: "pricing-sheet.txt",
  });

  assert.equal(getCase("QC-100")?.customerName, "Acme Industrial");
  assert.equal(getKnowledgeFile("kf-100")?.name, "pricing-sheet.txt");
  assert.equal(listCases().length, 1);
  assert.equal(listKnowledgeFiles().length, 1);

  const persisted = JSON.parse(fs.readFileSync(storePath, "utf8"));
  assert.equal(persisted.cases.length, 1);
  assert.equal(persisted.knowledgeFiles.length, 1);
});
