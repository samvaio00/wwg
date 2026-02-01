import { Switch, Route, Link } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger, SidebarInset } from "@/components/ui/sidebar";
import { ThemeProvider } from "@/lib/theme";
import { AuthProvider, useAuth } from "@/lib/auth";
import { ThemeToggle } from "@/components/theme-toggle";
import { AppSidebar } from "@/components/app-sidebar";
import { Footer } from "@/components/footer";
import { AICartBuilder } from "@/components/ai-cart-builder";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ShoppingCart, User, LogOut, Settings, ClipboardList, UserCircle, Mail } from "lucide-react";

import NotFound from "@/pages/not-found";
import LoginPage from "@/pages/login";
import RegisterPage from "@/pages/register";
import HomePage from "@/pages/home";
import WhatsNewPage from "@/pages/whats-new";
import TopSellersPage from "@/pages/top-sellers";
import OrderHistoryPage from "@/pages/order-history";
import ProfilePage from "@/pages/profile";
import ContactPage from "@/pages/contact";
import ProductsPage from "@/pages/products";
import CartPage from "@/pages/cart";
import CheckoutPage from "@/pages/checkout";
import OrdersPage from "@/pages/orders";
import OrderDetailPage from "@/pages/order-detail";
import AdminUsersPage from "@/pages/admin-users";
import AdminOrdersPage from "@/pages/admin-orders";
import AdminAnalyticsPage from "@/pages/admin-analytics";
import AdminSettingsPage from "@/pages/admin-settings";
import AdminCartsPage from "@/pages/admin-carts";
import AdminEmailTemplatesPage from "@/pages/admin-email-templates";
import AdminZohoStatusPage from "@/pages/admin-zoho-status";
import PendingApprovalPage from "@/pages/pending-approval";
import AboutPage from "@/pages/about";
import ReturnPolicyPage from "@/pages/return-policy";
import DisclaimerPage from "@/pages/disclaimer";

function LoadingScreen() {
  return (
    <div className="flex h-screen w-full items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4">
        <Skeleton className="h-12 w-12 rounded-full" />
        <Skeleton className="h-4 w-32" />
      </div>
    </div>
  );
}

function CartButton() {
  const { data } = useQuery<{ cart: { itemCount: number } }>({
    queryKey: ["/api/cart"],
  });
  const itemCount = data?.cart?.itemCount || 0;

  return (
    <Link href="/cart">
      <Button variant="ghost" size="icon" className="relative" data-testid="button-header-cart">
        <ShoppingCart className="h-5 w-5" />
        {itemCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">
            {itemCount > 99 ? "99+" : itemCount}
          </span>
        )}
      </Button>
    </Link>
  );
}

function HeaderUserMenu() {
  const { user, logout } = useAuth();
  const isAdmin = user?.role === "admin";
  const isStaff = user?.role === "staff";
  const isAdminOrStaff = isAdmin || isStaff;

  const getInitials = () => {
    if (user?.contactName) {
      return user.contactName
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2);
    }
    if (user?.businessName) {
      return user.businessName.slice(0, 2).toUpperCase();
    }
    return "U";
  };

  const handleLogout = async () => {
    await logout();
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" data-testid="button-user-menu">
          <Avatar className="h-7 w-7">
            <AvatarFallback className="text-xs">
              {getInitials()}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <div className="px-2 py-1.5">
          <p className="text-sm font-medium">{user?.contactName || user?.businessName}</p>
          <p className="text-xs text-muted-foreground">{user?.email}</p>
          {isAdmin && <p className="text-xs text-primary font-medium">Administrator</p>}
          {isStaff && <p className="text-xs text-blue-600 font-medium">Staff</p>}
        </div>
        <DropdownMenuSeparator />
        {/* Show different menu items based on role */}
        {isAdminOrStaff ? (
          <>
            <DropdownMenuItem asChild>
              <Link href="/admin/users" className="cursor-pointer" data-testid="menu-item-users">
                <User className="mr-2 h-4 w-4" />
                {isAdmin ? "User Management" : "User Approvals"}
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/admin/orders" className="cursor-pointer" data-testid="menu-item-admin-orders">
                <ClipboardList className="mr-2 h-4 w-4" />
                {isAdmin ? "Order Management" : "Order Approvals"}
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/admin/settings" className="cursor-pointer" data-testid="menu-item-admin-settings">
                <Settings className="mr-2 h-4 w-4" />
                Settings
              </Link>
            </DropdownMenuItem>
          </>
        ) : (
          <>
            <DropdownMenuItem asChild>
              <Link href="/orders" className="cursor-pointer" data-testid="menu-item-orders">
                <ShoppingCart className="mr-2 h-4 w-4" />
                My Orders
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/order-history" className="cursor-pointer" data-testid="menu-item-order-history">
                <ClipboardList className="mr-2 h-4 w-4" />
                Order History
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/profile" className="cursor-pointer" data-testid="menu-item-profile">
                <UserCircle className="mr-2 h-4 w-4" />
                Edit Profile
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/contact" className="cursor-pointer" data-testid="menu-item-contact">
                <Mail className="mr-2 h-4 w-4" />
                Contact Us
              </Link>
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={handleLogout}
          className="cursor-pointer text-destructive focus:text-destructive"
          data-testid="button-logout"
        >
          <LogOut className="mr-2 h-4 w-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const isStaff = user?.role === "staff";
  const isAdminOrStaff = isAdmin || isStaff;
  
  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <AppSidebar />
        <SidebarInset className="flex flex-col flex-1">
          <header className="sticky top-0 z-50 flex h-12 items-center justify-between gap-4 glass-header px-4">
            <div className="flex items-center gap-2">
              <SidebarTrigger data-testid="button-sidebar-toggle" />
              {/* Only show AI Cart Builder for customers (not admin or staff) */}
              {!isAdminOrStaff && <AICartBuilder />}
            </div>
            <div className="flex-1" />
            <div className="flex items-center gap-2">
              <HeaderUserMenu />
              <ThemeToggle />
              {/* Only show cart for customers (not admin or staff) */}
              {!isAdminOrStaff && <CartButton />}
            </div>
          </header>
          <main className="flex-1 overflow-auto p-6">
            {children}
          </main>
          <Footer />
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}

function AppRouter() {
  const { isLoading, isAuthenticated, user } = useAuth();

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (!isAuthenticated) {
    return (
      <Switch>
        <Route path="/register" component={RegisterPage} />
        <Route path="/login" component={LoginPage} />
        <Route component={LoginPage} />
      </Switch>
    );
  }

  // Show pending approval page for users awaiting approval
  if (user?.status === 'pending' || user?.status === 'rejected') {
    return <PendingApprovalPage />;
  }

  return (
    <AuthenticatedLayout>
      <Switch>
        <Route path="/" component={HomePage} />
        <Route path="/whats-new" component={WhatsNewPage} />
        <Route path="/top-sellers" component={TopSellersPage} />
        <Route path="/order-history" component={OrderHistoryPage} />
        <Route path="/profile" component={ProfilePage} />
        <Route path="/contact" component={ContactPage} />
        <Route path="/products" component={ProductsPage} />
        <Route path="/cart" component={CartPage} />
        <Route path="/checkout" component={CheckoutPage} />
        <Route path="/orders" component={OrdersPage} />
        <Route path="/orders/:id" component={OrderDetailPage} />
        <Route path="/admin/users" component={AdminUsersPage} />
        <Route path="/admin/orders" component={AdminOrdersPage} />
        <Route path="/admin/carts" component={AdminCartsPage} />
        <Route path="/admin/analytics" component={AdminAnalyticsPage} />
        <Route path="/admin/settings" component={AdminSettingsPage} />
        <Route path="/admin/email-templates" component={AdminEmailTemplatesPage} />
        <Route path="/admin/zoho-status" component={AdminZohoStatusPage} />
        <Route path="/about" component={AboutPage} />
        <Route path="/return-policy" component={ReturnPolicyPage} />
        <Route path="/disclaimer" component={DisclaimerPage} />
        <Route path="/settings" component={() => <PlaceholderPage title="Settings" />} />
        <Route component={NotFound} />
      </Switch>
    </AuthenticatedLayout>
  );
}

function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-[60vh] text-center">
      <h1 className="text-2xl font-bold text-foreground mb-2">{title}</h1>
      <p className="text-muted-foreground">This page will be implemented in future phases.</p>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
          <AuthProvider>
            <AppRouter />
            <Toaster />
          </AuthProvider>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
