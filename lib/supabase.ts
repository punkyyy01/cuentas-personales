import { createClient } from '@supabase/supabase-js';
import { SERVICE_ROLE_KEY } from '@/lib/gmail';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = SERVICE_ROLE_KEY!;
const schemaCacheBuster =
  process.env.SUPABASE_SCHEMA_CACHE_BUSTER?.trim() ||
  process.env.VERCEL_GIT_COMMIT_SHA?.trim() ||
  'local';

// Cliente con permisos de admin para operaciones del backend (API routes)
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
  global: {
    headers: {
      'x-client-info': `cuentas-admin-schema-${schemaCacheBuster}`,
    },
  },
});
