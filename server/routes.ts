import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertUserSchema, loginSchema, toSafeUser, UserRole, UserStatus } from "@shared/schema";
import { z } from "zod";
import { db } from "./db";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";

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

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // Health check
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // Register new user
  app.post("/api/auth/register", async (req, res) => {
    try {
      const data = insertUserSchema.parse(req.body);
      
      // Check if email already exists
      const existing = await storage.getUserByEmail(data.email);
      if (existing) {
        return res.status(400).json({ message: "Email already registered" });
      }
      
      const user = await storage.createUser(data);
      
      // Set session
      req.session.userId = user.id;
      
      res.status(201).json({ user });
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
  app.get("/api/admin/users", requireAdmin, async (_req, res) => {
    try {
      const allUsers = await storage.getAllUsers();
      res.json({ users: allUsers });
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  // Admin: Get pending users
  app.get("/api/admin/users/pending", requireAdmin, async (_req, res) => {
    try {
      const pendingUsers = await storage.getPendingUsers();
      res.json({ users: pendingUsers });
    } catch (error) {
      console.error("Error fetching pending users:", error);
      res.status(500).json({ message: "Failed to fetch pending users" });
    }
  });

  // Admin: Approve user
  app.post("/api/admin/users/:id/approve", requireAdmin, async (req, res) => {
    try {
      const id = req.params.id as string;
      
      const user = await storage.getUser(id);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      if (user.status === UserStatus.APPROVED) {
        return res.status(400).json({ message: "User is already approved" });
      }
      
      const updatedUser = await storage.updateUserStatus(id, UserStatus.APPROVED, UserRole.CUSTOMER);
      res.json({ user: updatedUser, message: "User approved successfully" });
    } catch (error) {
      console.error("Error approving user:", error);
      res.status(500).json({ message: "Failed to approve user" });
    }
  });

  // Admin: Reject user
  app.post("/api/admin/users/:id/reject", requireAdmin, async (req, res) => {
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

  return httpServer;
}
