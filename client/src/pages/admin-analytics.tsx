import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { 
  DollarSign, 
  ShoppingCart, 
  Users, 
  TrendingUp,
  Package,
  Clock,
  CheckCircle2,
  Truck,
  XCircle,
  Cloud
} from "lucide-react";

type AnalyticsData = {
  orderMetrics: {
    totalOrders: number;
    totalRevenue: string;
    averageOrderValue: string;
    ordersByStatus: Record<string, number>;
  };
  customerMetrics: {
    totalCustomers: number;
    activeCustomers: number;
    pendingCustomers: number;
  };
  salesTrend: { date: string; orders: number; revenue: number }[];
  topCustomers: {
    id: string;
    businessName: string | null;
    email: string;
    totalSpent: string;
    orderCount: number;
  }[];
};

type TopProductsData = {
  topProducts: {
    productId: string;
    name: string;
    sku: string;
    quantitySold: number;
    revenue: string;
  }[];
};

const statusLabels: Record<string, string> = {
  pending_approval: "Pending",
  approved: "Approved",
  processing: "Processing",
  shipped: "Shipped",
  delivered: "Delivered",
  rejected: "Rejected",
  cancelled: "Cancelled"
};

const statusIcons: Record<string, typeof Clock> = {
  pending_approval: Clock,
  approved: CheckCircle2,
  processing: Package,
  shipped: Truck,
  delivered: CheckCircle2,
  rejected: XCircle,
  cancelled: XCircle
};

function MetricCard({ 
  title, 
  value, 
  description, 
  icon: Icon,
  loading 
}: { 
  title: string; 
  value: string; 
  description?: string;
  icon: typeof DollarSign;
  loading?: boolean;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-8 w-24" />
        ) : (
          <>
            <div className="text-2xl font-bold" data-testid={`metric-${title.toLowerCase().replace(/\s/g, '-')}`}>
              {value}
            </div>
            {description && (
              <p className="text-xs text-muted-foreground">{description}</p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function SalesTrendChart({ data, loading }: { data: { date: string; orders: number; revenue: number }[]; loading?: boolean }) {
  if (loading) {
    return (
      <Card className="col-span-full">
        <CardHeader>
          <CardTitle>Sales Trend (Last 30 Days)</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-48 w-full" />
        </CardContent>
      </Card>
    );
  }

  const maxRevenue = Math.max(...data.map(d => d.revenue), 1);
  
  return (
    <Card className="col-span-full">
      <CardHeader>
        <CardTitle>Sales Trend (Last 30 Days)</CardTitle>
        <CardDescription>Daily revenue and order count</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-end gap-1 h-48" data-testid="chart-sales-trend">
          {data.map((day, i) => {
            const height = Math.max((day.revenue / maxRevenue) * 100, 2);
            return (
              <div 
                key={day.date} 
                className="flex-1 group relative"
                title={`${day.date}: $${day.revenue.toFixed(2)} (${day.orders} orders)`}
              >
                <div 
                  className="bg-primary/80 hover:bg-primary rounded-t transition-colors"
                  style={{ height: `${height}%` }}
                />
                {i % 5 === 0 && (
                  <span className="absolute -bottom-5 left-0 text-[10px] text-muted-foreground">
                    {new Date(day.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </span>
                )}
              </div>
            );
          })}
        </div>
        <div className="mt-8 flex justify-between text-sm text-muted-foreground">
          <span>Hover bars for details</span>
          <span>Max: ${maxRevenue.toFixed(2)}</span>
        </div>
      </CardContent>
    </Card>
  );
}

function OrderStatusBreakdown({ data, loading }: { data: Record<string, number>; loading?: boolean }) {
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Orders by Status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-6 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  const total = Object.values(data).reduce((a, b) => a + b, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Orders by Status</CardTitle>
        <CardDescription>Distribution of order statuses</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3" data-testid="order-status-breakdown">
        {Object.entries(data).map(([status, count]) => {
          const percentage = total > 0 ? (count / total) * 100 : 0;
          const StatusIcon = statusIcons[status] || Package;
          return (
            <div key={status} className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <StatusIcon className="h-4 w-4 text-muted-foreground" />
                  <span>{statusLabels[status] || status}</span>
                </div>
                <span className="font-medium">{count}</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div 
                  className="h-full bg-primary rounded-full transition-all"
                  style={{ width: `${percentage}%` }}
                />
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function TopCustomersTable({ data, loading }: { data: AnalyticsData['topCustomers']; loading?: boolean }) {
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Top Customers</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Top Customers</CardTitle>
        <CardDescription>By total order value</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4" data-testid="top-customers-list">
          {data.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">No customer data yet</p>
          ) : (
            data.map((customer, index) => (
              <div key={customer.id} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Badge variant="secondary" className="w-6 h-6 flex items-center justify-center p-0">
                    {index + 1}
                  </Badge>
                  <div>
                    <p className="font-medium text-sm">{customer.businessName || customer.email}</p>
                    <p className="text-xs text-muted-foreground">{customer.orderCount} orders</p>
                  </div>
                </div>
                <span className="font-bold">${customer.totalSpent}</span>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function TopProductsTable({ data, loading }: { data: TopProductsData['topProducts']; loading?: boolean }) {
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Top Products</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Top Products</CardTitle>
        <CardDescription>By revenue</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4" data-testid="top-products-list">
          {data.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">No sales data yet</p>
          ) : (
            data.slice(0, 10).map((product, index) => (
              <div key={product.productId} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Badge variant="secondary" className="w-6 h-6 flex items-center justify-center p-0">
                    {index + 1}
                  </Badge>
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{product.name}</p>
                    <p className="text-xs text-muted-foreground">SKU: {product.sku} · Qty: {product.quantitySold}</p>
                  </div>
                </div>
                <span className="font-bold flex-shrink-0">${product.revenue}</span>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}

type ZohoApiStatsData = {
  lastHour: { total: number; success: number; failed: number };
  today: { total: number; success: number; failed: number };
};

export default function AdminAnalyticsPage() {
  const { data: analytics, isLoading: analyticsLoading } = useQuery<AnalyticsData>({
    queryKey: ["/api/admin/analytics"],
  });

  const { data: topProducts, isLoading: productsLoading } = useQuery<TopProductsData>({
    queryKey: ["/api/admin/analytics/top-products"],
  });

  const { data: zohoStats, isLoading: zohoLoading } = useQuery<ZohoApiStatsData>({
    queryKey: ["/api/admin/analytics/zoho-api-stats"],
    refetchInterval: 60000, // Refresh every minute
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight" data-testid="text-page-title">Analytics Dashboard</h1>
        <p className="text-muted-foreground">
          Monitor sales, orders, and customer activity
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Total Revenue"
          value={analytics ? `$${analytics.orderMetrics.totalRevenue}` : "$0"}
          description="From completed orders"
          icon={DollarSign}
          loading={analyticsLoading}
        />
        <MetricCard
          title="Total Orders"
          value={String(analytics?.orderMetrics.totalOrders || 0)}
          description="All time"
          icon={ShoppingCart}
          loading={analyticsLoading}
        />
        <MetricCard
          title="Avg Order Value"
          value={analytics ? `$${analytics.orderMetrics.averageOrderValue}` : "$0"}
          description="Per order"
          icon={TrendingUp}
          loading={analyticsLoading}
        />
        <MetricCard
          title="Active Customers"
          value={String(analytics?.customerMetrics.activeCustomers || 0)}
          description={`${analytics?.customerMetrics.pendingCustomers || 0} pending`}
          icon={Users}
          loading={analyticsLoading}
        />
      </div>

      {/* Zoho API Stats */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
            <CardTitle className="text-sm font-medium">Zoho API Calls (Last Hour)</CardTitle>
            <Cloud className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {zohoLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <>
                <div className="text-2xl font-bold" data-testid="metric-zoho-api-hour">
                  {zohoStats?.lastHour.total || 0}
                </div>
                <p className="text-xs text-muted-foreground">
                  <span className="text-green-600">{zohoStats?.lastHour.success || 0} success</span>
                  {" · "}
                  <span className="text-red-600">{zohoStats?.lastHour.failed || 0} failed</span>
                </p>
              </>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
            <CardTitle className="text-sm font-medium">Zoho API Calls (Today)</CardTitle>
            <Cloud className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {zohoLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <>
                <div className="text-2xl font-bold" data-testid="metric-zoho-api-today">
                  {zohoStats?.today.total || 0}
                </div>
                <p className="text-xs text-muted-foreground">
                  <span className="text-green-600">{zohoStats?.today.success || 0} success</span>
                  {" · "}
                  <span className="text-red-600">{zohoStats?.today.failed || 0} failed</span>
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <SalesTrendChart 
        data={analytics?.salesTrend || []} 
        loading={analyticsLoading} 
      />

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <OrderStatusBreakdown 
          data={analytics?.orderMetrics.ordersByStatus || {}} 
          loading={analyticsLoading}
        />
        <TopCustomersTable 
          data={analytics?.topCustomers || []} 
          loading={analyticsLoading}
        />
        <TopProductsTable 
          data={topProducts?.topProducts || []} 
          loading={productsLoading}
        />
      </div>
    </div>
  );
}
