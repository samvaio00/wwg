# WholesaleHub - B2B Wholesale Commerce Platform

## Overview

WholesaleHub is a B2B wholesale commerce platform designed for retailers who purchase:
- Sunglasses
- Cellular accessories
- Caps / headwear
- Perfumes
- Novelty and impulse items for gas stations and convenience stores

The platform integrates with Zoho Inventory and Zoho Books for inventory management and order processing.

## Tech Stack

- **Frontend**: React + Vite + TypeScript + Tailwind CSS + Radix UI (shadcn/ui)
- **Backend**: Express.js + TypeScript
- **Database**: PostgreSQL with Drizzle ORM
- **Authentication**: Session-based with bcrypt password hashing
- **Routing**: wouter (frontend), Express (backend)

## Project Structure

```
├── client/                 # Frontend React application
│   ├── src/
│   │   ├── components/     # Reusable UI components
│   │   ├── pages/          # Page components
│   │   ├── lib/            # Utilities, auth, theme
│   │   └── hooks/          # Custom React hooks
├── server/                 # Backend Express API
│   ├── index.ts            # Server entry point
│   ├── routes.ts           # API routes
│   ├── storage.ts          # Database operations
│   └── db.ts               # Database connection
├── shared/                 # Shared types and schemas
│   └── schema.ts           # Drizzle schema + Zod validation
├── docs/                   # Documentation
│   ├── design.md           # Design system documentation
│   ├── zoho-mapping.md     # Zoho integration field mapping
│   └── ai.md               # AI features and cost control
└── drizzle.config.ts       # Drizzle configuration
```

## Database Schema

### Core Tables
- **users** - User accounts with roles (admin, customer, pending) and status
- **products** - Product catalog with Zoho mapping fields
- **carts** / **cart_items** - Shopping cart functionality
- **orders** / **order_items** - Order management with approval workflow

### AI Tables
- **product_embeddings** - Vector embeddings for semantic search
- **ai_cache** - Cached AI responses for cost control
- **ai_events** - AI usage logging and analytics

## User Roles

- **admin**: Full access to admin portal, user management, order approvals
- **customer**: Approved retailers who can browse products and place orders
- **pending**: Newly registered users awaiting admin approval

## User Status

- **pending**: Awaiting admin approval
- **approved**: Active account with full access
- **rejected**: Application denied
- **suspended**: Account temporarily disabled

## Order Status Flow

`pending_approval` → `approved` → `processing` → `shipped` → `delivered`
                  ↘ `rejected` / `cancelled`

## Product Categories

- `sunglasses` - Sunglasses, eyewear
- `cellular` - Phone accessories, cables, cases
- `caps` - Headwear, baseball caps, beanies
- `perfumes` - Fragrances, body mists
- `novelty` - Impulse items, keychains, air fresheners

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - User logout
- `GET /api/auth/me` - Get current user

### Admin
- `POST /api/admin/setup` - Create initial admin (requires ALLOW_ADMIN_SETUP=true)

### AI Features (requires auth)
- `POST /api/ai/cart-builder` - AI-powered cart building from natural language
- `POST /api/ai/search` - AI-enhanced semantic product search

## Development

### Run the application
```bash
npm run dev
```

### Push database schema
```bash
npm run db:push
```

## Build Phases

### Phase 1 (Complete) - Foundation & Design Base
- Design system with professional B2B theme
- Authentication with email/password
- Admin role support
- Basic layout with sidebar navigation

### Phase 2 (Complete) - Database Models
- Product schema with Zoho mapping fields
- AI tables (product_embeddings, ai_cache, ai_events)
- Order and cart schemas with approval workflow
- Seed data for all product categories
- Documentation: zoho-mapping.md, ai.md

### Phase 3 (Complete) - Signup Flow + Admin Approvals
- Enhanced registration with address fields (address, city, state, zip)
- Pending approval page for new registrants
- Admin user management portal (approve, reject, suspend, reactivate)
- Role-based routing (pending users see approval page)
- **Zoho Books Customer Validation**:
  - On signup: Only allow registration if customer exists and is ACTIVE in Zoho Books
  - On login: Check Zoho Books status; if inactive, suspend user and block login
  - Backend service: `server/zoho-books-service.ts`
  - Users table stores `zohoCustomerId` for linked Zoho Books customers
  - **Email Search**: Checks both main contact email AND contact persons' emails simultaneously
    - Uses parallel API calls to `/contacts` and `/contacts/contactpersons` endpoints
    - A match in either email field identifies the customer

### Phase 4 (Complete) - Shopping Experience
- Product catalog with responsive grid layout
- **Pagination**: 24 products per page with navigation controls (first/prev/next/last, page selector)
- Search by product name, SKU, or brand
- Category filtering via sidebar navigation and dropdown
- Multiple sort options (newest, price, name)
- Shopping cart with add/update/remove functionality
- Checkout flow with shipping address collection
- Order creation and confirmation page
- Customer "My Orders" page with order history
- Admin order management with approve/reject/status workflow
- Cart ownership security verification

### Phase 5 (Complete) - AI Features
- AI Cart Builder: Natural language cart building with product recommendations
  - Describe your store needs, AI suggests products with quantities and reasoning
  - Frontend dialog component on Products page
  - Backend endpoint: POST /api/ai/cart-builder
- AI Enhanced Search: Semantic product search with interpretation
  - Understands natural language queries beyond keyword matching
  - Backend endpoint: POST /api/ai/search
- AI Cost Controls:
  - Response caching with 15-30 min TTL in ai_cache table
  - Event logging in ai_events table (latency, model, cache hits, errors)
  - All AI features use Replit AI Integrations (gpt-4o-mini model)
- Zoho Inventory Integration:
  - OAuth token refresh with caching
  - Admin UI at /admin/settings for sync management
  - Backend endpoints: GET /api/admin/zoho/test, POST /api/admin/zoho/sync
  - Category mapping: sunglasses, cellular, caps, perfumes, novelty
  - Custom field support for case pack size, min order quantity, etc.

### Phase 6 (Complete) - Advanced Integration & Automation
- **Zoho Books Order Push**: Approved orders automatically pushed to Zoho Books as Sales Orders
  - Backend service: `server/zoho-books-service.ts` → `createZohoSalesOrder()`
  - Auto-triggered on order approval if customer has Zoho customer ID
  - Maps order items using product's `zohoItemId`
  - Order stores `zohoSalesOrderId` and `zohoPushedAt` after successful push
- **Pre-computed Searchable Content**: Product embeddings for optimized AI search
  - Stores pre-computed searchable text in `product_embeddings` table
  - Admin endpoint: POST /api/admin/embeddings/generate
  - Note: True vector embeddings would require separate OpenAI API key
- **Automated Scheduled Sync**: Periodic Zoho Inventory sync
  - Backend service: `server/scheduler.ts`
  - Runs Zoho sync every 60 minutes (configurable)
  - Runs embeddings update every 120 minutes (configurable)
  - Initial sync runs on server startup
  - Admin endpoints:
    - GET /api/admin/scheduler/status - View scheduler status
    - PATCH /api/admin/scheduler/config - Update scheduler config
    - POST /api/admin/scheduler/sync - Trigger manual sync
  - Environment variables: SCHEDULER_ENABLED, ZOHO_SYNC_INTERVAL_MINUTES, EMBEDDINGS_UPDATE_INTERVAL_MINUTES

### Phase 7 (Complete) - Online Store, Active Customers, Inventory Buyability
- **Zoho Inventory Online Store Sync**: Sync `isOnline` from Zoho's native "Show in Online Store" toggle
  - Products with `show_in_storefront=false` in Zoho get `isOnline=false` in DB
  - De-listed products are hidden but not deleted (preserves order history)
  - Inventory/pricing only synced for online products
- **Zoho Books Customer Status Sync**: Sync active/inactive status from Zoho Books
  - Users with linked Zoho customers get their status synced
  - Inactive customers automatically suspended (users.status='suspended')
  - Reactivated customers automatically approved again
- **Inventory-Based Buyability**:
  - Products with `stockQuantity <= 0` show "Out of Stock" badge
  - Add-to-cart disabled for out-of-stock products (greyed out)
  - API enforces stock validation on cart add, update, and checkout
  - Checkout blocked if any cart item is out of stock
- **Admin Visibility Views**:
  - GET /api/admin/products/hidden - View offline/hidden products
  - GET /api/admin/products/out-of-stock - View online but out-of-stock products
  - GET /api/admin/customers/inactive - View suspended customers
  - GET /api/admin/sync/history - View sync run logs
- **Sync Run Logging**: All sync operations logged to `sync_runs` table with timing, counts, errors

### Phase 7 Patch (Complete) - Admin-Gated Zoho Operations with Retry Infrastructure
- **Jobs Table for Retryable Zoho Operations**:
  - New `jobs` table in schema for tracking failed Zoho API calls
  - Job types: `create_zoho_customer`, `push_order_to_zoho`
  - Status tracking: pending → processing → completed/failed
  - Max 3 attempts with error logging
- **Admin-Gated Customer Creation in Zoho**:
  - NEW customers (without Zoho ID) are created in Zoho Books during admin approval
  - Existing Zoho customers (who self-registered) skip creation
  - Failed creations queue a retry job
  - Backend: `server/zoho-books-service.ts` → `createZohoCustomer()`
- **Order Push with Retry Queue**:
  - Orders approved but failed to push to Zoho create retry jobs
  - Order status set to "processing" when Zoho push fails (not "approved")
  - Full payload stored in job for later retry
- **Admin Retry UI** (Settings page):
  - View pending and failed jobs
  - "Process Pending Jobs" button for manual processing
  - "Retry" button on individual failed jobs
  - Backend endpoints:
    - GET /api/admin/jobs - View pending/failed jobs
    - POST /api/admin/jobs/:id/retry - Queue job for retry
    - POST /api/admin/jobs/process - Process all pending jobs
- **Dynamic Sync Scheduler**:
  - Business hours (8AM-6PM weekdays): 2-hour sync interval
  - Off-hours/weekends: 6-hour sync interval
  - Scheduler automatically adjusts intervals based on time
- **Job Worker** (`server/job-worker.ts`):
  - Processes pending jobs with full retry logic
  - Updates user's zohoCustomerId on successful customer creation
  - Updates order's zohoSalesOrderId on successful order push

### Phase 8 (Complete) - Vector Embeddings, Order Tracking & Price Lists
- **True Vector Embeddings**: Optional OpenAI API key support for semantic search
  - Uses OpenAI's text-embedding-3-small model (1536 dimensions)
  - Falls back to text-based search if OPENAI_API_KEY not provided
  - Cosine similarity calculation for semantic matching
  - Admin endpoint: POST /api/admin/embeddings/generate
  - Backend service: `server/ai-service.ts` → `generateVectorEmbeddings()`
- **Order Tracking & Shipment Notifications**:
  - New order fields: trackingNumber, carrier, shippedAt, deliveredAt
  - Email notification service with multiple provider support (Resend, SendGrid)
  - Console logging fallback for development environments
  - Automatic notification on ship/deliver events
  - Backend service: `server/email-service.ts`
  - Admin endpoints:
    - PATCH /api/admin/orders/:id/tracking - Update tracking info
    - POST /api/admin/orders/:id/ship - Mark shipped with tracking
    - POST /api/admin/orders/:id/deliver - Mark delivered
  - Admin UI: Ship dialog with carrier selection and tracking number input
  - Notification tracking: shipmentNotificationSentAt, deliveryNotificationSentAt
- **Customer Price Lists from Zoho**:
  - New tables: price_lists, customer_prices
  - Zoho Books price list sync service
  - Customer-specific pricing applied at API level
  - Products API enriched with customerPrice field for authenticated users
  - Backend service: `server/zoho-books-service.ts` → `syncPriceLists()`
  - Admin endpoint: POST /api/admin/zoho/price-lists/sync
  - Users table: priceListId field for linking customers to price lists

### Phase 9+ (Future)
- Enhanced order tracking portal for customers
- Advanced reporting and analytics dashboard
- Bulk order import from spreadsheets

## Online Store Visibility (isOnline field)

The `products.isOnline` boolean field controls whether a product appears in the storefront:
- **true**: Product is visible to customers (default for synced products)
- **false**: Product is hidden from storefront (still exists in database)

This maps to Zoho Inventory's "Show in Online Store" toggle.

**Belt-and-suspenders enforcement:**
1. API level: `getProducts()` filters by `isOnline=true` unless `includeOffline=true`
2. API level: `getProduct()` and `getProductBySku()` return 404 for offline products
3. UI level: Products page also filters results by `isOnline === true`

## Design Principles

- Professional and trustworthy (enterprise-grade)
- Fast and efficient for repeat wholesale buyers
- Practical, grid-based, SKU-driven
- Clean, modern, commercial-polished

Inspired by: Amazon Business, McMaster-Carr, Shopify Plus B2B, Stripe, Apple Business

---

*Last updated: Phase 7 Patch completion*
