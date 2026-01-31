import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  ShoppingBag, 
  Clock,
  CheckCircle2,
  XCircle,
  Truck,
  Package,
  AlertCircle,
  User
} from "lucide-react";
import type { Order, SafeUser } from "@shared/schema";

type OrderWithUser = Order & { user: SafeUser };

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: typeof Clock }> = {
  pending_approval: { label: "Pending", variant: "secondary", icon: Clock },
  approved: { label: "Approved", variant: "default", icon: CheckCircle2 },
  rejected: { label: "Rejected", variant: "destructive", icon: XCircle },
  processing: { label: "Processing", variant: "default", icon: Package },
  shipped: { label: "Shipped", variant: "default", icon: Truck },
  delivered: { label: "Delivered", variant: "default", icon: CheckCircle2 },
  cancelled: { label: "Cancelled", variant: "destructive", icon: AlertCircle },
};

const allStatuses = ["pending_approval", "approved", "processing", "shipped", "delivered", "rejected", "cancelled"];

function OrderRow({ 
  order, 
  onApprove, 
  onReject,
  onUpdateStatus,
  onShip,
  onDeliver,
  isUpdating 
}: { 
  order: OrderWithUser;
  onApprove: (id: string) => void;
  onReject: (id: string, reason: string) => void;
  onUpdateStatus: (id: string, status: string) => void;
  onShip: (id: string, trackingNumber: string, carrier: string) => void;
  onDeliver: (id: string) => void;
  isUpdating: boolean;
}) {
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [showShipDialog, setShowShipDialog] = useState(false);
  const [trackingNumber, setTrackingNumber] = useState("");
  const [carrier, setCarrier] = useState("");
  
  const status = statusConfig[order.status] || statusConfig.pending_approval;
  const StatusIcon = status.icon;

  const formatDate = (date: string | Date) => {
    return new Date(date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const handleReject = () => {
    onReject(order.id, rejectReason);
    setShowRejectDialog(false);
    setRejectReason("");
  };

  return (
    <>
      <Card className="hover-elevate" data-testid={`card-admin-order-${order.id}`}>
        <CardContent className="p-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex-1 space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-semibold" data-testid={`text-order-number-${order.id}`}>
                  #{order.orderNumber}
                </span>
                <Badge variant={status.variant} className="flex items-center gap-1">
                  <StatusIcon className="h-3 w-3" />
                  {status.label}
                </Badge>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <User className="h-3 w-3" />
                <span>{order.user.businessName || order.user.email}</span>
                <span>|</span>
                <span>{formatDate(order.createdAt)}</span>
              </div>
              <div className="text-sm">
                <span className="font-medium" data-testid={`text-order-total-${order.id}`}>
                  ${order.totalAmount}
                </span>
                {order.shippingCity && (
                  <span className="text-muted-foreground ml-2">
                    → {order.shippingCity}, {order.shippingState}
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {order.status === "pending_approval" && (
                <>
                  <Button 
                    size="sm"
                    onClick={() => onApprove(order.id)}
                    disabled={isUpdating}
                    data-testid={`button-approve-order-${order.id}`}
                  >
                    <CheckCircle2 className="h-4 w-4 mr-1" />
                    Approve
                  </Button>
                  <Button 
                    size="sm" 
                    variant="destructive"
                    onClick={() => setShowRejectDialog(true)}
                    disabled={isUpdating}
                    data-testid={`button-reject-order-${order.id}`}
                  >
                    <XCircle className="h-4 w-4 mr-1" />
                    Reject
                  </Button>
                </>
              )}

              {(order.status === "approved" || order.status === "processing") && (
                <Button 
                  size="sm"
                  onClick={() => setShowShipDialog(true)}
                  disabled={isUpdating}
                  data-testid={`button-ship-order-${order.id}`}
                >
                  <Truck className="h-4 w-4 mr-1" />
                  Ship Order
                </Button>
              )}

              {order.status === "shipped" && (
                <Button 
                  size="sm"
                  onClick={() => onDeliver(order.id)}
                  disabled={isUpdating}
                  data-testid={`button-deliver-order-${order.id}`}
                >
                  <CheckCircle2 className="h-4 w-4 mr-1" />
                  Mark Delivered
                </Button>
              )}

              {order.trackingNumber && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Package className="h-3 w-3" />
                  {order.carrier ? `${order.carrier}: ` : ""}
                  {order.trackingNumber}
                </span>
              )}

              {order.status !== "pending_approval" && order.status !== "rejected" && order.status !== "cancelled" && order.status !== "delivered" && order.status !== "shipped" && (
                <Select 
                  value={order.status} 
                  onValueChange={(status) => onUpdateStatus(order.id, status)}
                  disabled={isUpdating}
                >
                  <SelectTrigger className="w-[140px]" data-testid={`select-status-${order.id}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {allStatuses.filter(s => s !== "pending_approval" && s !== "shipped" && s !== "delivered").map((s) => (
                      <SelectItem key={s} value={s}>
                        {statusConfig[s]?.label || s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Order</DialogTitle>
            <DialogDescription>
              Provide a reason for rejecting order #{order.orderNumber}
            </DialogDescription>
          </DialogHeader>
          <Input
            placeholder="Reason for rejection..."
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            data-testid="input-reject-reason"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRejectDialog(false)}>
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleReject}
              disabled={!rejectReason.trim()}
              data-testid="button-confirm-reject"
            >
              Reject Order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showShipDialog} onOpenChange={setShowShipDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ship Order</DialogTitle>
            <DialogDescription>
              Enter tracking information for order #{order.orderNumber}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Carrier</label>
              <Select value={carrier} onValueChange={setCarrier}>
                <SelectTrigger data-testid="select-carrier">
                  <SelectValue placeholder="Select carrier..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="UPS">UPS</SelectItem>
                  <SelectItem value="FedEx">FedEx</SelectItem>
                  <SelectItem value="USPS">USPS</SelectItem>
                  <SelectItem value="DHL">DHL</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Tracking Number</label>
              <Input
                placeholder="Enter tracking number..."
                value={trackingNumber}
                onChange={(e) => setTrackingNumber(e.target.value)}
                data-testid="input-tracking-number"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowShipDialog(false)}>
              Cancel
            </Button>
            <Button 
              onClick={() => {
                onShip(order.id, trackingNumber, carrier);
                setShowShipDialog(false);
                setTrackingNumber("");
                setCarrier("");
              }}
              disabled={!trackingNumber.trim()}
              data-testid="button-confirm-ship"
            >
              <Truck className="h-4 w-4 mr-1" />
              Ship Order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function OrderSkeleton() {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-4 w-24" />
          </div>
          <Skeleton className="h-9 w-24" />
        </div>
      </CardContent>
    </Card>
  );
}

export default function AdminOrdersPage() {
  const { toast } = useToast();

  const { data, isLoading, error } = useQuery<{ orders: OrderWithUser[] }>({
    queryKey: ["/api/admin/orders"],
  });

  const approveMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/admin/orders/${id}/approve`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/orders"] });
      toast({ title: "Order approved", description: "The order has been approved." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to approve order.", variant: "destructive" });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const res = await apiRequest("POST", `/api/admin/orders/${id}/reject`, { reason });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/orders"] });
      toast({ title: "Order rejected", description: "The order has been rejected." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to reject order.", variant: "destructive" });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const res = await apiRequest("PATCH", `/api/admin/orders/${id}/status`, { status });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/orders"] });
      toast({ title: "Status updated", description: "The order status has been updated." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update status.", variant: "destructive" });
    },
  });

  const shipMutation = useMutation({
    mutationFn: async ({ id, trackingNumber, carrier }: { id: string; trackingNumber: string; carrier: string }) => {
      const res = await apiRequest("POST", `/api/admin/orders/${id}/ship`, { trackingNumber, carrier });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/orders"] });
      toast({ title: "Order shipped", description: "Shipment notification sent to customer." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to ship order.", variant: "destructive" });
    },
  });

  const deliverMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/admin/orders/${id}/deliver`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/orders"] });
      toast({ title: "Order delivered", description: "Delivery confirmation sent to customer." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to mark as delivered.", variant: "destructive" });
    },
  });

  const handleApprove = (id: string) => approveMutation.mutate(id);
  const handleReject = (id: string, reason: string) => rejectMutation.mutate({ id, reason });
  const handleUpdateStatus = (id: string, status: string) => updateStatusMutation.mutate({ id, status });
  const handleShip = (id: string, trackingNumber: string, carrier: string) => shipMutation.mutate({ id, trackingNumber, carrier });
  const handleDeliver = (id: string) => deliverMutation.mutate(id);

  const orders = data?.orders || [];
  const isUpdating = approveMutation.isPending || rejectMutation.isPending || updateStatusMutation.isPending || shipMutation.isPending || deliverMutation.isPending;

  const pendingOrders = orders.filter(o => o.status === "pending_approval");
  const activeOrders = orders.filter(o => ["approved", "processing", "shipped"].includes(o.status));
  const completedOrders = orders.filter(o => ["delivered", "rejected", "cancelled"].includes(o.status));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" data-testid="text-page-title">Order Management</h1>
          <p className="text-muted-foreground">
            Approve, reject, and manage customer orders
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending</CardTitle>
            <Clock className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{pendingOrders.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active</CardTitle>
            <Package className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeOrders.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Completed</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{completedOrders.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Orders</CardTitle>
            <ShoppingBag className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{orders.length}</div>
          </CardContent>
        </Card>
      </div>

      {error && (
        <Card className="border-destructive">
          <CardContent className="flex items-center justify-center py-8">
            <p className="text-destructive">Failed to load orders. Please try again.</p>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <OrderSkeleton key={i} />
          ))}
        </div>
      ) : orders.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <ShoppingBag className="h-16 w-16 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No orders yet</h3>
            <p className="text-muted-foreground text-center">
              Orders will appear here when customers place them.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Tabs defaultValue="pending" className="space-y-4">
          <TabsList>
            <TabsTrigger value="pending" data-testid="tab-pending">
              Pending ({pendingOrders.length})
            </TabsTrigger>
            <TabsTrigger value="active" data-testid="tab-active">
              Active ({activeOrders.length})
            </TabsTrigger>
            <TabsTrigger value="completed" data-testid="tab-completed">
              Completed ({completedOrders.length})
            </TabsTrigger>
            <TabsTrigger value="all" data-testid="tab-all">
              All ({orders.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="pending" className="space-y-3">
            {pendingOrders.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  No pending orders
                </CardContent>
              </Card>
            ) : (
              pendingOrders.map((order) => (
                <OrderRow 
                  key={order.id} 
                  order={order}
                  onApprove={handleApprove}
                  onReject={handleReject}
                  onUpdateStatus={handleUpdateStatus}
                  onShip={handleShip}
                  onDeliver={handleDeliver}
                  isUpdating={isUpdating}
                />
              ))
            )}
          </TabsContent>

          <TabsContent value="active" className="space-y-3">
            {activeOrders.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  No active orders
                </CardContent>
              </Card>
            ) : (
              activeOrders.map((order) => (
                <OrderRow 
                  key={order.id} 
                  order={order}
                  onApprove={handleApprove}
                  onReject={handleReject}
                  onUpdateStatus={handleUpdateStatus}
                  onShip={handleShip}
                  onDeliver={handleDeliver}
                  isUpdating={isUpdating}
                />
              ))
            )}
          </TabsContent>

          <TabsContent value="completed" className="space-y-3">
            {completedOrders.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  No completed orders
                </CardContent>
              </Card>
            ) : (
              completedOrders.map((order) => (
                <OrderRow 
                  key={order.id} 
                  order={order}
                  onApprove={handleApprove}
                  onReject={handleReject}
                  onUpdateStatus={handleUpdateStatus}
                  onShip={handleShip}
                  onDeliver={handleDeliver}
                  isUpdating={isUpdating}
                />
              ))
            )}
          </TabsContent>

          <TabsContent value="all" className="space-y-3">
            {orders.map((order) => (
              <OrderRow 
                key={order.id} 
                order={order}
                onApprove={handleApprove}
                onReject={handleReject}
                onUpdateStatus={handleUpdateStatus}
                onShip={handleShip}
                onDeliver={handleDeliver}
                isUpdating={isUpdating}
              />
            ))}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
