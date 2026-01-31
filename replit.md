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
    - **User Management**: Supports 'admin', 'customer', and 'pending' roles with a comprehensive status workflow (pending, approved, rejected, suspended).
    - **Product Catalog**: Displays products with category filtering, search, sorting, pagination, and inventory-based buyability. Products can be marked as `isOnline` to control storefront visibility, linked to Zoho Inventory's "Show in Online Store" toggle.
    - **Homepage Featured Products**: Customers see a customizable homepage with featured products. Admins can highlight products in Settings. Minimum 12 highlighted products required to show "Featured Products"; otherwise falls back to "Warner Collection" category.
    - **Shopping Cart & Order Management**: Full shopping cart functionality, secure checkout, order creation, order history for customers, and an admin portal for order approvals and status management with a detailed workflow.
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