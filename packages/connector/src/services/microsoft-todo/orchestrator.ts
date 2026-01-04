/**
 * Microsoft To Do Orchestrator
 *
 * Unified entry point for full data sync.
 * Executes lists sync first, then tasks.
 * Manages database connection lifecycle.
 */

import { setupLogger } from "../../lib/logger.js";
import { getDbClient, closeDbClient } from "../../db/raw-client.js";
import { syncLists } from "./sync-lists.js";
import { syncTasks } from "./sync-tasks.js";
import { syncChecklistItems } from "./sync-checklist-items.js";

const logger = setupLogger("mstodo-orchestrator");

// Types
export interface SyncAllResult {
  success: boolean;
  listsCount: number;
  tasksCount: number;
  checklistItemsCount: number;
  elapsedSeconds: number;
}

/**
 * Sync all Microsoft To Do data
 *
 * Executes in order: lists -> tasks -> checklistItems
 * Database connection is opened once and reused throughout.
 *
 * @returns Sync result
 */
export async function syncAll(): Promise<SyncAllResult> {
  const startTime = performance.now();

  logger.info("Starting Microsoft To Do full sync");

  const errors: string[] = [];
  let listsCount = 0;
  let tasksCount = 0;
  let checklistItemsCount = 0;

  try {
    // Initialize shared DB connection
    await getDbClient();

    // 1. Lists sync
    logger.info("Step 1: Syncing lists...");
    const listsResult = await syncLists();
    listsCount = listsResult.count;

    if (!listsResult.success) {
      errors.push("lists: partial failure");
      logger.warn("Lists sync had partial failures, continuing with tasks...");
    }

    // 2. Tasks sync
    logger.info("Step 2: Syncing tasks...");
    const tasksResult = await syncTasks();
    tasksCount = tasksResult.count;

    if (!tasksResult.success) {
      errors.push("tasks: partial failure");
      logger.warn("Tasks sync had partial failures");
    }

    // 3. Checklist items sync
    logger.info("Step 3: Syncing checklist items...");
    const checklistItemsResult = await syncChecklistItems();
    checklistItemsCount = checklistItemsResult.count;

    if (!checklistItemsResult.success) {
      errors.push("checklistItems: partial failure");
      logger.warn("Checklist items sync had partial failures");
    }

    const elapsed = Math.round((performance.now() - startTime) / 10) / 100;

    // Log summary
    logger.info(
      `Microsoft To Do full sync completed in ${elapsed}s: lists=${listsCount}, tasks=${tasksCount}, checklistItems=${checklistItemsCount}`
    );

    if (errors.length > 0) {
      logger.warn(`Some syncs had issues: ${errors.join(", ")}`);
    }

    return {
      success: errors.length === 0,
      listsCount,
      tasksCount,
      checklistItemsCount,
      elapsedSeconds: elapsed,
    };
  } catch (error) {
    const elapsed = Math.round((performance.now() - startTime) / 10) / 100;
    logger.error(`Microsoft To Do full sync failed after ${elapsed}s: ${error}`);
    throw error;
  } finally {
    // Always close DB connection
    await closeDbClient();
  }
}
