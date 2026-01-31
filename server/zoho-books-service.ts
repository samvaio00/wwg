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
