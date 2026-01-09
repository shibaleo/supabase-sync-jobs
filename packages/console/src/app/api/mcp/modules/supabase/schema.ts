// packages/console/src/app/api/mcp/modules/supabase/schema.ts
// Uses user-specific credentials stored in Supabase Vault

import {
  ModuleDefinition,
  ToolDefinition,
  ToolHandler,
  McpToolResult,
} from "../../lib/types";
import { getUserSecret } from "../../lib/vault";
import { createManagementApi } from "./api";

async function getPat(userId: string): Promise<string> {
  const data = await getUserSecret(userId, "supabase_management");

  if (!data) {
    throw new Error(
      `Supabase Management credentials not found in vault for user ${userId}`
    );
  }

  if (!data.pat) {
    throw new Error(`Supabase Management credentials incomplete. Required: pat`);
  }

  return data.pat as string;
}

// project_ref property definition for reuse
const projectRefProperty = {
  project_ref: {
    type: "string",
    description: "Project reference (e.g., 'abcdefghijk'). Get from sb_list_projects.",
  },
};

const tools: ToolDefinition[] = [
  // Account Tools (no project_ref required)
  {
    name: "sb_list_organizations",
    description: "List all organizations you have access to.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "sb_list_projects",
    description:
      "List all Supabase projects you have access to. Use this first to get project_ref for other operations.",
    inputSchema: { type: "object", properties: {} },
  },
  // Project-specific Tools (project_ref required)
  {
    name: "sb_get_project",
    description: "Get details of a specific project.",
    inputSchema: {
      type: "object",
      properties: projectRefProperty,
      required: ["project_ref"],
    },
  },
  // Database Tools
  {
    name: "sb_list_tables",
    description:
      "List all tables in the database with their schemas. Returns table names and column counts.",
    inputSchema: {
      type: "object",
      properties: {
        ...projectRefProperty,
        schemas: {
          type: "array",
          items: { type: "string" },
          description: "Schemas to include (default: ['public'])",
        },
      },
      required: ["project_ref"],
    },
  },
  {
    name: "sb_execute_sql",
    description:
      "Execute a SQL query against the database. Supports both read and write operations.",
    inputSchema: {
      type: "object",
      properties: {
        ...projectRefProperty,
        query: { type: "string", description: "SQL query to execute" },
        read_only: {
          type: "boolean",
          description: "Execute as read-only (default: true)",
        },
      },
      required: ["project_ref", "query"],
    },
  },
  {
    name: "sb_list_migrations",
    description: "List all database migrations that have been applied.",
    inputSchema: {
      type: "object",
      properties: projectRefProperty,
      required: ["project_ref"],
    },
  },
  {
    name: "sb_apply_migration",
    description:
      "Apply a new database migration. Use for DDL operations like CREATE TABLE, ALTER TABLE, etc.",
    inputSchema: {
      type: "object",
      properties: {
        ...projectRefProperty,
        name: {
          type: "string",
          description: "Migration name in snake_case (e.g., add_users_table)",
        },
        query: { type: "string", description: "SQL DDL statements to apply" },
      },
      required: ["project_ref", "name", "query"],
    },
  },
  // Debugging Tools
  {
    name: "sb_get_logs",
    description:
      "Get logs for a specific service. Available services: api, postgres, edge-function, auth, storage, realtime.",
    inputSchema: {
      type: "object",
      properties: {
        ...projectRefProperty,
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
      required: ["project_ref", "service"],
    },
  },
  {
    name: "sb_get_security_advisors",
    description:
      "Get security recommendations and potential issues for the project.",
    inputSchema: {
      type: "object",
      properties: projectRefProperty,
      required: ["project_ref"],
    },
  },
  {
    name: "sb_get_performance_advisors",
    description:
      "Get performance recommendations and potential issues for the project.",
    inputSchema: {
      type: "object",
      properties: projectRefProperty,
      required: ["project_ref"],
    },
  },
  // Development Tools
  {
    name: "sb_get_project_url",
    description: "Get the base URL for a Supabase project.",
    inputSchema: {
      type: "object",
      properties: projectRefProperty,
      required: ["project_ref"],
    },
  },
  {
    name: "sb_get_api_keys",
    description:
      "Get the API keys for the project (anon key and service role key names, not values).",
    inputSchema: {
      type: "object",
      properties: projectRefProperty,
      required: ["project_ref"],
    },
  },
  {
    name: "sb_generate_typescript_types",
    description:
      "Generate TypeScript type definitions from the database schema.",
    inputSchema: {
      type: "object",
      properties: projectRefProperty,
      required: ["project_ref"],
    },
  },
  // Edge Function Tools
  {
    name: "sb_list_edge_functions",
    description: "List all Edge Functions deployed in the project.",
    inputSchema: {
      type: "object",
      properties: projectRefProperty,
      required: ["project_ref"],
    },
  },
  {
    name: "sb_get_edge_function",
    description: "Get details of a specific Edge Function.",
    inputSchema: {
      type: "object",
      properties: {
        ...projectRefProperty,
        slug: {
          type: "string",
          description: "The slug/name of the Edge Function",
        },
      },
      required: ["project_ref", "slug"],
    },
  },
  // Storage Tools
  {
    name: "sb_list_storage_buckets",
    description: "List all storage buckets in the project.",
    inputSchema: {
      type: "object",
      properties: projectRefProperty,
      required: ["project_ref"],
    },
  },
  {
    name: "sb_get_storage_config",
    description:
      "Get storage configuration for the project including file size limits and features.",
    inputSchema: {
      type: "object",
      properties: projectRefProperty,
      required: ["project_ref"],
    },
  },
];

// Helper to create API with project_ref
async function getApi(userId: string, projectRef: string) {
  const pat = await getPat(userId);
  return createManagementApi({ accessToken: pat, projectRef });
}

// Helper for account-level API (no project required)
async function getAccountApi(userId: string) {
  const pat = await getPat(userId);
  // Use dummy project ref for account-level operations
  return createManagementApi({ accessToken: pat, projectRef: "_" });
}

// Handler implementations
async function listOrganizations(
  _params: Record<string, unknown>,
  userId: string
): Promise<McpToolResult> {
  const api = await getAccountApi(userId);
  const orgs = await api.listOrganizations();
  return { content: [{ type: "text", text: JSON.stringify(orgs, null, 2) }] };
}

async function listProjects(
  _params: Record<string, unknown>,
  userId: string
): Promise<McpToolResult> {
  const api = await getAccountApi(userId);
  const projects = await api.listProjects();
  return {
    content: [{ type: "text", text: JSON.stringify(projects, null, 2) }],
  };
}

async function getProject(
  params: Record<string, unknown>,
  userId: string
): Promise<McpToolResult> {
  const { project_ref } = params as { project_ref: string };
  const api = await getApi(userId, project_ref);
  const project = await api.getProject();
  return { content: [{ type: "text", text: JSON.stringify(project, null, 2) }] };
}

async function listTables(
  params: Record<string, unknown>,
  userId: string
): Promise<McpToolResult> {
  const { project_ref, schemas = ["public"] } = params as {
    project_ref: string;
    schemas?: string[];
  };
  const api = await getApi(userId, project_ref);

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
  const { project_ref, query, read_only = true } = params as {
    project_ref: string;
    query: string;
    read_only?: boolean;
  };
  const api = await getApi(userId, project_ref);

  const result = await api.executeSql(query, read_only);
  return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
}

async function listMigrations(
  params: Record<string, unknown>,
  userId: string
): Promise<McpToolResult> {
  const { project_ref } = params as { project_ref: string };
  const api = await getApi(userId, project_ref);
  const migrations = await api.listMigrations();
  return {
    content: [{ type: "text", text: JSON.stringify(migrations, null, 2) }],
  };
}

async function applyMigration(
  params: Record<string, unknown>,
  userId: string
): Promise<McpToolResult> {
  const { project_ref, name, query } = params as {
    project_ref: string;
    name: string;
    query: string;
  };
  const api = await getApi(userId, project_ref);

  await api.applyMigration(name, query);
  return {
    content: [
      { type: "text", text: `Migration "${name}" applied successfully.` },
    ],
  };
}

async function getLogs(
  params: Record<string, unknown>,
  userId: string
): Promise<McpToolResult> {
  const { project_ref, service, start_time, end_time } = params as {
    project_ref: string;
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
  const api = await getApi(userId, project_ref);

  const logs = await api.getLogs(service, start_time, end_time);
  return { content: [{ type: "text", text: JSON.stringify(logs, null, 2) }] };
}

async function getSecurityAdvisors(
  params: Record<string, unknown>,
  userId: string
): Promise<McpToolResult> {
  const { project_ref } = params as { project_ref: string };
  const api = await getApi(userId, project_ref);
  const advisors = await api.getSecurityAdvisors();
  return {
    content: [{ type: "text", text: JSON.stringify(advisors, null, 2) }],
  };
}

async function getPerformanceAdvisors(
  params: Record<string, unknown>,
  userId: string
): Promise<McpToolResult> {
  const { project_ref } = params as { project_ref: string };
  const api = await getApi(userId, project_ref);
  const advisors = await api.getPerformanceAdvisors();
  return {
    content: [{ type: "text", text: JSON.stringify(advisors, null, 2) }],
  };
}

async function getProjectUrl(
  params: Record<string, unknown>
): Promise<McpToolResult> {
  const { project_ref } = params as { project_ref: string };
  const url = `https://${project_ref}.supabase.co`;
  return { content: [{ type: "text", text: url }] };
}

async function getApiKeys(
  params: Record<string, unknown>,
  userId: string
): Promise<McpToolResult> {
  const { project_ref } = params as { project_ref: string };
  const api = await getApi(userId, project_ref);
  const keys = await api.getApiKeys();
  return { content: [{ type: "text", text: JSON.stringify(keys, null, 2) }] };
}

async function generateTypescriptTypes(
  params: Record<string, unknown>,
  userId: string
): Promise<McpToolResult> {
  const { project_ref } = params as { project_ref: string };
  const api = await getApi(userId, project_ref);
  const result = await api.generateTypescriptTypes();
  return { content: [{ type: "text", text: result.types }] };
}

async function listEdgeFunctions(
  params: Record<string, unknown>,
  userId: string
): Promise<McpToolResult> {
  const { project_ref } = params as { project_ref: string };
  const api = await getApi(userId, project_ref);
  const functions = await api.listEdgeFunctions();
  return {
    content: [{ type: "text", text: JSON.stringify(functions, null, 2) }],
  };
}

async function getEdgeFunction(
  params: Record<string, unknown>,
  userId: string
): Promise<McpToolResult> {
  const { project_ref, slug } = params as { project_ref: string; slug: string };
  const api = await getApi(userId, project_ref);
  const func = await api.getEdgeFunction(slug);
  return { content: [{ type: "text", text: JSON.stringify(func, null, 2) }] };
}

async function listStorageBuckets(
  params: Record<string, unknown>,
  userId: string
): Promise<McpToolResult> {
  const { project_ref } = params as { project_ref: string };
  const api = await getApi(userId, project_ref);
  const buckets = await api.listStorageBuckets();
  return {
    content: [{ type: "text", text: JSON.stringify(buckets, null, 2) }],
  };
}

async function getStorageConfig(
  params: Record<string, unknown>,
  userId: string
): Promise<McpToolResult> {
  const { project_ref } = params as { project_ref: string };
  const api = await getApi(userId, project_ref);
  const config = await api.getStorageConfig();
  return { content: [{ type: "text", text: JSON.stringify(config, null, 2) }] };
}

const handlers: Record<string, ToolHandler> = {
  sb_list_organizations: listOrganizations,
  sb_list_projects: listProjects,
  sb_get_project: getProject,
  sb_list_tables: listTables,
  sb_execute_sql: executeSql,
  sb_list_migrations: listMigrations,
  sb_apply_migration: applyMigration,
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
  description:
    "Supabase Management API（DB操作、マイグレーション、ログ、ストレージ）",
  tools,
  handlers,
};
