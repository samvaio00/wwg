import { db } from "./db";
import { products, syncRuns, SyncType } from "@shared/schema";
import { eq, isNotNull, notInArray } from "drizzle-orm";

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
  custom_fields?: ZohoCustomField[];
  cf_case_pack_size?: number;
  cf_min_order_quantity?: number;
  cf_compare_at_price?: number;
  cf_subcategory?: string;
  cf_tags?: string;
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
}

async function fetchZohoItems(page: number = 1): Promise<ZohoItemsResponse> {
  const accessToken = await getAccessToken();
  const organizationId = process.env.ZOHO_ORG_ID || process.env.ZOHO_ORGANIZATION_ID;

  if (!organizationId) {
    throw new Error("Zoho organization ID not configured");
  }
  const response = await fetch(
    `https://www.zohoapis.com/inventory/v1/items?organization_id=${organizationId}&page=${page}&per_page=100`,
    {
      headers: {
        Authorization: `Zoho-oauthtoken ${accessToken}`,
      },
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to fetch Zoho items: ${errorText}`);
  }

  return response.json();
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

export interface SyncResult {
  created: number;
  updated: number;
  skipped: number;
  delisted: number;
  errors: string[];
  total: number;
  syncRunId?: string;
}

export async function syncProductsFromZoho(triggeredBy: string = "manual"): Promise<SyncResult> {
  const startTime = Date.now();
  
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

    while (hasMore) {
      try {
        const response = await fetchZohoItems(page);
        const items = response.items || [];
        result.total += items.length;
        retryCount = 0;

        for (const item of items) {
          try {
            if (item.status !== "active") {
              result.skipped++;
              continue;
            }

            const showInOnlineStore = item.show_in_storefront === true;
            
            if (showInOnlineStore) {
              onlineZohoItemIds.push(item.item_id);
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

            if (existingProduct.length > 0) {
              await db
                .update(products)
                .set({
                  sku: item.sku || `ZOHO-${item.item_id}`,
                  name: item.name,
                  description: item.description || null,
                  category: mapZohoCategoryToLocal(item.category_name),
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
                category: mapZohoCategoryToLocal(item.category_name),
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
                zohoLastSyncAt: new Date(),
                createdAt: new Date(),
                updatedAt: new Date(),
              });
              result.created++;
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
    if (onlineZohoItemIds.length > 0) {
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
    const response = await fetchZohoItems(1);
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
