# WholesaleHub - B2B Wholesale Commerce Platform

## Overview

WholesaleHub is a B2B wholesale commerce platform designed for retailers purchasing sunglasses, cellular accessories, caps/headwear, perfumes, and novelty items for gas stations and convenience stores. It integrates with Zoho Inventory for inventory management and Zoho Books for order processing and customer relationship management. The platform aims to provide a professional, efficient, and scalable solution for B2B transactions, enhancing the buying experience for wholesale customers and streamlining operations for distributors.

## User Preferences

- I want iterative development.
- I prefer detailed explanations.
- Ask before making major changes.
- I expect the agent to be proactive in identifying potential issues or improvements.
- Do not make changes to the `docs/` folder.

## System Architecture

The platform is built with a modern web stack:
- **Frontend**: React, Vite, TypeScript, Tailwind CSS, Radix UI (shadcn/ui) for a responsive and professional user interface.
- **Backend**: Express.js with TypeScript for a robust and scalable API.
- **Database**: PostgreSQL with Drizzle ORM for reliable data storage and management.
- **Authentication**: Session-based authentication using bcrypt for secure password hashing.
- **Routing**: `wouter` for client-side routing and Express for backend API routes.
- **Design Principles**: Focused on a professional, trustworthy, fast, and efficient user experience, inspired by leading B2B platforms like Amazon Business and Shopify Plus B2B. The UI features a clean, modern, and commercial-polished aesthetic with a practical, grid-based, and SKU-driven approach.
- **Core Features**:
    - **User Management**: Supports 'admin', 'staff', 'customer', and 'pending' roles with a comprehensive status workflow (pending, approved, rejected, suspended).
      - **Admin**: Full access to all features including user management, order management, analytics, and all settings.
      - **Staff**: Limited admin access for customer approvals, order approvals, highlighted items selection, and Zoho API sync options. Cannot access analytics or suspend/reactivate users.
      - **Customer**: Shopping, ordering, and self-service features.
    - **Product Catalog**: Displays products with category filtering, search, sorting, pagination, and inventory-based buyability. Products can be marked as `isOnline` to control storefront visibility, linked to Zoho Inventory's "Show in Online Store" toggle. Clicking any product card opens a detail modal with full product information (larger image, description, stock badges, case pack info) and add-to-cart controls.
    - **Item Groups (Product Variants)**: Products can be grouped via Zoho Inventory item groups (e.g., different colors/sizes of the same product). Products with a `zohoGroupId` display all variants in the product detail modal with individual add-to-cart controls per variant. The scheduler automatically syncs item groups from Zoho's `/itemgroups` endpoint.
    - **Homepage Featured Products**: Customers see a customizable homepage with featured products. Admins can highlight products in Settings. Minimum 12 highlighted products required to show "Featured Products"; otherwise falls back to "Warner Collection" category.
    - **Shopping Cart & Order Management**: Full shopping cart functionality, secure checkout, order creation, order history for customers, and an admin portal for order approvals and status management with a detailed workflow.
    - **Customer Self-Service**: "My Account" sidebar section with Order History, Edit Profile (with admin approval workflow), and Contact Us pages. Top Sellers page shows best-selling products from the last 3 months based on order volume.
    - **AI Features**: Includes an AI Cart Builder for natural language product recommendations and AI-enhanced semantic product search, powered by Replit AI Integrations (gpt-4o-mini). Vector embeddings are used for optimized semantic search, optionally with OpenAI API.
    - **Admin & Analytics**: An advanced analytics dashboard provides real-time order metrics, sales trends, customer insights, and top-selling products. Admin views for hidden products, out-of-stock items, and inactive customers are available.
    - **Bulk Operations**: Supports bulk order import from spreadsheets (CSV) with SKU and quantity mapping, stock validation, and error reporting.
    - **Job Queue & Retries**: A `jobs` table manages retryable Zoho operations (customer creation, order push) with a dedicated job worker, ensuring robustness against API failures.

## External Dependencies

- **Zoho Inventory**: Integrated for product synchronization, online store visibility (via `isOnline` field), inventory management, and dynamic category synchronization. Categories are synced directly from Zoho with products automatically mapped to their Zoho categories. Products without a Zoho category are placed in "Other Items".
- **Zoho Books**: Utilized for customer validation during signup, syncing customer active/inactive status, pushing approved sales orders, syncing price lists, and creating new customer records during admin approval.
- **Replit AI Integrations**: Used for AI Cart Builder and AI Enhanced Search functionalities (specifically `gpt-4o-mini`).
- **OpenAI API**: Optionally integrated for true vector embeddings in semantic search (text-embedding-3-small model) if an API key is provided.
- **Email Service (Resend, SendGrid)**: Supports sending shipment and delivery notifications, with a console logging fallback for development.

## Recent Changes (Feb 2026)

- **Hero Section Redesign**: Updated hero section with subtle light blue/milk coffee gradient background and subtle sunglasses image (removed human image).
- **Pagination**: Added pagination (12 items per page) to Home, What's New, and Top Sellers pages with Previous/Next navigation.
- **Footer Component**: Created footer with links to About Us, Return Policy, and Disclaimer pages.
- **Registration Enhancements**: Added date of birth field (21+ age verification) and file upload for Sales Tax Certificate/Business License during new customer registration.
- **New Pages**: Created About Us, Return Policy, and Disclaimer static content pages.
- **UI/UX Updates**: My Account menu items (Order History, Edit Profile, Contact Us) moved from sidebar to header user dropdown. AI Order button displays text next to sparkles icon for better visibility. What's New uses Gift icon instead of Sparkles.
- **Top Sellers Zoho Books Sync**: Top Sellers now uses Zoho Books invoice data (last 30 days). Sync runs weekly on Sundays at midnight. Displays 24 top sellers with group-aware display (grouped products show group tile). Cached in `top_sellers_cache` table.
- **AI Search Top Sellers Commands**: AI search box now supports natural language commands for adding top sellers by category to cart. Example: "add the 3 top selling caps to my cart, 5 pieces each". Parses count, category, and quantity from command. Uses `/api/top-sellers/by-category/:category` endpoint. Only returns in-stock products (stockQuantity >= 0). Shows "Top Sellers" badge when command is recognized. Handles partial success with informative messages showing which items were added.

## File Upload Configuration

- Certificate uploads are stored in `/uploads/certificates/` directory.
- Supported file types: PDF, JPEG, PNG, GIF (max 5MB).
- Certificate files served only via protected admin endpoint `/api/admin/certificates/:filename`.

## Email Action Tokens

- **Purpose**: Allows admin to approve/reject directly from email notification links without logging in.
- **Token Types**: 
  - `approve_order`, `reject_order` - For order management
  - `approve_user`, `reject_user` - For new customer registration approval
  - `approve_profile`, `reject_profile` - For profile update requests
- **Expiration**: Tokens expire after 7 days and can only be used once.
- **Storage**: `email_action_tokens` table with token, action_type, target_id, expires_at, used_at fields.
- **Endpoint**: `GET /api/email-action/:token` - Validates token, performs action, returns success/error HTML page.
- **Email Notifications**: 
  - New orders: Sent to admin with Approve/Reject buttons
  - New user registrations: Sent to admin with Approve/Reject buttons
  - Profile update requests: Sent to admin with Approve/Reject buttons
- **Admin Email**: warnergears@gmail.com (hardcoded in email-service.ts)
- **Email Providers**: Supports Resend (RESEND_API_KEY) or SendGrid (SENDGRID_API_KEY), falls back to console logging.

## Scheduler Configuration

- **Zoho Inventory Sync**: Dynamic intervals - 2 hours during business hours (8 AM - 6 PM weekdays), 6 hours off-hours/weekends.
- **Customer Status Sync**: Every 60 minutes.
- **Embeddings Update**: Every 120 minutes.
- **Top Sellers Sync**: Weekly on Sundays at midnight (fetches last 30 days of invoice data from Zoho Books).