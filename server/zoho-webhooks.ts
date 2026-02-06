import { db } from "./db";
import { products, users, categories } from "@shared/schema";
import { eq } from "drizzle-orm";
import { UserStatus } from "@shared/schema";
import { recordWebhookEvent } from "./webhook-stats";
import { fetchProductImageWithFallback } from "./zoho-service";

// Queue for background image fetches from webhooks
const imageDownloadQueue: Array<{ zohoItemId: string; zohoGroupId: string | null; productName: string }> = [];
let isProcessingImageQueue = false;

// Process image download queue in background
async function processImageQueue(): Promise<void> {
  if (isProcessingImageQueue || imageDownloadQueue.length === 0) {
    return;
  }
  
  isProcessingImageQueue = true;
  console.log(`[Webhook Image Queue] Processing ${imageDownloadQueue.length} images in background`);
  
  while (imageDownloadQueue.length > 0) {
    const item = imageDownloadQueue.shift();
    if (!item) continue;
    
    try {
      const result = await fetchProductImageWithFallback(item.zohoItemId, item.zohoGroupId);
      if (result) {
        console.log(`[Webhook Image Queue] Downloaded image for ${item.productName} (${item.zohoItemId})`);
      } else {
        console.log(`[Webhook Image Queue] No image available for ${item.productName} (${item.zohoItemId})`);
      }
    } catch (error) {
      console.error(`[Webhook Image Queue] Error downloading image for ${item.productName}:`, error);
    }
    
    // Rate limit: 500ms between image fetches
    if (imageDownloadQueue.length > 0) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  
  isProcessingImageQueue = false;
  console.log(`[Webhook Image Queue] Queue processing complete`);
}

// Add item to image download queue
function queueImageDownload(zohoItemId: string, zohoGroupId: string | null, productName: string): void {
  // Avoid duplicates
  if (!imageDownloadQueue.some(item => item.zohoItemId === zohoItemId)) {
    imageDownloadQueue.push({ zohoItemId, zohoGroupId, productName });
    console.log(`[Webhook Image Queue] Queued image download for ${productName} (${zohoItemId})`);
    
    // Start processing if not already running
    setImmediate(() => processImageQueue());
  }
}

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
      recordWebhookEvent("items", action, false, "Missing item_id in payload");
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
        recordWebhookEvent("items", action, true, `Delisted ${existingProduct[0].sku}`);
        return {
          success: true,
          action,
          message: `Product ${existingProduct[0].sku} marked as offline/inactive`,
          productId: existingProduct[0].id,
        };
      } else {
        recordWebhookEvent("items", action, true, `Product with Zoho ID ${payload.item_id} not found (already deleted or never synced)`);
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

    const productData: Record<string, any> = {
      sku: payload.sku || `ZOHO-${payload.item_id}`,
      name: payload.name || "Unknown Product",
      description: payload.description || null,
      category: categorySlug,
      brand: payload.brand || payload.manufacturer || null,
      basePrice: payload.rate?.toString() || "0",
      stockQuantity: showInOnlineStore ? Math.floor(payload.stock_on_hand || 0) : 0,
      isActive: true,
      isOnline: showInOnlineStore,
      zohoItemId: payload.item_id,
      zohoGroupId: payload.group_id || null,
      zohoGroupName: payload.group_name || null,
      zohoLastSyncAt: new Date(),
      updatedAt: new Date(),
    };

    if (existingProduct.length > 0) {
      const existing = existingProduct[0];
      
      // Preserve imageUrl and imageSource for products with manually uploaded images
      // Only update imageUrl if the webhook provides one AND the product doesn't have an uploaded image
      if (existing.imageSource === 'uploaded') {
        // Keep existing imageUrl and imageSource - don't overwrite manually uploaded images
        console.log(`[Zoho Webhook] Preserving uploaded image for ${existing.sku} (imageSource: uploaded)`);
      } else if (payload.image_url) {
        // Webhook provides an image URL and product doesn't have an uploaded image - update it
        productData.imageUrl = payload.image_url;
      }
      // If no image_url in payload and not uploaded, don't touch imageUrl at all
      
      await db
        .update(products)
        .set(productData)
        .where(eq(products.id, existing.id));

      console.log(`[Zoho Webhook] Product updated: ${productData.sku}`);
      recordWebhookEvent("items", action, true, `Updated ${productData.sku}`);
      
      // Only queue image download if the product doesn't have a manually uploaded image
      if (existing.imageSource !== 'uploaded') {
        queueImageDownload(payload.item_id, payload.group_id || null, productData.name);
      }
      
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
      recordWebhookEvent("items", action, true, `Created ${productData.sku}`);
      
      // Queue image download in background (non-blocking)
      queueImageDownload(payload.item_id, payload.group_id || null, productData.name);
      
      return {
        success: true,
        action,
        message: `Product ${productData.sku} created successfully`,
        productId: newProduct.id,
      };
    }
  } catch (error) {
    console.error(`[Zoho Webhook] Error processing item webhook:`, error);
    recordWebhookEvent("items", action, false, error instanceof Error ? error.message : "Unknown error");
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
      recordWebhookEvent("customers", action, false, "Missing contact_id in payload");
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
      recordWebhookEvent("customers", action, true, `Customer with Zoho ID ${payload.contact_id} not found (not registered)`);
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
      recordWebhookEvent("customers", action, true, `Customer ${user.email} suspended (deleted in Zoho)`);
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

    const message = statusChanged
      ? `Customer ${user.email} status ${isActive ? "reactivated" : "suspended"}`
      : `Customer ${user.email} synced (no status change)`;
    recordWebhookEvent("customers", action, true, message);
    return {
      success: true,
      action,
      message,
      userId: user.id,
    };
  } catch (error) {
    console.error(`[Zoho Webhook] Error processing customer webhook:`, error);
    recordWebhookEvent("customers", action, false, error instanceof Error ? error.message : "Unknown error");
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

  // Zoho sometimes appends trailing '&' to webhook URLs - strip it for comparison
  const cleanedSecret = providedSecret.replace(/&+$/, "");
  return cleanedSecret === expectedSecret;
}

interface ZohoInvoiceLineItem {
  item_id?: string;
  sku?: string;
  quantity?: number;
  name?: string;
}

interface ZohoInvoiceWebhookPayload {
  invoice?: {
    invoice_id?: string;
    invoice_number?: string;
    status?: string;
    line_items?: ZohoInvoiceLineItem[];
  };
  invoice_id?: string;
  invoice_number?: string;
  status?: string;
  line_items?: ZohoInvoiceLineItem[];
}

interface ZohoBillLineItem {
  item_id?: string;
  sku?: string;
  quantity?: number;
  name?: string;
}

interface ZohoBillWebhookPayload {
  bill?: {
    bill_id?: string;
    bill_number?: string;
    status?: string;
    line_items?: ZohoBillLineItem[];
  };
  bill_id?: string;
  bill_number?: string;
  status?: string;
  line_items?: ZohoBillLineItem[];
}

// Valid statuses that indicate stock should be adjusted
// Invoices: sent, paid, overdue = stock was sold
// Bills: open, paid, overdue = stock was received
const INVOICE_VALID_STATUSES = ["sent", "paid", "overdue", "partially_paid"];
const BILL_VALID_STATUSES = ["open", "paid", "overdue", "partially_paid"];

// Simple in-memory idempotency cache to prevent duplicate processing
// Key format: "invoice:${id}:${status}" or "bill:${id}:${status}"
const processedWebhooks = new Map<string, Date>();
const MAX_CACHE_SIZE = 10000;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function checkAndRecordProcessed(type: "invoice" | "bill", id: string, status: string): boolean {
  const key = `${type}:${id}:${status}`;
  
  // Clean old entries if cache is large
  if (processedWebhooks.size > MAX_CACHE_SIZE) {
    const cutoff = new Date(Date.now() - CACHE_TTL_MS);
    Array.from(processedWebhooks.entries()).forEach(([k, v]) => {
      if (v < cutoff) processedWebhooks.delete(k);
    });
  }
  
  if (processedWebhooks.has(key)) {
    return true; // Already processed
  }
  
  processedWebhooks.set(key, new Date());
  return false; // Not yet processed
}

export async function handleInvoiceWebhook(
  payload: ZohoInvoiceWebhookPayload,
  secret: string | undefined
): Promise<WebhookResult> {
  const invoiceData = payload.invoice || payload;
  const invoiceId = invoiceData.invoice_id || "unknown";
  const invoiceNumber = invoiceData.invoice_number || invoiceId;
  const status = (invoiceData.status || "").toLowerCase();
  const lineItems = invoiceData.line_items || [];
  
  console.log(`[Zoho Webhook] Invoice webhook received: ${invoiceNumber} (status: ${status}) with ${lineItems.length} line items`);

  try {
    // Check if status is valid for stock adjustment
    if (!INVOICE_VALID_STATUSES.includes(status)) {
      console.log(`[Zoho Webhook] Invoice ${invoiceNumber} status "${status}" not valid for stock adjustment - skipping`);
      recordWebhookEvent("invoices", "ignored_status", true, `Invoice ${invoiceNumber} status "${status}" ignored`);
      return {
        success: true,
        action: "ignored_status",
        message: `Invoice ${invoiceNumber} with status "${status}" does not require stock adjustment`,
      };
    }

    // Check idempotency - prevent duplicate processing
    if (checkAndRecordProcessed("invoice", invoiceId, status)) {
      console.log(`[Zoho Webhook] Invoice ${invoiceNumber} (status: ${status}) already processed - skipping`);
      recordWebhookEvent("invoices", "duplicate", true, `Invoice ${invoiceNumber} already processed`);
      return {
        success: true,
        action: "duplicate",
        message: `Invoice ${invoiceNumber} with status "${status}" was already processed`,
      };
    }

    if (lineItems.length === 0) {
      console.log(`[Zoho Webhook] Invoice ${invoiceNumber} has no line items to process`);
      recordWebhookEvent("invoices", "no_items", true, `Invoice ${invoiceNumber} has no line items`);
      return {
        success: true,
        action: "no_items",
        message: `Invoice ${invoiceNumber} received but has no line items to update inventory`,
      };
    }

    let updatedCount = 0;
    const updatedProducts: string[] = [];

    for (const item of lineItems) {
      if (!item.item_id) continue;

      const existingProduct = await db
        .select()
        .from(products)
        .where(eq(products.zohoItemId, item.item_id))
        .limit(1);

      if (existingProduct.length > 0) {
        const product = existingProduct[0];
        const quantitySold = item.quantity || 0;
        const currentStock = product.stockQuantity ?? 0;
        const newStock = Math.max(0, currentStock - quantitySold);

        await db
          .update(products)
          .set({
            stockQuantity: newStock,
            zohoLastSyncAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(products.id, product.id));

        console.log(`[Zoho Webhook] Invoice ${invoiceNumber}: ${product.sku} stock reduced by ${quantitySold} (${product.stockQuantity} -> ${newStock})`);
        updatedProducts.push(`${product.sku} (-${quantitySold})`);
        updatedCount++;
      }
    }

    const message = updatedCount > 0
      ? `Invoice ${invoiceNumber}: Updated ${updatedCount} products - ${updatedProducts.join(", ")}`
      : `Invoice ${invoiceNumber}: No matching products found in database`;

    recordWebhookEvent("invoices", "sale", true, message);
    return {
      success: true,
      action: "sale",
      message,
    };
  } catch (error) {
    console.error(`[Zoho Webhook] Error processing invoice webhook:`, error);
    recordWebhookEvent("invoices", "sale", false, error instanceof Error ? error.message : "Unknown error");
    return {
      success: false,
      action: "sale",
      message: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function handleBillWebhook(
  payload: ZohoBillWebhookPayload,
  secret: string | undefined
): Promise<WebhookResult> {
  const billData = payload.bill || payload;
  const billId = billData.bill_id || "unknown";
  const billNumber = billData.bill_number || billId;
  const status = (billData.status || "").toLowerCase();
  const lineItems = billData.line_items || [];
  
  console.log(`[Zoho Webhook] Bill webhook received: ${billNumber} (status: ${status}) with ${lineItems.length} line items`);

  try {
    // Check if status is valid for stock adjustment
    if (!BILL_VALID_STATUSES.includes(status)) {
      console.log(`[Zoho Webhook] Bill ${billNumber} status "${status}" not valid for stock adjustment - skipping`);
      recordWebhookEvent("bills", "ignored_status", true, `Bill ${billNumber} status "${status}" ignored`);
      return {
        success: true,
        action: "ignored_status",
        message: `Bill ${billNumber} with status "${status}" does not require stock adjustment`,
      };
    }

    // Check idempotency - prevent duplicate processing
    if (checkAndRecordProcessed("bill", billId, status)) {
      console.log(`[Zoho Webhook] Bill ${billNumber} (status: ${status}) already processed - skipping`);
      recordWebhookEvent("bills", "duplicate", true, `Bill ${billNumber} already processed`);
      return {
        success: true,
        action: "duplicate",
        message: `Bill ${billNumber} with status "${status}" was already processed`,
      };
    }

    if (lineItems.length === 0) {
      console.log(`[Zoho Webhook] Bill ${billNumber} has no line items to process`);
      recordWebhookEvent("bills", "no_items", true, `Bill ${billNumber} has no line items`);
      return {
        success: true,
        action: "no_items",
        message: `Bill ${billNumber} received but has no line items to update inventory`,
      };
    }

    let updatedCount = 0;
    const updatedProducts: string[] = [];

    for (const item of lineItems) {
      if (!item.item_id) continue;

      const existingProduct = await db
        .select()
        .from(products)
        .where(eq(products.zohoItemId, item.item_id))
        .limit(1);

      if (existingProduct.length > 0) {
        const product = existingProduct[0];
        const quantityReceived = item.quantity || 0;
        const currentStock = product.stockQuantity ?? 0;
        const newStock = currentStock + quantityReceived;

        await db
          .update(products)
          .set({
            stockQuantity: newStock,
            zohoLastSyncAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(products.id, product.id));

        console.log(`[Zoho Webhook] Bill ${billNumber}: ${product.sku} stock increased by ${quantityReceived} (${product.stockQuantity} -> ${newStock})`);
        updatedProducts.push(`${product.sku} (+${quantityReceived})`);
        updatedCount++;
      }
    }

    const message = updatedCount > 0
      ? `Bill ${billNumber}: Updated ${updatedCount} products - ${updatedProducts.join(", ")}`
      : `Bill ${billNumber}: No matching products found in database`;

    recordWebhookEvent("bills", "receipt", true, message);
    return {
      success: true,
      action: "receipt",
      message,
    };
  } catch (error) {
    console.error(`[Zoho Webhook] Error processing bill webhook:`, error);
    recordWebhookEvent("bills", "receipt", false, error instanceof Error ? error.message : "Unknown error");
    return {
      success: false,
      action: "receipt",
      message: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
