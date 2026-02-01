import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { ProductDetailModal } from "@/components/product-detail-modal";
import { 
  Package, 
  ShoppingCart, 
  TrendingUp,
  Plus,
  Minus,
  Check,
  Eye,
  Search
} from "lucide-react";
import type { Product } from "@shared/schema";

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
      className={`overflow-hidden ${isGroupOutOfStock ? "opacity-60 cursor-not-allowed" : isOutOfStock ? "opacity-60 cursor-pointer" : "cursor-pointer hover-elevate"}`}
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

export default function TopSellersPage() {
  const { toast } = useToast();
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [search, setSearch] = useState("");
  
  const { data: topSellersData, isLoading } = useQuery<{ products: Product[] }>({
    queryKey: ["/api/products/top-sellers"],
  });

  const handleProductClick = (product: Product) => {
    setSelectedProduct(product);
    setIsDetailModalOpen(true);
  };

  const filteredProducts = useMemo(() => {
    const products = topSellersData?.products || [];
    if (!search.trim()) return products;
    
    const searchLower = search.toLowerCase().trim();
    return products.filter(p => 
      p.name.toLowerCase().includes(searchLower) ||
      p.sku?.toLowerCase().includes(searchLower) ||
      p.description?.toLowerCase().includes(searchLower)
    );
  }, [topSellersData?.products, search]);

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
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-black tracking-tight" data-testid="heading-top-sellers" style={{ fontFamily: "'Poppins', 'Inter', system-ui, sans-serif" }}>
            Top Sellers
          </h1>
          <Badge variant="secondary" className="ml-2">Last 3 Months</Badge>
        </div>

        <div className="flex gap-2 items-center flex-wrap">
          <div className="relative w-56 lg:w-64">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search top sellers..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-9"
              data-testid="input-search-top-sellers"
            />
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
      ) : filteredProducts.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
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

      {filteredProducts.length > 0 && (
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
