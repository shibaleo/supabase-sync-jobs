// packages/console/src/app/api/mcp/modules/registry.ts

import { ModuleDefinition } from "../lib/types";
import { notionModule } from "./notion/schema";
import { googleCalendarModule } from "./google-calendar/schema";
import { microsoftTodoModule } from "./microsoft-todo/schema";

export const moduleRegistry: Record<string, ModuleDefinition> = {
  notion: notionModule,
  google_calendar: googleCalendarModule,
  microsoft_todo: microsoftTodoModule,
};
