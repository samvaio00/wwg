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
    console.log(`[Zoho Books] Searching for contact person with email: ${email}`);
    
    // Search contact persons by email (this searches all email fields)
    const cpResponse = await fetch(
      `https://www.zohoapis.com/books/v3/contacts/contactpersons?organization_id=${organizationId}&email=${searchEmail}`,
      {
        headers: {
          Authorization: `Zoho-oauthtoken ${accessToken}`,
        },
      }
    );

    if (!cpResponse.ok) {
      const errorText = await cpResponse.text();
      console.error("Zoho Books API error:", errorText);
      throw new Error(`Failed to check Zoho Books customer: ${errorText}`);
    }

    const cpData: ZohoContactPersonsResponse = await cpResponse.json();
    const contactPersons = cpData.contact_persons || [];
    
    console.log(`[Zoho Books] Found ${contactPersons.length} contact persons for email ${email}`);

    if (contactPersons.length === 0) {
      // Also check main contact email as fallback
      console.log(`[Zoho Books] No contact persons found, checking main contacts...`);
      const contactResponse = await fetch(
        `https://www.zohoapis.com/books/v3/contacts?organization_id=${organizationId}&email=${searchEmail}`,
        {
          headers: {
            Authorization: `Zoho-oauthtoken ${accessToken}`,
          },
        }
      );

      if (contactResponse.ok) {
        const contactData: ZohoContactsResponse = await contactResponse.json();
        const contacts = contactData.contacts || [];
        const matchingContact = contacts.find(
          (c) => c.email?.toLowerCase() === email.toLowerCase() && c.contact_type === "customer"
        );
        
        if (matchingContact) {
          const isActive = matchingContact.status === "active";
          console.log(`[Zoho Books] Customer found via main email: ${matchingContact.contact_name}, active=${isActive}`);
          return {
            found: true,
            active: isActive,
            customerId: matchingContact.contact_id,
            customerName: matchingContact.contact_name,
            companyName: matchingContact.company_name,
            message: isActive
              ? "Customer account verified"
              : "Your customer account is inactive. Please contact support to reactivate your account.",
          };
        }
      }

      console.log(`[Zoho Books] No matching customer found for email: ${email}`);
      return {
        found: false,
        active: false,
        message: "No customer account found with this email in our system. Please contact us to set up a wholesale account.",
      };
    }

    // Found contact person - get the parent contact details
    const contactPerson = contactPersons[0];
    console.log(`[Zoho Books] Contact person found: ${contactPerson.first_name} ${contactPerson.last_name}, contact: ${contactPerson.contact_name}`);
    
    // Get the full contact details to check type and status
    const contactResponse = await fetch(
      `https://www.zohoapis.com/books/v3/contacts/${contactPerson.contact_id}?organization_id=${organizationId}`,
      {
        headers: {
          Authorization: `Zoho-oauthtoken ${accessToken}`,
        },
      }
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
