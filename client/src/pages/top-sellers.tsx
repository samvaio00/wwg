import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
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
  Package, 
  ShoppingCart, 
  TrendingUp,
  Plus,
  Minus,
  Check,
  Eye,
  Filter,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight
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

function ProductImage({ product, isOutOfStock }: { product: Product; isOutOfStock: boolean }) {
  const [imageError, setImageError] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  
  const imageUrl = product.zohoItemId 
    ? `/api/products/${product.id}/image`
    : product.imageUrl;
  
  if (!imageUrl || imageError) {
    return (
      <div className="flex items-center justify-center h-full">
        <Package className="h-12 w-12 text-muted-foreground" />
      </div>
    );
  }
  
  return (
    <>
      {!imageLoaded && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Package className="h-12 w-12 text-muted-foreground animate-pulse" />
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
      <CardContent className="p-4 space-y-2">
        <div className="h-14">
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

const ITEMS_PER_PAGE = 12;

export default function TopSellersPage() {
  const { toast } = useToast();
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [submittedSearch, setSubmittedSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [aiEnabled, setAIEnabled] = useState(true);
  const [sortOption, setSortOption] = useState("bestselling");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [inStockOnly, setInStockOnly] = useState(false);

  // AI-powered search - only triggers when Enter is pressed and AI is enabled
  const { 
    results: aiSearchResults, 
    isSearching: isAISearching,
    isAISearchActive,
  } = useAISearch(submittedSearch, { minQueryLength: 2, enabled: aiEnabled });
  
  const handleSearch = (query: string) => {
    setSubmittedSearch(query);
    setCurrentPage(1);
  };

  const handleAIToggle = (enabled: boolean) => {
    setAIEnabled(enabled);
    setSubmittedSearch("");
    setSearch("");
    setCurrentPage(1);
  };
  
  const { data: topSellersData, isLoading: isTopSellersLoading } = useQuery<{ products: Product[] }>({
    queryKey: ["/api/products/top-sellers"],
  });

  // Fetch categories for filter dropdown
  const { data: categoriesData } = useQuery<{ categories: Category[] }>({
    queryKey: ["/api/categories"],
  });
  const categories = categoriesData?.categories || [];

  const handleProductClick = (product: Product) => {
    setSelectedProduct(product);
    setIsDetailModalOpen(true);
  };

  const allFilteredProducts = useMemo(() => {
    let products: Product[] = [];
    
    // Use AI search when active
    if (isAISearchActive && aiSearchResults.length > 0) {
      products = [...aiSearchResults];
    } else {
      products = [...(topSellersData?.products || [])];
      
      if (search.trim()) {
        const searchLower = search.toLowerCase().trim();
        products = products.filter(p => 
          p.name.toLowerCase().includes(searchLower) ||
          p.sku?.toLowerCase().includes(searchLower) ||
          p.description?.toLowerCase().includes(searchLower)
        );
      }
    }
    
    // Apply category filter
    if (categoryFilter !== "all") {
      products = products.filter(p => p.category === categoryFilter);
    }
    
    // Apply in-stock filter if checkbox is checked
    if (inStockOnly) {
      products = products.filter(p => (p.stockQuantity || 0) > 0);
    }
    
    // Apply sorting
    switch (sortOption) {
      case "price-low":
        products.sort((a, b) => parseFloat(a.basePrice) - parseFloat(b.basePrice));
        break;
      case "price-high":
        products.sort((a, b) => parseFloat(b.basePrice) - parseFloat(a.basePrice));
        break;
      case "name-asc":
        products.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case "bestselling":
      default:
        // Keep original order (best selling from API)
        break;
    }
    
    return products;
  }, [topSellersData?.products, search, isAISearchActive, aiSearchResults, categoryFilter, sortOption, inStockOnly]);

  const isLoading = isAISearchActive ? isAISearching : isTopSellersLoading;

  // Pagination
  const totalPages = Math.ceil(allFilteredProducts.length / ITEMS_PER_PAGE);
  const filteredProducts = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return allFilteredProducts.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [allFilteredProducts, currentPage]);

  // Reset to page 1 when search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [search]);

  const addToCartMutation = useMutation({
    mutationFn: async ({ productId, quantity }: { productId: string; quantity: number }) => {
      const res = await apiRequest("POST", "/api/cart/items", { productId, quantity });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
      toast({
        title: "Added to cart",
        description: "Product has been added to your cart",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to add product to cart",
        variant: "destructive",
      });
    },
  });

  const handleAddToCart = (productId: string, quantity: number) => {
    addToCartMutation.mutate({ productId, quantity });
  };

  return (
    <div className="space-y-6 fade-in-up">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-6 w-6 text-primary icon-spin" />
          <h1 className="text-2xl font-black tracking-tight" data-testid="heading-top-sellers" style={{ fontFamily: "'Poppins', 'Inter', system-ui, sans-serif" }}>
            Top Sellers
          </h1>
        </div>

        <div className="flex gap-2 items-center flex-nowrap">
          <AISearchBox
            value={search}
            onChange={setSearch}
            onSearch={handleSearch}
            isSearching={isAISearching}
            testId="input-search-top-sellers"
            aiEnabled={aiEnabled}
            onAIToggle={handleAIToggle}
          />
          
          <div className="flex items-center gap-1">
            <Select value={categoryFilter} onValueChange={(value) => { setCategoryFilter(value); setCurrentPage(1); }}>
              <SelectTrigger className="w-[140px] h-9" data-testid="select-category-top-sellers">
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

          <Select value={sortOption} onValueChange={(value) => { setSortOption(value); setCurrentPage(1); }}>
            <SelectTrigger className="w-[140px] h-9" data-testid="select-sort-top-sellers">
              <SelectValue placeholder="Sort" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="bestselling">Best Selling</SelectItem>
              <SelectItem value="price-low">Price: Low</SelectItem>
              <SelectItem value="price-high">Price: High</SelectItem>
              <SelectItem value="name-asc">Name: A-Z</SelectItem>
            </SelectContent>
          </Select>

          <div className="flex items-center gap-2">
            <Checkbox 
              id="in-stock-filter-top-sellers" 
              checked={inStockOnly}
              onCheckedChange={(checked) => { setInStockOnly(checked === true); setCurrentPage(1); }}
              data-testid="checkbox-in-stock-top-sellers"
            />
            <Label 
              htmlFor="in-stock-filter-top-sellers" 
              className="text-sm cursor-pointer whitespace-nowrap"
              data-testid="label-in-stock-top-sellers"
            >
              In Stock Only
            </Label>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {Array.from({ length: 15 }).map((_, i) => (
            <Card key={i} className="overflow-hidden">
              <Skeleton className="h-32 w-full" />
              <CardContent className="p-3 space-y-2">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-5 w-12" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filteredProducts.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {filteredProducts.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              onAddToCart={handleAddToCart}
              isAddingToCart={addToCartMutation.isPending}
              onProductClick={handleProductClick}
            />
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <TrendingUp className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">
              {search ? "No products found" : "No Top Sellers Yet"}
            </h3>
            <p className="text-muted-foreground text-center mb-4">
              {search ? "Try a different search term" : "Top selling products from the last 3 months will appear here"}
            </p>
            {!search && (
              <Button asChild data-testid="button-browse-products">
                <Link href="/products">Browse All Products</Link>
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Pagination Controls */}
      {totalPages > 0 && (
        <div className="flex items-center justify-center gap-4 pt-6 flex-wrap" data-testid="pagination-controls">
          <span className="text-sm text-muted-foreground">
            {allFilteredProducts.length} products
          </span>
          {totalPages > 1 && (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1}
                data-testid="button-first-page"
              >
                <ChevronsLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                data-testid="button-prev-page"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              
              <div className="flex items-center gap-1 px-2">
                <span className="text-sm text-muted-foreground">Page</span>
                <Select 
                  value={currentPage.toString()} 
                  onValueChange={(v) => setCurrentPage(parseInt(v, 10))}
                >
                  <SelectTrigger className="w-[70px] h-8" data-testid="select-page">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                      <SelectItem key={p} value={p.toString()}>
                        {p}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="text-sm text-muted-foreground">of {totalPages}</span>
              </div>
              
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                data-testid="button-next-page"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage === totalPages}
                data-testid="button-last-page"
              >
                <ChevronsRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      )}

      <ProductDetailModal
        product={selectedProduct}
        open={isDetailModalOpen}
        onOpenChange={setIsDetailModalOpen}
      />
    </div>
  );
}
