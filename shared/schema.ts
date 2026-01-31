import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// User roles for B2B wholesale platform
export const UserRole = {
  ADMIN: 'admin',
  CUSTOMER: 'customer',
  PENDING: 'pending',
} as const;

export type UserRoleType = typeof UserRole[keyof typeof UserRole];

// User status for approval workflow
export const UserStatus = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  SUSPENDED: 'suspended',
} as const;

export type UserStatusType = typeof UserStatus[keyof typeof UserStatus];

// Users table with B2B wholesale-specific fields
export const users = pgTable("users", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  role: text("role").notNull().default(UserRole.PENDING),
  status: text("status").notNull().default(UserStatus.PENDING),
  
  // Business information
  businessName: text("business_name"),
  contactName: text("contact_name"),
  phone: text("phone"),
  
  // Zoho integration (for future phases)
  zohoCustomerId: text("zoho_customer_id"),
  
  // Timestamps
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  lastLoginAt: timestamp("last_login_at"),
});

// Insert schema for registration
export const insertUserSchema = createInsertSchema(users).pick({
  email: true,
  password: true,
  businessName: true,
  contactName: true,
  phone: true,
}).extend({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  businessName: z.string().optional(),
  contactName: z.string().optional(),
  phone: z.string().optional(),
});

// Login schema
export const loginSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

// Types
export type InsertUser = z.infer<typeof insertUserSchema>;
export type LoginCredentials = z.infer<typeof loginSchema>;
export type User = typeof users.$inferSelect;

// Safe user type (without password)
export type SafeUser = Omit<User, 'password'>;

// Helper to strip password from user object
export function toSafeUser(user: User): SafeUser {
  const { password, ...safeUser } = user;
  return safeUser;
}
