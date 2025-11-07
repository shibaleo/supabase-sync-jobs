import "https://deno.land/std@0.203.0/dotenv/load.ts";
import { syncEntriesByDateRange } from "./syncToSupabase.ts";

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Generate monthly date ranges from start date to end date
 */
function generateMonthlyRanges(startDate: Date, endDate: Date): Array<{ start: Date; end: Date }> {
  const ranges: Array<{ start: Date; end: Date }> = [];

  let currentStart = new Date(startDate);

  while (currentStart < endDate) {
    // Calculate the end of the current month
    const currentEnd = new Date(
      currentStart.getFullYear(),
      currentStart.getMonth() + 1,
      0, // Last day of the month
      23,
      59,
      59,
      999
    );

    // If the calculated end is beyond the target end date, use the target end date
    const rangeEnd = currentEnd > endDate ? endDate : currentEnd;

    ranges.push({
      start: new Date(currentStart),
      end: rangeEnd,
    });

    // Move to the first day of the next month
    currentStart = new Date(
      currentStart.getFullYear(),
      currentStart.getMonth() + 1,
      1,
      0,
      0,
      0,
      0
    );
  }

  return ranges;
}

/**
 * Sync all Toggl entries from now back to 2023-01-01, one month at a time
 * with API rate limit protection
 */
async function syncAllEntriesFromJan2023() {
  const startDate = new Date("2023-01-01T00:00:00+09:00");
  const endDate = new Date(); // Current date/time

  console.log("=".repeat(60));
  console.log("Starting full sync from now back to 2023-01-01");
  console.log("=".repeat(60));
  console.log(`Start: ${startDate.toISOString()}`);
  console.log(`End: ${endDate.toISOString()}`);
  console.log();

  // Generate monthly ranges
  const monthlyRanges = generateMonthlyRanges(startDate, endDate);
  // Reverse to sync from newest to oldest
  monthlyRanges.reverse();
  console.log(`Total months to sync: ${monthlyRanges.length}`);
  console.log();

  let totalSynced = 0;
  const idleTimeMs = 10 * 60 * 1000; // 10 minutes idle between each month to avoid API limits

  for (let i = 0; i < monthlyRanges.length; i++) {
    const range = monthlyRanges[i];
    const monthStr = `${range.start.getFullYear()}-${String(range.start.getMonth() + 1).padStart(2, "0")}`;

    console.log("-".repeat(60));
    console.log(`[${i + 1}/${monthlyRanges.length}] Syncing ${monthStr}`);
    console.log(`  From: ${range.start.toISOString()}`);
    console.log(`  To:   ${range.end.toISOString()}`);

    try {
      const count = await syncEntriesByDateRange(range.start, range.end);
      totalSynced += count;
      console.log(`  ✓ Synced ${count} entries for ${monthStr}`);
      console.log(`  Total synced so far: ${totalSynced}`);
    } catch (error) {
      console.error(`  ✗ Error syncing ${monthStr}:`, error);
      console.log("  Continuing to next month...");
    }

    // Idle between months to avoid API rate limits
    // Skip idle after the last month
    if (i < monthlyRanges.length - 1) {
      const minutes = Math.floor(idleTimeMs / 60000);
      console.log(`  Idling for ${minutes} minutes...`);
      await sleep(idleTimeMs);
    }
    console.log();
  }

  console.log("=".repeat(60));
  console.log("Sync completed!");
  console.log(`Total entries synced: ${totalSynced}`);
  console.log("=".repeat(60));

  return totalSynced;
}

// Execute if run directly
if (import.meta.main) {
  try {
    await syncAllEntriesFromJan2023();
  } catch (error) {
    console.error("Fatal error during sync:", error);
    Deno.exit(1);
  }
}
