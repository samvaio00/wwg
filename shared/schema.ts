import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, boolean, integer, decimal, jsonb, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ================================================================
// ENUMS & CONSTANTS
// ================================================================

// User roles for B2B wholesale platform
export const UserRole = {
  ADMIN: 'admin',
  STAFF: 'staff',
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

// Order status
export const OrderStatus = {
  PENDING_APPROVAL: 'pending_approval',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  PROCESSING: 'processing',
  SHIPPED: 'shipped',
  DELIVERED: 'delivered',
  CANCELLED: 'cancelled',
} as const;

export type OrderStatusType = typeof OrderStatus[keyof typeof OrderStatus];

// Product categories for wholesale
export const ProductCategory = {
  SUNGLASSES: 'sunglasses',
  CELLULAR: 'cellular',
  CAPS: 'caps',
  PERFUMES: 'perfumes',
  NOVELTY: 'novelty',
} as const;

export type ProductCategoryType = typeof ProductCategory[keyof typeof ProductCategory];

// AI event types for logging
export const AIEventType = {
  SEARCH: 'search',
  CART_BUILDER: 'cart_builder',
  INTAKE_SUMMARY: 'intake_summary',
  RISK_FLAG: 'risk_flag',
  CATALOG_ENRICHMENT: 'catalog_enrichment',
  REORDER_SUGGESTION: 'reorder_suggestion',
} as const;

export type AIEventTypeValue = typeof AIEventType[keyof typeof AIEventType];

// Sync types for logging
export const SyncType = {
  ZOHO_INVENTORY: 'zoho_inventory',
  ZOHO_CUSTOMERS: 'zoho_customers',
  EMBEDDINGS: 'embeddings',
  TOP_SELLERS: 'top_sellers',
} as const;

export type SyncTypeValue = typeof SyncType[keyof typeof SyncType];

// ================================================================
// USERS TABLE
// ================================================================

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
  
  // Date of birth (for 21+ verification)
  dateOfBirth: text("date_of_birth"),
  
  // Business documentation
  certificateUrl: text("certificate_url"), // Sales Tax Certificate / Business License

  // Address (for future phases)
  address: text("address"),
  city: text("city"),
  state: text("state"),
  zipCode: text("zip_code"),
  
  // Zoho integration
  zohoCustomerId: text("zoho_customer_id"),
  priceListId: text("price_list_id"), // Customer-specific pricing tier
  zohoIsActive: boolean("zoho_is_active").default(true), // Reflects Zoho Books customer active status
  zohoLastCheckedAt: timestamp("zoho_last_checked_at"), // Last time status was verified
  
  // Profile update request
  profileUpdatePending: boolean("profile_update_pending").default(false),
  pendingProfileData: jsonb("pending_profile_data"), // Stores pending profile changes as JSON
  
  // Email communication preferences
  emailOptIn: boolean("email_opt_in").default(true), // Customer opted in for promotional emails
  
  // Timestamps
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  lastLoginAt: timestamp("last_login_at"),
});

// ================================================================
// PRODUCTS TABLE (Zoho Inventory Mapping)
// ================================================================

export const products = pgTable("products", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  
  // SKU and identification
  sku: text("sku").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  
  // Categorization
  category: text("category").notNull(), // sunglasses, cellular, caps, perfumes, novelty
  subcategory: text("subcategory"),
  brand: text("brand"),
  tags: text("tags").array(), // For AI search and filtering
  
  // Pricing (wholesale)
  basePrice: decimal("base_price", { precision: 10, scale: 2 }).notNull(),
  compareAtPrice: decimal("compare_at_price", { precision: 10, scale: 2 }), // MSRP
  minOrderQuantity: integer("min_order_quantity").default(1),
  casePackSize: integer("case_pack_size").default(1), // Units per case
  
  // Inventory
  stockQuantity: integer("stock_quantity").default(0),
  lowStockThreshold: integer("low_stock_threshold").default(10),
  isActive: boolean("is_active").default(true),
  
  // Online store visibility (maps to Zoho Inventory "Show in Online Store" toggle)
  // TODO Phase 7: Sync this from Zoho's native "Show in Online Store" toggle
  // Only products with isOnline=true should appear in storefront
  // When Zoho sync runs, set isOnline from Zoho; de-list by setting isOnline=false (do not delete)
  isOnline: boolean("is_online").default(false),
  
  // Highlighted products (for homepage display)
  isHighlighted: boolean("is_highlighted").default(false),
  
  // Media
  imageUrl: text("image_url"),
  imageUrls: text("image_urls").array(), // Multiple images
  
  // Zoho Integration
  zohoItemId: text("zoho_item_id"),
  zohoCategoryId: text("zoho_category_id"),
  zohoLastSyncAt: timestamp("zoho_last_sync_at"),
  
  // Zoho Item Groups (for variant products like colors, sizes)
  zohoGroupId: text("zoho_group_id"), // Links variants to their parent group
  zohoGroupName: text("zoho_group_name"), // Name of the item group (e.g., "Polaroid")
  
  // AI-enriched content (generated by AI, not pushed to Zoho without approval)
  aiTitle: text("ai_title"),
  aiBullets: text("ai_bullets").array(),
  aiTags: text("ai_tags").array(),
  aiEnrichedAt: timestamp("ai_enriched_at"),
  
  // Timestamps
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  categoryIdx: index("products_category_idx").on(table.category),
  skuIdx: index("products_sku_idx").on(table.sku),
  activeIdx: index("products_active_idx").on(table.isActive),
}));

// ================================================================
// CATEGORIES TABLE (Synced from Zoho Inventory)
// ================================================================

export const categories = pgTable("categories", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  
  // Category identification
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(), // URL-friendly name for filtering
  description: text("description"),
  
  // Zoho Integration
  zohoCategoryId: text("zoho_category_id").unique(),
  
  // Display settings
  displayOrder: integer("display_order").default(0),
  isActive: boolean("is_active").default(true),
  
  // Timestamps
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertCategorySchema = createInsertSchema(categories).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertCategory = z.infer<typeof insertCategorySchema>;
export type Category = typeof categories.$inferSelect;

// ================================================================
// SPECIALS TABLE (Closeouts/Special Pricing)
// ================================================================

export const specials = pgTable("specials", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  
  // Product group identification (using zohoGroupId to mark entire groups as special)
  zohoGroupId: text("zoho_group_id").notNull().unique(),
  zohoGroupName: text("zoho_group_name").notNull(),
  
  // Special pricing
  specialPrice: decimal("special_price", { precision: 10, scale: 2 }).notNull(),
  originalPrice: decimal("original_price", { precision: 10, scale: 2 }).notNull(),
  
  // Duration (2 weeks from creation by default)
  startAt: timestamp("start_at").defaultNow().notNull(),
  endAt: timestamp("end_at").notNull(),
  
  // Status
  isActive: boolean("is_active").default(true),
  
  // Audit
  createdBy: varchar("created_by", { length: 36 }).references(() => users.id),
  
  // Timestamps
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  groupIdx: index("specials_group_idx").on(table.zohoGroupId),
  activeIdx: index("specials_active_idx").on(table.isActive),
  endAtIdx: index("specials_end_at_idx").on(table.endAt),
}));

export const insertSpecialSchema = createInsertSchema(specials).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertSpecial = z.infer<typeof insertSpecialSchema>;
export type Special = typeof specials.$inferSelect;

// ================================================================
// PRODUCT GROUPS TABLE (Group-level settings for Zoho Item Groups)
// ================================================================

export const productGroups = pgTable("product_groups", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  
  // Zoho group identification
  zohoGroupId: text("zoho_group_id").notNull().unique(),
  zohoGroupName: text("zoho_group_name").notNull(),
  
  // Online visibility (can only be true if group has active products in Zoho)
  // If all products in this group are inactive in Zoho, isOnline should be false
  isOnline: boolean("is_online").default(true),
  
  // Timestamps
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  groupIdIdx: index("product_groups_zoho_group_id_idx").on(table.zohoGroupId),
  onlineIdx: index("product_groups_online_idx").on(table.isOnline),
}));

export const insertProductGroupSchema = createInsertSchema(productGroups).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertProductGroup = z.infer<typeof insertProductGroupSchema>;
export type ProductGroup = typeof productGroups.$inferSelect;

// ================================================================
// CARTS TABLE
// ================================================================

export const carts = pgTable("carts", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id),
  
  // Metadata
  itemCount: integer("item_count").default(0),
  subtotal: decimal("subtotal", { precision: 10, scale: 2 }).default("0"),
  
  // AI Cart Builder metadata
  aiGenerated: boolean("ai_generated").default(false),
  aiPrompt: text("ai_prompt"), // Original prompt used to generate cart
  
  // Timestamps
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  userIdx: index("carts_user_idx").on(table.userId),
}));

// ================================================================
// CART ITEMS TABLE
// ================================================================

export const cartItems = pgTable("cart_items", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  cartId: varchar("cart_id", { length: 36 }).notNull().references(() => carts.id, { onDelete: "cascade" }),
  productId: varchar("product_id", { length: 36 }).notNull().references(() => products.id),
  
  quantity: integer("quantity").notNull().default(1),
  unitPrice: decimal("unit_price", { precision: 10, scale: 2 }).notNull(),
  lineTotal: decimal("line_total", { precision: 10, scale: 2 }).notNull(),
  
  // Timestamps
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  cartIdx: index("cart_items_cart_idx").on(table.cartId),
  productIdx: index("cart_items_product_idx").on(table.productId),
}));

// ================================================================
// ORDERS TABLE
// ================================================================

export const orders = pgTable("orders", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  orderNumber: text("order_number").notNull().unique(),
  userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id),
  
  // Status
  status: text("status").notNull().default(OrderStatus.PENDING_APPROVAL),
  
  // Totals
  subtotal: decimal("subtotal", { precision: 10, scale: 2 }).notNull(),
  taxAmount: decimal("tax_amount", { precision: 10, scale: 2 }).default("0"),
  shippingAmount: decimal("shipping_amount", { precision: 10, scale: 2 }).default("0"),
  totalAmount: decimal("total_amount", { precision: 10, scale: 2 }).notNull(),
  
  // Shipping address
  shippingAddress: text("shipping_address"),
  shippingCity: text("shipping_city"),
  shippingState: text("shipping_state"),
  shippingZipCode: text("shipping_zip_code"),
  
  // Admin workflow
  approvedBy: varchar("approved_by", { length: 36 }).references(() => users.id),
  approvedAt: timestamp("approved_at"),
  rejectedBy: varchar("rejected_by", { length: 36 }).references(() => users.id),
  rejectedAt: timestamp("rejected_at"),
  rejectionReason: text("rejection_reason"),
  
  // Internal notes (admin only)
  internalNotes: text("internal_notes"),
  
  // Shipping tracking
  trackingNumber: text("tracking_number"),
  carrier: text("carrier"), // UPS, FedEx, USPS, etc.
  shippedAt: timestamp("shipped_at"),
  deliveredAt: timestamp("delivered_at"),
  
  // Notification tracking
  shipmentNotificationSentAt: timestamp("shipment_notification_sent_at"),
  deliveryNotificationSentAt: timestamp("delivery_notification_sent_at"),
  
  // Zoho integration
  zohoSalesOrderId: text("zoho_sales_order_id"),
  zohoPushedAt: timestamp("zoho_pushed_at"),
  zohoIdempotencyKey: text("zoho_idempotency_key"), // For safe retries
  
  // Timestamps
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  userIdx: index("orders_user_idx").on(table.userId),
  statusIdx: index("orders_status_idx").on(table.status),
  orderNumberIdx: index("orders_order_number_idx").on(table.orderNumber),
}));

// ================================================================
// ORDER ITEMS TABLE
// ================================================================

export const orderItems = pgTable("order_items", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  orderId: varchar("order_id", { length: 36 }).notNull().references(() => orders.id, { onDelete: "cascade" }),
  productId: varchar("product_id", { length: 36 }).notNull().references(() => products.id),
  
  // Snapshot at time of order
  sku: text("sku").notNull(),
  productName: text("product_name").notNull(),
  
  quantity: integer("quantity").notNull(),
  unitPrice: decimal("unit_price", { precision: 10, scale: 2 }).notNull(),
  lineTotal: decimal("line_total", { precision: 10, scale: 2 }).notNull(),
  
  // Modification tracking (for admin/staff edits)
  originalQuantity: integer("original_quantity"), // Quantity when order was placed
  isModified: boolean("is_modified").default(false), // True if quantity was changed by staff/admin
  isDeleted: boolean("is_deleted").default(false), // True if item was removed (qty set to 0)
  modifiedAt: timestamp("modified_at"), // When the modification was made
  modifiedBy: varchar("modified_by", { length: 36 }), // User ID who made the modification
  
  // Timestamps
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  orderIdx: index("order_items_order_idx").on(table.orderId),
}));

// ================================================================
// AI TABLES
// ================================================================

// Product embeddings for vector search
export const productEmbeddings = pgTable("product_embeddings", {
  sku: text("sku").primaryKey().references(() => products.sku),
  
  // Vector embedding (stored as JSON array for compatibility)
  // In production, consider pgvector extension for native vector support
  embedding: jsonb("embedding"), // Array of floats
  embeddingModel: text("embedding_model").default("text-embedding-3-small"),
  
  // Content used to generate embedding
  embeddedContent: text("embedded_content"), // Concatenated searchable text
  
  // Timestamps
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// AI response cache for cost control
export const aiCache = pgTable("ai_cache", {
  key: text("key").primaryKey(), // hash(user_id + feature + normalized_input + filters)
  
  // Cached response
  responseJson: jsonb("response_json").notNull(),
  
  // Feature metadata
  feature: text("feature").notNull(), // search, cart_builder, intake_summary, etc.
  
  // Expiration
  expiresAt: timestamp("expires_at").notNull(),
  
  // Stats
  hitCount: integer("hit_count").default(0),
  
  // Timestamps
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  featureIdx: index("ai_cache_feature_idx").on(table.feature),
  expiresIdx: index("ai_cache_expires_idx").on(table.expiresAt),
}));

// AI event logging for analytics and cost monitoring
export const aiEvents = pgTable("ai_events", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  
  // User context
  userId: varchar("user_id", { length: 36 }).references(() => users.id),
  
  // Event details
  eventType: text("event_type").notNull(), // search, cart_builder, intake_summary, etc.
  feature: text("feature").notNull(),
  
  // Request/response metadata
  payloadJson: jsonb("payload_json"), // Input parameters
  responseJson: jsonb("response_json"), // AI response (truncated if large)
  
  // Cost tracking
  tokenEstimate: integer("token_estimate"),
  latencyMs: integer("latency_ms"),
  cacheHit: boolean("cache_hit").default(false),
  modelUsed: text("model_used"),
  
  // Error tracking
  errorMessage: text("error_message"),
  
  // Timestamps
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  userIdx: index("ai_events_user_idx").on(table.userId),
  eventTypeIdx: index("ai_events_type_idx").on(table.eventType),
  createdAtIdx: index("ai_events_created_idx").on(table.createdAt),
}));

// ================================================================
// SYNC RUNS TABLE (for logging sync operations)
// ================================================================

export const syncRuns = pgTable("sync_runs", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  
  // Sync type: zoho_inventory, zoho_customers, embeddings
  syncType: text("sync_type").notNull(),
  
  // Status: running, completed, failed
  status: text("status").notNull().default("running"),
  
  // Counts
  totalProcessed: integer("total_processed").default(0),
  created: integer("created").default(0),
  updated: integer("updated").default(0),
  skipped: integer("skipped").default(0),
  errors: integer("errors").default(0),
  
  // Timing
  startedAt: timestamp("started_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
  durationMs: integer("duration_ms"),
  
  // Error details
  errorMessages: text("error_messages").array(),
  
  // Metadata
  triggeredBy: text("triggered_by"), // "scheduler", "manual", "startup"
}, (table) => ({
  syncTypeIdx: index("sync_runs_type_idx").on(table.syncType),
  startedAtIdx: index("sync_runs_started_idx").on(table.startedAt),
}));

// ================================================================
// JOBS TABLE (for retryable Zoho operations)
// ================================================================

export const JobType = {
  CREATE_ZOHO_CUSTOMER: "create_zoho_customer",
  PUSH_ORDER_TO_ZOHO: "push_order_to_zoho",
} as const;

export const JobStatus = {
  PENDING: "pending",
  PROCESSING: "processing",
  COMPLETED: "completed",
  FAILED: "failed",
} as const;

export type JobTypeValue = (typeof JobType)[keyof typeof JobType];
export type JobStatusValue = (typeof JobStatus)[keyof typeof JobStatus];

export const jobs = pgTable("jobs", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  
  // Job type: create_zoho_customer, push_order_to_zoho
  jobType: text("job_type").notNull(),
  
  // Status: pending, processing, completed, failed
  status: text("status").notNull().default(JobStatus.PENDING),
  
  // Reference to related entity
  userId: varchar("user_id", { length: 36 }).references(() => users.id),
  orderId: varchar("order_id", { length: 36 }).references(() => orders.id),
  
  // Payload (JSON with job-specific data)
  payload: text("payload"),
  
  // Error tracking
  errorMessage: text("error_message"),
  attempts: integer("attempts").default(0),
  maxAttempts: integer("max_attempts").default(3),
  
  // Timestamps
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  lastAttemptAt: timestamp("last_attempt_at"),
  completedAt: timestamp("completed_at"),
}, (table) => ({
  jobTypeIdx: index("jobs_type_idx").on(table.jobType),
  statusIdx: index("jobs_status_idx").on(table.status),
  userIdIdx: index("jobs_user_id_idx").on(table.userId),
  orderIdIdx: index("jobs_order_id_idx").on(table.orderId),
}));

export type Job = typeof jobs.$inferSelect;
export type InsertJob = typeof jobs.$inferInsert;

// ================================================================
// ZOHO API LOGS TABLE (Track API calls for monitoring)
// ================================================================

export const zohoApiLogs = pgTable("zoho_api_logs", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  
  // API endpoint called
  endpoint: text("endpoint").notNull(),
  
  // HTTP method
  method: text("method").notNull(),
  
  // Response status
  statusCode: integer("status_code"),
  
  // Success/failure
  success: boolean("success").notNull().default(true),
  
  // Error message if failed
  errorMessage: text("error_message"),
  
  // Timestamp
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  endpointIdx: index("zoho_api_logs_endpoint_idx").on(table.endpoint),
  createdAtIdx: index("zoho_api_logs_created_at_idx").on(table.createdAt),
}));

export type ZohoApiLog = typeof zohoApiLogs.$inferSelect;
export type InsertZohoApiLog = typeof zohoApiLogs.$inferInsert;

// ================================================================
// TOP SELLERS CACHE TABLE (Zoho Books sales data)
// ================================================================

export const topSellersCache = pgTable("top_sellers_cache", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  
  // Product identifier - can be productId or groupId
  productId: varchar("product_id", { length: 36 }),
  zohoItemId: text("zoho_item_id"),
  zohoGroupId: text("zoho_group_id"),
  
  // Sales data
  totalQuantitySold: integer("total_quantity_sold").default(0),
  totalRevenue: decimal("total_revenue", { precision: 12, scale: 2 }).default("0"),
  orderCount: integer("order_count").default(0),
  
  // Ranking
  rank: integer("rank").notNull(),
  
  // Period info
  periodStartDate: timestamp("period_start_date").notNull(),
  periodEndDate: timestamp("period_end_date").notNull(),
  
  // Timestamps
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  productIdIdx: index("top_sellers_product_id_idx").on(table.productId),
  zohoItemIdIdx: index("top_sellers_zoho_item_id_idx").on(table.zohoItemId),
  zohoGroupIdIdx: index("top_sellers_zoho_group_id_idx").on(table.zohoGroupId),
  rankIdx: index("top_sellers_rank_idx").on(table.rank),
}));

export type TopSellerCache = typeof topSellersCache.$inferSelect;
export type InsertTopSellerCache = typeof topSellersCache.$inferInsert;

// ================================================================
// PRICE LISTS TABLE (Zoho price list sync)
// ================================================================

export const priceLists = pgTable("price_lists", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  
  // Zoho mapping
  zohoPriceListId: text("zoho_price_list_id").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  
  // Type: fixed, percentage_markup, percentage_discount
  priceListType: text("price_list_type"),
  
  // Currency
  currencyCode: text("currency_code").default("USD"),
  
  // Status
  isActive: boolean("is_active").default(true),
  
  // Timestamps
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  zohoLastSyncedAt: timestamp("zoho_last_synced_at"),
}, (table) => ({
  zohoPriceListIdIdx: index("price_lists_zoho_id_idx").on(table.zohoPriceListId),
}));

export type PriceList = typeof priceLists.$inferSelect;
export type InsertPriceList = typeof priceLists.$inferInsert;

// ================================================================
// CUSTOMER PRICES TABLE (item-level custom pricing)
// ================================================================

export const customerPrices = pgTable("customer_prices", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  
  // References
  priceListId: varchar("price_list_id", { length: 36 }).notNull().references(() => priceLists.id, { onDelete: "cascade" }),
  productId: varchar("product_id", { length: 36 }).notNull().references(() => products.id, { onDelete: "cascade" }),
  
  // Zoho mapping
  zohoItemId: text("zoho_item_id"),
  
  // Pricing
  customPrice: decimal("custom_price", { precision: 10, scale: 2 }).notNull(),
  
  // Timestamps
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  priceListIdx: index("customer_prices_price_list_idx").on(table.priceListId),
  productIdx: index("customer_prices_product_idx").on(table.productId),
  uniquePriceListProduct: index("customer_prices_unique_idx").on(table.priceListId, table.productId),
}));

export type CustomerPrice = typeof customerPrices.$inferSelect;
export type InsertCustomerPrice = typeof customerPrices.$inferInsert;

// ================================================================
// EMAIL UNSUBSCRIBE TOKENS TABLE
// ================================================================

export const emailUnsubscribeTokens = pgTable("email_unsubscribe_tokens", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  token: text("token").notNull().unique(),
  userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  tokenIdx: index("email_unsubscribe_tokens_token_idx").on(table.token),
  userIdx: index("email_unsubscribe_tokens_user_idx").on(table.userId),
}));

export type EmailUnsubscribeToken = typeof emailUnsubscribeTokens.$inferSelect;

// ================================================================
// STOCK NOTIFICATIONS TABLE (notify customers when items back in stock)
// ================================================================

export const stockNotifications = pgTable("stock_notifications", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  
  // References
  userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
  productId: varchar("product_id", { length: 36 }).notNull().references(() => products.id, { onDelete: "cascade" }),
  
  // Status tracking
  notifiedAt: timestamp("notified_at"), // When the notification was sent (null = not yet sent)
  stockQuantityWhenRequested: integer("stock_quantity_when_requested").default(0), // Stock level when customer requested notification
  
  // Timestamps
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  userIdx: index("stock_notifications_user_idx").on(table.userId),
  productIdx: index("stock_notifications_product_idx").on(table.productId),
  uniqueUserProduct: index("stock_notifications_unique_idx").on(table.userId, table.productId),
}));

export type StockNotification = typeof stockNotifications.$inferSelect;
export type InsertStockNotification = typeof stockNotifications.$inferInsert;

// ================================================================
// EMAIL CAMPAIGN LOGS TABLE (track sent promotional emails)
// ================================================================

export const EmailCampaignType = {
  NEW_HIGHLIGHTED_ITEMS: 'new_highlighted_items',
  NEW_SKUS: 'new_skus',
  CART_ABANDONMENT: 'cart_abandonment',
} as const;

export type EmailCampaignTypeValue = typeof EmailCampaignType[keyof typeof EmailCampaignType];

export const emailCampaignLogs = pgTable("email_campaign_logs", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  
  // Campaign details
  campaignType: text("campaign_type").notNull(), // new_highlighted_items, new_skus, cart_abandonment
  userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id),
  
  // Email details
  subject: text("subject").notNull(),
  sentAt: timestamp("sent_at").defaultNow().notNull(),
  
  // Reference data (e.g., product IDs, cart ID for abandonment)
  referenceData: jsonb("reference_data"),
  
  // Status
  success: boolean("success").default(true),
  errorMessage: text("error_message"),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  campaignTypeIdx: index("email_campaign_logs_type_idx").on(table.campaignType),
  userIdx: index("email_campaign_logs_user_idx").on(table.userId),
  sentAtIdx: index("email_campaign_logs_sent_idx").on(table.sentAt),
}));

export type EmailCampaignLog = typeof emailCampaignLogs.$inferSelect;

// ================================================================
// EMAIL CAMPAIGN TRACKING (track what items have been promoted)
// ================================================================

export const emailCampaignTracking = pgTable("email_campaign_tracking", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  
  // Track last sync for different campaign types
  campaignType: text("campaign_type").notNull().unique(), // new_highlighted_items, new_skus
  lastSyncAt: timestamp("last_sync_at").defaultNow().notNull(),
  
  // Store IDs that were included in the last campaign (to avoid duplicates)
  lastPromotedIds: text("last_promoted_ids").array(),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type EmailCampaignTracking = typeof emailCampaignTracking.$inferSelect;

// ================================================================
// EMAIL CAMPAIGN TEMPLATES (admin-approved templates)
// ================================================================

export const EmailTemplateStatus = {
  DRAFT: 'draft',
  PENDING_APPROVAL: 'pending_approval',
  APPROVED: 'approved',
  REJECTED: 'rejected',
} as const;

export type EmailTemplateStatusValue = typeof EmailTemplateStatus[keyof typeof EmailTemplateStatus];

export const emailCampaignTemplates = pgTable("email_campaign_templates", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  
  // Template identification
  campaignType: text("campaign_type").notNull(), // new_highlighted_items, new_skus, cart_abandonment
  
  // AI-generated content
  subject: text("subject").notNull(),
  headline: text("headline").notNull(),
  introduction: text("introduction").notNull(),
  callToAction: text("call_to_action").notNull(),
  
  // Prompt used to generate (for regeneration)
  customPrompt: text("custom_prompt"),
  
  // Approval workflow
  status: text("status").notNull().default(EmailTemplateStatus.DRAFT),
  approvedById: varchar("approved_by_id", { length: 36 }).references(() => users.id),
  approvedAt: timestamp("approved_at"),
  rejectionReason: text("rejection_reason"),
  
  // Products associated with this template (for preview)
  productIds: text("product_ids").array(),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type EmailCampaignTemplate = typeof emailCampaignTemplates.$inferSelect;
export type InsertEmailCampaignTemplate = typeof emailCampaignTemplates.$inferInsert;

// ================================================================
// EMAIL ACTION TOKENS TABLE (for approve/reject from email)
// ================================================================

export const EmailActionType = {
  APPROVE_USER: 'approve_user',
  REJECT_USER: 'reject_user',
  APPROVE_ORDER: 'approve_order',
  REJECT_ORDER: 'reject_order',
  APPROVE_PROFILE: 'approve_profile',
  REJECT_PROFILE: 'reject_profile',
} as const;

export type EmailActionTypeValue = typeof EmailActionType[keyof typeof EmailActionType];

export const emailActionTokens = pgTable("email_action_tokens", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  token: text("token").notNull().unique(),
  actionType: text("action_type").notNull(), // approve_user, reject_user, approve_order, etc.
  targetId: text("target_id").notNull(), // userId or orderId
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  tokenIdx: index("email_action_tokens_token_idx").on(table.token),
}));

export type EmailActionToken = typeof emailActionTokens.$inferSelect;
export type InsertEmailActionToken = typeof emailActionTokens.$inferInsert;

// ================================================================
// ZOD SCHEMAS & TYPES
// ================================================================

// User schemas
export const insertUserSchema = createInsertSchema(users).pick({
  email: true,
  password: true,
  businessName: true,
  contactName: true,
  dateOfBirth: true,
  phone: true,
  address: true,
  city: true,
  state: true,
  zipCode: true,
  emailOptIn: true,
  certificateUrl: true,
}).extend({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  businessName: z.string().optional(),
  contactName: z.string().optional(),
  dateOfBirth: z.string().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zipCode: z.string().optional(),
  emailOptIn: z.boolean().optional().default(true),
  certificateUrl: z.string().optional(),
});

export const loginSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

// Product schemas
export const insertProductSchema = createInsertSchema(products).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateProductSchema = insertProductSchema.partial();

// Cart schemas
export const insertCartItemSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().int().positive(),
});

// Order schemas
export const createOrderSchema = z.object({
  shippingAddress: z.string().optional(),
  shippingCity: z.string().optional(),
  shippingState: z.string().optional(),
  shippingZipCode: z.string().optional(),
});

// AI event schema
export const insertAIEventSchema = createInsertSchema(aiEvents).omit({
  id: true,
  createdAt: true,
});

// ================================================================
// TYPES
// ================================================================

// Schema for creating admin or staff users
export const insertAdminStaffSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  contactName: z.string().min(1, "Name is required"),
  role: z.enum(["admin", "staff"], { required_error: "Role is required" }),
});

export type InsertAdminStaff = z.infer<typeof insertAdminStaffSchema>;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type LoginCredentials = z.infer<typeof loginSchema>;
export type User = typeof users.$inferSelect;
export type SafeUser = Omit<User, 'password'>;

export type Product = typeof products.$inferSelect;
export type InsertProduct = z.infer<typeof insertProductSchema>;

export type Cart = typeof carts.$inferSelect;
export type CartItem = typeof cartItems.$inferSelect;

export type Order = typeof orders.$inferSelect;
export type OrderItem = typeof orderItems.$inferSelect;

export type ProductEmbedding = typeof productEmbeddings.$inferSelect;
export type AICache = typeof aiCache.$inferSelect;
export type AIEvent = typeof aiEvents.$inferSelect;
export type SyncRun = typeof syncRuns.$inferSelect;

// ================================================================
// HELPERS
// ================================================================

export function toSafeUser(user: User): SafeUser {
  const { password, ...safeUser } = user;
  return safeUser;
}

// Generate order number
export function generateOrderNumber(): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `WH-${timestamp}-${random}`;
}

// Generate AI cache key
export function generateAICacheKey(
  feature: string,
  userId: string | null,
  input: string,
  filters?: Record<string, unknown>
): string {
  const normalized = input.toLowerCase().trim();
  const filterStr = filters ? JSON.stringify(filters) : '';
  const combined = `${feature}:${userId || 'anon'}:${normalized}:${filterStr}`;
  // Simple hash for cache key
  let hash = 0;
  for (let i = 0; i < combined.length; i++) {
    const char = combined.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return `${feature}_${Math.abs(hash).toString(36)}`;
}

// ================================================================
// AI CHAT MODELS (for Replit AI Integrations)
// ================================================================

export * from "./models/chat";
