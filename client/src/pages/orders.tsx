import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  ShoppingBag, 
  Package,
  Clock,
  CheckCircle2,
  XCircle,
  Truck,
  AlertCircle
} from "lucide-react";
import type { Order } from "@shared/schema";

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: typeof Clock }> = {
  pending_approval: { label: "Pending Approval", variant: "secondary", icon: Clock },
  approved: { label: "Approved", variant: "default", icon: CheckCircle2 },
  rejected: { label: "Rejected", variant: "destructive", icon: XCircle },
  processing: { label: "Processing", variant: "default", icon: Package },
  shipped: { label: "Shipped", variant: "default", icon: Truck },
  delivered: { label: "Delivered", variant: "default", icon: CheckCircle2 },
  cancelled: { label: "Cancelled", variant: "destructive", icon: AlertCircle },
};

function OrderCard({ order }: { order: Order }) {
  const [, navigate] = useLocation();
  const status = statusConfig[order.status] || statusConfig.pending_approval;
  const StatusIcon = status.icon;

  const formatDate = (date: string | Date) => {
    return new Date(date).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  return (
    <Card className="hover-elevate" data-testid={`card-order-${order.id}`}>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0 pb-2">
        <div>
          <CardTitle className="text-base font-semibold" data-testid={`text-order-number-${order.id}`}>
            Order #{order.orderNumber}
          </CardTitle>
          <CardDescription>
            Placed on {formatDate(order.createdAt)}
          </CardDescription>
        </div>
        <Badge variant={status.variant} className="flex items-center gap-1" data-testid={`badge-order-status-${order.id}`}>
          <StatusIcon className="h-3 w-3" />
          {status.label}
        </Badge>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Total</span>
            <span className="font-bold" data-testid={`text-order-total-${order.id}`}>${order.totalAmount}</span>
          </div>
          
          {order.shippingAddress && (
            <div className="text-sm">
              <span className="text-muted-foreground">Shipping to: </span>
              <span>{order.shippingAddress}, {order.shippingCity}, {order.shippingState} {order.shippingZipCode}</span>
            </div>
          )}

          {order.rejectionReason && (
            <div className="text-sm text-destructive">
              <span className="font-medium">Reason: </span>
              {order.rejectionReason}
            </div>
          )}

          <Button 
            variant="outline" 
            size="sm" 
            className="w-full"
            onClick={() => navigate(`/orders/${order.id}`)}
            data-testid={`button-view-order-${order.id}`}
          >
            View Details
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function OrderSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-4 w-24" />
      </CardHeader>
      <CardContent className="space-y-3">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-9 w-full" />
      </CardContent>
    </Card>
  );
}

export default function OrdersPage() {
  const [, navigate] = useLocation();

  const { data, isLoading, error } = useQuery<{ orders: Order[] }>({
    queryKey: ["/api/orders"],
  });

  const orders = data?.orders || [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" data-testid="text-page-title">My Orders</h1>
          <p className="text-muted-foreground">
            View and track your order history
          </p>
        </div>
        <Button onClick={() => navigate("/products")} data-testid="button-shop-now">
          Shop Now
        </Button>
      </div>

      {error && (
        <Card className="border-destructive">
          <CardContent className="flex items-center justify-center py-8">
            <p className="text-destructive">Failed to load orders. Please try again.</p>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <OrderSkeleton key={i} />
          ))}
        </div>
      ) : orders.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <ShoppingBag className="h-16 w-16 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No orders yet</h3>
            <p className="text-muted-foreground text-center mb-4">
              Start shopping to place your first order.
            </p>
            <Button onClick={() => navigate("/products")} data-testid="button-start-shopping">
              Browse Products
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {orders.map((order) => (
            <OrderCard key={order.id} order={order} />
          ))}
        </div>
      )}
    </div>
  );
}
