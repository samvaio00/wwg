# AI Features Documentation

## Overview

WholesaleHub implements an AI "assist layer" that operates on top of the local database cache. AI features enhance product discovery, streamline ordering, and reduce admin workload.

**Critical Rule**: AI NEVER calls Zoho APIs. All AI responses are grounded in local database data.

## AI Features

### 1. Natural-Language Product Search
- Users can search using natural language queries
- Example: "waterproof phone cases under $5" or "sunglasses for gas stations"
- Uses product embeddings for semantic search
- Falls back to keyword search if AI unavailable

### 2. AI Cart Builder / Bundle Assistant
- "Build my order" feature
- Input: Budget, categories, or description
- Output: Proposed draft cart with products
- Example: "Build a $500 order with top-selling sunglasses and phone accessories"

### 3. AI Reorder / Recommendations
- Based on order history (rule-based initially)
- Suggests reorder quantities
- Identifies frequently purchased items
- Prompts when items may be running low

### 4. Admin AI: Intake Summarizer + Risk Flags
- Summarizes new customer applications
- Flags potential risks (incomplete info, unusual patterns)
- Generates internal notes for admin review

### 5. Admin AI: Catalog Enrichment
- Generates improved product titles and bullet points
- Suggests tags for better searchability
- Recommends category cleanup
- **Does NOT auto-write to Zoho** - admin approval required

### 6. Analytics Insights
- Top movers by category
- Reorder prompts for customers
- Low-stock alerts
- Simple, actionable insights

## Data Grounding Rules

1. **AI reads local DB only** - Never calls Zoho or external APIs during inference
2. **Missing data handling** - If data unavailable, respond "Not available" with alternatives
3. **No invention** - Never fabricate SKU facts, prices, or availability
4. **Confidence indicators** - Indicate when suggestions are less certain

## Privacy Rules

1. **Minimal PII in prompts**:
   - For intake summarizer: business name, category interests, city/state only
   - Mask phone/email where possible
   - Never send full addresses, tax IDs, or payment info

2. **Data retention**:
   - AI events logged with minimal payload
   - Response JSON truncated if large
   - Retained for cost analysis and debugging

## Cost Control & Rate Limiting (MANDATORY)

### A. Model Tiering

| Tier | Models | Use Cases |
|------|--------|-----------|
| Tier 0 (Free) | None | Baseline keyword search, always available |
| Tier 1 (Cheap) | GPT-3.5, Claude Haiku | Summarization, classification, risk flags |
| Tier 2 (Strong) | GPT-4, Claude Sonnet | Cart builder, complex search reasoning |

### B. Caching Defaults

All AI responses should be cached to reduce costs:

| Feature | TTL | Cache Key Pattern |
|---------|-----|-------------------|
| Search queries | 6-24 hours | `search_{hash(user+query+filters)}` |
| Intake summaries | Permanent | Stored on intake record directly |
| Cart builder drafts | 1-6 hours | `cart_{hash(user+prompt+budget)}` |
| Catalog enrichment | 7 days | `enrich_{sku}` |

**Cache Key Format**: `hash(user_id + feature + normalized_input + price_list_id + category_filters)`

### C. Quotas

| User Type | Feature | Daily Limit |
|-----------|---------|-------------|
| Customer | AI search | 30 requests |
| Customer | Cart builder | 10 requests |
| Admin | Intake summarizer | 200/month |
| Admin | Catalog enrichment | 100/day |

**Global Kill Switch**: Set `AI_DISABLED=true` to disable all AI endpoints safely.

### D. Rate Limiting

Apply to all AI endpoints:
- **Per user**: 10 requests/minute
- **Per IP**: 30 requests/minute
- **Backoff**: Exponential on errors
- **UI**: Show friendly "Please wait" message

### E. Budget Monitoring

Log all AI events with:
- `user_id` - Who made the request
- `feature` - Which AI feature
- `token_estimate` - Estimated tokens used
- `latency_ms` - Response time
- `cache_hit` - Whether served from cache

**Admin Dashboard Metrics**:
- AI calls today/this week
- Cache hit rate (target: >70%)
- Top features by usage
- Estimated cost

**Cost Alerts**:
- If usage exceeds thresholds, recommend:
  - Increase cache TTL
  - Lower per-user quotas
  - Temporarily disable Tier 2

### F. Fail-Safe Behaviors

When AI API fails:
1. **Search**: Return baseline keyword search results
2. **Cart builder**: Show error with "Try again" button
3. **Admin features**: Queue for retry, notify admin
4. **Never**: Crash checkout, block admin actions, or show raw errors

## Database Tables

### product_embeddings
```sql
CREATE TABLE product_embeddings (
  sku TEXT PRIMARY KEY REFERENCES products(sku),
  embedding JSONB,           -- Vector as JSON array
  embedding_model TEXT,      -- e.g., 'text-embedding-3-small'
  embedded_content TEXT,     -- Source text for embedding
  updated_at TIMESTAMP
);
```

### ai_cache
```sql
CREATE TABLE ai_cache (
  key TEXT PRIMARY KEY,      -- hash of inputs
  response_json JSONB,       -- Cached response
  feature TEXT,              -- Feature name
  expires_at TIMESTAMP,      -- TTL expiration
  hit_count INTEGER,         -- Usage tracking
  created_at TIMESTAMP
);
```

### ai_events
```sql
CREATE TABLE ai_events (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  event_type TEXT,           -- search, cart_builder, etc.
  feature TEXT,
  payload_json JSONB,        -- Request params
  response_json JSONB,       -- Response (truncated)
  token_estimate INTEGER,
  latency_ms INTEGER,
  cache_hit BOOLEAN,
  model_used TEXT,
  error_message TEXT,
  created_at TIMESTAMP
);
```

## Implementation Notes

1. **Embedding Generation**:
   - Run asynchronously after product sync
   - Only for new/changed products
   - Never block UI on embedding generation
   - Use worker process with Replit Scheduled Jobs

2. **Vector Search**:
   - Consider pgvector extension for production
   - Fallback: JSON array with application-level cosine similarity
   - Pre-filter by category/active status before vector search

3. **Prompt Engineering**:
   - Keep prompts focused and concise
   - Include grounding instructions in system prompt
   - Log prompts (without PII) for debugging

4. **Error Handling**:
   - Graceful degradation to non-AI features
   - User-friendly error messages
   - Admin notifications for repeated failures

---

*Implementation: Phases 6-9*
