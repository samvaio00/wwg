import { db } from "./db";
import { products, users, categories } from "@shared/schema";
import { eq } from "drizzle-orm";
import { UserStatus } from "@shared/schema";

interface ZohoItemWebhookPayload {
  action: string;
  item_id: string;
  sku?: string;
  name?: string;
  description?: string;
  rate?: number;
  purchase_rate?: number;
  stock_on_hand?: number;
  category_name?: string;
  brand?: string;
  manufacturer?: string;
  image_url?: string;
  is_returnable?: string | boolean;
  show_in_storefront?: string | boolean;
  group_id?: string;
  group_name?: string;
  unit?: string;
  status?: string;
  last_modified_time?: string;
}

interface ZohoCustomerWebhookPayload {
  action: string;
  contact_id: string;
  contact_name?: string;
  company_name?: string;
  email?: string;
  phone?: string;
  status?: string;
  billing_address?: string;
  shipping_address?: string;
  payment_terms?: string;
  price_list?: string;
}

interface WebhookResult {
  success: boolean;
  action: string;
  message: string;
  productId?: string;
  userId?: string;
}

function createCategorySlug(categoryName: string): string {
  return categoryName
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();
}

function parseBoolean(value: string | boolean | undefined): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    return value.toLowerCase() === "true" || value === "1";
  }
  return false;
}

export async function handleItemWebhook(
  payload: ZohoItemWebhookPayload,
  secret: string | undefined
): Promise<WebhookResult> {
  const action = payload.action?.toLowerCase() || "unknown";
  console.log(`[Zoho Webhook] Item webhook received: ${action} for item ${payload.item_id}`);

  try {
    if (!payload.item_id) {
      return {
        success: false,
        action,
        message: "Missing item_id in payload",
      };
    }

    const existingProduct = await db
      .select()
      .from(products)
      .where(eq(products.zohoItemId, payload.item_id))
      .limit(1);

    if (action.includes("delete")) {
      if (existingProduct.length > 0) {
        await db
          .update(products)
          .set({
            isOnline: false,
            isActive: false,
            updatedAt: new Date(),
          })
          .where(eq(products.id, existingProduct[0].id));

        console.log(`[Zoho Webhook] Product delisted: ${existingProduct[0].sku}`);
        return {
          success: true,
          action,
          message: `Product ${existingProduct[0].sku} marked as offline/inactive`,
          productId: existingProduct[0].id,
        };
      } else {
        return {
          success: true,
          action,
          message: `Product with Zoho ID ${payload.item_id} not found in database (already deleted or never synced)`,
        };
      }
    }

    const showInOnlineStore = parseBoolean(payload.show_in_storefront);
    const categorySlug = payload.category_name
      ? createCategorySlug(payload.category_name)
      : "other-items";

    const productData = {
      sku: payload.sku || `ZOHO-${payload.item_id}`,
      name: payload.name || "Unknown Product",
      description: payload.description || null,
      category: categorySlug,
      brand: payload.brand || payload.manufacturer || null,
      basePrice: payload.rate?.toString() || "0",
      stockQuantity: showInOnlineStore ? Math.floor(payload.stock_on_hand || 0) : 0,
      isActive: true,
      isOnline: showInOnlineStore,
      imageUrl: payload.image_url || null,
      zohoItemId: payload.item_id,
      zohoGroupId: payload.group_id || null,
      zohoGroupName: payload.group_name || null,
      zohoLastSyncAt: new Date(),
      updatedAt: new Date(),
    };

    if (existingProduct.length > 0) {
      await db
        .update(products)
        .set(productData)
        .where(eq(products.id, existingProduct[0].id));

      console.log(`[Zoho Webhook] Product updated: ${productData.sku}`);
      return {
        success: true,
        action,
        message: `Product ${productData.sku} updated successfully`,
        productId: existingProduct[0].id,
      };
    } else {
      const [newProduct] = await db
        .insert(products)
        .values({
          id: crypto.randomUUID(),
          ...productData,
          minOrderQuantity: 1,
          casePackSize: 1,
          lowStockThreshold: 10,
          createdAt: new Date(),
        })
        .returning();

      console.log(`[Zoho Webhook] Product created: ${productData.sku}`);
      return {
        success: true,
        action,
        message: `Product ${productData.sku} created successfully`,
        productId: newProduct.id,
      };
    }
  } catch (error) {
    console.error(`[Zoho Webhook] Error processing item webhook:`, error);
    return {
      success: false,
      action,
      message: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function handleCustomerWebhook(
  payload: ZohoCustomerWebhookPayload,
  secret: string | undefined
): Promise<WebhookResult> {
  const action = payload.action?.toLowerCase() || "unknown";
  console.log(`[Zoho Webhook] Customer webhook received: ${action} for contact ${payload.contact_id}`);

  try {
    if (!payload.contact_id) {
      return {
        success: false,
        action,
        message: "Missing contact_id in payload",
      };
    }

    const existingUser = await db
      .select()
      .from(users)
      .where(eq(users.zohoCustomerId, payload.contact_id))
      .limit(1);

    if (existingUser.length === 0) {
      console.log(`[Zoho Webhook] Customer not found in database: ${payload.contact_id}`);
      return {
        success: true,
        action,
        message: `Customer with Zoho ID ${payload.contact_id} not found in database (not registered in WholesaleHub)`,
      };
    }

    const user = existingUser[0];
    const zohoStatus = payload.status?.toLowerCase();
    const isActive = zohoStatus === "active";

    if (action.includes("delete")) {
      await db
        .update(users)
        .set({
          zohoIsActive: false,
          status: UserStatus.SUSPENDED,
          zohoLastCheckedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(users.id, user.id));

      console.log(`[Zoho Webhook] Customer suspended (deleted in Zoho): ${user.email}`);
      return {
        success: true,
        action,
        message: `Customer ${user.email} suspended (deleted in Zoho)`,
        userId: user.id,
      };
    }

    const currentlyActive = user.zohoIsActive !== false;
    let statusChanged = false;

    if (isActive && !currentlyActive) {
      if (user.status === UserStatus.SUSPENDED) {
        await db
          .update(users)
          .set({
            zohoIsActive: true,
            status: UserStatus.APPROVED,
            zohoLastCheckedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(users.id, user.id));
        statusChanged = true;
        console.log(`[Zoho Webhook] Customer reactivated: ${user.email}`);
      }
    } else if (!isActive && currentlyActive) {
      await db
        .update(users)
        .set({
          zohoIsActive: false,
          status: UserStatus.SUSPENDED,
          zohoLastCheckedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(users.id, user.id));
      statusChanged = true;
      console.log(`[Zoho Webhook] Customer suspended: ${user.email}`);
    }

    await db
      .update(users)
      .set({
        zohoLastCheckedAt: new Date(),
        zohoIsActive: isActive,
        updatedAt: new Date(),
        ...(payload.company_name && { businessName: payload.company_name }),
        ...(payload.phone && { phone: payload.phone }),
      })
      .where(eq(users.id, user.id));

    return {
      success: true,
      action,
      message: statusChanged
        ? `Customer ${user.email} status ${isActive ? "reactivated" : "suspended"}`
        : `Customer ${user.email} synced (no status change)`,
      userId: user.id,
    };
  } catch (error) {
    console.error(`[Zoho Webhook] Error processing customer webhook:`, error);
    return {
      success: false,
      action,
      message: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export function verifyWebhookSecret(
  providedSecret: string | undefined,
  expectedSecret: string | undefined
): boolean {
  if (!expectedSecret) {
    console.warn("[Zoho Webhook] ZOHO_WEBHOOK_SECRET not configured - allowing all requests (not recommended for production)");
    return true;
  }

  if (!providedSecret) {
    console.warn("[Zoho Webhook] No secret provided in request");
    return false;
  }

  return providedSecret === expectedSecret;
}
