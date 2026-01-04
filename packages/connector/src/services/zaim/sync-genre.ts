/**
 * Zaim - Genre Master Sync
 *
 * Fetches user's genres from Zaim API
 * and saves to raw.zaim__genre.
 */

import { setupLogger } from "../../lib/logger.js";
import { upsertRaw, type RawRecord } from "../../db/raw-client.js";
import { fetchGenres, type Genre } from "./api-client.js";

const logger = setupLogger("zaim-sync-genre");

const TABLE_NAME = "zaim__genre";
const API_VERSION = "v2";

/**
 * Convert API genre to raw record
 */
function toRawRecord(genre: Genre): RawRecord {
  // Use id as sourceId for deduplication
  const sourceId = String(genre.id);

  return {
    sourceId,
    data: {
      id: genre.id,
      name: genre.name,
      sort: genre.sort,
      active: genre.active,
      category_id: genre.category_id,
      parent_genre_id: genre.parent_genre_id,
      modified: genre.modified,
    },
  };
}

/**
 * Sync genre master data
 *
 * @returns Number of records synced
 */
export async function syncGenre(): Promise<number> {
  logger.info("Syncing genre master data...");

  // Fetch all genres
  const genres = await fetchGenres();

  if (genres.length === 0) {
    logger.info("No genre data to sync");
    return 0;
  }

  // Convert to raw records
  const records = genres.map(toRawRecord);

  // Upsert to database
  const result = await upsertRaw(TABLE_NAME, records, API_VERSION);

  logger.info(`Synced ${result.total} genre records`);
  return result.total;
}
