import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, useSearch } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { 
  Search, 
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
  ChevronsRight
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

function ProductCard({ product, onAddToCart, isAddingToCart }: { 
  product: Product; 
  onAddToCart: (productId: string, quantity: number) => void;
  isAddingToCart: boolean;
}) {
  const [quantity, setQuantity] = useState(product.minOrderQuantity || 1);
  const [justAdded, setJustAdded] = useState(false);
  
  const stockQty = product.stockQuantity || 0;
  const isOutOfStock = stockQty <= 0;
  const isLowStock = stockQty > 0 && stockQty <= (product.lowStockThreshold || 10);

  const handleAddToCart = () => {
    if (isOutOfStock) return;
    onAddToCart(product.id, quantity);
    setJustAdded(true);
    setTimeout(() => setJustAdded(false), 2000);
  };

  const incrementQuantity = () => {
    const newQty = quantity + (product.casePackSize || 1);
    if (newQty <= stockQty) {
      setQuantity(newQty);
    }
  };

  const decrementQuantity = () => {
    setQuantity(prev => Math.max(product.minOrderQuantity || 1, prev - (product.casePackSize || 1)));
  };

  return (
    <Card 
      className={`overflow-hidden ${isOutOfStock ? "opacity-60" : "hover-elevate"}`} 
      data-testid={`card-product-${product.id}`}
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
          <Badge className="absolute top-2 right-2" variant="destructive">
            Low Stock
          </Badge>
        )}
      </div>
      <CardContent className="p-3 space-y-2">
        <div>
          <p className="text-xs text-muted-foreground font-mono">{product.sku}</p>
          <h3 className="font-semibold text-sm line-clamp-2" data-testid={`text-product-name-${product.id}`}>
            {product.name}
          </h3>
        </div>

        <div className="flex items-baseline gap-2">
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
          <span>Pack: {product.casePackSize || 1}</span>
          <span>Stock: {product.stockQuantity || 0}</span>
        </div>

        <div className="flex items-center gap-1">
          <div className="flex items-center border rounded text-xs flex-1">
            <Button 
              variant="ghost" 
              size="icon"
              className="h-6 w-7"
              onClick={decrementQuantity}
              disabled={isOutOfStock || quantity <= (product.minOrderQuantity || 1)}
              data-testid={`button-decrease-qty-${product.id}`}
            >
              <Minus className="h-2.5 w-2.5" />
            </Button>
            <span className="w-8 text-center text-xs font-medium" data-testid={`text-quantity-${product.id}`}>
              {quantity}
            </span>
            <Button 
              variant="ghost" 
              size="icon"
              className="h-6 w-7"
              onClick={incrementQuantity}
              disabled={isOutOfStock || quantity >= stockQty}
              data-testid={`button-increase-qty-${product.id}`}
            >
              <Plus className="h-2.5 w-2.5" />
            </Button>
          </div>
          <Button 
            className="h-6 text-xs w-14 px-2"
            size="sm"
            onClick={handleAddToCart}
            disabled={isAddingToCart || isOutOfStock}
            variant={isOutOfStock ? "secondary" : "default"}
            data-testid={`button-add-to-cart-${product.id}`}
          >
            {isOutOfStock ? (
              <Package className="h-3 w-3" />
            ) : justAdded ? (
              <Check className="h-3 w-3" />
            ) : (
              <>
                <ShoppingCart className="h-3 w-3 mr-0.5" />
                Add
              </>
            )}
          </Button>
        </div>
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
  const [category, setCategory] = useState(urlCategory);
  const [sort, setSort] = useState("newest");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);

  // Fetch categories from Zoho
  const { data: categoriesData } = useQuery<{ categories: Category[] }>({
    queryKey: ["/api/categories"],
  });
  const categories = categoriesData?.categories || [];

  useEffect(() => {
    setCategory(urlCategory);
  }, [urlCategory]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, category, sort]);

  const handleCategoryChange = (value: string) => {
    setCategory(value);
    setPage(1);
    if (value === "all") {
      setLocation("/products");
    } else {
      setLocation(`/products?category=${value}`);
    }
  };

  // Debounce search
  const handleSearchChange = (value: string) => {
    setSearch(value);
    const timeoutId = setTimeout(() => {
      setDebouncedSearch(value);
    }, 300);
    return () => clearTimeout(timeoutId);
  };

  // Build query params
  const queryParams = new URLSearchParams();
  if (debouncedSearch) queryParams.set("search", debouncedSearch);
  if (category !== "all") queryParams.set("category", category);
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

  const { data, isLoading, error } = useQuery<{ products: Product[]; pagination: PaginationInfo }>({
    queryKey: ["/api/products", queryParams.toString()],
    queryFn: async () => {
      const url = `/api/products${queryParams.toString() ? `?${queryParams.toString()}` : ""}`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch products");
      return res.json();
    },
  });

  const pagination = data?.pagination;

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
      toast({
        title: "Unable to add to cart",
        description: error.message || "Failed to add product to cart. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleAddToCart = (productId: string, quantity: number) => {
    addToCartMutation.mutate({ productId, quantity });
  };

  // Belt-and-suspenders: UI also filters by isOnline even though API already filters
  // This ensures offline products never appear even if API changes or data comes from other sources
  const products = (data?.products || []).filter(p => p.isOnline === true);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search products by name, SKU, or brand..."
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-10"
            data-testid="input-search"
          />
        </div>
        
        <div className="flex gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Select value={category} onValueChange={handleCategoryChange}>
              <SelectTrigger className="w-[180px]" data-testid="select-category">
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

          <div className="flex items-center gap-2">
            <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
            <Select value={sort} onValueChange={setSort}>
              <SelectTrigger className="w-[180px]" data-testid="select-sort">
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
              {debouncedSearch || category !== "all" 
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
              />
            ))}
          </div>
          
          {/* Pagination Controls */}
          {pagination && (
            <div className="flex items-center justify-center gap-4 pt-6 flex-wrap" data-testid="pagination-controls">
              <span className="text-sm text-muted-foreground">
                {pagination.totalCount} products
              </span>
              {pagination.totalPages > 1 && (
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
                        {Array.from({ length: pagination.totalPages }, (_, i) => i + 1).map((p) => (
                          <SelectItem key={p} value={p.toString()}>
                            {p}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <span className="text-sm text-muted-foreground">of {pagination.totalPages}</span>
                  </div>
                  
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))}
                    disabled={page === pagination.totalPages}
                    data-testid="button-next-page"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(pagination.totalPages)}
                    disabled={page === pagination.totalPages}
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
    </div>
  );
}
