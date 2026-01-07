import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Service Role Client for API Routes
// Bypasses RLS and can access console schema

let cachedClient: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (cachedClient) {
    return cachedClient;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error("Supabase URL or Service Role Key is missing");
  }

  cachedClient = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return cachedClient;
}

// Vault operations via public schema wrapper functions
// These wrappers call console schema functions with SECURITY DEFINER
export async function getServiceSecret(
  serviceName: string
): Promise<Record<string, unknown> | null> {
  const client = getClient();
  const { data, error } = await client
    .rpc("mcp_get_service_secret", { service_name: serviceName });

  if (error) {
    throw new Error(`Vault error: ${error.message}`);
  }
  return data as Record<string, unknown> | null;
}

export async function upsertServiceSecret(
  serviceName: string,
  secretData: Record<string, unknown>,
  secretDescription: string
): Promise<void> {
  const client = getClient();
  const { error } = await client
    .rpc("mcp_upsert_service_secret", {
      service_name: serviceName,
      secret_data: secretData,
      secret_description: secretDescription,
    });

  if (error) {
    throw new Error(`Vault upsert error: ${error.message}`);
  }
}
