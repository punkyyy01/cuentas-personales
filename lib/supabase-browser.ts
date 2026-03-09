import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const browserSchemaClientInfo =
  process.env.NEXT_PUBLIC_SCHEMA_CACHE_BUSTER?.trim() ||
  process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA?.trim() ||
  'local';

let browserClient: SupabaseClient | null = null;

export function hasSupabaseBrowserConfig() {
  return Boolean(supabaseUrl && supabaseAnonKey);
}

export function getSupabaseBrowserClient() {
  if (!hasSupabaseBrowserConfig()) return null;
  if (browserClient) return browserClient;

  browserClient = createClient(supabaseUrl!, supabaseAnonKey!, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
    global: {
      headers: {
        'x-client-info': `cuentas-web-schema-${browserSchemaClientInfo}`,
      },
    },
  });

  return browserClient;
}
