import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { useAuth } from "@/lib/auth";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
  Users, 
  TrendingUp,
  Clock,
  CheckCircle2,
  AlertCircle,
  Star,
  Plus,
  Minus,
  Check,
  Tag,
  Eye,
  Filter,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ArrowDownCircle,
  ArrowUpCircle
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

  const isGroupOutOfStock = isGroupedProduct && isOutOfStock;

  return (
    <Card 
      className={`overflow-hidden tile-hover ${isGroupOutOfStock ? "opacity-60 cursor-not-allowed" : isOutOfStock ? "opacity-60 cursor-pointer" : "cursor-pointer hover-elevate"}`} 
      data-testid={`card-product-${product.id}`}
      onClick={() => !isGroupOutOfStock && onProductClick(product)}
    >
      <div className="h-32 relative bg-muted overflow-hidden">
        <ProductImage product={product} isOutOfStock={isOutOfStock} />
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

const ITEMS_PER_PAGE = 12;

function CustomerHomePage() {
  const { toast } = useToast();
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [submittedSearch, setSubmittedSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  // AI-powered search - only triggers when Enter is pressed (submittedSearch changes)
  const { 
    results: aiSearchResults, 
    isSearching: isAISearching,
    isAISearchActive,
  } = useAISearch(submittedSearch, { minQueryLength: 2 });
  
  const handleSearch = (query: string) => {
    setSubmittedSearch(query);
    setCurrentPage(1);
  };
  
  // Fetch highlighted products
  const { data: highlightedData, isLoading: highlightedLoading } = useQuery<{ products: Product[] }>({
    queryKey: ["/api/highlighted-products"],
  });

  // Fetch categories to get Warner category slug
  const { data: categoriesData } = useQuery<{ categories: Category[] }>({
    queryKey: ["/api/categories"],
  });

  // Get categories list and find Warner category
  const categories = categoriesData?.categories || [];
  const warnerCategory = categories.find(
    (c) => c.name.toLowerCase() === "warner" || c.slug === "warner"
  );

  // Check if we have at least 12 highlighted products (minimum required)
  const highlightedProducts = highlightedData?.products || [];
  const hasEnoughHighlighted = highlightedProducts.length >= 12;

  // Fetch Warner products if we don't have at least 12 highlighted products
  const shouldFetchWarner = !highlightedLoading && !hasEnoughHighlighted && warnerCategory;
  const warnerQueryUrl = warnerCategory ? `/api/products?category=${warnerCategory.slug}&limit=24` : null;
  const { data: warnerData, isLoading: warnerLoading } = useQuery<{ products: Product[] }>({
    queryKey: [warnerQueryUrl],
    enabled: !!shouldFetchWarner && !!warnerQueryUrl,
  });

  const handleProductClick = (product: Product) => {
    setSelectedProduct(product);
    setIsDetailModalOpen(true);
  };

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

  // Determine which products to show - require at least 12 highlighted products
  const baseProducts = hasEnoughHighlighted
    ? highlightedProducts 
    : warnerData?.products || [];
  
  // Filter products - use AI search when active, otherwise fall back to basic filtering
  const filteredProducts = useMemo(() => {
    if (isAISearchActive && aiSearchResults.length > 0) {
      return aiSearchResults;
    }
    
    if (!search.trim()) return baseProducts.filter(p => p.isOnline);
    
    const searchLower = search.toLowerCase().trim();
    return baseProducts.filter(p => 
      p.isOnline && (
        p.name.toLowerCase().includes(searchLower) ||
        p.sku?.toLowerCase().includes(searchLower) ||
        p.description?.toLowerCase().includes(searchLower)
      )
    );
  }, [baseProducts, search, isAISearchActive, aiSearchResults]);

  // Loading state - consider AI search loading
  const isLoading = isAISearchActive ? isAISearching : (highlightedLoading || (shouldFetchWarner && warnerLoading));

  // Pagination
  const totalPages = Math.ceil(filteredProducts.length / ITEMS_PER_PAGE);
  const displayProducts = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredProducts.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredProducts, currentPage]);

  // Reset to page 1 when search changes
  useMemo(() => {
    setCurrentPage(1);
  }, [search]);
  
  const showingHighlighted = hasEnoughHighlighted;

  // Determine heading based on what's being displayed
  const headingText = showingHighlighted ? "Featured Products" : (warnerCategory?.name || "Warner");
  const HeadingIcon = showingHighlighted ? Star : Tag;

  return (
    <div className="space-y-6 fade-in-up">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-2">
          <HeadingIcon className={`h-6 w-6 ${showingHighlighted ? "text-amber-500" : "text-primary"} icon-spin`} />
          <h1 className="text-2xl font-black tracking-tight" data-testid="heading-home-products" style={{ fontFamily: "'Poppins', 'Inter', system-ui, sans-serif" }}>
            {headingText}
          </h1>
        </div>

        <div className="flex gap-2 items-center flex-wrap">
          <AISearchBox
            value={search}
            onChange={setSearch}
            onSearch={handleSearch}
            isSearching={isAISearching}
            testId="input-search-home"
          />
          
          <div className="flex items-center gap-1">
            <Select value="all" onValueChange={() => {}}>
              <SelectTrigger className="w-[140px] h-9" data-testid="select-category-home">
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

          <Select value="newest" onValueChange={() => {}}>
            <SelectTrigger className="w-[140px] h-9" data-testid="select-sort-home">
              <SelectValue placeholder="Sort" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest</SelectItem>
              <SelectItem value="price-low">Price: Low</SelectItem>
              <SelectItem value="price-high">Price: High</SelectItem>
              <SelectItem value="name-asc">Name: A-Z</SelectItem>
              <SelectItem value="instock">In Stock Only</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 12 }).map((_, i) => (
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
      ) : displayProducts.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {displayProducts.map((product) => (
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
            <Package className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">
              {search ? "No products found" : "No Products Available"}
            </h3>
            <p className="text-muted-foreground text-center mb-4">
              {search ? "Try a different search term" : "Browse our full catalog to find products"}
            </p>
            {!search && (
              <Button asChild data-testid="button-browse-products">
                <Link href="/products">Browse Products</Link>
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Pagination Controls */}
      {totalPages > 0 && (
        <div className="flex items-center justify-center gap-4 pt-6 flex-wrap" data-testid="pagination-controls">
          <span className="text-sm text-muted-foreground">
            {filteredProducts.length} products
          </span>
          {totalPages > 1 && (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1}
                className="page-btn"
                data-testid="button-first-page"
              >
                <ChevronsLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="page-btn"
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

interface ZohoStats {
  today: {
    apiCalls: number;
    successfulCalls: number;
    failedCalls: number;
    recordsPulled: number;
    recordsUpdated: number;
    syncs: number;
  };
  month: {
    apiCalls: number;
    successfulCalls: number;
    failedCalls: number;
  };
}

function AdminDashboard() {
  const { user } = useAuth();

  const { data: pendingUsersData } = useQuery<{ users: Array<{ id: string }> }>({
    queryKey: ['/api/admin/users/pending'],
  });

  const { data: ordersData } = useQuery<{ orders: Array<{ id: string; status: string }> }>({
    queryKey: ['/api/admin/orders'],
  });

  const { data: cartsData } = useQuery<{ carts: Array<{ id: string }> }>({
    queryKey: ['/api/admin/active-carts'],
  });

  const { data: usersData } = useQuery<{ users: Array<{ id: string; role: string; status: string }> }>({
    queryKey: ['/api/admin/users'],
  });

  const { data: zohoStats } = useQuery<ZohoStats>({
    queryKey: ['/api/admin/analytics/zoho-api-stats'],
  });

  const pendingUsersCount = pendingUsersData?.users?.length || 0;
  const pendingOrdersCount = ordersData?.orders?.filter(o => o.status === 'pending')?.length || 0;
  const activeCartsCount = cartsData?.carts?.length || 0;
  const adminStaffCount = usersData?.users?.filter(u => u.role === 'admin' || u.role === 'staff')?.length || 0;
  const recordsPulled = zohoStats?.today?.recordsPulled || 0;
  const recordsUpdated = zohoStats?.today?.recordsUpdated || 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Admin Dashboard</h1>
          <p className="text-muted-foreground">
            Welcome back, {user?.contactName || user?.businessName || "Admin"}
          </p>
        </div>
        <Badge variant="default" data-testid="badge-role-admin">Admin</Badge>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Link href="/admin/users">
          <Card className="hover-elevate cursor-pointer">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending User Approvals</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{pendingUsersCount}</div>
              <p className="text-xs text-muted-foreground">Users awaiting approval</p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/admin/orders">
          <Card className="hover-elevate cursor-pointer">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending Order Approvals</CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{pendingOrdersCount}</div>
              <p className="text-xs text-muted-foreground">Orders awaiting approval</p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/admin/carts">
          <Card className="hover-elevate cursor-pointer">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Carts</CardTitle>
              <ShoppingCart className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{activeCartsCount}</div>
              <p className="text-xs text-muted-foreground">Customers with items in cart</p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/admin/users">
          <Card className="hover-elevate cursor-pointer">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Admin & Staff</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{adminStaffCount}</div>
              <p className="text-xs text-muted-foreground">Team members</p>
            </CardContent>
          </Card>
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Link href="/admin/zoho-status">
          <Card className="hover-elevate cursor-pointer">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Records Received from Zoho</CardTitle>
              <ArrowDownCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{recordsPulled}</div>
              <p className="text-xs text-muted-foreground">New records pulled today</p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/admin/zoho-status">
          <Card className="hover-elevate cursor-pointer">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Records Sent to Zoho</CardTitle>
              <ArrowUpCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{recordsUpdated}</div>
              <p className="text-xs text-muted-foreground">Records updated today</p>
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
}

function StaffDashboard() {
  const { user } = useAuth();

  const { data: pendingUsersData } = useQuery<{ users: Array<{ id: string }> }>({
    queryKey: ['/api/admin/users/pending'],
  });

  const { data: ordersData } = useQuery<{ orders: Array<{ id: string; status: string }> }>({
    queryKey: ['/api/admin/orders'],
  });

  const { data: cartsData } = useQuery<{ carts: Array<{ id: string }> }>({
    queryKey: ['/api/admin/active-carts'],
  });

  const pendingUsersCount = pendingUsersData?.users?.length || 0;
  const pendingOrdersCount = ordersData?.orders?.filter(o => o.status === 'pending')?.length || 0;
  const activeCartsCount = cartsData?.carts?.length || 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Staff Dashboard</h1>
          <p className="text-muted-foreground">
            Welcome back, {user?.contactName || user?.businessName || "Staff"}
          </p>
        </div>
        <Badge variant="secondary" className="bg-blue-600 dark:bg-blue-700 text-white" data-testid="badge-role-staff">Staff</Badge>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Link href="/admin/users">
          <Card className="hover-elevate cursor-pointer">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending User Approvals</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{pendingUsersCount}</div>
              <p className="text-xs text-muted-foreground">Users awaiting approval</p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/admin/orders">
          <Card className="hover-elevate cursor-pointer">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending Order Approvals</CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{pendingOrdersCount}</div>
              <p className="text-xs text-muted-foreground">Orders awaiting approval</p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/admin/carts">
          <Card className="hover-elevate cursor-pointer">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Carts</CardTitle>
              <ShoppingCart className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{activeCartsCount}</div>
              <p className="text-xs text-muted-foreground">Customers with items in cart</p>
            </CardContent>
          </Card>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
          <CardDescription>Your available tasks</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex flex-col gap-2">
            <Link href="/admin/users">
              <Button variant="outline" className="w-full justify-start" data-testid="button-user-approvals">
                <Users className="h-4 w-4 mr-2" />
                User Approvals
              </Button>
            </Link>
            <Link href="/admin/orders">
              <Button variant="outline" className="w-full justify-start" data-testid="button-order-approvals">
                <Package className="h-4 w-4 mr-2" />
                Order Approvals
              </Button>
            </Link>
            <Link href="/admin/carts">
              <Button variant="outline" className="w-full justify-start" data-testid="button-active-carts">
                <ShoppingCart className="h-4 w-4 mr-2" />
                View Active Carts
              </Button>
            </Link>
            <Link href="/admin/email-templates">
              <Button variant="outline" className="w-full justify-start" data-testid="button-email-templates">
                <Star className="h-4 w-4 mr-2" />
                Email Templates
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function HomePage() {
  const { user } = useAuth();
  
  // Show admin dashboard for admins, staff dashboard for staff, customer homepage for customers
  if (user?.role === "admin") {
    return <AdminDashboard />;
  }
  
  if (user?.role === "staff") {
    return <StaffDashboard />;
  }
  
  return <CustomerHomePage />;
}
