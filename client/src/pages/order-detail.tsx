import { useQuery } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { 
  ArrowLeft,
  Package,
  Clock,
  CheckCircle2,
  XCircle,
  Truck,
  AlertCircle,
  MapPin,
  ExternalLink
} from "lucide-react";
import type { Order, OrderItem, Product } from "@shared/schema";

type OrderWithItems = Order & { 
  items: (OrderItem & { product: Product })[] 
};

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: typeof Clock; step: number }> = {
  pending_approval: { label: "Pending Approval", variant: "secondary", icon: Clock, step: 1 },
  approved: { label: "Approved", variant: "default", icon: CheckCircle2, step: 2 },
  rejected: { label: "Rejected", variant: "destructive", icon: XCircle, step: -1 },
  processing: { label: "Processing", variant: "default", icon: Package, step: 2 },
  shipped: { label: "Shipped", variant: "default", icon: Truck, step: 3 },
  delivered: { label: "Delivered", variant: "default", icon: CheckCircle2, step: 4 },
  cancelled: { label: "Cancelled", variant: "destructive", icon: AlertCircle, step: -1 },
};

const orderSteps = [
  { key: "pending_approval", label: "Order Placed", icon: Clock },
  { key: "approved", label: "Approved", icon: CheckCircle2 },
  { key: "shipped", label: "Shipped", icon: Truck },
  { key: "delivered", label: "Delivered", icon: Package },
];

function getCarrierTrackingUrl(carrier: string | null, trackingNumber: string): string | null {
  if (!carrier || !trackingNumber) return null;
  
  const carrierUrls: Record<string, string> = {
    "UPS": `https://www.ups.com/track?tracknum=${trackingNumber}`,
    "FedEx": `https://www.fedex.com/fedextrack/?trknbr=${trackingNumber}`,
    "USPS": `https://tools.usps.com/go/TrackConfirmAction?tLabels=${trackingNumber}`,
    "DHL": `https://www.dhl.com/en/express/tracking.html?AWB=${trackingNumber}`,
  };
  
  return carrierUrls[carrier] || null;
}

function OrderTimeline({ order }: { order: Order }) {
  const currentStatus = statusConfig[order.status];
  const isRejectedOrCancelled = currentStatus?.step === -1;

  const formatDateTime = (date: string | Date | null) => {
    if (!date) return null;
    return new Date(date).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  if (isRejectedOrCancelled) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Order Status</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3 p-4 rounded-lg bg-destructive/10">
            <XCircle className="h-8 w-8 text-destructive" />
            <div>
              <p className="font-semibold text-destructive">{currentStatus?.label}</p>
              {order.rejectionReason && (
                <p className="text-sm text-muted-foreground mt-1">{order.rejectionReason}</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Order Timeline</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="relative">
          {orderSteps.map((step, index) => {
            const stepStatus = statusConfig[step.key];
            const isCompleted = currentStatus && currentStatus.step >= stepStatus.step;
            const isCurrent = order.status === step.key || 
              (step.key === "approved" && order.status === "processing");
            const StepIcon = step.icon;

            let timestamp: string | null = null;
            if (step.key === "pending_approval") timestamp = formatDateTime(order.createdAt);
            if (step.key === "approved" && isCompleted) timestamp = formatDateTime(order.approvedAt);
            if (step.key === "shipped" && isCompleted) timestamp = formatDateTime(order.shippedAt);
            if (step.key === "delivered" && isCompleted) timestamp = formatDateTime(order.deliveredAt);

            return (
              <div key={step.key} className="flex gap-4 pb-8 last:pb-0">
                <div className="flex flex-col items-center">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-full border-2 ${
                    isCompleted 
                      ? "border-primary bg-primary text-primary-foreground" 
                      : "border-muted bg-background text-muted-foreground"
                  }`}>
                    <StepIcon className="h-5 w-5" />
                  </div>
                  {index < orderSteps.length - 1 && (
                    <div className={`w-0.5 flex-1 mt-2 ${
                      isCompleted && currentStatus.step > stepStatus.step
                        ? "bg-primary" 
                        : "bg-muted"
                    }`} />
                  )}
                </div>
                <div className="flex-1 pt-1.5">
                  <p className={`font-medium ${
                    isCompleted ? "text-foreground" : "text-muted-foreground"
                  }`}>
                    {step.label}
                    {isCurrent && (
                      <Badge variant="secondary" className="ml-2 text-xs">Current</Badge>
                    )}
                  </p>
                  {timestamp && (
                    <p className="text-sm text-muted-foreground">{timestamp}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function TrackingInfo({ order }: { order: Order }) {
  if (!order.trackingNumber) return null;

  const trackingUrl = getCarrierTrackingUrl(order.carrier, order.trackingNumber);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Truck className="h-5 w-5" />
          Tracking Information
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-muted-foreground">Carrier</p>
            <p className="font-medium">{order.carrier || "Unknown"}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Tracking Number</p>
            <p className="font-mono font-medium">{order.trackingNumber}</p>
          </div>
        </div>
        
        {trackingUrl && (
          <Button 
            variant="outline" 
            className="w-full"
            onClick={() => window.open(trackingUrl, "_blank")}
            data-testid="button-track-package"
          >
            <ExternalLink className="h-4 w-4 mr-2" />
            Track Package on {order.carrier}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function OrderItems({ items }: { items: (OrderItem & { product: Product })[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Order Items</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {items.map((item) => (
            <div key={item.id} className="flex gap-4" data-testid={`order-item-${item.id}`}>
              <div className="h-16 w-16 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                {item.product.imageUrl ? (
                  <img 
                    src={item.product.imageUrl} 
                    alt={item.product.name}
                    className="h-full w-full object-cover rounded-lg"
                  />
                ) : (
                  <Package className="h-8 w-8 text-muted-foreground" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{item.product.name}</p>
                <p className="text-sm text-muted-foreground">SKU: {item.product.sku}</p>
                <div className="flex justify-between items-center mt-1">
                  <span className="text-sm text-muted-foreground">
                    Qty: {item.quantity} × ${item.unitPrice}
                  </span>
                  <span className="font-medium">${item.lineTotal}</span>
                </div>
              </div>
            </div>
          ))}
          
          <Separator className="my-4" />
          
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Subtotal</span>
              <span>${items.reduce((sum, item) => sum + parseFloat(item.lineTotal), 0).toFixed(2)}</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ShippingAddress({ order }: { order: Order }) {
  if (!order.shippingAddress) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <MapPin className="h-5 w-5" />
          Shipping Address
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p>{order.shippingAddress}</p>
        <p>{order.shippingCity}, {order.shippingState} {order.shippingZipCode}</p>
      </CardContent>
    </Card>
  );
}

export default function OrderDetailPage() {
  const [, navigate] = useLocation();
  const [match, params] = useRoute("/orders/:id");
  const orderId = params?.id;

  const { data, isLoading, error } = useQuery<{ order: Order; items: (OrderItem & { product: Product })[] }>({
    queryKey: ["/api/orders", orderId],
    enabled: !!orderId,
  });

  if (!match) {
    return null;
  }

  const order = data?.order;
  const items = data?.items || [];
  const status = order ? statusConfig[order.status] : null;
  const StatusIcon = status?.icon || Clock;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button 
          variant="ghost" 
          size="icon"
          onClick={() => navigate("/orders")}
          data-testid="button-back"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">
            {isLoading ? (
              <Skeleton className="h-8 w-48" />
            ) : order ? (
              <>Order #{order.orderNumber}</>
            ) : (
              "Order Not Found"
            )}
          </h1>
          {order && (
            <div className="flex items-center gap-2 mt-1">
              <Badge variant={status?.variant} className="flex items-center gap-1">
                <StatusIcon className="h-3 w-3" />
                {status?.label}
              </Badge>
              <span className="text-sm text-muted-foreground">
                Total: <span className="font-semibold">${order.totalAmount}</span>
              </span>
            </div>
          )}
        </div>
      </div>

      {error && (
        <Card className="border-destructive">
          <CardContent className="flex items-center justify-center py-8">
            <p className="text-destructive">Failed to load order details. Please try again.</p>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-32" />
            </CardHeader>
            <CardContent className="space-y-4">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-32" />
            </CardHeader>
            <CardContent className="space-y-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </CardContent>
          </Card>
        </div>
      ) : order ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-6">
            <OrderTimeline order={order} />
            <TrackingInfo order={order} />
          </div>
          <div className="space-y-6">
            <OrderItems items={items} />
            <ShippingAddress order={order} />
          </div>
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Package className="h-16 w-16 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Order not found</h3>
            <p className="text-muted-foreground text-center mb-4">
              The order you're looking for doesn't exist or you don't have access to it.
            </p>
            <Button onClick={() => navigate("/orders")} data-testid="button-back-to-orders">
              Back to Orders
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
