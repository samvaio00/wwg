interface WebhookEvent {
  type: string;
  action: string;
  timestamp: Date;
  success: boolean;
  details?: string;
}

interface WebhookStatsData {
  today: {
    total: number;
    successful: number;
    failed: number;
    byAction: Record<string, number>;
  };
  month: {
    total: number;
    successful: number;
    failed: number;
  };
  lastReceived: Date | null;
  recentEvents: WebhookEvent[];
}

const MAX_RECENT_EVENTS = 50;
let webhookEvents: WebhookEvent[] = [];
let lastStatsReset: Date = new Date();
let monthlyStatsReset: Date = new Date();

function isToday(date: Date): boolean {
  const now = new Date();
  return (
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear()
  );
}

function isThisMonth(date: Date): boolean {
  const now = new Date();
  return (
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear()
  );
}

function resetDailyStatsIfNeeded(): void {
  if (!isToday(lastStatsReset)) {
    lastStatsReset = new Date();
  }
}

function resetMonthlyStatsIfNeeded(): void {
  if (!isThisMonth(monthlyStatsReset)) {
    monthlyStatsReset = new Date();
  }
}

export function recordWebhookEvent(
  type: "items" | "customers" | "invoices" | "bills",
  action: string,
  success: boolean,
  details?: string
): void {
  const event: WebhookEvent = {
    type,
    action,
    timestamp: new Date(),
    success,
    details,
  };

  webhookEvents.unshift(event);
  
  if (webhookEvents.length > MAX_RECENT_EVENTS * 10) {
    webhookEvents = webhookEvents.slice(0, MAX_RECENT_EVENTS * 5);
  }

  console.log(`[Webhook Stats] Recorded: ${type}.${action} - ${success ? "success" : "failed"}${details ? ` - ${details}` : ""}`);
}

export function getWebhookStats(): WebhookStatsData {
  resetDailyStatsIfNeeded();
  resetMonthlyStatsIfNeeded();

  const todayEvents = webhookEvents.filter((e) => isToday(e.timestamp));
  const monthEvents = webhookEvents.filter((e) => isThisMonth(e.timestamp));

  const byAction: Record<string, number> = {};
  todayEvents.forEach((e) => {
    const key = `${e.type}.${e.action}`;
    byAction[key] = (byAction[key] || 0) + 1;
  });

  return {
    today: {
      total: todayEvents.length,
      successful: todayEvents.filter((e) => e.success).length,
      failed: todayEvents.filter((e) => !e.success).length,
      byAction,
    },
    month: {
      total: monthEvents.length,
      successful: monthEvents.filter((e) => e.success).length,
      failed: monthEvents.filter((e) => !e.success).length,
    },
    lastReceived: webhookEvents.length > 0 ? webhookEvents[0].timestamp : null,
    recentEvents: webhookEvents.slice(0, MAX_RECENT_EVENTS).map((e) => ({
      type: e.type,
      action: e.action,
      timestamp: e.timestamp,
      success: e.success,
      details: e.details,
    })),
  };
}

export function clearWebhookStats(): void {
  webhookEvents = [];
  lastStatsReset = new Date();
  monthlyStatsReset = new Date();
  console.log("[Webhook Stats] Stats cleared");
}
