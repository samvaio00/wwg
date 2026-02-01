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
  Sparkles,
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
      onClick={() => onProductClick(product)}
      data-testid={`card-product-${product.id}`}
    >
      <div className="h-32 bg-muted/30 relative">
        <ProductImage product={product} isOutOfStock={isOutOfStock} />
        {isOutOfStock ? (
          <Badge variant="destructive" className="absolute top-2 right-2 text-xs">
            Out of Stock
          </Badge>
        ) : isLowStock ? (
          <Badge variant="secondary" className="absolute bottom-2 left-2 text-xs bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200">
            Low Stock
          </Badge>
        ) : null}
        {isGroupedProduct && (
          <Badge variant="outline" className="absolute top-2 left-2 text-xs bg-background/80">
            {product.zohoGroupName || "Variants"}
          </Badge>
        )}
      </div>
      <CardContent className="p-3 space-y-2">
        <p className="text-xs text-muted-foreground font-mono">{product.sku}</p>
        <h3 className="font-medium text-sm line-clamp-2 min-h-[2.5rem]" data-testid={`text-product-name-${product.id}`}>
          {product.name}
        </h3>
        <div className="flex items-center justify-between">
          <span className="text-base font-bold" data-testid={`text-product-price-${product.id}`}>
            ${product.basePrice}
          </span>
          {product.casePackSize && product.casePackSize > 1 && (
            <span className="text-xs text-muted-foreground">
              Pack: {product.casePackSize}
            </span>
          )}
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
          <div className="flex items-center gap-1">
            <div className="flex items-center border rounded h-7">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 rounded-r-none"
                onClick={decrementQuantity}
                disabled={isOutOfStock || quantity <= (product.minOrderQuantity || 1)}
                data-testid={`button-decrease-${product.id}`}
              >
                <Minus className="h-3 w-3" />
              </Button>
              <span className="w-6 text-center text-xs font-medium" data-testid={`text-quantity-${product.id}`}>
                {quantity}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 rounded-l-none"
                onClick={incrementQuantity}
                disabled={isOutOfStock || quantity >= stockQty}
                data-testid={`button-increase-${product.id}`}
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

export default function WhatsNewPage() {
  const { toast } = useToast();
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [search, setSearch] = useState("");
  
  const { data: latestData, isLoading } = useQuery<{ products: Product[] }>({
    queryKey: ["/api/latest-products"],
  });

  const handleProductClick = (product: Product) => {
    setSelectedProduct(product);
    setIsDetailModalOpen(true);
  };

  // Filter products by search term
  const filteredProducts = useMemo(() => {
    const products = latestData?.products || [];
    if (!search.trim()) return products;
    
    const searchLower = search.toLowerCase().trim();
    return products.filter(p => 
      p.name.toLowerCase().includes(searchLower) ||
      p.sku?.toLowerCase().includes(searchLower) ||
      p.description?.toLowerCase().includes(searchLower)
    );
  }, [latestData?.products, search]);

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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-semibold" data-testid="heading-whats-new">
            What's New
          </h1>
        </div>
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search new arrivals by name, SKU, or description..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
            data-testid="input-search-whats-new"
          />
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
            <Package className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">
              {search ? "No products found" : "No New Products"}
            </h3>
            <p className="text-muted-foreground text-center mb-4">
              {search ? "Try a different search term" : "Check back later for new arrivals"}
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
