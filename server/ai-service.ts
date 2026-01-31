import OpenAI from "openai";
import { db } from "./db";
import { products, aiEvents, aiCache, productEmbeddings, generateAICacheKey } from "@shared/schema";
import { eq, ilike, or, and, gt, sql } from "drizzle-orm";

// Replit AI Integrations client (for chat completions)
const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

// Separate OpenAI client for embeddings (requires user's own API key)
// Embeddings API is not supported by Replit AI Integrations
const embeddingsClient = process.env.OPENAI_API_KEY 
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMENSIONS = 1536;

// Cosine similarity for vector search
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Generate embedding for a text query
async function generateEmbedding(text: string): Promise<number[] | null> {
  if (!embeddingsClient) {
    return null;
  }
  
  try {
    const response = await embeddingsClient.embeddings.create({
      model: EMBEDDING_MODEL,
      input: text,
    });
    return response.data[0].embedding;
  } catch (error) {
    console.error("[Embeddings] Error generating embedding:", error);
    return null;
  }
}

// Check if vector embeddings are available
export function hasVectorEmbeddings(): boolean {
  return embeddingsClient !== null;
}

interface CartBuilderResult {
  suggestions: Array<{
    productId: string;
    sku: string;
    name: string;
    category: string;
    price: string;
    quantity: number;
    reason: string;
  }>;
  summary: string;
  totalEstimate: string;
}

interface SearchResult {
  products: Array<{
    id: string;
    sku: string;
    name: string;
    category: string;
    brand: string | null;
    basePrice: string;
    imageUrl: string | null;
  }>;
  interpretation: string;
}

async function getCachedResponse(cacheKey: string): Promise<unknown | null> {
  try {
    const [cached] = await db.select()
      .from(aiCache)
      .where(and(
        eq(aiCache.key, cacheKey),
        gt(aiCache.expiresAt, new Date())
      ));
    
    if (cached) {
      await db.update(aiCache)
        .set({ hitCount: sql`${aiCache.hitCount} + 1` })
        .where(eq(aiCache.key, cacheKey));
      return cached.responseJson;
    }
    return null;
  } catch {
    return null;
  }
}

async function setCachedResponse(cacheKey: string, feature: string, response: unknown, ttlMinutes: number = 60): Promise<void> {
  try {
    const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);
    await db.insert(aiCache)
      .values({
        key: cacheKey,
        feature,
        responseJson: response,
        expiresAt,
        hitCount: 0,
      })
      .onConflictDoUpdate({
        target: aiCache.key,
        set: {
          responseJson: response,
          expiresAt,
        },
      });
  } catch (error) {
    console.error("Cache set error:", error);
  }
}

async function logAIEvent(
  userId: string | null,
  eventType: string,
  feature: string,
  payload: unknown,
  response: unknown,
  latencyMs: number,
  cacheHit: boolean,
  modelUsed: string,
  errorMessage?: string
): Promise<void> {
  try {
    await db.insert(aiEvents).values({
      userId,
      eventType,
      feature,
      payloadJson: payload,
      responseJson: response,
      latencyMs,
      cacheHit,
      modelUsed,
      errorMessage,
    });
  } catch (error) {
    console.error("AI event logging error:", error);
  }
}

export async function aiCartBuilder(
  userId: string | null,
  prompt: string
): Promise<CartBuilderResult> {
  const startTime = Date.now();
  const cacheKey = generateAICacheKey("cart_builder", userId, prompt);
  
  const cached = await getCachedResponse(cacheKey);
  if (cached) {
    await logAIEvent(userId, "cart_builder", "cart_builder", { prompt }, cached, Date.now() - startTime, true, "cached");
    return cached as CartBuilderResult;
  }

  const allProducts = await db.select({
    id: products.id,
    sku: products.sku,
    name: products.name,
    category: products.category,
    brand: products.brand,
    basePrice: products.basePrice,
    description: products.description,
    stockQuantity: products.stockQuantity,
  })
  .from(products)
  .where(and(
    eq(products.isActive, true),
    eq(products.isOnline, true),
    gt(products.stockQuantity, 0)
  ));

  const productCatalog = allProducts.map(p => 
    `- ${p.sku}: ${p.name} (${p.category}${p.brand ? `, ${p.brand}` : ''}) - $${p.basePrice} wholesale - ${p.stockQuantity} in stock`
  ).join('\n');

  const systemPrompt = `You are an AI assistant for WholesaleHub, a B2B wholesale platform for retailers.
Your job is to help retailers build their shopping cart based on their needs.

Available product categories:
- sunglasses: Sunglasses and eyewear
- cellular: Phone accessories, cables, cases, chargers
- caps: Headwear, baseball caps, beanies
- perfumes: Fragrances, body mists, colognes
- novelty: Impulse items, keychains, air fresheners for gas stations

Current product catalog:
${productCatalog}

Based on the retailer's request, suggest appropriate products with quantities.
Consider their business type (gas station, convenience store, etc.) and recommend products that sell well in that environment.

Respond with JSON only in this exact format:
{
  "suggestions": [
    {
      "sku": "PRODUCT-SKU",
      "quantity": 12,
      "reason": "Brief reason why this product is recommended"
    }
  ],
  "summary": "A brief summary of your recommendations",
  "totalEstimate": "$XXX.XX"
}`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt }
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: 2048,
    });

    const content = response.choices[0]?.message?.content || "{}";
    const parsed = JSON.parse(content);

    const suggestions = await Promise.all(
      (parsed.suggestions || []).map(async (s: { sku: string; quantity: number; reason: string }) => {
        const product = allProducts.find(p => p.sku === s.sku);
        if (!product) return null;
        return {
          productId: product.id,
          sku: product.sku,
          name: product.name,
          category: product.category,
          price: product.basePrice,
          quantity: s.quantity,
          reason: s.reason,
        };
      })
    );

    const result: CartBuilderResult = {
      suggestions: suggestions.filter((s): s is NonNullable<typeof s> => s !== null),
      summary: parsed.summary || "Here are my recommendations based on your request.",
      totalEstimate: parsed.totalEstimate || "$0.00",
    };

    await setCachedResponse(cacheKey, "cart_builder", result, 30);
    await logAIEvent(userId, "cart_builder", "cart_builder", { prompt }, result, Date.now() - startTime, false, "gpt-5-mini");

    return result;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    await logAIEvent(userId, "cart_builder", "cart_builder", { prompt }, null, Date.now() - startTime, false, "gpt-5-mini", errorMsg);
    throw error;
  }
}

// Vector similarity search using embeddings
async function vectorSimilaritySearch(
  query: string,
  allProducts: Array<{
    id: string;
    sku: string;
    name: string;
    category: string;
    brand: string | null;
    basePrice: string;
    imageUrl: string | null;
  }>,
  category?: string
): Promise<SearchResult | null> {
  try {
    // Generate embedding for the query
    const queryEmbedding = await generateEmbedding(query);
    if (!queryEmbedding) {
      return null;
    }
    
    // Get all product embeddings
    const embeddings = await db.select()
      .from(productEmbeddings)
      .where(sql`${productEmbeddings.embedding} IS NOT NULL`);
    
    if (embeddings.length === 0) {
      console.log("[Vector Search] No product embeddings found");
      return null;
    }
    
    // Calculate similarity scores
    const scoredProducts: Array<{
      sku: string;
      similarity: number;
    }> = [];
    
    for (const emb of embeddings) {
      if (emb.embedding && Array.isArray(emb.embedding)) {
        const similarity = cosineSimilarity(queryEmbedding, emb.embedding as number[]);
        scoredProducts.push({ sku: emb.sku, similarity });
      }
    }
    
    // Sort by similarity (descending) and take top results
    scoredProducts.sort((a, b) => b.similarity - a.similarity);
    const topSkus = scoredProducts
      .filter(p => p.similarity > 0.3) // Minimum similarity threshold
      .slice(0, 20)
      .map(p => p.sku);
    
    if (topSkus.length === 0) {
      console.log("[Vector Search] No products above similarity threshold");
      return null;
    }
    
    // Filter products by matched SKUs
    const matchedProducts = allProducts.filter(p => topSkus.includes(p.sku));
    
    // Sort matched products by their similarity score
    matchedProducts.sort((a, b) => {
      const scoreA = scoredProducts.find(s => s.sku === a.sku)?.similarity || 0;
      const scoreB = scoredProducts.find(s => s.sku === b.sku)?.similarity || 0;
      return scoreB - scoreA;
    });
    
    console.log(`[Vector Search] Found ${matchedProducts.length} products for query: "${query}"`);
    
    return {
      products: matchedProducts.map(p => ({
        id: p.id,
        sku: p.sku,
        name: p.name,
        category: p.category,
        brand: p.brand,
        basePrice: p.basePrice,
        imageUrl: p.imageUrl,
      })),
      interpretation: `Found ${matchedProducts.length} products matching "${query}" using semantic search`,
    };
  } catch (error) {
    console.error("[Vector Search] Error:", error);
    return null;
  }
}

export async function aiEnhancedSearch(
  userId: string | null,
  query: string,
  category?: string
): Promise<SearchResult> {
  const startTime = Date.now();
  const cacheKey = generateAICacheKey("search", userId, query, { category });
  
  const cached = await getCachedResponse(cacheKey);
  if (cached) {
    await logAIEvent(userId, "search", "search", { query, category }, cached, Date.now() - startTime, true, "cached");
    return cached as SearchResult;
  }

  const allProducts = await db.select({
    id: products.id,
    sku: products.sku,
    name: products.name,
    category: products.category,
    brand: products.brand,
    basePrice: products.basePrice,
    description: products.description,
    tags: products.tags,
    imageUrl: products.imageUrl,
  })
  .from(products)
  .where(and(
    eq(products.isActive, true),
    eq(products.isOnline, true),
    category ? eq(products.category, category) : sql`TRUE`
  ));

  // Try vector similarity search first if embeddings are available
  if (hasVectorEmbeddings()) {
    const vectorResult = await vectorSimilaritySearch(query, allProducts, category);
    if (vectorResult) {
      await setCachedResponse(cacheKey, "search", vectorResult, 15);
      await logAIEvent(userId, "search", "search", { query, category }, vectorResult, Date.now() - startTime, false, EMBEDDING_MODEL);
      return vectorResult;
    }
  }

  const productList = allProducts.map(p => ({
    id: p.id,
    sku: p.sku,
    name: p.name,
    category: p.category,
    brand: p.brand,
    description: p.description,
    tags: p.tags,
  }));

  const systemPrompt = `You are a search assistant for WholesaleHub, a B2B wholesale platform.
Your job is to understand the user's search intent and find the most relevant products.

Available products:
${JSON.stringify(productList, null, 2)}

The user is searching for: "${query}"
${category ? `Filtering by category: ${category}` : ''}

Analyze the search query and return the most relevant product IDs.
Consider:
- Exact matches on name, SKU, brand
- Semantic similarity (e.g., "phone charger" matches "USB cable")
- Category relevance
- Common aliases and synonyms

Respond with JSON only:
{
  "matchingIds": ["id1", "id2", ...],
  "interpretation": "Brief explanation of what you understood the user is looking for"
}`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Find products matching: ${query}` }
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: 1024,
    });

    const content = response.choices[0]?.message?.content || "{}";
    const parsed = JSON.parse(content);
    
    const matchingIds = parsed.matchingIds || [];
    const matchingProducts = allProducts.filter(p => matchingIds.includes(p.id));

    const result: SearchResult = {
      products: matchingProducts.map(p => ({
        id: p.id,
        sku: p.sku,
        name: p.name,
        category: p.category,
        brand: p.brand,
        basePrice: p.basePrice,
        imageUrl: p.imageUrl,
      })),
      interpretation: parsed.interpretation || "Showing results for your search.",
    };

    await setCachedResponse(cacheKey, "search", result, 15);
    await logAIEvent(userId, "search", "search", { query, category }, result, Date.now() - startTime, false, "gpt-5-mini");

    return result;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    await logAIEvent(userId, "search", "search", { query, category }, null, Date.now() - startTime, false, "gpt-5-mini", errorMsg);

    const fallbackProducts = allProducts.filter(p => 
      p.name.toLowerCase().includes(query.toLowerCase()) ||
      p.sku.toLowerCase().includes(query.toLowerCase()) ||
      (p.brand && p.brand.toLowerCase().includes(query.toLowerCase()))
    );

    return {
      products: fallbackProducts.slice(0, 20).map(p => ({
        id: p.id,
        sku: p.sku,
        name: p.name,
        category: p.category,
        brand: p.brand,
        basePrice: p.basePrice,
        imageUrl: p.imageUrl,
      })),
      interpretation: "Showing keyword matches (AI search unavailable).",
    };
  }
}

// ================================================================
// PRODUCT EMBEDDINGS GENERATION
// ================================================================

function generateEmbeddedContent(product: {
  sku: string;
  name: string;
  category: string;
  brand: string | null;
  description: string | null;
  tags: string[] | null;
  subcategory: string | null;
}): string {
  const parts = [
    `SKU: ${product.sku}`,
    `Name: ${product.name}`,
    `Category: ${product.category}`,
    product.subcategory ? `Subcategory: ${product.subcategory}` : null,
    product.brand ? `Brand: ${product.brand}` : null,
    product.description ? `Description: ${product.description}` : null,
    product.tags?.length ? `Tags: ${product.tags.join(", ")}` : null,
  ].filter(Boolean);
  
  return parts.join(" | ");
}

export interface EmbeddingGenerationResult {
  processed: number;
  created: number;
  updated: number;
  errors: number;
}

export async function generateProductEmbeddings(): Promise<EmbeddingGenerationResult> {
  const result: EmbeddingGenerationResult = {
    processed: 0,
    created: 0,
    updated: 0,
    errors: 0,
  };

  const useVectorEmbeddings = hasVectorEmbeddings();
  console.log(`[Embeddings] Vector embeddings ${useVectorEmbeddings ? 'ENABLED' : 'DISABLED (no OPENAI_API_KEY)'}`);

  const allProducts = await db.select({
    sku: products.sku,
    name: products.name,
    category: products.category,
    subcategory: products.subcategory,
    brand: products.brand,
    description: products.description,
    tags: products.tags,
  })
  .from(products)
  .where(eq(products.isActive, true));

  console.log(`[Embeddings] Processing ${allProducts.length} products`);

  for (const product of allProducts) {
    try {
      result.processed++;
      
      const embeddedContent = generateEmbeddedContent(product);
      
      // Check if embedding exists
      const [existing] = await db.select()
        .from(productEmbeddings)
        .where(eq(productEmbeddings.sku, product.sku));
      
      // Generate vector embedding if API key is available
      let embedding: number[] | null = null;
      let modelUsed = "pre-computed-content";
      
      if (useVectorEmbeddings) {
        embedding = await generateEmbedding(embeddedContent);
        if (embedding) {
          modelUsed = EMBEDDING_MODEL;
        }
      }
      
      if (existing) {
        // Update if content changed OR if we now have vector embeddings but existing doesn't
        const needsUpdate = existing.embeddedContent !== embeddedContent || 
          (useVectorEmbeddings && embedding && !existing.embedding);
          
        if (needsUpdate) {
          await db.update(productEmbeddings)
            .set({ 
              embeddedContent,
              embedding: embedding || existing.embedding,
              embeddingModel: modelUsed,
              updatedAt: new Date(),
            })
            .where(eq(productEmbeddings.sku, product.sku));
          result.updated++;
        }
      } else {
        // Create new
        await db.insert(productEmbeddings)
          .values({
            sku: product.sku,
            embeddedContent,
            embedding,
            embeddingModel: modelUsed,
          });
        result.created++;
      }
    } catch (error) {
      console.error(`[Embeddings] Error processing ${product.sku}:`, error);
      result.errors++;
    }
  }

  console.log(`[Embeddings] Complete: ${result.created} created, ${result.updated} updated, ${result.errors} errors`);
  return result;
}

export async function getProductsWithEmbeddedContent(): Promise<Array<{
  sku: string;
  name: string;
  category: string;
  brand: string | null;
  embeddedContent: string | null;
}>> {
  const result = await db.select({
    sku: products.sku,
    name: products.name,
    category: products.category,
    brand: products.brand,
    embeddedContent: productEmbeddings.embeddedContent,
  })
  .from(products)
  .leftJoin(productEmbeddings, eq(products.sku, productEmbeddings.sku))
  .where(and(eq(products.isActive, true), eq(products.isOnline, true)));

  return result;
}
