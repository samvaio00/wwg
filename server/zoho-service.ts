import { db } from "./db";
import { products } from "@shared/schema";
import { eq } from "drizzle-orm";

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
  errors: string[];
  total: number;
}

export async function syncProductsFromZoho(): Promise<SyncResult> {
  const result: SyncResult = {
    created: 0,
    updated: 0,
    skipped: 0,
    errors: [],
    total: 0,
  };

  try {
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const response = await fetchZohoItems(page);
      const items = response.items || [];
      result.total += items.length;

      for (const item of items) {
        try {
          if (item.status !== "active") {
            result.skipped++;
            continue;
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

          const productData = {
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
            stockQuantity: Math.floor(item.stock_on_hand || 0),
            lowStockThreshold: item.reorder_level || 10,
            isActive: true,
            isOnline: item.show_in_storefront !== false,
            zohoItemId: item.item_id,
            zohoSku: item.sku || null,
            zohoCategoryName: item.category_name || null,
            zohoLastSyncAt: new Date(),
          };

          if (existingProduct.length > 0) {
            await db
              .update(products)
              .set(productData)
              .where(eq(products.id, existingProduct[0].id));
            result.updated++;
          } else {
            await db.insert(products).values({
              ...productData,
              id: crypto.randomUUID(),
            });
            result.created++;
          }
        } catch (err) {
          result.errors.push(`Item ${item.item_id}: ${err instanceof Error ? err.message : "Unknown error"}`);
        }
      }

      hasMore = response.page_context?.has_more_page || false;
      page++;
    }
  } catch (err) {
    result.errors.push(`Sync failed: ${err instanceof Error ? err.message : "Unknown error"}`);
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
