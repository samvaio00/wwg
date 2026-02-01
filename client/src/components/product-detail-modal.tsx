import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Package, Plus, Minus, Check, ShoppingCart, Layers } from "lucide-react";
import type { Product } from "@shared/schema";

interface ProductDetailModalProps {
  product: Product | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function ProductImage({ product, isOutOfStock, size = "large" }: { product: Product; isOutOfStock: boolean; size?: "large" | "small" }) {
  const [imageError, setImageError] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  
  const imageUrl = product.zohoItemId 
    ? `/api/products/${product.id}/image`
    : product.imageUrl;
  
  const iconSize = size === "large" ? "h-24 w-24" : "h-10 w-10";
  
  if (!imageUrl || imageError) {
    return (
      <div className="flex items-center justify-center h-full bg-muted rounded-md">
        <Package className={`${iconSize} text-muted-foreground`} />
      </div>
    );
  }
  
  return (
    <div className="relative h-full bg-muted rounded-md overflow-hidden">
      {!imageLoaded && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Package className={`${iconSize} text-muted-foreground animate-pulse`} />
        </div>
      )}
      <img 
        src={imageUrl} 
        alt={product.name}
        className={`object-contain w-full h-full ${isOutOfStock ? "grayscale" : ""} ${imageLoaded ? "" : "opacity-0"}`}
        onError={() => setImageError(true)}
        onLoad={() => setImageLoaded(true)}
      />
    </div>
  );
}

function VariantCard({ 
  variant, 
  onAddToCart, 
  isAddingToCart 
}: { 
  variant: Product; 
  onAddToCart: (productId: string, quantity: number) => void;
  isAddingToCart: boolean;
}) {
  const [quantity, setQuantity] = useState(variant.minOrderQuantity || 1);
  const [justAdded, setJustAdded] = useState(false);
  
  const stockQty = variant.stockQuantity || 0;
  const isOutOfStock = stockQty <= 0;
  const isLowStock = stockQty > 0 && stockQty <= (variant.lowStockThreshold || 10);

  const handleAddToCart = () => {
    if (isOutOfStock) return;
    onAddToCart(variant.id, quantity);
    setJustAdded(true);
    setTimeout(() => setJustAdded(false), 2000);
  };

  const incrementQuantity = () => {
    const newQty = quantity + (variant.casePackSize || 1);
    if (newQty <= stockQty) {
      setQuantity(newQty);
    }
  };

  const decrementQuantity = () => {
    setQuantity(prev => Math.max(variant.minOrderQuantity || 1, prev - (variant.casePackSize || 1)));
  };

  return (
    <Card className={`overflow-hidden ${isOutOfStock ? "opacity-60" : ""}`} data-testid={`card-variant-${variant.id}`}>
      <CardContent className="p-2">
        <div className="flex gap-2 items-center">
          <div className="w-10 h-10 flex-shrink-0">
            <ProductImage product={variant} isOutOfStock={isOutOfStock} size="small" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground font-mono truncate">{variant.sku}</p>
                <h4 className="font-medium text-sm truncate" data-testid={`text-variant-name-${variant.id}`}>
                  {variant.name}
                </h4>
              </div>
              <div className="flex-shrink-0 text-right">
                <span className="text-sm font-bold" data-testid={`text-variant-price-${variant.id}`}>
                  ${variant.basePrice}
                </span>
                <p className="text-xs text-muted-foreground">
                  {isOutOfStock ? "Out" : `${stockQty} in stock`}
                </p>
              </div>
            </div>
          </div>
          {!isOutOfStock && (
            <div className="flex items-center gap-1 flex-shrink-0">
              <div className="flex items-center border rounded h-7">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-6 rounded-r-none"
                  onClick={decrementQuantity}
                  disabled={quantity <= (variant.minOrderQuantity || 1)}
                  data-testid={`button-variant-decrease-${variant.id}`}
                >
                  <Minus className="h-3 w-3" />
                </Button>
                <span className="w-6 text-center text-xs font-medium" data-testid={`text-variant-quantity-${variant.id}`}>
                  {quantity}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-6 rounded-l-none"
                  onClick={incrementQuantity}
                  disabled={quantity >= stockQty}
                  data-testid={`button-variant-increase-${variant.id}`}
                >
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
              <Button
                size="sm"
                className="h-7"
                onClick={handleAddToCart}
                disabled={isAddingToCart || justAdded}
                data-testid={`button-variant-add-to-cart-${variant.id}`}
              >
                {justAdded ? (
                  <Check className="h-3 w-3" />
                ) : (
                  <ShoppingCart className="h-3 w-3" />
                )}
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function ProductDetailModal({ product, open, onOpenChange }: ProductDetailModalProps) {
  const { toast } = useToast();
  const [quantity, setQuantity] = useState(1);
  const [justAdded, setJustAdded] = useState(false);

  const isGroupedProduct = !!product?.zohoGroupId;

  const { data: groupData, isLoading: isLoadingGroup } = useQuery<{ products: Product[] }>({
    queryKey: ["/api/products/group", product?.zohoGroupId],
    enabled: open && isGroupedProduct,
  });

  useEffect(() => {
    if (product && open) {
      setQuantity(product.minOrderQuantity || 1);
      setJustAdded(false);
    }
  }, [product?.id, open]);

  const addToCartMutation = useMutation({
    mutationFn: async ({ productId, quantity }: { productId: string; quantity: number }) => {
      const res = await apiRequest("POST", "/api/cart/items", { productId, quantity });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Failed to add to cart");
      }
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
      const addedProduct = isGroupedProduct 
        ? groupData?.products.find(p => p.id === variables.productId) 
        : product;
      toast({
        title: "Added to cart",
        description: `${variables.quantity} x ${addedProduct?.name || "Product"} added to your cart.`,
      });
      if (!isGroupedProduct) {
        setJustAdded(true);
        setTimeout(() => setJustAdded(false), 2000);
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Unable to add to cart",
        description: error.message || "Failed to add product to cart.",
        variant: "destructive",
      });
    },
  });

  if (!product) return null;

  const stockQty = product.stockQuantity || 0;
  const isOutOfStock = stockQty <= 0;
  const isLowStock = stockQty > 0 && stockQty <= (product.lowStockThreshold || 10);

  const handleAddToCart = (productId?: string, qty?: number) => {
    const targetProductId = productId || product.id;
    const targetQuantity = qty || quantity;
    if (!productId && isOutOfStock) return;
    addToCartMutation.mutate({ productId: targetProductId, quantity: targetQuantity });
  };

  const incrementQuantity = () => {
    const newQty = quantity + (product.casePackSize || 1);
    if (newQty <= stockQty) {
      setQuantity(newQty);
    }
  };

  const decrementQuantity = () => {
    const newQty = quantity - (product.casePackSize || 1);
    if (newQty >= (product.minOrderQuantity || 1)) {
      setQuantity(newQty);
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setQuantity(product.minOrderQuantity || 1);
      setJustAdded(false);
    }
    onOpenChange(open);
  };

  const groupVariants = groupData?.products || [];

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" data-testid="modal-product-detail">
        <DialogHeader>
          <DialogTitle className="sr-only">{product.name}</DialogTitle>
        </DialogHeader>
        
        <div className="grid gap-6 md:grid-cols-2">
          <div className="h-64 md:h-80">
            <ProductImage product={product} isOutOfStock={isOutOfStock} />
          </div>
          
          <div className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground font-mono mb-1" data-testid="text-modal-sku">
                SKU: {product.sku}
              </p>
              <h2 className="text-xl font-semibold" data-testid="text-modal-product-name">
                {product.name}
              </h2>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {isOutOfStock ? (
                <Badge variant="destructive">Out of Stock</Badge>
              ) : isLowStock ? (
                <Badge variant="destructive">Low Stock - {stockQty} left</Badge>
              ) : (
                <Badge variant="secondary">{stockQty} in stock</Badge>
              )}
              {isGroupedProduct && (
                <Badge variant="outline">
                  <Layers className="h-3 w-3 mr-1" />
                  {groupVariants.length} Variants
                </Badge>
              )}
            </div>

            <div className="flex items-baseline gap-3">
              <span className="text-3xl font-bold" data-testid="text-modal-price">
                ${product.basePrice}
              </span>
              {product.compareAtPrice && (
                <span className="text-lg text-muted-foreground line-through">
                  ${product.compareAtPrice}
                </span>
              )}
            </div>

            {product.description && (
              <div className="border-t pt-4">
                <h3 className="font-medium mb-2">Description</h3>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                  {product.description}
                </p>
              </div>
            )}

            <div className="border-t pt-4 space-y-3">
              <div className="flex gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Case Pack:</span>{" "}
                  <span className="font-medium">{product.casePackSize || 1}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Min Order:</span>{" "}
                  <span className="font-medium">{product.minOrderQuantity || 1}</span>
                </div>
              </div>

              {!isGroupedProduct && !isOutOfStock && (
                <div className="flex items-center gap-3">
                  <div className="flex items-center border rounded-md">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-10 w-10 rounded-r-none"
                      onClick={decrementQuantity}
                      disabled={quantity <= (product.minOrderQuantity || 1)}
                      data-testid="button-modal-decrease"
                    >
                      <Minus className="h-4 w-4" />
                    </Button>
                    <span className="w-12 text-center font-medium" data-testid="text-modal-quantity">
                      {quantity}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-10 w-10 rounded-l-none"
                      onClick={incrementQuantity}
                      disabled={quantity >= stockQty}
                      data-testid="button-modal-increase"
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                  
                  <Button
                    className="flex-1 h-10"
                    onClick={() => handleAddToCart()}
                    disabled={addToCartMutation.isPending || justAdded}
                    data-testid="button-modal-add-to-cart"
                  >
                    {justAdded ? (
                      <>
                        <Check className="h-4 w-4 mr-2" />
                        Added
                      </>
                    ) : (
                      <>
                        <ShoppingCart className="h-4 w-4 mr-2" />
                        Add to Cart
                      </>
                    )}
                  </Button>
                </div>
              )}

              {!isGroupedProduct && isOutOfStock && (
                <Button disabled className="w-full h-10" variant="destructive">
                  <Package className="h-4 w-4 mr-2" />
                  Out of Stock
                </Button>
              )}
            </div>
          </div>
        </div>

        {isGroupedProduct && (
          <div className="border-t pt-4 mt-4">
            <h3 className="font-medium mb-3 flex items-center gap-2">
              <Layers className="h-4 w-4" />
              Available Variants
            </h3>
            {isLoadingGroup ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Card key={i}>
                    <CardContent className="p-3 flex gap-3">
                      <Skeleton className="w-16 h-16 rounded" />
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-4 w-24" />
                        <Skeleton className="h-3 w-32" />
                        <Skeleton className="h-7 w-full" />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : groupVariants.length > 0 ? (
              <div className="space-y-3 max-h-80 overflow-y-auto">
                {groupVariants.map((variant) => (
                  <VariantCard
                    key={variant.id}
                    variant={variant}
                    onAddToCart={handleAddToCart}
                    isAddingToCart={addToCartMutation.isPending}
                  />
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No variants available</p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
