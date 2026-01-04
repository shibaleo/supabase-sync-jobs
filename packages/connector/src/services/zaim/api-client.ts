/**
 * Zaim API Client
 *
 * OAuth 1.0a authentication and API calls.
 * Data fetching only, no DB operations.
 *
 * Credentials:
 * - Loaded from Supabase Vault (getCredentials("zaim"))
 * - Uses consumer_key, consumer_secret, access_token, access_token_secret
 *
 * API Reference: https://dev.zaim.net/home/api
 */

import { createHmac, randomBytes } from "crypto";
import { config } from "dotenv";
import { getCredentials } from "../../lib/credentials-vault.js";
import { setupLogger } from "../../lib/logger.js";

// Load .env for local development
config();

const logger = setupLogger("zaim-api");

// Configuration
const ZAIM_API_BASE = "https://api.zaim.net/v2";
const DEFAULT_RETRY_DELAY_SEC = 1;
const DEFAULT_PAGE_LIMIT = 100; // Max per API spec
const BASE_REQUEST_INTERVAL_MS = 200; // Base interval: 5 requests per second
const FETCH_TIMEOUT_MS = 30000; // 30 seconds timeout per request

// Retry limits
const MAX_RATE_LIMIT_RETRIES = 1; // 429: retry once
const MAX_SERVER_ERROR_RETRIES = 2; // 5xx: retry twice

// Dynamic interval adjustment
let currentIntervalMs = BASE_REQUEST_INTERVAL_MS;
let consecutiveSuccesses = 0;
const INTERVAL_INCREASE_FACTOR = 2; // Double interval on 429
const INTERVAL_DECREASE_THRESHOLD = 10; // Decrease after 10 consecutive successes
const MIN_INTERVAL_MS = 200;
const MAX_INTERVAL_MS = 2000;

// Types
export interface AuthInfo {
  consumerKey: string;
  consumerSecret: string;
  accessToken: string;
  accessTokenSecret: string;
}

// Authentication Cache
let cachedAuth: AuthInfo | null = null;

// Global callback for flushing data before rate limit wait
let globalBeforeRateLimitWait: (() => Promise<void>) | null = null;

/**
 * Set a global callback to be called before any rate limit wait
 * Useful for flushing pending data to DB before waiting
 */
export function setBeforeRateLimitWaitCallback(callback: (() => Promise<void>) | null): void {
  globalBeforeRateLimitWait = callback;
}

/**
 * Reset cache and interval state (for testing)
 */
export function resetCache(): void {
  cachedAuth = null;
  globalBeforeRateLimitWait = null;
  currentIntervalMs = BASE_REQUEST_INTERVAL_MS;
  consecutiveSuccesses = 0;
}

/**
 * Get current request interval (for monitoring)
 */
export function getCurrentInterval(): number {
  return currentIntervalMs;
}

// =============================================================================
// OAuth 1.0a Signature Generation
// =============================================================================

/**
 * Percent encode according to RFC 3986
 */
function percentEncode(str: string): string {
  return encodeURIComponent(str).replace(
    /[!'()*]/g,
    (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase()
  );
}

/**
 * Generate OAuth nonce
 */
function generateNonce(): string {
  return randomBytes(16).toString("hex");
}

/**
 * Generate OAuth timestamp
 */
function generateTimestamp(): string {
  return Math.floor(Date.now() / 1000).toString();
}

/**
 * Generate OAuth 1.0a signature base string
 */
function generateSignatureBaseString(
  method: string,
  url: string,
  params: Record<string, string>
): string {
  // Sort parameters alphabetically
  const sortedParams = Object.keys(params)
    .sort()
    .map((key) => `${percentEncode(key)}=${percentEncode(params[key])}`)
    .join("&");

  return [
    method.toUpperCase(),
    percentEncode(url),
    percentEncode(sortedParams),
  ].join("&");
}

/**
 * Generate HMAC-SHA1 signature
 */
function generateSignature(
  baseString: string,
  consumerSecret: string,
  tokenSecret: string
): string {
  const signingKey = `${percentEncode(consumerSecret)}&${percentEncode(tokenSecret)}`;
  const hmac = createHmac("sha1", signingKey);
  hmac.update(baseString);
  return hmac.digest("base64");
}

/**
 * Generate OAuth Authorization header
 */
function generateAuthHeader(
  method: string,
  url: string,
  auth: AuthInfo,
  queryParams: Record<string, string> = {}
): string {
  const oauthParams: Record<string, string> = {
    oauth_consumer_key: auth.consumerKey,
    oauth_nonce: generateNonce(),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: generateTimestamp(),
    oauth_token: auth.accessToken,
    oauth_version: "1.0",
  };

  // Combine OAuth params and query params for signature
  const allParams = { ...oauthParams, ...queryParams };

  // Generate signature
  const baseString = generateSignatureBaseString(method, url, allParams);
  const signature = generateSignature(
    baseString,
    auth.consumerSecret,
    auth.accessTokenSecret
  );

  // Add signature to OAuth params
  oauthParams.oauth_signature = signature;

  // Build Authorization header
  const headerParams = Object.keys(oauthParams)
    .sort()
    .map((key) => `${percentEncode(key)}="${percentEncode(oauthParams[key])}"`)
    .join(", ");

  return `OAuth ${headerParams}`;
}

// =============================================================================
// HTTP Request with Retry
// =============================================================================

/**
 * Handle rate limit response and adjust interval
 */
function handleRateLimit(response: Response): number {
  // Increase interval on rate limit (dynamic adjustment)
  const newInterval = Math.min(currentIntervalMs * INTERVAL_INCREASE_FACTOR, MAX_INTERVAL_MS);
  if (newInterval !== currentIntervalMs) {
    logger.info(`Increasing request interval: ${currentIntervalMs}ms -> ${newInterval}ms`);
    currentIntervalMs = newInterval;
  }
  consecutiveSuccesses = 0;

  const retryAfter = response.headers.get("Retry-After");
  if (retryAfter) {
    const seconds = parseInt(retryAfter, 10);
    if (!isNaN(seconds)) {
      return seconds;
    }
  }
  return DEFAULT_RETRY_DELAY_SEC;
}

/**
 * Record successful request and potentially decrease interval
 */
function recordSuccess(): void {
  consecutiveSuccesses++;
  if (consecutiveSuccesses >= INTERVAL_DECREASE_THRESHOLD && currentIntervalMs > MIN_INTERVAL_MS) {
    const newInterval = Math.max(currentIntervalMs / INTERVAL_INCREASE_FACTOR, MIN_INTERVAL_MS);
    if (newInterval !== currentIntervalMs) {
      logger.debug(`Decreasing request interval: ${currentIntervalMs}ms -> ${newInterval}ms`);
      currentIntervalMs = newInterval;
    }
    consecutiveSuccesses = 0;
  }
}

/**
 * Fetch with timeout wrapper
 */
async function fetchWithTimeout(url: string, options: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * HTTP request with retry for rate limits and server errors
 * - 429: max 1 retry
 * - 5xx: max 2 retries
 * - Timeout: 30 seconds per request
 */
async function requestWithRetry(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  let rateLimitRetries = 0;
  let serverErrorRetries = 0;

  while (true) {
    try {
      const response = await fetchWithTimeout(url, options);

      if (response.ok) {
        recordSuccess();
        return response;
      }

      if (response.status === 429) {
        if (rateLimitRetries >= MAX_RATE_LIMIT_RETRIES) {
          const text = await response.text();
          throw new Error(`HTTP 429: Rate limit exceeded after ${rateLimitRetries} retries. ${text}`);
        }
        rateLimitRetries++;

        const waitSeconds = handleRateLimit(response);
        logger.warn(`Rate limited (429). Waiting ${waitSeconds}s... [retry ${rateLimitRetries}/${MAX_RATE_LIMIT_RETRIES}]`);

        // Flush pending data before waiting
        if (globalBeforeRateLimitWait) {
          logger.info("Flushing pending data before rate limit wait...");
          await globalBeforeRateLimitWait();
        }

        await new Promise((r) => setTimeout(r, waitSeconds * 1000));
        continue;
      }

      if (response.status >= 500 && response.status < 600) {
        if (serverErrorRetries >= MAX_SERVER_ERROR_RETRIES) {
          const text = await response.text();
          throw new Error(`HTTP ${response.status}: Server error after ${serverErrorRetries} retries. ${text}`);
        }
        serverErrorRetries++;
        logger.warn(`Server error (${response.status}). Retrying... [retry ${serverErrorRetries}/${MAX_SERVER_ERROR_RETRIES}]`);
        await new Promise((r) => setTimeout(r, DEFAULT_RETRY_DELAY_SEC * 1000));
        continue;
      }

      const text = await response.text();
      throw new Error(`HTTP ${response.status}: ${text}`);
    } catch (error) {
      // Handle timeout (AbortError)
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(`Request timeout after ${FETCH_TIMEOUT_MS}ms: ${url}`);
      }
      throw error;
    }
  }
}

// =============================================================================
// Authentication
// =============================================================================

/**
 * Get authentication info (cached)
 * OAuth 1.0a tokens don't expire, so we just cache them
 */
export async function getAuthInfo(forceRefresh: boolean = false): Promise<AuthInfo> {
  if (!forceRefresh && cachedAuth !== null) {
    logger.debug("Using cached auth");
    return cachedAuth;
  }

  // Load from vault
  logger.debug("Loading credentials from vault...");
  const result = await getCredentials("zaim");
  const credentials = result.credentials as Record<string, unknown>;

  // Validate required fields
  if (!credentials.consumer_key || !credentials.consumer_secret) {
    throw new Error("Missing consumer_key or consumer_secret");
  }
  if (!credentials.access_token || !credentials.access_token_secret) {
    throw new Error("Missing access_token or access_token_secret. Run OAuth flow first.");
  }

  // Cache and return
  cachedAuth = {
    consumerKey: credentials.consumer_key as string,
    consumerSecret: credentials.consumer_secret as string,
    accessToken: credentials.access_token as string,
    accessTokenSecret: credentials.access_token_secret as string,
  };

  logger.debug("Auth initialized");
  return cachedAuth;
}

// =============================================================================
// API Request Helper
// =============================================================================

/**
 * Make authenticated API request
 */
async function apiRequest<T>(
  endpoint: string,
  params: Record<string, string> = {}
): Promise<T> {
  const auth = await getAuthInfo();
  const url = `${ZAIM_API_BASE}${endpoint}`;

  // Build query string
  const queryString = Object.keys(params).length > 0
    ? "?" + new URLSearchParams(params).toString()
    : "";
  const fullUrl = url + queryString;

  // Generate OAuth header
  const authHeader = generateAuthHeader("GET", url, auth, params);

  logger.debug(`GET ${endpoint}`);

  try {
    const response = await requestWithRetry(fullUrl, {
      method: "GET",
      headers: {
        Authorization: authHeader,
      },
    });
    return (await response.json()) as T;
  } catch (error) {
    // Token invalid, try refresh from vault
    if (String(error).includes("401")) {
      logger.warn("Token invalid, reloading from vault...");
      const newAuth = await getAuthInfo(true);
      const newAuthHeader = generateAuthHeader("GET", url, newAuth, params);
      const response = await requestWithRetry(fullUrl, {
        method: "GET",
        headers: {
          Authorization: newAuthHeader,
        },
      });
      return (await response.json()) as T;
    }
    throw error;
  }
}

// =============================================================================
// Date Utilities
// =============================================================================

/**
 * Format date for Zaim API (YYYY-MM-DD)
 */
export function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

// =============================================================================
// User API
// =============================================================================

export interface ZaimUser {
  id: number;
  login: string;
  name: string;
  input_count: number;
  day_count: number;
  repeat_count: number;
  day: number;
  week: number;
  month: number;
  currency_code: string;
  profile_image_url?: string;
  cover_image_url?: string;
  profile_modified?: string;
}

interface VerifyResponse {
  me: ZaimUser;
  requested: number;
}

/**
 * Verify user authentication
 */
export async function verifyUser(): Promise<ZaimUser> {
  const data = await apiRequest<VerifyResponse>("/home/user/verify");
  logger.debug("User verified");
  return data.me;
}

// =============================================================================
// Money API (Transactions)
// =============================================================================

export interface MoneyRecord {
  id: number;
  mode: "income" | "payment" | "transfer";
  user_id: number;
  date: string;
  category_id: number;
  genre_id: number;
  to_account_id: number;
  from_account_id: number;
  amount: number;
  comment: string;
  active: number;
  name: string;
  receipt_id: number;
  place: string;
  created: string;
  currency_code: string;
}

interface MoneyResponse {
  money: MoneyRecord[];
  requested: number;
}

export interface FetchMoneyOptions {
  startDate?: Date;
  endDate?: Date;
  mode?: "income" | "payment" | "transfer";
  categoryId?: number;
  genreId?: number;
  page?: number;
  limit?: number;
}

/**
 * Fetch money records (transactions)
 */
export async function fetchMoney(options: FetchMoneyOptions = {}): Promise<MoneyRecord[]> {
  const params: Record<string, string> = {
    mapping: "1",
  };

  if (options.startDate) {
    params.start_date = formatDate(options.startDate);
  }
  if (options.endDate) {
    params.end_date = formatDate(options.endDate);
  }
  if (options.mode) {
    params.mode = options.mode;
  }
  if (options.categoryId) {
    params.category_id = String(options.categoryId);
  }
  if (options.genreId) {
    params.genre_id = String(options.genreId);
  }
  if (options.page) {
    params.page = String(options.page);
  }
  params.limit = String(options.limit || DEFAULT_PAGE_LIMIT);

  const data = await apiRequest<MoneyResponse>("/home/money", params);

  logger.debug(`Response: ${data.money?.length || 0} money records`);
  return data.money || [];
}

/**
 * Callback for streaming money fetch
 */
export type MoneyPageCallback = (records: MoneyRecord[], page: number) => Promise<void>;

/**
 * Fetch all money records with pagination, calling callback for each page
 * This allows streaming inserts instead of waiting for all data
 *
 * @param startDate - Start date for the query
 * @param endDate - End date for the query
 * @param onPage - Callback called with each page of records (can run DB insert in parallel)
 * @returns Total number of records fetched
 */
export async function fetchAllMoneyStreaming(
  startDate: Date,
  endDate: Date,
  onPage: MoneyPageCallback
): Promise<number> {
  let page = 1;
  let hasMore = true;
  let totalRecords = 0;
  const pendingInserts: Promise<void>[] = [];

  while (hasMore) {
    // Rate limit: wait before each request (except the first)
    // Uses dynamic interval that adjusts based on rate limit responses
    if (page > 1) {
      await new Promise((r) => setTimeout(r, currentIntervalMs));
    }

    const records = await fetchMoney({
      startDate,
      endDate,
      page,
      limit: DEFAULT_PAGE_LIMIT,
    });

    if (records.length > 0) {
      totalRecords += records.length;
      // Start DB insert in parallel (don't await here)
      pendingInserts.push(onPage(records, page));
      logger.debug(`Page ${page}: ${records.length} records (insert started, interval=${currentIntervalMs}ms)`);
    }

    if (records.length < DEFAULT_PAGE_LIMIT) {
      hasMore = false;
    } else {
      page++;
    }
  }

  // Wait for all pending inserts to complete (allow partial success)
  if (pendingInserts.length > 0) {
    logger.debug(`Waiting for ${pendingInserts.length} pending inserts...`);
    const results = await Promise.allSettled(pendingInserts);
    const failures = results.filter((r) => r.status === "rejected");
    if (failures.length > 0) {
      logger.warn(`${failures.length}/${results.length} inserts failed`);
      for (const f of failures) {
        if (f.status === "rejected") {
          logger.warn(`  Insert error: ${f.reason}`);
        }
      }
    }
  }

  logger.debug(`Total fetched: ${totalRecords} money records`);
  return totalRecords;
}

// =============================================================================
// Category API (User's custom categories)
// =============================================================================

export interface Category {
  id: number;
  name: string;
  mode: "payment" | "income";
  sort: number;
  parent_category_id: number;
  active: number;
  modified: string;
}

interface CategoryResponse {
  categories: Category[];
  requested: number;
}

/**
 * Fetch user's categories
 */
export async function fetchCategories(): Promise<Category[]> {
  const data = await apiRequest<CategoryResponse>("/home/category", {
    mapping: "1",
  });

  logger.debug(`Response: ${data.categories?.length || 0} categories`);
  return data.categories || [];
}

// =============================================================================
// Genre API (User's custom genres)
// =============================================================================

export interface Genre {
  id: number;
  name: string;
  sort: number;
  active: number;
  category_id: number;
  parent_genre_id: number;
  modified: string;
}

interface GenreResponse {
  genres: Genre[];
  requested: number;
}

/**
 * Fetch user's genres
 */
export async function fetchGenres(): Promise<Genre[]> {
  const data = await apiRequest<GenreResponse>("/home/genre", {
    mapping: "1",
  });

  logger.debug(`Response: ${data.genres?.length || 0} genres`);
  return data.genres || [];
}

// =============================================================================
// Account API (User's accounts)
// =============================================================================

export interface Account {
  id: number;
  name: string;
  modified: string;
  sort: number;
  active: number;
  local_id: number;
  website_id: number;
  parent_account_id: number;
}

interface AccountResponse {
  accounts: Account[];
  requested: number;
}

/**
 * Fetch user's accounts
 */
export async function fetchAccounts(): Promise<Account[]> {
  const data = await apiRequest<AccountResponse>("/home/account", {
    mapping: "1",
  });

  logger.debug(`Response: ${data.accounts?.length || 0} accounts`);
  return data.accounts || [];
}

// =============================================================================
// Default Master Data API (No auth required, but we use auth anyway)
// =============================================================================

export interface DefaultCategory {
  id: number;
  mode: "payment" | "income";
  name: string;
}

interface DefaultCategoryResponse {
  categories: DefaultCategory[];
  requested: number;
}

/**
 * Fetch default categories
 */
export async function fetchDefaultCategories(): Promise<DefaultCategory[]> {
  const data = await apiRequest<DefaultCategoryResponse>("/category");

  logger.debug(`Response: ${data.categories?.length || 0} default categories`);
  return data.categories || [];
}

export interface DefaultGenre {
  id: number;
  category_id: number;
  name: string;
}

interface DefaultGenreResponse {
  genres: DefaultGenre[];
  requested: number;
}

/**
 * Fetch default genres
 */
export async function fetchDefaultGenres(): Promise<DefaultGenre[]> {
  const data = await apiRequest<DefaultGenreResponse>("/genre");

  logger.debug(`Response: ${data.genres?.length || 0} default genres`);
  return data.genres || [];
}

export interface DefaultAccount {
  id: number;
  name: string;
}

interface DefaultAccountResponse {
  accounts: DefaultAccount[];
  requested: number;
}

/**
 * Fetch default accounts
 */
export async function fetchDefaultAccounts(): Promise<DefaultAccount[]> {
  const data = await apiRequest<DefaultAccountResponse>("/account");

  logger.debug(`Response: ${data.accounts?.length || 0} default accounts`);
  return data.accounts || [];
}

export interface Currency {
  currency_code: string;
  unit: string;
  name: string;
  point: number;
}

interface CurrencyResponse {
  currencies: Currency[];
  requested: number;
}

/**
 * Fetch currencies
 */
export async function fetchCurrencies(): Promise<Currency[]> {
  const data = await apiRequest<CurrencyResponse>("/currency");

  logger.debug(`Response: ${data.currencies?.length || 0} currencies`);
  return data.currencies || [];
}
