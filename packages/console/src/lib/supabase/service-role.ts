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

// =============================================================================
// Legacy: Single-tenant vault access (for backward compatibility)
// =============================================================================
export async function getServiceSecret(
  serviceName: string
): Promise<Record<string, unknown> | null> {
  const client = getClient();
  const { data, error } = await client.rpc("mcp_get_service_secret", {
    service_name: serviceName,
  });

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
  const { error } = await client.rpc("mcp_upsert_service_secret", {
    service_name: serviceName,
    secret_data: secretData,
    secret_description: secretDescription,
  });

  if (error) {
    throw new Error(`Vault upsert error: ${error.message}`);
  }
}

// =============================================================================
// Multi-tenant: User-specific vault access via user_secret_refs
// =============================================================================
export async function getUserServiceSecret(
  userId: string,
  serviceName: string
): Promise<Record<string, unknown> | null> {
  const client = getClient();
  const { data, error } = await client.rpc("mcp_get_user_service_secret", {
    p_user_id: userId,
    p_service_name: serviceName,
  });

  if (error) {
    throw new Error(`Vault error: ${error.message}`);
  }
  return data as Record<string, unknown> | null;
}

export async function upsertUserServiceSecret(
  userId: string,
  serviceName: string,
  secretData: Record<string, unknown>,
  secretDescription?: string
): Promise<string> {
  const client = getClient();
  const { data, error } = await client.rpc("mcp_upsert_user_service_secret", {
    p_user_id: userId,
    p_service_name: serviceName,
    p_secret_data: secretData,
    p_description: secretDescription ?? null,
  });

  if (error) {
    throw new Error(`Vault upsert error: ${error.message}`);
  }
  return data as string;
}
