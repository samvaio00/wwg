import { db } from "./db";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";

const ADMIN_EMAIL = process.env.ALERT_EMAIL || "warnergears@gmail.com";
const ALERT_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes between same alert types

interface AlertState {
  lastSent: Map<string, number>;
}

const alertState: AlertState = {
  lastSent: new Map(),
};

function getEmailConfig() {
  if (process.env.SENDGRID_API_KEY) {
    return {
      provider: "sendgrid" as const,
      apiKey: process.env.SENDGRID_API_KEY,
      fromEmail: process.env.EMAIL_FROM || "alerts@warnerwireless.com",
      fromName: process.env.EMAIL_FROM_NAME || "Warner Wireless Gears Alerts",
    };
  }
  return { provider: "console" as const };
}

async function sendAlertEmail(
  subject: string,
  htmlContent: string
): Promise<{ success: boolean; error?: string }> {
  const config = getEmailConfig();

  if (config.provider === "console") {
    console.log(`[Alert Email - Console Mode]`);
    console.log(`To: ${ADMIN_EMAIL}`);
    console.log(`Subject: ${subject}`);
    console.log(`Content: ${htmlContent.replace(/<[^>]*>/g, '')}`);
    return { success: true };
  }

  try {
    const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: ADMIN_EMAIL }] }],
        from: { email: config.fromEmail, name: config.fromName },
        subject,
        content: [
          { type: "text/html", value: htmlContent },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Alert] SendGrid error: ${errorText}`);
      return { success: false, error: errorText };
    }

    console.log(`[Alert] Email sent successfully: ${subject}`);
    return { success: true };
  } catch (error) {
    console.error("[Alert] Email send error:", error);
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

function shouldSendAlert(alertType: string): boolean {
  const lastSent = alertState.lastSent.get(alertType);
  const now = Date.now();
  
  if (lastSent && now - lastSent < ALERT_COOLDOWN_MS) {
    console.log(`[Alert] Skipping ${alertType} alert - cooldown active`);
    return false;
  }
  
  alertState.lastSent.set(alertType, now);
  return true;
}

function getBaseUrl(): string {
  if (process.env.REPLIT_DEPLOYMENT_URL) {
    return process.env.REPLIT_DEPLOYMENT_URL;
  }
  if (process.env.REPL_SLUG) {
    return `https://${process.env.REPL_SLUG}.repl.co`;
  }
  return "http://localhost:5000";
}

export async function sendServerCrashAlert(error: Error): Promise<void> {
  if (!shouldSendAlert("server_crash")) return;

  const subject = "🚨 Server Crash Alert - Warner Wireless Gears";
  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
</head>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: #dc2626; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
    <h1 style="margin: 0; font-size: 24px;">Server Crash Detected</h1>
  </div>
  <div style="border: 1px solid #e5e7eb; border-top: none; padding: 20px; border-radius: 0 0 8px 8px;">
    <p style="color: #374151; margin-bottom: 16px;">
      The server has experienced a critical error and may have crashed.
    </p>
    <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 6px; padding: 16px; margin-bottom: 16px;">
      <p style="margin: 0 0 8px 0; font-weight: bold; color: #991b1b;">Error:</p>
      <pre style="margin: 0; white-space: pre-wrap; color: #991b1b; font-size: 13px;">${error.message}</pre>
    </div>
    <div style="background: #f3f4f6; border-radius: 6px; padding: 16px; margin-bottom: 16px;">
      <p style="margin: 0 0 8px 0; font-weight: bold; color: #374151;">Stack Trace:</p>
      <pre style="margin: 0; white-space: pre-wrap; font-size: 11px; color: #6b7280;">${error.stack || 'No stack trace available'}</pre>
    </div>
    <p style="color: #6b7280; font-size: 12px; margin: 0;">
      Time: ${new Date().toISOString()}<br>
      Environment: ${process.env.NODE_ENV || 'development'}
    </p>
  </div>
</body>
</html>`;

  await sendAlertEmail(subject, htmlContent);
}

export async function sendServerErrorAlert(
  error: Error,
  context: { route?: string; method?: string; userId?: string }
): Promise<void> {
  if (!shouldSendAlert(`server_error_${context.route || 'unknown'}`)) return;

  const subject = "⚠️ Server Error Alert - Warner Wireless Gears";
  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
</head>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: #f59e0b; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
    <h1 style="margin: 0; font-size: 24px;">Server Error Detected</h1>
  </div>
  <div style="border: 1px solid #e5e7eb; border-top: none; padding: 20px; border-radius: 0 0 8px 8px;">
    <p style="color: #374151; margin-bottom: 16px;">
      An error occurred while a customer was using the site.
    </p>
    <table style="width: 100%; border-collapse: collapse; margin-bottom: 16px;">
      <tr style="border-bottom: 1px solid #e5e7eb;">
        <td style="padding: 8px 0; color: #6b7280; width: 100px;">Route:</td>
        <td style="padding: 8px 0; color: #374151;">${context.method || 'GET'} ${context.route || 'Unknown'}</td>
      </tr>
      ${context.userId ? `
      <tr style="border-bottom: 1px solid #e5e7eb;">
        <td style="padding: 8px 0; color: #6b7280;">User ID:</td>
        <td style="padding: 8px 0; color: #374151;">${context.userId}</td>
      </tr>` : ''}
    </table>
    <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 6px; padding: 16px; margin-bottom: 16px;">
      <p style="margin: 0 0 8px 0; font-weight: bold; color: #991b1b;">Error:</p>
      <pre style="margin: 0; white-space: pre-wrap; color: #991b1b; font-size: 13px;">${error.message}</pre>
    </div>
    <div style="background: #f3f4f6; border-radius: 6px; padding: 16px; margin-bottom: 16px;">
      <p style="margin: 0 0 8px 0; font-weight: bold; color: #374151;">Stack Trace:</p>
      <pre style="margin: 0; white-space: pre-wrap; font-size: 11px; color: #6b7280;">${error.stack || 'No stack trace available'}</pre>
    </div>
    <p style="color: #6b7280; font-size: 12px; margin: 0;">
      Time: ${new Date().toISOString()}<br>
      Environment: ${process.env.NODE_ENV || 'development'}
    </p>
  </div>
</body>
</html>`;

  await sendAlertEmail(subject, htmlContent);
}

export async function sendSiteDownAlert(reason: string): Promise<void> {
  if (!shouldSendAlert("site_down")) return;

  const subject = "🔴 Site Down Alert - Warner Wireless Gears";
  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
</head>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: #7c3aed; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
    <h1 style="margin: 0; font-size: 24px;">Site Appears to be Down</h1>
  </div>
  <div style="border: 1px solid #e5e7eb; border-top: none; padding: 20px; border-radius: 0 0 8px 8px;">
    <p style="color: #374151; margin-bottom: 16px;">
      The site may be experiencing issues or is not responding.
    </p>
    <div style="background: #f3f4f6; border-radius: 6px; padding: 16px; margin-bottom: 16px;">
      <p style="margin: 0 0 8px 0; font-weight: bold; color: #374151;">Reason:</p>
      <p style="margin: 0; color: #6b7280;">${reason}</p>
    </div>
    <p style="color: #374151; margin-bottom: 16px;">
      <strong>Site URL:</strong> <a href="${getBaseUrl()}" style="color: #2563eb;">${getBaseUrl()}</a>
    </p>
    <p style="color: #6b7280; font-size: 12px; margin: 0;">
      Time: ${new Date().toISOString()}<br>
      Environment: ${process.env.NODE_ENV || 'development'}
    </p>
  </div>
</body>
</html>`;

  await sendAlertEmail(subject, htmlContent);
}

export function setupProcessAlertHandlers(): void {
  process.on('uncaughtException', async (error) => {
    console.error('[Alert] Uncaught Exception:', error);
    await sendServerCrashAlert(error);
    process.exit(1);
  });

  process.on('unhandledRejection', async (reason) => {
    const error = reason instanceof Error ? reason : new Error(String(reason));
    console.error('[Alert] Unhandled Rejection:', error);
    await sendServerCrashAlert(error);
  });

  console.log('[Alert] Process alert handlers registered');
}
