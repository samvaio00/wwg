import { db } from "./db";
import { products, syncRuns, SyncType, priceLists, customerPrices, categories, zohoApiLogs, productGroups } from "@shared/schema";
import { eq, isNotNull, desc, and, sql } from "drizzle-orm";
import { storage } from "./storage";
import * as fs from "fs";
import * as path from "path";

const PRODUCT_IMAGES_DIR = path.join(process.cwd(), "public", "product-images");

// Helper to log Zoho API calls
async function logZohoApiCall(endpoint: string, method: string, statusCode: number | null, success: boolean, errorMessage?: string) {
  try {
    await db.insert(zohoApiLogs).values({
      endpoint,
      method,
      statusCode,
      success,
      errorMessage,
    });
  } catch (e) {
    // Silently fail - don't break API calls if logging fails
    console.error("[Zoho API Log] Failed to log API call:", e);
  }
}

interface ZohoTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

interface ZohoCustomField {
  customfield_id: string;
  label: string;
  value: string | number | boolean;
}

interface ZohoItem {
  item_id: string;
  name: string;
  sku: string;
  description?: string;
  rate: number;
  purchase_rate?: number;
  category_name?: string;
  brand?: string;
  manufacturer?: string;
  stock_on_hand?: number;
  reorder_level?: number;
  image_document_id?: string;
  show_in_storefront?: boolean;
  status: string;
  last_modified_time?: string;
  custom_fields?: ZohoCustomField[];
  cf_case_pack_size?: number;
  cf_min_order_quantity?: number;
  cf_compare_at_price?: number;
  cf_subcategory?: string;
  cf_tags?: string;
  // Item group fields (for variant products like colors, sizes)
  group_id?: string;
  group_name?: string;
  item_group_id?: string;
  item_group_name?: string;
}

function getCustomFieldValue(item: ZohoItem, label: string): string | number | boolean | undefined {
  if (item.custom_fields) {
    const field = item.custom_fields.find(
      (f) => f.label.toLowerCase().replace(/\s+/g, "_") === label.toLowerCase()
    );
    if (field) return field.value;
  }
  const cfKey = `cf_${label.toLowerCase().replace(/\s+/g, "_")}` as keyof ZohoItem;
  return item[cfKey] as string | number | boolean | undefined;
}

interface ZohoItemsResponse {
  items: ZohoItem[];
  page_context: {
    page: number;
    per_page: number;
    has_more_page: boolean;
  };
}

let cachedAccessToken: string | null = null;
let tokenExpiresAt: number = 0;

// Rate limit tracking
let rateLimitedUntil: number = 0;
const RATE_LIMIT_BACKOFF_BASE_MS = 30000; // Start with 30 seconds
const RATE_LIMIT_MAX_BACKOFF_MS = 300000; // Max 5 minutes
let consecutiveRateLimits = 0;

// Helper to check if we're rate limited
function isRateLimited(): boolean {
  if (Date.now() < rateLimitedUntil) {
    const remainingSec = Math.round((rateLimitedUntil - Date.now()) / 1000);
    console.log(`[Zoho API] Rate limited for ${remainingSec} more seconds`);
    return true;
  }
  return false;
}

// Helper to handle rate limit response and calculate backoff
function handleRateLimit(): void {
  consecutiveRateLimits++;
  const backoffMs = Math.min(
    RATE_LIMIT_BACKOFF_BASE_MS * Math.pow(2, consecutiveRateLimits - 1),
    RATE_LIMIT_MAX_BACKOFF_MS
  );
  rateLimitedUntil = Date.now() + backoffMs;
  console.log(`[Zoho API] Rate limited - backing off for ${Math.round(backoffMs / 1000)} seconds (attempt ${consecutiveRateLimits})`);
}

// Reset rate limit tracking on success
function resetRateLimitTracking(): void {
  if (consecutiveRateLimits > 0) {
    console.log(`[Zoho API] Rate limit cleared after ${consecutiveRateLimits} consecutive limits`);
  }
  consecutiveRateLimits = 0;
  rateLimitedUntil = 0;
}

// Retry helper with exponential backoff
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: { 
    maxRetries?: number; 
    initialDelayMs?: number;
    operationName?: string;
  } = {}
): Promise<T> {
  const { maxRetries = 3, initialDelayMs = 1000, operationName = "operation" } = options;
  
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    // Check rate limit before attempting - wait the full duration
    if (isRateLimited()) {
      const waitTime = rateLimitedUntil - Date.now();
      if (waitTime > 0) {
        console.log(`[Zoho API] Waiting ${Math.round(waitTime / 1000)}s for rate limit before ${operationName}`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
    
    try {
      const result = await fn();
      resetRateLimitTracking();
      return result;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      // Check if this is a rate limit error
      const isRateLimitError = lastError.message.includes("too many requests") ||
                               lastError.message.includes("Access Denied") ||
                               lastError.message.includes("rate limit");
      
      if (isRateLimitError) {
        handleRateLimit();
        
        if (attempt < maxRetries) {
          const waitTime = rateLimitedUntil - Date.now();
          if (waitTime > 0) {
            console.log(`[Zoho API] ${operationName} rate limited, waiting ${Math.round(waitTime / 1000)}s before retry ${attempt + 1}/${maxRetries}`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
            continue;
          }
        }
      }
      
      // Regular backoff for other errors (non-rate-limit)
      if (attempt < maxRetries && !isRateLimitError) {
        const delay = Math.min(initialDelayMs * Math.pow(2, attempt), RATE_LIMIT_MAX_BACKOFF_MS);
        console.log(`[Zoho API] ${operationName} failed, retrying in ${Math.round(delay / 1000)}s (attempt ${attempt + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError || new Error(`${operationName} failed after ${maxRetries} retries`);
}

// Exported helper for making rate-limit-aware API calls
export async function zohoApiRequest<T>(
  requestFn: () => Promise<Response>,
  options: { operationName?: string } = {}
): Promise<T> {
  const { operationName = "API request" } = options;
  
  return retryWithBackoff(
    async () => {
      // Ensure we have a valid token before making the request
      await getAccessToken();
      const response = await requestFn();
      
      if (!response.ok) {
        const errorText = await response.text();
        
        // Handle rate limit responses
        if (response.status === 429 || errorText.includes("too many requests")) {
          throw new Error(`Rate limit: ${errorText}`);
        }
        
        throw new Error(`API error (${response.status}): ${errorText}`);
      }
      
      return response.json() as Promise<T>;
    },
    { maxRetries: 3, initialDelayMs: 2000, operationName }
  );
}

async function getAccessToken(): Promise<string> {
  if (cachedAccessToken && Date.now() < tokenExpiresAt - 60000) {
    return cachedAccessToken;
  }

  const clientId = process.env.ZOHO_CLIENT_ID;
  const clientSecret = process.env.ZOHO_CLIENT_SECRET;
  const refreshToken = process.env.ZOHO_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("Zoho credentials not configured");
  }

  return retryWithBackoff(
    async () => {
      const params = new URLSearchParams({
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "refresh_token",
      });

      const response = await fetch("https://accounts.zoho.com/oauth/v2/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to refresh Zoho token: ${errorText}`);
      }

      const data: ZohoTokenResponse = await response.json();
      cachedAccessToken = data.access_token;
      tokenExpiresAt = Date.now() + data.expires_in * 1000;

      return cachedAccessToken;
    },
    { maxRetries: 3, initialDelayMs: 2000, operationName: "token refresh" }
  );
}

interface FetchZohoItemsOptions {
  page?: number;
  sortByModified?: boolean;
}

async function fetchZohoItems(options: FetchZohoItemsOptions = {}): Promise<ZohoItemsResponse> {
  const { page = 1, sortByModified = false } = options;
  const accessToken = await getAccessToken();
  const organizationId = process.env.ZOHO_ORG_ID || process.env.ZOHO_ORGANIZATION_ID;

  if (!organizationId) {
    throw new Error("Zoho organization ID not configured");
  }
  
  // Note: Zoho Inventory API does NOT support server-side date filtering.
  // We sort by last_modified_time descending and stop pagination early when we hit older items.
  let url = `https://www.zohoapis.com/inventory/v1/items?organization_id=${organizationId}&page=${page}&per_page=200`;
  
  if (sortByModified) {
    url += `&sort_column=last_modified_time&sort_order=D`;
  }
  
  const response = await fetch(url, {
    headers: {
      Authorization: `Zoho-oauthtoken ${accessToken}`,
    },
  });

  // Log the API call
  await logZohoApiCall("/inventory/v1/items", "GET", response.status, response.ok, response.ok ? undefined : `Status: ${response.status}`);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to fetch Zoho items: ${errorText}`);
  }

  return response.json();
}

async function getLastSuccessfulSyncTime(syncType: string): Promise<Date | null> {
  const lastSync = await db
    .select({ completedAt: syncRuns.completedAt })
    .from(syncRuns)
    .where(and(
      eq(syncRuns.syncType, syncType),
      eq(syncRuns.status, "completed")
    ))
    .orderBy(desc(syncRuns.completedAt))
    .limit(1);
  
  if (lastSync.length > 0 && lastSync[0].completedAt) {
    return lastSync[0].completedAt;
  }
  return null;
}

function mapZohoCategoryToLocal(categoryName?: string): string {
  if (!categoryName) return "novelty";
  
  const lowerCategory = categoryName.toLowerCase();
  if (lowerCategory.includes("sunglass") || lowerCategory.includes("eyewear") || lowerCategory.includes("glasses")) return "sunglasses";
  if (lowerCategory.includes("cellular") || lowerCategory.includes("phone") || lowerCategory.includes("mobile") || 
      lowerCategory.includes("charger") || lowerCategory.includes("cable") || lowerCategory.includes("accessori")) return "cellular";
  if (lowerCategory.includes("cap") || lowerCategory.includes("hat") || lowerCategory.includes("headwear") || lowerCategory.includes("beanie")) return "caps";
  if (lowerCategory.includes("perfume") || lowerCategory.includes("fragrance") || lowerCategory.includes("cologne")) return "perfumes";
  return "novelty";
}

// Convert category name to URL-friendly slug
function createCategorySlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

interface ZohoCategoriesResponse {
  code: number;
  message: string;
  categories?: Array<{
    category_id: string;
    category_name?: string;
    name?: string;
    description?: string;
    status?: string;
  }>;
}

async function fetchZohoCategories(): Promise<ZohoCategoriesResponse> {
  const accessToken = await getAccessToken();
  const organizationId = process.env.ZOHO_ORG_ID || process.env.ZOHO_ORGANIZATION_ID;

  if (!organizationId) {
    throw new Error("Zoho organization ID not configured");
  }
  
  const url = `https://www.zohoapis.com/inventory/v1/categories?organization_id=${organizationId}`;
  
  const response = await fetch(url, {
    headers: {
      Authorization: `Zoho-oauthtoken ${accessToken}`,
    },
  });

  // Log the API call
  await logZohoApiCall("/inventory/v1/categories", "GET", response.status, response.ok, response.ok ? undefined : `Status: ${response.status}`);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to fetch Zoho categories: ${errorText}`);
  }

  return response.json();
}

export async function syncCategoriesFromZoho(): Promise<{ synced: number; errors: string[] }> {
  console.log("[Zoho Category Sync] Starting category sync...");
  const result = { synced: 0, errors: [] as string[] };
  
  try {
    const response = await fetchZohoCategories();
    
    if (!response.categories || response.categories.length === 0) {
      console.log("[Zoho Category Sync] No categories found in Zoho");
      return result;
    }
    
    console.log(`[Zoho Category Sync] Found ${response.categories.length} categories in Zoho`);
    
    for (let i = 0; i < response.categories.length; i++) {
      const zohoCategory = response.categories[i];
      
      // Handle both possible property names from Zoho API
      const categoryName = zohoCategory.category_name || zohoCategory.name;
      
      if (!categoryName) {
        console.warn(`[Zoho Category Sync] Skipping category with no name: ${JSON.stringify(zohoCategory)}`);
        continue;
      }
      
      try {
        await storage.upsertCategory({
          name: categoryName,
          slug: createCategorySlug(categoryName),
          description: zohoCategory.description || null,
          zohoCategoryId: zohoCategory.category_id,
          displayOrder: i,
          isActive: true,
        });
        result.synced++;
      } catch (err) {
        const errorMsg = `Failed to sync category ${categoryName}: ${err instanceof Error ? err.message : 'Unknown error'}`;
        console.error(`[Zoho Category Sync] ${errorMsg}`);
        result.errors.push(errorMsg);
      }
    }
    
    console.log(`[Zoho Category Sync] Completed - synced ${result.synced} categories`);
  } catch (err) {
    const errorMsg = `Category sync failed: ${err instanceof Error ? err.message : 'Unknown error'}`;
    console.error(`[Zoho Category Sync] ${errorMsg}`);
    result.errors.push(errorMsg);
  }
  
  return result;
}

export interface SyncResult {
  created: number;
  updated: number;
  skipped: number;
  delisted: number;
  errors: string[];
  total: number;
  syncRunId?: string;
}

export async function syncProductsFromZoho(triggeredBy: string = "manual", forceFullSync: boolean = false): Promise<SyncResult> {
  const startTime = Date.now();
  
  // Get last successful sync time for incremental sync (unless forced full sync)
  const lastSyncTime = forceFullSync ? null : await getLastSuccessfulSyncTime(SyncType.ZOHO_INVENTORY);
  const isIncremental = lastSyncTime !== null;
  
  const [syncRunRecord] = await db.insert(syncRuns).values({
    id: crypto.randomUUID(),
    syncType: SyncType.ZOHO_INVENTORY,
    status: "running",
    triggeredBy,
  }).returning();

  const result: SyncResult = {
    created: 0,
    updated: 0,
    skipped: 0,
    delisted: 0,
    errors: [],
    total: 0,
    syncRunId: syncRunRecord.id,
  };

  const onlineZohoItemIds: string[] = [];

  try {
    let page = 1;
    let hasMore = true;
    let retryCount = 0;
    const maxRetries = 3;
    
    console.log(`[Zoho Sync] Starting ${isIncremental ? 'incremental' : 'full'} sync${isIncremental ? ` (since ${lastSyncTime?.toISOString()})` : ''}`);
    
    // For incremental sync: track how many items we've actually processed vs skipped
    let incrementalProcessed = 0;
    let incrementalSkipped = 0;
    let stopPagination = false;

    while (hasMore && !stopPagination) {
      try {
        // Sort by last_modified_time descending so newest items come first
        // This allows us to stop pagination early when we hit old items
        const response = await fetchZohoItems({ 
          page, 
          sortByModified: true
        });
        const items = response.items || [];
        result.total += items.length;
        retryCount = 0;
        
        if (items.length > 0) {
          console.log(`[Zoho Sync] Page ${page}: ${items.length} items`);
        }

        for (const item of items) {
          try {
            const showInOnlineStore = item.show_in_storefront === true;
            
            // Track online items for delisting check (only during full sync)
            if (!isIncremental && showInOnlineStore) {
              onlineZohoItemIds.push(item.item_id);
            }

            if (item.status !== "active") {
              result.skipped++;
              continue;
            }
            
            // For incremental sync: skip items not modified since last sync
            // Since items are sorted by last_modified_time DESC, once we hit an old item,
            // all remaining items on this and future pages will also be old - stop pagination
            if (isIncremental && lastSyncTime && item.last_modified_time) {
              const itemModifiedAt = new Date(item.last_modified_time);
              if (itemModifiedAt < lastSyncTime) {
                incrementalSkipped++;
                result.skipped++;
                // If we've skipped multiple items in a row, we're past the sync boundary
                if (incrementalSkipped >= 5) {
                  console.log(`[Zoho Sync] Incremental: Reached items older than last sync, stopping pagination. Processed ${incrementalProcessed} items.`);
                  stopPagination = true;
                  break;
                }
                continue;
              }
              incrementalProcessed++;
            }

            const existingProduct = await db
              .select()
              .from(products)
              .where(eq(products.zohoItemId, item.item_id))
              .limit(1);

            const subcategory = getCustomFieldValue(item, "subcategory");
            const tags = getCustomFieldValue(item, "tags");
            const compareAtPrice = getCustomFieldValue(item, "compare_at_price");
            const minOrderQty = getCustomFieldValue(item, "min_order_quantity");
            const casePackSize = getCustomFieldValue(item, "case_pack_size");

            const stockQuantity = showInOnlineStore ? Math.floor(item.stock_on_hand || 0) : (existingProduct.length > 0 ? existingProduct[0].stockQuantity : 0);
            const lowStockThreshold = showInOnlineStore ? (item.reorder_level || 10) : (existingProduct.length > 0 ? existingProduct[0].lowStockThreshold : 10);
            
            // Use Zoho category directly as slug (create slug from category name)
            // Products without a category go to "other-items"
            const categorySlug = item.category_name 
              ? createCategorySlug(item.category_name) 
              : "other-items";

            if (existingProduct.length > 0) {
              await db
                .update(products)
                .set({
                  sku: item.sku || `ZOHO-${item.item_id}`,
                  name: item.name,
                  description: item.description || null,
                  category: categorySlug,
                  subcategory: typeof subcategory === "string" ? subcategory : null,
                  brand: item.brand || item.manufacturer || null,
                  tags: typeof tags === "string" ? tags.split(",").map((t) => t.trim()) : [],
                  basePrice: item.rate.toString(),
                  compareAtPrice: compareAtPrice ? String(compareAtPrice) : null,
                  minOrderQuantity: typeof minOrderQty === "number" ? minOrderQty : 1,
                  casePackSize: typeof casePackSize === "number" ? casePackSize : 1,
                  stockQuantity,
                  lowStockThreshold,
                  isActive: true,
                  isOnline: showInOnlineStore,
                  zohoItemId: item.item_id,
                  zohoGroupId: item.item_group_id || item.group_id || null,
                  zohoGroupName: item.item_group_name || item.group_name || null,
                  zohoLastSyncAt: new Date(),
                  updatedAt: new Date(),
                })
                .where(eq(products.id, existingProduct[0].id));
              result.updated++;
            } else {
              await db.insert(products).values({
                id: crypto.randomUUID(),
                sku: item.sku || `ZOHO-${item.item_id}`,
                name: item.name,
                description: item.description || null,
                category: categorySlug,
                subcategory: typeof subcategory === "string" ? subcategory : null,
                brand: item.brand || item.manufacturer || null,
                tags: typeof tags === "string" ? tags.split(",").map((t) => t.trim()) : [],
                basePrice: item.rate.toString(),
                compareAtPrice: compareAtPrice ? String(compareAtPrice) : null,
                minOrderQuantity: typeof minOrderQty === "number" ? minOrderQty : 1,
                casePackSize: typeof casePackSize === "number" ? casePackSize : 1,
                stockQuantity,
                lowStockThreshold,
                isActive: true,
                isOnline: showInOnlineStore,
                zohoItemId: item.item_id,
                zohoGroupId: item.item_group_id || item.group_id || null,
                zohoGroupName: item.item_group_name || item.group_name || null,
                zohoLastSyncAt: new Date(),
                createdAt: new Date(),
                updatedAt: new Date(),
              });
              result.created++;
              
              // Download image for new product (don't wait to avoid blocking sync)
              // Use fallback logic: try item image first, then group image
              if (item.item_id && !hasLocalImage(item.item_id)) {
                fetchProductImageWithFallback(item.item_id, item.group_id || null).catch(() => {
                  // Silently fail - image can be downloaded later
                });
              }
            }
          } catch (err) {
            result.errors.push(`Item ${item.item_id}: ${err instanceof Error ? err.message : "Unknown error"}`);
          }
        }

        hasMore = response.page_context?.has_more_page || false;
        page++;
      } catch (pageErr) {
        if (retryCount < maxRetries) {
          retryCount++;
          const delay = Math.pow(2, retryCount) * 1000;
          console.log(`[Zoho Sync] Retry ${retryCount}/${maxRetries} after ${delay}ms`);
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          throw pageErr;
        }
      }
    }

    // Delist products that are no longer in Zoho's online store
    // This handles products that were deleted or made inactive in Zoho
    // IMPORTANT: Only run during full syncs - incremental syncs don't have complete item list
    if (!isIncremental && onlineZohoItemIds.length > 0) {
      console.log(`[Zoho Sync] Running delisting check (full sync with ${onlineZohoItemIds.length} online items)`);
      const allSyncedProducts = await db
        .select({ id: products.id, zohoItemId: products.zohoItemId, isOnline: products.isOnline })
        .from(products)
        .where(isNotNull(products.zohoItemId));

      for (const prod of allSyncedProducts) {
        // If product has a Zoho ID but is NOT in the current online list, delist it
        if (prod.zohoItemId && !onlineZohoItemIds.includes(prod.zohoItemId) && prod.isOnline) {
          await db
            .update(products)
            .set({ isOnline: false, isActive: false, updatedAt: new Date() })
            .where(eq(products.id, prod.id));
          result.delisted++;
          console.log(`[Zoho Sync] Delisted product ${prod.id} (Zoho item ${prod.zohoItemId} no longer online)`);
        }
      }
    } else if (isIncremental) {
      console.log(`[Zoho Sync] Skipping delisting check (incremental sync - use full sync to detect removed items)`);
    }

    const durationMs = Date.now() - startTime;
    await db
      .update(syncRuns)
      .set({
        status: "completed",
        totalProcessed: result.total,
        created: result.created,
        updated: result.updated,
        skipped: result.skipped + result.delisted,
        errors: result.errors.length,
        completedAt: new Date(),
        durationMs,
        errorMessages: result.errors.length > 0 ? result.errors.slice(0, 100) : null,
      })
      .where(eq(syncRuns.id, syncRunRecord.id));

    console.log(`[Zoho Sync] Complete: ${result.created} created, ${result.updated} updated, ${result.delisted} delisted, ${result.errors.length} errors in ${durationMs}ms`);
  } catch (err) {
    const durationMs = Date.now() - startTime;
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    result.errors.push(`Sync failed: ${errorMessage}`);
    
    await db
      .update(syncRuns)
      .set({
        status: "failed",
        totalProcessed: result.total,
        created: result.created,
        updated: result.updated,
        skipped: result.skipped,
        errors: result.errors.length,
        completedAt: new Date(),
        durationMs,
        errorMessages: result.errors.slice(0, 100),
      })
      .where(eq(syncRuns.id, syncRunRecord.id));

    console.error(`[Zoho Sync] Failed: ${errorMessage}`);
  }

  return result;
}

export async function testZohoConnection(): Promise<{ success: boolean; message: string }> {
  try {
    await getAccessToken();
    const response = await fetchZohoItems({ page: 1 });
    return {
      success: true,
      message: `Connected successfully. Found ${response.items?.length || 0} items on first page.`,
    };
  } catch (err) {
    return {
      success: false,
      message: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

export async function getSyncHistory(limit: number = 20): Promise<typeof syncRuns.$inferSelect[]> {
  return db
    .select()
    .from(syncRuns)
    .orderBy(syncRuns.startedAt)
    .limit(limit);
}

// ================================================================
// PRICE LIST SYNC
// ================================================================

interface ZohoPriceList {
  pricebook_id: string;
  pricebook_name: string;
  description?: string;
  pricebook_type: string;
  currency_code?: string;
  status: string;
}

interface ZohoPriceListItem {
  pricebook_id: string;
  item_id: string;
  pricebook_rate: number;
  item_name?: string;
  sku?: string;
}

interface ZohoPriceListsResponse {
  pricebooks: ZohoPriceList[];
  page_context?: {
    page: number;
    per_page: number;
    has_more_page: boolean;
  };
}

interface ZohoPriceListItemsResponse {
  pricebook_items: ZohoPriceListItem[];
  page_context?: {
    page: number;
    per_page: number;
    has_more_page: boolean;
  };
}

async function fetchZohoPriceLists(): Promise<ZohoPriceListsResponse> {
  const accessToken = await getAccessToken();
  const orgId = process.env.ZOHO_ORG_ID || process.env.ZOHO_ORGANIZATION_ID;

  const response = await fetch(
    `https://www.zohoapis.com/inventory/v1/pricebooks?organization_id=${orgId}`,
    {
      headers: {
        Authorization: `Zoho-oauthtoken ${accessToken}`,
      },
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to fetch price lists: ${error}`);
  }

  return response.json();
}

async function fetchZohoPriceListItems(priceBookId: string, page: number = 1): Promise<ZohoPriceListItemsResponse> {
  const accessToken = await getAccessToken();
  const orgId = process.env.ZOHO_ORG_ID || process.env.ZOHO_ORGANIZATION_ID;

  const response = await fetch(
    `https://www.zohoapis.com/inventory/v1/pricebooks/${priceBookId}/items?organization_id=${orgId}&page=${page}&per_page=200`,
    {
      headers: {
        Authorization: `Zoho-oauthtoken ${accessToken}`,
      },
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to fetch price list items: ${error}`);
  }

  return response.json();
}

export interface PriceListSyncResult {
  priceListsCreated: number;
  priceListsUpdated: number;
  itemPricesCreated: number;
  itemPricesUpdated: number;
  errors: string[];
}

export async function syncPriceListsFromZoho(): Promise<PriceListSyncResult> {
  const result: PriceListSyncResult = {
    priceListsCreated: 0,
    priceListsUpdated: 0,
    itemPricesCreated: 0,
    itemPricesUpdated: 0,
    errors: [],
  };

  try {
    console.log("[Price Lists] Starting sync...");
    
    // Fetch all price lists from Zoho
    const priceListsResponse = await fetchZohoPriceLists();
    const zohoPriceLists = priceListsResponse.pricebooks || [];
    
    console.log(`[Price Lists] Found ${zohoPriceLists.length} price lists in Zoho`);

    for (const zohoPL of zohoPriceLists) {
      try {
        // Skip inactive price lists
        if (zohoPL.status !== "active") continue;

        // Check if price list exists in our database
        const [existing] = await db
          .select()
          .from(priceLists)
          .where(eq(priceLists.zohoPriceListId, zohoPL.pricebook_id))
          .limit(1);

        let priceListId: string;

        if (existing) {
          // Update existing price list
          await db
            .update(priceLists)
            .set({
              name: zohoPL.pricebook_name,
              description: zohoPL.description,
              priceListType: zohoPL.pricebook_type,
              currencyCode: zohoPL.currency_code || "USD",
              zohoLastSyncedAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(priceLists.id, existing.id));
          priceListId = existing.id;
          result.priceListsUpdated++;
        } else {
          // Create new price list
          const [newPriceList] = await db
            .insert(priceLists)
            .values({
              zohoPriceListId: zohoPL.pricebook_id,
              name: zohoPL.pricebook_name,
              description: zohoPL.description,
              priceListType: zohoPL.pricebook_type,
              currencyCode: zohoPL.currency_code || "USD",
              zohoLastSyncedAt: new Date(),
            })
            .returning();
          priceListId = newPriceList.id;
          result.priceListsCreated++;
        }

        // Fetch and sync price list items
        let page = 1;
        let hasMore = true;

        while (hasMore) {
          const itemsResponse = await fetchZohoPriceListItems(zohoPL.pricebook_id, page);
          const items = itemsResponse.pricebook_items || [];

          for (const item of items) {
            try {
              // Find the product by zohoItemId
              const [product] = await db
                .select({ id: products.id })
                .from(products)
                .where(eq(products.zohoItemId, item.item_id))
                .limit(1);

              if (!product) continue; // Skip if product not found

              // Check if customer price exists
              const [existingPrice] = await db
                .select()
                .from(customerPrices)
                .where(
                  and(
                    eq(customerPrices.priceListId, priceListId),
                    eq(customerPrices.productId, product.id)
                  )
                )
                .limit(1);

              if (existingPrice) {
                // Update existing price
                await db
                  .update(customerPrices)
                  .set({
                    customPrice: item.pricebook_rate.toString(),
                    zohoItemId: item.item_id,
                    updatedAt: new Date(),
                  })
                  .where(eq(customerPrices.id, existingPrice.id));
                result.itemPricesUpdated++;
              } else {
                // Create new price
                await db
                  .insert(customerPrices)
                  .values({
                    priceListId,
                    productId: product.id,
                    zohoItemId: item.item_id,
                    customPrice: item.pricebook_rate.toString(),
                  });
                result.itemPricesCreated++;
              }
            } catch (itemError) {
              result.errors.push(
                `Price list ${zohoPL.pricebook_name}, item ${item.item_id}: ${
                  itemError instanceof Error ? itemError.message : "Unknown error"
                }`
              );
            }
          }

          hasMore = itemsResponse.page_context?.has_more_page || false;
          page++;
        }
      } catch (plError) {
        result.errors.push(
          `Price list ${zohoPL.pricebook_name}: ${
            plError instanceof Error ? plError.message : "Unknown error"
          }`
        );
      }
    }

    console.log(
      `[Price Lists] Sync complete: ${result.priceListsCreated} created, ${result.priceListsUpdated} updated, ` +
        `${result.itemPricesCreated} item prices created, ${result.itemPricesUpdated} item prices updated, ` +
        `${result.errors.length} errors`
    );

    return result;
  } catch (error) {
    console.error("[Price Lists] Sync error:", error);
    result.errors.push(error instanceof Error ? error.message : "Unknown error");
    return result;
  }
}

export async function getPriceLists(): Promise<(typeof priceLists.$inferSelect)[]> {
  return db.select().from(priceLists).where(eq(priceLists.isActive, true));
}

export async function getCustomerPriceForProduct(
  priceListId: string,
  productId: string
): Promise<string | null> {
  const [price] = await db
    .select()
    .from(customerPrices)
    .where(
      and(
        eq(customerPrices.priceListId, priceListId),
        eq(customerPrices.productId, productId)
      )
    )
    .limit(1);

  return price?.customPrice || null;
}

// Fetch product image from Zoho Inventory
interface ZohoItemGroupsResponse {
  code: number;
  message: string;
  itemgroups?: Array<{
    group_id: string;
    group_name: string;
    status: string;
    items?: Array<{
      item_id: string;
      name: string;
      sku?: string;
    }>;
  }>;
  page_context?: {
    page: number;
    per_page: number;
    has_more_page: boolean;
  };
}

async function fetchZohoItemGroups(page: number = 1): Promise<ZohoItemGroupsResponse> {
  const accessToken = await getAccessToken();
  const organizationId = process.env.ZOHO_ORG_ID || process.env.ZOHO_ORGANIZATION_ID;

  if (!organizationId) {
    throw new Error("Zoho organization ID not configured");
  }

  const url = `https://www.zohoapis.com/inventory/v1/itemgroups?organization_id=${organizationId}&page=${page}&per_page=200`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Zoho-oauthtoken ${accessToken}`,
    },
  });

  // Log the API call
  await logZohoApiCall("/inventory/v1/itemgroups", "GET", response.status, response.ok, response.ok ? undefined : `Status: ${response.status}`);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to fetch Zoho item groups: ${errorText}`);
  }

  return response.json();
}

async function fetchZohoItemGroupDetail(groupId: string): Promise<{
  code: number;
  message: string;
  item_group?: {
    group_id: string;
    group_name: string;
    status: string;
    items?: Array<{
      item_id: string;
      name: string;
      sku?: string;
    }>;
  };
}> {
  const accessToken = await getAccessToken();
  const organizationId = process.env.ZOHO_ORG_ID || process.env.ZOHO_ORGANIZATION_ID;

  if (!organizationId) {
    throw new Error("Zoho organization ID not configured");
  }

  const url = `https://www.zohoapis.com/inventory/v1/itemgroups/${groupId}?organization_id=${organizationId}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Zoho-oauthtoken ${accessToken}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to fetch Zoho item group ${groupId}: ${errorText}`);
  }

  return response.json();
}

export async function syncItemGroupsFromZoho(): Promise<{ synced: number; updated: number; errors: string[] }> {
  console.log("[Zoho Item Groups Sync] Starting item groups sync...");
  const result = { synced: 0, updated: 0, errors: [] as string[] };

  try {
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const response = await fetchZohoItemGroups(page);
      const itemGroups = response.itemgroups || [];

      console.log(`[Zoho Item Groups Sync] Processing page ${page}, found ${itemGroups.length} groups`);

      for (const group of itemGroups) {
        try {
          // List response may not include items array - fetch details if needed
          let items = group.items;
          
          if (!items || items.length === 0) {
            // Fetch group details to get items
            try {
              const detailResponse = await fetchZohoItemGroupDetail(group.group_id);
              items = detailResponse.item_group?.items || [];
              
              // Rate limit between detail API calls
              await new Promise(resolve => setTimeout(resolve, 500));
            } catch (detailErr) {
              console.warn(`[Zoho Item Groups Sync] Could not fetch details for group ${group.group_name}: ${detailErr instanceof Error ? detailErr.message : 'Unknown error'}`);
              continue;
            }
          }
          
          if (!items || items.length === 0) {
            continue;
          }

          // Update all products that belong to this group
          for (const item of items) {
            const updateResult = await db
              .update(products)
              .set({
                zohoGroupId: group.group_id,
                zohoGroupName: group.group_name,
                updatedAt: new Date(),
              })
              .where(eq(products.zohoItemId, item.item_id));

            if (updateResult.rowCount && updateResult.rowCount > 0) {
              result.updated++;
            }
          }

          result.synced++;
          
          // Log progress every 50 groups
          if (result.synced % 50 === 0) {
            console.log(`[Zoho Item Groups Sync] Progress: ${result.synced} groups synced, ${result.updated} products updated`);
          }
        } catch (err) {
          const errorMsg = `Failed to sync group ${group.group_name}: ${err instanceof Error ? err.message : 'Unknown error'}`;
          console.error(`[Zoho Item Groups Sync] ${errorMsg}`);
          result.errors.push(errorMsg);
        }
      }

      hasMore = response.page_context?.has_more_page ?? false;
      page++;
    }

    console.log(`[Zoho Item Groups Sync] Completed - synced ${result.synced} groups, updated ${result.updated} products`);
  } catch (err) {
    const errorMsg = `Item groups sync failed: ${err instanceof Error ? err.message : 'Unknown error'}`;
    console.error(`[Zoho Item Groups Sync] ${errorMsg}`);
    result.errors.push(errorMsg);
  }

  return result;
}

// Persistent image storage - images are saved to disk and never expire
// Track items known to have no image to avoid repeated API calls (in-memory only)
const noImageItems = new Set<string>();

// Ensure product images directory exists
function ensureImagesDirExists(): void {
  if (!fs.existsSync(PRODUCT_IMAGES_DIR)) {
    fs.mkdirSync(PRODUCT_IMAGES_DIR, { recursive: true });
  }
}

// Supported image extensions and their MIME types
const IMAGE_EXTENSIONS: { ext: string; contentType: string }[] = [
  { ext: ".jpg", contentType: "image/jpeg" },
  { ext: ".png", contentType: "image/png" },
  { ext: ".gif", contentType: "image/gif" },
  { ext: ".webp", contentType: "image/webp" },
];

// Get local image path for a Zoho item (for saving - defaults to .jpg)
function getLocalImagePath(zohoItemId: string, ext: string = ".jpg"): string {
  return path.join(PRODUCT_IMAGES_DIR, `${zohoItemId}${ext}`);
}

// Find local image with any supported extension
function findLocalImagePath(zohoItemId: string): { path: string; contentType: string } | null {
  for (const { ext, contentType } of IMAGE_EXTENSIONS) {
    const imagePath = path.join(PRODUCT_IMAGES_DIR, `${zohoItemId}${ext}`);
    if (fs.existsSync(imagePath)) {
      return { path: imagePath, contentType };
    }
  }
  return null;
}

// Check if local image exists (any supported extension)
function hasLocalImage(zohoItemId: string): boolean {
  return findLocalImagePath(zohoItemId) !== null;
}

// Get local image from disk (checks all supported extensions)
function getLocalImage(zohoItemId: string): { data: Buffer; contentType: string } | null {
  const found = findLocalImagePath(zohoItemId);
  if (found) {
    try {
      const data = fs.readFileSync(found.path);
      return { data, contentType: found.contentType };
    } catch (err) {
      console.error(`[Image Storage] Failed to read local image for ${zohoItemId}:`, err);
      return null;
    }
  }
  return null;
}

// Save image to disk
function saveLocalImage(zohoItemId: string, data: Buffer): void {
  ensureImagesDirExists();
  const imagePath = getLocalImagePath(zohoItemId);
  try {
    fs.writeFileSync(imagePath, data);
    console.log(`[Image Storage] Saved image for ${zohoItemId}`);
  } catch (err) {
    console.error(`[Image Storage] Failed to save image for ${zohoItemId}:`, err);
  }
}

// Delete local image (for refresh) - removes all supported extensions
function deleteLocalImage(zohoItemId: string): void {
  for (const { ext } of IMAGE_EXTENSIONS) {
    const imagePath = path.join(PRODUCT_IMAGES_DIR, `${zohoItemId}${ext}`);
    if (fs.existsSync(imagePath)) {
      try {
        fs.unlinkSync(imagePath);
        console.log(`[Image Storage] Deleted image for ${zohoItemId}${ext}`);
      } catch (err) {
        console.error(`[Image Storage] Failed to delete image for ${zohoItemId}:`, err);
      }
    }
  }
}

// Track items/groups known to have no image (in-memory cache to reduce API calls)
const noImageGroups = new Set<string>();

// Fetch image from Zoho item group endpoint
async function fetchZohoGroupImageRaw(groupId: string): Promise<Buffer | null> {
  if (noImageGroups.has(groupId)) {
    return null;
  }
  
  try {
    const accessToken = await getAccessToken();
    const organizationId = process.env.ZOHO_ORG_ID || process.env.ZOHO_ORGANIZATION_ID;

    if (!organizationId) {
      return null;
    }

    const url = `https://www.zohoapis.com/inventory/v1/itemgroups/${groupId}/image?organization_id=${organizationId}`;
    
    const response = await fetch(url, {
      headers: {
        Authorization: `Zoho-oauthtoken ${accessToken}`,
      },
    });

    await logZohoApiCall("/inventory/v1/itemgroups/image", "GET", response.status, response.ok, response.ok ? undefined : `Status: ${response.status}`);

    if (!response.ok) {
      if (response.status === 404) {
        noImageGroups.add(groupId);
        return null;
      }
      
      const errorText = await response.text().catch(() => '');
      if (response.status === 400 && errorText.includes('Attachment not found')) {
        noImageGroups.add(groupId);
        return null;
      }
      
      if (response.status === 429) {
        console.log(`[Zoho Image] Rate limited for group ${groupId}, will retry later`);
        return null;
      }
      
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (error) {
    console.error(`[Zoho Image] Error fetching group image for ${groupId}:`, error);
    return null;
  }
}

// Fetch image from Zoho item endpoint (raw, without local cache check)
async function fetchZohoItemImageRaw(itemId: string): Promise<Buffer | null> {
  if (noImageItems.has(itemId)) {
    return null;
  }
  
  try {
    const accessToken = await getAccessToken();
    const organizationId = process.env.ZOHO_ORG_ID || process.env.ZOHO_ORGANIZATION_ID;

    if (!organizationId) {
      return null;
    }

    const url = `https://www.zohoapis.com/inventory/v1/items/${itemId}/image?organization_id=${organizationId}`;
    
    const response = await fetch(url, {
      headers: {
        Authorization: `Zoho-oauthtoken ${accessToken}`,
      },
    });

    await logZohoApiCall("/inventory/v1/items/image", "GET", response.status, response.ok, response.ok ? undefined : `Status: ${response.status}`);

    if (!response.ok) {
      if (response.status === 404) {
        noImageItems.add(itemId);
        return null;
      }
      
      const errorText = await response.text().catch(() => '');
      if (response.status === 400 && errorText.includes('Attachment not found')) {
        noImageItems.add(itemId);
        return null;
      }
      
      if (response.status === 429) {
        console.log(`[Zoho Image] Rate limited for item ${itemId}, will retry later`);
        return null;
      }
      
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (error) {
    console.error(`[Zoho Image] Error fetching item image for ${itemId}:`, error);
    return null;
  }
}

// Fetch image for a product, trying item-level first, then group-level as fallback
export async function fetchProductImageWithFallback(
  zohoItemId: string, 
  zohoGroupId: string | null
): Promise<{ data: Buffer; contentType: string } | null> {
  // Check for local item image first (supports all extensions)
  const localImage = getLocalImage(zohoItemId);
  if (localImage) {
    return localImage;
  }
  
  // Check for locally uploaded group image (stored as group-{groupId}.jpg)
  if (zohoGroupId) {
    const localGroupImage = getLocalImage(`group-${zohoGroupId}`);
    if (localGroupImage) {
      console.log(`[Image Storage] Using local group image for item ${zohoItemId} from group ${zohoGroupId}`);
      return localGroupImage;
    }
  }
  
  // Check if product has a manually uploaded image in DB
  const isUploaded = await isImageManuallyUploaded(zohoItemId, zohoGroupId);
  
  if (isUploaded) {
    // File was uploaded but is now missing from disk - warn and try Zoho as temporary fallback
    // but preserve the 'uploaded' imageSource so admin knows to re-upload
    console.warn(`[Image Storage] Product ${zohoItemId} has imageSource=uploaded but file is missing from disk - trying Zoho as temporary fallback`);
  }
  
  // Try item-level image from Zoho (each variant can have its own image)
  let imageData = await fetchZohoItemImageRaw(zohoItemId);
  
  // If no item image and product is in a group, try group image from Zoho
  if (!imageData && zohoGroupId) {
    imageData = await fetchZohoGroupImageRaw(zohoGroupId);
    if (imageData) {
      console.log(`[Zoho Image] Using group image for item ${zohoItemId} from group ${zohoGroupId}`);
    }
  }
  
  if (imageData) {
    saveLocalImage(zohoItemId, imageData);
    
    // Only mark imageSource as 'zoho' if the product DOESN'T have an uploaded image
    // This preserves the 'uploaded' flag so admin knows to re-upload
    if (!isUploaded) {
      try {
        await db.update(products)
          .set({ imageSource: 'zoho' })
          .where(and(
            eq(products.zohoItemId, zohoItemId),
            sql`${products.imageSource} IS NULL OR ${products.imageSource} != 'uploaded'`
          ));
      } catch (err) {
        console.error(`[Image Storage] Failed to update imageSource for ${zohoItemId}:`, err);
      }
    }
    
    return { data: imageData, contentType: "image/jpeg" };
  }
  
  return null;
}

export async function fetchZohoProductImage(zohoItemId: string): Promise<{ data: Buffer; contentType: string } | null> {
  // Check if item is known to have no image (in-memory cache only)
  if (noImageItems.has(zohoItemId)) {
    return null;
  }
  
  // Check for local image first - this is the primary storage
  const localImage = getLocalImage(zohoItemId);
  if (localImage) {
    return localImage;
  }
  
  try {
    const accessToken = await getAccessToken();
    const organizationId = process.env.ZOHO_ORG_ID || process.env.ZOHO_ORGANIZATION_ID;

    if (!organizationId) {
      console.error("[Zoho Image] Organization ID not configured");
      return null;
    }

    // Use zohoapis.com domain consistent with other API calls
    const url = `https://www.zohoapis.com/inventory/v1/items/${zohoItemId}/image?organization_id=${organizationId}`;
    
    const response = await fetch(url, {
      headers: {
        Authorization: `Zoho-oauthtoken ${accessToken}`,
      },
    });

    // Log the API call
    await logZohoApiCall("/inventory/v1/items/image", "GET", response.status, response.ok, response.ok ? undefined : `Status: ${response.status}`);

    if (!response.ok) {
      // Handle 404 or 400 with "Attachment not found" as no image available
      if (response.status === 404) {
        noImageItems.add(zohoItemId);
        return null;
      }
      
      const errorText = await response.text().catch(() => '');
      
      // Zoho returns 400 with "Attachment not found" when there's no image
      if (response.status === 400 && errorText.includes('Attachment not found')) {
        noImageItems.add(zohoItemId);
        return null;
      }
      
      // Rate limit - don't mark as no image, just return null
      if (response.status === 429) {
        console.log(`[Zoho Image] Rate limited for ${zohoItemId}, will retry later`);
        return null;
      }
      
      // Log other errors for debugging
      console.error(`[Zoho Image] Error fetching image for ${zohoItemId}: ${response.status} - ${errorText.substring(0, 200)}`);
      return null;
    }

    const contentType = response.headers.get("content-type") || "image/jpeg";
    const arrayBuffer = await response.arrayBuffer();
    const data = Buffer.from(arrayBuffer);

    // Save image to disk for persistent storage
    saveLocalImage(zohoItemId, data);

    return { data, contentType: "image/jpeg" };
  } catch (error) {
    console.error(`[Zoho Image] Error fetching image for ${zohoItemId}:`, error);
    return null;
  }
}

// Function to clear image cache (useful for admin)
export function clearImageCache(): void {
  noImageItems.clear();
  noImageGroups.clear();
  console.log("[Zoho Image] No-image tracking cleared (items and groups)");
}

// Function to check if a product's image was manually uploaded (protected from deletion)
export async function isImageManuallyUploaded(zohoItemId: string, zohoGroupId?: string | null): Promise<boolean> {
  // Check product-level imageSource
  const product = await db.select({ imageSource: products.imageSource })
    .from(products)
    .where(eq(products.zohoItemId, zohoItemId))
    .limit(1);
  
  if (product.length > 0 && product[0].imageSource === 'uploaded') {
    return true;
  }
  
  // Check group-level imageSource
  if (zohoGroupId) {
    const group = await db.select({ imageSource: productGroups.imageSource })
      .from(productGroups)
      .where(eq(productGroups.zohoGroupId, zohoGroupId))
      .limit(1);
    
    if (group.length > 0 && group[0].imageSource === 'uploaded') {
      return true;
    }
  }
  
  return false;
}

// Function to refresh a single product image from Zoho
// Only fetches from Zoho if no local image exists - existing images are permanent
export async function refreshProductImage(zohoItemId: string, zohoGroupId?: string | null, forceRefresh = false): Promise<boolean> {
  // Check if local image already exists (for item or group)
  const hasItemImage = hasLocalImage(zohoItemId);
  const hasGroupImage = zohoGroupId ? hasLocalImage(`group-${zohoGroupId}`) : false;
  
  if ((hasItemImage || hasGroupImage) && !forceRefresh) {
    console.log(`[Image Refresh] Skipping refresh for ${zohoItemId} - local image already exists`);
    return true; // Return true since the product has an image
  }
  
  // Only if force=true, delete existing image to allow re-fetch
  if (forceRefresh) {
    deleteLocalImage(zohoItemId);
    noImageItems.delete(zohoItemId);
    if (zohoGroupId) {
      noImageGroups.delete(zohoGroupId);
    }
    console.log(`[Image Refresh] Force refresh - deleted existing image for ${zohoItemId}`);
  }
  
  // Fetch image from Zoho (only runs if no local image or force=true)
  const result = await fetchProductImageWithFallback(zohoItemId, zohoGroupId || null);
  return result !== null;
}

// Track sync status for background sync
let imageSyncStatus = { running: false, progress: 0, total: 0, downloaded: 0, skipped: 0, failed: 0, noImage: 0 };

export function getImageSyncStatus() {
  return { ...imageSyncStatus };
}

// Function to sync all product images from Zoho (bulk download - runs in background)
export async function syncAllProductImages(runInBackground = false): Promise<{ downloaded: number; skipped: number; failed: number; noImage: number; message?: string }> {
  if (imageSyncStatus.running) {
    return { 
      downloaded: imageSyncStatus.downloaded, 
      skipped: imageSyncStatus.skipped, 
      failed: imageSyncStatus.failed, 
      noImage: imageSyncStatus.noImage,
      message: `Sync already in progress: ${imageSyncStatus.progress}/${imageSyncStatus.total}`
    };
  }
  
  const result = { downloaded: 0, skipped: 0, failed: 0, noImage: 0 };
  
  try {
    // Get all products with Zoho item IDs
    const { products: allProducts } = await storage.getProducts({ includeOffline: true, limit: 10000 });
    const productsWithZoho = allProducts.filter(p => p.zohoItemId);
    
    // Count how many need syncing
    const needsSync = productsWithZoho.filter(p => p.zohoItemId && !hasLocalImage(p.zohoItemId));
    result.skipped = productsWithZoho.length - needsSync.length;
    
    if (needsSync.length === 0) {
      console.log(`[Image Sync] All ${productsWithZoho.length} products already have local images`);
      return result;
    }
    
    console.log(`[Image Sync] Starting sync: ${needsSync.length} to download, ${result.skipped} already cached`);
    
    // Update status
    imageSyncStatus = { running: true, progress: 0, total: needsSync.length, downloaded: 0, skipped: result.skipped, failed: 0, noImage: 0 };
    
    // If running in background, return immediately
    if (runInBackground) {
      // Run sync in background
      (async () => {
        for (const product of needsSync) {
          if (!product.zohoItemId) continue;
          
          // Add delay to avoid rate limiting (Zoho allows ~60 requests/minute)
          // Use 1500ms for grouped products since we may make 2 API calls (item + group)
          const delay = product.zohoGroupId ? 1500 : 1200;
          await new Promise(resolve => setTimeout(resolve, delay));
          
          // Use new fallback logic: try item image first, then group image
          const imageData = await fetchProductImageWithFallback(product.zohoItemId, product.zohoGroupId || null);
          imageSyncStatus.progress++;
          
          if (imageData) {
            imageSyncStatus.downloaded++;
          } else if (noImageItems.has(product.zohoItemId) && (!product.zohoGroupId || noImageGroups.has(product.zohoGroupId))) {
            imageSyncStatus.noImage++;
          } else {
            imageSyncStatus.failed++;
          }
          
          // Log progress every 50 items
          if (imageSyncStatus.progress % 50 === 0) {
            console.log(`[Image Sync] Progress: ${imageSyncStatus.progress}/${imageSyncStatus.total} (${imageSyncStatus.downloaded} downloaded, ${imageSyncStatus.noImage} no image, ${imageSyncStatus.failed} failed)`);
          }
        }
        
        console.log(`[Image Sync] Complete: ${imageSyncStatus.downloaded} downloaded, ${imageSyncStatus.skipped} skipped, ${imageSyncStatus.noImage} no image, ${imageSyncStatus.failed} failed`);
        imageSyncStatus.running = false;
      })();
      
      return { 
        ...result, 
        message: `Sync started in background for ${needsSync.length} images. Check status at /api/admin/images/sync-status` 
      };
    }
    
    // Synchronous sync
    for (const product of needsSync) {
      if (!product.zohoItemId) continue;
      
      // Add delay to avoid rate limiting
      const delay = product.zohoGroupId ? 1500 : 1200;
      await new Promise(resolve => setTimeout(resolve, delay));
      
      // Use new fallback logic: try item image first, then group image
      const imageData = await fetchProductImageWithFallback(product.zohoItemId, product.zohoGroupId || null);
      imageSyncStatus.progress++;
      
      if (imageData) {
        result.downloaded++;
        imageSyncStatus.downloaded++;
      } else if (noImageItems.has(product.zohoItemId) && (!product.zohoGroupId || noImageGroups.has(product.zohoGroupId))) {
        result.noImage++;
        imageSyncStatus.noImage++;
      } else {
        result.failed++;
        imageSyncStatus.failed++;
      }
    }
    
    console.log(`[Image Sync] Complete: ${result.downloaded} downloaded, ${result.skipped} skipped, ${result.noImage} no image, ${result.failed} failed`);
    imageSyncStatus.running = false;
  } catch (error) {
    console.error("[Image Sync] Error during sync:", error);
    imageSyncStatus.running = false;
  }
  
  return result;
}
