import pg from "pg";

const databaseUrl = getDatabaseUrl();

if (!databaseUrl) {
  console.error("A Postgres connection string is required to reset the database.");
  process.exit(1);
}

const pool = new pg.Pool({
  connectionString: shouldUseSecureDatabaseConnection(databaseUrl) ? stripConnectionStringSslParams(databaseUrl) : databaseUrl,
  ssl: shouldUseSecureDatabaseConnection(databaseUrl) ? { rejectUnauthorized: false } : undefined,
});

try {
  await pool.query("TRUNCATE TABLE analyst_threads, complaints, knowledge_files, cases");
  console.log("Database reset complete: cases, knowledge files, complaints, and analyst threads were cleared.");
} finally {
  await pool.end();
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

function shouldUseSecureDatabaseConnection(connectionString) {
  if (String(process.env.PGSSLMODE || "").toLowerCase() === "disable") {
    return false;
  }

  try {
    const url = new URL(connectionString);
    return !["localhost", "127.0.0.1"].includes(url.hostname);
  } catch {
    return false;
  }
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
