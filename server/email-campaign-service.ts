import OpenAI from "openai";
import { db } from "./db";
import { 
  users, 
  products, 
  carts, 
  cartItems,
  emailUnsubscribeTokens,
  emailCampaignLogs,
  emailCampaignTracking,
  EmailCampaignType,
  stockNotifications,
  type Product
} from "@shared/schema";
import { eq, and, lt, gt, isNull, inArray, desc } from "drizzle-orm";
import crypto from "crypto";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

function getBaseUrl(): string {
  if (process.env.REPLIT_DEPLOYMENT_URL) {
    return process.env.REPLIT_DEPLOYMENT_URL;
  }
  if (process.env.REPL_SLUG) {
    return `https://${process.env.REPL_SLUG}.repl.co`;
  }
  return "http://localhost:5000";
}

interface EmailConfig {
  provider: "resend" | "sendgrid" | "console" | null;
  apiKey: string | null;
  fromEmail: string;
  fromName: string;
}

function getEmailConfig(): EmailConfig {
  if (process.env.RESEND_API_KEY) {
    return {
      provider: "resend",
      apiKey: process.env.RESEND_API_KEY,
      fromEmail: process.env.EMAIL_FROM || "notifications@warnerwireless.com",
      fromName: process.env.EMAIL_FROM_NAME || "Warner Wireless Gears",
    };
  }

  if (process.env.SENDGRID_API_KEY) {
    return {
      provider: "sendgrid",
      apiKey: process.env.SENDGRID_API_KEY,
      fromEmail: process.env.EMAIL_FROM || "notifications@warnerwireless.com",
      fromName: process.env.EMAIL_FROM_NAME || "Warner Wireless Gears",
    };
  }

  return {
    provider: "console",
    apiKey: null,
    fromEmail: "notifications@warnerwireless.com",
    fromName: "Warner Wireless Gears",
  };
}

interface SendEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

async function sendEmail(
  to: string,
  subject: string,
  htmlContent: string,
  textContent?: string
): Promise<SendEmailResult> {
  const config = getEmailConfig();

  if (config.provider === "resend" && config.apiKey) {
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: `${config.fromName} <${config.fromEmail}>`,
          to: [to],
          subject,
          html: htmlContent,
          text: textContent,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        console.error("[Email Campaign] Resend error:", error);
        return { success: false, error };
      }

      const data = await response.json() as { id: string };
      return { success: true, messageId: data.id };
    } catch (error) {
      console.error("[Email Campaign] Resend error:", error);
      return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
    }
  }

  if (config.provider === "sendgrid" && config.apiKey) {
    try {
      const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: to }] }],
          from: { email: config.fromEmail, name: config.fromName },
          subject,
          content: [
            { type: "text/html", value: htmlContent },
            ...(textContent ? [{ type: "text/plain", value: textContent }] : []),
          ],
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        console.error("[Email Campaign] SendGrid error:", error);
        return { success: false, error };
      }

      const messageId = response.headers.get("X-Message-Id") || "";
      return { success: true, messageId };
    } catch (error) {
      console.error("[Email Campaign] SendGrid error:", error);
      return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
    }
  }

  console.log("[Email Campaign] No email provider configured. Would send:");
  console.log(`  To: ${to}`);
  console.log(`  Subject: ${subject}`);
  console.log(`  Content preview: ${htmlContent.substring(0, 200)}...`);
  return { success: true, messageId: "console-" + Date.now() };
}

async function getOrCreateUnsubscribeToken(userId: string): Promise<string> {
  const [existing] = await db
    .select()
    .from(emailUnsubscribeTokens)
    .where(eq(emailUnsubscribeTokens.userId, userId))
    .limit(1);

  if (existing) {
    return existing.token;
  }

  const token = crypto.randomBytes(32).toString('hex');
  await db.insert(emailUnsubscribeTokens).values({
    token,
    userId,
  });

  return token;
}

function generateUnsubscribeFooter(unsubscribeUrl: string): string {
  return `
    <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb; text-align: center;">
      <p style="color: #9ca3af; font-size: 12px; margin: 0;">
        You are receiving this email because you opted in for promotional communications.
      </p>
      <p style="margin: 10px 0;">
        <a href="${unsubscribeUrl}" 
           style="color: #6b7280; font-size: 12px; text-decoration: underline;">
          Unsubscribe from promotional emails
        </a>
      </p>
      <p style="color: #9ca3af; font-size: 11px; margin-top: 15px;">
        &copy; ${new Date().getFullYear()} Warner Wireless Gears. All rights reserved.
      </p>
    </div>
  `;
}

interface AIGeneratedEmail {
  subject: string;
  headline: string;
  introduction: string;
  callToAction: string;
}

async function generateEmailContent(
  campaignType: string,
  productNames: string[],
  customerName: string
): Promise<AIGeneratedEmail> {
  try {
    const prompt = getPromptForCampaign(campaignType, productNames, customerName);
    
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are a professional B2B marketing copywriter for Warner Wireless Gears, a wholesale distributor of sunglasses, cellular accessories, caps, perfumes, and novelty items. Write engaging, professional promotional emails that encourage wholesale buyers to check out new products. Keep the tone professional but friendly. Respond in JSON format only.`
        },
        {
          role: "user",
          content: prompt
        }
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: 500,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("No response from AI");
    }

    return JSON.parse(content) as AIGeneratedEmail;
  } catch (error) {
    console.error("[Email Campaign] AI generation error:", error);
    return getDefaultEmailContent(campaignType, productNames, customerName);
  }
}

function getPromptForCampaign(
  campaignType: string,
  productNames: string[],
  customerName: string
): string {
  const productList = productNames.slice(0, 5).join(", ");
  const moreCount = productNames.length > 5 ? ` and ${productNames.length - 5} more` : "";

  switch (campaignType) {
    case EmailCampaignType.NEW_HIGHLIGHTED_ITEMS:
      return `Generate a promotional email for ${customerName || "our valued customer"} about newly featured products in our wholesale catalog. Products include: ${productList}${moreCount}. 
      
      Return JSON with these fields:
      - subject: Email subject line (max 60 chars, engaging, mentions featured products)
      - headline: Main headline for the email (max 80 chars)
      - introduction: Brief intro paragraph (2-3 sentences) explaining these are our hand-picked featured items
      - callToAction: Button text for viewing the products (max 25 chars)`;

    case EmailCampaignType.NEW_SKUS:
      return `Generate a promotional email for ${customerName || "our valued customer"} about new products just added to our wholesale inventory. New products include: ${productList}${moreCount}.
      
      Return JSON with these fields:
      - subject: Email subject line (max 60 chars, creates excitement about new arrivals)
      - headline: Main headline for the email (max 80 chars)
      - introduction: Brief intro paragraph (2-3 sentences) about fresh inventory
      - callToAction: Button text for browsing new products (max 25 chars)`;

    case EmailCampaignType.CART_ABANDONMENT:
      return `Generate a reminder email for ${customerName || "our valued customer"} who has items in their shopping cart but hasn't checked out. Cart contains: ${productList}${moreCount}.
      
      Return JSON with these fields:
      - subject: Email subject line (max 60 chars, friendly reminder tone)
      - headline: Main headline for the email (max 80 chars)
      - introduction: Brief intro paragraph (2-3 sentences) reminding about items waiting in cart
      - callToAction: Button text for completing the order (max 25 chars)`;

    default:
      return `Generate a general promotional email for ${customerName || "our valued customer"} about wholesale products. Return JSON with subject, headline, introduction, and callToAction fields.`;
  }
}

function getDefaultEmailContent(
  campaignType: string,
  productNames: string[],
  customerName: string
): AIGeneratedEmail {
  const name = customerName || "Valued Customer";

  switch (campaignType) {
    case EmailCampaignType.NEW_HIGHLIGHTED_ITEMS:
      return {
        subject: "New Featured Products Just for You!",
        headline: "Check Out Our Handpicked Featured Items",
        introduction: `Hi ${name}, we've curated a selection of our best products just for you. These featured items are flying off the shelves - don't miss out on stocking up for your store!`,
        callToAction: "View Featured Products"
      };

    case EmailCampaignType.NEW_SKUS:
      return {
        subject: "Fresh Inventory Alert: New Products Added!",
        headline: "New Products Just Landed",
        introduction: `Hi ${name}, we're excited to announce new additions to our wholesale catalog! Be the first to stock these fresh items and stay ahead of the competition.`,
        callToAction: "Browse New Arrivals"
      };

    case EmailCampaignType.CART_ABANDONMENT:
      return {
        subject: "Don't Forget - Items Waiting in Your Cart",
        headline: "Your Cart is Waiting",
        introduction: `Hi ${name}, you left some great items in your shopping cart. Complete your order before they sell out - wholesale prices won't last forever!`,
        callToAction: "Complete Your Order"
      };

    default:
      return {
        subject: "Special Offers from Warner Wireless Gears",
        headline: "Exclusive Wholesale Deals",
        introduction: `Hi ${name}, check out our latest wholesale offerings designed to help your business grow.`,
        callToAction: "Shop Now"
      };
  }
}

function buildEmailHtml(
  emailContent: AIGeneratedEmail,
  productsToShow: Product[],
  unsubscribeUrl: string,
  actionUrl: string
): string {
  const baseUrl = getBaseUrl();
  
  const productCards = productsToShow.slice(0, 6).map(p => `
    <div style="display: inline-block; width: 180px; margin: 10px; text-align: center; vertical-align: top;">
      <img src="${p.imageUrl || `${baseUrl}/placeholder-product.png`}" 
           alt="${p.name}" 
           style="width: 160px; height: 160px; object-fit: cover; border-radius: 8px; border: 1px solid #e5e7eb;">
      <p style="margin: 8px 0 4px; font-size: 14px; font-weight: 600; color: #1f2937; max-height: 40px; overflow: hidden;">
        ${p.name.substring(0, 40)}${p.name.length > 40 ? '...' : ''}
      </p>
    </div>
  `).join('');

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${emailContent.subject}</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f5f5f5;">
  <div style="max-width: 600px; margin: 0 auto; background: white;">
    <div style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); padding: 30px; text-align: center;">
      <h1 style="color: white; margin: 0; font-size: 24px;">Warner Wireless Gears</h1>
      <p style="color: #a5b4fc; margin: 5px 0 0; font-size: 14px;">Your Wholesale Partner</p>
    </div>
    
    <div style="padding: 30px;">
      <h2 style="color: #1f2937; margin: 0 0 20px; font-size: 28px; text-align: center;">
        ${emailContent.headline}
      </h2>
      
      <p style="color: #4b5563; font-size: 16px; margin-bottom: 25px;">
        ${emailContent.introduction}
      </p>
      
      <div style="text-align: center; margin: 30px 0;">
        ${productCards}
      </div>
      
      <div style="text-align: center; margin: 30px 0;">
        <a href="${actionUrl}" 
           style="display: inline-block; background: linear-gradient(135deg, #059669 0%, #047857 100%); color: white; 
                  padding: 16px 40px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;
                  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          ${emailContent.callToAction}
        </a>
      </div>
      
      <p style="color: #6b7280; font-size: 14px; text-align: center;">
        Questions? Reply to this email or contact us anytime.
      </p>
    </div>
    
    ${generateUnsubscribeFooter(unsubscribeUrl)}
  </div>
</body>
</html>
  `.trim();
}

async function logCampaignEmail(
  campaignType: string,
  userId: string,
  subject: string,
  referenceData: object,
  success: boolean,
  errorMessage?: string
): Promise<void> {
  await db.insert(emailCampaignLogs).values({
    campaignType,
    userId,
    subject,
    referenceData,
    success,
    errorMessage,
  });
}

export async function getOptedInCustomers(): Promise<Array<{ id: string; email: string; businessName: string | null; contactName: string | null }>> {
  const customers = await db
    .select({
      id: users.id,
      email: users.email,
      businessName: users.businessName,
      contactName: users.contactName,
    })
    .from(users)
    .where(
      and(
        eq(users.role, 'customer'),
        eq(users.status, 'approved'),
        eq(users.emailOptIn, true)
      )
    );

  return customers;
}

async function getEmailContentFromApprovedTemplate(
  campaignType: string,
  customerName: string
): Promise<AIGeneratedEmail | null> {
  const { storage } = await import("./storage");
  
  const approvedTemplate = await storage.getApprovedTemplateForCampaign(campaignType);
  
  if (!approvedTemplate) {
    return null;
  }
  
  const personalized: AIGeneratedEmail = {
    subject: approvedTemplate.subject,
    headline: approvedTemplate.headline,
    introduction: approvedTemplate.introduction.replace(/Valued Customer/g, customerName),
    callToAction: approvedTemplate.callToAction,
  };
  
  return personalized;
}

export async function sendNewHighlightedItemsEmail(): Promise<{ sent: number; errors: number }> {
  console.log("[Email Campaign] Starting new highlighted items campaign...");
  
  const [tracking] = await db
    .select()
    .from(emailCampaignTracking)
    .where(eq(emailCampaignTracking.campaignType, EmailCampaignType.NEW_HIGHLIGHTED_ITEMS))
    .limit(1);

  const lastSyncAt = tracking?.lastSyncAt || new Date(0);
  const lastPromotedIds = tracking?.lastPromotedIds || [];

  const highlightedProducts = await db
    .select()
    .from(products)
    .where(
      and(
        eq(products.isHighlighted, true),
        eq(products.isOnline, true),
        eq(products.isActive, true)
      )
    )
    .limit(20);

  const newHighlightedProducts = highlightedProducts.filter(
    p => !lastPromotedIds.includes(p.id)
  );

  if (newHighlightedProducts.length === 0) {
    console.log("[Email Campaign] No new highlighted items to promote");
    return { sent: 0, errors: 0 };
  }

  const customers = await getOptedInCustomers();
  console.log(`[Email Campaign] Sending to ${customers.length} customers about ${newHighlightedProducts.length} new highlighted items`);

  let sent = 0;
  let errors = 0;
  const baseUrl = getBaseUrl();

  for (const customer of customers) {
    try {
      const unsubscribeToken = await getOrCreateUnsubscribeToken(customer.id);
      const unsubscribeUrl = `${baseUrl}/api/unsubscribe/${unsubscribeToken}`;
      const actionUrl = `${baseUrl}/`;

      const productNames = newHighlightedProducts.map(p => p.name);
      const customerName = customer.contactName || customer.businessName || "Valued Customer";
      
      let emailContent = await getEmailContentFromApprovedTemplate(
        EmailCampaignType.NEW_HIGHLIGHTED_ITEMS,
        customerName
      );
      
      if (!emailContent) {
        emailContent = await generateEmailContent(
          EmailCampaignType.NEW_HIGHLIGHTED_ITEMS,
          productNames,
          customerName
        );
      }

      const htmlContent = buildEmailHtml(
        emailContent,
        newHighlightedProducts,
        unsubscribeUrl,
        actionUrl
      );

      const result = await sendEmail(customer.email, emailContent.subject, htmlContent);

      await logCampaignEmail(
        EmailCampaignType.NEW_HIGHLIGHTED_ITEMS,
        customer.id,
        emailContent.subject,
        { productIds: newHighlightedProducts.map(p => p.id) },
        result.success,
        result.error
      );

      if (result.success) {
        sent++;
      } else {
        errors++;
      }
    } catch (error) {
      console.error(`[Email Campaign] Error sending to ${customer.email}:`, error);
      errors++;
    }
  }

  await db
    .insert(emailCampaignTracking)
    .values({
      campaignType: EmailCampaignType.NEW_HIGHLIGHTED_ITEMS,
      lastSyncAt: new Date(),
      lastPromotedIds: highlightedProducts.map(p => p.id),
    })
    .onConflictDoUpdate({
      target: emailCampaignTracking.campaignType,
      set: {
        lastSyncAt: new Date(),
        lastPromotedIds: highlightedProducts.map(p => p.id),
        updatedAt: new Date(),
      },
    });

  console.log(`[Email Campaign] New highlighted items campaign complete: ${sent} sent, ${errors} errors`);
  return { sent, errors };
}

export async function sendNewSkusEmail(): Promise<{ sent: number; errors: number }> {
  console.log("[Email Campaign] Starting new SKUs campaign...");

  const [tracking] = await db
    .select()
    .from(emailCampaignTracking)
    .where(eq(emailCampaignTracking.campaignType, EmailCampaignType.NEW_SKUS))
    .limit(1);

  const lastSyncAt = tracking?.lastSyncAt || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const newProducts = await db
    .select()
    .from(products)
    .where(
      and(
        gt(products.createdAt, lastSyncAt),
        eq(products.isOnline, true),
        eq(products.isActive, true)
      )
    )
    .orderBy(desc(products.createdAt))
    .limit(20);

  if (newProducts.length === 0) {
    console.log("[Email Campaign] No new SKUs to promote");
    return { sent: 0, errors: 0 };
  }

  const customers = await getOptedInCustomers();
  console.log(`[Email Campaign] Sending to ${customers.length} customers about ${newProducts.length} new SKUs`);

  let sent = 0;
  let errors = 0;
  const baseUrl = getBaseUrl();

  for (const customer of customers) {
    try {
      const unsubscribeToken = await getOrCreateUnsubscribeToken(customer.id);
      const unsubscribeUrl = `${baseUrl}/api/unsubscribe/${unsubscribeToken}`;
      const actionUrl = `${baseUrl}/whats-new`;

      const productNames = newProducts.map(p => p.name);
      const customerName = customer.contactName || customer.businessName || "Valued Customer";

      let emailContent = await getEmailContentFromApprovedTemplate(
        EmailCampaignType.NEW_SKUS,
        customerName
      );
      
      if (!emailContent) {
        emailContent = await generateEmailContent(
          EmailCampaignType.NEW_SKUS,
          productNames,
          customerName
        );
      }

      const htmlContent = buildEmailHtml(
        emailContent,
        newProducts,
        unsubscribeUrl,
        actionUrl
      );

      const result = await sendEmail(customer.email, emailContent.subject, htmlContent);

      await logCampaignEmail(
        EmailCampaignType.NEW_SKUS,
        customer.id,
        emailContent.subject,
        { productIds: newProducts.map(p => p.id) },
        result.success,
        result.error
      );

      if (result.success) {
        sent++;
      } else {
        errors++;
      }
    } catch (error) {
      console.error(`[Email Campaign] Error sending to ${customer.email}:`, error);
      errors++;
    }
  }

  await db
    .insert(emailCampaignTracking)
    .values({
      campaignType: EmailCampaignType.NEW_SKUS,
      lastSyncAt: new Date(),
      lastPromotedIds: newProducts.map(p => p.id),
    })
    .onConflictDoUpdate({
      target: emailCampaignTracking.campaignType,
      set: {
        lastSyncAt: new Date(),
        lastPromotedIds: newProducts.map(p => p.id),
        updatedAt: new Date(),
      },
    });

  console.log(`[Email Campaign] New SKUs campaign complete: ${sent} sent, ${errors} errors`);
  return { sent, errors };
}

export async function sendCartAbandonmentEmails(): Promise<{ sent: number; errors: number }> {
  console.log("[Email Campaign] Starting cart abandonment campaign...");

  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const abandonedCarts = await db
    .select({
      cart: carts,
      user: {
        id: users.id,
        email: users.email,
        businessName: users.businessName,
        contactName: users.contactName,
        emailOptIn: users.emailOptIn,
      },
    })
    .from(carts)
    .innerJoin(users, eq(carts.userId, users.id))
    .where(
      and(
        lt(carts.updatedAt, twentyFourHoursAgo),
        gt(carts.itemCount, 0),
        eq(users.role, 'customer'),
        eq(users.status, 'approved'),
        eq(users.emailOptIn, true)
      )
    );

  if (abandonedCarts.length === 0) {
    console.log("[Email Campaign] No abandoned carts found");
    return { sent: 0, errors: 0 };
  }

  const recentlySent = await db
    .select({ userId: emailCampaignLogs.userId })
    .from(emailCampaignLogs)
    .where(
      and(
        eq(emailCampaignLogs.campaignType, EmailCampaignType.CART_ABANDONMENT),
        gt(emailCampaignLogs.sentAt, new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))
      )
    );

  const recentlySentUserIds = new Set(recentlySent.map(r => r.userId));

  const cartsToNotify = abandonedCarts.filter(
    ac => !recentlySentUserIds.has(ac.user.id)
  );

  console.log(`[Email Campaign] Found ${cartsToNotify.length} carts eligible for abandonment email`);

  let sent = 0;
  let errors = 0;
  const baseUrl = getBaseUrl();

  for (const { cart, user } of cartsToNotify) {
    try {
      const items = await db
        .select({
          cartItem: cartItems,
          product: products,
        })
        .from(cartItems)
        .innerJoin(products, eq(cartItems.productId, products.id))
        .where(eq(cartItems.cartId, cart.id));

      if (items.length === 0) continue;

      const cartProducts = items.map(i => i.product);
      const unsubscribeToken = await getOrCreateUnsubscribeToken(user.id);
      const unsubscribeUrl = `${baseUrl}/api/unsubscribe/${unsubscribeToken}`;
      const actionUrl = `${baseUrl}/cart`;

      const productNames = cartProducts.map(p => p.name);
      const customerName = user.contactName || user.businessName || "Valued Customer";

      let emailContent = await getEmailContentFromApprovedTemplate(
        EmailCampaignType.CART_ABANDONMENT,
        customerName
      );
      
      if (!emailContent) {
        emailContent = await generateEmailContent(
          EmailCampaignType.CART_ABANDONMENT,
          productNames,
          customerName
        );
      }

      const htmlContent = buildEmailHtml(
        emailContent,
        cartProducts,
        unsubscribeUrl,
        actionUrl
      );

      const result = await sendEmail(user.email, emailContent.subject, htmlContent);

      await logCampaignEmail(
        EmailCampaignType.CART_ABANDONMENT,
        user.id,
        emailContent.subject,
        { cartId: cart.id, productIds: cartProducts.map(p => p.id) },
        result.success,
        result.error
      );

      if (result.success) {
        sent++;
      } else {
        errors++;
      }
    } catch (error) {
      console.error(`[Email Campaign] Error sending cart abandonment to ${user.email}:`, error);
      errors++;
    }
  }

  console.log(`[Email Campaign] Cart abandonment campaign complete: ${sent} sent, ${errors} errors`);
  return { sent, errors };
}

// Generate a template for admin approval (used by admin routes)
export async function generateTemplateForApproval(
  campaignType: string,
  customPrompt?: string
): Promise<{
  id: string;
  campaignType: string;
  subject: string;
  headline: string;
  introduction: string;
  callToAction: string;
  customPrompt: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}> {
  // Import storage dynamically to avoid circular dependencies
  const { storage } = await import("./storage");
  const { EmailTemplateStatus } = await import("@shared/schema");
  
  // Get sample products for context
  const { products: sampleProducts } = await storage.getProducts({ limit: 10 });
  const productNames = sampleProducts.slice(0, 5).map(p => p.name);
  
  // Generate AI content
  let emailContent: AIGeneratedEmail;
  
  if (customPrompt) {
    // Use custom prompt for regeneration
    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `You are a professional B2B marketing copywriter for Warner Wireless Gears, a wholesale distributor. Write engaging, professional promotional emails. Respond in JSON format only with these fields: subject, headline, introduction, callToAction.`
          },
          {
            role: "user",
            content: customPrompt
          }
        ],
        response_format: { type: "json_object" },
        max_completion_tokens: 500,
      });

      const content = response.choices[0]?.message?.content;
      if (content) {
        emailContent = JSON.parse(content) as AIGeneratedEmail;
      } else {
        throw new Error("No response from AI");
      }
    } catch (error) {
      console.error("[Email Campaign] AI generation with custom prompt failed:", error);
      emailContent = getDefaultEmailContent(campaignType, productNames, "Valued Customer");
    }
  } else {
    emailContent = await generateEmailContent(campaignType, productNames, "Valued Customer");
  }
  
  // Save template to database with PENDING_APPROVAL status
  const template = await storage.createEmailTemplate({
    campaignType,
    subject: emailContent.subject,
    headline: emailContent.headline,
    introduction: emailContent.introduction,
    callToAction: emailContent.callToAction,
    customPrompt: customPrompt || null,
    status: EmailTemplateStatus.PENDING_APPROVAL,
    productIds: sampleProducts.slice(0, 6).map(p => p.id),
  });
  
  return template;
}

// ================================================================
// BACK IN STOCK NOTIFICATIONS
// ================================================================

interface BackInStockEmailData {
  userId: string;
  userEmail: string;
  businessName: string | null;
  products: Array<{
    id: string;
    name: string;
    sku: string;
    basePrice: string;
    stockQuantity: number;
  }>;
}

async function generateBackInStockEmailContent(
  productNames: string[],
  customerName: string
): Promise<AIGeneratedEmail> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are an email marketing specialist for Warner Wireless Gears, a B2B wholesale supplier of cellular accessories, sunglasses, and novelty items for gas stations and convenience stores. Generate engaging, professional email content.

Your response must be valid JSON with this exact structure:
{
  "subject": "Email subject line (max 60 chars, include urgency)",
  "headline": "Main headline for the email body (max 80 chars)",
  "introduction": "Brief paragraph (2-3 sentences) telling them their requested items are back in stock",
  "callToAction": "Action-oriented button text (max 30 chars)"
}

Keep the tone professional but friendly. Emphasize that these are items they specifically requested to be notified about.`
        },
        {
          role: "user",
          content: `Generate a back-in-stock notification email for ${customerName}. They requested to be notified when these products returned to stock: ${productNames.join(", ")}.`
        }
      ],
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content;
    if (content) {
      return JSON.parse(content) as AIGeneratedEmail;
    }
    throw new Error("No response from AI");
  } catch (error) {
    console.error("[Back In Stock] AI generation failed:", error);
    // Fallback content
    return {
      subject: "Your Requested Items Are Back In Stock!",
      headline: "Good News - Your Items Are Available Again",
      introduction: `Great news, ${customerName}! The items you've been waiting for are now back in stock at Warner Wireless Gears. We know you've been watching these products, so we wanted to let you know right away before they sell out again.`,
      callToAction: "Shop Now"
    };
  }
}

export async function sendBackInStockNotifications(): Promise<{ emailsSent: number; notificationsProcessed: number }> {
  console.log("[Back In Stock] Starting nightly back-in-stock notification check...");
  
  let emailsSent = 0;
  let notificationsProcessed = 0;

  try {
    // Find all pending notifications (not yet notified) where product is now in stock
    const pendingNotifications = await db
      .select({
        notificationId: stockNotifications.id,
        userId: stockNotifications.userId,
        productId: stockNotifications.productId,
        stockWhenRequested: stockNotifications.stockQuantityWhenRequested,
        userEmail: users.email,
        businessName: users.businessName,
        emailOptIn: users.emailOptIn,
        productName: products.name,
        productSku: products.sku,
        productBasePrice: products.basePrice,
        productStockQuantity: products.stockQuantity,
        productIsActive: products.isActive,
        productIsOnline: products.isOnline,
      })
      .from(stockNotifications)
      .innerJoin(users, eq(stockNotifications.userId, users.id))
      .innerJoin(products, eq(stockNotifications.productId, products.id))
      .where(
        and(
          isNull(stockNotifications.notifiedAt), // Not yet notified
          gt(products.stockQuantity, 0), // Product is back in stock
          eq(products.isActive, true), // Product is active
          eq(products.isOnline, true), // Product is visible on storefront
          eq(users.emailOptIn, true) // User opted in to emails
        )
      );

    if (pendingNotifications.length === 0) {
      console.log("[Back In Stock] No pending notifications for restocked items");
      return { emailsSent: 0, notificationsProcessed: 0 };
    }

    console.log(`[Back In Stock] Found ${pendingNotifications.length} notifications to process`);

    // Group notifications by user
    const notificationsByUser = new Map<string, BackInStockEmailData>();
    const notificationIds: string[] = [];

    for (const notification of pendingNotifications) {
      notificationIds.push(notification.notificationId);
      
      if (!notificationsByUser.has(notification.userId)) {
        notificationsByUser.set(notification.userId, {
          userId: notification.userId,
          userEmail: notification.userEmail,
          businessName: notification.businessName,
          products: [],
        });
      }
      
      notificationsByUser.get(notification.userId)!.products.push({
        id: notification.productId,
        name: notification.productName,
        sku: notification.productSku,
        basePrice: notification.productBasePrice,
        stockQuantity: notification.productStockQuantity || 0,
      });
    }

    console.log(`[Back In Stock] Sending emails to ${notificationsByUser.size} customers`);
    const baseUrl = getBaseUrl();

    // Send consolidated email to each user
    const userEntries = Array.from(notificationsByUser.entries());
    for (const [userId, data] of userEntries) {
      try {
        const customerName = data.businessName || "Valued Customer";
        const productNames = data.products.map((p: { id: string; name: string; sku: string; basePrice: string; stockQuantity: number }) => p.name);
        
        // Generate AI email content
        const emailContent = await generateBackInStockEmailContent(productNames, customerName);

        // Get unsubscribe token
        const unsubscribeToken = await getOrCreateUnsubscribeToken(userId);
        const unsubscribeUrl = `${baseUrl}/api/email/unsubscribe/${unsubscribeToken}`;

        // Build product list HTML
        const productListHtml = data.products.map((p: { id: string; name: string; sku: string; basePrice: string; stockQuantity: number }) => `
          <tr>
            <td style="padding: 12px; border-bottom: 1px solid #eee;">
              <strong>${p.name}</strong><br>
              <span style="color: #666; font-size: 12px;">SKU: ${p.sku}</span>
            </td>
            <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: right;">
              <strong>$${p.basePrice}</strong><br>
              <span style="color: #22c55e; font-size: 12px;">${p.stockQuantity} in stock</span>
            </td>
          </tr>
        `).join("");

        const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; }
    .header { background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { padding: 30px; background: #ffffff; }
    .product-table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    .cta-button { display: inline-block; background: #2563eb; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; margin: 20px 0; }
    .footer { padding: 20px; text-align: center; color: #666; font-size: 12px; background: #f9f9f9; border-radius: 0 0 8px 8px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="margin: 0; font-size: 24px;">${emailContent.headline}</h1>
    </div>
    <div class="content">
      <p>Hi ${customerName},</p>
      <p>${emailContent.introduction}</p>
      
      <h3 style="color: #2563eb;">Your Requested Items:</h3>
      <table class="product-table">
        ${productListHtml}
      </table>
      
      <div style="text-align: center;">
        <a href="${baseUrl}" class="cta-button">${emailContent.callToAction}</a>
      </div>
      
      <p style="color: #666; font-size: 14px; margin-top: 20px;">
        Don't wait too long - popular items can sell out quickly!
      </p>
    </div>
    <div class="footer">
      <p>Warner Wireless Gears - Your Wholesale Partner</p>
      <p><a href="${unsubscribeUrl}" style="color: #666;">Unsubscribe from promotional emails</a></p>
    </div>
  </div>
</body>
</html>`;

        // Send the email
        const result = await sendEmail(data.userEmail, emailContent.subject, htmlContent);
        
        if (result.success) {
          emailsSent++;
          console.log(`[Back In Stock] Sent email to ${data.userEmail} for ${data.products.length} products`);
          
          // Log the campaign
          await db.insert(emailCampaignLogs).values({
            campaignType: "back_in_stock",
            userId,
            subject: emailContent.subject,
            referenceData: { productIds: data.products.map((p: { id: string; name: string; sku: string; basePrice: string; stockQuantity: number }) => p.id) },
            success: true,
          });
        } else {
          console.error(`[Back In Stock] Failed to send email to ${data.userEmail}:`, result.error);
          await db.insert(emailCampaignLogs).values({
            campaignType: "back_in_stock",
            userId,
            subject: emailContent.subject,
            success: false,
            errorMessage: result.error,
          });
        }
      } catch (error) {
        console.error(`[Back In Stock] Error sending email to user ${userId}:`, error);
      }
    }

    // Mark all processed notifications as notified
    if (notificationIds.length > 0) {
      await db
        .update(stockNotifications)
        .set({ notifiedAt: new Date() })
        .where(inArray(stockNotifications.id, notificationIds));
      notificationsProcessed = notificationIds.length;
      console.log(`[Back In Stock] Marked ${notificationIds.length} notifications as processed`);
    }

    console.log(`[Back In Stock] Complete: ${emailsSent} emails sent, ${notificationsProcessed} notifications processed`);
    return { emailsSent, notificationsProcessed };
  } catch (error) {
    console.error("[Back In Stock] Error in notification job:", error);
    return { emailsSent, notificationsProcessed };
  }
}

/**
 * Send order modification email to customer when staff/admin edits their order
 */
export async function sendOrderModificationEmail(
  customer: { id: string; email: string; businessName: string | null },
  order: { id: string; orderNumber: string; totalAmount: string },
  items: Array<{
    id: string;
    sku: string;
    productName: string;
    quantity: number;
    unitPrice: string;
    lineTotal: string;
    originalQuantity: number | null;
    isModified: boolean | null;
    isDeleted: boolean | null;
    product: { name: string; imageUrl: string | null };
  }>
): Promise<{ success: boolean; error?: string }> {
  const config = getEmailConfig();
  
  if (!config.provider) {
    console.log("[Order Modification] No email provider configured, logging to console");
  }
  
  const baseUrl = getBaseUrl();
  const customerName = customer.businessName || customer.email.split('@')[0];
  
  // Build item rows with modification styling
  const itemRowsHtml = items.map(item => {
    const isDeleted = item.isDeleted === true;
    const isModified = item.isModified === true && !isDeleted;
    const originalQty = item.originalQuantity ?? item.quantity;
    
    let rowStyle = '';
    let qtyDisplay = `${item.quantity}`;
    
    if (isDeleted) {
      rowStyle = 'color: #dc2626; text-decoration: line-through;';
      qtyDisplay = `<span style="text-decoration: line-through;">${originalQty}</span> → 0 (Removed)`;
    } else if (isModified && originalQty !== item.quantity) {
      rowStyle = 'color: #dc2626;';
      qtyDisplay = `<span style="text-decoration: line-through;">${originalQty}</span> → ${item.quantity}`;
    }
    
    return `
      <tr style="${rowStyle}">
        <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">${item.sku}</td>
        <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">${item.productName}</td>
        <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: center;">${qtyDisplay}</td>
        <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: right;">$${item.unitPrice}</td>
        <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: right;">${isDeleted ? '$0.00' : `$${item.lineTotal}`}</td>
      </tr>
    `;
  }).join('');
  
  const subject = `Order #${order.orderNumber} Has Been Updated`;
  
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
        <h1 style="color: white; margin: 0; font-size: 24px;">Order Updated</h1>
      </div>
      
      <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px;">
        <p>Hello ${customerName},</p>
        
        <p>Your order <strong>#${order.orderNumber}</strong> has been updated by our team. Please review the changes below:</p>
        
        <div style="margin: 20px 0; padding: 15px; background: #fef3c7; border-left: 4px solid #f59e0b; border-radius: 4px;">
          <p style="margin: 0; color: #92400e;">
            <strong>Note:</strong> Items shown in <span style="color: #dc2626;">red</span> have been modified. 
            Items with <span style="color: #dc2626; text-decoration: line-through;">strikethrough</span> have been removed from the order.
          </p>
        </div>
        
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
          <thead>
            <tr style="background: #f3f4f6;">
              <th style="padding: 12px; text-align: left; border-bottom: 2px solid #e5e7eb;">SKU</th>
              <th style="padding: 12px; text-align: left; border-bottom: 2px solid #e5e7eb;">Product</th>
              <th style="padding: 12px; text-align: center; border-bottom: 2px solid #e5e7eb;">Qty</th>
              <th style="padding: 12px; text-align: right; border-bottom: 2px solid #e5e7eb;">Price</th>
              <th style="padding: 12px; text-align: right; border-bottom: 2px solid #e5e7eb;">Total</th>
            </tr>
          </thead>
          <tbody>
            ${itemRowsHtml}
          </tbody>
          <tfoot>
            <tr style="background: #f3f4f6; font-weight: bold;">
              <td colspan="4" style="padding: 12px; text-align: right;">New Order Total:</td>
              <td style="padding: 12px; text-align: right;">$${order.totalAmount}</td>
            </tr>
          </tfoot>
        </table>
        
        <p>If you have any questions about these changes, please contact our support team.</p>
        
        <div style="text-align: center; margin-top: 30px;">
          <a href="${baseUrl}/orders" style="display: inline-block; background: #2563eb; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold;">View Your Orders</a>
        </div>
        
        <p style="margin-top: 30px; font-size: 12px; color: #6b7280; text-align: center;">
          This is an automated notification from Warner Wireless Gears.<br>
          If you did not expect this email, please contact us immediately.
        </p>
      </div>
    </body>
    </html>
  `;
  
  const result = await sendEmail({
    to: customer.email,
    subject,
    html: htmlContent,
  });
  
  if (result.success) {
    console.log(`[Order Modification] Email sent to ${customer.email} for order #${order.orderNumber}`);
  } else {
    console.error(`[Order Modification] Failed to send email to ${customer.email}:`, result.error);
  }
  
  return result;
}
