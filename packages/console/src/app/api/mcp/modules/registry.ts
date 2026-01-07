// packages/console/src/app/api/mcp/modules/registry.ts

import { ModuleDefinition } from "../lib/types";
import { notionModule } from "./notion/schema";
import { googleCalendarModule } from "./google-calendar/schema";
import { microsoftTodoModule } from "./microsoft-todo/schema";
import { ragModule } from "./rag/schema";
import { supabaseModule } from "./supabase/schema";
import { jiraModule } from "./jira/schema";
import { confluenceModule } from "./confluence/schema";
import { githubModule } from "./github/schema";

export const moduleRegistry: Record<string, ModuleDefinition> = {
  notion: notionModule,
  google_calendar: googleCalendarModule,
  microsoft_todo: microsoftTodoModule,
  rag: ragModule,
  supabase: supabaseModule,
  jira: jiraModule,
  confluence: confluenceModule,
  github: githubModule,
};
