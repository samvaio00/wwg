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
import heroBanner from "@/assets/images/hero-banner.png";
import heroSunglasses from "@/assets/images/hero-sunglasses.png";
import heroCarCharger from "@/assets/images/hero-car-charger.png";
import heroCable from "@/assets/images/hero-cable.png";
import heroCap from "@/assets/images/hero-cap.png";

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
        </div>
        <DropdownMenuSeparator />
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
              <AICartBuilder />
            </div>
            <div className="flex-1" />
            <div className="flex items-center gap-2">
              <HeaderUserMenu />
              <ThemeToggle />
              <CartButton />
            </div>
          </header>
          <div className="relative w-full h-[88px] md:h-[120px] overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-sky-100 via-blue-50 to-amber-50 dark:from-slate-800 dark:via-slate-700 dark:to-stone-700" />
            {/* Subtle floating product images */}
            <img src={heroSunglasses} alt="" className="hidden md:block absolute right-[45%] top-[10%] h-16 w-16 object-contain opacity-[0.12] rotate-[-8deg] mix-blend-multiply dark:mix-blend-screen dark:opacity-[0.15]" />
            <img src={heroCap} alt="" className="hidden md:block absolute right-[28%] bottom-[5%] h-20 w-20 object-contain opacity-[0.10] rotate-[5deg] mix-blend-multiply dark:mix-blend-screen dark:opacity-[0.12]" />
            <img src={heroCarCharger} alt="" className="hidden md:block absolute right-[12%] top-[15%] h-14 w-14 object-contain opacity-[0.14] rotate-[12deg] mix-blend-multiply dark:mix-blend-screen dark:opacity-[0.18]" />
            <img src={heroCable} alt="" className="hidden md:block absolute right-[5%] bottom-[15%] h-[72px] w-[72px] object-contain opacity-[0.13] rotate-[-5deg] mix-blend-multiply dark:mix-blend-screen dark:opacity-[0.16]" />
            <div className="absolute inset-0 flex items-center">
              <div className="px-6 md:px-10 flex-1 relative z-10">
                <h2 className="text-2xl md:text-3xl font-black text-slate-800 dark:text-white tracking-tight" style={{ fontFamily: "'Poppins', 'Inter', system-ui, sans-serif" }}>
                  Warner Wireless Gears
                </h2>
                <p className="text-slate-700 dark:text-white/90 text-sm md:text-base font-semibold mt-1">
                  Premium B2B Wholesale Distributors
                </p>
                <p className="text-slate-600 dark:text-white/70 text-xs md:text-sm mt-0.5 hidden md:block">
                  Serving gas stations, convenience stores, smoke shops, gift shops and retailers
                </p>
              </div>
            </div>
          </div>
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
        <Route path="/admin/analytics" component={AdminAnalyticsPage} />
        <Route path="/admin/settings" component={AdminSettingsPage} />
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
