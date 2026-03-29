import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import pg from "pg";

const { Pool } = pg;

let storeFilePath = process.env.QUOTELLIGENCE_STORE_FILE || path.join(os.tmpdir(), "quotelligence-store.json");
let pool = null;
let schemaPromise = null;

export async function getStoreHealth() {
  if (shouldUseDatabase()) {
    try {
      await ensureDatabaseSchema();
      await getPool().query("SELECT 1");
      return { mode: "database", healthy: true };
    } catch (error) {
      return {
        mode: "database",
        healthy: false,
        details: error instanceof Error ? error.message : String(error),
      };
    }
  }

  return { mode: "file", healthy: true };
}

export async function listCases() {
  if (shouldUseDatabase()) {
    await ensureDatabaseSchema();
    const result = await getPool().query(
      `
        SELECT data
        FROM cases
        ORDER BY COALESCE(created_at, '') DESC, case_id DESC
      `
    );

    return result.rows.map((row) => hydrateJsonRecord(row.data));
  }

  const store = loadFileStore();
  return [...store.cases].sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
}

export async function getCase(caseId) {
  if (shouldUseDatabase()) {
    await ensureDatabaseSchema();
    const result = await getPool().query(
      `
        SELECT data
        FROM cases
        WHERE case_id = $1
        LIMIT 1
      `,
      [caseId]
    );

    return result.rowCount ? hydrateJsonRecord(result.rows[0].data) : null;
  }

  const store = loadFileStore();
  return store.cases.find((entry) => entry.caseId === caseId) || null;
}

export async function saveCase(caseRecord) {
  if (shouldUseDatabase()) {
    await ensureDatabaseSchema();
    await getPool().query(
      `
        INSERT INTO cases (case_id, created_at, updated_at, data)
        VALUES ($1, $2, $3, $4::jsonb)
        ON CONFLICT (case_id) DO UPDATE
        SET created_at = EXCLUDED.created_at,
            updated_at = EXCLUDED.updated_at,
            data = EXCLUDED.data,
            stored_at = NOW()
      `,
      [
        caseRecord.caseId,
        String(caseRecord.createdAt || ""),
        String(caseRecord.updatedAt || caseRecord.createdAt || ""),
        JSON.stringify(caseRecord),
      ]
    );

    return caseRecord;
  }

  const store = loadFileStore();
  const existingIndex = store.cases.findIndex((entry) => entry.caseId === caseRecord.caseId);

  if (existingIndex >= 0) {
    store.cases[existingIndex] = caseRecord;
  } else {
    store.cases.push(caseRecord);
  }

  writeFileStore(store);
  return caseRecord;
}

export async function deleteCase(caseId) {
  if (shouldUseDatabase()) {
    await ensureDatabaseSchema();
    const result = await getPool().query(
      `
        DELETE FROM cases
        WHERE case_id = $1
      `,
      [caseId]
    );

    return result.rowCount > 0;
  }

  const store = loadFileStore();
  const nextCases = store.cases.filter((entry) => entry.caseId !== caseId);

  if (nextCases.length === store.cases.length) {
    return false;
  }

  writeFileStore({
    ...store,
    cases: nextCases,
  });
  return true;
}

export async function listKnowledgeFiles() {
  if (shouldUseDatabase()) {
    await ensureDatabaseSchema();
    const result = await getPool().query(
      `
        SELECT data
        FROM knowledge_files
        ORDER BY COALESCE(uploaded_at, '') DESC, knowledge_file_id DESC
      `
    );

    return result.rows.map((row) => hydrateJsonRecord(row.data));
  }

  const store = loadFileStore();
  return [...store.knowledgeFiles].sort((a, b) => String(b.uploadedAt || "").localeCompare(String(a.uploadedAt || "")));
}

export async function getKnowledgeFile(knowledgeFileId) {
  if (shouldUseDatabase()) {
    await ensureDatabaseSchema();
    const result = await getPool().query(
      `
        SELECT data
        FROM knowledge_files
        WHERE knowledge_file_id = $1
        LIMIT 1
      `,
      [knowledgeFileId]
    );

    return result.rowCount ? hydrateJsonRecord(result.rows[0].data) : null;
  }

  const store = loadFileStore();
  return store.knowledgeFiles.find((entry) => entry.knowledgeFileId === knowledgeFileId) || null;
}

export async function saveKnowledgeFile(knowledgeFile) {
  if (shouldUseDatabase()) {
    await ensureDatabaseSchema();
    await getPool().query(
      `
        INSERT INTO knowledge_files (knowledge_file_id, uploaded_at, data)
        VALUES ($1, $2, $3::jsonb)
        ON CONFLICT (knowledge_file_id) DO UPDATE
        SET uploaded_at = EXCLUDED.uploaded_at,
            data = EXCLUDED.data,
            stored_at = NOW()
      `,
      [
        knowledgeFile.knowledgeFileId,
        String(knowledgeFile.uploadedAt || ""),
        JSON.stringify(knowledgeFile),
      ]
    );

    return knowledgeFile;
  }

  const store = loadFileStore();
  const existingIndex = store.knowledgeFiles.findIndex((entry) => entry.knowledgeFileId === knowledgeFile.knowledgeFileId);

  if (existingIndex >= 0) {
    store.knowledgeFiles[existingIndex] = knowledgeFile;
  } else {
    store.knowledgeFiles.push(knowledgeFile);
  }

  writeFileStore(store);
  return knowledgeFile;
}

export function getStoreMode() {
  return shouldUseDatabase() ? "database" : "file";
}

export function __resetStoreForTests(nextFilePath) {
  storeFilePath = nextFilePath || path.join(os.tmpdir(), `quotelligence-store-test-${Date.now()}.json`);
  schemaPromise = null;
  safeDelete(storeFilePath);

  if (pool) {
    pool.end().catch(() => {
      // Ignore test teardown failures.
    });
    pool = null;
  }
}

function shouldUseDatabase() {
  return Boolean(String(process.env.DATABASE_URL || "").trim());
}

function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: shouldUseSecureDatabaseConnection() ? { rejectUnauthorized: false } : undefined,
    });
  }

  return pool;
}

async function ensureDatabaseSchema() {
  if (!shouldUseDatabase()) {
    return;
  }

  if (!schemaPromise) {
    schemaPromise = (async () => {
      const client = await getPool().connect();

      try {
        await client.query(`
          CREATE TABLE IF NOT EXISTS cases (
            case_id TEXT PRIMARY KEY,
            created_at TEXT,
            updated_at TEXT,
            data JSONB NOT NULL,
            stored_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          )
        `);

        await client.query(`
          CREATE TABLE IF NOT EXISTS knowledge_files (
            knowledge_file_id TEXT PRIMARY KEY,
            uploaded_at TEXT,
            data JSONB NOT NULL,
            stored_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          )
        `);
      } finally {
        client.release();
      }
    })().catch((error) => {
      schemaPromise = null;
      throw error;
    });
  }

  await schemaPromise;
}

function shouldUseSecureDatabaseConnection() {
  if (String(process.env.PGSSLMODE || "").toLowerCase() === "disable") {
    return false;
  }

  try {
    const url = new URL(process.env.DATABASE_URL);
    return !["localhost", "127.0.0.1"].includes(url.hostname);
  } catch {
    return false;
  }
}

function hydrateJsonRecord(value) {
  if (!value) {
    return null;
  }

  if (typeof value === "string") {
    return JSON.parse(value);
  }

  return value;
}

function loadFileStore() {
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

function writeFileStore(store) {
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
