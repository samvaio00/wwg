import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { 
  insertUserSchema, 
  insertAdminStaffSchema,
  loginSchema, 
  toSafeUser, 
  UserRole, 
  UserStatus,
  OrderStatus,
  insertCartItemSchema,
  createOrderSchema,
  ProductCategory,
  emailActionTokens,
  EmailActionType,
  emailUnsubscribeTokens
} from "@shared/schema";
import { z } from "zod";
import { db } from "./db";
import { users, products, orders } from "@shared/schema";
import { eq, and, gt, isNull } from "drizzle-orm";
import { aiCartBuilder, aiEnhancedSearch, generateProductEmbeddings } from "./ai-service";
import { syncProductsFromZoho, testZohoConnection, fetchZohoProductImage, syncItemGroupsFromZoho } from "./zoho-service";
import { checkZohoCustomerByEmail, checkZohoCustomerById, createZohoSalesOrder, createZohoCustomer, syncTopSellersFromZoho, type ZohoLineItem } from "./zoho-books-service";
import { JobType } from "@shared/schema";
import { getSchedulerStatus, triggerManualSync, updateSchedulerConfig } from "./scheduler";
import { sendShipmentNotification, sendDeliveryNotification, sendNewUserNotification, sendNewOrderNotification } from "./email-service";
import { processJobQueue } from "./job-worker";
import multer from "multer";
import path from "path";
import fs from "fs";

// Configure multer for certificate uploads
const certificateStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(process.cwd(), "uploads", "certificates");
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, `certificate-${uniqueSuffix}${ext}`);
  },
});

const certificateUpload = multer({
  storage: certificateStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = ["application/pdf", "image/jpeg", "image/png", "image/gif"];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Invalid file type. Only PDF, JPEG, PNG, and GIF are allowed."));
    }
  },
});

// Middleware to check if user is authenticated
function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    return res.status(401).json({ message: "Authentication required" });
  }
  next();
}

// Middleware to check if user is admin
async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    return res.status(401).json({ message: "Authentication required" });
  }
  
  const user = await storage.getUser(req.session.userId);
  if (!user || user.role !== UserRole.ADMIN) {
    return res.status(403).json({ message: "Admin access required" });
  }
  
  next();
}

// Middleware to check if user is staff or admin (staff has limited admin privileges)
async function requireStaffOrAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    return res.status(401).json({ message: "Authentication required" });
  }
  
  const user = await storage.getUser(req.session.userId);
  if (!user || (user.role !== UserRole.ADMIN && user.role !== UserRole.STAFF)) {
    return res.status(403).json({ message: "Staff or admin access required" });
  }
  
  next();
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // Health check
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // Email action handler - processes approve/reject actions from email links
  app.get("/api/email-action/:token", async (req, res) => {
    try {
      const { token } = req.params;

      // Find the token and verify it's valid
      const [tokenRecord] = await db
        .select()
        .from(emailActionTokens)
        .where(
          and(
            eq(emailActionTokens.token, token),
            gt(emailActionTokens.expiresAt, new Date()),
            isNull(emailActionTokens.usedAt)
          )
        )
        .limit(1);

      if (!tokenRecord) {
        return res.status(400).send(`
          <!DOCTYPE html>
          <html><head><title>Invalid or Expired Link</title>
          <style>body{font-family:Arial,sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background:#f5f5f5}
          .card{background:white;padding:40px;border-radius:8px;box-shadow:0 2px 10px rgba(0,0,0,0.1);text-align:center;max-width:400px}
          h1{color:#dc2626;margin-bottom:16px}p{color:#666}</style></head>
          <body><div class="card"><h1>Invalid or Expired Link</h1><p>This action link has expired or has already been used. Please log in to the admin panel to take action.</p></div></body></html>
        `);
      }

      const { actionType, targetId } = tokenRecord;
      let resultMessage = "";
      let success = true;

      // Handle different action types - mark token as used only after successful action
      try {
        switch (actionType) {
          case EmailActionType.APPROVE_ORDER: {
            const order = await storage.getOrder(targetId);
            if (order && order.status === OrderStatus.PENDING_APPROVAL) {
              await storage.updateOrderStatus(targetId, OrderStatus.APPROVED);
              resultMessage = `Order ${order.orderNumber} has been approved successfully.`;
            } else {
              resultMessage = order ? "Order has already been processed." : "Order not found.";
              success = false;
            }
            break;
          }
          case EmailActionType.REJECT_ORDER: {
            const order = await storage.getOrder(targetId);
            if (order && order.status === OrderStatus.PENDING_APPROVAL) {
              await storage.updateOrderStatus(targetId, OrderStatus.REJECTED);
              resultMessage = `Order ${order.orderNumber} has been rejected.`;
            } else {
              resultMessage = order ? "Order has already been processed." : "Order not found.";
              success = false;
            }
            break;
          }
          case EmailActionType.APPROVE_USER: {
            const user = await storage.getUser(targetId);
            if (user && user.status === UserStatus.PENDING) {
              await db.update(users).set({ status: UserStatus.APPROVED }).where(eq(users.id, targetId));
              resultMessage = `Customer ${user.businessName || user.email} has been approved.`;
            } else {
              resultMessage = user ? "User has already been processed." : "User not found.";
              success = false;
            }
            break;
          }
          case EmailActionType.REJECT_USER: {
            const user = await storage.getUser(targetId);
            if (user && user.status === UserStatus.PENDING) {
              await db.update(users).set({ status: UserStatus.REJECTED }).where(eq(users.id, targetId));
              resultMessage = `Customer ${user.businessName || user.email} has been rejected.`;
            } else {
              resultMessage = user ? "User has already been processed." : "User not found.";
              success = false;
            }
            break;
          }
          case EmailActionType.APPROVE_PROFILE: {
            const user = await storage.getUser(targetId);
            if (user && user.pendingProfileData) {
              let pendingData;
              try {
                pendingData = typeof user.pendingProfileData === 'string' 
                  ? JSON.parse(user.pendingProfileData) 
                  : user.pendingProfileData;
              } catch (parseError) {
                console.error("[Email Action] Failed to parse pending profile data:", parseError);
                resultMessage = "Invalid pending profile data. Please review in admin panel.";
                success = false;
                break;
              }
              await db.update(users).set({ 
                ...pendingData,
                pendingProfileData: null 
              }).where(eq(users.id, targetId));
              resultMessage = `Profile update for ${user.businessName || user.email} has been approved.`;
            } else {
              resultMessage = user ? "No pending profile update found." : "User not found.";
              success = false;
            }
            break;
          }
          case EmailActionType.REJECT_PROFILE: {
            const user = await storage.getUser(targetId);
            if (user && user.pendingProfileData) {
              await db.update(users).set({ pendingProfileData: null }).where(eq(users.id, targetId));
              resultMessage = `Profile update for ${user.businessName || user.email} has been rejected.`;
            } else {
              resultMessage = user ? "No pending profile update found." : "User not found.";
              success = false;
            }
            break;
          }
          default:
            resultMessage = "Unknown action type.";
            success = false;
        }

        // Mark token as used only after successful action processing
        if (success) {
          await db
            .update(emailActionTokens)
            .set({ usedAt: new Date() })
            .where(eq(emailActionTokens.id, tokenRecord.id));
          console.log(`[Email Action] ${actionType} completed for target ${targetId}`);
        }
      } catch (actionError) {
        console.error(`[Email Action] Error processing ${actionType}:`, actionError);
        resultMessage = "An error occurred while processing your request. The link remains valid - please try again.";
        success = false;
      }

      // Return success/error page
      const bgColor = success ? "#22c55e" : "#ef4444";
      const title = success ? "Action Completed" : "Action Failed";
      
      return res.send(`
        <!DOCTYPE html>
        <html><head><title>${title}</title>
        <style>body{font-family:Arial,sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background:#f5f5f5}
        .card{background:white;padding:40px;border-radius:8px;box-shadow:0 2px 10px rgba(0,0,0,0.1);text-align:center;max-width:500px}
        .icon{width:60px;height:60px;border-radius:50%;background:${bgColor};color:white;display:flex;align-items:center;justify-content:center;margin:0 auto 20px;font-size:30px}
        h1{color:#333;margin-bottom:16px}p{color:#666}</style></head>
        <body><div class="card"><div class="icon">${success ? '✓' : '✗'}</div><h1>${title}</h1><p>${resultMessage}</p></div></body></html>
      `);
    } catch (error) {
      console.error("Email action error:", error);
      return res.status(500).send(`
        <!DOCTYPE html>
        <html><head><title>Error</title>
        <style>body{font-family:Arial,sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background:#f5f5f5}
        .card{background:white;padding:40px;border-radius:8px;box-shadow:0 2px 10px rgba(0,0,0,0.1);text-align:center;max-width:400px}
        h1{color:#dc2626;margin-bottom:16px}p{color:#666}</style></head>
        <body><div class="card"><h1>Error</h1><p>An error occurred while processing your request. Please try again or use the admin panel.</p></div></body></html>
      `);
    }
  });

  // Email unsubscribe handler - processes unsubscribe links from promotional emails
  app.get("/api/unsubscribe/:token", async (req, res) => {
    try {
      const { token } = req.params;

      // Find the unsubscribe token
      const [tokenRecord] = await db
        .select()
        .from(emailUnsubscribeTokens)
        .where(eq(emailUnsubscribeTokens.token, token))
        .limit(1);

      if (!tokenRecord) {
        return res.status(400).send(`
          <!DOCTYPE html>
          <html><head><title>Invalid Unsubscribe Link</title>
          <style>body{font-family:Arial,sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background:#f5f5f5}
          .card{background:white;padding:40px;border-radius:8px;box-shadow:0 2px 10px rgba(0,0,0,0.1);text-align:center;max-width:400px}
          h1{color:#dc2626;margin-bottom:16px}p{color:#666}</style></head>
          <body><div class="card"><h1>Invalid Link</h1><p>This unsubscribe link is invalid. Please contact us if you need assistance.</p></div></body></html>
        `);
      }

      // Update user's email opt-in status
      await db.update(users)
        .set({ emailOptIn: false })
        .where(eq(users.id, tokenRecord.userId));

      console.log(`[Email Unsubscribe] User ${tokenRecord.userId} has unsubscribed from promotional emails`);

      return res.send(`
        <!DOCTYPE html>
        <html><head><title>Unsubscribed Successfully</title>
        <style>body{font-family:Arial,sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background:#f5f5f5}
        .card{background:white;padding:40px;border-radius:8px;box-shadow:0 2px 10px rgba(0,0,0,0.1);text-align:center;max-width:500px}
        .icon{width:60px;height:60px;border-radius:50%;background:#22c55e;color:white;display:flex;align-items:center;justify-content:center;margin:0 auto 20px;font-size:30px}
        h1{color:#333;margin-bottom:16px}p{color:#666}</style></head>
        <body><div class="card"><div class="icon">✓</div><h1>Unsubscribed Successfully</h1><p>You have been unsubscribed from promotional emails. You will still receive important order and account notifications.</p></div></body></html>
      `);
    } catch (error) {
      console.error("Unsubscribe error:", error);
      return res.status(500).send(`
        <!DOCTYPE html>
        <html><head><title>Error</title>
        <style>body{font-family:Arial,sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background:#f5f5f5}
        .card{background:white;padding:40px;border-radius:8px;box-shadow:0 2px 10px rgba(0,0,0,0.1);text-align:center;max-width:400px}
        h1{color:#dc2626;margin-bottom:16px}p{color:#666}</style></head>
        <body><div class="card"><h1>Error</h1><p>An error occurred while processing your request. Please try again.</p></div></body></html>
      `);
    }
  });

  // Check customer status by email (for registration flow)
  app.post("/api/auth/check-customer", async (req, res) => {
    try {
      const { email } = req.body;
      
      if (!email || typeof email !== 'string') {
        return res.status(400).json({ message: "Email is required" });
      }
      
      // Check if email already registered
      const existing = await storage.getUserByEmail(email);
      if (existing) {
        return res.status(400).json({ message: "Email already registered", alreadyRegistered: true });
      }
      
      // Check Zoho Books for customer status
      try {
        const zohoResult = await checkZohoCustomerByEmail(email);
        
        return res.json({
          found: zohoResult.found,
          active: zohoResult.active,
          customerId: zohoResult.customerId,
          customerName: zohoResult.customerName,
          companyName: zohoResult.companyName,
        });
      } catch (zohoError) {
        console.error("Zoho Books check failed:", zohoError);
        return res.status(503).json({ 
          message: "Unable to verify customer account. Please try again later.",
          zohoError: true
        });
      }
    } catch (error) {
      console.error("Check customer error:", error);
      res.status(500).json({ message: "Failed to check customer status" });
    }
  });

  // File upload for certificates (no auth required - used during registration)
  app.post("/api/upload/certificate", certificateUpload.single("file"), (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }
      
      // Return internal path for storage, not public URL
      // Files are served via protected admin endpoint only
      const fileUrl = `/api/admin/certificates/${req.file.filename}`;
      res.json({ url: fileUrl, filename: req.file.filename });
    } catch (error) {
      console.error("File upload error:", error);
      res.status(500).json({ message: "Failed to upload file" });
    }
  });

  // Protected admin-only endpoint to download/view certificates
  app.get("/api/admin/certificates/:filename", requireAdmin, (req, res) => {
    try {
      const { filename } = req.params;
      // Sanitize filename to prevent path traversal
      const sanitizedFilename = path.basename(filename);
      const filePath = path.join(process.cwd(), "uploads", "certificates", sanitizedFilename);
      
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ message: "Certificate not found" });
      }
      
      res.sendFile(filePath);
    } catch (error) {
      console.error("Certificate download error:", error);
      res.status(500).json({ message: "Failed to retrieve certificate" });
    }
  });

  // Register existing Zoho customer (auto-approved)
  app.post("/api/auth/register-existing", async (req, res) => {
    try {
      const { email, password, zohoCustomerId: providedCustomerId } = req.body;
      
      if (!email || !password || !providedCustomerId) {
        return res.status(400).json({ message: "Email, password, and customer ID are required" });
      }
      
      if (password.length < 8) {
        return res.status(400).json({ message: "Password must be at least 8 characters" });
      }
      
      // Check if email already exists
      const existing = await storage.getUserByEmail(email);
      if (existing) {
        return res.status(400).json({ message: "Email already registered" });
      }
      
      // Verify with Zoho Books
      let zohoResult;
      try {
        zohoResult = await checkZohoCustomerByEmail(email);
        
        if (!zohoResult.found) {
          return res.status(403).json({ message: "Customer not found in our system" });
        }
        
        if (!zohoResult.active) {
          return res.status(403).json({ message: "Customer account is inactive" });
        }
        
        // Verify the provided customer ID matches
        if (zohoResult.customerId !== providedCustomerId) {
          return res.status(403).json({ message: "Customer ID does not match our records" });
        }
      } catch (zohoError) {
        console.error("Zoho Books check failed:", zohoError);
        return res.status(503).json({ message: "Unable to verify customer account" });
      }
      
      // Create user with auto-approval (verified Zoho customer)
      const user = await storage.createUserAutoApproved({
        email,
        password,
        businessName: zohoResult.companyName || zohoResult.customerName,
        contactName: zohoResult.customerName,
      }, zohoResult.customerId!);
      
      // Set session
      req.session.userId = user.id;
      
      res.status(201).json({ user, autoApproved: true });
    } catch (error) {
      console.error("Register existing customer error:", error);
      res.status(500).json({ message: "Registration failed" });
    }
  });

  // Register new user (pending approval)
  app.post("/api/auth/register", async (req, res) => {
    try {
      const data = insertUserSchema.parse(req.body);
      
      // Check if email already exists
      const existing = await storage.getUserByEmail(data.email);
      if (existing) {
        return res.status(400).json({ message: "Email already registered" });
      }
      
      // Create user as pending (requires admin approval)
      const user = await storage.createUser(data);
      
      // Send admin notification email about new registration
      sendNewUserNotification(user.id).catch(err => {
        console.error("[Registration] Failed to send admin notification:", err);
      });
      
      // Set session
      req.session.userId = user.id;
      
      res.status(201).json({ user, pendingApproval: true });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Validation error", 
          errors: error.errors 
        });
      }
      console.error("Registration error:", error);
      res.status(500).json({ message: "Registration failed" });
    }
  });

  // Login
  app.post("/api/auth/login", async (req, res) => {
    try {
      const data = loginSchema.parse(req.body);
      
      const user = await storage.getUserByEmail(data.email);
      if (!user) {
        return res.status(401).json({ message: "Invalid email or password" });
      }
      
      const validPassword = await storage.validatePassword(data.password, user.password);
      if (!validPassword) {
        return res.status(401).json({ message: "Invalid email or password" });
      }
      
      // Check if user is suspended
      if (user.status === UserStatus.SUSPENDED) {
        return res.status(403).json({ message: "Account suspended. Contact support." });
      }
      
      // Check Zoho Books customer status (if user has zohoCustomerId)
      // Skip check for admin users
      if (user.role !== UserRole.ADMIN && user.zohoCustomerId) {
        try {
          const zohoResult = await checkZohoCustomerById(user.zohoCustomerId);
          
          if (!zohoResult.found || !zohoResult.active) {
            // Suspend the user in our system
            await storage.updateUserStatus(user.id, UserStatus.SUSPENDED);
            return res.status(403).json({ 
              message: "Your customer account is inactive. Your access has been suspended. Please contact support to reactivate your account.",
              zohoError: true
            });
          }
        } catch (zohoError) {
          // Log but don't block login if Zoho is temporarily unavailable
          console.error("Zoho Books check failed during login:", zohoError);
        }
      }
      
      // Update last login
      await storage.updateUserLastLogin(user.id);
      
      // Set session
      req.session.userId = user.id;
      
      res.json({ user: toSafeUser(user) });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Validation error", 
          errors: error.errors 
        });
      }
      console.error("Login error:", error);
      res.status(500).json({ message: "Login failed" });
    }
  });

  // Logout
  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        console.error("Logout error:", err);
        return res.status(500).json({ message: "Logout failed" });
      }
      res.clearCookie("connect.sid");
      res.json({ message: "Logged out successfully" });
    });
  });

  // Get current user
  app.get("/api/auth/me", async (req, res) => {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    
    const user = await storage.getUser(req.session.userId);
    if (!user) {
      req.session.destroy(() => {});
      return res.status(401).json({ message: "User not found" });
    }
    
    res.json({ user: toSafeUser(user) });
  });

  // ================================================================
  // ADMIN ROUTES
  // ================================================================

  // Admin: Get all users
  app.get("/api/admin/users", requireStaffOrAdmin, async (_req, res) => {
    try {
      const allUsers = await storage.getAllUsers();
      res.json({ users: allUsers });
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  // Admin: Get pending users
  app.get("/api/admin/users/pending", requireStaffOrAdmin, async (_req, res) => {
    try {
      const pendingUsers = await storage.getPendingUsers();
      res.json({ users: pendingUsers });
    } catch (error) {
      console.error("Error fetching pending users:", error);
      res.status(500).json({ message: "Failed to fetch pending users" });
    }
  });

  // Admin: Approve user
  // For NEW customers without Zoho ID: creates customer in Zoho Books first
  // For existing Zoho customers: just approves (they already have zohoCustomerId)
  app.post("/api/admin/users/:id/approve", requireStaffOrAdmin, async (req, res) => {
    try {
      const id = req.params.id as string;
      
      const user = await storage.getUser(id);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      if (user.status === UserStatus.APPROVED) {
        return res.status(400).json({ message: "User is already approved" });
      }
      
      // If user doesn't have a Zoho customer ID, create them in Zoho Books
      if (!user.zohoCustomerId) {
        console.log(`[Admin Approve] Creating new customer in Zoho Books for user ${id}`);
        
        const zohoResult = await createZohoCustomer({
          email: user.email,
          contactName: user.contactName || user.businessName || user.email,
          companyName: user.businessName || undefined,
          phone: user.phone || undefined,
          address: user.address || undefined,
          city: user.city || undefined,
          state: user.state || undefined,
          zipCode: user.zipCode || undefined,
        });
        
        if (!zohoResult.success) {
          console.error(`[Admin Approve] Failed to create Zoho customer: ${zohoResult.message}`);
          
          // Create a retry job
          await storage.createJob({
            jobType: JobType.CREATE_ZOHO_CUSTOMER,
            userId: id,
            payload: JSON.stringify({ 
              email: user.email,
              contactName: user.contactName,
              companyName: user.businessName,
              phone: user.phone,
              address: user.address,
              city: user.city,
              state: user.state,
              zipCode: user.zipCode
            })
          });
          
          return res.status(500).json({ 
            message: `Failed to create customer in Zoho Books: ${zohoResult.message}. A retry job has been created.`,
            zohoError: true
          });
        }
        
        // Save the Zoho customer ID
        await storage.updateUserZohoCustomerId(id, zohoResult.customerId!);
        console.log(`[Admin Approve] Zoho customer created: ${zohoResult.customerId}`);
      }
      
      // Approve the user
      const updatedUser = await storage.updateUserStatus(id, UserStatus.APPROVED, UserRole.CUSTOMER);
      res.json({ user: updatedUser, message: "User approved successfully" });
    } catch (error) {
      console.error("Error approving user:", error);
      res.status(500).json({ message: "Failed to approve user" });
    }
  });

  // Admin: Reject user
  app.post("/api/admin/users/:id/reject", requireStaffOrAdmin, async (req, res) => {
    try {
      const id = req.params.id as string;
      
      const user = await storage.getUser(id);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      const updatedUser = await storage.updateUserStatus(id, UserStatus.REJECTED);
      res.json({ user: updatedUser, message: "User rejected" });
    } catch (error) {
      console.error("Error rejecting user:", error);
      res.status(500).json({ message: "Failed to reject user" });
    }
  });

  // Admin: Suspend user
  app.post("/api/admin/users/:id/suspend", requireAdmin, async (req, res) => {
    try {
      const id = req.params.id as string;
      
      const user = await storage.getUser(id);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      if (user.role === UserRole.ADMIN) {
        return res.status(400).json({ message: "Cannot suspend admin users" });
      }
      
      const updatedUser = await storage.updateUserStatus(id, UserStatus.SUSPENDED);
      res.json({ user: updatedUser, message: "User suspended" });
    } catch (error) {
      console.error("Error suspending user:", error);
      res.status(500).json({ message: "Failed to suspend user" });
    }
  });

  // Admin: Reactivate user
  app.post("/api/admin/users/:id/reactivate", requireAdmin, async (req, res) => {
    try {
      const id = req.params.id as string;
      
      const user = await storage.getUser(id);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // Reactivate sets both status to approved and role to customer
      const updatedUser = await storage.updateUserStatus(id, UserStatus.APPROVED, UserRole.CUSTOMER);
      res.json({ user: updatedUser, message: "User reactivated" });
    } catch (error) {
      console.error("Error reactivating user:", error);
      res.status(500).json({ message: "Failed to reactivate user" });
    }
  });

  // Admin: Create admin or staff user
  app.post("/api/admin/users/staff", requireAdmin, async (req, res) => {
    try {
      const data = insertAdminStaffSchema.parse(req.body);
      
      // Check if email already exists
      const existing = await storage.getUserByEmail(data.email);
      if (existing) {
        return res.status(400).json({ message: "Email already registered" });
      }
      
      const user = await storage.createAdminOrStaff(data);
      res.status(201).json({ user, message: `${data.role.charAt(0).toUpperCase() + data.role.slice(1)} user created successfully` });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Validation error", 
          errors: error.errors 
        });
      }
      console.error("Error creating admin/staff user:", error);
      res.status(500).json({ message: "Failed to create user" });
    }
  });

  // Admin: Delete admin or staff user
  app.delete("/api/admin/users/:id", requireAdmin, async (req, res) => {
    try {
      const id = req.params.id as string;
      const currentUser = req.session.userId;
      
      // Prevent self-deletion
      if (id === currentUser) {
        return res.status(400).json({ message: "Cannot delete your own account" });
      }
      
      const user = await storage.getUser(id);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // Only allow deleting admin or staff users
      if (user.role !== UserRole.ADMIN && user.role !== UserRole.STAFF) {
        return res.status(400).json({ message: "Can only delete admin or staff users. Use suspend for customers." });
      }
      
      const deleted = await storage.deleteUser(id);
      if (deleted) {
        res.json({ message: "User deleted successfully" });
      } else {
        res.status(500).json({ message: "Failed to delete user" });
      }
    } catch (error) {
      console.error("Error deleting user:", error);
      res.status(500).json({ message: "Failed to delete user" });
    }
  });

  // Admin: Create initial admin user (only works if no admins exist and ALLOW_ADMIN_SETUP is true)
  app.post("/api/admin/setup", async (req, res) => {
    try {
      // Only allow admin setup if explicitly enabled
      if (process.env.ALLOW_ADMIN_SETUP !== "true") {
        return res.status(403).json({ message: "Admin setup is disabled" });
      }
      
      // Check if any admin exists
      const [existingAdmin] = await db.select()
        .from(users)
        .where(eq(users.role, UserRole.ADMIN))
        .limit(1);
      
      if (existingAdmin) {
        return res.status(400).json({ message: "Admin already exists" });
      }
      
      const data = insertUserSchema.parse(req.body);
      
      // Check if email already exists
      const existing = await storage.getUserByEmail(data.email);
      if (existing) {
        return res.status(400).json({ message: "Email already registered" });
      }
      
      // Create admin user
      const hashedPassword = await storage.hashPassword(data.password);
      const [adminUser] = await db.insert(users).values({
        email: data.email.toLowerCase(),
        password: hashedPassword,
        businessName: data.businessName || "Admin",
        contactName: data.contactName,
        phone: data.phone,
        role: UserRole.ADMIN,
        status: UserStatus.APPROVED,
      }).returning();
      
      // Set session
      req.session.userId = adminUser.id;
      
      res.status(201).json({ user: toSafeUser(adminUser) });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Validation error", 
          errors: error.errors 
        });
      }
      console.error("Admin setup error:", error);
      res.status(500).json({ message: "Admin setup failed" });
    }
  });

  // ================================================================
  // CATEGORY ROUTES
  // ================================================================

  // Get all categories (synced from Zoho)
  app.get("/api/categories", async (req, res) => {
    try {
      const categories = await storage.getCategories();
      res.json({ categories });
    } catch (error) {
      console.error("Error fetching categories:", error);
      res.status(500).json({ message: "Failed to fetch categories" });
    }
  });

  // ================================================================
  // PRODUCT ROUTES
  // ================================================================

  // Get all products (with optional filters and customer pricing)
  app.get("/api/products", async (req, res) => {
    try {
      const { category, search, sortBy, sortOrder, limit, page } = req.query;
      
      // Default to 12 products per page for storefront display
      const pageSize = limit ? parseInt(limit as string, 10) : 12;
      const pageNum = page ? parseInt(page as string, 10) : 1;
      const offset = (pageNum - 1) * pageSize;
      
      // Use consolidated products for storefront - groups appear as single tiles
      const result = await storage.getConsolidatedProducts({
        category: category as string | undefined,
        search: search as string | undefined,
        sortBy: sortBy as string | undefined,
        sortOrder: sortOrder as string | undefined,
        limit: pageSize,
        offset
      });
      
      // Apply customer-specific pricing if user has a price list
      let productsWithPricing = result.products;
      let userPriceListId: string | null = null;
      
      if (req.session?.userId) {
        const user = await storage.getUser(req.session.userId);
        if (user?.priceListId) {
          userPriceListId = user.priceListId;
          // Get customer prices for all products in this batch
          const customerPriceMap = await storage.getCustomerPricesForProducts(
            user.priceListId,
            result.products.map(p => p.id)
          );
          
          // Add customer price to each product
          productsWithPricing = result.products.map(product => ({
            ...product,
            customerPrice: customerPriceMap[product.id] || null,
          }));
        }
      }
      
      const totalPages = Math.ceil(result.totalCount / pageSize);
      
      res.json({ 
        products: productsWithPricing,
        pagination: {
          page: pageNum,
          pageSize,
          totalCount: result.totalCount,
          totalPages
        },
        priceListId: userPriceListId,
      });
    } catch (error) {
      console.error("Error fetching products:", error);
      res.status(500).json({ message: "Failed to fetch products" });
    }
  });

  // Get top selling products from the last 3 months
  app.get("/api/products/top-sellers", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 24;
      const topSellers = await storage.getTopSellingProducts(Math.min(limit, 24));
      res.json({ products: topSellers });
    } catch (error) {
      console.error("[API] Error fetching top sellers:", error);
      res.status(500).json({ message: "Failed to fetch top sellers" });
    }
  });

  // Get products by group ID (for variant products) - must be before :id route
  app.get("/api/products/group/:groupId", async (req, res) => {
    try {
      const groupProducts = await storage.getProductsByGroupId(req.params.groupId);
      
      // Apply customer-specific pricing if user has a price list
      let productsWithPricing = groupProducts;
      
      if (req.session?.userId) {
        const user = await storage.getUser(req.session.userId);
        if (user?.priceListId) {
          const customerPriceMap = await storage.getCustomerPricesForProducts(
            user.priceListId,
            groupProducts.map(p => p.id)
          );
          
          productsWithPricing = groupProducts.map(product => ({
            ...product,
            customerPrice: customerPriceMap[product.id] || null,
          }));
        }
      }
      
      res.json({ products: productsWithPricing });
    } catch (error) {
      console.error("Error fetching products by group:", error);
      res.status(500).json({ message: "Failed to fetch group products" });
    }
  });

  // Get single product
  app.get("/api/products/:id", async (req, res) => {
    try {
      const product = await storage.getProduct(req.params.id);
      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }
      res.json({ product });
    } catch (error) {
      console.error("Error fetching product:", error);
      res.status(500).json({ message: "Failed to fetch product" });
    }
  });

  // Get product image from Zoho (proxy endpoint)
  app.get("/api/products/:id/image", async (req, res) => {
    try {
      // Use getProductInternal to include offline products for images
      const product = await storage.getProductInternal(req.params.id);
      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }
      
      if (!product.zohoItemId) {
        return res.status(404).json({ message: "No Zoho item linked" });
      }
      
      const imageData = await fetchZohoProductImage(product.zohoItemId);
      if (!imageData) {
        return res.status(404).json({ message: "No image available" });
      }
      
      // Set caching headers for 1 hour
      res.set({
        "Content-Type": imageData.contentType,
        "Cache-Control": "public, max-age=3600",
        "ETag": `"${product.zohoItemId}"`,
      });
      
      res.send(imageData.data);
    } catch (error) {
      console.error("Error fetching product image:", error);
      res.status(500).json({ message: "Failed to fetch product image" });
    }
  });

  // Get product categories
  app.get("/api/categories", (_req, res) => {
    res.json({ 
      categories: Object.values(ProductCategory).map(cat => ({
        value: cat,
        label: cat.charAt(0).toUpperCase() + cat.slice(1)
      }))
    });
  });

  // ================================================================
  // CART ROUTES (Authenticated users only)
  // ================================================================

  // Get current user's cart
  app.get("/api/cart", requireAuth, async (req, res) => {
    try {
      const cart = await storage.getOrCreateCart(req.session.userId!);
      const items = await storage.getCartItems(cart.id);
      res.json({ cart, items });
    } catch (error) {
      console.error("Error fetching cart:", error);
      res.status(500).json({ message: "Failed to fetch cart" });
    }
  });

  // Add item to cart
  app.post("/api/cart/items", requireAuth, async (req, res) => {
    try {
      const data = insertCartItemSchema.parse(req.body);
      const cart = await storage.getOrCreateCart(req.session.userId!);
      const cartItem = await storage.addToCart(cart.id, data.productId, data.quantity);
      const updatedCart = await storage.getCart(req.session.userId!);
      res.status(201).json({ cartItem, cart: updatedCart });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      console.error("Error adding to cart:", error);
      const message = error instanceof Error ? error.message : "Failed to add to cart";
      res.status(400).json({ message });
    }
  });

  // Update cart item quantity
  app.patch("/api/cart/items/:id", requireAuth, async (req, res) => {
    try {
      const { quantity } = req.body;
      if (typeof quantity !== 'number' || quantity < 1) {
        return res.status(400).json({ message: "Invalid quantity" });
      }
      
      const cart = await storage.getCart(req.session.userId!);
      if (!cart) {
        return res.status(404).json({ message: "Cart not found" });
      }
      
      const existingItem = await storage.getCartItem(req.params.id as string);
      if (!existingItem || existingItem.cartId !== cart.id) {
        return res.status(403).json({ message: "Not authorized to modify this item" });
      }
      
      const cartItem = await storage.updateCartItem(req.params.id as string, quantity);
      if (!cartItem) {
        return res.status(404).json({ message: "Cart item not found" });
      }
      res.json({ cartItem, cart });
    } catch (error) {
      console.error("Error updating cart item:", error);
      res.status(500).json({ message: "Failed to update cart item" });
    }
  });

  // Remove item from cart
  app.delete("/api/cart/items/:id", requireAuth, async (req, res) => {
    try {
      const cart = await storage.getCart(req.session.userId!);
      if (!cart) {
        return res.status(404).json({ message: "Cart not found" });
      }
      
      const existingItem = await storage.getCartItem(req.params.id as string);
      if (!existingItem || existingItem.cartId !== cart.id) {
        return res.status(403).json({ message: "Not authorized to remove this item" });
      }
      
      await storage.removeCartItem(req.params.id as string);
      res.json({ message: "Item removed", cart });
    } catch (error) {
      console.error("Error removing cart item:", error);
      res.status(500).json({ message: "Failed to remove cart item" });
    }
  });

  // Clear cart
  app.delete("/api/cart", requireAuth, async (req, res) => {
    try {
      const cart = await storage.getCart(req.session.userId!);
      if (cart) {
        await storage.clearCart(cart.id);
      }
      res.json({ message: "Cart cleared" });
    } catch (error) {
      console.error("Error clearing cart:", error);
      res.status(500).json({ message: "Failed to clear cart" });
    }
  });

  // Bulk import to cart from CSV data
  app.post("/api/cart/bulk-import", requireAuth, async (req, res) => {
    try {
      const { items } = req.body;
      
      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ message: "Items array is required" });
      }
      
      if (items.length > 100) {
        return res.status(400).json({ message: "Maximum 100 items per import" });
      }
      
      const cart = await storage.getOrCreateCart(req.session.userId!);
      const results: { 
        success: { sku: string; quantity: number; productName: string }[];
        failed: { sku: string; quantity: number; reason: string }[];
      } = { success: [], failed: [] };
      
      for (const item of items) {
        const { sku, quantity } = item;
        
        if (!sku || typeof sku !== 'string') {
          results.failed.push({ sku: sku || 'unknown', quantity, reason: 'Invalid SKU' });
          continue;
        }
        
        const qty = parseInt(String(quantity), 10);
        if (isNaN(qty) || qty < 1) {
          results.failed.push({ sku, quantity, reason: 'Invalid quantity (must be positive number)' });
          continue;
        }
        
        const product = await storage.getProductBySku(sku.trim());
        if (!product) {
          results.failed.push({ sku, quantity: qty, reason: 'Product not found' });
          continue;
        }
        
        if (!product.isOnline) {
          results.failed.push({ sku, quantity: qty, reason: 'Product not available' });
          continue;
        }
        
        if (product.stockQuantity <= 0) {
          results.failed.push({ sku, quantity: qty, reason: 'Out of stock' });
          continue;
        }
        
        if (qty > product.stockQuantity) {
          results.failed.push({ sku, quantity: qty, reason: `Only ${product.stockQuantity} in stock` });
          continue;
        }
        
        try {
          await storage.addToCart(cart.id, product.id, qty);
          results.success.push({ sku, quantity: qty, productName: product.name });
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Failed to add';
          results.failed.push({ sku, quantity: qty, reason: message });
        }
      }
      
      const updatedCart = await storage.getCartWithItems(req.session.userId!);
      
      res.json({
        message: `Imported ${results.success.length} items, ${results.failed.length} failed`,
        results,
        cart: updatedCart
      });
    } catch (error) {
      console.error("Bulk import error:", error);
      res.status(500).json({ message: "Failed to import items" });
    }
  });

  // ================================================================
  // ORDER ROUTES
  // ================================================================

  // Create order from cart (checkout)
  app.post("/api/orders", requireAuth, async (req, res) => {
    try {
      const data = createOrderSchema.parse(req.body);
      const order = await storage.createOrder(req.session.userId!, {
        address: data.shippingAddress,
        city: data.shippingCity,
        state: data.shippingState,
        zipCode: data.shippingZipCode
      });
      
      // Send admin notification email about new order
      sendNewOrderNotification(order.id).catch(err => {
        console.error("[Order] Failed to send admin notification:", err);
      });
      
      res.status(201).json({ order });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      if (error instanceof Error) {
        return res.status(400).json({ message: error.message });
      }
      console.error("Error creating order:", error);
      res.status(500).json({ message: "Failed to create order" });
    }
  });

  // Get user's orders
  app.get("/api/orders", requireAuth, async (req, res) => {
    try {
      const orderList = await storage.getUserOrders(req.session.userId!);
      res.json({ orders: orderList });
    } catch (error) {
      console.error("Error fetching orders:", error);
      res.status(500).json({ message: "Failed to fetch orders" });
    }
  });

  // Get single order with items
  app.get("/api/orders/:id", requireAuth, async (req, res) => {
    try {
      const orderData = await storage.getOrderWithItems(req.params.id as string);
      if (!orderData) {
        return res.status(404).json({ message: "Order not found" });
      }
      // Ensure user owns this order or is admin
      const user = await storage.getUser(req.session.userId!);
      if (orderData.order.userId !== req.session.userId && user?.role !== UserRole.ADMIN) {
        return res.status(403).json({ message: "Access denied" });
      }
      res.json(orderData);
    } catch (error) {
      console.error("Error fetching order:", error);
      res.status(500).json({ message: "Failed to fetch order" });
    }
  });

  // ================================================================
  // USER PROFILE ROUTES
  // ================================================================

  // Get user profile
  app.get("/api/user/profile", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      res.json({ user });
    } catch (error) {
      console.error("Error fetching user profile:", error);
      res.status(500).json({ message: "Failed to fetch profile" });
    }
  });

  // Submit profile update request
  app.post("/api/user/profile/update-request", requireAuth, async (req, res) => {
    try {
      const { businessName, contactName, phone, address, city, state, zipCode } = req.body;
      
      // Store pending profile data
      const pendingData = { businessName, contactName, phone, address, city, state, zipCode };
      
      await storage.updateUser(req.session.userId!, {
        profileUpdatePending: true,
        pendingProfileData: pendingData,
      });
      
      // Send email notification to admin
      try {
        const emailService = await import("./email-service");
        const user = await storage.getUser(req.session.userId!);
        await emailService.sendProfileUpdateNotification(user!, pendingData);
      } catch (emailError) {
        console.error("[API] Failed to send profile update notification:", emailError);
      }
      
      res.json({ message: "Profile update request submitted for approval" });
    } catch (error) {
      console.error("Error submitting profile update:", error);
      res.status(500).json({ message: "Failed to submit profile update" });
    }
  });

  // Contact form submission
  app.post("/api/contact", async (req, res) => {
    try {
      const { name, email, subject, message } = req.body;
      
      if (!subject?.trim() || !message?.trim()) {
        return res.status(400).json({ message: "Subject and message are required" });
      }
      
      // Send email notification
      try {
        const emailService = await import("./email-service");
        await emailService.sendContactFormEmail({ name, email, subject, message });
      } catch (emailError) {
        console.error("[API] Failed to send contact form email:", emailError);
      }
      
      res.json({ message: "Message sent successfully" });
    } catch (error) {
      console.error("Error sending contact form:", error);
      res.status(500).json({ message: "Failed to send message" });
    }
  });

  // ================================================================
  // ADMIN ORDER ROUTES
  // ================================================================

  // Get all orders (admin only)
  app.get("/api/admin/orders", requireStaffOrAdmin, async (_req, res) => {
    try {
      const orderList = await storage.getAllOrders();
      res.json({ orders: orderList });
    } catch (error) {
      console.error("Error fetching orders:", error);
      res.status(500).json({ message: "Failed to fetch orders" });
    }
  });

  // Get all active shopping carts (admin/staff)
  app.get("/api/admin/active-carts", requireStaffOrAdmin, async (_req, res) => {
    try {
      const activeCarts = await storage.getAllActiveCarts();
      res.json({ carts: activeCarts });
    } catch (error) {
      console.error("Error fetching active carts:", error);
      res.status(500).json({ message: "Failed to fetch active carts" });
    }
  });

  // Approve order
  app.post("/api/admin/orders/:id/approve", requireStaffOrAdmin, async (req, res) => {
    try {
      // Get order with items
      const orderData = await storage.getOrderWithItems(req.params.id as string);
      if (!orderData) {
        return res.status(404).json({ message: "Order not found" });
      }

      // Update order status first
      const order = await storage.updateOrderStatus(req.params.id as string, OrderStatus.APPROVED, req.session.userId!);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      // Get customer to check for Zoho customer ID
      const customer = await storage.getUser(order.userId);
      if (!customer?.zohoCustomerId) {
        console.log(`[Order Approve] Customer ${order.userId} has no Zoho customer ID, skipping Zoho push`);
        return res.json({ order, message: "Order approved (not pushed to Zoho - no customer ID)" });
      }

      // Build line items for Zoho
      const lineItems: ZohoLineItem[] = [];
      for (const item of orderData.items) {
        if (!item.product.zohoItemId) {
          console.log(`[Order Approve] Product ${item.product.sku} has no Zoho item ID, skipping`);
          continue;
        }
        lineItems.push({
          item_id: item.product.zohoItemId,
          quantity: item.quantity,
          rate: parseFloat(item.unitPrice),
          name: item.productName,
          sku: item.sku,
        });
      }

      if (lineItems.length === 0) {
        console.log(`[Order Approve] No valid Zoho items found, skipping Zoho push`);
        return res.json({ order, message: "Order approved (not pushed to Zoho - no mapped products)" });
      }

      // Push to Zoho Books
      const zohoResult = await createZohoSalesOrder({
        customerId: customer.zohoCustomerId,
        orderNumber: order.orderNumber,
        lineItems,
        shippingAddress: order.shippingAddress || undefined,
        shippingCity: order.shippingCity || undefined,
        shippingState: order.shippingState || undefined,
        shippingZipCode: order.shippingZipCode || undefined,
        notes: `Web order from ${customer.businessName || customer.email}`,
      });

      if (zohoResult.success && zohoResult.salesOrderId) {
        await storage.updateOrderZohoInfo(order.id, zohoResult.salesOrderId);
        console.log(`[Order Approve] Order ${order.orderNumber} pushed to Zoho as ${zohoResult.salesOrderNumber}`);
        res.json({ 
          order: { ...order, zohoSalesOrderId: zohoResult.salesOrderId }, 
          zohoSalesOrderNumber: zohoResult.salesOrderNumber,
          message: "Order approved and pushed to Zoho Books" 
        });
      } else {
        console.error(`[Order Approve] Failed to push to Zoho: ${zohoResult.message}`);
        
        // Create a retry job for the failed Zoho push
        await storage.createJob({
          jobType: JobType.PUSH_ORDER_TO_ZOHO,
          orderId: order.id,
          userId: customer.id,
          payload: JSON.stringify({
            customerId: customer.zohoCustomerId,
            orderNumber: order.orderNumber,
            lineItems,
            shippingAddress: order.shippingAddress,
            shippingCity: order.shippingCity,
            shippingState: order.shippingState,
            shippingZipCode: order.shippingZipCode,
            notes: `Web order from ${customer.businessName || customer.email}`,
          })
        });
        
        // Update order status to indicate Zoho push failed
        await storage.updateOrderStatus(order.id, OrderStatus.PROCESSING, req.session.userId!);
        
        res.json({ 
          order, 
          message: `Order approved but Zoho push failed: ${zohoResult.message}. A retry job has been created.`,
          zohoError: true
        });
      }
    } catch (error) {
      console.error("Error approving order:", error);
      res.status(500).json({ message: "Failed to approve order" });
    }
  });

  // Reject order
  app.post("/api/admin/orders/:id/reject", requireStaffOrAdmin, async (req, res) => {
    try {
      const { reason } = req.body;
      const order = await storage.updateOrderStatus(req.params.id as string, OrderStatus.REJECTED, req.session.userId!, reason);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }
      res.json({ order, message: "Order rejected" });
    } catch (error) {
      console.error("Error rejecting order:", error);
      res.status(500).json({ message: "Failed to reject order" });
    }
  });

  // Update order status
  app.patch("/api/admin/orders/:id/status", requireStaffOrAdmin, async (req, res) => {
    try {
      const { status } = req.body;
      const validStatuses = Object.values(OrderStatus);
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ message: "Invalid status" });
      }
      const order = await storage.updateOrderStatus(req.params.id as string, status, req.session.userId!);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }
      res.json({ order, message: "Order status updated" });
    } catch (error) {
      console.error("Error updating order status:", error);
      res.status(500).json({ message: "Failed to update order status" });
    }
  });

  // ================================================================
  // SEED PRODUCTS (Admin only - for demo)
  // ================================================================

  app.post("/api/admin/seed-products", requireAdmin, async (_req, res) => {
    try {
      // Check if products already exist (include offline products in check)
      const existing = await storage.getProducts({ includeOffline: true });
      if (existing.products.length > 0) {
        return res.status(400).json({ message: "Products already seeded" });
      }

      // NOTE: isOnline field maps to Zoho Inventory's "Show in Online Store" toggle
      // Most products are online=true, some are false to verify filtering works
      const sampleProducts = [
        // Sunglasses
        { sku: "SG-001", name: "Classic Aviator Sunglasses", description: "Timeless aviator style with UV400 protection", category: "sunglasses", brand: "SunStyle", basePrice: "8.50", compareAtPrice: "24.99", stockQuantity: 500, minOrderQuantity: 12, casePackSize: 12, imageUrl: "https://images.unsplash.com/photo-1572635196237-14b3f281503f?w=400", isOnline: true },
        { sku: "SG-002", name: "Wayfarer Sport Sunglasses", description: "Modern wayfarer design for active lifestyles", category: "sunglasses", brand: "SunStyle", basePrice: "6.75", compareAtPrice: "19.99", stockQuantity: 350, minOrderQuantity: 12, casePackSize: 12, imageUrl: "https://images.unsplash.com/photo-1511499767150-a48a237f0083?w=400", isOnline: true },
        { sku: "SG-003", name: "Oversized Fashion Sunglasses", description: "Bold oversized frames for fashion-forward customers", category: "sunglasses", brand: "GlamShade", basePrice: "7.25", compareAtPrice: "22.99", stockQuantity: 280, minOrderQuantity: 12, casePackSize: 12, imageUrl: "https://images.unsplash.com/photo-1577803645773-f96470509666?w=400", isOnline: false },
        { sku: "SG-004", name: "Polarized Driving Sunglasses", description: "Premium polarized lenses for reduced glare", category: "sunglasses", brand: "DriveVision", basePrice: "12.50", compareAtPrice: "34.99", stockQuantity: 200, minOrderQuantity: 6, casePackSize: 6, imageUrl: "https://images.unsplash.com/photo-1508296695146-257a814070b4?w=400", isOnline: true },
        
        // Cellular
        { sku: "CE-001", name: "Universal Phone Charger Cable 3ft", description: "Durable braided USB-C cable, fast charging", category: "cellular", brand: "TechCharge", basePrice: "2.25", compareAtPrice: "9.99", stockQuantity: 1000, minOrderQuantity: 24, casePackSize: 24, imageUrl: "https://images.unsplash.com/photo-1583394838336-acd977736f90?w=400", isOnline: true },
        { sku: "CE-002", name: "Car Phone Mount", description: "360-degree rotation, dashboard and vent compatible", category: "cellular", brand: "TechCharge", basePrice: "4.50", compareAtPrice: "14.99", stockQuantity: 400, minOrderQuantity: 12, casePackSize: 12, imageUrl: "https://images.unsplash.com/photo-1586253634026-8cb574908d1e?w=400", isOnline: true },
        { sku: "CE-003", name: "Wireless Earbuds Basic", description: "Bluetooth 5.0, 4-hour battery life", category: "cellular", brand: "SoundPods", basePrice: "8.99", compareAtPrice: "29.99", stockQuantity: 300, minOrderQuantity: 6, casePackSize: 6, imageUrl: "https://images.unsplash.com/photo-1590658268037-6bf12165a8df?w=400", isOnline: true },
        { sku: "CE-004", name: "Clear Phone Case Universal", description: "Shock-absorbing clear case, fits most phones", category: "cellular", brand: "CasePro", basePrice: "1.75", compareAtPrice: "7.99", stockQuantity: 800, minOrderQuantity: 48, casePackSize: 48, imageUrl: "https://images.unsplash.com/photo-1601784551446-20c9e07cdbdb?w=400", isOnline: true },
        { sku: "CE-005", name: "Portable Power Bank 5000mAh", description: "Compact power bank with dual USB ports", category: "cellular", brand: "TechCharge", basePrice: "6.50", compareAtPrice: "19.99", stockQuantity: 250, minOrderQuantity: 12, casePackSize: 12, imageUrl: "https://images.unsplash.com/photo-1609091839311-d5365f9ff1c5?w=400", isOnline: true },
        
        // Caps
        { sku: "CA-001", name: "Classic Baseball Cap - Black", description: "Adjustable cotton twill baseball cap", category: "caps", brand: "HeadStyle", basePrice: "3.25", compareAtPrice: "12.99", stockQuantity: 600, minOrderQuantity: 24, casePackSize: 24, imageUrl: "https://images.unsplash.com/photo-1588850561407-ed78c282e89b?w=400", isOnline: true },
        { sku: "CA-002", name: "Trucker Mesh Cap - Assorted", description: "Breathable mesh back, foam front", category: "caps", brand: "HeadStyle", basePrice: "2.75", compareAtPrice: "9.99", stockQuantity: 500, minOrderQuantity: 24, casePackSize: 24, imageUrl: "https://images.unsplash.com/photo-1521369909029-2afed882baee?w=400", isOnline: true },
        { sku: "CA-003", name: "Knit Beanie - Winter", description: "Warm acrylic knit beanie, one size fits most", category: "caps", brand: "WarmHead", basePrice: "2.50", compareAtPrice: "8.99", stockQuantity: 400, minOrderQuantity: 24, casePackSize: 24, imageUrl: "https://images.unsplash.com/photo-1576871337622-98d48d1cf531?w=400", isOnline: true },
        { sku: "CA-004", name: "Sports Performance Cap", description: "Moisture-wicking fabric, curved bill", category: "caps", brand: "ActiveWear", basePrice: "4.50", compareAtPrice: "15.99", stockQuantity: 300, minOrderQuantity: 12, casePackSize: 12, imageUrl: "https://images.unsplash.com/photo-1534215754734-18e55d13e346?w=400", isOnline: true },
        
        // Perfumes
        { sku: "PF-001", name: "Fresh Ocean Body Spray", description: "Light, refreshing ocean-inspired fragrance", category: "perfumes", brand: "ScentWave", basePrice: "3.99", compareAtPrice: "12.99", stockQuantity: 350, minOrderQuantity: 12, casePackSize: 12, imageUrl: "https://images.unsplash.com/photo-1594035910387-fea47794261f?w=400", isOnline: true },
        { sku: "PF-002", name: "Midnight Musk Cologne", description: "Bold masculine fragrance with woody notes", category: "perfumes", brand: "DarkScent", basePrice: "5.50", compareAtPrice: "18.99", stockQuantity: 250, minOrderQuantity: 12, casePackSize: 12, imageUrl: "https://images.unsplash.com/photo-1541643600914-78b084683601?w=400", isOnline: true },
        { sku: "PF-003", name: "Floral Garden Perfume", description: "Sweet floral bouquet, long-lasting", category: "perfumes", brand: "BloomScent", basePrice: "4.75", compareAtPrice: "15.99", stockQuantity: 300, minOrderQuantity: 12, casePackSize: 12, imageUrl: "https://images.unsplash.com/photo-1588405748880-12d1d2a59f75?w=400", isOnline: true },
        { sku: "PF-004", name: "Citrus Burst Body Mist", description: "Energizing citrus fragrance, great for summer", category: "perfumes", brand: "FreshScent", basePrice: "3.25", compareAtPrice: "10.99", stockQuantity: 400, minOrderQuantity: 12, casePackSize: 12, imageUrl: "https://images.unsplash.com/photo-1592945403244-b3fbafd7f539?w=400", isOnline: true },
        
        // Novelty
        { sku: "NV-001", name: "Pine Tree Air Freshener 3-Pack", description: "Classic pine scent car air fresheners", category: "novelty", brand: "FreshRide", basePrice: "0.99", compareAtPrice: "3.99", stockQuantity: 1000, minOrderQuantity: 48, casePackSize: 48, imageUrl: "https://images.unsplash.com/photo-1600298881974-6be191ceeda1?w=400", isOnline: true },
        { sku: "NV-002", name: "LED Keychain Flashlight", description: "Compact LED flashlight with keyring", category: "novelty", brand: "LightUp", basePrice: "1.25", compareAtPrice: "4.99", stockQuantity: 700, minOrderQuantity: 36, casePackSize: 36, imageUrl: "https://images.unsplash.com/photo-1506792006437-256b665541e2?w=400", isOnline: true },
        { sku: "NV-003", name: "Lucky Dice Mirror Hanger", description: "Fuzzy dice in assorted colors", category: "novelty", brand: "FunStuff", basePrice: "1.50", compareAtPrice: "5.99", stockQuantity: 400, minOrderQuantity: 24, casePackSize: 24, imageUrl: "https://images.unsplash.com/photo-1551431009-a802eeec77b1?w=400", isOnline: false },
        { sku: "NV-004", name: "Phone Grip Pop Socket", description: "Expandable grip and stand for phones", category: "novelty", brand: "GripIt", basePrice: "1.75", compareAtPrice: "6.99", stockQuantity: 600, minOrderQuantity: 24, casePackSize: 24, imageUrl: "https://images.unsplash.com/photo-1556656793-08538906a9f8?w=400", isOnline: true },
        { sku: "NV-005", name: "Scratch-Off Lottery Ticket Holder", description: "Keychain scratcher with coin edge", category: "novelty", brand: "LuckyCharm", basePrice: "0.75", compareAtPrice: "2.99", stockQuantity: 900, minOrderQuantity: 48, casePackSize: 48, imageUrl: "https://images.unsplash.com/photo-1518458028785-8fbcd101ebb9?w=400", isOnline: true },
      ];

      for (const product of sampleProducts) {
        await storage.createProduct(product);
      }

      res.status(201).json({ message: `Seeded ${sampleProducts.length} products successfully` });
    } catch (error) {
      console.error("Error seeding products:", error);
      res.status(500).json({ message: "Failed to seed products" });
    }
  });

  // ================================================================
  // AI FEATURES
  // ================================================================

  // AI Cart Builder - build a cart from natural language
  app.post("/api/ai/cart-builder", requireAuth, async (req, res) => {
    try {
      const { prompt } = req.body;
      
      if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
        return res.status(400).json({ message: "Please provide a description of what you're looking for" });
      }

      const userId = req.session.userId || null;
      const result = await aiCartBuilder(userId, prompt.trim());
      
      res.json(result);
    } catch (error) {
      console.error("AI Cart Builder error:", error);
      res.status(500).json({ message: "AI assistant is temporarily unavailable. Please try again." });
    }
  });

  // AI Enhanced Search - semantic product search (POST)
  app.post("/api/ai/search", requireAuth, async (req, res) => {
    try {
      const { query, category } = req.body;
      
      if (!query || typeof query !== 'string' || query.trim().length === 0) {
        return res.status(400).json({ message: "Please provide a search query" });
      }

      const userId = req.session.userId || null;
      const result = await aiEnhancedSearch(userId, query.trim(), category);
      
      res.json(result);
    } catch (error) {
      console.error("AI Search error:", error);
      res.status(500).json({ message: "AI search is temporarily unavailable. Please try again." });
    }
  });

  // AI Enhanced Search - semantic product search (GET for frontend use)
  app.get("/api/ai/search", async (req, res) => {
    try {
      const { query, category } = req.query;
      
      if (!query || typeof query !== 'string' || query.trim().length === 0) {
        return res.status(400).json({ message: "Please provide a search query" });
      }

      const userId = req.session?.userId || null;
      const result = await aiEnhancedSearch(userId, query.trim(), category as string | undefined);
      
      // Fetch full product records for the matched SKUs to ensure all fields are present
      if (result.products && result.products.length > 0) {
        const productIds = result.products.map(p => p.id);
        const fullProducts = await storage.getProductsByIds(productIds);
        
        // Apply customer-specific pricing if user has a price list
        let productsWithPricing = fullProducts;
        if (req.session?.userId) {
          const user = await storage.getUser(req.session.userId);
          if (user?.priceListId) {
            const customerPriceMap = await storage.getCustomerPricesForProducts(
              user.priceListId,
              fullProducts.map(p => p.id)
            );
            productsWithPricing = fullProducts.map(product => ({
              ...product,
              customerPrice: customerPriceMap[product.id] || null,
            }));
          }
        }

        res.json({
          ...result,
          products: productsWithPricing,
        });
      } else {
        res.json(result);
      }
    } catch (error) {
      console.error("AI Search error:", error);
      res.status(500).json({ message: "AI search is temporarily unavailable. Please try again." });
    }
  });

  // ================================================================
  // TOP SELLERS BY CATEGORY (for AI search commands)
  // ================================================================

  // Get top selling products by category
  app.get("/api/top-sellers/by-category/:category", async (req, res) => {
    try {
      const { category } = req.params;
      const limit = parseInt(req.query.limit as string) || 10;
      
      if (!category) {
        return res.status(400).json({ message: "Category is required" });
      }

      const topSellers = await storage.getTopSellersByCategory(category, limit);
      
      // Apply customer-specific pricing if user has a price list
      let productsWithPricing = topSellers;
      if (req.session?.userId) {
        const user = await storage.getUser(req.session.userId);
        if (user?.priceListId) {
          const customerPriceMap = await storage.getCustomerPricesForProducts(
            user.priceListId,
            topSellers.map(p => p.id)
          );
          productsWithPricing = topSellers.map(product => ({
            ...product,
            customerPrice: customerPriceMap[product.id] || null,
          }));
        }
      }

      res.json({ products: productsWithPricing, category, count: productsWithPricing.length });
    } catch (error) {
      console.error("Get top sellers by category error:", error);
      res.status(500).json({ message: "Failed to get top sellers" });
    }
  });

  // ================================================================
  // HIGHLIGHTED PRODUCTS MANAGEMENT
  // ================================================================

  // Get highlighted products
  app.get("/api/admin/highlighted-products", requireStaffOrAdmin, async (req, res) => {
    try {
      const highlighted = await storage.getHighlightedProducts();
      res.json({ products: highlighted });
    } catch (error) {
      console.error("Get highlighted products error:", error);
      res.status(500).json({ message: "Failed to get highlighted products" });
    }
  });

  // Get highlighted products (public endpoint for homepage)
  app.get("/api/highlighted-products", async (req, res) => {
    try {
      const highlighted = await storage.getHighlightedProducts();
      res.json({ products: highlighted });
    } catch (error) {
      console.error("Get highlighted products error:", error);
      res.status(500).json({ message: "Failed to get highlighted products" });
    }
  });

  // Get latest products/groups for What's New page
  app.get("/api/latest-products", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 12;
      const latest = await storage.getLatestProductsOrGroups(limit);
      res.json({ products: latest });
    } catch (error) {
      console.error("Get latest products error:", error);
      res.status(500).json({ message: "Failed to get latest products" });
    }
  });

  // Toggle product highlight status
  app.post("/api/admin/products/:id/highlight", requireStaffOrAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const { isHighlighted } = req.body;
      
      if (typeof isHighlighted !== "boolean") {
        return res.status(400).json({ message: "isHighlighted must be a boolean" });
      }
      
      const updated = await storage.setProductHighlight(id, isHighlighted);
      if (!updated) {
        return res.status(404).json({ message: "Product not found" });
      }
      
      res.json({ product: updated });
    } catch (error) {
      console.error("Toggle product highlight error:", error);
      res.status(500).json({ message: "Failed to update product highlight status" });
    }
  });

  // ================================================================
  // ZOHO INTEGRATION
  // ================================================================

  // Test Zoho connection
  app.get("/api/admin/zoho/test", requireAdmin, async (req, res) => {
    try {
      const result = await testZohoConnection();
      res.json(result);
    } catch (error) {
      console.error("Zoho test error:", error);
      res.status(500).json({ success: false, message: "Failed to test Zoho connection" });
    }
  });

  // Sync products from Zoho Inventory
  // Use ?full=true to force a full sync instead of incremental
  app.post("/api/admin/zoho/sync", requireStaffOrAdmin, async (req, res) => {
    try {
      const forceFullSync = req.query.full === "true";
      const result = await syncProductsFromZoho("admin", forceFullSync);
      res.json(result);
    } catch (error) {
      console.error("Zoho sync error:", error);
      res.status(500).json({ 
        created: 0, 
        updated: 0, 
        skipped: 0, 
        total: 0,
        errors: [error instanceof Error ? error.message : "Unknown sync error"] 
      });
    }
  });

  // Sync item groups from Zoho Inventory (updates products with group IDs)
  app.post("/api/admin/zoho/item-groups/sync", requireStaffOrAdmin, async (_req, res) => {
    try {
      const result = await syncItemGroupsFromZoho();
      res.json({
        success: true,
        ...result,
        message: `Synced ${result.synced} item groups, updated ${result.updated} products`,
      });
    } catch (error) {
      console.error("Item groups sync error:", error);
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : "Unknown sync error",
      });
    }
  });

  // Sync price lists from Zoho Inventory
  app.post("/api/admin/zoho/price-lists/sync", requireStaffOrAdmin, async (_req, res) => {
    try {
      const { syncPriceListsFromZoho } = await import("./zoho-service");
      const result = await syncPriceListsFromZoho();
      res.json({
        success: true,
        ...result,
        message: `Synced ${result.priceListsCreated + result.priceListsUpdated} price lists, ${result.itemPricesCreated + result.itemPricesUpdated} item prices`,
      });
    } catch (error) {
      console.error("Price list sync error:", error);
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : "Unknown sync error",
      });
    }
  });

  // Get all price lists
  app.get("/api/admin/price-lists", requireAdmin, async (_req, res) => {
    try {
      const { getPriceLists } = await import("./zoho-service");
      const lists = await getPriceLists();
      res.json(lists);
    } catch (error) {
      console.error("Get price lists error:", error);
      res.status(500).json({ message: "Failed to get price lists" });
    }
  });

  // ================================================================
  // ORDER TRACKING (Admin)
  // ================================================================

  // Update order tracking info
  app.patch("/api/admin/orders/:id/tracking", requireStaffOrAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const { trackingNumber, carrier } = req.body;

      const [order] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      const updateData: Record<string, unknown> = {
        updatedAt: new Date(),
      };

      if (trackingNumber !== undefined) updateData.trackingNumber = trackingNumber;
      if (carrier !== undefined) updateData.carrier = carrier;

      await db.update(orders).set(updateData).where(eq(orders.id, id));

      const [updatedOrder] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
      res.json(updatedOrder);
    } catch (error) {
      console.error("Update tracking error:", error);
      res.status(500).json({ message: "Failed to update tracking info" });
    }
  });

  // Mark order as shipped with tracking
  app.post("/api/admin/orders/:id/ship", requireStaffOrAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const { trackingNumber, carrier, sendNotification = true } = req.body;

      const [order] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      if (order.status !== OrderStatus.PROCESSING && order.status !== OrderStatus.APPROVED) {
        return res.status(400).json({ 
          message: `Cannot ship order with status ${order.status}. Order must be in processing or approved status.` 
        });
      }

      await db.update(orders).set({
        status: OrderStatus.SHIPPED,
        trackingNumber: trackingNumber || null,
        carrier: carrier || null,
        shippedAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(orders.id, id));

      // Send notification if requested
      if (sendNotification && trackingNumber) {
        try {
          const { sendShipmentNotification } = await import("./email-service");
          await sendShipmentNotification(order.id);
        } catch (notifError) {
          console.error("Failed to send shipment notification:", notifError);
          // Don't fail the request if notification fails
        }
      }

      const [updatedOrder] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
      res.json({ 
        success: true, 
        order: updatedOrder,
        notificationSent: sendNotification && trackingNumber,
      });
    } catch (error) {
      console.error("Ship order error:", error);
      res.status(500).json({ message: "Failed to ship order" });
    }
  });

  // Mark order as delivered
  app.post("/api/admin/orders/:id/deliver", requireStaffOrAdmin, async (req, res) => {
    try {
      const { id } = req.params;

      const [order] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      if (order.status !== OrderStatus.SHIPPED) {
        return res.status(400).json({ 
          message: `Cannot mark as delivered. Order must be in shipped status.` 
        });
      }

      await db.update(orders).set({
        status: OrderStatus.DELIVERED,
        deliveredAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(orders.id, id));

      const [updatedOrder] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
      res.json({ success: true, order: updatedOrder });
    } catch (error) {
      console.error("Deliver order error:", error);
      res.status(500).json({ message: "Failed to mark order as delivered" });
    }
  });

  // ================================================================
  // AI EMBEDDINGS (Admin)
  // ================================================================

  // Generate product embeddings for semantic search
  app.post("/api/admin/embeddings/generate", requireAdmin, async (_req, res) => {
    try {
      console.log("[Embeddings] Starting embedding generation...");
      const result = await generateProductEmbeddings();
      res.json({
        success: true,
        ...result,
        message: `Processed ${result.processed} products: ${result.created} created, ${result.updated} updated, ${result.errors} errors`,
      });
    } catch (error) {
      console.error("Embedding generation error:", error);
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // ================================================================
  // ANALYTICS (Admin)
  // ================================================================

  // Get analytics dashboard data
  app.get("/api/admin/analytics", requireAdmin, async (_req, res) => {
    try {
      // Get all orders for metrics
      const allOrders = await storage.getAllOrders();
      const allUsers = await storage.getAllUsers();
      
      // Calculate order metrics
      const totalOrders = allOrders.length;
      const validOrders = allOrders.filter(o => !['rejected', 'cancelled', 'pending_approval'].includes(o.status));
      const totalRevenue = validOrders.reduce((sum, o) => sum + parseFloat(o.totalAmount), 0);
      const averageOrderValue = validOrders.length > 0 ? totalRevenue / validOrders.length : 0;
      
      // Order status breakdown
      const ordersByStatus: Record<string, number> = {};
      allOrders.forEach(o => {
        ordersByStatus[o.status] = (ordersByStatus[o.status] || 0) + 1;
      });
      
      // Calculate sales by day (last 30 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const salesByDay: { date: string; orders: number; revenue: number }[] = [];
      const dayMap = new Map<string, { orders: number; revenue: number }>();
      
      allOrders
        .filter(o => !['rejected', 'cancelled', 'pending_approval'].includes(o.status))
        .filter(o => new Date(o.createdAt) >= thirtyDaysAgo)
        .forEach(o => {
          const dateKey = new Date(o.createdAt).toISOString().split('T')[0];
          const existing = dayMap.get(dateKey) || { orders: 0, revenue: 0 };
          dayMap.set(dateKey, {
            orders: existing.orders + 1,
            revenue: existing.revenue + parseFloat(o.totalAmount)
          });
        });
      
      // Fill in missing days
      for (let i = 29; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dateKey = date.toISOString().split('T')[0];
        const data = dayMap.get(dateKey) || { orders: 0, revenue: 0 };
        salesByDay.push({ date: dateKey, ...data });
      }
      
      // Customer metrics
      const customers = allUsers.filter(u => u.role === 'customer');
      const activeCustomers = customers.filter(u => u.status === 'approved').length;
      const pendingCustomers = customers.filter(u => u.status === 'pending').length;
      
      // Top customers by order value
      const customerOrderTotals = new Map<string, { user: typeof customers[0]; total: number; orderCount: number }>();
      allOrders
        .filter(o => !['rejected', 'cancelled', 'pending_approval'].includes(o.status))
        .forEach(o => {
          const existing = customerOrderTotals.get(o.userId);
          if (existing) {
            existing.total += parseFloat(o.totalAmount);
            existing.orderCount += 1;
          } else {
            const user = customers.find(u => u.id === o.userId);
            if (user) {
              customerOrderTotals.set(o.userId, { 
                user, 
                total: parseFloat(o.totalAmount),
                orderCount: 1
              });
            }
          }
        });
      
      const topCustomers = Array.from(customerOrderTotals.values())
        .sort((a, b) => b.total - a.total)
        .slice(0, 10)
        .map(c => ({
          id: c.user.id,
          businessName: c.user.businessName,
          email: c.user.email,
          totalSpent: c.total.toFixed(2),
          orderCount: c.orderCount
        }));
      
      res.json({
        orderMetrics: {
          totalOrders,
          totalRevenue: totalRevenue.toFixed(2),
          averageOrderValue: averageOrderValue.toFixed(2),
          ordersByStatus
        },
        customerMetrics: {
          totalCustomers: customers.length,
          activeCustomers,
          pendingCustomers
        },
        salesTrend: salesByDay,
        topCustomers
      });
    } catch (error) {
      console.error("Analytics error:", error);
      res.status(500).json({ message: "Failed to load analytics" });
    }
  });

  // Get top selling products
  app.get("/api/admin/analytics/top-products", requireAdmin, async (_req, res) => {
    try {
      const allOrders = await storage.getAllOrders();
      
      // Get order items for completed orders
      const productSales = new Map<string, { productId: string; name: string; sku: string; quantitySold: number; revenue: number }>();
      
      for (const order of allOrders) {
        if (['rejected', 'cancelled', 'pending_approval'].includes(order.status)) continue;
        
        const orderData = await storage.getOrderWithItems(order.id);
        if (!orderData) continue;
        
        for (const item of orderData.items) {
          const existing = productSales.get(item.productId);
          if (existing) {
            existing.quantitySold += item.quantity;
            existing.revenue += parseFloat(item.lineTotal);
          } else {
            productSales.set(item.productId, {
              productId: item.productId,
              name: item.product.name,
              sku: item.product.sku,
              quantitySold: item.quantity,
              revenue: parseFloat(item.lineTotal)
            });
          }
        }
      }
      
      const topProducts = Array.from(productSales.values())
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 20)
        .map(p => ({
          ...p,
          revenue: p.revenue.toFixed(2)
        }));
      
      res.json({ topProducts });
    } catch (error) {
      console.error("Top products error:", error);
      res.status(500).json({ message: "Failed to load top products" });
    }
  });

  // Get Zoho API call statistics
  app.get("/api/admin/analytics/zoho-api-stats", requireAdmin, async (_req, res) => {
    try {
      const now = new Date();
      
      // Stats for last hour
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      const lastHourStats = await storage.getZohoApiCallStats(oneHourAgo);
      
      // Stats for today (start of day)
      const startOfDay = new Date(now);
      startOfDay.setHours(0, 0, 0, 0);
      const todayStats = await storage.getZohoApiCallStats(startOfDay);
      
      res.json({
        lastHour: lastHourStats,
        today: todayStats,
      });
    } catch (error) {
      console.error("Zoho API stats error:", error);
      res.status(500).json({ message: "Failed to load Zoho API stats" });
    }
  });

  // ================================================================
  // SCHEDULER (Admin)
  // ================================================================

  // Get scheduler status
  app.get("/api/admin/scheduler/status", requireStaffOrAdmin, async (_req, res) => {
    try {
      const status = getSchedulerStatus();
      res.json(status);
    } catch (error) {
      console.error("Scheduler status error:", error);
      res.status(500).json({ message: "Failed to get scheduler status" });
    }
  });

  // Update scheduler configuration
  app.patch("/api/admin/scheduler/config", requireStaffOrAdmin, async (req, res) => {
    try {
      const { enabled, zohoSyncIntervalMinutes, embeddingsUpdateIntervalMinutes } = req.body;
      updateSchedulerConfig({
        ...(typeof enabled === "boolean" ? { enabled } : {}),
        ...(typeof zohoSyncIntervalMinutes === "number" ? { zohoSyncIntervalMinutes } : {}),
        ...(typeof embeddingsUpdateIntervalMinutes === "number" ? { embeddingsUpdateIntervalMinutes } : {}),
      });
      const status = getSchedulerStatus();
      res.json({ success: true, status });
    } catch (error) {
      console.error("Scheduler config error:", error);
      res.status(500).json({ message: "Failed to update scheduler config" });
    }
  });

  // Trigger manual sync
  app.post("/api/admin/scheduler/sync", requireStaffOrAdmin, async (req, res) => {
    try {
      const { type = "all" } = req.body;
      if (!["zoho", "embeddings", "customers", "topsellers", "emailcampaigns", "all"].includes(type)) {
        return res.status(400).json({ message: "Invalid sync type. Use: zoho, embeddings, customers, topsellers, emailcampaigns, or all" });
      }
      const results = await triggerManualSync(type);
      res.json({ success: true, results });
    } catch (error) {
      console.error("Manual sync error:", error);
      res.status(500).json({ 
        success: false, 
        message: error instanceof Error ? error.message : "Sync failed" 
      });
    }
  });

  // Trigger top sellers sync from Zoho Books
  app.post("/api/admin/sync/top-sellers", requireStaffOrAdmin, async (_req, res) => {
    try {
      console.log("[Admin] Triggering top sellers sync...");
      const result = await syncTopSellersFromZoho();
      res.json(result);
    } catch (error) {
      console.error("Top sellers sync error:", error);
      res.status(500).json({ 
        success: false, 
        message: error instanceof Error ? error.message : "Top sellers sync failed" 
      });
    }
  });

  // ================================================================
  // ADMIN JOBS ENDPOINTS (Retry Failed Zoho Operations)
  // ================================================================

  // Get pending/failed jobs
  app.get("/api/admin/jobs", requireAdmin, async (_req, res) => {
    try {
      const pendingJobs = await storage.getPendingJobs();
      const failedJobs = await storage.getFailedJobs();
      res.json({ 
        pending: pendingJobs, 
        failed: failedJobs,
        totalPending: pendingJobs.length,
        totalFailed: failedJobs.length
      });
    } catch (error) {
      console.error("Error fetching jobs:", error);
      res.status(500).json({ message: "Failed to fetch jobs" });
    }
  });

  // Retry a specific job
  app.post("/api/admin/jobs/:id/retry", requireAdmin, async (req, res) => {
    try {
      const job = await storage.getJob(req.params.id as string);
      if (!job) {
        return res.status(404).json({ message: "Job not found" });
      }
      
      if (job.status === 'completed') {
        return res.status(400).json({ message: "Job is already completed" });
      }

      // Reset job to pending for retry
      const updatedJob = await storage.updateJob(job.id, {
        status: 'pending',
        attempts: 0,
        errorMessage: null
      });
      
      res.json({ job: updatedJob, message: "Job queued for retry" });
    } catch (error) {
      console.error("Error retrying job:", error);
      res.status(500).json({ message: "Failed to retry job" });
    }
  });

  // Process pending jobs (manual trigger)
  app.post("/api/admin/jobs/process", requireAdmin, async (_req, res) => {
    try {
      const { processJobQueue } = await import("./job-worker");
      const results = await processJobQueue();
      res.json({ success: true, results });
    } catch (error) {
      console.error("Error processing jobs:", error);
      res.status(500).json({ message: "Failed to process jobs" });
    }
  });

  // ================================================================
  // ADMIN VISIBILITY ENDPOINTS
  // ================================================================

  // Get hidden products (isOnline = false)
  app.get("/api/admin/products/hidden", requireAdmin, async (_req, res) => {
    try {
      const hiddenProducts = await storage.getHiddenProducts();
      res.json({ products: hiddenProducts, count: hiddenProducts.length });
    } catch (error) {
      console.error("Error fetching hidden products:", error);
      res.status(500).json({ message: "Failed to fetch hidden products" });
    }
  });

  // Get out-of-stock products (online but qty <= 0)
  app.get("/api/admin/products/out-of-stock", requireAdmin, async (_req, res) => {
    try {
      const outOfStockProducts = await storage.getOutOfStockProducts();
      res.json({ products: outOfStockProducts, count: outOfStockProducts.length });
    } catch (error) {
      console.error("Error fetching out-of-stock products:", error);
      res.status(500).json({ message: "Failed to fetch out-of-stock products" });
    }
  });

  // Get inactive/suspended customers
  app.get("/api/admin/customers/inactive", requireAdmin, async (_req, res) => {
    try {
      const inactiveCustomers = await storage.getInactiveCustomers();
      res.json({ customers: inactiveCustomers, count: inactiveCustomers.length });
    } catch (error) {
      console.error("Error fetching inactive customers:", error);
      res.status(500).json({ message: "Failed to fetch inactive customers" });
    }
  });

  // Get sync history
  app.get("/api/admin/sync/history", requireAdmin, async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 20;
      const history = await storage.getSyncHistory(limit);
      res.json({ runs: history, count: history.length });
    } catch (error) {
      console.error("Error fetching sync history:", error);
      res.status(500).json({ message: "Failed to fetch sync history" });
    }
  });

  // ================================================================
  // EMAIL CAMPAIGN TEMPLATE ENDPOINTS (Admin/Staff)
  // ================================================================

  // Get all email templates
  app.get("/api/admin/email-templates", requireStaffOrAdmin, async (_req, res) => {
    try {
      const templates = await storage.getEmailTemplates();
      res.json({ templates });
    } catch (error) {
      console.error("Error fetching email templates:", error);
      res.status(500).json({ message: "Failed to fetch email templates" });
    }
  });

  // Get single email template
  app.get("/api/admin/email-templates/:id", requireStaffOrAdmin, async (req, res) => {
    try {
      const template = await storage.getEmailTemplateById(req.params.id);
      if (!template) {
        return res.status(404).json({ message: "Template not found" });
      }
      res.json({ template });
    } catch (error) {
      console.error("Error fetching email template:", error);
      res.status(500).json({ message: "Failed to fetch email template" });
    }
  });

  // Generate new template with AI
  app.post("/api/admin/email-templates/generate", requireStaffOrAdmin, async (req, res) => {
    try {
      const { campaignType, customPrompt } = req.body;
      
      if (!campaignType) {
        return res.status(400).json({ message: "Campaign type is required" });
      }

      const { generateTemplateForApproval } = await import("./email-campaign-service");
      const template = await generateTemplateForApproval(campaignType, customPrompt);
      
      res.json({ template });
    } catch (error) {
      console.error("Error generating email template:", error);
      res.status(500).json({ message: "Failed to generate email template" });
    }
  });

  // Update email template
  app.patch("/api/admin/email-templates/:id", requireStaffOrAdmin, async (req, res) => {
    try {
      const { subject, headline, introduction, callToAction, customPrompt } = req.body;
      const template = await storage.updateEmailTemplate(req.params.id, {
        subject,
        headline,
        introduction,
        callToAction,
        customPrompt,
      });
      
      if (!template) {
        return res.status(404).json({ message: "Template not found" });
      }
      
      res.json({ template });
    } catch (error) {
      console.error("Error updating email template:", error);
      res.status(500).json({ message: "Failed to update email template" });
    }
  });

  // Approve email template
  app.post("/api/admin/email-templates/:id/approve", requireStaffOrAdmin, async (req, res) => {
    try {
      const user = req.user as any;
      const template = await storage.approveEmailTemplate(req.params.id, user.id);
      
      if (!template) {
        return res.status(404).json({ message: "Template not found" });
      }
      
      res.json({ template, message: "Template approved successfully" });
    } catch (error) {
      console.error("Error approving email template:", error);
      res.status(500).json({ message: "Failed to approve email template" });
    }
  });

  // Reject email template
  app.post("/api/admin/email-templates/:id/reject", requireStaffOrAdmin, async (req, res) => {
    try {
      const { reason } = req.body;
      
      if (!reason) {
        return res.status(400).json({ message: "Rejection reason is required" });
      }
      
      const template = await storage.rejectEmailTemplate(req.params.id, reason);
      
      if (!template) {
        return res.status(404).json({ message: "Template not found" });
      }
      
      res.json({ template, message: "Template rejected" });
    } catch (error) {
      console.error("Error rejecting email template:", error);
      res.status(500).json({ message: "Failed to reject email template" });
    }
  });

  // Delete email template
  app.delete("/api/admin/email-templates/:id", requireStaffOrAdmin, async (req, res) => {
    try {
      await storage.deleteEmailTemplate(req.params.id);
      res.json({ message: "Template deleted successfully" });
    } catch (error) {
      console.error("Error deleting email template:", error);
      res.status(500).json({ message: "Failed to delete email template" });
    }
  });

  // Regenerate template with custom prompt
  app.post("/api/admin/email-templates/:id/regenerate", requireStaffOrAdmin, async (req, res) => {
    try {
      const { customPrompt } = req.body;
      const existingTemplate = await storage.getEmailTemplateById(req.params.id);
      
      if (!existingTemplate) {
        return res.status(404).json({ message: "Template not found" });
      }

      const { generateTemplateForApproval } = await import("./email-campaign-service");
      const newTemplate = await generateTemplateForApproval(
        existingTemplate.campaignType, 
        customPrompt
      );
      
      // Delete the old template
      await storage.deleteEmailTemplate(req.params.id);
      
      res.json({ template: newTemplate });
    } catch (error) {
      console.error("Error regenerating email template:", error);
      res.status(500).json({ message: "Failed to regenerate email template" });
    }
  });

  return httpServer;
}
