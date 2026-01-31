# Zoho Integration Mapping

This document describes how the WholesaleHub platform maps to Zoho Inventory and Zoho Books.

## Overview

WholesaleHub syncs with Zoho to:
1. Pull product catalog from Zoho Inventory
2. Push approved orders to Zoho Books as Sales Orders
3. Sync customer data for existing Zoho customers

## Entity Mappings

### Products (Zoho Inventory → WholesaleHub)

| WholesaleHub Field | Zoho Inventory Field | Notes |
|-------------------|---------------------|-------|
| `sku` | `sku` | Primary identifier |
| `name` | `name` | Product name |
| `description` | `description` | Product description |
| `basePrice` | `rate` | Wholesale price |
| `compareAtPrice` | `purchase_rate` | MSRP/Retail price |
| `stockQuantity` | `stock_on_hand` | Available inventory |
| `zohoItemId` | `item_id` | Zoho unique ID |
| `zohoCategoryId` | `category_id` | Zoho category reference |
| `imageUrl` | `image_document_id` | Primary image |
| `category` | (derived from `category_name`) | Mapped to our categories |

### Categories Mapping

| WholesaleHub Category | Zoho Category Names |
|----------------------|---------------------|
| `sunglasses` | Sunglasses, Eyewear, Fashion Glasses |
| `cellular` | Cell Accessories, Phone Cases, Chargers |
| `caps` | Headwear, Caps, Hats, Beanies |
| `perfumes` | Fragrances, Perfumes, Cologne |
| `novelty` | Novelty, Impulse, Gift Items |

### Customers (Zoho Books ↔ WholesaleHub)

| WholesaleHub Field | Zoho Books Field | Notes |
|-------------------|-----------------|-------|
| `email` | `email` | Primary identifier |
| `businessName` | `company_name` | Business name |
| `contactName` | `contact_name` | Primary contact |
| `phone` | `phone` | Phone number |
| `zohoCustomerId` | `contact_id` | Zoho unique ID |
| `priceListId` | `price_list_id` | Customer-specific pricing |

### Orders (WholesaleHub → Zoho Books)

| WholesaleHub Field | Zoho Books Field | Notes |
|-------------------|-----------------|-------|
| `orderNumber` | `reference_number` | Our order reference |
| `zohoSalesOrderId` | `salesorder_id` | Zoho SO ID (after push) |
| `userId` → `zohoCustomerId` | `customer_id` | Customer reference |
| `totalAmount` | `total` | Order total |
| Order Items | `line_items` | Array of products |

## Sync Strategy

### Product Sync (Scheduled)

1. **Frequency**: Every 4 hours during business hours
2. **Process**:
   - Fetch all items from Zoho Inventory with `last_modified_time` filter
   - Upsert products by SKU
   - Update stock quantities
   - Flag products for AI enrichment if content changed
3. **Error Handling**:
   - Log failed syncs
   - Retry with exponential backoff
   - Alert on 3 consecutive failures

### Order Push (On Approval)

1. **Trigger**: Admin approves order
2. **Process**:
   - Generate idempotency key from order ID
   - Create Sales Order in Zoho Books
   - Update order with `zoho_sales_order_id`
   - Mark `zoho_pushed_at` timestamp
3. **Idempotency**:
   - Check `zoho_idempotency_key` before push
   - Prevents duplicate orders on retry
4. **Error Handling**:
   - Log failed pushes
   - Keep order status as `approved` (not pushed)
   - Admin can retry push manually

## API Credentials

Store in Replit Secrets:

| Secret Name | Description |
|-------------|-------------|
| `ZOHO_CLIENT_ID` | OAuth client ID |
| `ZOHO_CLIENT_SECRET` | OAuth client secret |
| `ZOHO_REFRESH_TOKEN` | Long-lived refresh token |
| `ZOHO_ORGANIZATION_ID` | Zoho organization ID |

## Rate Limits

Zoho API rate limits (per organization):
- **Standard**: 100 requests/minute
- **Bulk**: 10 requests/minute for bulk operations

WholesaleHub implements:
- Request queuing with rate limit awareness
- Exponential backoff on 429 responses
- Priority for order pushes over syncs

## Data Grounding Rules

**Critical**: AI features NEVER call Zoho APIs directly.

- All AI operations read from local PostgreSQL database
- Product sync populates local data
- AI uses cached/indexed local data only
- This ensures fast responses and predictable costs

---

*Implementation: Phase 7*
