// MCP Vault Access - Uses console schema RPC functions
import { createClient, SupabaseClient } from "@supabase/supabase-js";

let cachedClient: SupabaseClient | null = null;

function getAnonClient(): SupabaseClient {
  if (cachedClient) {
    return cachedClient;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Supabase URL or Anon Key is missing");
  }

  cachedClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return cachedClient;
}

/**
 * Get user service secret via console.get_user_service_secret_by_id RPC
 * Uses SECURITY DEFINER to access vault
 */
export async function getUserSecret(
  userId: string,
  serviceName: string
): Promise<Record<string, unknown> | null> {
  const client = getAnonClient();
  const { data, error } = await client
    .schema("console")
    .rpc("get_user_service_secret_by_id", {
      p_user_id: userId,
      p_service_name: serviceName,
    });

  if (error) {
    throw new Error(`Vault error: ${error.message}`);
  }
  return data as Record<string, unknown> | null;
}

/**
 * Upsert user service secret via console.upsert_user_service_secret RPC
 * Uses SECURITY DEFINER to access vault
 */
export async function upsertUserSecret(
  userId: string,
  serviceName: string,
  secretData: Record<string, unknown>,
  description?: string
): Promise<string> {
  const client = getAnonClient();
  const { data, error } = await client
    .schema("console")
    .rpc("upsert_user_service_secret", {
      p_user_id: userId,
      p_service_name: serviceName,
      p_secret_data: secretData,
      p_description: description ?? null,
    });

  if (error) {
    throw new Error(`Vault upsert error: ${error.message}`);
  }
  return data as string;
}
