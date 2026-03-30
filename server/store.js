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

export async function listCases(ownerUserId = "") {
  if (shouldUseDatabase()) {
    await ensureDatabaseSchema();
    const scope = normalizeOwnerScope(ownerUserId);
    const result = scope
      ? await getPool().query(
          `
            SELECT data
            FROM cases
            WHERE owner_user_id = $1
            ORDER BY COALESCE(created_at, '') DESC, case_id DESC
          `,
          [scope]
        )
      : await getPool().query(
          `
            SELECT data
            FROM cases
            ORDER BY COALESCE(created_at, '') DESC, case_id DESC
          `
        );

    return result.rows.map((row) => hydrateJsonRecord(row.data));
  }

  const store = loadFileStore();
  return store.cases
    .filter((entry) => matchesOwnerScope(entry, ownerUserId))
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
}

export async function listComplaints(ownerUserId = "") {
  if (shouldUseDatabase()) {
    await ensureDatabaseSchema();
    const scope = normalizeOwnerScope(ownerUserId);
    const result = scope
      ? await getPool().query(
          `
            SELECT data
            FROM complaints
            WHERE owner_user_id = $1
            ORDER BY COALESCE(created_at, '') DESC, complaint_id DESC
          `,
          [scope]
        )
      : await getPool().query(
          `
            SELECT data
            FROM complaints
            ORDER BY COALESCE(created_at, '') DESC, complaint_id DESC
          `
        );

    return result.rows.map((row) => hydrateJsonRecord(row.data));
  }

  const store = loadFileStore();
  return store.complaints
    .filter((entry) => matchesOwnerScope(entry, ownerUserId))
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
}

export async function getComplaint(complaintId, ownerUserId = "") {
  if (shouldUseDatabase()) {
    await ensureDatabaseSchema();
    const scope = normalizeOwnerScope(ownerUserId);
    const result = scope
      ? await getPool().query(
          `
            SELECT data
            FROM complaints
            WHERE complaint_id = $1 AND owner_user_id = $2
            LIMIT 1
          `,
          [complaintId, scope]
        )
      : await getPool().query(
          `
            SELECT data
            FROM complaints
            WHERE complaint_id = $1
            LIMIT 1
          `,
          [complaintId]
        );

    return result.rowCount ? hydrateJsonRecord(result.rows[0].data) : null;
  }

  const store = loadFileStore();
  return store.complaints.find((entry) => entry.complaintId === complaintId && matchesOwnerScope(entry, ownerUserId)) || null;
}

export async function saveComplaint(complaintRecord, ownerUserId = "") {
  const recordToSave = withOwnerScope(complaintRecord, ownerUserId);

  if (shouldUseDatabase()) {
    await ensureDatabaseSchema();
    await getPool().query(
      `
        INSERT INTO complaints (complaint_id, owner_user_id, created_at, updated_at, data)
        VALUES ($1, $2, $3, $4, $5::jsonb)
        ON CONFLICT (complaint_id) DO UPDATE
        SET owner_user_id = EXCLUDED.owner_user_id,
            created_at = EXCLUDED.created_at,
            updated_at = EXCLUDED.updated_at,
            data = EXCLUDED.data,
            stored_at = NOW()
      `,
      [
        recordToSave.complaintId,
        String(recordToSave.ownerUserId || ""),
        String(recordToSave.createdAt || ""),
        String(recordToSave.updatedAt || recordToSave.createdAt || ""),
        JSON.stringify(recordToSave),
      ]
    );

    return recordToSave;
  }

  const store = loadFileStore();
  const existingIndex = store.complaints.findIndex((entry) => entry.complaintId === recordToSave.complaintId);

  if (existingIndex >= 0) {
    store.complaints[existingIndex] = recordToSave;
  } else {
    store.complaints.push(recordToSave);
  }

  writeFileStore(store);
  return recordToSave;
}

export async function getCase(caseId, ownerUserId = "") {
  if (shouldUseDatabase()) {
    await ensureDatabaseSchema();
    const scope = normalizeOwnerScope(ownerUserId);
    const result = scope
      ? await getPool().query(
          `
            SELECT data
            FROM cases
            WHERE case_id = $1 AND owner_user_id = $2
            LIMIT 1
          `,
          [caseId, scope]
        )
      : await getPool().query(
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
  return store.cases.find((entry) => entry.caseId === caseId && matchesOwnerScope(entry, ownerUserId)) || null;
}

export async function saveCase(caseRecord, ownerUserId = "") {
  const recordToSave = withOwnerScope(caseRecord, ownerUserId);

  if (shouldUseDatabase()) {
    await ensureDatabaseSchema();
    await getPool().query(
      `
        INSERT INTO cases (case_id, owner_user_id, created_at, updated_at, data)
        VALUES ($1, $2, $3, $4, $5::jsonb)
        ON CONFLICT (case_id) DO UPDATE
        SET owner_user_id = EXCLUDED.owner_user_id,
            created_at = EXCLUDED.created_at,
            updated_at = EXCLUDED.updated_at,
            data = EXCLUDED.data,
            stored_at = NOW()
      `,
      [
        recordToSave.caseId,
        String(recordToSave.ownerUserId || ""),
        String(recordToSave.createdAt || ""),
        String(recordToSave.updatedAt || recordToSave.createdAt || ""),
        JSON.stringify(recordToSave),
      ]
    );

    return recordToSave;
  }

  const store = loadFileStore();
  const existingIndex = store.cases.findIndex((entry) => entry.caseId === recordToSave.caseId);

  if (existingIndex >= 0) {
    store.cases[existingIndex] = recordToSave;
  } else {
    store.cases.push(recordToSave);
  }

  writeFileStore(store);
  return recordToSave;
}

export async function deleteCase(caseId, ownerUserId = "") {
  if (shouldUseDatabase()) {
    await ensureDatabaseSchema();
    const scope = normalizeOwnerScope(ownerUserId);
    const result = scope
      ? await getPool().query(
          `
            DELETE FROM cases
            WHERE case_id = $1 AND owner_user_id = $2
          `,
          [caseId, scope]
        )
      : await getPool().query(
          `
            DELETE FROM cases
            WHERE case_id = $1
          `,
          [caseId]
        );

    return result.rowCount > 0;
  }

  const store = loadFileStore();
  const nextCases = store.cases.filter((entry) => !(entry.caseId === caseId && matchesOwnerScope(entry, ownerUserId)));

  if (nextCases.length === store.cases.length) {
    return false;
  }

  writeFileStore({
    ...store,
    cases: nextCases,
  });
  return true;
}

export async function listKnowledgeFiles(ownerUserId = "") {
  if (shouldUseDatabase()) {
    await ensureDatabaseSchema();
    const scope = normalizeOwnerScope(ownerUserId);
    const result = scope
      ? await getPool().query(
          `
            SELECT data
            FROM knowledge_files
            WHERE owner_user_id = $1
            ORDER BY COALESCE(uploaded_at, '') DESC, knowledge_file_id DESC
          `,
          [scope]
        )
      : await getPool().query(
          `
            SELECT data
            FROM knowledge_files
            ORDER BY COALESCE(uploaded_at, '') DESC, knowledge_file_id DESC
          `
        );

    return result.rows.map((row) => hydrateJsonRecord(row.data));
  }

  const store = loadFileStore();
  return store.knowledgeFiles
    .filter((entry) => matchesOwnerScope(entry, ownerUserId))
    .sort((a, b) => String(b.uploadedAt || "").localeCompare(String(a.uploadedAt || "")));
}

export async function getKnowledgeFile(knowledgeFileId, ownerUserId = "") {
  if (shouldUseDatabase()) {
    await ensureDatabaseSchema();
    const scope = normalizeOwnerScope(ownerUserId);
    const result = scope
      ? await getPool().query(
          `
            SELECT data
            FROM knowledge_files
            WHERE knowledge_file_id = $1 AND owner_user_id = $2
            LIMIT 1
          `,
          [knowledgeFileId, scope]
        )
      : await getPool().query(
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
  return store.knowledgeFiles.find((entry) => entry.knowledgeFileId === knowledgeFileId && matchesOwnerScope(entry, ownerUserId)) || null;
}

export async function saveKnowledgeFile(knowledgeFile, ownerUserId = "") {
  const recordToSave = withOwnerScope(knowledgeFile, ownerUserId);

  if (shouldUseDatabase()) {
    await ensureDatabaseSchema();
    await getPool().query(
      `
        INSERT INTO knowledge_files (knowledge_file_id, owner_user_id, uploaded_at, data)
        VALUES ($1, $2, $3, $4::jsonb)
        ON CONFLICT (knowledge_file_id) DO UPDATE
        SET owner_user_id = EXCLUDED.owner_user_id,
            uploaded_at = EXCLUDED.uploaded_at,
            data = EXCLUDED.data,
            stored_at = NOW()
      `,
      [
        recordToSave.knowledgeFileId,
        String(recordToSave.ownerUserId || ""),
        String(recordToSave.uploadedAt || ""),
        JSON.stringify(recordToSave),
      ]
    );

    return recordToSave;
  }

  const store = loadFileStore();
  const existingIndex = store.knowledgeFiles.findIndex((entry) => entry.knowledgeFileId === recordToSave.knowledgeFileId);

  if (existingIndex >= 0) {
    store.knowledgeFiles[existingIndex] = recordToSave;
  } else {
    store.knowledgeFiles.push(recordToSave);
  }

  writeFileStore(store);
  return recordToSave;
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
  return Boolean(getDatabaseUrl());
}

function getPool() {
  if (!pool) {
    const connectionString = getDatabaseUrl();
    pool = new Pool({
      connectionString: shouldUseSecureDatabaseConnection()
        ? stripConnectionStringSslParams(connectionString)
        : connectionString,
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
            owner_user_id TEXT,
            created_at TEXT,
            updated_at TEXT,
            data JSONB NOT NULL,
            stored_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          )
        `);
        await client.query(`ALTER TABLE cases ADD COLUMN IF NOT EXISTS owner_user_id TEXT`);
        await client.query(`CREATE INDEX IF NOT EXISTS cases_owner_user_id_idx ON cases (owner_user_id)`);

        await client.query(`
          CREATE TABLE IF NOT EXISTS knowledge_files (
            knowledge_file_id TEXT PRIMARY KEY,
            owner_user_id TEXT,
            uploaded_at TEXT,
            data JSONB NOT NULL,
            stored_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          )
        `);
        await client.query(`ALTER TABLE knowledge_files ADD COLUMN IF NOT EXISTS owner_user_id TEXT`);
        await client.query(`CREATE INDEX IF NOT EXISTS knowledge_files_owner_user_id_idx ON knowledge_files (owner_user_id)`);

        await client.query(`
          CREATE TABLE IF NOT EXISTS complaints (
            complaint_id TEXT PRIMARY KEY,
            owner_user_id TEXT,
            created_at TEXT,
            updated_at TEXT,
            data JSONB NOT NULL,
            stored_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          )
        `);
        await client.query(`ALTER TABLE complaints ADD COLUMN IF NOT EXISTS owner_user_id TEXT`);
        await client.query(`CREATE INDEX IF NOT EXISTS complaints_owner_user_id_idx ON complaints (owner_user_id)`);
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
    const url = new URL(getDatabaseUrl());
    return !["localhost", "127.0.0.1"].includes(url.hostname);
  } catch {
    return false;
  }
}

function getDatabaseUrl() {
  return String(
    process.env.DATABASE_URL ||
      process.env.POSTGRES_URL ||
      process.env.POSTGRES_PRISMA_URL ||
      process.env.STORAGE_POSTGRES_URL ||
      process.env.STORAGE_POSTGRES_PRISMA_URL ||
      process.env.STORAGE_POSTGRES_URL_NON_POOLING ||
      ""
  ).trim();
}

function stripConnectionStringSslParams(connectionString) {
  try {
    const url = new URL(connectionString);
    url.searchParams.delete("sslmode");
    url.searchParams.delete("sslcert");
    url.searchParams.delete("sslkey");
    url.searchParams.delete("sslrootcert");
    return url.toString();
  } catch {
    return connectionString;
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

function normalizeOwnerScope(ownerUserId) {
  return String(ownerUserId || "").trim();
}

function matchesOwnerScope(record, ownerUserId) {
  const scope = normalizeOwnerScope(ownerUserId);

  if (!scope) {
    return true;
  }

  return String(record?.ownerUserId || "").trim() === scope;
}

function withOwnerScope(record, ownerUserId) {
  const scope = normalizeOwnerScope(ownerUserId);

  if (!scope) {
    return record;
  }

  return {
    ...record,
    ownerUserId: scope,
  };
}

function loadFileStore() {
  try {
    const raw = fs.readFileSync(storeFilePath, "utf8");
    const parsed = JSON.parse(raw);

    return {
      cases: Array.isArray(parsed?.cases) ? parsed.cases : [],
      complaints: Array.isArray(parsed?.complaints) ? parsed.complaints : [],
      knowledgeFiles: Array.isArray(parsed?.knowledgeFiles) ? parsed.knowledgeFiles : [],
    };
  } catch {
    return {
      cases: [],
      complaints: [],
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
