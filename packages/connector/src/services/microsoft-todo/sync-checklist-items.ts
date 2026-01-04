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
 * Convert API response to RawRecord
 */
function toRawRecord(item: Record<string, unknown>): RawRecord {
  return {
    sourceId: item.id as string,
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

    // Deduplicate by source_id (API may return duplicates)
    const uniqueItems = Array.from(
      new Map(items.map((item) => [item.id as string, item])).values()
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
