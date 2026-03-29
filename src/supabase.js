import { createClient } from "@supabase/supabase-js";

let supabaseClient = null;
let supabaseConfigKey = "";

export function configureSupabaseClient({ url, anonKey }) {
  const nextUrl = String(url || "").trim();
  const nextAnonKey = String(anonKey || "").trim();
  const nextConfigKey = `${nextUrl}::${nextAnonKey}`;

  if (!nextUrl || !nextAnonKey) {
    supabaseClient = null;
    supabaseConfigKey = "";
    return null;
  }

  if (supabaseClient && supabaseConfigKey === nextConfigKey) {
    return supabaseClient;
  }

  supabaseClient = createClient(nextUrl, nextAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
  supabaseConfigKey = nextConfigKey;
  return supabaseClient;
}

export function getSupabaseClient() {
  return supabaseClient;
}

export async function getCurrentSession() {
  if (!supabaseClient) {
    return null;
  }

  const { data, error } = await supabaseClient.auth.getSession();

  if (error) {
    throw error;
  }

  return data.session || null;
}

export function onSupabaseAuthStateChange(callback) {
  if (!supabaseClient) {
    return { data: { subscription: { unsubscribe() {} } } };
  }

  return supabaseClient.auth.onAuthStateChange((_event, session) => {
    callback(session || null);
  });
}

export async function signInWithPassword({ email, password }) {
  if (!supabaseClient) {
    throw new Error("Supabase auth is not configured.");
  }

  const { data, error } = await supabaseClient.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    throw error;
  }

  return data.session || null;
}

export async function signOutSession() {
  if (!supabaseClient) {
    return;
  }

  const { error } = await supabaseClient.auth.signOut();

  if (error) {
    throw error;
  }
}

export async function getAccessToken() {
  const session = await getCurrentSession();
  return session?.access_token || "";
}
