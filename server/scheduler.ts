import { syncProductsFromZoho } from "./zoho-service";
import { syncCustomerStatusFromZoho } from "./zoho-books-service";
import { generateProductEmbeddings } from "./ai-service";

interface SchedulerConfig {
  zohoSyncIntervalMinutes: number;
  customerSyncIntervalMinutes: number;
  embeddingsUpdateIntervalMinutes: number;
  enabled: boolean;
}

const DEFAULT_CONFIG: SchedulerConfig = {
  zohoSyncIntervalMinutes: 60,
  customerSyncIntervalMinutes: 60,
  embeddingsUpdateIntervalMinutes: 120,
  enabled: true,
};

let config = { ...DEFAULT_CONFIG };
let zohoSyncInterval: NodeJS.Timeout | null = null;
let customerSyncInterval: NodeJS.Timeout | null = null;
let embeddingsInterval: NodeJS.Timeout | null = null;
let lastZohoSync: Date | null = null;
let lastCustomerSync: Date | null = null;
let lastEmbeddingsUpdate: Date | null = null;

export function getSchedulerStatus() {
  return {
    enabled: config.enabled,
    zohoSync: {
      intervalMinutes: config.zohoSyncIntervalMinutes,
      lastRun: lastZohoSync,
      nextRun: lastZohoSync && config.enabled
        ? new Date(lastZohoSync.getTime() + config.zohoSyncIntervalMinutes * 60 * 1000)
        : null,
      running: zohoSyncInterval !== null,
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
  };
}

async function runZohoSync() {
  console.log("[Scheduler] Starting scheduled Zoho Inventory sync...");
  try {
    const result = await syncProductsFromZoho("scheduler");
    lastZohoSync = new Date();
    console.log(`[Scheduler] Zoho sync complete: ${result.created} created, ${result.updated} updated, ${result.delisted} delisted`);
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

export function startScheduler(newConfig?: Partial<SchedulerConfig>) {
  if (newConfig) {
    config = { ...config, ...newConfig };
  }

  if (!config.enabled) {
    console.log("[Scheduler] Scheduler is disabled");
    return;
  }

  stopScheduler();

  console.log(`[Scheduler] Starting scheduler with Zoho sync every ${config.zohoSyncIntervalMinutes} minutes`);
  console.log(`[Scheduler] Customer sync every ${config.customerSyncIntervalMinutes} minutes`);
  console.log(`[Scheduler] Embeddings update every ${config.embeddingsUpdateIntervalMinutes} minutes`);

  zohoSyncInterval = setInterval(
    runZohoSync,
    config.zohoSyncIntervalMinutes * 60 * 1000
  );

  customerSyncInterval = setInterval(
    runCustomerSync,
    config.customerSyncIntervalMinutes * 60 * 1000
  );

  embeddingsInterval = setInterval(
    runEmbeddingsUpdate,
    config.embeddingsUpdateIntervalMinutes * 60 * 1000
  );

  setTimeout(() => {
    console.log("[Scheduler] Running initial sync on startup...");
    runZohoSync()
      .then(() => runCustomerSync())
      .then(() => runEmbeddingsUpdate())
      .catch((err) => console.error("[Scheduler] Initial sync error:", err));
  }, 5000);
}

export function stopScheduler() {
  if (zohoSyncInterval) {
    clearInterval(zohoSyncInterval);
    zohoSyncInterval = null;
    console.log("[Scheduler] Zoho sync interval stopped");
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
}

export function updateSchedulerConfig(newConfig: Partial<SchedulerConfig>) {
  config = { ...config, ...newConfig };
  if (config.enabled) {
    startScheduler();
  } else {
    stopScheduler();
  }
}

export async function triggerManualSync(type: "zoho" | "customers" | "embeddings" | "all") {
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
  
  return results;
}
