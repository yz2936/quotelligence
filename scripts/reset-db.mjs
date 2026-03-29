import pg from "pg";

const databaseUrl = String(process.env.DATABASE_URL || "").trim();

if (!databaseUrl) {
  console.error("DATABASE_URL is required to reset the database.");
  process.exit(1);
}

const pool = new pg.Pool({
  connectionString: databaseUrl,
  ssl: shouldUseSecureDatabaseConnection(databaseUrl) ? { rejectUnauthorized: false } : undefined,
});

try {
  await pool.query("TRUNCATE TABLE knowledge_files, cases");
  console.log("Database reset complete: cases and knowledge_files were cleared.");
} finally {
  await pool.end();
}

function shouldUseSecureDatabaseConnection(connectionString) {
  try {
    const url = new URL(connectionString);
    return !["localhost", "127.0.0.1"].includes(url.hostname);
  } catch {
    return false;
  }
}
