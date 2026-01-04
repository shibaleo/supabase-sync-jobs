/**
 * Zaim - Money (Transaction) Sync
 *
 * Fetches money records (income, payment, transfer) from Zaim API
 * and saves to raw.zaim__money.
 *
 * Uses streaming insert: each page (100 records) triggers a parallel DB insert
 * instead of waiting for all data. This prevents data loss on errors.
 *
 * Rate limit handling:
 * - 500ms interval between API requests
 * - On 429 response, flush pending inserts before waiting
 */

import { setupLogger } from "../../lib/logger.js";
import { upsertRaw, type RawRecord } from "../../db/raw-client.js";
import {
  fetchAllMoneyStreaming,
  setBeforeRateLimitWaitCallback,
  type MoneyRecord,
} from "./api-client.js";

const logger = setupLogger("zaim-sync-money");

const TABLE_NAME = "zaim__money";
const API_VERSION = "v2";

/**
 * Convert API money records to raw records
 */
function toRawRecords(moneyRecords: MoneyRecord[]): RawRecord[] {
  return moneyRecords.map((money) => ({
    sourceId: String(money.id),
    data: {
      id: money.id,
      mode: money.mode,
      user_id: money.user_id,
      date: money.date,
      category_id: money.category_id,
      genre_id: money.genre_id,
      to_account_id: money.to_account_id,
      from_account_id: money.from_account_id,
      amount: money.amount,
      comment: money.comment,
      active: money.active,
      name: money.name,
      receipt_id: money.receipt_id,
      place: money.place,
      created: money.created,
      currency_code: money.currency_code,
    },
  }));
}

/**
 * Sync money (transaction) data with streaming inserts
 *
 * Each page of 100 records is inserted in parallel while fetching continues.
 * This ensures partial data is saved even if later pages fail.
 *
 * @param days - Number of days to sync (default 30)
 * @returns Number of records synced
 */
export async function syncMoney(days: number = 30): Promise<number> {
  logger.info(`Syncing money data (${days} days) with streaming inserts...`);

  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  // Track pending inserts for flush on rate limit
  const pendingInserts: Promise<void>[] = [];

  // Set callback to flush pending inserts before rate limit wait
  // Uses allSettled to allow partial success
  const flushPending = async () => {
    if (pendingInserts.length > 0) {
      logger.info(`Flushing ${pendingInserts.length} pending inserts...`);
      const results = await Promise.allSettled(pendingInserts);
      const failures = results.filter((r) => r.status === "rejected");
      if (failures.length > 0) {
        logger.warn(`${failures.length}/${results.length} inserts failed during flush`);
      }
      pendingInserts.length = 0;
    }
  };
  setBeforeRateLimitWaitCallback(flushPending);

  try {
    // Fetch with streaming: each page triggers parallel DB insert
    const totalRecords = await fetchAllMoneyStreaming(
      startDate,
      endDate,
      async (pageRecords, page) => {
        const records = toRawRecords(pageRecords);
        const insertPromise = (async () => {
          const result = await upsertRaw(TABLE_NAME, records, API_VERSION);
          logger.info(`Page ${page}: inserted ${result.total} records`);
        })();
        pendingInserts.push(insertPromise);
        await insertPromise;
      }
    );

    if (totalRecords === 0) {
      logger.info("No money data to sync");
    } else {
      logger.info(`Synced ${totalRecords} money records total`);
    }

    return totalRecords;
  } finally {
    // Clean up callback
    setBeforeRateLimitWaitCallback(null);
  }
}
