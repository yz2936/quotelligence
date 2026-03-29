import { createClient } from "@supabase/supabase-js";

let supabaseAdminClient = null;
let supabaseAdminKey = "";

export function getPublicSupabaseConfig() {
  return {
    configured: Boolean(getPublicSupabaseUrl() && getSupabaseAnonKey()),
    url: getPublicSupabaseUrl(),
    anonKey: getSupabaseAnonKey(),
  };
}

export async function authenticateRequest(req) {
  const token = readBearerToken(req);

  if (!token) {
    return {
      ok: false,
      statusCode: 401,
      error: "Authentication required.",
    };
  }

  const client = getSupabaseAdminClient();

  if (!client) {
    return {
      ok: false,
      statusCode: 500,
      error: "Supabase auth is not configured on the server.",
    };
  }

  const { data, error } = await client.auth.getUser(token);

  if (error || !data?.user) {
    return {
      ok: false,
      statusCode: 401,
      error: "Authentication failed.",
    };
  }

  return {
    ok: true,
    user: data.user,
  };
}

function getSupabaseAdminClient() {
  const url = getPublicSupabaseUrl();
  const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  const configKey = `${url}::${serviceRoleKey}`;

  if (!url || !serviceRoleKey) {
    return null;
  }

  if (supabaseAdminClient && supabaseAdminKey === configKey) {
    return supabaseAdminClient;
  }

  supabaseAdminClient = createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
  supabaseAdminKey = configKey;
  return supabaseAdminClient;
}

function getPublicSupabaseUrl() {
  return String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
}

function getSupabaseAnonKey() {
  return String(process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();
}

function readBearerToken(req) {
  const authHeader = String(req.headers.authorization || req.headers.Authorization || "").trim();

  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return "";
  }

  return authHeader.slice(7).trim();
}
