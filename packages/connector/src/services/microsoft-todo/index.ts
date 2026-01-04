/**
 * Microsoft To Do Service
 *
 * TypeScript connector for Microsoft Graph API (To Do).
 */

export { syncAll } from "./orchestrator";
export { syncLists } from "./sync-lists";
export { syncTasks } from "./sync-tasks";
export {
  fetchLists,
  fetchTasks,
  fetchAllTasks,
  getAuthInfo,
  resetCache,
} from "./api-client";

// Types
export type { SyncAllResult } from "./orchestrator";
export type { SyncResult as ListSyncResult } from "./sync-lists";
export type { SyncResult as TaskSyncResult } from "./sync-tasks";
export type { AuthInfo, TodoList, TodoTask } from "./api-client";
