/**
 * Zaim - Category Master Sync
 *
 * Fetches user's categories from Zaim API
 * and saves to raw.zaim__category.
 */

import { setupLogger } from "../../lib/logger.js";
import { upsertRaw, type RawRecord } from "../../db/raw-client.js";
import { fetchCategories, type Category } from "./api-client.js";

const logger = setupLogger("zaim-sync-category");

const TABLE_NAME = "zaim__category";
const API_VERSION = "v2";

/**
 * Convert API category to raw record
 */
function toRawRecord(category: Category): RawRecord {
  // Use id as sourceId for deduplication
  const sourceId = String(category.id);

  return {
    sourceId,
    data: {
      id: category.id,
      name: category.name,
      mode: category.mode,
      sort: category.sort,
      parent_category_id: category.parent_category_id,
      active: category.active,
      modified: category.modified,
    },
  };
}

/**
 * Sync category master data
 *
 * @returns Number of records synced
 */
export async function syncCategory(): Promise<number> {
  logger.info("Syncing category master data...");

  // Fetch all categories
  const categories = await fetchCategories();

  if (categories.length === 0) {
    logger.info("No category data to sync");
    return 0;
  }

  // Convert to raw records
  const records = categories.map(toRawRecord);

  // Upsert to database
  const result = await upsertRaw(TABLE_NAME, records, API_VERSION);

  logger.info(`Synced ${result.total} category records`);
  return result.total;
}
