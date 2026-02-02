# WholesaleHub - B2B Wholesale Commerce Platform

## Overview

WholesaleHub is a B2B wholesale commerce platform designed for retailers purchasing goods like sunglasses, cellular accessories, and novelty items for gas stations and convenience stores. It integrates with Zoho Inventory and Zoho Books to manage inventory, orders, and customer relationships. The platform aims to provide an efficient, professional, and scalable solution for B2B transactions, enhancing the buying experience for wholesale customers and streamlining distributor operations. It targets a professional, trustworthy, fast, and efficient user experience, inspired by leading B2B platforms. Key ambitions include expanding market reach for distributors and offering a comprehensive self-service portal for customers.

## User Preferences

- I want iterative development.
- I prefer detailed explanations.
- Ask before making major changes.
- I expect the agent to be proactive in identifying potential issues or improvements.
- Do not make changes to the `docs/` folder.

## System Architecture

The platform utilizes a modern web stack:
- **Frontend**: React, Vite, TypeScript, Tailwind CSS, Radix UI (shadcn/ui) for a responsive and professional UI.
- **Backend**: Express.js with TypeScript for a robust API.
- **Database**: PostgreSQL with Drizzle ORM.
- **Authentication**: Session-based authentication using bcrypt.
- **Routing**: `wouter` for client-side and Express for API routes.
- **UI/UX**: Clean, modern, commercial-polished aesthetic with a practical, grid-based, and SKU-driven approach, featuring a subtle light blue/milk coffee gradient hero section. Pagination is implemented for improved navigation.
- **Technical Implementations & Features**:
    - **User Management**: Supports 'admin', 'staff', 'customer', and 'pending' roles with a detailed status workflow.
    - **Product Catalog**: Displays products with category filtering, search, sorting, and inventory-based buyability, including support for Zoho Inventory item groups (product variants). Products can be marked `isOnline` for storefront visibility.
    - **Homepage Customization**: Admins can highlight featured products on the homepage.
    - **Shopping Cart & Order Management**: Full cart functionality, secure checkout, customer order history, and admin order approval workflow.
    - **Customer Self-Service**: "My Account" section with order history, profile editing (with admin approval), and contact pages. Includes a "Top Sellers" page based on recent order volume.
    - **AI Features**: AI Cart Builder for natural language product recommendations and AI-enhanced semantic product search (using `gpt-4o-mini`). Includes natural language commands for adding top sellers by category to the cart. Top seller search queries within the top 500 items with Zoho Books sales data for category-specific filtering, with simple stemming for plural/singular matching.
    - **Image Storage**: Persistent local storage for Zoho product images in `public/product-images/`. Images are downloaded once from Zoho and served directly from disk, eliminating API rate limiting issues. Admin endpoints: `/api/admin/images/sync` for bulk download, `/api/admin/products/:id/refresh-image` for single image refresh.
    - **Admin & Analytics**: Dashboard for order metrics, sales trends, customer insights, and product performance.
    - **Bulk Operations**: Supports bulk order import from CSV with validation.
    - **Job Queue & Retries**: Manages retryable Zoho operations for robustness.
    - **Email Action Tokens**: Allows admin to approve/reject orders, users, or profile updates directly from email notifications without logging in.
    - **Scheduler**: Customer status sync (hourly), embeddings updates (2 hours), weekly top sellers sync, bi-weekly AI email campaigns, daily Zoho incremental sync (3 AM), and weekly full Zoho backup sync (Sunday 2 AM).
    - **Zoho Webhooks**: Real-time product and customer updates from Zoho Inventory and Zoho Books via webhooks (primary sync method for inventory receipt/sale events), with security through a shared secret. Webhook stats are tracked and displayed in admin dashboard. Note: Webhooks reliably trigger for accounting events (receipts, sales) but may not trigger for all field updates in Zoho.
    - **AI Email Campaigns**: Generates promotional emails (New Highlighted Items, New SKUs, Cart Abandonment) using AI (gpt-4o-mini). Features an opt-in system, unsubscribe functionality, and an admin approval workflow for email templates.
    - **Server Alert System**: Notifies administrators via email for critical server events like crashes, errors, or site downtime, with a cooldown mechanism to prevent spam.

## External Dependencies

- **Zoho Inventory**: Product synchronization, inventory management, and category synchronization.
- **Zoho Books**: Customer validation, status syncing, sales order pushing, price list syncing, and new customer record creation.
- **Replit AI Integrations**: Powers AI Cart Builder and AI Enhanced Search (`gpt-4o-mini`).
- **OpenAI API**: Optionally used for true vector embeddings in semantic search (`text-embedding-3-small`).
- **Email Service (Resend, SendGrid)**: Used for transactional emails (shipment/delivery notifications, admin alerts) and AI email campaigns, with console logging as a development fallback.