import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ShoppingCart, User, Package, Clock, DollarSign } from "lucide-react";
import type { Cart, CartItem, Product, SafeUser } from "@shared/schema";

type ActiveCartData = {
  cart: Cart;
  user: SafeUser;
  items: (CartItem & { product: Product })[];
};

function formatCurrency(value: string | number | null | undefined): string {
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (num == null || isNaN(num)) return "$0.00";
  return `$${num.toFixed(2)}`;
}

function formatDate(date: Date | string): string {
  const d = new Date(date);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function CartCard({ data }: { data: ActiveCartData }) {
  const { cart, user, items } = data;
  
  return (
    <Card className="hover-elevate" data-testid={`card-cart-${cart.id}`}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base" data-testid={`text-cart-customer-${cart.id}`}>
              {user.businessName || user.contactName || user.email}
            </CardTitle>
          </div>
          <Badge variant="secondary" data-testid={`badge-cart-items-${cart.id}`}>
            {cart.itemCount} {cart.itemCount === 1 ? "item" : "items"}
          </Badge>
        </div>
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <span>{user.email}</span>
          {user.phone && <span>{user.phone}</span>}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-1 text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            <span>Updated {formatDate(cart.updatedAt)}</span>
          </div>
          <div className="flex items-center gap-1 font-medium">
            <DollarSign className="h-3.5 w-3.5" />
            <span data-testid={`text-cart-subtotal-${cart.id}`}>{formatCurrency(cart.subtotal)}</span>
          </div>
        </div>
        
        <div className="space-y-2">
          <div className="text-sm font-medium text-muted-foreground">Cart Items:</div>
          <div className="max-h-48 overflow-y-auto space-y-2">
            {items.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-3 rounded-md bg-muted/50 p-2"
                data-testid={`cart-item-${item.id}`}
              >
                {item.product.imageUrl ? (
                  <img
                    src={item.product.imageUrl}
                    alt={item.product.name}
                    className="h-10 w-10 rounded object-cover"
                  />
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center rounded bg-muted">
                    <Package className="h-5 w-5 text-muted-foreground" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{item.product.name}</div>
                  <div className="text-xs text-muted-foreground">
                    SKU: {item.product.sku} | Qty: {item.quantity}
                  </div>
                </div>
                <div className="text-sm font-medium">{formatCurrency(item.lineTotal)}</div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function LoadingSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {[1, 2, 3].map((i) => (
        <Card key={i}>
          <CardHeader>
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-4 w-32" />
          </CardHeader>
          <CardContent className="space-y-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-20 w-full" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default function AdminCartsPage() {
  const { data, isLoading, error } = useQuery<{ carts: ActiveCartData[] }>({
    queryKey: ["/api/admin/active-carts"],
  });

  const activeCarts = data?.carts || [];

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Active Shopping Carts</h1>
          <p className="text-muted-foreground">
            View all customer shopping carts that have items
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ShoppingCart className="h-5 w-5 text-muted-foreground" />
          <span className="text-lg font-semibold" data-testid="text-cart-count">
            {activeCarts.length} active {activeCarts.length === 1 ? "cart" : "carts"}
          </span>
        </div>
      </div>

      {isLoading ? (
        <LoadingSkeleton />
      ) : error ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Failed to load active carts. Please try again.
          </CardContent>
        </Card>
      ) : activeCarts.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <ShoppingCart className="mx-auto h-12 w-12 text-muted-foreground/50" />
            <p className="mt-4 text-muted-foreground">No active shopping carts</p>
            <p className="text-sm text-muted-foreground">
              Customer carts with items will appear here
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {activeCarts.map((cartData) => (
            <CartCard key={cartData.cart.id} data={cartData} />
          ))}
        </div>
      )}
    </div>
  );
}
