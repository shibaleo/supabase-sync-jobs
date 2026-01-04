/**
 * Microsoft To Do Checklist Items Sync
 *
 * Syncs all checklist items (subtasks) from all tasks to raw layer.
 */

import { upsertRawBatch, RawRecord } from "../../db/raw-client.js";
import { setupLogger } from "../../lib/logger.js";
import { fetchAllChecklistItems } from "./api-client.js";

const logger = setupLogger("mstodo-checklist-items");

const TABLE_NAME = "microsoft_todo__checklist_items";
const API_VERSION = "v1.0";

// Types
export interface SyncResult {
  success: boolean;
  count: number;
  elapsedSeconds: number;
}

/**
 * Create composite key for checklist item (taskId + itemId)
 * Microsoft To Do shares checklist item IDs across recurring task instances,
 * so we need a composite key to distinguish them.
 */
function getCompositeKey(item: Record<string, unknown>): string {
  return `${item.taskId}::${item.id}`;
}

/**
 * Convert API response to RawRecord
 * Uses composite key (taskId::itemId) as sourceId to handle recurring tasks
 */
function toRawRecord(item: Record<string, unknown>): RawRecord {
  return {
    sourceId: getCompositeKey(item),
    data: item,
  };
}

/**
 * Sync all checklist items from all tasks
 */
export async function syncChecklistItems(): Promise<SyncResult> {
  const startTime = performance.now();

  logger.info("Starting Microsoft To Do checklist items sync");

  try {
    // Fetch all checklist items from all tasks
    const items = await fetchAllChecklistItems();
    logger.info(`Fetched ${items.length} checklist items`);

    if (items.length === 0) {
      const elapsed = Math.round((performance.now() - startTime) / 10) / 100;
      return {
        success: true,
        count: 0,
        elapsedSeconds: elapsed,
      };
    }

    // Deduplicate by composite key (taskId::itemId)
    // Microsoft To Do shares checklist item IDs across recurring task instances
    const uniqueItems = Array.from(
      new Map(items.map((item) => [getCompositeKey(item), item])).values()
    );
    if (uniqueItems.length !== items.length) {
      logger.warn(`Deduplicated ${items.length - uniqueItems.length} duplicate checklist items`);
    }

    // Convert to RawRecords
    const records = uniqueItems.map((item) => toRawRecord(item));

    // Save to DB
    const result = await upsertRawBatch(TABLE_NAME, records, API_VERSION);

    const elapsed = Math.round((performance.now() - startTime) / 10) / 100;
    logger.info(`Microsoft To Do checklist items sync completed: ${result.total} items in ${elapsed}s`);

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

    logger.error(`Microsoft To Do checklist items sync failed after ${elapsed}s: ${error}`);
    throw error;
  }
}
