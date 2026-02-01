import { 
  type User, 
  type InsertUser, 
  type SafeUser,
  type Product,
  type InsertProduct,
  type Cart,
  type CartItem,
  type Order,
  type OrderItem,
  type SyncRun,
  type Job,
  type InsertJob,
  type Category,
  type InsertCategory,
  type ZohoApiLog,
  type InsertZohoApiLog,
  type TopSellerCache,
  type EmailCampaignTemplate,
  type InsertEmailCampaignTemplate,
  users,
  products,
  carts,
  cartItems,
  orders,
  orderItems,
  syncRuns,
  jobs,
  customerPrices,
  priceLists,
  categories,
  zohoApiLogs,
  topSellersCache,
  emailCampaignTemplates,
  EmailTemplateStatus,
  toSafeUser,
  UserRole,
  UserStatus,
  OrderStatus,
  JobStatus,
  JobType,
  generateOrderNumber,
  type UserStatusType,
  type UserRoleType,
  type OrderStatusType,
  type JobTypeValue,
  type JobStatusValue,
  type EmailTemplateStatusValue
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, ne, ilike, or, asc, sql, lte, gte, gt, inArray } from "drizzle-orm";
import bcrypt from "bcrypt";

const SALT_ROUNDS = 12;

export interface IStorage {
  // User operations
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser, zohoCustomerId?: string): Promise<SafeUser>;
  createUserAutoApproved(user: { email: string; password: string; businessName?: string; contactName?: string }, zohoCustomerId: string): Promise<SafeUser>;
  updateUserLastLogin(id: string): Promise<void>;
  
  // Admin user operations
  getAllUsers(): Promise<SafeUser[]>;
  getPendingUsers(): Promise<SafeUser[]>;
  updateUserStatus(id: string, status: UserStatusType, role?: UserRoleType): Promise<SafeUser | undefined>;
  createAdminOrStaff(data: { email: string; password: string; contactName: string; role: 'admin' | 'staff' }): Promise<SafeUser>;
  deleteUser(id: string): Promise<boolean>;
  
  // Auth operations
  validatePassword(plainPassword: string, hashedPassword: string): Promise<boolean>;
  hashPassword(password: string): Promise<string>;
  
  // Product operations
  getProducts(options?: { category?: string; search?: string; sortBy?: string; sortOrder?: string; includeOffline?: boolean; limit?: number; offset?: number }): Promise<{ products: Product[]; totalCount: number }>;
  getProduct(id: string): Promise<Product | undefined>;
  getProductInternal(id: string): Promise<Product | undefined>;
  getProductBySku(sku: string): Promise<Product | undefined>;
  getProductsByIds(ids: string[]): Promise<Product[]>;
  getProductsByGroupId(groupId: string): Promise<Product[]>;
  createProduct(product: InsertProduct): Promise<Product>;
  updateProduct(id: string, product: Partial<InsertProduct>): Promise<Product | undefined>;
  getCustomerPricesForProducts(priceListId: string, productIds: string[]): Promise<Record<string, string>>;
  
  // Cart operations
  getCart(userId: string): Promise<Cart | undefined>;
  getOrCreateCart(userId: string): Promise<Cart>;
  getCartItem(id: string): Promise<CartItem | undefined>;
  getCartItems(cartId: string): Promise<(CartItem & { product: Product })[]>;
  getAllActiveCarts(): Promise<{ cart: Cart; user: SafeUser; items: (CartItem & { product: Product })[] }[]>;
  addToCart(cartId: string, productId: string, quantity: number): Promise<CartItem>;
  updateCartItem(cartItemId: string, quantity: number): Promise<CartItem | undefined>;
  removeCartItem(cartItemId: string): Promise<void>;
  clearCart(cartId: string): Promise<void>;
  updateCartTotals(cartId: string): Promise<void>;
  
  // Order operations
  createOrder(userId: string, shippingInfo: { address?: string; city?: string; state?: string; zipCode?: string }): Promise<Order>;
  getOrder(id: string): Promise<Order | undefined>;
  getOrderWithItems(id: string): Promise<{ order: Order; items: (OrderItem & { product: Product })[] } | undefined>;
  getUserOrders(userId: string): Promise<Order[]>;
  getAllOrders(): Promise<(Order & { user: SafeUser })[]>;
  updateOrderStatus(id: string, status: OrderStatusType, adminId?: string, reason?: string): Promise<Order | undefined>;
  updateOrderZohoInfo(id: string, zohoSalesOrderId: string): Promise<Order | undefined>;
  
  // Admin visibility operations
  getHighlightedProducts(): Promise<Product[]>;
  setProductHighlight(productId: string, isHighlighted: boolean): Promise<Product | undefined>;
  getHiddenProducts(): Promise<Product[]>;
  getOutOfStockProducts(): Promise<Product[]>;
  getLatestProductsOrGroups(limit?: number): Promise<Product[]>;
  getInactiveCustomers(): Promise<SafeUser[]>;
  getSyncHistory(limit?: number): Promise<SyncRun[]>;
  createSyncRun(syncType: string, triggeredBy: string): Promise<SyncRun>;
  updateSyncRun(id: string, updates: Partial<SyncRun>): Promise<SyncRun | undefined>;
  
  // User Zoho status operations
  updateUserZohoStatus(id: string, isActive: boolean): Promise<SafeUser | undefined>;
  updateUserZohoCustomerId(id: string, zohoCustomerId: string): Promise<SafeUser | undefined>;
  getUsersWithZohoCustomerId(): Promise<User[]>;
  
  // Job operations (for retryable Zoho operations)
  createJob(job: { jobType: JobTypeValue; userId?: string; orderId?: string; payload?: string }): Promise<Job>;
  getJob(id: string): Promise<Job | undefined>;
  getPendingJobs(): Promise<Job[]>;
  getJobsByUser(userId: string): Promise<Job[]>;
  getJobsByOrder(orderId: string): Promise<Job[]>;
  getFailedJobs(): Promise<Job[]>;
  updateJob(id: string, updates: Partial<Job>): Promise<Job | undefined>;
  markJobProcessing(id: string): Promise<Job | undefined>;
  markJobCompleted(id: string): Promise<Job | undefined>;
  markJobFailed(id: string, errorMessage: string): Promise<Job | undefined>;
  
  // Category operations
  getCategories(): Promise<Category[]>;
  getCategoryBySlug(slug: string): Promise<Category | undefined>;
  getCategoryByZohoId(zohoCategoryId: string): Promise<Category | undefined>;
  upsertCategory(category: InsertCategory): Promise<Category>;
  
  // Zoho API log operations
  logZohoApiCall(log: InsertZohoApiLog): Promise<ZohoApiLog>;
  getZohoApiCallStats(sinceDate: Date): Promise<{ total: number; success: number; failed: number }>;
  
  // Email campaign template operations
  getEmailTemplates(): Promise<EmailCampaignTemplate[]>;
  getEmailTemplateById(id: string): Promise<EmailCampaignTemplate | undefined>;
  getApprovedTemplateForCampaign(campaignType: string): Promise<EmailCampaignTemplate | undefined>;
  createEmailTemplate(template: InsertEmailCampaignTemplate): Promise<EmailCampaignTemplate>;
  updateEmailTemplate(id: string, updates: Partial<InsertEmailCampaignTemplate>): Promise<EmailCampaignTemplate | undefined>;
  approveEmailTemplate(id: string, approvedById: string): Promise<EmailCampaignTemplate | undefined>;
  rejectEmailTemplate(id: string, reason: string): Promise<EmailCampaignTemplate | undefined>;
  deleteEmailTemplate(id: string): Promise<boolean>;
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

  async createUser(insertUser: InsertUser, zohoCustomerId?: string): Promise<SafeUser> {
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
      zohoCustomerId: zohoCustomerId || null,
    }).returning();
    
    return toSafeUser(user);
  }

  async createUserAutoApproved(
    userData: { email: string; password: string; businessName?: string; contactName?: string },
    zohoCustomerId: string
  ): Promise<SafeUser> {
    const hashedPassword = await this.hashPassword(userData.password);
    
    const [user] = await db.insert(users).values({
      email: userData.email.toLowerCase(),
      password: hashedPassword,
      businessName: userData.businessName || null,
      contactName: userData.contactName || null,
      role: UserRole.CUSTOMER,
      status: UserStatus.APPROVED,
      zohoCustomerId: zohoCustomerId,
    }).returning();
    
    return toSafeUser(user);
  }

  async updateUserLastLogin(id: string): Promise<void> {
    await db.update(users)
      .set({ lastLoginAt: new Date() })
      .where(eq(users.id, id));
  }

  async createAdminOrStaff(data: { email: string; password: string; contactName: string; role: 'admin' | 'staff' }): Promise<SafeUser> {
    const hashedPassword = await this.hashPassword(data.password);
    
    const [user] = await db.insert(users).values({
      email: data.email.toLowerCase(),
      password: hashedPassword,
      contactName: data.contactName,
      businessName: data.role === 'admin' ? 'Administrator' : 'Staff Member',
      role: data.role === 'admin' ? UserRole.ADMIN : UserRole.STAFF,
      status: UserStatus.APPROVED,
    }).returning();
    
    return toSafeUser(user);
  }

  async deleteUser(id: string): Promise<boolean> {
    const result = await db.delete(users).where(eq(users.id, id)).returning();
    return result.length > 0;
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

  // Product operations
  async getProducts(options?: { 
    category?: string; 
    search?: string; 
    sortBy?: string; 
    sortOrder?: string; 
    includeOffline?: boolean;
    includeNegativeStock?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<{ products: Product[]; totalCount: number }> {
    const conditions = [eq(products.isActive, true)];
    
    // Belt-and-suspenders: Always filter by isOnline=true for storefront unless explicitly requested
    if (!options?.includeOffline) {
      conditions.push(eq(products.isOnline, true));
    }
    
    // Hide products with negative stock (oversold/backordered) unless explicitly requested
    if (!options?.includeNegativeStock) {
      conditions.push(gte(products.stockQuantity, 0));
    }
    
    if (options?.category) {
      conditions.push(eq(products.category, options.category));
    }
    
    if (options?.search) {
      const searchTerm = `%${options.search}%`;
      conditions.push(
        or(
          ilike(products.name, searchTerm),
          ilike(products.sku, searchTerm),
          ilike(products.description, searchTerm),
          ilike(products.brand, searchTerm)
        )!
      );
    }
    
    let orderBy;
    if (options?.sortBy === 'price') {
      orderBy = options.sortOrder === 'desc' ? desc(products.basePrice) : asc(products.basePrice);
    } else if (options?.sortBy === 'name') {
      orderBy = options.sortOrder === 'desc' ? desc(products.name) : asc(products.name);
    } else {
      orderBy = desc(products.createdAt);
    }
    
    // Get total count first
    const countResult = await db.select({ count: sql<number>`count(*)` })
      .from(products)
      .where(and(...conditions));
    const totalCount = Number(countResult[0]?.count || 0);
    
    // Build query with optional pagination
    let query = db.select()
      .from(products)
      .where(and(...conditions))
      .orderBy(orderBy);
    
    if (options?.limit !== undefined) {
      query = query.limit(options.limit) as typeof query;
    }
    if (options?.offset !== undefined) {
      query = query.offset(options.offset) as typeof query;
    }
    
    const productList = await query;
    return { products: productList, totalCount };
  }

  async getConsolidatedProducts(options?: { 
    category?: string; 
    search?: string; 
    sortBy?: string; 
    sortOrder?: string; 
    limit?: number;
    offset?: number;
  }): Promise<{ products: Product[]; totalCount: number }> {
    const conditions = [
      eq(products.isActive, true),
      eq(products.isOnline, true),
      gte(products.stockQuantity, 0)
    ];
    
    if (options?.category) {
      conditions.push(eq(products.category, options.category));
    }
    
    if (options?.search) {
      const searchTerm = `%${options.search}%`;
      conditions.push(
        or(
          ilike(products.name, searchTerm),
          ilike(products.sku, searchTerm),
          ilike(products.description, searchTerm),
          ilike(products.brand, searchTerm),
          ilike(products.zohoGroupName, searchTerm)
        )!
      );
    }

    // Get all matching products (we need to consolidate before pagination)
    const allProducts = await db.select()
      .from(products)
      .where(and(...conditions));

    // Consolidate: one entry per group, individual items stay as-is
    // Track group stock: if ALL variants have 0 stock, mark group as out of stock
    const groupMap = new Map<string, Product & { _allVariantsOutOfStock: boolean }>();
    const ungrouped: Product[] = [];

    for (const product of allProducts) {
      if (product.zohoGroupId && product.zohoGroupName) {
        if (!groupMap.has(product.zohoGroupId)) {
          // Create representative with group name
          const representative = {
            ...product,
            name: product.zohoGroupName,
            _allVariantsOutOfStock: (product.stockQuantity || 0) <= 0,
          };
          groupMap.set(product.zohoGroupId, representative);
        } else {
          // Aggregate: lowest price, sum stock
          const existing = groupMap.get(product.zohoGroupId)!;
          const existingPrice = parseFloat(existing.basePrice || "0");
          const productPrice = parseFloat(product.basePrice || "0");
          if (productPrice < existingPrice) {
            existing.basePrice = product.basePrice;
          }
          existing.stockQuantity = (existing.stockQuantity || 0) + (product.stockQuantity || 0);
          // If any variant has stock, the group is NOT all out of stock
          if ((product.stockQuantity || 0) > 0) {
            existing._allVariantsOutOfStock = false;
          }
        }
      } else {
        ungrouped.push(product);
      }
    }
    
    // Set stockQuantity to 0 for groups where all variants are out of stock
    Array.from(groupMap.values()).forEach(group => {
      if (group._allVariantsOutOfStock) {
        group.stockQuantity = 0;
      }
    });

    // Combine and sort
    let consolidated = [...ungrouped, ...Array.from(groupMap.values())];
    
    // Apply sorting
    if (options?.sortBy === 'price') {
      consolidated.sort((a, b) => {
        const priceA = parseFloat(a.basePrice || "0");
        const priceB = parseFloat(b.basePrice || "0");
        return options.sortOrder === 'desc' ? priceB - priceA : priceA - priceB;
      });
    } else if (options?.sortBy === 'name') {
      consolidated.sort((a, b) => {
        const cmp = a.name.localeCompare(b.name);
        return options.sortOrder === 'desc' ? -cmp : cmp;
      });
    } else {
      // Default: newest first
      consolidated.sort((a, b) => {
        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return dateB - dateA;
      });
    }

    const totalCount = consolidated.length;

    // Apply pagination
    if (options?.offset !== undefined) {
      consolidated = consolidated.slice(options.offset);
    }
    if (options?.limit !== undefined) {
      consolidated = consolidated.slice(0, options.limit);
    }

    return { products: consolidated, totalCount };
  }

  async getProduct(id: string): Promise<Product | undefined> {
    const [product] = await db.select().from(products).where(eq(products.id, id));
    // Return undefined for offline products (treated as 404 by API)
    if (product && product.isOnline !== true) {
      return undefined;
    }
    return product;
  }
  
  async getProductInternal(id: string): Promise<Product | undefined> {
    const [product] = await db.select().from(products).where(eq(products.id, id));
    return product;
  }

  async getProductBySku(sku: string): Promise<Product | undefined> {
    const [product] = await db.select().from(products).where(eq(products.sku, sku));
    // Return undefined for offline products (treated as 404 by API)
    if (product && product.isOnline !== true) {
      return undefined;
    }
    return product;
  }

  async getProductsByIds(ids: string[]): Promise<Product[]> {
    if (ids.length === 0) return [];
    const result = await db.select().from(products).where(
      and(
        inArray(products.id, ids),
        eq(products.isOnline, true)
      )
    );
    // Preserve the order of the input IDs
    const productMap = new Map(result.map(p => [p.id, p]));
    return ids.map(id => productMap.get(id)).filter((p): p is Product => p !== undefined);
  }

  async getProductsByGroupId(groupId: string): Promise<Product[]> {
    const result = await db.select().from(products).where(
      and(
        eq(products.zohoGroupId, groupId),
        eq(products.isOnline, true)
      )
    );
    return result;
  }

  async createProduct(product: InsertProduct): Promise<Product> {
    const [newProduct] = await db.insert(products).values(product).returning();
    return newProduct;
  }

  async updateProduct(id: string, product: Partial<InsertProduct>): Promise<Product | undefined> {
    const [updated] = await db.update(products)
      .set({ ...product, updatedAt: new Date() })
      .where(eq(products.id, id))
      .returning();
    return updated;
  }

  async getCustomerPricesForProducts(priceListId: string, productIds: string[]): Promise<Record<string, string>> {
    if (productIds.length === 0) return {};
    
    // First, find the internal price list id from the Zoho price list id
    const [priceList] = await db
      .select()
      .from(priceLists)
      .where(eq(priceLists.id, priceListId))
      .limit(1);
    
    if (!priceList) {
      // Try by Zoho price list ID
      const [zohoList] = await db
        .select()
        .from(priceLists)
        .where(eq(priceLists.zohoPriceListId, priceListId))
        .limit(1);
      if (!zohoList) return {};
    }
    
    const prices = await db
      .select({
        productId: customerPrices.productId,
        customPrice: customerPrices.customPrice,
      })
      .from(customerPrices)
      .where(eq(customerPrices.priceListId, priceListId));
    
    const priceMap: Record<string, string> = {};
    for (const price of prices) {
      if (productIds.includes(price.productId)) {
        priceMap[price.productId] = price.customPrice;
      }
    }
    return priceMap;
  }

  // Cart operations
  async getCart(userId: string): Promise<Cart | undefined> {
    const [cart] = await db.select().from(carts).where(eq(carts.userId, userId));
    return cart;
  }

  async getOrCreateCart(userId: string): Promise<Cart> {
    let cart = await this.getCart(userId);
    if (!cart) {
      const [newCart] = await db.insert(carts).values({ userId }).returning();
      cart = newCart;
    }
    return cart;
  }

  async getCartItem(id: string): Promise<CartItem | undefined> {
    const [item] = await db.select().from(cartItems).where(eq(cartItems.id, id));
    return item;
  }

  async getCartItems(cartId: string): Promise<(CartItem & { product: Product })[]> {
    const items = await db.select()
      .from(cartItems)
      .innerJoin(products, eq(cartItems.productId, products.id))
      .where(eq(cartItems.cartId, cartId));
    
    return items.map(item => ({
      ...item.cart_items,
      product: item.products
    }));
  }

  async getAllActiveCarts(): Promise<{ cart: Cart; user: SafeUser; items: (CartItem & { product: Product })[] }[]> {
    const allCarts = await db.select()
      .from(carts)
      .innerJoin(users, eq(carts.userId, users.id))
      .where(gt(carts.itemCount, 0))
      .orderBy(desc(carts.updatedAt));
    
    const result = await Promise.all(allCarts.map(async (row) => {
      const items = await this.getCartItems(row.carts.id);
      const { password, ...safeUser } = row.users;
      return {
        cart: row.carts,
        user: safeUser as SafeUser,
        items
      };
    }));
    
    return result;
  }

  async getEffectivePriceForCart(cartId: string, productId: string, basePrice: string): Promise<string> {
    const [cart] = await db.select().from(carts).where(eq(carts.id, cartId)).limit(1);
    if (!cart) return basePrice;
    
    const user = await this.getUser(cart.userId);
    if (!user?.priceListId) return basePrice;
    
    const customerPrices = await this.getCustomerPricesForProducts(user.priceListId, [productId]);
    return customerPrices[productId] || basePrice;
  }

  async addToCart(cartId: string, productId: string, quantity: number): Promise<CartItem> {
    const product = await this.getProductInternal(productId);
    if (!product) throw new Error('Product not found');
    
    // Check if product is buyable (online and in stock)
    if (!product.isOnline) {
      throw new Error(`Product "${product.name}" is no longer available for purchase`);
    }
    
    const stockQty = product.stockQuantity || 0;
    if (stockQty <= 0) {
      throw new Error(`Product "${product.name}" is out of stock`);
    }
    
    // Get effective price (customer price if available, otherwise base price)
    const effectivePrice = await this.getEffectivePriceForCart(cartId, productId, product.basePrice);
    
    // Check if item already exists in cart
    const [existingItem] = await db.select()
      .from(cartItems)
      .where(and(eq(cartItems.cartId, cartId), eq(cartItems.productId, productId)));
    
    const newQuantity = existingItem ? existingItem.quantity + quantity : quantity;
    
    // Check if requested quantity exceeds available stock
    if (newQuantity > stockQty) {
      throw new Error(`Only ${stockQty} units of "${product.name}" available in stock`);
    }
    
    let cartItem: CartItem;
    
    if (existingItem) {
      const lineTotal = (parseFloat(effectivePrice) * newQuantity).toFixed(2);
      const [updated] = await db.update(cartItems)
        .set({ quantity: newQuantity, unitPrice: effectivePrice, lineTotal, updatedAt: new Date() })
        .where(eq(cartItems.id, existingItem.id))
        .returning();
      cartItem = updated;
    } else {
      const lineTotal = (parseFloat(effectivePrice) * quantity).toFixed(2);
      const [newItem] = await db.insert(cartItems)
        .values({
          cartId,
          productId,
          quantity,
          unitPrice: effectivePrice,
          lineTotal
        })
        .returning();
      cartItem = newItem;
    }
    
    await this.updateCartTotals(cartId);
    return cartItem;
  }

  async updateCartItem(cartItemId: string, quantity: number): Promise<CartItem | undefined> {
    const [item] = await db.select().from(cartItems).where(eq(cartItems.id, cartItemId));
    if (!item) return undefined;
    
    const product = await this.getProductInternal(item.productId);
    if (!product) return undefined;
    
    // Check if product is still available
    if (!product.isOnline) {
      throw new Error(`Product "${product.name}" is no longer available for purchase`);
    }
    
    // Check stock availability for the new quantity
    const stockQty = product.stockQuantity || 0;
    if (stockQty <= 0) {
      throw new Error(`Product "${product.name}" is out of stock`);
    }
    if (quantity > stockQty) {
      throw new Error(`Only ${stockQty} units of "${product.name}" available in stock`);
    }
    
    // Get effective price (customer price if available, otherwise base price)
    const effectivePrice = await this.getEffectivePriceForCart(item.cartId, item.productId, product.basePrice);
    
    const lineTotal = (parseFloat(effectivePrice) * quantity).toFixed(2);
    const [updated] = await db.update(cartItems)
      .set({ quantity, unitPrice: effectivePrice, lineTotal, updatedAt: new Date() })
      .where(eq(cartItems.id, cartItemId))
      .returning();
    
    await this.updateCartTotals(item.cartId);
    return updated;
  }

  async removeCartItem(cartItemId: string): Promise<void> {
    const [item] = await db.select().from(cartItems).where(eq(cartItems.id, cartItemId));
    if (item) {
      await db.delete(cartItems).where(eq(cartItems.id, cartItemId));
      await this.updateCartTotals(item.cartId);
    }
  }

  async clearCart(cartId: string): Promise<void> {
    await db.delete(cartItems).where(eq(cartItems.cartId, cartId));
    await this.updateCartTotals(cartId);
  }

  async updateCartTotals(cartId: string): Promise<void> {
    const items = await db.select().from(cartItems).where(eq(cartItems.cartId, cartId));
    const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);
    const subtotal = items.reduce((sum, item) => sum + parseFloat(item.lineTotal), 0).toFixed(2);
    
    await db.update(carts)
      .set({ itemCount, subtotal, updatedAt: new Date() })
      .where(eq(carts.id, cartId));
  }

  // Order operations
  async createOrder(userId: string, shippingInfo: { address?: string; city?: string; state?: string; zipCode?: string }): Promise<Order> {
    const cart = await this.getCart(userId);
    if (!cart) throw new Error('Cart not found');
    
    const items = await this.getCartItems(cart.id);
    if (items.length === 0) throw new Error('Cart is empty');
    
    // Validate stock for all items before creating order
    const outOfStockItems: string[] = [];
    const insufficientStockItems: string[] = [];
    
    for (const item of items) {
      const product = item.product;
      const stockQty = product.stockQuantity || 0;
      
      if (!product.isOnline) {
        outOfStockItems.push(`${product.name} (SKU: ${product.sku}) is no longer available`);
      } else if (stockQty <= 0) {
        outOfStockItems.push(`${product.name} (SKU: ${product.sku}) is out of stock`);
      } else if (item.quantity > stockQty) {
        insufficientStockItems.push(`${product.name} (SKU: ${product.sku}): only ${stockQty} available, you have ${item.quantity} in cart`);
      }
    }
    
    if (outOfStockItems.length > 0 || insufficientStockItems.length > 0) {
      const allIssues = [...outOfStockItems, ...insufficientStockItems];
      throw new Error(`Unable to place order:\n${allIssues.join('\n')}`);
    }
    
    const subtotal = parseFloat(cart.subtotal || '0');
    const taxAmount = 0; // Can be calculated based on shipping address
    const shippingAmount = 0; // Can be calculated based on order total
    const totalAmount = (subtotal + taxAmount + shippingAmount).toFixed(2);
    
    const [order] = await db.insert(orders).values({
      orderNumber: generateOrderNumber(),
      userId,
      subtotal: cart.subtotal || '0',
      taxAmount: taxAmount.toFixed(2),
      shippingAmount: shippingAmount.toFixed(2),
      totalAmount,
      shippingAddress: shippingInfo.address,
      shippingCity: shippingInfo.city,
      shippingState: shippingInfo.state,
      shippingZipCode: shippingInfo.zipCode,
      status: OrderStatus.PENDING_APPROVAL
    }).returning();
    
    // Create order items
    for (const item of items) {
      await db.insert(orderItems).values({
        orderId: order.id,
        productId: item.productId,
        sku: item.product.sku,
        productName: item.product.name,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        lineTotal: item.lineTotal
      });
    }
    
    // Clear cart
    await this.clearCart(cart.id);
    
    return order;
  }

  async getOrder(id: string): Promise<Order | undefined> {
    const [order] = await db.select().from(orders).where(eq(orders.id, id));
    return order;
  }

  async getOrderWithItems(id: string): Promise<{ order: Order; items: (OrderItem & { product: Product })[] } | undefined> {
    const order = await this.getOrder(id);
    if (!order) return undefined;
    
    const items = await db.select()
      .from(orderItems)
      .innerJoin(products, eq(orderItems.productId, products.id))
      .where(eq(orderItems.orderId, id));
    
    return {
      order,
      items: items.map(item => ({
        ...item.order_items,
        product: item.products
      }))
    };
  }

  async getUserOrders(userId: string): Promise<Order[]> {
    return db.select()
      .from(orders)
      .where(eq(orders.userId, userId))
      .orderBy(desc(orders.createdAt));
  }

  async getAllOrders(): Promise<(Order & { user: SafeUser })[]> {
    const result = await db.select()
      .from(orders)
      .innerJoin(users, eq(orders.userId, users.id))
      .orderBy(desc(orders.createdAt));
    
    return result.map(row => ({
      ...row.orders,
      user: toSafeUser(row.users)
    }));
  }

  async updateOrderStatus(id: string, status: OrderStatusType, adminId?: string, reason?: string): Promise<Order | undefined> {
    const updateData: Partial<Order> = {
      status,
      updatedAt: new Date()
    };
    
    if (status === OrderStatus.APPROVED && adminId) {
      updateData.approvedBy = adminId;
      updateData.approvedAt = new Date();
    } else if (status === OrderStatus.REJECTED && adminId) {
      updateData.rejectedBy = adminId;
      updateData.rejectedAt = new Date();
      updateData.rejectionReason = reason;
    }
    
    const [updated] = await db.update(orders)
      .set(updateData)
      .where(eq(orders.id, id))
      .returning();
    
    return updated;
  }

  async updateOrderZohoInfo(id: string, zohoSalesOrderId: string): Promise<Order | undefined> {
    const [updated] = await db.update(orders)
      .set({
        zohoSalesOrderId,
        zohoPushedAt: new Date(),
        updatedAt: new Date()
      })
      .where(eq(orders.id, id))
      .returning();
    
    return updated;
  }

  // Admin visibility queries
  async getHighlightedProducts(): Promise<Product[]> {
    return db.select()
      .from(products)
      .where(and(eq(products.isHighlighted, true), eq(products.isOnline, true)))
      .orderBy(desc(products.updatedAt));
  }

  async setProductHighlight(productId: string, isHighlighted: boolean): Promise<Product | undefined> {
    const [updated] = await db.update(products)
      .set({ isHighlighted, updatedAt: new Date() })
      .where(eq(products.id, productId))
      .returning();
    return updated;
  }

  async getTopSellingProducts(limit: number = 24): Promise<Product[]> {
    // First, check if we have cached top sellers from Zoho Books
    // Fetch all cache entries to ensure we can fill up to limit unique display items
    const cachedTopSellers = await db.select()
      .from(topSellersCache)
      .orderBy(asc(topSellersCache.rank));

    if (cachedTopSellers.length > 0) {
      // Deduplicate IDs before querying
      const productIds = Array.from(new Set(cachedTopSellers.map(c => c.productId).filter(Boolean) as string[]));
      const groupIds = Array.from(new Set(cachedTopSellers.map(c => c.zohoGroupId).filter(Boolean) as string[]));
      
      // Get all products by IDs
      const allProducts = productIds.length > 0 ? await db.select()
        .from(products)
        .where(and(
          sql`${products.id} IN (${sql.join(productIds.map(id => sql`${id}`), sql`, `)})`,
          eq(products.isOnline, true),
          eq(products.isActive, true)
        )) : [];
      
      // Get representative products for all groups
      const groupProducts = groupIds.length > 0 ? await db.select()
        .from(products)
        .where(and(
          sql`${products.zohoGroupId} IN (${sql.join(groupIds.map(id => sql`${id}`), sql`, `)})`,
          eq(products.isOnline, true),
          eq(products.isActive, true)
        ))
        .orderBy(asc(products.sku)) : [];
      
      // Build maps for fast lookup
      const productMap = new Map(allProducts.map(p => [p.id, p]));
      const groupRepMap = new Map<string, Product>();
      for (const p of groupProducts) {
        if (p.zohoGroupId && !groupRepMap.has(p.zohoGroupId)) {
          groupRepMap.set(p.zohoGroupId, p);
        }
      }
      
      // Build result list with group-aware logic
      const seenGroupIds = new Set<string>();
      const seenProductIds = new Set<string>();
      const resultProducts: Product[] = [];

      for (const cached of cachedTopSellers) {
        if (!cached.productId) continue;
        
        const product = productMap.get(cached.productId);
        if (!product) continue;

        // If product is part of a group, show the group tile
        if (cached.zohoGroupId) {
          if (!seenGroupIds.has(cached.zohoGroupId)) {
            seenGroupIds.add(cached.zohoGroupId);
            const groupProduct = groupRepMap.get(cached.zohoGroupId);
            if (groupProduct && !seenProductIds.has(groupProduct.id)) {
              seenProductIds.add(groupProduct.id);
              resultProducts.push(groupProduct);
            }
          }
        } else {
          // Not part of a group, show the individual product
          if (!seenProductIds.has(product.id)) {
            seenProductIds.add(product.id);
            resultProducts.push(product);
          }
        }

        if (resultProducts.length >= limit) break;
      }

      return resultProducts;
    }

    // Fallback to website orders if no cache (legacy behavior)
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

    const topSelling = await db
      .select({
        productId: orderItems.productId,
        totalQuantity: sql<number>`sum(${orderItems.quantity})`.as('total_quantity'),
      })
      .from(orderItems)
      .innerJoin(orders, eq(orderItems.orderId, orders.id))
      .where(
        and(
          gte(orders.createdAt, threeMonthsAgo),
          or(
            eq(orders.status, OrderStatus.APPROVED),
            eq(orders.status, OrderStatus.PROCESSING),
            eq(orders.status, OrderStatus.SHIPPED),
            eq(orders.status, OrderStatus.DELIVERED)
          )
        )
      )
      .groupBy(orderItems.productId)
      .orderBy(sql`sum(${orderItems.quantity}) DESC`)
      .limit(limit);

    if (topSelling.length === 0) {
      return [];
    }

    const productIds = topSelling.map(ts => ts.productId);
    const productResults = await db
      .select()
      .from(products)
      .where(
        and(
          sql`${products.id} IN (${sql.join(productIds.map(id => sql`${id}`), sql`, `)})`,
          eq(products.isOnline, true),
          eq(products.isActive, true)
        )
      );

    const productMap = new Map(productResults.map(p => [p.id, p]));
    return productIds
      .map(id => productMap.get(id))
      .filter((p): p is Product => p !== undefined);
  }

  async getTopSellersByCategory(categorySlug: string, limit: number = 10): Promise<Product[]> {
    // Get category-filtered top sellers from the cache
    const cachedTopSellers = await db.select()
      .from(topSellersCache)
      .orderBy(asc(topSellersCache.rank));

    if (cachedTopSellers.length === 0) {
      return [];
    }

    // Get product IDs from cache
    const productIds = Array.from(new Set(cachedTopSellers.map(c => c.productId).filter(Boolean) as string[]));
    
    if (productIds.length === 0) {
      return [];
    }

    // Normalize the search slug for matching
    const normalizedSlug = categorySlug.toLowerCase().trim();

    // Get products filtered by category slug (exact word match within category)
    // Also filter out negative stock to prevent predictable failures
    const categoryProducts = await db.select()
      .from(products)
      .where(and(
        sql`${products.id} IN (${sql.join(productIds.map(id => sql`${id}`), sql`, `)})`,
        or(
          ilike(products.category, `${normalizedSlug}`),
          ilike(products.category, `${normalizedSlug}-%`),
          ilike(products.category, `%-${normalizedSlug}`),
          ilike(products.category, `%-${normalizedSlug}-%`)
        ),
        eq(products.isOnline, true),
        eq(products.isActive, true),
        gte(products.stockQuantity, 0)
      ));

    // Create a map for ordering by rank
    const rankMap = new Map<string, number>();
    cachedTopSellers.forEach(c => {
      if (c.productId) {
        rankMap.set(c.productId, c.rank);
      }
    });

    // Sort by rank and limit
    return categoryProducts
      .sort((a, b) => (rankMap.get(a.id) || 999) - (rankMap.get(b.id) || 999))
      .slice(0, limit);
  }

  async getHiddenProducts(): Promise<Product[]> {
    return db.select()
      .from(products)
      .where(eq(products.isOnline, false))
      .orderBy(desc(products.updatedAt));
  }

  async getOutOfStockProducts(): Promise<Product[]> {
    return db.select()
      .from(products)
      .where(and(eq(products.isOnline, true), lte(products.stockQuantity, 0)))
      .orderBy(desc(products.updatedAt));
  }

  async getLatestProductsOrGroups(limit: number = 12): Promise<Product[]> {
    // Get all online products with non-negative stock, sorted by createdAt descending
    const allProducts = await db.select()
      .from(products)
      .where(and(
        eq(products.isOnline, true),
        eq(products.isActive, true),
        gte(products.stockQuantity, 0)
      ))
      .orderBy(desc(products.createdAt));
    
    // Deduplicate by group - keep only the first (newest) product per group
    const seenGroups = new Set<string>();
    const result: Product[] = [];
    
    for (const product of allProducts) {
      if (result.length >= limit) break;
      
      if (product.zohoGroupId) {
        // For grouped products, only include one per group
        if (!seenGroups.has(product.zohoGroupId)) {
          seenGroups.add(product.zohoGroupId);
          result.push(product);
        }
      } else {
        // Non-grouped products are counted individually
        result.push(product);
      }
    }
    
    return result;
  }

  async getInactiveCustomers(): Promise<SafeUser[]> {
    const result = await db.select()
      .from(users)
      .where(and(eq(users.role, 'customer'), eq(users.status, 'suspended')))
      .orderBy(desc(users.updatedAt));
    
    return result.map(toSafeUser);
  }

  async getSyncHistory(limit: number = 20): Promise<SyncRun[]> {
    return db.select()
      .from(syncRuns)
      .orderBy(desc(syncRuns.startedAt))
      .limit(limit);
  }
  
  async createSyncRun(syncType: string, triggeredBy: string): Promise<SyncRun> {
    const [run] = await db.insert(syncRuns)
      .values({ syncType, triggeredBy })
      .returning();
    return run;
  }
  
  async updateSyncRun(id: string, updates: Partial<SyncRun>): Promise<SyncRun | undefined> {
    const [updated] = await db.update(syncRuns)
      .set(updates)
      .where(eq(syncRuns.id, id))
      .returning();
    return updated;
  }
  
  async updateUserZohoStatus(id: string, isActive: boolean): Promise<SafeUser | undefined> {
    const newStatus = isActive ? UserStatus.APPROVED : UserStatus.SUSPENDED;
    const [updated] = await db.update(users)
      .set({
        zohoIsActive: isActive,
        zohoLastCheckedAt: new Date(),
        status: newStatus,
        updatedAt: new Date()
      })
      .where(eq(users.id, id))
      .returning();
    return updated ? toSafeUser(updated) : undefined;
  }
  
  async updateUserZohoCustomerId(id: string, zohoCustomerId: string): Promise<SafeUser | undefined> {
    const [updated] = await db.update(users)
      .set({
        zohoCustomerId,
        zohoIsActive: true,
        zohoLastCheckedAt: new Date(),
        updatedAt: new Date()
      })
      .where(eq(users.id, id))
      .returning();
    return updated ? toSafeUser(updated) : undefined;
  }
  
  async getUsersWithZohoCustomerId(): Promise<User[]> {
    return db.select()
      .from(users)
      .where(and(
        sql`${users.zohoCustomerId} IS NOT NULL`,
        ne(users.zohoCustomerId, '')
      ));
  }
  
  // Job operations for retryable Zoho operations
  async createJob(job: { jobType: JobTypeValue; userId?: string; orderId?: string; payload?: string }): Promise<Job> {
    const [newJob] = await db.insert(jobs)
      .values({
        jobType: job.jobType,
        userId: job.userId,
        orderId: job.orderId,
        payload: job.payload,
        status: JobStatus.PENDING
      })
      .returning();
    return newJob;
  }
  
  async getJob(id: string): Promise<Job | undefined> {
    const [job] = await db.select().from(jobs).where(eq(jobs.id, id));
    return job;
  }
  
  async getPendingJobs(): Promise<Job[]> {
    return db.select()
      .from(jobs)
      .where(eq(jobs.status, JobStatus.PENDING))
      .orderBy(asc(jobs.createdAt));
  }
  
  async getJobsByUser(userId: string): Promise<Job[]> {
    return db.select()
      .from(jobs)
      .where(eq(jobs.userId, userId))
      .orderBy(desc(jobs.createdAt));
  }
  
  async getJobsByOrder(orderId: string): Promise<Job[]> {
    return db.select()
      .from(jobs)
      .where(eq(jobs.orderId, orderId))
      .orderBy(desc(jobs.createdAt));
  }
  
  async getFailedJobs(): Promise<Job[]> {
    return db.select()
      .from(jobs)
      .where(eq(jobs.status, JobStatus.FAILED))
      .orderBy(desc(jobs.updatedAt));
  }
  
  async updateJob(id: string, updates: Partial<Job>): Promise<Job | undefined> {
    const [updated] = await db.update(jobs)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(jobs.id, id))
      .returning();
    return updated;
  }
  
  async markJobProcessing(id: string): Promise<Job | undefined> {
    const [job] = await db.select().from(jobs).where(eq(jobs.id, id));
    if (!job) return undefined;
    
    const [updated] = await db.update(jobs)
      .set({
        status: JobStatus.PROCESSING,
        attempts: (job.attempts || 0) + 1,
        lastAttemptAt: new Date(),
        updatedAt: new Date()
      })
      .where(eq(jobs.id, id))
      .returning();
    return updated;
  }
  
  async markJobCompleted(id: string): Promise<Job | undefined> {
    const [updated] = await db.update(jobs)
      .set({
        status: JobStatus.COMPLETED,
        completedAt: new Date(),
        updatedAt: new Date()
      })
      .where(eq(jobs.id, id))
      .returning();
    return updated;
  }
  
  async markJobFailed(id: string, errorMessage: string): Promise<Job | undefined> {
    const [job] = await db.select().from(jobs).where(eq(jobs.id, id));
    if (!job) return undefined;
    
    // If max attempts reached, mark as failed permanently
    const newStatus = (job.attempts || 0) >= (job.maxAttempts || 3) 
      ? JobStatus.FAILED 
      : JobStatus.PENDING;
    
    const [updated] = await db.update(jobs)
      .set({
        status: newStatus,
        errorMessage,
        updatedAt: new Date()
      })
      .where(eq(jobs.id, id))
      .returning();
    return updated;
  }
  
  // Category operations
  async getCategories(): Promise<Category[]> {
    return await db.select()
      .from(categories)
      .where(and(
        eq(categories.isActive, true),
        ne(categories.slug, 'root') // Exclude ROOT category from display
      ))
      .orderBy(asc(categories.displayOrder), asc(categories.name));
  }
  
  async getCategoryBySlug(slug: string): Promise<Category | undefined> {
    const [category] = await db.select()
      .from(categories)
      .where(eq(categories.slug, slug));
    return category;
  }
  
  async getCategoryByZohoId(zohoCategoryId: string): Promise<Category | undefined> {
    const [category] = await db.select()
      .from(categories)
      .where(eq(categories.zohoCategoryId, zohoCategoryId));
    return category;
  }
  
  async upsertCategory(category: InsertCategory): Promise<Category> {
    // Try to find existing by Zoho ID first
    if (category.zohoCategoryId) {
      const existing = await this.getCategoryByZohoId(category.zohoCategoryId);
      if (existing) {
        const [updated] = await db.update(categories)
          .set({
            name: category.name,
            slug: category.slug,
            description: category.description,
            displayOrder: category.displayOrder,
            isActive: category.isActive,
            updatedAt: new Date()
          })
          .where(eq(categories.id, existing.id))
          .returning();
        return updated;
      }
    }
    
    // Check if slug exists
    const existingSlug = await this.getCategoryBySlug(category.slug);
    if (existingSlug) {
      const [updated] = await db.update(categories)
        .set({
          name: category.name,
          description: category.description,
          zohoCategoryId: category.zohoCategoryId,
          displayOrder: category.displayOrder,
          isActive: category.isActive,
          updatedAt: new Date()
        })
        .where(eq(categories.id, existingSlug.id))
        .returning();
      return updated;
    }
    
    // Create new
    const [created] = await db.insert(categories)
      .values({
        name: category.name,
        slug: category.slug,
        description: category.description,
        zohoCategoryId: category.zohoCategoryId,
        displayOrder: category.displayOrder ?? 0,
        isActive: category.isActive ?? true,
      })
      .returning();
    return created;
  }

  // Zoho API log operations
  async logZohoApiCall(log: InsertZohoApiLog): Promise<ZohoApiLog> {
    const [created] = await db.insert(zohoApiLogs)
      .values(log)
      .returning();
    return created;
  }

  async getZohoApiCallStats(sinceDate: Date): Promise<{ total: number; success: number; failed: number }> {
    const result = await db.select({
      total: sql<number>`COUNT(*)::int`,
      success: sql<number>`SUM(CASE WHEN ${zohoApiLogs.success} = true THEN 1 ELSE 0 END)::int`,
      failed: sql<number>`SUM(CASE WHEN ${zohoApiLogs.success} = false THEN 1 ELSE 0 END)::int`,
    })
    .from(zohoApiLogs)
    .where(gte(zohoApiLogs.createdAt, sinceDate));
    
    return {
      total: result[0]?.total || 0,
      success: result[0]?.success || 0,
      failed: result[0]?.failed || 0,
    };
  }

  // Email campaign template operations
  async getEmailTemplates(): Promise<EmailCampaignTemplate[]> {
    return db.select()
      .from(emailCampaignTemplates)
      .orderBy(desc(emailCampaignTemplates.createdAt));
  }

  async getEmailTemplateById(id: string): Promise<EmailCampaignTemplate | undefined> {
    const [template] = await db.select()
      .from(emailCampaignTemplates)
      .where(eq(emailCampaignTemplates.id, id));
    return template;
  }

  async getApprovedTemplateForCampaign(campaignType: string): Promise<EmailCampaignTemplate | undefined> {
    const [template] = await db.select()
      .from(emailCampaignTemplates)
      .where(and(
        eq(emailCampaignTemplates.campaignType, campaignType),
        eq(emailCampaignTemplates.status, EmailTemplateStatus.APPROVED)
      ))
      .orderBy(desc(emailCampaignTemplates.approvedAt))
      .limit(1);
    return template;
  }

  async createEmailTemplate(template: InsertEmailCampaignTemplate): Promise<EmailCampaignTemplate> {
    const [created] = await db.insert(emailCampaignTemplates)
      .values(template)
      .returning();
    return created;
  }

  async updateEmailTemplate(id: string, updates: Partial<InsertEmailCampaignTemplate>): Promise<EmailCampaignTemplate | undefined> {
    const [updated] = await db.update(emailCampaignTemplates)
      .set({
        ...updates,
        updatedAt: new Date()
      })
      .where(eq(emailCampaignTemplates.id, id))
      .returning();
    return updated;
  }

  async approveEmailTemplate(id: string, approvedById: string): Promise<EmailCampaignTemplate | undefined> {
    const [updated] = await db.update(emailCampaignTemplates)
      .set({
        status: EmailTemplateStatus.APPROVED,
        approvedById,
        approvedAt: new Date(),
        rejectionReason: null,
        updatedAt: new Date()
      })
      .where(eq(emailCampaignTemplates.id, id))
      .returning();
    return updated;
  }

  async rejectEmailTemplate(id: string, reason: string): Promise<EmailCampaignTemplate | undefined> {
    const [updated] = await db.update(emailCampaignTemplates)
      .set({
        status: EmailTemplateStatus.REJECTED,
        rejectionReason: reason,
        updatedAt: new Date()
      })
      .where(eq(emailCampaignTemplates.id, id))
      .returning();
    return updated;
  }

  async deleteEmailTemplate(id: string): Promise<boolean> {
    const result = await db.delete(emailCampaignTemplates)
      .where(eq(emailCampaignTemplates.id, id));
    return true;
  }
}

export const storage = new DatabaseStorage();
