#!/usr/bin/env npx tsx
/**
 * Microsoft To Do CLI
 *
 * Usage:
 *   npx tsx src/services/microsoft-todo/cli.ts [--log-level debug|info|warn|error]
 */

import { syncAll } from "./orchestrator.js";
import { setLogLevel, type LogLevel } from "../../lib/logger.js";

const VALID_LOG_LEVELS = ["debug", "info", "warn", "error"] as const;

async function main(): Promise<void> {
  // Parse args
  const args = process.argv.slice(2);
  let logLevel: LogLevel = "info";

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--log-level" && args[i + 1]) {
      const level = args[i + 1] as LogLevel;
      if (!VALID_LOG_LEVELS.includes(level)) {
        console.error(`Invalid --log-level value. Must be one of: ${VALID_LOG_LEVELS.join(", ")}`);
        process.exit(1);
      }
      logLevel = level;
      i++;
    }
  }

  // Set log level before any sync operations
  setLogLevel(logLevel);

  try {
    const result = await syncAll();

    if (result.success) {
      console.log(`[OK] Microsoft To Do sync completed:`);
      console.log(`  Lists: ${result.listsCount}`);
      console.log(`  Tasks: ${result.tasksCount}`);
      console.log(`  Elapsed: ${result.elapsedSeconds}s`);
      process.exit(0);
    } else {
      console.log(`[WARN] Microsoft To Do sync completed with warnings`);
      process.exit(0);
    }
  } catch (error) {
    console.error(`[ERROR] Microsoft To Do sync failed: ${error}`);
    process.exit(1);
  }
}

main();
