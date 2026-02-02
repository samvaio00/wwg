import { syncProductsFromZoho, syncCategoriesFromZoho, syncItemGroupsFromZoho } from "./zoho-service";
import { syncCustomerStatusFromZoho, syncTopSellersFromZoho } from "./zoho-books-service";
import { generateProductEmbeddings } from "./ai-service";
import { sendNewHighlightedItemsEmail, sendNewSkusEmail, sendCartAbandonmentEmails } from "./email-campaign-service";

interface SchedulerConfig {
  zohoSyncIntervalMinutes: number;
  customerSyncIntervalMinutes: number;
  embeddingsUpdateIntervalMinutes: number;
  enabled: boolean;
  useBusinessHours: boolean;
  businessHoursIntervalMinutes: number;
  offHoursIntervalMinutes: number;
  businessStartHour: number;
  businessEndHour: number;
  enableFrequentZohoSync: boolean;
}

const DEFAULT_CONFIG: SchedulerConfig = {
  zohoSyncIntervalMinutes: 60,
  customerSyncIntervalMinutes: 60,
  embeddingsUpdateIntervalMinutes: 120,
  enabled: true,
  useBusinessHours: true,
  businessHoursIntervalMinutes: 120,
  offHoursIntervalMinutes: 360,
  businessStartHour: 8,
  businessEndHour: 18,
  enableFrequentZohoSync: false, // Webhooks as primary, daily sync as backup
};

function isBusinessHours(): boolean {
  const now = new Date();
  const hour = now.getHours();
  const day = now.getDay();
  const isWeekend = day === 0 || day === 6;
  if (isWeekend) return false;
  return hour >= config.businessStartHour && hour < config.businessEndHour;
}

function getCurrentSyncInterval(): number {
  if (!config.useBusinessHours) {
    return config.zohoSyncIntervalMinutes;
  }
  return isBusinessHours()
    ? config.businessHoursIntervalMinutes
    : config.offHoursIntervalMinutes;
}

let config = { ...DEFAULT_CONFIG };
let zohoSyncInterval: NodeJS.Timeout | null = null;
let customerSyncInterval: NodeJS.Timeout | null = null;
let embeddingsInterval: NodeJS.Timeout | null = null;
let topSellersInterval: NodeJS.Timeout | null = null;
let emailCampaignInterval: NodeJS.Timeout | null = null;
let weeklyZohoBackupInterval: NodeJS.Timeout | null = null;
let dailyZohoSyncInterval: NodeJS.Timeout | null = null;
let lastZohoSync: Date | null = null;
let lastCustomerSync: Date | null = null;
let lastEmbeddingsUpdate: Date | null = null;
let lastTopSellersSync: Date | null = null;
let lastEmailCampaignRun: Date | null = null;
let lastWeeklyZohoBackup: Date | null = null;
let lastDailyZohoSync: Date | null = null;

export function getSchedulerStatus() {
  const currentInterval = getCurrentSyncInterval();
  return {
    enabled: config.enabled,
    useBusinessHours: config.useBusinessHours,
    isBusinessHours: isBusinessHours(),
    currentIntervalMinutes: currentInterval,
    businessHoursIntervalMinutes: config.businessHoursIntervalMinutes,
    offHoursIntervalMinutes: config.offHoursIntervalMinutes,
    enableFrequentZohoSync: config.enableFrequentZohoSync,
    zohoSync: {
      mode: config.enableFrequentZohoSync ? "frequent" : "webhook",
      intervalMinutes: config.enableFrequentZohoSync ? currentInterval : null,
      lastRun: lastZohoSync,
      nextRun: config.enableFrequentZohoSync && lastZohoSync && config.enabled
        ? new Date(lastZohoSync.getTime() + currentInterval * 60 * 1000)
        : null,
      running: zohoSyncInterval !== null,
      dormant: !config.enableFrequentZohoSync,
    },
    dailyZohoSync: {
      schedule: "Daily (3 AM)",
      lastRun: lastDailyZohoSync,
      nextRun: getNext3AMTime(),
      running: dailyZohoSyncInterval !== null,
    },
    weeklyZohoBackup: {
      schedule: "Weekly (Sunday 2AM)",
      lastRun: lastWeeklyZohoBackup,
      nextRun: getNextSundayBackupTime(),
      running: weeklyZohoBackupInterval !== null,
    },
    customerSync: {
      intervalMinutes: config.customerSyncIntervalMinutes,
      lastRun: lastCustomerSync,
      nextRun: lastCustomerSync && config.enabled
        ? new Date(lastCustomerSync.getTime() + config.customerSyncIntervalMinutes * 60 * 1000)
        : null,
      running: customerSyncInterval !== null,
    },
    embeddingsUpdate: {
      intervalMinutes: config.embeddingsUpdateIntervalMinutes,
      lastRun: lastEmbeddingsUpdate,
      nextRun: lastEmbeddingsUpdate && config.enabled
        ? new Date(lastEmbeddingsUpdate.getTime() + config.embeddingsUpdateIntervalMinutes * 60 * 1000)
        : null,
      running: embeddingsInterval !== null,
    },
    topSellersSync: {
      schedule: "Weekly (Sunday)",
      lastRun: lastTopSellersSync,
      nextRun: getNextSundayMidnight(),
      running: topSellersInterval !== null,
    },
    emailCampaigns: {
      schedule: "Wed & Sat 9AM",
      lastRun: lastEmailCampaignRun,
      nextRun: getNextEmailCampaignDate(),
      running: emailCampaignInterval !== null,
    },
  };
}

function getNextSundayBackupTime(): Date {
  const now = new Date();
  const daysUntilSunday = (7 - now.getDay()) % 7 || 7;
  const nextSunday = new Date(now);
  nextSunday.setDate(now.getDate() + daysUntilSunday);
  nextSunday.setHours(2, 0, 0, 0);
  return nextSunday;
}

function getMsUntilNextSundayBackup(): number {
  const now = new Date();
  const nextBackup = getNextSundayBackupTime();
  return nextBackup.getTime() - now.getTime();
}

function getNext3AMTime(): Date {
  const now = new Date();
  const next3AM = new Date(now);
  next3AM.setHours(3, 0, 0, 0);
  // If it's already past 3 AM today, schedule for tomorrow
  if (now.getHours() >= 3) {
    next3AM.setDate(next3AM.getDate() + 1);
  }
  return next3AM;
}

function getMsUntilNext3AM(): number {
  const now = new Date();
  const next3AM = getNext3AMTime();
  return next3AM.getTime() - now.getTime();
}

function getNextSundayMidnight(): Date {
  const now = new Date();
  const daysUntilSunday = (7 - now.getDay()) % 7 || 7;
  const nextSunday = new Date(now);
  nextSunday.setDate(now.getDate() + daysUntilSunday);
  nextSunday.setHours(0, 0, 0, 0);
  return nextSunday;
}

function getMsUntilNextSunday(): number {
  const now = new Date();
  const nextSunday = getNextSundayMidnight();
  return nextSunday.getTime() - now.getTime();
}

function getNextEmailCampaignDate(): Date {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const hour = now.getHours();
  
  let daysUntilNext: number;
  
  if (dayOfWeek === 3 && hour < 9) {
    daysUntilNext = 0;
  } else if (dayOfWeek < 3) {
    daysUntilNext = 3 - dayOfWeek;
  } else if (dayOfWeek === 3 || dayOfWeek === 4 || dayOfWeek === 5 || (dayOfWeek === 6 && hour < 9)) {
    daysUntilNext = 6 - dayOfWeek;
    if (daysUntilNext === 0 && hour >= 9) {
      daysUntilNext = 4;
    }
  } else if (dayOfWeek === 6 && hour >= 9) {
    daysUntilNext = 4;
  } else {
    daysUntilNext = 3;
  }
  
  const nextDate = new Date(now);
  nextDate.setDate(now.getDate() + daysUntilNext);
  nextDate.setHours(9, 0, 0, 0);
  return nextDate;
}

function getMsUntilNextEmailCampaign(): number {
  const now = new Date();
  const next = getNextEmailCampaignDate();
  return next.getTime() - now.getTime();
}

async function runZohoSync() {
  console.log("[Scheduler] Starting scheduled Zoho Inventory sync...");
  try {
    // Sync categories first to ensure they exist before product sync
    const catResult = await syncCategoriesFromZoho();
    console.log(`[Scheduler] Category sync complete: ${catResult.synced} synced`);
    
    // Then sync products
    const result = await syncProductsFromZoho("scheduler");
    lastZohoSync = new Date();
    console.log(`[Scheduler] Zoho sync complete: ${result.created} created, ${result.updated} updated, ${result.delisted} delisted`);
    
    // Sync item groups to update products with group IDs for variant display
    try {
      const groupResult = await syncItemGroupsFromZoho();
      console.log(`[Scheduler] Item groups sync complete: ${groupResult.synced} groups, ${groupResult.updated} products updated`);
    } catch (groupError) {
      console.error("[Scheduler] Item groups sync error:", groupError);
    }
    
    return result;
  } catch (error) {
    console.error("[Scheduler] Zoho sync error:", error);
    throw error;
  }
}

async function runCustomerSync() {
  console.log("[Scheduler] Starting scheduled customer status sync...");
  try {
    const result = await syncCustomerStatusFromZoho("scheduler");
    lastCustomerSync = new Date();
    console.log(`[Scheduler] Customer sync complete: ${result.checked} checked, ${result.suspended} suspended, ${result.reactivated} reactivated`);
    return result;
  } catch (error) {
    console.error("[Scheduler] Customer sync error:", error);
    throw error;
  }
}

async function runEmbeddingsUpdate() {
  console.log("[Scheduler] Starting scheduled embeddings update...");
  try {
    const result = await generateProductEmbeddings();
    lastEmbeddingsUpdate = new Date();
    console.log(`[Scheduler] Embeddings update complete: ${result.created} created, ${result.updated} updated`);
    return result;
  } catch (error) {
    console.error("[Scheduler] Embeddings update error:", error);
    throw error;
  }
}

async function runTopSellersSync() {
  console.log("[Scheduler] Starting scheduled top sellers sync from Zoho Books...");
  try {
    const result = await syncTopSellersFromZoho();
    lastTopSellersSync = new Date();
    console.log(`[Scheduler] Top sellers sync complete: ${result.synced} products synced`);
    return result;
  } catch (error) {
    console.error("[Scheduler] Top sellers sync error:", error);
    throw error;
  }
}

async function runEmailCampaigns() {
  console.log("[Scheduler] Starting scheduled email campaigns...");
  try {
    const results = {
      highlightedItems: { sent: 0, errors: 0 },
      newSkus: { sent: 0, errors: 0 },
      cartAbandonment: { sent: 0, errors: 0 },
    };

    try {
      results.highlightedItems = await sendNewHighlightedItemsEmail();
    } catch (error) {
      console.error("[Scheduler] New highlighted items email error:", error);
    }

    try {
      results.newSkus = await sendNewSkusEmail();
    } catch (error) {
      console.error("[Scheduler] New SKUs email error:", error);
    }

    try {
      results.cartAbandonment = await sendCartAbandonmentEmails();
    } catch (error) {
      console.error("[Scheduler] Cart abandonment email error:", error);
    }

    lastEmailCampaignRun = new Date();
    const totalSent = results.highlightedItems.sent + results.newSkus.sent + results.cartAbandonment.sent;
    const totalErrors = results.highlightedItems.errors + results.newSkus.errors + results.cartAbandonment.errors;
    console.log(`[Scheduler] Email campaigns complete: ${totalSent} sent, ${totalErrors} errors`);
    return results;
  } catch (error) {
    console.error("[Scheduler] Email campaigns error:", error);
    throw error;
  }
}

function scheduleNextTopSellersSync() {
  const msUntilSunday = getMsUntilNextSunday();
  const hoursUntil = Math.round(msUntilSunday / (1000 * 60 * 60));
  console.log(`[Scheduler] Next top sellers sync scheduled in ${hoursUntil} hours (Sunday midnight)`);
  
  topSellersInterval = setTimeout(async () => {
    try {
      await runTopSellersSync();
    } catch (error) {
      console.error("[Scheduler] Top sellers sync failed, will retry next week:", error);
    } finally {
      scheduleNextTopSellersSync();
    }
  }, msUntilSunday);
}

function scheduleNextEmailCampaign() {
  const msUntilNext = getMsUntilNextEmailCampaign();
  const hoursUntil = Math.round(msUntilNext / (1000 * 60 * 60));
  const nextDate = getNextEmailCampaignDate();
  const dayName = nextDate.getDay() === 3 ? "Wednesday" : "Saturday";
  console.log(`[Scheduler] Next email campaign scheduled in ${hoursUntil} hours (${dayName} 9 AM)`);
  
  emailCampaignInterval = setTimeout(async () => {
    try {
      await runEmailCampaigns();
    } catch (error) {
      console.error("[Scheduler] Email campaign failed, will retry next scheduled time:", error);
    } finally {
      scheduleNextEmailCampaign();
    }
  }, msUntilNext);
}

function scheduleNextZohoSync() {
  const interval = getCurrentSyncInterval();
  console.log(`[Scheduler] Next Zoho sync in ${interval} minutes (${isBusinessHours() ? 'business hours' : 'off-hours'})`);
  
  zohoSyncInterval = setTimeout(async () => {
    try {
      await runZohoSync();
    } catch (error) {
      console.error("[Scheduler] Zoho sync failed, will retry on next interval:", error);
    } finally {
      scheduleNextZohoSync();
    }
  }, interval * 60 * 1000);
}

async function runWeeklyZohoBackup() {
  console.log("[Scheduler] Starting weekly Zoho inventory backup sync (full sync)...");
  try {
    const catResult = await syncCategoriesFromZoho();
    console.log(`[Scheduler] Backup - Category sync complete: ${catResult.synced} synced`);
    
    const result = await syncProductsFromZoho("scheduler-weekly-backup");
    lastWeeklyZohoBackup = new Date();
    console.log(`[Scheduler] Weekly backup sync complete: ${result.created} created, ${result.updated} updated, ${result.delisted} delisted`);
    
    try {
      const groupResult = await syncItemGroupsFromZoho();
      console.log(`[Scheduler] Backup - Item groups sync complete: ${groupResult.synced} groups, ${groupResult.updated} products updated`);
    } catch (groupError) {
      console.error("[Scheduler] Backup - Item groups sync error:", groupError);
    }
    
    return result;
  } catch (error) {
    console.error("[Scheduler] Weekly backup sync error:", error);
    throw error;
  }
}

function scheduleNextWeeklyZohoBackup() {
  const msUntilBackup = getMsUntilNextSundayBackup();
  const hoursUntil = Math.round(msUntilBackup / (1000 * 60 * 60));
  console.log(`[Scheduler] Next weekly Zoho backup scheduled in ${hoursUntil} hours (Sunday 2 AM)`);
  
  weeklyZohoBackupInterval = setTimeout(async () => {
    try {
      await runWeeklyZohoBackup();
    } catch (error) {
      console.error("[Scheduler] Weekly backup sync failed, will retry next week:", error);
    } finally {
      scheduleNextWeeklyZohoBackup();
    }
  }, msUntilBackup);
}

async function runDailyZohoSync() {
  console.log("[Scheduler] Starting daily Zoho incremental sync (3 AM)...");
  try {
    const catResult = await syncCategoriesFromZoho();
    console.log(`[Scheduler] Daily sync - Category sync complete: ${catResult.synced} synced`);
    
    const result = await syncProductsFromZoho("scheduler-daily");
    lastDailyZohoSync = new Date();
    console.log(`[Scheduler] Daily sync complete: ${result.created} created, ${result.updated} updated, ${result.delisted} delisted`);
    
    try {
      const groupResult = await syncItemGroupsFromZoho();
      console.log(`[Scheduler] Daily sync - Item groups sync complete: ${groupResult.synced} groups, ${groupResult.updated} products updated`);
    } catch (groupError) {
      console.error("[Scheduler] Daily sync - Item groups sync error:", groupError);
    }
    
    return result;
  } catch (error) {
    console.error("[Scheduler] Daily sync error:", error);
    throw error;
  }
}

function scheduleNextDailyZohoSync() {
  const msUntil3AM = getMsUntilNext3AM();
  const hoursUntil = Math.round(msUntil3AM / (1000 * 60 * 60));
  console.log(`[Scheduler] Next daily Zoho sync scheduled in ${hoursUntil} hours (3 AM)`);
  
  dailyZohoSyncInterval = setTimeout(async () => {
    try {
      await runDailyZohoSync();
    } catch (error) {
      console.error("[Scheduler] Daily sync failed, will retry tomorrow:", error);
    } finally {
      scheduleNextDailyZohoSync();
    }
  }, msUntil3AM);
}

export function startScheduler(newConfig?: Partial<SchedulerConfig>) {
  if (newConfig) {
    config = { ...config, ...newConfig };
  }

  if (!config.enabled) {
    console.log("[Scheduler] Scheduler is disabled");
    return;
  }

  stopScheduler();

  console.log(`[Scheduler] Starting scheduler:`);
  
  if (config.enableFrequentZohoSync) {
    if (config.useBusinessHours) {
      console.log(`[Scheduler]   Frequent Zoho API sync: ENABLED (2-6 hour intervals)`);
      console.log(`[Scheduler]     Business hours (${config.businessStartHour}:00-${config.businessEndHour}:00): ${config.businessHoursIntervalMinutes} minutes`);
      console.log(`[Scheduler]     Off-hours/weekends: ${config.offHoursIntervalMinutes} minutes`);
    } else {
      console.log(`[Scheduler]   Frequent Zoho API sync: ENABLED (every ${config.zohoSyncIntervalMinutes} minutes)`);
    }
  } else {
    console.log(`[Scheduler]   Webhooks mode: Real-time updates via Zoho webhooks`);
    console.log(`[Scheduler]   Daily backup sync: 3 AM`);
    console.log(`[Scheduler]   Weekly full sync: Sunday 2 AM`);
  }
  
  console.log(`[Scheduler]   Customer sync: every ${config.customerSyncIntervalMinutes} minutes`);
  console.log(`[Scheduler]   Embeddings update: every ${config.embeddingsUpdateIntervalMinutes} minutes`);

  if (config.enableFrequentZohoSync) {
    scheduleNextZohoSync();
  } else {
    // Webhooks mode: schedule daily 3 AM sync + weekly Sunday 2 AM full sync
    scheduleNextDailyZohoSync();
    scheduleNextWeeklyZohoBackup();
  }

  customerSyncInterval = setInterval(
    runCustomerSync,
    config.customerSyncIntervalMinutes * 60 * 1000
  );

  embeddingsInterval = setInterval(
    runEmbeddingsUpdate,
    config.embeddingsUpdateIntervalMinutes * 60 * 1000
  );

  // Schedule weekly top sellers sync (Sundays at midnight)
  scheduleNextTopSellersSync();

  // Schedule email campaigns on Wednesday and Saturday at 9 AM
  scheduleNextEmailCampaign();

  setTimeout(() => {
    console.log("[Scheduler] Running initial sync on startup...");
    const initialSyncPromise = config.enableFrequentZohoSync
      ? runZohoSync()
      : Promise.resolve();
    
    initialSyncPromise
      .then(() => runCustomerSync())
      .then(() => runEmbeddingsUpdate())
      .then(() => runTopSellersSync())
      .catch((err) => console.error("[Scheduler] Initial sync error:", err));
  }, 5000);
}

export function stopScheduler() {
  if (zohoSyncInterval) {
    clearTimeout(zohoSyncInterval);
    zohoSyncInterval = null;
    console.log("[Scheduler] Zoho sync stopped");
  }
  if (dailyZohoSyncInterval) {
    clearTimeout(dailyZohoSyncInterval);
    dailyZohoSyncInterval = null;
    console.log("[Scheduler] Daily Zoho sync stopped");
  }
  if (weeklyZohoBackupInterval) {
    clearTimeout(weeklyZohoBackupInterval);
    weeklyZohoBackupInterval = null;
    console.log("[Scheduler] Weekly Zoho backup stopped");
  }
  if (customerSyncInterval) {
    clearInterval(customerSyncInterval);
    customerSyncInterval = null;
    console.log("[Scheduler] Customer sync interval stopped");
  }
  if (embeddingsInterval) {
    clearInterval(embeddingsInterval);
    embeddingsInterval = null;
    console.log("[Scheduler] Embeddings interval stopped");
  }
  if (topSellersInterval) {
    clearTimeout(topSellersInterval);
    topSellersInterval = null;
    console.log("[Scheduler] Top sellers sync stopped");
  }
  if (emailCampaignInterval) {
    clearTimeout(emailCampaignInterval);
    emailCampaignInterval = null;
    console.log("[Scheduler] Email campaigns stopped");
  }
}

export function updateSchedulerConfig(newConfig: Partial<SchedulerConfig>) {
  config = { ...config, ...newConfig };
  if (config.enabled) {
    startScheduler();
  } else {
    stopScheduler();
  }
}

export async function triggerManualSync(type: "zoho" | "customers" | "embeddings" | "topsellers" | "emailcampaigns" | "all") {
  const results: Record<string, unknown> = {};
  
  if (type === "zoho" || type === "all") {
    results.zoho = await runZohoSync();
  }
  
  if (type === "customers" || type === "all") {
    results.customers = await runCustomerSync();
  }
  
  if (type === "embeddings" || type === "all") {
    results.embeddings = await runEmbeddingsUpdate();
  }
  
  if (type === "topsellers" || type === "all") {
    results.topsellers = await runTopSellersSync();
  }
  
  if (type === "emailcampaigns" || type === "all") {
    results.emailcampaigns = await runEmailCampaigns();
  }
  
  return results;
}
