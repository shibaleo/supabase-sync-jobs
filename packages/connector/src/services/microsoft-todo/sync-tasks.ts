/**
 * Microsoft To Do Tasks Sync
 *
 * Syncs all tasks from all lists to raw layer.
 */

import { upsertRawBatch, RawRecord } from "../../db/raw-client.js";
import { setupLogger } from "../../lib/logger.js";
import { fetchAllTasks } from "./api-client.js";

const logger = setupLogger("mstodo-tasks");

const TABLE_NAME = "microsoft_todo__tasks";
const API_VERSION = "v1.0";

// Types
export interface SyncResult {
  success: boolean;
  count: number;
  elapsedSeconds: number;
}

/**
 * Convert API response to RawRecord
 */
function toRawRecord(task: Record<string, unknown>): RawRecord {
  return {
    sourceId: task.id as string,
    data: task,
  };
}

/**
 * Sync all tasks from all lists
 */
export async function syncTasks(): Promise<SyncResult> {
  const startTime = performance.now();

  logger.info("Starting Microsoft To Do tasks sync");

  try {
    // Fetch all tasks from all lists
    const tasks = await fetchAllTasks();
    logger.info(`Fetched ${tasks.length} tasks`);

    if (tasks.length === 0) {
      const elapsed = Math.round((performance.now() - startTime) / 10) / 100;
      return {
        success: true,
        count: 0,
        elapsedSeconds: elapsed,
      };
    }

    // Convert to RawRecords
    const records = tasks.map((task) => toRawRecord(task));

    // Save to DB
    const result = await upsertRawBatch(TABLE_NAME, records, API_VERSION);

    const elapsed = Math.round((performance.now() - startTime) / 10) / 100;
    logger.info(`Microsoft To Do tasks sync completed: ${result.total} tasks in ${elapsed}s`);

    return {
      success: true,
      count: result.total,
      elapsedSeconds: elapsed,
    };
  } catch (error) {
    const elapsed = Math.round((performance.now() - startTime) / 10) / 100;

    // On rate limit, return partial result
    if (String(error).includes("429")) {
      logger.warn(`Microsoft To Do API rate limit after ${elapsed}s`);
      return {
        success: false,
        count: 0,
        elapsedSeconds: elapsed,
      };
    }

    logger.error(`Microsoft To Do tasks sync failed after ${elapsed}s: ${error}`);
    throw error;
  }
}
