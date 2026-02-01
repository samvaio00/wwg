import { Link, useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { useQuery } from "@tanstack/react-query";
import wwgLogo from "@assets/wwg-logo_1769841225412.jpg";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import {
  Package,
  LayoutDashboard,
  Users,
  Settings,
  Tag,
  BarChart3,
  Home,
  Gift,
  TrendingUp,
  ShoppingCart,
  Mail,
  RefreshCw,
} from "lucide-react";
import type { Category } from "@shared/schema";

const adminNavItems = [
  {
    title: "Dashboard",
    url: "/",
    icon: LayoutDashboard,
  },
  {
    title: "User Management",
    url: "/admin/users",
    icon: Users,
  },
  {
    title: "Order Management",
    url: "/admin/orders",
    icon: Package,
  },
  {
    title: "Active Carts",
    url: "/admin/carts",
    icon: ShoppingCart,
  },
  {
    title: "Analytics",
    url: "/admin/analytics",
    icon: BarChart3,
  },
  {
    title: "Email Templates",
    url: "/admin/email-templates",
    icon: Mail,
  },
  {
    title: "Zoho Status",
    url: "/admin/zoho-status",
    icon: RefreshCw,
  },
  {
    title: "Settings",
    url: "/admin/settings",
    icon: Settings,
  },
];

const staffNavItems = [
  {
    title: "Dashboard",
    url: "/",
    icon: LayoutDashboard,
  },
  {
    title: "User Approvals",
    url: "/admin/users",
    icon: Users,
  },
  {
    title: "Order Approvals",
    url: "/admin/orders",
    icon: Package,
  },
  {
    title: "Active Carts",
    url: "/admin/carts",
    icon: ShoppingCart,
  },
  {
    title: "Email Templates",
    url: "/admin/email-templates",
    icon: Mail,
  },
  {
    title: "Settings",
    url: "/admin/settings",
    icon: Settings,
  },
];

export function AppSidebar() {
  const [location] = useLocation();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const isStaff = user?.role === "staff";
  const isAdminOrStaff = isAdmin || isStaff;

  // Fetch categories from Zoho (only for customer users)
  const { data: categoriesData } = useQuery<{ categories: Category[] }>({
    queryKey: ["/api/categories"],
    enabled: !isAdminOrStaff, // Don't fetch categories for admin or staff users
  });
  const categories = categoriesData?.categories || [];

  // Choose navigation items based on role
  const navItems = isAdmin ? adminNavItems : isStaff ? staffNavItems : [];

  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <Link href="/" className="flex items-center justify-center text-sidebar-foreground">
          <img 
            src={wwgLogo} 
            alt="Warner Wireless Gears" 
            className="w-full max-w-[14rem] h-auto rounded-lg object-contain shadow-lg transition-transform hover:scale-105" 
          />
        </Link>
      </SidebarHeader>

      <SidebarContent>
        {/* Admin/Staff navigation */}
        {isAdminOrStaff ? (
          <SidebarGroup>
            <SidebarGroupLabel>{isAdmin ? "Administration" : "Staff Panel"}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {navItems.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      isActive={location === item.url}
                      data-testid={`nav-${isAdmin ? 'admin' : 'staff'}-${item.title.toLowerCase().replace(/\s+/g, "-")}`}
                    >
                      <Link href={item.url}>
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ) : (
          /* Customer navigation - Browse section */
          <SidebarGroup>
            <SidebarGroupLabel>Browse</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={location === "/"}
                    data-testid="nav-home"
                  >
                    <Link href="/">
                      <Home className="h-4 w-4" />
                      <span>Home</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={location === "/whats-new"}
                    data-testid="nav-whats-new"
                  >
                    <Link href="/whats-new">
                      <Gift className="h-4 w-4" />
                      <span>What's New</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={location === "/top-sellers"}
                    data-testid="nav-top-sellers"
                  >
                    <Link href="/top-sellers">
                      <TrendingUp className="h-4 w-4" />
                      <span>Top Sellers</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                
                {/* Separator between Browse items and Categories */}
                <div className="my-3 mx-2 border-t-2 border-sidebar-border/60" />
                
                {categories.map((category) => (
                  <SidebarMenuItem key={category.id}>
                    <SidebarMenuButton
                      asChild
                      isActive={location === `/products?category=${category.slug}`}
                      data-testid={`nav-category-${category.slug}`}
                    >
                      <Link href={`/products?category=${category.slug}`}>
                        <Tag className="h-4 w-4" />
                        <span>{category.name}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
                {categories.length === 0 && (
                  <SidebarMenuItem>
                    <span className="text-sm text-muted-foreground px-2">No categories available</span>
                  </SidebarMenuItem>
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
    </Sidebar>
  );
}
