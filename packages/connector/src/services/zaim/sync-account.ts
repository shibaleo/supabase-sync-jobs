/**
 * Zaim - Account Master Sync
 *
 * Fetches user's accounts from Zaim API
 * and saves to raw.zaim__account.
 */

import { setupLogger } from "../../lib/logger.js";
import { upsertRaw, type RawRecord } from "../../db/raw-client.js";
import { fetchAccounts, type Account } from "./api-client.js";

const logger = setupLogger("zaim-sync-account");

const TABLE_NAME = "zaim__account";
const API_VERSION = "v2";

/**
 * Convert API account to raw record
 */
function toRawRecord(account: Account): RawRecord {
  // Use id as sourceId for deduplication
  const sourceId = String(account.id);

  return {
    sourceId,
    data: {
      id: account.id,
      name: account.name,
      modified: account.modified,
      sort: account.sort,
      active: account.active,
      local_id: account.local_id,
      website_id: account.website_id,
      parent_account_id: account.parent_account_id,
    },
  };
}

/**
 * Sync account master data
 *
 * @returns Number of records synced
 */
export async function syncAccount(): Promise<number> {
  logger.info("Syncing account master data...");

  // Fetch all accounts
  const accounts = await fetchAccounts();

  if (accounts.length === 0) {
    logger.info("No account data to sync");
    return 0;
  }

  // Convert to raw records
  const records = accounts.map(toRawRecord);

  // Upsert to database
  const result = await upsertRaw(TABLE_NAME, records, API_VERSION);

  logger.info(`Synced ${result.total} account records`);
  return result.total;
}
