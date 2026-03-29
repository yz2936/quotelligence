let supabaseClient = null;
let supabaseConfigKey = "";
let createClientLoader = null;

export async function configureSupabaseClient({ url, anonKey }) {
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

  const createClient = await loadCreateClient();
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

async function loadCreateClient() {
  if (!createClientLoader) {
    createClientLoader = importClientModule();
  }

  const module = await createClientLoader;
  return module.createClient;
}

async function importClientModule() {
  if (typeof window !== "undefined" && typeof document !== "undefined") {
    return import("https://esm.sh/@supabase/supabase-js@2");
  }

  return import("@supabase/supabase-js");
}
