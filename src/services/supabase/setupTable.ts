import "https://deno.land/std@0.203.0/dotenv/load.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

// Get environment variables
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set in .env");
}

// Create Supabase client with service role key (required for DDL operations)
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

/**
 * Execute SQL file to create toggl_time_entries table
 */
async function setupTogglTimeEntriesTable() {
  console.log("Reading SQL file...");

  // Read the SQL file
  // Use relative path from current working directory instead of import.meta.url
  const sqlFilePath = "./src/services/supabase/create_toggl_time_entries.sql";
  const sqlContent = await Deno.readTextFile(sqlFilePath);

  console.log("Executing SQL on Supabase...");
  console.log("---");
  console.log(sqlContent);
  console.log("---");

  // Try using Supabase Management API to execute SQL
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "Prefer": "return=representation",
      },
      body: JSON.stringify({
        query: sqlContent,
      }),
    });

    if (response.ok) {
      console.log("✓ Table created successfully via REST API!");
      return;
    }
  } catch (error) {
    console.log("REST API method failed, trying postgres connection...");
  }

  // Try using postgres connection
  await executeViaPostgres(sqlContent);
}

/**
 * Alternative method: Execute SQL via direct postgres connection
 */
async function executeViaPostgres(sqlContent: string) {
  // Extract database connection info from SUPABASE_URL
  const url = new URL(SUPABASE_URL);
  const projectRef = url.hostname.split('.')[0];

  console.log("\nTo execute this SQL, you can use one of these methods:");
  console.log("\n1. Using Supabase Dashboard:");
  console.log(`   - Go to ${SUPABASE_URL}/project/${projectRef}/sql`);
  console.log("   - Paste the SQL content and run it");

  console.log("\n2. Using psql command line:");
  console.log(`   psql "postgresql://postgres:[DB_PASSWORD]@db.${projectRef}.supabase.co:5432/postgres" -f src/services/supabase/create_toggl_time_entries.sql`);

  console.log("\n3. Using Deno postgres library:");
  console.log("   (Install: import { Client } from 'https://deno.land/x/postgres/mod.ts')");

  // Try using Deno postgres client
  try {
    const { Client } = await import("https://deno.land/x/postgres@v0.17.0/mod.ts");
    const DB_PASSWORD = Deno.env.get("DB_PASSWORD");

    if (!DB_PASSWORD) {
      throw new Error("DB_PASSWORD not found in .env");
    }

    const SUPABASE_PROJECT_ID = Deno.env.get("SUPABASE_PROJECT_ID");
    if (!SUPABASE_PROJECT_ID) {
      throw new Error("SUPABASE_PROJECT_ID not found in .env");
    }

    // Use Session Pooler for IPv4 networks
    const client = new Client({
      user: `postgres.${SUPABASE_PROJECT_ID}`,
      password: DB_PASSWORD,
      database: "postgres",
      hostname: "aws-0-ap-southeast-1.pooler.supabase.com",
      port: 5432,
      tls: {
        enabled: true,
        enforce: false,
        caCertificates: [],
      },
    });

    console.log("\nConnecting to database...");
    await client.connect();

    console.log("Executing SQL...");
    await client.queryArray(sqlContent);

    console.log("✓ Table created successfully!");

    await client.end();
  } catch (error) {
    console.error("Error executing SQL via postgres:", error);
    console.log("\nPlease execute the SQL manually using Supabase Dashboard or psql.");
  }
}

// Execute if run directly
if (import.meta.main) {
  try {
    await setupTogglTimeEntriesTable();
  } catch (error) {
    console.error("Error setting up table:", error);
    Deno.exit(1);
  }
}
