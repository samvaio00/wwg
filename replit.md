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

### Phase 4 (Planned) - Full Features
- Product discovery with search and filters
- Cart and checkout
- Zoho integration
- AI features (search, cart builder, admin tools)

## Design Principles

- Professional and trustworthy (enterprise-grade)
- Fast and efficient for repeat wholesale buyers
- Practical, grid-based, SKU-driven
- Clean, modern, commercial-polished

Inspired by: Amazon Business, McMaster-Carr, Shopify Plus B2B, Stripe, Apple Business

---

*Last updated: Phase 3 completion*
