import { db } from "./db";
import { orders, users, emailActionTokens, EmailActionType, type EmailActionTypeValue } from "@shared/schema";
import { eq, and, gt } from "drizzle-orm";
import crypto from "crypto";

// Get base URL from environment or default
function getBaseUrl(): string {
  if (process.env.REPLIT_DEPLOYMENT_URL) {
    return process.env.REPLIT_DEPLOYMENT_URL;
  }
  if (process.env.REPL_SLUG) {
    return `https://${process.env.REPL_SLUG}.repl.co`;
  }
  return "http://localhost:5000";
}

// Generate secure token for email actions
async function generateActionToken(actionType: EmailActionTypeValue, targetId: string): Promise<string> {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  await db.insert(emailActionTokens).values({
    token,
    actionType,
    targetId,
    expiresAt,
  });

  return token;
}

// Generate action button HTML for emails
function generateActionButtons(approveUrl: string, rejectUrl: string): string {
  return `
    <div style="margin: 25px 0; text-align: center;">
      <a href="${approveUrl}" 
         style="display: inline-block; background-color: #22c55e; color: white; padding: 12px 32px; 
                text-decoration: none; border-radius: 6px; font-weight: bold; margin-right: 12px;
                font-size: 14px;">
        ✓ Approve
      </a>
      <a href="${rejectUrl}" 
         style="display: inline-block; background-color: #ef4444; color: white; padding: 12px 32px; 
                text-decoration: none; border-radius: 6px; font-weight: bold;
                font-size: 14px;">
        ✗ Reject
      </a>
    </div>
    <p style="color: #666; font-size: 12px; text-align: center;">
      These links expire in 7 days. Click to take action directly.
    </p>
  `;
}

interface EmailConfig {
  provider: "resend" | "sendgrid" | "console" | null;
  apiKey: string | null;
  fromEmail: string;
  fromName: string;
}

function getEmailConfig(): EmailConfig {
  // Check for email provider configuration
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

  // No email provider configured - will log instead
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
        console.error("[Email] Resend error:", error);
        return { success: false, error };
      }

      const data = await response.json() as { id: string };
      console.log(`[Email] Sent via Resend to ${to}: ${subject}`);
      return { success: true, messageId: data.id };
    } catch (error) {
      console.error("[Email] Resend error:", error);
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
        console.error("[Email] SendGrid error:", error);
        return { success: false, error };
      }

      const messageId = response.headers.get("X-Message-Id") || "";
      console.log(`[Email] Sent via SendGrid to ${to}: ${subject}`);
      return { success: true, messageId };
    } catch (error) {
      console.error("[Email] SendGrid error:", error);
      return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
    }
  }

  // Console fallback - log the email instead
  console.log("[Email] No email provider configured. Would send:");
  console.log(`  To: ${to}`);
  console.log(`  Subject: ${subject}`);
  console.log(`  Content preview: ${htmlContent.substring(0, 200)}...`);
  return { success: true, messageId: "console-" + Date.now() };
}

function generateTrackingUrl(carrier: string, trackingNumber: string): string {
  const carrierUrls: Record<string, string> = {
    ups: `https://www.ups.com/track?loc=en_US&tracknum=${trackingNumber}`,
    fedex: `https://www.fedex.com/fedextrack/?trknbr=${trackingNumber}`,
    usps: `https://tools.usps.com/go/TrackConfirmAction?tLabels=${trackingNumber}`,
    dhl: `https://www.dhl.com/en/express/tracking.html?AWB=${trackingNumber}`,
  };

  const normalizedCarrier = carrier.toLowerCase().replace(/\s+/g, "");
  return carrierUrls[normalizedCarrier] || "#";
}

export async function sendShipmentNotification(orderId: string): Promise<SendEmailResult> {
  try {
    // Get order with user info
    const [order] = await db
      .select()
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1);

    if (!order) {
      return { success: false, error: "Order not found" };
    }

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, order.userId))
      .limit(1);

    if (!user) {
      return { success: false, error: "User not found" };
    }

    const trackingUrl = order.trackingNumber && order.carrier
      ? generateTrackingUrl(order.carrier, order.trackingNumber)
      : null;

    const subject = `Your Order ${order.orderNumber} Has Shipped!`;

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #1a1a2e; color: white; padding: 20px; text-align: center; }
    .content { padding: 20px; background: #f9f9f9; }
    .tracking-box { background: white; border: 1px solid #ddd; padding: 15px; margin: 20px 0; text-align: center; }
    .tracking-number { font-size: 24px; font-weight: bold; color: #1a1a2e; }
    .btn { display: inline-block; background: #1a1a2e; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; margin-top: 10px; }
    .footer { padding: 20px; text-align: center; color: #666; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Your Order Has Shipped!</h1>
    </div>
    <div class="content">
      <p>Hi ${user.contactName || user.businessName || "Valued Customer"},</p>
      
      <p>Great news! Your order <strong>${order.orderNumber}</strong> is on its way.</p>
      
      ${order.trackingNumber ? `
      <div class="tracking-box">
        <p>Tracking Number:</p>
        <div class="tracking-number">${order.trackingNumber}</div>
        ${order.carrier ? `<p>Carrier: ${order.carrier}</p>` : ""}
        ${trackingUrl ? `<a href="${trackingUrl}" class="btn">Track Your Package</a>` : ""}
      </div>
      ` : `
      <p>Tracking information will be available soon.</p>
      `}
      
      <h3>Order Details</h3>
      <p><strong>Order Number:</strong> ${order.orderNumber}</p>
      <p><strong>Order Total:</strong> $${order.totalAmount}</p>
      ${order.shippingAddress ? `
      <p><strong>Shipping To:</strong><br>
        ${order.shippingAddress}<br>
        ${order.shippingCity}, ${order.shippingState} ${order.shippingZipCode}
      </p>
      ` : ""}
      
      <p>If you have any questions about your order, please don't hesitate to contact us.</p>
      
      <p>Thank you for your business!</p>
      <p>The Warner Wireless Gears Team</p>
    </div>
    <div class="footer">
      <p>&copy; ${new Date().getFullYear()} Warner Wireless Gears. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
    `.trim();

    const textContent = `
Your Order Has Shipped!

Hi ${user.contactName || user.businessName || "Valued Customer"},

Great news! Your order ${order.orderNumber} is on its way.

${order.trackingNumber ? `Tracking Number: ${order.trackingNumber}
${order.carrier ? `Carrier: ${order.carrier}` : ""}
${trackingUrl ? `Track your package: ${trackingUrl}` : ""}` : "Tracking information will be available soon."}

Order Details:
Order Number: ${order.orderNumber}
Order Total: $${order.totalAmount}
${order.shippingAddress ? `Shipping To: ${order.shippingAddress}, ${order.shippingCity}, ${order.shippingState} ${order.shippingZipCode}` : ""}

If you have any questions about your order, please don't hesitate to contact us.

Thank you for your business!
The Warner Wireless Gears Team
    `.trim();

    const result = await sendEmail(user.email, subject, htmlContent, textContent);

    // Update order with notification timestamp
    if (result.success) {
      await db
        .update(orders)
        .set({ shipmentNotificationSentAt: new Date() })
        .where(eq(orders.id, orderId));
    }

    return result;
  } catch (error) {
    console.error("[Email] Shipment notification error:", error);
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

export async function sendDeliveryNotification(orderId: string): Promise<SendEmailResult> {
  try {
    const [order] = await db
      .select()
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1);

    if (!order) {
      return { success: false, error: "Order not found" };
    }

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, order.userId))
      .limit(1);

    if (!user) {
      return { success: false, error: "User not found" };
    }

    const subject = `Your Order ${order.orderNumber} Has Been Delivered!`;

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #22c55e; color: white; padding: 20px; text-align: center; }
    .content { padding: 20px; background: #f9f9f9; }
    .footer { padding: 20px; text-align: center; color: #666; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Your Order Has Been Delivered!</h1>
    </div>
    <div class="content">
      <p>Hi ${user.contactName || user.businessName || "Valued Customer"},</p>
      
      <p>Your order <strong>${order.orderNumber}</strong> has been delivered!</p>
      
      <p>We hope you're satisfied with your purchase. If you have any questions or concerns about your order, please don't hesitate to contact us.</p>
      
      <p>Thank you for choosing Warner Wireless Gears!</p>
      <p>The Warner Wireless Gears Team</p>
    </div>
    <div class="footer">
      <p>&copy; ${new Date().getFullYear()} Warner Wireless Gears. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
    `.trim();

    const result = await sendEmail(user.email, subject, htmlContent);

    if (result.success) {
      await db
        .update(orders)
        .set({ deliveryNotificationSentAt: new Date() })
        .where(eq(orders.id, orderId));
    }

    return result;
  } catch (error) {
    console.error("[Email] Delivery notification error:", error);
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

export function isEmailConfigured(): boolean {
  const config = getEmailConfig();
  return config.provider !== "console";
}

const ADMIN_EMAIL = "warnergears@gmail.com";

interface ProfileUpdateData {
  businessName?: string;
  contactName?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
}

export async function sendProfileUpdateNotification(
  user: { id: string; email: string; businessName?: string | null; contactName?: string | null },
  pendingData: ProfileUpdateData
): Promise<SendEmailResult> {
  // Generate action tokens for approve/reject buttons
  const approveToken = await generateActionToken(EmailActionType.APPROVE_PROFILE, user.id);
  const rejectToken = await generateActionToken(EmailActionType.REJECT_PROFILE, user.id);
  
  const baseUrl = getBaseUrl();
  const approveUrl = `${baseUrl}/api/email-action/${approveToken}`;
  const rejectUrl = `${baseUrl}/api/email-action/${rejectToken}`;
  const actionButtons = generateActionButtons(approveUrl, rejectUrl);

  const subject = `Profile Update Request - ${user.businessName || user.email}`;
  
  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; }
    .header { background: #2563eb; color: white; padding: 20px; text-align: center; }
    .content { padding: 20px; background: #f9f9f9; }
    .data-table { width: 100%; border-collapse: collapse; margin: 15px 0; }
    .data-table td { padding: 8px; border-bottom: 1px solid #ddd; }
    .data-table td:first-child { font-weight: bold; width: 40%; }
    .footer { padding: 20px; text-align: center; color: #666; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Profile Update Request</h1>
    </div>
    <div class="content">
      <p>A customer has requested profile changes:</p>
      
      <table class="data-table">
        <tr><td>Customer Email:</td><td>${user.email}</td></tr>
        <tr><td>Business Name:</td><td>${pendingData.businessName || '-'}</td></tr>
        <tr><td>Contact Name:</td><td>${pendingData.contactName || '-'}</td></tr>
        <tr><td>Phone:</td><td>${pendingData.phone || '-'}</td></tr>
        <tr><td>Address:</td><td>${pendingData.address || '-'}</td></tr>
        <tr><td>City:</td><td>${pendingData.city || '-'}</td></tr>
        <tr><td>State:</td><td>${pendingData.state || '-'}</td></tr>
        <tr><td>ZIP Code:</td><td>${pendingData.zipCode || '-'}</td></tr>
      </table>
      
      ${actionButtons}
      
      <p style="text-align: center; color: #666; font-size: 13px;">Or review in the <a href="${baseUrl}/admin/users">admin panel</a>.</p>
    </div>
    <div class="footer">
      <p>&copy; ${new Date().getFullYear()} Warner Wireless Gears. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
  `.trim();
  
  console.log(`[Email] Sending profile update notification for user ${user.email}`);
  return sendEmail(ADMIN_EMAIL, subject, htmlContent);
}

interface ContactFormData {
  name?: string;
  email?: string;
  subject: string;
  message: string;
}

export async function sendContactFormEmail(data: ContactFormData): Promise<SendEmailResult> {
  const subject = `Contact Form: ${data.subject}`;
  
  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; }
    .header { background: #2563eb; color: white; padding: 20px; text-align: center; }
    .content { padding: 20px; background: #f9f9f9; }
    .message-box { background: white; border: 1px solid #ddd; padding: 15px; margin: 15px 0; }
    .footer { padding: 20px; text-align: center; color: #666; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Contact Form Message</h1>
    </div>
    <div class="content">
      <p><strong>From:</strong> ${data.name || 'Not provided'} (${data.email || 'No email'})</p>
      <p><strong>Subject:</strong> ${data.subject}</p>
      
      <div class="message-box">
        <p><strong>Message:</strong></p>
        <p>${data.message.replace(/\n/g, '<br>')}</p>
      </div>
      
      ${data.email ? `<p>Reply directly to: <a href="mailto:${data.email}">${data.email}</a></p>` : ''}
    </div>
    <div class="footer">
      <p>&copy; ${new Date().getFullYear()} Warner Wireless Gears. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
  `.trim();
  
  console.log(`[Email] Sending contact form message from ${data.email || 'anonymous'}`);
  return sendEmail(ADMIN_EMAIL, subject, htmlContent);
}

export async function sendNewOrderNotification(
  orderId: string
): Promise<SendEmailResult> {
  try {
    const [order] = await db
      .select()
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1);

    if (!order) {
      return { success: false, error: "Order not found" };
    }

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, order.userId))
      .limit(1);

    // Generate action tokens for approve/reject buttons
    const approveToken = await generateActionToken(EmailActionType.APPROVE_ORDER, orderId);
    const rejectToken = await generateActionToken(EmailActionType.REJECT_ORDER, orderId);
    
    const baseUrl = getBaseUrl();
    const approveUrl = `${baseUrl}/api/email-action/${approveToken}`;
    const rejectUrl = `${baseUrl}/api/email-action/${rejectToken}`;
    const actionButtons = generateActionButtons(approveUrl, rejectUrl);

    const subject = `New Order Pending Approval - ${order.orderNumber}`;
    
    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; }
    .header { background: #2563eb; color: white; padding: 20px; text-align: center; }
    .content { padding: 20px; background: #f9f9f9; }
    .order-details { background: white; border: 1px solid #ddd; padding: 15px; margin: 15px 0; }
    .footer { padding: 20px; text-align: center; color: #666; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>New Order Pending Approval</h1>
    </div>
    <div class="content">
      <p>A new order has been placed and requires approval:</p>
      
      <div class="order-details">
        <p><strong>Order Number:</strong> ${order.orderNumber}</p>
        <p><strong>Customer:</strong> ${user?.businessName || user?.email || 'Unknown'}</p>
        <p><strong>Total Amount:</strong> $${order.totalAmount}</p>
        <p><strong>Items:</strong> ${order.itemCount || 0}</p>
        <p><strong>Date:</strong> ${new Date(order.createdAt).toLocaleString()}</p>
      </div>
      
      ${actionButtons}
      
      <p style="text-align: center; color: #666; font-size: 13px;">Or review in the <a href="${baseUrl}/admin/orders">admin panel</a>.</p>
    </div>
    <div class="footer">
      <p>&copy; ${new Date().getFullYear()} Warner Wireless Gears. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
    `.trim();

    console.log(`[Email] Sending new order notification for ${order.orderNumber}`);
    return sendEmail(ADMIN_EMAIL, subject, htmlContent);
  } catch (error) {
    console.error("[Email] New order notification error:", error);
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

export async function sendNewUserNotification(
  userId: string
): Promise<SendEmailResult> {
  try {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      return { success: false, error: "User not found" };
    }

    // Generate action tokens for approve/reject buttons
    const approveToken = await generateActionToken(EmailActionType.APPROVE_USER, userId);
    const rejectToken = await generateActionToken(EmailActionType.REJECT_USER, userId);
    
    const baseUrl = getBaseUrl();
    const approveUrl = `${baseUrl}/api/email-action/${approveToken}`;
    const rejectUrl = `${baseUrl}/api/email-action/${rejectToken}`;
    const actionButtons = generateActionButtons(approveUrl, rejectUrl);

    const subject = `New Customer Registration - ${user.businessName || user.email}`;
    
    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; }
    .header { background: #2563eb; color: white; padding: 20px; text-align: center; }
    .content { padding: 20px; background: #f9f9f9; }
    .user-details { background: white; border: 1px solid #ddd; padding: 15px; margin: 15px 0; }
    .footer { padding: 20px; text-align: center; color: #666; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>New Customer Registration</h1>
    </div>
    <div class="content">
      <p>A new customer has registered and requires approval:</p>
      
      <div class="user-details">
        <p><strong>Email:</strong> ${user.email}</p>
        <p><strong>Business Name:</strong> ${user.businessName || '-'}</p>
        <p><strong>Contact Name:</strong> ${user.contactName || '-'}</p>
        <p><strong>Phone:</strong> ${user.phone || '-'}</p>
        <p><strong>Date of Birth:</strong> ${user.dateOfBirth || '-'}</p>
        <p><strong>Address:</strong> ${user.address || '-'}, ${user.city || '-'}, ${user.state || '-'} ${user.zipCode || '-'}</p>
        ${user.certificateUrl ? `<p><strong>Certificate:</strong> <a href="${baseUrl}${user.certificateUrl}">View Document</a></p>` : ''}
        <p><strong>Registered:</strong> ${new Date(user.createdAt).toLocaleString()}</p>
      </div>
      
      ${actionButtons}
      
      <p style="text-align: center; color: #666; font-size: 13px;">Or review in the <a href="${baseUrl}/admin/users">admin panel</a>.</p>
    </div>
    <div class="footer">
      <p>&copy; ${new Date().getFullYear()} Warner Wireless Gears. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
    `.trim();

    console.log(`[Email] Sending new user notification for ${user.email}`);
    return sendEmail(ADMIN_EMAIL, subject, htmlContent);
  } catch (error) {
    console.error("[Email] New user notification error:", error);
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}
