import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Loader2, Star, Search, X } from "lucide-react";
import type { Product } from "@shared/schema";

export default function AdminHighlightedProductsPage() {
  const { toast } = useToast();
  const [productSearch, setProductSearch] = useState("");

  const { data: highlightedData, isLoading: highlightedLoading } = useQuery<{ products: Product[] }>({
    queryKey: ["/api/admin/highlighted-products"],
  });

  const { data: allProductsData, isLoading: productsLoading } = useQuery<{ products: Product[]; pagination: { totalCount: number } }>({
    queryKey: ["/api/products", "search", productSearch],
    queryFn: async () => {
      const params = new URLSearchParams({ search: productSearch, limit: "20" });
      const res = await fetch(`/api/products?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch products");
      return res.json();
    },
    enabled: productSearch.length >= 2,
  });

  const toggleHighlightMutation = useMutation({
    mutationFn: async ({ productId, isHighlighted }: { productId: string; isHighlighted: boolean }) => {
      const res = await apiRequest("POST", `/api/admin/products/${productId}/highlight`, { isHighlighted });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/highlighted-products"] });
      queryClient.invalidateQueries({ queryKey: ["/api/highlighted-products"] });
      toast({
        title: "Product Updated",
        description: "Highlight status has been updated",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update product highlight status",
        variant: "destructive",
      });
    },
  });

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Highlighted Products</h1>
        <p className="text-muted-foreground">
          Select products to feature on the homepage for customers
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Star className="h-5 w-5" />
            Featured Products
          </CardTitle>
          <CardDescription>
            Select products to feature on the homepage. If none are selected, products from the "Warner" category will be shown.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Search Products to Add</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search products by name or SKU..."
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                className="pl-10"
                data-testid="input-highlight-search"
              />
            </div>
            
            {productSearch.length >= 2 && (
              <div className="max-h-48 overflow-y-auto border rounded-lg">
                {productsLoading ? (
                  <div className="p-3 text-center text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin mx-auto" />
                  </div>
                ) : allProductsData?.products && allProductsData.products.length > 0 ? (
                  allProductsData.products
                    .filter(p => !highlightedData?.products?.some(h => h.id === p.id))
                    .map((product) => (
                      <div
                        key={product.id}
                        className="flex items-center justify-between p-2 hover:bg-muted/50 border-b last:border-b-0"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm truncate">{product.name}</p>
                          <p className="text-xs text-muted-foreground">SKU: {product.sku}</p>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => toggleHighlightMutation.mutate({ productId: product.id, isHighlighted: true })}
                          disabled={toggleHighlightMutation.isPending}
                          data-testid={`button-add-highlight-${product.id}`}
                        >
                          <Star className="h-3 w-3 mr-1" />
                          Add
                        </Button>
                      </div>
                    ))
                ) : (
                  <div className="p-3 text-center text-muted-foreground text-sm">
                    No products found
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">
              Currently Highlighted ({highlightedData?.products?.length || 0})
            </label>
            {highlightedLoading ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading...
              </div>
            ) : highlightedData?.products && highlightedData.products.length > 0 ? (
              <div className="space-y-2">
                {highlightedData.products.map((product) => (
                  <div
                    key={product.id}
                    className="flex items-center justify-between p-3 rounded-lg border bg-muted/30"
                    data-testid={`highlighted-product-${product.id}`}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{product.name}</p>
                      <p className="text-xs text-muted-foreground">SKU: {product.sku} | ${product.basePrice}</p>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => toggleHighlightMutation.mutate({ productId: product.id, isHighlighted: false })}
                      disabled={toggleHighlightMutation.isPending}
                      data-testid={`button-remove-highlight-${product.id}`}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-4 text-muted-foreground border rounded-lg">
                <Star className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No highlighted products</p>
                <p className="text-xs">Products from "Warner" category will be shown on homepage</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
