/**
 * Microsoft To Do Lists Sync
 *
 * Syncs task lists to raw layer.
 */

import { upsertRawBatch, RawRecord } from "../../db/raw-client.js";
import { setupLogger } from "../../lib/logger.js";
import { fetchLists } from "./api-client.js";

const logger = setupLogger("mstodo-lists");

const TABLE_NAME = "microsoft_todo__lists";
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
function toRawRecord(list: Record<string, unknown>): RawRecord {
  return {
    sourceId: list.id as string,
    data: list,
  };
}

/**
 * Sync all task lists
 */
export async function syncLists(): Promise<SyncResult> {
  const startTime = performance.now();

  logger.info("Starting Microsoft To Do lists sync");

  try {
    // Fetch all lists
    const lists = await fetchLists();
    logger.info(`Fetched ${lists.length} lists`);

    if (lists.length === 0) {
      const elapsed = Math.round((performance.now() - startTime) / 10) / 100;
      return {
        success: true,
        count: 0,
        elapsedSeconds: elapsed,
      };
    }

    // Convert to RawRecords
    const records = lists.map((list) => toRawRecord(list as unknown as Record<string, unknown>));

    // Save to DB
    const result = await upsertRawBatch(TABLE_NAME, records, API_VERSION);

    const elapsed = Math.round((performance.now() - startTime) / 10) / 100;
    logger.info(`Microsoft To Do lists sync completed: ${result.total} lists in ${elapsed}s`);

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

    logger.error(`Microsoft To Do lists sync failed after ${elapsed}s: ${error}`);
    throw error;
  }
}
