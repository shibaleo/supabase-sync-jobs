/**
 * Zaim Connector
 *
 * Public exports for Zaim sync module.
 */

// Orchestrator
export { syncAll, type SyncResult, type SyncOptions } from "./orchestrator.js";

// Individual sync functions
export { syncMoney } from "./sync-money.js";
export { syncCategory } from "./sync-category.js";
export { syncGenre } from "./sync-genre.js";
export { syncAccount } from "./sync-account.js";

// API client (for advanced usage)
export {
  // Auth
  getAuthInfo,
  resetCache,
  verifyUser,
  // Rate limit monitoring
  getCurrentInterval,
  setBeforeRateLimitWaitCallback,
  // Money (transactions)
  fetchMoney,
  fetchAllMoneyStreaming,
  // Master data
  fetchCategories,
  fetchGenres,
  fetchAccounts,
  // Default master data
  fetchDefaultCategories,
  fetchDefaultGenres,
  fetchDefaultAccounts,
  fetchCurrencies,
  // Utilities
  formatDate,
  // Types
  type AuthInfo,
  type ZaimUser,
  type MoneyRecord,
  type Category,
  type Genre,
  type Account,
  type DefaultCategory,
  type DefaultGenre,
  type DefaultAccount,
  type Currency,
  type FetchMoneyOptions,
  type MoneyPageCallback,
} from "./api-client.js";
