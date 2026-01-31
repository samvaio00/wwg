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
│   └── design.md           # Design system documentation
└── drizzle.config.ts       # Drizzle configuration
```

## User Roles

- **admin**: Full access to admin portal, user management, order approvals
- **customer**: Approved retailers who can browse products and place orders
- **pending**: Newly registered users awaiting admin approval

## User Status

- **pending**: Awaiting admin approval
- **approved**: Active account with full access
- **rejected**: Application denied
- **suspended**: Account temporarily disabled

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - User logout
- `GET /api/auth/me` - Get current user

### Admin
- `POST /api/admin/setup` - Create initial admin (only works if no admins exist)

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

### Phase 1 (Current) - Foundation & Design Base
- Design system with professional B2B theme
- Authentication with email/password
- Admin role support
- Basic layout with sidebar navigation

### Phase 2 (Planned) - Database Models
- Product schema with Zoho mapping
- AI tables (embeddings, cache, events)
- Order and cart schemas

### Phase 3+ (Planned) - Full Features
- Signup flow with admin approvals
- Product discovery with search
- Cart and checkout
- Zoho integration
- AI features

## Design Principles

- Professional and trustworthy (enterprise-grade)
- Fast and efficient for repeat wholesale buyers
- Practical, grid-based, SKU-driven
- Clean, modern, commercial-polished

Inspired by: Amazon Business, McMaster-Carr, Shopify Plus B2B, Stripe, Apple Business

---

*Last updated: Phase 1 completion*
