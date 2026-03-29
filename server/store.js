import fs from "node:fs";
import os from "node:os";
import path from "node:path";

let storeFilePath = process.env.QUOTELLIGENCE_STORE_FILE || path.join(os.tmpdir(), "quotelligence-store.json");

export function listCases() {
  const store = loadStore();
  return [...store.cases].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getCase(caseId) {
  const store = loadStore();
  return store.cases.find((entry) => entry.caseId === caseId) || null;
}

export function saveCase(caseRecord) {
  const store = loadStore();
  const existingIndex = store.cases.findIndex((entry) => entry.caseId === caseRecord.caseId);

  if (existingIndex >= 0) {
    store.cases[existingIndex] = caseRecord;
  } else {
    store.cases.push(caseRecord);
  }

  writeStore(store);
  return caseRecord;
}

export function listKnowledgeFiles() {
  const store = loadStore();
  return [...store.knowledgeFiles].sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
}

export function getKnowledgeFile(knowledgeFileId) {
  const store = loadStore();
  return store.knowledgeFiles.find((entry) => entry.knowledgeFileId === knowledgeFileId) || null;
}

export function saveKnowledgeFile(knowledgeFile) {
  const store = loadStore();
  const existingIndex = store.knowledgeFiles.findIndex((entry) => entry.knowledgeFileId === knowledgeFile.knowledgeFileId);

  if (existingIndex >= 0) {
    store.knowledgeFiles[existingIndex] = knowledgeFile;
  } else {
    store.knowledgeFiles.push(knowledgeFile);
  }

  writeStore(store);
  return knowledgeFile;
}

export function __resetStoreForTests(nextFilePath) {
  storeFilePath = nextFilePath || path.join(os.tmpdir(), `quotelligence-store-test-${Date.now()}.json`);
  safeDelete(storeFilePath);
}

function loadStore() {
  try {
    const raw = fs.readFileSync(storeFilePath, "utf8");
    const parsed = JSON.parse(raw);

    return {
      cases: Array.isArray(parsed?.cases) ? parsed.cases : [],
      knowledgeFiles: Array.isArray(parsed?.knowledgeFiles) ? parsed.knowledgeFiles : [],
    };
  } catch {
    return {
      cases: [],
      knowledgeFiles: [],
    };
  }
}

function writeStore(store) {
  fs.mkdirSync(path.dirname(storeFilePath), { recursive: true });
  const tempPath = `${storeFilePath}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(store, null, 2), "utf8");
  fs.renameSync(tempPath, storeFilePath);
}

function safeDelete(targetPath) {
  try {
    fs.rmSync(targetPath, { force: true });
  } catch {
    // Ignore test cleanup failures.
  }
}
