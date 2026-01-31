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

### Phase 4 (Complete) - Shopping Experience
- Product catalog with responsive grid layout
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

### Phase 6+ (Future)
- Zoho Books order push (send orders to Zoho Books)
- AI-powered embeddings for faster semantic search
- Automated scheduled sync

## Online Store Visibility (isOnline field)

The `products.isOnline` boolean field controls whether a product appears in the storefront:
- **true**: Product is visible to customers (default for synced products)
- **false**: Product is hidden from storefront (still exists in database)

This maps to Zoho Inventory's "Show in Online Store" toggle.

**Belt-and-suspenders enforcement:**
1. API level: `getProducts()` filters by `isOnline=true` unless `includeOffline=true`
2. API level: `getProduct()` and `getProductBySku()` return 404 for offline products
3. UI level: Products page also filters results by `isOnline === true`

### Phase 7 TODO: Zoho Sync for isOnline
- Sync `products.isOnline` from Zoho Inventory's native "Show in Online Store" toggle
- Only products with Zoho's "Show in Online Store" = true should have `isOnline=true`
- De-list products by setting `isOnline=false` (do NOT delete from database)
- This allows products to be re-listed without losing order history

## Design Principles

- Professional and trustworthy (enterprise-grade)
- Fast and efficient for repeat wholesale buyers
- Practical, grid-based, SKU-driven
- Clean, modern, commercial-polished

Inspired by: Amazon Business, McMaster-Carr, Shopify Plus B2B, Stripe, Apple Business

---

*Last updated: Phase 3 completion*
