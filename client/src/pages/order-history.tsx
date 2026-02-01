import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  ClipboardList, 
  Package, 
  Calendar,
  DollarSign,
  Truck,
  CheckCircle,
  Clock,
  XCircle,
  AlertCircle
} from "lucide-react";
import type { Order } from "@shared/schema";

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: typeof Clock }> = {
  pending_approval: { label: "Pending Approval", variant: "secondary", icon: Clock },
  approved: { label: "Approved", variant: "default", icon: CheckCircle },
  rejected: { label: "Rejected", variant: "destructive", icon: XCircle },
  processing: { label: "Processing", variant: "secondary", icon: Package },
  shipped: { label: "Shipped", variant: "default", icon: Truck },
  delivered: { label: "Delivered", variant: "default", icon: CheckCircle },
  cancelled: { label: "Cancelled", variant: "destructive", icon: XCircle },
};

function OrderCard({ order }: { order: Order }) {
  const config = statusConfig[order.status] || { label: order.status, variant: "outline" as const, icon: AlertCircle };
  const StatusIcon = config.icon;
  
  return (
    <Card className="hover-elevate" data-testid={`card-order-${order.id}`}>
      <CardContent className="p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <h3 className="font-semibold text-lg" data-testid={`text-order-number-${order.id}`}>
                {order.orderNumber}
              </h3>
              <Badge variant={config.variant} className="flex items-center gap-1">
                <StatusIcon className="h-3 w-3" />
                {config.label}
              </Badge>
            </div>
            <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
              <div className="flex items-center gap-1">
                <Calendar className="h-4 w-4" />
                {new Date(order.createdAt).toLocaleDateString()}
              </div>
              <div className="flex items-center gap-1">
                <Package className="h-4 w-4" />
                {order.itemCount || 0} items
              </div>
              <div className="flex items-center gap-1 font-medium text-foreground">
                <DollarSign className="h-4 w-4" />
                ${order.totalAmount}
              </div>
            </div>
          </div>
          {order.trackingNumber && (
            <div className="text-sm">
              <span className="text-muted-foreground">Tracking:</span>{" "}
              <span className="font-mono">{order.trackingNumber}</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function OrderHistoryPage() {
  const { data: ordersData, isLoading } = useQuery<{ orders: Order[] }>({
    queryKey: ["/api/orders"],
  });

  const orders = ordersData?.orders || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <ClipboardList className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-black tracking-tight" data-testid="heading-order-history" style={{ fontFamily: "'Poppins', 'Inter', system-ui, sans-serif" }}>
          Order History
        </h1>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <Skeleton className="h-6 w-32 mb-2" />
                <div className="flex gap-4">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-4 w-16" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : orders.length > 0 ? (
        <div className="space-y-4">
          {orders.map((order) => (
            <OrderCard key={order.id} order={order} />
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <ClipboardList className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No Orders Yet</h3>
            <p className="text-muted-foreground text-center">
              Your order history will appear here once you place your first order.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
