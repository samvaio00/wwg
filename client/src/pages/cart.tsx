import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { 
  ShoppingCart, 
  Package,
  Plus,
  Minus,
  Trash2,
  ArrowRight
} from "lucide-react";
import type { Cart, CartItem, Product } from "@shared/schema";

type CartItemWithProduct = CartItem & { product: Product };

function CartItemRow({ 
  item, 
  onUpdateQuantity, 
  onRemove,
  isUpdating 
}: { 
  item: CartItemWithProduct;
  onUpdateQuantity: (id: string, quantity: number) => void;
  onRemove: (id: string) => void;
  isUpdating: boolean;
}) {
  const incrementQuantity = () => {
    onUpdateQuantity(item.id, item.quantity + (item.product.casePackSize || 1));
  };

  const decrementQuantity = () => {
    const newQuantity = item.quantity - (item.product.casePackSize || 1);
    if (newQuantity >= (item.product.minOrderQuantity || 1)) {
      onUpdateQuantity(item.id, newQuantity);
    }
  };

  return (
    <div className="flex gap-4 py-4 border-b last:border-b-0" data-testid={`cart-item-${item.id}`}>
      <div className="w-20 h-20 bg-muted rounded-md overflow-hidden flex-shrink-0">
        {item.product.imageUrl ? (
          <img 
            src={item.product.imageUrl} 
            alt={item.product.name}
            className="object-cover w-full h-full"
          />
        ) : (
          <div className="flex items-center justify-center h-full">
            <Package className="h-8 w-8 text-muted-foreground" />
          </div>
        )}
      </div>
      
      <div className="flex-1 min-w-0">
        <h3 className="font-semibold truncate" data-testid={`text-cart-item-name-${item.id}`}>
          {item.product.name}
        </h3>
        <p className="text-sm text-muted-foreground font-mono">{item.product.sku}</p>
        <p className="text-sm text-muted-foreground">
          ${item.unitPrice} x {item.quantity} units
        </p>
      </div>

      <div className="flex flex-col items-end gap-2">
        <div className="flex items-center border rounded-md">
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-8 w-8"
            onClick={decrementQuantity}
            disabled={isUpdating || item.quantity <= (item.product.minOrderQuantity || 1)}
            data-testid={`button-decrease-cart-qty-${item.id}`}
          >
            <Minus className="h-3 w-3" />
          </Button>
          <span className="w-12 text-center text-sm font-medium" data-testid={`text-cart-qty-${item.id}`}>
            {item.quantity}
          </span>
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-8 w-8"
            onClick={incrementQuantity}
            disabled={isUpdating}
            data-testid={`button-increase-cart-qty-${item.id}`}
          >
            <Plus className="h-3 w-3" />
          </Button>
        </div>
        
        <div className="flex items-center gap-2">
          <span className="font-bold" data-testid={`text-cart-item-total-${item.id}`}>
            ${item.lineTotal}
          </span>
          <Button 
            variant="ghost" 
            size="icon"
            className="h-8 w-8 text-destructive hover:text-destructive"
            onClick={() => onRemove(item.id)}
            disabled={isUpdating}
            data-testid={`button-remove-cart-item-${item.id}`}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function CartSkeleton() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="flex gap-4 py-4">
          <Skeleton className="w-20 h-20 rounded-md" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-32" />
          </div>
          <Skeleton className="h-8 w-24" />
        </div>
      ))}
    </div>
  );
}

export default function CartPage() {
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const { data, isLoading, error } = useQuery<{ cart: Cart; items: CartItemWithProduct[] }>({
    queryKey: ["/api/cart"],
  });

  const updateQuantityMutation = useMutation({
    mutationFn: async ({ id, quantity }: { id: string; quantity: number }) => {
      const res = await apiRequest("PATCH", `/api/cart/items/${id}`, { quantity });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update quantity. Please try again.",
        variant: "destructive",
      });
    },
  });

  const removeItemMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/cart/items/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
      toast({
        title: "Item removed",
        description: "Item has been removed from your cart.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to remove item. Please try again.",
        variant: "destructive",
      });
    },
  });

  const clearCartMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("DELETE", "/api/cart");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
      toast({
        title: "Cart cleared",
        description: "All items have been removed from your cart.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to clear cart. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleUpdateQuantity = (id: string, quantity: number) => {
    updateQuantityMutation.mutate({ id, quantity });
  };

  const handleRemoveItem = (id: string) => {
    removeItemMutation.mutate(id);
  };

  const cart = data?.cart;
  const items = data?.items || [];
  const isUpdating = updateQuantityMutation.isPending || removeItemMutation.isPending || clearCartMutation.isPending;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" data-testid="text-page-title">Shopping Cart</h1>
          <p className="text-muted-foreground">
            Review your items before checkout
          </p>
        </div>
      </div>

      {error && (
        <Card className="border-destructive">
          <CardContent className="flex items-center justify-center py-8">
            <p className="text-destructive">Failed to load cart. Please try again.</p>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <Card>
              <CardContent className="p-6">
                <CartSkeleton />
              </CardContent>
            </Card>
          </div>
          <div>
            <Card>
              <CardContent className="p-6">
                <Skeleton className="h-32" />
              </CardContent>
            </Card>
          </div>
        </div>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <ShoppingCart className="h-16 w-16 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Your cart is empty</h3>
            <p className="text-muted-foreground text-center mb-4">
              Add some products to get started with your order.
            </p>
            <Button onClick={() => navigate("/products")} data-testid="button-browse-products">
              Browse Products
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
                <CardTitle>Cart Items ({cart?.itemCount || 0})</CardTitle>
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => clearCartMutation.mutate()}
                  disabled={isUpdating}
                  data-testid="button-clear-cart"
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  Clear Cart
                </Button>
              </CardHeader>
              <CardContent>
                {items.map((item) => (
                  <CartItemRow 
                    key={item.id} 
                    item={item}
                    onUpdateQuantity={handleUpdateQuantity}
                    onRemove={handleRemoveItem}
                    isUpdating={isUpdating}
                  />
                ))}
              </CardContent>
            </Card>
          </div>

          <div>
            <Card className="sticky top-20">
              <CardHeader>
                <CardTitle>Order Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span data-testid="text-cart-subtotal">${cart?.subtotal || "0.00"}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Shipping</span>
                  <span>Calculated at checkout</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Tax</span>
                  <span>Calculated at checkout</span>
                </div>
                <div className="border-t pt-4">
                  <div className="flex justify-between font-bold text-lg">
                    <span>Estimated Total</span>
                    <span data-testid="text-cart-total">${cart?.subtotal || "0.00"}</span>
                  </div>
                </div>
              </CardContent>
              <CardFooter>
                <Button 
                  className="w-full" 
                  size="lg"
                  onClick={() => navigate("/checkout")}
                  data-testid="button-checkout"
                >
                  Proceed to Checkout
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </CardFooter>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
