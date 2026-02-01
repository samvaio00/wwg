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
  Sparkles,
  TrendingUp,
  ClipboardList,
  UserCircle,
  Mail,
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
    title: "Analytics",
    url: "/admin/analytics",
    icon: BarChart3,
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

  // Fetch categories from Zoho
  const { data: categoriesData } = useQuery<{ categories: Category[] }>({
    queryKey: ["/api/categories"],
  });
  const categories = categoriesData?.categories || [];

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
                    <Sparkles className="h-4 w-4" />
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
              <div className="my-2 mx-2 border-t border-sidebar-border" />
              
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

        {!isAdmin && user && (
          <SidebarGroup>
            <SidebarGroupLabel>My Account</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={location === "/order-history"}
                    data-testid="nav-order-history"
                  >
                    <Link href="/order-history">
                      <ClipboardList className="h-4 w-4" />
                      <span>Order History</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={location === "/profile"}
                    data-testid="nav-profile"
                  >
                    <Link href="/profile">
                      <UserCircle className="h-4 w-4" />
                      <span>Edit Profile</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={location === "/contact"}
                    data-testid="nav-contact"
                  >
                    <Link href="/contact">
                      <Mail className="h-4 w-4" />
                      <span>Contact Us</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {isAdmin && (
          <SidebarGroup>
            <SidebarGroupLabel>Administration</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {adminNavItems.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      isActive={location === item.url}
                      data-testid={`nav-admin-${item.title.toLowerCase().replace(/\s+/g, "-")}`}
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
        )}
      </SidebarContent>
    </Sidebar>
  );
}
