import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Package, Plus, Minus, Check, ShoppingCart, X } from "lucide-react";
import type { Product } from "@shared/schema";

interface ProductDetailModalProps {
  product: Product | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function ProductImage({ product, isOutOfStock }: { product: Product; isOutOfStock: boolean }) {
  const [imageError, setImageError] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  
  const imageUrl = product.zohoItemId 
    ? `/api/products/${product.id}/image`
    : product.imageUrl;
  
  if (!imageUrl || imageError) {
    return (
      <div className="flex items-center justify-center h-full bg-muted rounded-md">
        <Package className="h-24 w-24 text-muted-foreground" />
      </div>
    );
  }
  
  return (
    <div className="relative h-full bg-muted rounded-md overflow-hidden">
      {!imageLoaded && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Package className="h-24 w-24 text-muted-foreground animate-pulse" />
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

export function ProductDetailModal({ product, open, onOpenChange }: ProductDetailModalProps) {
  const { toast } = useToast();
  const [quantity, setQuantity] = useState(1);
  const [justAdded, setJustAdded] = useState(false);

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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
      toast({
        title: "Added to cart",
        description: `${quantity} x ${product?.name || "Product"} added to your cart.`,
      });
      setJustAdded(true);
      setTimeout(() => setJustAdded(false), 2000);
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

  const handleAddToCart = () => {
    if (isOutOfStock) return;
    addToCartMutation.mutate({ productId: product.id, quantity });
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
              {product.category && (
                <Badge variant="outline">{product.category}</Badge>
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

              {!isOutOfStock && (
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
                    onClick={handleAddToCart}
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

              {isOutOfStock && (
                <Button disabled className="w-full h-10" variant="secondary">
                  <Package className="h-4 w-4 mr-2" />
                  Out of Stock
                </Button>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
