import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { useAuth } from "@/lib/auth";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { ProductDetailModal } from "@/components/product-detail-modal";
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
  Search,
  Filter
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

  return (
    <Card 
      className={`overflow-hidden cursor-pointer ${isOutOfStock ? "opacity-60" : "hover-elevate"}`} 
      data-testid={`card-product-${product.id}`}
      onClick={() => onProductClick(product)}
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
          <span>Stock: {stockQty}</span>
        </div>

        {isGroupedProduct ? (
          <Button 
            className="w-full h-7"
            size="sm"
            variant="outline"
            onClick={(e) => {
              e.stopPropagation();
              onProductClick(product);
            }}
            data-testid={`button-view-variants-${product.id}`}
          >
            <Eye className="h-3 w-3 mr-1" />
            View Variants
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

function CustomerHomePage() {
  const { toast } = useToast();
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [search, setSearch] = useState("");
  
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
  
  // Filter products by search term
  const displayProducts = useMemo(() => {
    if (!search.trim()) return baseProducts.filter(p => p.isOnline);
    
    const searchLower = search.toLowerCase().trim();
    return baseProducts.filter(p => 
      p.isOnline && (
        p.name.toLowerCase().includes(searchLower) ||
        p.sku?.toLowerCase().includes(searchLower) ||
        p.description?.toLowerCase().includes(searchLower)
      )
    );
  }, [baseProducts, search]);
  
  const showingHighlighted = hasEnoughHighlighted;
  const isLoading = highlightedLoading || (shouldFetchWarner && warnerLoading);

  // Determine heading based on what's being displayed
  const headingText = showingHighlighted ? "Featured Products" : (warnerCategory?.name || "Warner");
  const HeadingIcon = showingHighlighted ? Star : Tag;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <HeadingIcon className={`h-5 w-5 ${showingHighlighted ? "text-amber-500" : "text-primary"}`} />
        <h1 className="text-xl font-semibold" data-testid="heading-home-products">
          {headingText}
        </h1>
      </div>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search products by name, SKU, or description..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
            data-testid="input-search-home"
          />
        </div>
        
        <div className="flex gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Select value="all" onValueChange={() => {}}>
              <SelectTrigger className="w-[180px]" data-testid="select-category-home">
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

      {displayProducts.length > 0 && (
        <div className="flex justify-center">
          <Button variant="outline" asChild data-testid="button-view-all-products">
            <Link href="/products">View All Products</Link>
          </Button>
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

function AdminDashboard() {
  const { user } = useAuth();

  const getStatusBadge = () => {
    if (!user) return null;
    
    switch (user.status) {
      case "approved":
        return <Badge variant="default" data-testid="badge-status-approved"><CheckCircle2 className="h-3 w-3 mr-1" /> Approved</Badge>;
      case "pending":
        return <Badge variant="secondary" data-testid="badge-status-pending"><Clock className="h-3 w-3 mr-1" /> Pending Approval</Badge>;
      case "rejected":
        return <Badge variant="destructive" data-testid="badge-status-rejected"><AlertCircle className="h-3 w-3 mr-1" /> Rejected</Badge>;
      default:
        return null;
    }
  };

  const getRoleBadge = () => {
    if (!user) return null;
    
    if (user.role === "admin") {
      return <Badge variant="default" data-testid="badge-role-admin">Admin</Badge>;
    }
    return null;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">
            Welcome back, {user?.contactName || user?.businessName || "User"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {getStatusBadge()}
          {getRoleBadge()}
        </div>
      </div>

      {user?.status === "pending" && (
        <Card className="border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950">
          <CardContent className="flex items-center gap-4 py-4">
            <Clock className="h-8 w-8 text-amber-600" />
            <div>
              <h3 className="font-semibold text-amber-900 dark:text-amber-100">Account Pending Approval</h3>
              <p className="text-sm text-amber-700 dark:text-amber-300">
                Your account is being reviewed. You'll receive access to wholesale pricing once approved.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Products</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">--</div>
            <p className="text-xs text-muted-foreground">Available for order</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Orders</CardTitle>
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">--</div>
            <p className="text-xs text-muted-foreground">This month</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Customers</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">--</div>
            <p className="text-xs text-muted-foreground">Registered retailers</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Revenue</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">--</div>
            <p className="text-xs text-muted-foreground">This month</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>Common tasks for your account</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Product browsing and ordering will be available in future phases.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>Your latest actions</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              No recent activity to display.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function HomePage() {
  const { user } = useAuth();
  
  // Show admin dashboard for admins, customer homepage for customers
  if (user?.role === "admin") {
    return <AdminDashboard />;
  }
  
  return <CustomerHomePage />;
}
