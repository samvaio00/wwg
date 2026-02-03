interface ZohoTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

interface ZohoContact {
  contact_id: string;
  contact_name: string;
  company_name?: string;
  email: string;
  status: string; // "active" or "inactive"
  contact_type: string; // "customer", "vendor", etc.
}

interface ZohoContactsResponse {
  contacts: ZohoContact[];
  page_context?: {
    page: number;
    per_page: number;
    has_more_page: boolean;
  };
}

let cachedAccessToken: string | null = null;
let tokenExpiresAt: number = 0;

// Rate limit tracking for Zoho Books
let booksRateLimitedUntil: number = 0;
const RATE_LIMIT_BACKOFF_BASE_MS = 30000; // Start with 30 seconds
const RATE_LIMIT_MAX_BACKOFF_MS = 300000; // Max 5 minutes
let booksConsecutiveRateLimits = 0;

// Helper to check if we're rate limited
function isBooksRateLimited(): boolean {
  if (Date.now() < booksRateLimitedUntil) {
    const remainingSec = Math.round((booksRateLimitedUntil - Date.now()) / 1000);
    console.log(`[Zoho Books API] Rate limited for ${remainingSec} more seconds`);
    return true;
  }
  return false;
}

// Helper to handle rate limit response and calculate backoff
function handleBooksRateLimit(): void {
  booksConsecutiveRateLimits++;
  const backoffMs = Math.min(
    RATE_LIMIT_BACKOFF_BASE_MS * Math.pow(2, booksConsecutiveRateLimits - 1),
    RATE_LIMIT_MAX_BACKOFF_MS
  );
  booksRateLimitedUntil = Date.now() + backoffMs;
  console.log(`[Zoho Books API] Rate limited - backing off for ${Math.round(backoffMs / 1000)} seconds (attempt ${booksConsecutiveRateLimits})`);
}

// Reset rate limit tracking on success
function resetBooksRateLimitTracking(): void {
  if (booksConsecutiveRateLimits > 0) {
    console.log(`[Zoho Books API] Rate limit cleared after ${booksConsecutiveRateLimits} consecutive limits`);
  }
  booksConsecutiveRateLimits = 0;
  booksRateLimitedUntil = 0;
}

// Retry helper with exponential backoff for Zoho Books
async function retryBooksWithBackoff<T>(
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
    if (isBooksRateLimited()) {
      const waitTime = booksRateLimitedUntil - Date.now();
      if (waitTime > 0) {
        console.log(`[Zoho Books API] Waiting ${Math.round(waitTime / 1000)}s for rate limit before ${operationName}`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
    
    try {
      const result = await fn();
      resetBooksRateLimitTracking();
      return result;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      // Check if this is a rate limit error
      const isRateLimitError = lastError.message.includes("too many requests") ||
                               lastError.message.includes("Access Denied") ||
                               lastError.message.includes("rate limit");
      
      if (isRateLimitError) {
        handleBooksRateLimit();
        
        if (attempt < maxRetries) {
          const waitTime = booksRateLimitedUntil - Date.now();
          if (waitTime > 0) {
            console.log(`[Zoho Books API] ${operationName} rate limited, waiting ${Math.round(waitTime / 1000)}s before retry ${attempt + 1}/${maxRetries}`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
            continue;
          }
        }
      }
      
      // Regular backoff for other errors (non-rate-limit)
      if (attempt < maxRetries && !isRateLimitError) {
        const delay = Math.min(initialDelayMs * Math.pow(2, attempt), RATE_LIMIT_MAX_BACKOFF_MS);
        console.log(`[Zoho Books API] ${operationName} failed, retrying in ${Math.round(delay / 1000)}s (attempt ${attempt + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError || new Error(`${operationName} failed after ${maxRetries} retries`);
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

  return retryBooksWithBackoff(
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

export interface ZohoCustomerResult {
  found: boolean;
  active: boolean;
  customerId?: string;
  customerName?: string;
  companyName?: string;
  message: string;
}

interface ZohoContactPerson {
  contact_id: string;
  contact_name: string;
  contact_person_id: string;
  email: string;
  first_name: string;
  last_name: string;
}

interface ZohoContactPersonsResponse {
  contact_persons: ZohoContactPerson[];
}

export async function checkZohoCustomerByEmail(email: string): Promise<ZohoCustomerResult> {
  try {
    const accessToken = await getAccessToken();
    const organizationId = process.env.ZOHO_ORG_ID || process.env.ZOHO_ORGANIZATION_ID;

    if (!organizationId) {
      throw new Error("Zoho organization ID not configured");
    }

    const searchEmail = encodeURIComponent(email.toLowerCase());
    console.log(`[Zoho Books] Searching for customer with email: ${email}`);
    
    // Search BOTH main contacts AND contact persons simultaneously
    const [contactsResponse, contactPersonsResponse] = await Promise.all([
      fetch(
        `https://www.zohoapis.com/books/v3/contacts?organization_id=${organizationId}&email=${searchEmail}`,
        { headers: { Authorization: `Zoho-oauthtoken ${accessToken}` } }
      ),
      fetch(
        `https://www.zohoapis.com/books/v3/contacts/contactpersons?organization_id=${organizationId}&email=${searchEmail}`,
        { headers: { Authorization: `Zoho-oauthtoken ${accessToken}` } }
      ),
    ]);

    let foundContactId: string | null = null;

    // Check main contacts first
    if (contactsResponse.ok) {
      const contactsData: ZohoContactsResponse = await contactsResponse.json();
      const contacts = contactsData.contacts || [];
      console.log(`[Zoho Books] Found ${contacts.length} main contacts for email ${email}`);
      
      const matchingContact = contacts.find(
        (c) => c.email?.toLowerCase() === email.toLowerCase() && c.contact_type === "customer"
      );
      
      if (matchingContact) {
        console.log(`[Zoho Books] Match found in main contact email: ${matchingContact.contact_name}`);
        foundContactId = matchingContact.contact_id;
      }
    }

    // Check contact persons if not found in main contacts
    if (!foundContactId && contactPersonsResponse.ok) {
      const cpData: ZohoContactPersonsResponse = await contactPersonsResponse.json();
      const contactPersons = cpData.contact_persons || [];
      console.log(`[Zoho Books] Found ${contactPersons.length} contact persons for email ${email}`);
      
      if (contactPersons.length > 0) {
        console.log(`[Zoho Books] Match found in contact person: ${contactPersons[0].first_name} ${contactPersons[0].last_name}`);
        foundContactId = contactPersons[0].contact_id;
      }
    }

    if (!foundContactId) {
      console.log(`[Zoho Books] No matching customer found for email: ${email}`);
      return {
        found: false,
        active: false,
        message: "No customer account found with this email in our system. Please contact us to set up a wholesale account.",
      };
    }

    // Get full contact details to verify type and status
    const contactResponse = await fetch(
      `https://www.zohoapis.com/books/v3/contacts/${foundContactId}?organization_id=${organizationId}`,
      { headers: { Authorization: `Zoho-oauthtoken ${accessToken}` } }
    );

    if (!contactResponse.ok) {
      const errorText = await contactResponse.text();
      console.error("Zoho Books API error getting contact:", errorText);
      throw new Error(`Failed to get Zoho Books contact: ${errorText}`);
    }

    const contactData = await contactResponse.json();
    const contact = contactData.contact;

    if (!contact) {
      return {
        found: false,
        active: false,
        message: "Customer account not found.",
      };
    }

    // Check if it's a customer type contact
    if (contact.contact_type !== "customer") {
      console.log(`[Zoho Books] Contact found but type is ${contact.contact_type}, not customer`);
      return {
        found: false,
        active: false,
        message: "No customer account found with this email in our system. Please contact us to set up a wholesale account.",
      };
    }

    const isActive = contact.status === "active";
    console.log(`[Zoho Books] Customer verified: ${contact.contact_name}, active=${isActive}`);

    return {
      found: true,
      active: isActive,
      customerId: contact.contact_id,
      customerName: contact.contact_name,
      companyName: contact.company_name,
      message: isActive
        ? "Customer account verified"
        : "Your customer account is inactive. Please contact support to reactivate your account.",
    };
  } catch (err) {
    console.error("Error checking Zoho customer:", err);
    throw err;
  }
}

export async function checkZohoCustomerById(customerId: string): Promise<ZohoCustomerResult> {
  try {
    const accessToken = await getAccessToken();
    const organizationId = process.env.ZOHO_ORG_ID || process.env.ZOHO_ORGANIZATION_ID;

    if (!organizationId) {
      throw new Error("Zoho organization ID not configured");
    }

    // Get specific customer by ID from Zoho Books
    const response = await fetch(
      `https://www.zohoapis.com/books/v3/contacts/${customerId}?organization_id=${organizationId}`,
      {
        headers: {
          Authorization: `Zoho-oauthtoken ${accessToken}`,
        },
      }
    );

    if (!response.ok) {
      if (response.status === 404) {
        return {
          found: false,
          active: false,
          message: "Customer account not found in our system.",
        };
      }
      const errorText = await response.text();
      console.error("Zoho Books API error:", errorText);
      throw new Error(`Failed to check Zoho Books customer: ${errorText}`);
    }

    const data = await response.json();
    const customer = data.contact;

    if (!customer) {
      return {
        found: false,
        active: false,
        message: "Customer account not found.",
      };
    }

    const isActive = customer.status === "active";

    return {
      found: true,
      active: isActive,
      customerId: customer.contact_id,
      customerName: customer.contact_name,
      companyName: customer.company_name,
      message: isActive
        ? "Customer account verified"
        : "Your customer account is inactive. Please contact support to reactivate your account.",
    };
  } catch (err) {
    console.error("Error checking Zoho customer by ID:", err);
    throw err;
  }
}

// ================================================================
// SALES ORDER PUSH
// ================================================================

export interface ZohoLineItem {
  item_id: string;
  quantity: number;
  rate: number;
  name?: string;
  sku?: string;
}

export interface ZohoSalesOrderInput {
  customerId: string;
  orderNumber: string;
  lineItems: ZohoLineItem[];
  shippingAddress?: string;
  shippingCity?: string;
  shippingState?: string;
  shippingZipCode?: string;
  notes?: string;
}

export interface ZohoSalesOrderResult {
  success: boolean;
  salesOrderId?: string;
  salesOrderNumber?: string;
  message: string;
}

// ================================================================
// CUSTOMER STATUS SYNC
// ================================================================

import { db } from "./db";
import { users, syncRuns, SyncType, UserStatus } from "@shared/schema";
import { eq, isNotNull } from "drizzle-orm";

export interface CustomerSyncResult {
  total: number;
  checked: number;
  suspended: number;
  reactivated: number;
  errors: string[];
  syncRunId?: string;
}

export async function syncCustomerStatusFromZoho(triggeredBy: string = "manual"): Promise<CustomerSyncResult> {
  const startTime = Date.now();
  
  const [syncRunRecord] = await db.insert(syncRuns).values({
    id: crypto.randomUUID(),
    syncType: SyncType.ZOHO_CUSTOMERS,
    status: "running",
    triggeredBy,
  }).returning();

  const result: CustomerSyncResult = {
    total: 0,
    checked: 0,
    suspended: 0,
    reactivated: 0,
    errors: [],
    syncRunId: syncRunRecord.id,
  };

  try {
    const usersWithZoho = await db
      .select()
      .from(users)
      .where(isNotNull(users.zohoCustomerId));

    result.total = usersWithZoho.length;
    
    // Incremental sync: skip users checked within the last hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const usersToCheck = usersWithZoho.filter(user => {
      if (!user.zohoLastCheckedAt) return true;
      return user.zohoLastCheckedAt < oneHourAgo;
    });
    
    console.log(`[Zoho Customer Sync] Checking ${usersToCheck.length} of ${result.total} users (${result.total - usersToCheck.length} recently checked)`);

    for (const user of usersToCheck) {
      try {
        if (!user.zohoCustomerId) continue;

        const zohoResult = await checkZohoCustomerById(user.zohoCustomerId);
        result.checked++;

        const wasActive = user.zohoIsActive !== false;
        const isNowActive = zohoResult.found && zohoResult.active;

        if (wasActive && !isNowActive) {
          await db
            .update(users)
            .set({
              zohoIsActive: false,
              zohoLastCheckedAt: new Date(),
              status: UserStatus.SUSPENDED,
              updatedAt: new Date(),
            })
            .where(eq(users.id, user.id));
          result.suspended++;
          console.log(`[Zoho Customer Sync] Suspended user ${user.email} (Zoho inactive)`);
        } else if (!wasActive && isNowActive && user.status === UserStatus.SUSPENDED) {
          await db
            .update(users)
            .set({
              zohoIsActive: true,
              zohoLastCheckedAt: new Date(),
              status: UserStatus.APPROVED,
              updatedAt: new Date(),
            })
            .where(eq(users.id, user.id));
          result.reactivated++;
          console.log(`[Zoho Customer Sync] Reactivated user ${user.email} (Zoho active)`);
        } else {
          await db
            .update(users)
            .set({
              zohoIsActive: isNowActive,
              zohoLastCheckedAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(users.id, user.id));
        }
      } catch (err) {
        result.errors.push(`User ${user.email}: ${err instanceof Error ? err.message : "Unknown error"}`);
      }
    }

    const durationMs = Date.now() - startTime;
    await db
      .update(syncRuns)
      .set({
        status: "completed",
        totalProcessed: result.total,
        created: result.reactivated,
        updated: result.checked,
        skipped: result.suspended,
        errors: result.errors.length,
        completedAt: new Date(),
        durationMs,
        errorMessages: result.errors.length > 0 ? result.errors.slice(0, 100) : null,
      })
      .where(eq(syncRuns.id, syncRunRecord.id));

    console.log(`[Zoho Customer Sync] Complete: ${result.checked} checked, ${result.suspended} suspended, ${result.reactivated} reactivated in ${durationMs}ms`);
  } catch (err) {
    const durationMs = Date.now() - startTime;
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    result.errors.push(`Sync failed: ${errorMessage}`);
    
    await db
      .update(syncRuns)
      .set({
        status: "failed",
        totalProcessed: result.total,
        errors: result.errors.length,
        completedAt: new Date(),
        durationMs,
        errorMessages: result.errors.slice(0, 100),
      })
      .where(eq(syncRuns.id, syncRunRecord.id));

    console.error(`[Zoho Customer Sync] Failed: ${errorMessage}`);
  }

  return result;
}

export async function createZohoSalesOrder(input: ZohoSalesOrderInput): Promise<ZohoSalesOrderResult> {
  try {
    const accessToken = await getAccessToken();
    const organizationId = process.env.ZOHO_ORG_ID || process.env.ZOHO_ORGANIZATION_ID;

    if (!organizationId) {
      throw new Error("Zoho organization ID not configured");
    }

    console.log(`[Zoho Books] Creating sales order for customer ${input.customerId}, order ${input.orderNumber}`);

    // Build shipping address string
    const shippingParts = [
      input.shippingAddress,
      input.shippingCity,
      input.shippingState,
      input.shippingZipCode,
    ].filter(Boolean);
    const shippingAddressStr = shippingParts.join(", ");

    // Build the sales order payload
    const salesOrderData = {
      customer_id: input.customerId,
      reference_number: input.orderNumber,
      date: new Date().toISOString().split("T")[0],
      line_items: input.lineItems.map((item) => ({
        item_id: item.item_id,
        quantity: item.quantity,
        rate: item.rate,
      })),
      notes: input.notes || `Web order: ${input.orderNumber}`,
      shipping_address: shippingAddressStr ? { address: shippingAddressStr } : undefined,
    };

    console.log(`[Zoho Books] Sales order payload:`, JSON.stringify(salesOrderData, null, 2));

    const response = await fetch(
      `https://www.zohoapis.com/books/v3/salesorders?organization_id=${organizationId}`,
      {
        method: "POST",
        headers: {
          Authorization: `Zoho-oauthtoken ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(salesOrderData),
      }
    );

    const responseData = await response.json();

    if (!response.ok || responseData.code !== 0) {
      console.error("[Zoho Books] Sales order creation failed:", responseData);
      return {
        success: false,
        message: responseData.message || "Failed to create sales order in Zoho Books",
      };
    }

    const salesOrder = responseData.salesorder;
    console.log(`[Zoho Books] Sales order created: ${salesOrder.salesorder_id} (${salesOrder.salesorder_number})`);

    return {
      success: true,
      salesOrderId: salesOrder.salesorder_id,
      salesOrderNumber: salesOrder.salesorder_number,
      message: "Sales order created successfully",
    };
  } catch (err) {
    console.error("Error creating Zoho sales order:", err);
    return {
      success: false,
      message: err instanceof Error ? err.message : "Failed to create sales order",
    };
  }
}

// ================================================================
// CREATE ZOHO CUSTOMER (Contact)
// ================================================================

export interface ZohoCustomerInput {
  email: string;
  contactName: string;
  companyName?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
}

export interface ZohoCustomerCreateResult {
  success: boolean;
  customerId?: string;
  message: string;
}

export async function createZohoCustomer(input: ZohoCustomerInput): Promise<ZohoCustomerCreateResult> {
  try {
    const accessToken = await getAccessToken();
    const organizationId = process.env.ZOHO_ORG_ID || process.env.ZOHO_ORGANIZATION_ID;

    if (!organizationId) {
      throw new Error("Zoho organization ID not configured");
    }

    console.log(`[Zoho Books] Creating customer for ${input.email}`);

    // Build the contact payload for Zoho Books
    const contactData: Record<string, unknown> = {
      contact_name: input.companyName || input.contactName,
      company_name: input.companyName,
      contact_type: "customer",
      status: "active",
      contact_persons: [
        {
          first_name: input.contactName?.split(" ")[0] || "",
          last_name: input.contactName?.split(" ").slice(1).join(" ") || "",
          email: input.email,
          phone: input.phone,
          is_primary_contact: true,
        }
      ]
    };

    // Add billing address if provided
    if (input.address || input.city || input.state || input.zipCode) {
      contactData.billing_address = {
        address: input.address,
        city: input.city,
        state: input.state,
        zip: input.zipCode,
        country: "USA"
      };
    }

    console.log(`[Zoho Books] Customer payload:`, JSON.stringify(contactData, null, 2));

    const response = await fetch(
      `https://www.zohoapis.com/books/v3/contacts?organization_id=${organizationId}`,
      {
        method: "POST",
        headers: {
          Authorization: `Zoho-oauthtoken ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(contactData),
      }
    );

    const responseData = await response.json();

    if (!response.ok || responseData.code !== 0) {
      console.error("[Zoho Books] Customer creation failed:", responseData);
      return {
        success: false,
        message: responseData.message || "Failed to create customer in Zoho Books",
      };
    }

    const contact = responseData.contact;
    console.log(`[Zoho Books] Customer created: ${contact.contact_id} (${contact.contact_name})`);

    return {
      success: true,
      customerId: contact.contact_id,
      message: "Customer created successfully in Zoho Books",
    };
  } catch (err) {
    console.error("Error creating Zoho customer:", err);
    return {
      success: false,
      message: err instanceof Error ? err.message : "Failed to create customer",
    };
  }
}

// ================================================================
// TOP SELLERS SYNC (Zoho Books invoices data)
// ================================================================

interface ZohoInvoiceLineItem {
  item_id: string;
  name: string;
  sku?: string;
  quantity: number;
  item_total: number;
}

interface ZohoInvoice {
  invoice_id: string;
  invoice_number: string;
  date: string;
  status: string;
  line_items?: ZohoInvoiceLineItem[];
}

interface ZohoInvoicesResponse {
  invoices: ZohoInvoice[];
  page_context?: {
    page: number;
    per_page: number;
    has_more_page: boolean;
  };
}

interface ZohoInvoiceDetailResponse {
  invoice: ZohoInvoice;
}

export interface TopSellersSyncResult {
  success: boolean;
  synced: number;
  periodStart: Date;
  periodEnd: Date;
  message: string;
}

import { topSellersCache, products } from "@shared/schema";

export async function syncTopSellersFromZoho(): Promise<TopSellersSyncResult> {
  const periodEnd = new Date();
  const periodStart = new Date();
  periodStart.setDate(periodStart.getDate() - 30);

  try {
    const accessToken = await getAccessToken();
    const organizationId = process.env.ZOHO_ORG_ID || process.env.ZOHO_ORGANIZATION_ID;

    if (!organizationId) {
      throw new Error("Zoho organization ID not configured");
    }

    console.log(`[Zoho Books] Syncing top sellers for last 30 days (${periodStart.toISOString().split('T')[0]} to ${periodEnd.toISOString().split('T')[0]})`);

    const dateStart = periodStart.toISOString().split('T')[0];
    const dateEnd = periodEnd.toISOString().split('T')[0];
    
    const salesByItem: Map<string, { zohoItemId: string; sku: string; name: string; quantity: number; revenue: number; orderCount: number }> = new Map();
    
    let page = 1;
    let hasMorePages = true;
    let consecutiveErrors = 0;
    const MAX_CONSECUTIVE_ERRORS = 3;
    
    while (hasMorePages && consecutiveErrors < MAX_CONSECUTIVE_ERRORS) {
      try {
        // Use proper Zoho Books API filters
        const response = await fetch(
          `https://www.zohoapis.com/books/v3/invoices?organization_id=${organizationId}&date_start=${dateStart}&date_end=${dateEnd}&page=${page}&per_page=100`,
          {
            headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
          }
        );

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`[Zoho Books] Failed to fetch invoices page ${page}:`, errorText);
          consecutiveErrors++;
          await new Promise(resolve => setTimeout(resolve, 2000 * consecutiveErrors));
          continue;
        }

        consecutiveErrors = 0;
        const data: ZohoInvoicesResponse = await response.json();
        
        // Process invoices in smaller batches to avoid rate limiting
        const batchSize = 10;
        for (let i = 0; i < data.invoices.length; i += batchSize) {
          const batch = data.invoices.slice(i, i + batchSize);
          
          for (const invoice of batch) {
            // Only process paid/sent invoices
            if (invoice.status !== 'paid' && invoice.status !== 'sent') {
              continue;
            }
            
            try {
              const detailResponse = await fetch(
                `https://www.zohoapis.com/books/v3/invoices/${invoice.invoice_id}?organization_id=${organizationId}`,
                {
                  headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
                }
              );
              
              if (detailResponse.ok) {
                const detailData: ZohoInvoiceDetailResponse = await detailResponse.json();
                const lineItems = detailData.invoice.line_items || [];
                
                for (const item of lineItems) {
                  if (!item.item_id) continue;
                  const key = item.item_id;
                  const existing = salesByItem.get(key);
                  
                  if (existing) {
                    existing.quantity += item.quantity;
                    existing.revenue += item.item_total;
                    existing.orderCount += 1;
                  } else {
                    salesByItem.set(key, {
                      zohoItemId: item.item_id,
                      sku: item.sku || "",
                      name: item.name,
                      quantity: item.quantity,
                      revenue: item.item_total,
                      orderCount: 1,
                    });
                  }
                }
              } else if (detailResponse.status === 429) {
                // Rate limited - wait and continue
                console.log("[Zoho Books] Rate limited, waiting 5 seconds...");
                await new Promise(resolve => setTimeout(resolve, 5000));
              }
            } catch (detailError) {
              console.error(`[Zoho Books] Error fetching invoice ${invoice.invoice_id}:`, detailError);
            }
          }
          
          // Wait between batches to avoid rate limiting
          if (i + batchSize < data.invoices.length) {
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        }
        
        hasMorePages = data.page_context?.has_more_page || false;
        page++;
        
        // Rate limiting - wait between pages
        if (hasMorePages) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      } catch (pageError) {
        console.error(`[Zoho Books] Error processing page ${page}:`, pageError);
        consecutiveErrors++;
        await new Promise(resolve => setTimeout(resolve, 2000 * consecutiveErrors));
      }
    }

    console.log(`[Zoho Books] Found ${salesByItem.size} unique items with sales`);

    if (salesByItem.size === 0) {
      console.log("[Zoho Books] No sales data found, keeping existing cache");
      return {
        success: true,
        synced: 0,
        periodStart,
        periodEnd,
        message: "No sales data found in Zoho Books for the period",
      };
    }

    // Sort by quantity sold - store top 500 items for category-specific queries
    // (Limit to prevent DB parameter overflow in inArray queries)
    const sortedItems = Array.from(salesByItem.values())
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 500);

    // Build cache data first, then atomically update
    const cacheData: Array<{
      productId: string;
      zohoItemId: string;
      zohoGroupId: string | null;
      totalQuantitySold: number;
      totalRevenue: string;
      orderCount: number;
      rank: number;
      periodStartDate: Date;
      periodEndDate: Date;
    }> = [];

    for (let i = 0; i < sortedItems.length; i++) {
      const item = sortedItems[i];
      
      const [product] = await db.select()
        .from(products)
        .where(eq(products.zohoItemId, item.zohoItemId))
        .limit(1);

      if (product) {
        cacheData.push({
          productId: product.id,
          zohoItemId: item.zohoItemId,
          zohoGroupId: product.zohoGroupId || null,
          totalQuantitySold: Math.round(item.quantity),
          totalRevenue: item.revenue.toFixed(2),
          orderCount: item.orderCount,
          rank: i + 1,
          periodStartDate: periodStart,
          periodEndDate: periodEnd,
        });
      } else {
        console.log(`[Zoho Books] No matching product for Zoho item ${item.zohoItemId} (${item.name})`);
      }
    }

    // Only update cache if we have data
    if (cacheData.length > 0) {
      await db.delete(topSellersCache);
      for (const data of cacheData) {
        await db.insert(topSellersCache).values(data);
      }
    }

    console.log(`[Zoho Books] Top sellers sync complete: ${cacheData.length} products cached`);

    return {
      success: true,
      synced: cacheData.length,
      periodStart,
      periodEnd,
      message: `Synced ${cacheData.length} top selling products`,
    };
  } catch (err) {
    console.error("[Zoho Books] Top sellers sync error:", err);
    return {
      success: false,
      synced: 0,
      periodStart,
      periodEnd,
      message: err instanceof Error ? err.message : "Failed to sync top sellers",
    };
  }
}
