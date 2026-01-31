import { 
  type User, 
  type InsertUser, 
  type SafeUser,
  users, 
  toSafeUser,
  UserRole,
  UserStatus,
  type UserStatusType,
  type UserRoleType
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, ne } from "drizzle-orm";
import bcrypt from "bcrypt";

const SALT_ROUNDS = 12;

export interface IStorage {
  // User operations
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<SafeUser>;
  updateUserLastLogin(id: string): Promise<void>;
  
  // Admin user operations
  getAllUsers(): Promise<SafeUser[]>;
  getPendingUsers(): Promise<SafeUser[]>;
  updateUserStatus(id: string, status: UserStatusType, role?: UserRoleType): Promise<SafeUser | undefined>;
  
  // Auth operations
  validatePassword(plainPassword: string, hashedPassword: string): Promise<boolean>;
  hashPassword(password: string): Promise<string>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase()));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<SafeUser> {
    const hashedPassword = await this.hashPassword(insertUser.password);
    
    const [user] = await db.insert(users).values({
      email: insertUser.email.toLowerCase(),
      password: hashedPassword,
      businessName: insertUser.businessName,
      contactName: insertUser.contactName,
      phone: insertUser.phone,
      address: insertUser.address,
      city: insertUser.city,
      state: insertUser.state,
      zipCode: insertUser.zipCode,
      role: UserRole.PENDING,
      status: UserStatus.PENDING,
    }).returning();
    
    return toSafeUser(user);
  }

  async updateUserLastLogin(id: string): Promise<void> {
    await db.update(users)
      .set({ lastLoginAt: new Date() })
      .where(eq(users.id, id));
  }

  async getAllUsers(): Promise<SafeUser[]> {
    const allUsers = await db.select()
      .from(users)
      .orderBy(desc(users.createdAt));
    return allUsers.map(toSafeUser);
  }

  async getPendingUsers(): Promise<SafeUser[]> {
    const pendingUsers = await db.select()
      .from(users)
      .where(eq(users.status, UserStatus.PENDING))
      .orderBy(desc(users.createdAt));
    return pendingUsers.map(toSafeUser);
  }

  async updateUserStatus(id: string, status: UserStatusType, role?: UserRoleType): Promise<SafeUser | undefined> {
    const updateData: { status: UserStatusType; role?: UserRoleType; updatedAt: Date } = {
      status,
      updatedAt: new Date(),
    };
    
    if (role) {
      updateData.role = role;
    }
    
    const [updatedUser] = await db.update(users)
      .set(updateData)
      .where(eq(users.id, id))
      .returning();
    
    return updatedUser ? toSafeUser(updatedUser) : undefined;
  }

  async validatePassword(plainPassword: string, hashedPassword: string): Promise<boolean> {
    return bcrypt.compare(plainPassword, hashedPassword);
  }

  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, SALT_ROUNDS);
  }
}

export const storage = new DatabaseStorage();
