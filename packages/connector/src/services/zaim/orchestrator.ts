/**
 * Zaim - Sync Orchestrator
 *
 * Coordinates sync of all Zaim data types.
 * Runs master data sync first, then transaction sync.
 */

import { setupLogger } from "../../lib/logger.js";
import { getDbClient, closeDbClient } from "../../db/raw-client.js";
import { syncMoney } from "./sync-money.js";
import { syncCategory } from "./sync-category.js";
import { syncGenre } from "./sync-genre.js";
import { syncAccount } from "./sync-account.js";

const logger = setupLogger("zaim-orchestrator");

export interface SyncResult {
  moneyCount: number;
  categoryCount: number;
  genreCount: number;
  accountCount: number;
  elapsedMs: number;
}

export interface SyncOptions {
  days?: number;
}

/**
 * Sync all Zaim data
 *
 * Syncs master data (category, genre, account) in parallel first,
 * then syncs transaction data (money).
 *
 * @param options - Sync options
 * @returns Sync result with counts and elapsed time
 */
export async function syncAll(options: SyncOptions = {}): Promise<SyncResult> {
  const { days = 30 } = options;

  logger.info(`Starting Zaim sync (${days} days)`);
  const startTime = Date.now();

  // Initialize DB connection
  await getDbClient();

  try {
    // Sync master data in parallel first
    logger.info("Syncing master data...");
    const [categoryCount, genreCount, accountCount] = await Promise.all([
      syncCategory(),
      syncGenre(),
      syncAccount(),
    ]);

    // Then sync transaction data
    logger.info("Syncing transaction data...");
    const moneyCount = await syncMoney(days);

    const elapsedMs = Date.now() - startTime;

    logger.info(
      `Zaim sync completed in ${(elapsedMs / 1000).toFixed(2)}s`
    );

    return {
      moneyCount,
      categoryCount,
      genreCount,
      accountCount,
      elapsedMs,
    };
  } finally {
    // Close DB connection
    await closeDbClient();
  }
}
