import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Package, 
  ShoppingCart, 
  Users, 
  TrendingUp,
  Clock,
  CheckCircle2,
  AlertCircle
} from "lucide-react";

export default function HomePage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();

  // Redirect customers to products page - dashboard is for admins only
  useEffect(() => {
    if (user && user.role !== "admin") {
      setLocation("/products");
    }
  }, [user, setLocation]);

  const getStatusBadge = () => {
    if (!user) return null;
    
    switch (user.status) {
      case "approved":
        return <Badge variant="default" data-testid="badge-status-approved"><CheckCircle2 className="h-3 w-3 mr-1" /> Approved</Badge>;
      case "pending":
        return <Badge variant="secondary" data-testid="badge-status-pending"><Clock className="h-3 w-3 mr-1" /> Pending Approval</Badge>;
      case "rejected":
        return <Badge variant="destructive" data-testid="badge-status-rejected"><AlertCircle className="h-3 w-3 mr-1" /> Rejected</Badge>;
      default:
        return null;
    }
  };

  const getRoleBadge = () => {
    if (!user) return null;
    
    if (user.role === "admin") {
      return <Badge variant="default" data-testid="badge-role-admin">Admin</Badge>;
    }
    return null;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">
            Welcome back, {user?.contactName || user?.businessName || "User"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {getStatusBadge()}
          {getRoleBadge()}
        </div>
      </div>

      {user?.status === "pending" && (
        <Card className="border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950">
          <CardContent className="flex items-center gap-4 py-4">
            <Clock className="h-8 w-8 text-amber-600" />
            <div>
              <h3 className="font-semibold text-amber-900 dark:text-amber-100">Account Pending Approval</h3>
              <p className="text-sm text-amber-700 dark:text-amber-300">
                Your account is being reviewed. You'll receive access to wholesale pricing once approved.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Products</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">--</div>
            <p className="text-xs text-muted-foreground">Available for order</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Orders</CardTitle>
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">--</div>
            <p className="text-xs text-muted-foreground">This month</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Customers</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">--</div>
            <p className="text-xs text-muted-foreground">Registered retailers</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Revenue</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">--</div>
            <p className="text-xs text-muted-foreground">This month</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>Common tasks for your account</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Product browsing and ordering will be available in future phases.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>Your latest actions</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              No recent activity to display.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
