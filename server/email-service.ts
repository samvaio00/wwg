import { db } from "./db";
import { orders, users } from "@shared/schema";
import { eq } from "drizzle-orm";

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
