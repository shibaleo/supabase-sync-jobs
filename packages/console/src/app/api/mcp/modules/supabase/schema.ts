// packages/console/src/app/api/mcp/modules/supabase/schema.ts
// Uses user-specific credentials stored in Supabase Vault

import {
  ModuleDefinition,
  ToolDefinition,
  ToolHandler,
  McpToolResult,
} from "../../lib/types";
import { getUserSecret } from "../../lib/vault";
import { createManagementApi, ManagementApi } from "./api";

interface SupabaseCredentials {
  pat: string; // Personal Access Token for Management API
  project_ref: string; // Project reference (e.g., "liegivvinbwmeujddzif")
}

// Cache per user
const apiCache = new Map<string, ManagementApi>();

async function getCredentials(userId: string): Promise<SupabaseCredentials> {
  const data = await getUserSecret(userId, "supabase_management");

  if (!data) {
    throw new Error(`Supabase Management credentials not found in vault for user ${userId}`);
  }

  if (!data.pat || !data.project_ref) {
    throw new Error(`Supabase Management credentials incomplete. Required: pat, project_ref`);
  }

  return {
    pat: data.pat as string,
    project_ref: data.project_ref as string,
  };
}

async function getApi(userId: string): Promise<ManagementApi> {
  const cached = apiCache.get(userId);
  if (cached) return cached;

  const creds = await getCredentials(userId);
  const api = createManagementApi({
    accessToken: creds.pat,
    projectRef: creds.project_ref,
  });

  apiCache.set(userId, api);
  return api;
}

const tools: ToolDefinition[] = [
  // Database Tools
  {
    name: "sb_list_tables",
    description:
      "List all tables in the database with their schemas. Returns table names and column counts.",
    inputSchema: {
      type: "object",
      properties: {
        schemas: {
          type: "array",
          items: { type: "string" },
          description: "Schemas to include (default: ['public'])",
        },
      },
    },
  },
  {
    name: "sb_execute_sql",
    description:
      "Execute a SQL query against the database. Supports both read and write operations.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "SQL query to execute" },
        read_only: {
          type: "boolean",
          description: "Execute as read-only (default: true)",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "sb_list_migrations",
    description: "List all database migrations that have been applied.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "sb_apply_migration",
    description:
      "Apply a new database migration. Use for DDL operations like CREATE TABLE, ALTER TABLE, etc.",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Migration name in snake_case (e.g., add_users_table)",
        },
        query: { type: "string", description: "SQL DDL statements to apply" },
      },
      required: ["name", "query"],
    },
  },
  // Account Tools
  {
    name: "sb_list_organizations",
    description: "List all organizations you have access to.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "sb_list_projects",
    description: "List all Supabase projects you have access to.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "sb_get_project",
    description: "Get details of the current project.",
    inputSchema: { type: "object", properties: {} },
  },
  // Debugging Tools
  {
    name: "sb_get_logs",
    description:
      "Get logs for a specific service. Available services: api, postgres, edge-function, auth, storage, realtime.",
    inputSchema: {
      type: "object",
      properties: {
        service: {
          type: "string",
          enum: [
            "api",
            "postgres",
            "edge-function",
            "auth",
            "storage",
            "realtime",
          ],
          description: "Service to get logs for",
        },
        start_time: {
          type: "string",
          description: "ISO timestamp for start of log range (optional)",
        },
        end_time: {
          type: "string",
          description: "ISO timestamp for end of log range (optional)",
        },
      },
      required: ["service"],
    },
  },
  {
    name: "sb_get_security_advisors",
    description:
      "Get security recommendations and potential issues for the project.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "sb_get_performance_advisors",
    description:
      "Get performance recommendations and potential issues for the project.",
    inputSchema: { type: "object", properties: {} },
  },
  // Development Tools
  {
    name: "sb_get_project_url",
    description: "Get the base URL for the current Supabase project.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "sb_get_api_keys",
    description:
      "Get the API keys for the project (anon key and service role key names, not values).",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "sb_generate_typescript_types",
    description:
      "Generate TypeScript type definitions from the database schema.",
    inputSchema: { type: "object", properties: {} },
  },
  // Edge Function Tools
  {
    name: "sb_list_edge_functions",
    description: "List all Edge Functions deployed in the project.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "sb_get_edge_function",
    description: "Get details of a specific Edge Function.",
    inputSchema: {
      type: "object",
      properties: {
        slug: {
          type: "string",
          description: "The slug/name of the Edge Function",
        },
      },
      required: ["slug"],
    },
  },
  // Storage Tools
  {
    name: "sb_list_storage_buckets",
    description: "List all storage buckets in the project.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "sb_get_storage_config",
    description:
      "Get storage configuration for the project including file size limits and features.",
    inputSchema: { type: "object", properties: {} },
  },
];

// Handler implementations
async function listTables(
  params: Record<string, unknown>,
  userId: string
): Promise<McpToolResult> {
  const api = await getApi(userId);
  const { schemas = ["public"] } = params as { schemas?: string[] };

  const query = `
    SELECT
      schemaname as schema,
      tablename as name,
      (SELECT count(*)::int FROM information_schema.columns
       WHERE table_schema = t.schemaname AND table_name = t.tablename) as column_count
    FROM pg_tables t
    WHERE schemaname = ANY(ARRAY[${schemas.map((s) => `'${s}'`).join(",")}])
    ORDER BY schemaname, tablename
  `;

  const result = await api.executeSql(query, true);
  return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
}

async function executeSql(
  params: Record<string, unknown>,
  userId: string
): Promise<McpToolResult> {
  const api = await getApi(userId);
  const { query, read_only = true } = params as {
    query: string;
    read_only?: boolean;
  };

  const result = await api.executeSql(query, read_only);
  return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
}

async function listMigrations(
  _params: Record<string, unknown>,
  userId: string
): Promise<McpToolResult> {
  const api = await getApi(userId);
  const migrations = await api.listMigrations();
  return {
    content: [{ type: "text", text: JSON.stringify(migrations, null, 2) }],
  };
}

async function applyMigration(
  params: Record<string, unknown>,
  userId: string
): Promise<McpToolResult> {
  const api = await getApi(userId);
  const { name, query } = params as { name: string; query: string };

  await api.applyMigration(name, query);
  return {
    content: [{ type: "text", text: `Migration "${name}" applied successfully.` }],
  };
}

async function listOrganizations(
  _params: Record<string, unknown>,
  userId: string
): Promise<McpToolResult> {
  const api = await getApi(userId);
  const orgs = await api.listOrganizations();
  return { content: [{ type: "text", text: JSON.stringify(orgs, null, 2) }] };
}

async function listProjects(
  _params: Record<string, unknown>,
  userId: string
): Promise<McpToolResult> {
  const api = await getApi(userId);
  const projects = await api.listProjects();
  return {
    content: [{ type: "text", text: JSON.stringify(projects, null, 2) }],
  };
}

async function getProject(
  _params: Record<string, unknown>,
  userId: string
): Promise<McpToolResult> {
  const api = await getApi(userId);
  const project = await api.getProject();
  return { content: [{ type: "text", text: JSON.stringify(project, null, 2) }] };
}

async function getLogs(
  params: Record<string, unknown>,
  userId: string
): Promise<McpToolResult> {
  const api = await getApi(userId);
  const { service, start_time, end_time } = params as {
    service:
      | "api"
      | "postgres"
      | "edge-function"
      | "auth"
      | "storage"
      | "realtime";
    start_time?: string;
    end_time?: string;
  };

  const logs = await api.getLogs(service, start_time, end_time);
  return { content: [{ type: "text", text: JSON.stringify(logs, null, 2) }] };
}

async function getSecurityAdvisors(
  _params: Record<string, unknown>,
  userId: string
): Promise<McpToolResult> {
  const api = await getApi(userId);
  const advisors = await api.getSecurityAdvisors();
  return {
    content: [{ type: "text", text: JSON.stringify(advisors, null, 2) }],
  };
}

async function getPerformanceAdvisors(
  _params: Record<string, unknown>,
  userId: string
): Promise<McpToolResult> {
  const api = await getApi(userId);
  const advisors = await api.getPerformanceAdvisors();
  return {
    content: [{ type: "text", text: JSON.stringify(advisors, null, 2) }],
  };
}

async function getProjectUrl(
  _params: Record<string, unknown>,
  userId: string
): Promise<McpToolResult> {
  const api = await getApi(userId);
  const url = api.getProjectUrl();
  return { content: [{ type: "text", text: url }] };
}

async function getApiKeys(
  _params: Record<string, unknown>,
  userId: string
): Promise<McpToolResult> {
  const api = await getApi(userId);
  const keys = await api.getApiKeys();
  return { content: [{ type: "text", text: JSON.stringify(keys, null, 2) }] };
}

async function generateTypescriptTypes(
  _params: Record<string, unknown>,
  userId: string
): Promise<McpToolResult> {
  const api = await getApi(userId);
  const result = await api.generateTypescriptTypes();
  return { content: [{ type: "text", text: result.types }] };
}

async function listEdgeFunctions(
  _params: Record<string, unknown>,
  userId: string
): Promise<McpToolResult> {
  const api = await getApi(userId);
  const functions = await api.listEdgeFunctions();
  return {
    content: [{ type: "text", text: JSON.stringify(functions, null, 2) }],
  };
}

async function getEdgeFunction(
  params: Record<string, unknown>,
  userId: string
): Promise<McpToolResult> {
  const api = await getApi(userId);
  const { slug } = params as { slug: string };
  const func = await api.getEdgeFunction(slug);
  return { content: [{ type: "text", text: JSON.stringify(func, null, 2) }] };
}

async function listStorageBuckets(
  _params: Record<string, unknown>,
  userId: string
): Promise<McpToolResult> {
  const api = await getApi(userId);
  const buckets = await api.listStorageBuckets();
  return { content: [{ type: "text", text: JSON.stringify(buckets, null, 2) }] };
}

async function getStorageConfig(
  _params: Record<string, unknown>,
  userId: string
): Promise<McpToolResult> {
  const api = await getApi(userId);
  const config = await api.getStorageConfig();
  return { content: [{ type: "text", text: JSON.stringify(config, null, 2) }] };
}

const handlers: Record<string, ToolHandler> = {
  sb_list_tables: listTables,
  sb_execute_sql: executeSql,
  sb_list_migrations: listMigrations,
  sb_apply_migration: applyMigration,
  sb_list_organizations: listOrganizations,
  sb_list_projects: listProjects,
  sb_get_project: getProject,
  sb_get_logs: getLogs,
  sb_get_security_advisors: getSecurityAdvisors,
  sb_get_performance_advisors: getPerformanceAdvisors,
  sb_get_project_url: getProjectUrl,
  sb_get_api_keys: getApiKeys,
  sb_generate_typescript_types: generateTypescriptTypes,
  sb_list_edge_functions: listEdgeFunctions,
  sb_get_edge_function: getEdgeFunction,
  sb_list_storage_buckets: listStorageBuckets,
  sb_get_storage_config: getStorageConfig,
};

export const supabaseModule: ModuleDefinition = {
  name: "supabase",
  description: "Supabase Management API（DB操作、マイグレーション、ログ、ストレージ）",
  tools,
  handlers,
};
