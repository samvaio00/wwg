import { storage } from "./storage";
import { JobType, OrderStatus, type Job } from "@shared/schema";
import { createZohoCustomer, createZohoSalesOrder } from "./zoho-books-service";

const MAX_ATTEMPTS = 3;

interface JobResult {
  jobId: string;
  jobType: string;
  success: boolean;
  message: string;
}

async function processCreateCustomerJob(job: Job): Promise<{ success: boolean; message: string; customerId?: string }> {
  const payload = JSON.parse(job.payload || "{}");
  
  const result = await createZohoCustomer({
    email: payload.email,
    contactName: payload.contactName,
    companyName: payload.companyName,
    phone: payload.phone,
    address: payload.address,
    city: payload.city,
    state: payload.state,
    zipCode: payload.zipCode,
  });
  
  if (result.success && result.customerId && job.userId) {
    await storage.updateUserZohoCustomerId(job.userId, result.customerId);
  }
  
  return result;
}

async function processPushOrderJob(job: Job): Promise<{ success: boolean; message: string; salesOrderId?: string }> {
  const payload = JSON.parse(job.payload || "{}");
  
  const result = await createZohoSalesOrder({
    customerId: payload.customerId,
    orderNumber: payload.orderNumber,
    lineItems: payload.lineItems,
    shippingAddress: payload.shippingAddress,
    shippingCity: payload.shippingCity,
    shippingState: payload.shippingState,
    shippingZipCode: payload.shippingZipCode,
    notes: payload.notes,
  });
  
  if (result.success && result.salesOrderId && job.orderId) {
    await storage.updateOrderZohoInfo(job.orderId, result.salesOrderId);
    await storage.updateOrderStatus(job.orderId, OrderStatus.APPROVED);
    console.log(`[Job Worker] Order ${job.orderId} updated to approved status after successful Zoho push`);
  }
  
  return result;
}

async function processJob(job: Job): Promise<{ success: boolean; message: string }> {
  switch (job.jobType) {
    case JobType.CREATE_ZOHO_CUSTOMER:
      return processCreateCustomerJob(job);
    case JobType.PUSH_ORDER_TO_ZOHO:
      return processPushOrderJob(job);
    default:
      return { success: false, message: `Unknown job type: ${job.jobType}` };
  }
}

export async function processJobQueue(): Promise<JobResult[]> {
  const results: JobResult[] = [];
  const pendingJobs = await storage.getPendingJobs();
  
  console.log(`[Job Worker] Processing ${pendingJobs.length} pending jobs`);
  
  for (const job of pendingJobs) {
    console.log(`[Job Worker] Processing job ${job.id} (${job.jobType}), attempt ${(job.attempts || 0) + 1}`);
    
    const currentAttempts = job.attempts || 0;
    
    await storage.updateJob(job.id, {
      status: 'processing',
      attempts: currentAttempts + 1,
      lastAttemptAt: new Date()
    });
    
    try {
      const result = await processJob(job);
      
      if (result.success) {
        await storage.updateJob(job.id, {
          status: 'completed',
          completedAt: new Date(),
          errorMessage: null
        });
        
        results.push({
          jobId: job.id,
          jobType: job.jobType,
          success: true,
          message: result.message
        });
        
        console.log(`[Job Worker] Job ${job.id} completed successfully`);
      } else {
        const newAttempts = currentAttempts + 1;
        const isFailed = newAttempts >= MAX_ATTEMPTS;
        
        await storage.updateJob(job.id, {
          status: isFailed ? 'failed' : 'pending',
          errorMessage: result.message
        });
        
        results.push({
          jobId: job.id,
          jobType: job.jobType,
          success: false,
          message: result.message
        });
        
        console.log(`[Job Worker] Job ${job.id} ${isFailed ? 'failed permanently' : 'will retry'}: ${result.message}`);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      const newAttempts = currentAttempts + 1;
      const isFailed = newAttempts >= MAX_ATTEMPTS;
      
      await storage.updateJob(job.id, {
        status: isFailed ? 'failed' : 'pending',
        errorMessage: errorMsg
      });
      
      results.push({
        jobId: job.id,
        jobType: job.jobType,
        success: false,
        message: errorMsg
      });
      
      console.error(`[Job Worker] Job ${job.id} error:`, error);
    }
  }
  
  console.log(`[Job Worker] Processed ${results.length} jobs`);
  return results;
}
