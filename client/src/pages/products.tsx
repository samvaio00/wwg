import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, useSearch } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useAISearch } from "@/hooks/use-ai-search";
import { ProductDetailModal } from "@/components/product-detail-modal";
import { AISearchBox } from "@/components/ai-search-box";
import { 
  ShoppingCart, 
  Package,
  Filter,
  ArrowUpDown,
  Plus,
  Minus,
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Tag,
  Eye
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import type { Product, Category } from "@shared/schema";

const sortOptions = [
  { value: "newest", label: "Newest" },
  { value: "price-low", label: "Price: Low to High" },
  { value: "price-high", label: "Price: High to Low" },
  { value: "name-asc", label: "Name: A to Z" },
  { value: "name-desc", label: "Name: Z to A" },
];

function ProductImage({ product, isOutOfStock }: { product: Product; isOutOfStock: boolean }) {
  const [imageError, setImageError] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  
  // Use Zoho proxy endpoint if product has zohoItemId, otherwise fall back to stored imageUrl
  const imageUrl = product.zohoItemId 
    ? `/api/products/${product.id}/image`
    : product.imageUrl;
  
  if (!imageUrl || imageError) {
    return (
      <div className="flex items-center justify-center h-full">
        <Package className="h-16 w-16 text-muted-foreground" />
      </div>
    );
  }
  
  return (
    <>
      {!imageLoaded && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Package className="h-16 w-16 text-muted-foreground animate-pulse" />
        </div>
      )}
      <img 
        src={imageUrl} 
        alt={product.name}
        className={`object-contain w-full h-full ${isOutOfStock ? "grayscale" : ""} ${imageLoaded ? "" : "opacity-0"}`}
        loading="lazy"
        onError={() => setImageError(true)}
        onLoad={() => setImageLoaded(true)}
      />
    </>
  );
}

function ProductCard({ product, onAddToCart, isAddingToCart, onProductClick }: { 
  product: Product; 
  onAddToCart: (productId: string, quantity: number) => void;
  isAddingToCart: boolean;
  onProductClick: (product: Product) => void;
}) {
  const [quantity, setQuantity] = useState(product.minOrderQuantity || 1);
  const [justAdded, setJustAdded] = useState(false);
  
  const stockQty = product.stockQuantity || 0;
  const isOutOfStock = stockQty <= 0;
  const isLowStock = stockQty > 0 && stockQty <= (product.lowStockThreshold || 10);
  const isGroupedProduct = !!product.zohoGroupId;
  const isGroupOutOfStock = isGroupedProduct && isOutOfStock;

  const handleAddToCart = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isOutOfStock) return;
    onAddToCart(product.id, quantity);
    setJustAdded(true);
    setTimeout(() => setJustAdded(false), 2000);
  };

  const incrementQuantity = (e: React.MouseEvent) => {
    e.stopPropagation();
    const newQty = quantity + (product.casePackSize || 1);
    if (newQty <= stockQty) {
      setQuantity(newQty);
    }
  };

  const decrementQuantity = (e: React.MouseEvent) => {
    e.stopPropagation();
    setQuantity(prev => Math.max(product.minOrderQuantity || 1, prev - (product.casePackSize || 1)));
  };

  return (
    <Card 
      className={`overflow-hidden tile-hover ${isGroupOutOfStock ? "opacity-60 cursor-not-allowed" : isOutOfStock ? "opacity-60 cursor-pointer" : "cursor-pointer hover-elevate"}`} 
      data-testid={`card-product-${product.id}`}
      onClick={() => !isGroupOutOfStock && onProductClick(product)}
    >
      <div className="h-32 relative bg-muted overflow-hidden">
        <ProductImage 
          product={product} 
          isOutOfStock={isOutOfStock}
        />
        {isOutOfStock ? (
          <Badge className="absolute top-2 right-2" variant="destructive" data-testid={`badge-out-of-stock-${product.id}`}>
            Out of Stock
          </Badge>
        ) : isLowStock && (
          <Badge className="absolute bottom-2 left-2" variant="destructive">
            Low Stock
          </Badge>
        )}
      </div>
      <CardContent className="p-3 space-y-2">
        <div className="h-12">
          <p className="text-xs text-muted-foreground font-mono truncate">{product.sku}</p>
          <h3 className="font-semibold text-sm line-clamp-2 leading-tight" data-testid={`text-product-name-${product.id}`}>
            {product.name}
          </h3>
        </div>

        <div className="flex items-baseline gap-2">
          {isGroupedProduct && <span className="text-xs text-muted-foreground">from</span>}
          <span className="text-lg font-bold" data-testid={`text-product-price-${product.id}`}>
            ${product.basePrice}
          </span>
          {product.compareAtPrice && (
            <span className="text-xs text-muted-foreground line-through">
              ${product.compareAtPrice}
            </span>
          )}
        </div>

        <div className="text-xs text-muted-foreground flex gap-3">
          {!isGroupedProduct && <span>Pack: {product.casePackSize || 1}</span>}
          <span>{isGroupedProduct ? "Total Stock:" : "Stock:"} {product.stockQuantity || 0}</span>
        </div>

        {isGroupedProduct ? (
          <Button 
            className="w-full h-7"
            size="sm"
            variant={isGroupOutOfStock ? "destructive" : "outline"}
            disabled={isGroupOutOfStock}
            onClick={(e) => {
              e.stopPropagation();
              if (!isGroupOutOfStock) onProductClick(product);
            }}
            data-testid={`button-view-variants-${product.id}`}
          >
            {isGroupOutOfStock ? (
              <>
                <Package className="h-3 w-3 mr-1" />
                Out of Stock
              </>
            ) : (
              <>
                <Eye className="h-3 w-3 mr-1" />
                View Variants
              </>
            )}
          </Button>
        ) : (
          <div className="flex items-center gap-2">
            <div className="flex items-center border rounded h-7">
              <Button 
                variant="ghost" 
                size="icon"
                className="h-7 w-7 rounded-r-none"
                onClick={decrementQuantity}
                disabled={isOutOfStock || quantity <= (product.minOrderQuantity || 1)}
                data-testid={`button-decrease-qty-${product.id}`}
              >
                <Minus className="h-3 w-3" />
              </Button>
              <span className="w-8 text-center text-xs font-medium" data-testid={`text-quantity-${product.id}`}>
                {quantity}
              </span>
              <Button 
                variant="ghost" 
                size="icon"
                className="h-7 w-7 rounded-l-none"
                onClick={incrementQuantity}
                disabled={isOutOfStock || quantity >= stockQty}
                data-testid={`button-increase-qty-${product.id}`}
              >
                <Plus className="h-3 w-3" />
              </Button>
            </div>
            <Button 
              className="h-7 flex-1"
              size="sm"
              onClick={handleAddToCart}
              disabled={isAddingToCart || isOutOfStock}
              variant={isOutOfStock ? "destructive" : "default"}
              data-testid={`button-add-to-cart-${product.id}`}
            >
              {isOutOfStock ? (
                <>
                  <Package className="h-3 w-3 mr-1" />
                  Out of Stock
                </>
              ) : justAdded ? (
                <Check className="h-3 w-3" />
              ) : (
                <>
                  <ShoppingCart className="h-3 w-3 mr-1" />
                  Add
                </>
              )}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ProductSkeleton() {
  return (
    <Card className="overflow-hidden">
      <Skeleton className="h-32" />
      <CardContent className="p-3 space-y-2">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-20" />
        <div className="flex gap-1">
          <Skeleton className="h-6 w-20" />
          <Skeleton className="h-6 flex-1" />
        </div>
      </CardContent>
    </Card>
  );
}

interface PaginationInfo {
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}

export default function ProductsPage() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const urlParams = new URLSearchParams(searchString);
  const urlCategory = urlParams.get("category") || "all";
  
  const [search, setSearch] = useState("");
  const [submittedSearch, setSubmittedSearch] = useState("");
  const [category, setCategory] = useState(urlCategory);
  const [sort, setSort] = useState("newest");
  const [page, setPage] = useState(1);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [inStockOnly, setInStockOnly] = useState(false);
  const [aiEnabled, setAIEnabled] = useState(true);

  // AI-powered search - only triggers when Enter is pressed and AI is enabled
  const { 
    results: aiSearchResults, 
    isSearching: isAISearching,
    isAISearchActive,
    searchType,
    error: aiSearchError,
  } = useAISearch(submittedSearch, { 
    category: category !== "all" ? category : undefined,
    minQueryLength: 2,
    enabled: aiEnabled,
  });
  
  // Safe array for AI search results to prevent crashes
  const safeAIResults = Array.isArray(aiSearchResults) ? aiSearchResults : [];
  
  const handleSearch = (query: string) => {
    setSubmittedSearch(query);
    setPage(1);
  };

  const handleAIToggle = (enabled: boolean) => {
    setAIEnabled(enabled);
    setSubmittedSearch("");
    setSearch("");
    setPage(1);
  };

  // Fetch categories from Zoho
  const { data: categoriesData } = useQuery<{ categories: Category[] }>({
    queryKey: ["/api/categories"],
  });
  const categories = categoriesData?.categories || [];

  // Get current category name for heading
  const currentCategoryName = category === "all" 
    ? "All Products" 
    : categories.find(c => c.slug === category)?.name || category;

  const handleProductClick = (product: Product) => {
    setSelectedProduct(product);
    setIsDetailModalOpen(true);
  };

  useEffect(() => {
    setCategory(urlCategory);
  }, [urlCategory]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setPage(1);
  }, [search, category, sort, inStockOnly]);

  const handleCategoryChange = (value: string) => {
    setCategory(value);
    setPage(1);
    if (value === "all") {
      setLocation("/products");
    } else {
      setLocation(`/products?category=${value}`);
    }
  };

  // Build query params for non-AI search
  const queryParams = new URLSearchParams();
  if (category !== "all") queryParams.set("category", category);
  if (!aiEnabled && submittedSearch.trim()) {
    queryParams.set("search", submittedSearch.trim());
  }
  if (sort === "price-low") {
    queryParams.set("sortBy", "price");
    queryParams.set("sortOrder", "asc");
  } else if (sort === "price-high") {
    queryParams.set("sortBy", "price");
    queryParams.set("sortOrder", "desc");
  } else if (sort === "name-asc") {
    queryParams.set("sortBy", "name");
    queryParams.set("sortOrder", "asc");
  } else if (sort === "name-desc") {
    queryParams.set("sortBy", "name");
    queryParams.set("sortOrder", "desc");
  }
  queryParams.set("page", page.toString());
  queryParams.set("limit", "12");

  // Fetch products from regular API (used when AI search is disabled or no search term)
  const { data, isLoading: isRegularLoading, error } = useQuery<{ products: Product[]; pagination: PaginationInfo }>({
    queryKey: ["/api/products", queryParams.toString(), aiEnabled],
    queryFn: async () => {
      const url = `/api/products${queryParams.toString() ? `?${queryParams.toString()}` : ""}`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch products");
      return res.json();
    },
    enabled: !isAISearchActive,
  });

  // Use AI search results when searching, otherwise use regular API results
  // If AI search has error, fall back to empty results with error shown
  const displayProducts = (isAISearchActive && !aiSearchError)
    ? safeAIResults.slice((page - 1) * 12, page * 12)
    : data?.products || [];

  const totalPages = (isAISearchActive && !aiSearchError)
    ? Math.ceil(safeAIResults.length / 12) || 1
    : data?.pagination?.totalPages || 1;

  const isLoading = isAISearchActive ? isAISearching : isRegularLoading;

  const addToCartMutation = useMutation({
    mutationFn: async ({ productId, quantity }: { productId: string; quantity: number }) => {
      const res = await apiRequest("POST", "/api/cart/items", { productId, quantity });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Failed to add to cart");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
      toast({
        title: "Added to cart",
        description: "Product has been added to your cart.",
      });
    },
    onError: (error: Error) => {
      let errorMessage = error.message || "Failed to add product to cart";
      
      if (errorMessage.includes("sign in") || errorMessage.includes("session")) {
        errorMessage = "Please sign in to add items to your cart.";
      } else if (errorMessage.includes("network") || errorMessage.includes("fetch")) {
        errorMessage = "Connection error. Please check your internet and try again.";
      }
      
      toast({
        title: "Unable to add to cart",
        description: errorMessage,
        variant: "destructive",
      });
    },
  });

  const handleAddToCart = (productId: string, quantity: number) => {
    addToCartMutation.mutate({ productId, quantity });
  };

  // Apply client-side filtering for in-stock only toggle
  const products = displayProducts.filter(p => {
    if (inStockOnly && (p.stockQuantity || 0) <= 0) return false;
    return true;
  });

  return (
    <div className="space-y-6 fade-in-up">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-2">
          <Tag className="h-6 w-6 text-primary icon-spin" />
          <h1 className="text-2xl font-black tracking-tight" data-testid="heading-category" style={{ fontFamily: "'Poppins', 'Inter', system-ui, sans-serif" }}>
            {currentCategoryName}
          </h1>
        </div>

        <div className="flex gap-2 items-center flex-nowrap">
          <AISearchBox
            value={search}
            onChange={setSearch}
            onSearch={handleSearch}
            isSearching={isAISearching}
            testId="input-search"
            aiEnabled={aiEnabled}
            onAIToggle={handleAIToggle}
          />
          
          <div className="flex items-center gap-1">
            <Select value={category} onValueChange={handleCategoryChange}>
              <SelectTrigger className="w-[140px] h-9" data-testid="select-category">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categories.map((cat) => (
                  <SelectItem key={cat.id} value={cat.slug}>
                    {cat.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-1">
            <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
            <Select value={sort} onValueChange={setSort}>
              <SelectTrigger className="w-[160px] h-9" data-testid="select-sort">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                {sortOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox 
              id="in-stock-filter" 
              checked={inStockOnly}
              onCheckedChange={(checked) => setInStockOnly(checked === true)}
              data-testid="checkbox-in-stock"
            />
            <Label 
              htmlFor="in-stock-filter" 
              className="text-sm cursor-pointer whitespace-nowrap"
              data-testid="label-in-stock"
            >
              In Stock Only
            </Label>
          </div>
        </div>
      </div>

      {error && (
        <Card className="border-destructive">
          <CardContent className="flex items-center justify-center py-8">
            <p className="text-destructive">Failed to load products. Please try again.</p>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <ProductSkeleton key={i} />
          ))}
        </div>
      ) : products.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Package className="h-16 w-16 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No products found</h3>
            <p className="text-muted-foreground text-center">
              {submittedSearch || category !== "all" 
                ? "Try adjusting your search or filters."
                : "No products are currently available."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {products.map((product) => (
              <ProductCard 
                key={product.id} 
                product={product} 
                onAddToCart={handleAddToCart}
                isAddingToCart={addToCartMutation.isPending}
                onProductClick={handleProductClick}
              />
            ))}
          </div>
          
          {/* Pagination Controls */}
          {data?.pagination && (
            <div className="flex items-center justify-center gap-4 pt-6 flex-wrap" data-testid="pagination-controls">
              <span className="text-sm text-muted-foreground">
                {data.pagination.totalCount} products
              </span>
              {data.pagination.totalPages > 1 && (
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(1)}
                    disabled={page === 1}
                    data-testid="button-first-page"
                  >
                    <ChevronsLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    data-testid="button-prev-page"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  
                  <div className="flex items-center gap-1 px-2">
                    <span className="text-sm text-muted-foreground">Page</span>
                    <Select 
                      value={page.toString()} 
                      onValueChange={(v) => setPage(parseInt(v, 10))}
                    >
                      <SelectTrigger className="w-[70px] h-8" data-testid="select-page">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: data.pagination.totalPages }, (_, i) => i + 1).map((p) => (
                          <SelectItem key={p} value={p.toString()}>
                            {p}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <span className="text-sm text-muted-foreground">of {data.pagination.totalPages}</span>
                  </div>
                  
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(p => Math.min(data.pagination.totalPages, p + 1))}
                    disabled={page === data.pagination.totalPages}
                    data-testid="button-next-page"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(data.pagination.totalPages)}
                    disabled={page === data.pagination.totalPages}
                    data-testid="button-last-page"
                  >
                    <ChevronsRight className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          )}
        </>
      )}

      <ProductDetailModal
        product={selectedProduct}
        open={isDetailModalOpen}
        onOpenChange={setIsDetailModalOpen}
      />
    </div>
  );
}
