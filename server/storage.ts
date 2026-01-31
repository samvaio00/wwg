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
  users,
  products,
  carts,
  cartItems,
  orders,
  orderItems,
  toSafeUser,
  UserRole,
  UserStatus,
  OrderStatus,
  generateOrderNumber,
  type UserStatusType,
  type UserRoleType,
  type OrderStatusType
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, ne, ilike, or, asc, sql } from "drizzle-orm";
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
  
  // Auth operations
  validatePassword(plainPassword: string, hashedPassword: string): Promise<boolean>;
  hashPassword(password: string): Promise<string>;
  
  // Product operations
  getProducts(options?: { category?: string; search?: string; sortBy?: string; sortOrder?: string }): Promise<Product[]>;
  getProduct(id: string): Promise<Product | undefined>;
  getProductBySku(sku: string): Promise<Product | undefined>;
  createProduct(product: InsertProduct): Promise<Product>;
  updateProduct(id: string, product: Partial<InsertProduct>): Promise<Product | undefined>;
  
  // Cart operations
  getCart(userId: string): Promise<Cart | undefined>;
  getOrCreateCart(userId: string): Promise<Cart>;
  getCartItem(id: string): Promise<CartItem | undefined>;
  getCartItems(cartId: string): Promise<(CartItem & { product: Product })[]>;
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
  async getProducts(options?: { category?: string; search?: string; sortBy?: string; sortOrder?: string; includeOffline?: boolean }): Promise<Product[]> {
    const conditions = [eq(products.isActive, true)];
    
    // Belt-and-suspenders: Always filter by isOnline=true for storefront unless explicitly requested
    if (!options?.includeOffline) {
      conditions.push(eq(products.isOnline, true));
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
    
    return db.select()
      .from(products)
      .where(and(...conditions))
      .orderBy(orderBy);
  }

  async getProduct(id: string): Promise<Product | undefined> {
    const [product] = await db.select().from(products).where(eq(products.id, id));
    // Return undefined for offline products (treated as 404 by API)
    if (product && product.isOnline !== true) {
      return undefined;
    }
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

  async addToCart(cartId: string, productId: string, quantity: number): Promise<CartItem> {
    const product = await this.getProduct(productId);
    if (!product) throw new Error('Product not found');
    
    // Check if item already exists in cart
    const [existingItem] = await db.select()
      .from(cartItems)
      .where(and(eq(cartItems.cartId, cartId), eq(cartItems.productId, productId)));
    
    let cartItem: CartItem;
    
    if (existingItem) {
      const newQuantity = existingItem.quantity + quantity;
      const lineTotal = (parseFloat(product.basePrice) * newQuantity).toFixed(2);
      const [updated] = await db.update(cartItems)
        .set({ quantity: newQuantity, lineTotal, updatedAt: new Date() })
        .where(eq(cartItems.id, existingItem.id))
        .returning();
      cartItem = updated;
    } else {
      const lineTotal = (parseFloat(product.basePrice) * quantity).toFixed(2);
      const [newItem] = await db.insert(cartItems)
        .values({
          cartId,
          productId,
          quantity,
          unitPrice: product.basePrice,
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
    
    const product = await this.getProduct(item.productId);
    if (!product) return undefined;
    
    const lineTotal = (parseFloat(product.basePrice) * quantity).toFixed(2);
    const [updated] = await db.update(cartItems)
      .set({ quantity, lineTotal, updatedAt: new Date() })
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
}

export const storage = new DatabaseStorage();
