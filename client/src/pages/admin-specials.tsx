import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Loader2, Search, Trash2, Tag, DollarSign, Clock, Percent } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { Special } from "@shared/schema";
import { format, formatDistanceToNow } from "date-fns";

interface ProductGroup {
  zohoGroupId: string;
  zohoGroupName: string;
  basePrice: string;
  hasActiveSpecial: boolean;
}

export default function AdminSpecialsPage() {
  const { toast } = useToast();
  const [groupSearch, setGroupSearch] = useState("");
  const [selectedGroup, setSelectedGroup] = useState<ProductGroup | null>(null);
  const [specialPrice, setSpecialPrice] = useState("");

  const { data: specialsData, isLoading: specialsLoading } = useQuery<{ specials: Special[] }>({
    queryKey: ["/api/admin/specials"],
  });

  const { data: groupsData, isLoading: groupsLoading } = useQuery<{ groups: ProductGroup[] }>({
    queryKey: ["/api/admin/specials/groups", groupSearch],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (groupSearch) params.append("search", groupSearch);
      const res = await fetch(`/api/admin/specials/groups?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch groups");
      return res.json();
    },
    enabled: groupSearch.length >= 2,
  });

  const createSpecialMutation = useMutation({
    mutationFn: async (data: { zohoGroupId: string; zohoGroupName: string; specialPrice: string; originalPrice: string }) => {
      const res = await apiRequest("POST", "/api/admin/specials", data);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to create special");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/specials"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/specials/groups"] });
      queryClient.invalidateQueries({ queryKey: ["/api/specials"] });
      toast({
        title: "Special Created",
        description: "The special pricing has been set for 2 weeks",
      });
      setSelectedGroup(null);
      setSpecialPrice("");
      setGroupSearch("");
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteSpecialMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/admin/specials/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/specials"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/specials/groups"] });
      queryClient.invalidateQueries({ queryKey: ["/api/specials"] });
      toast({
        title: "Special Removed",
        description: "The special pricing has been removed",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to remove special",
        variant: "destructive",
      });
    },
  });

  const handleCreateSpecial = () => {
    if (!selectedGroup || !specialPrice) return;
    
    const price = parseFloat(specialPrice);
    if (isNaN(price) || price <= 0) {
      toast({
        title: "Invalid Price",
        description: "Please enter a valid price",
        variant: "destructive",
      });
      return;
    }

    createSpecialMutation.mutate({
      zohoGroupId: selectedGroup.zohoGroupId,
      zohoGroupName: selectedGroup.zohoGroupName,
      specialPrice: price.toFixed(2),
      originalPrice: selectedGroup.basePrice,
    });
  };

  const calculateDiscount = (original: string, special: string) => {
    const orig = parseFloat(original);
    const spec = parseFloat(special);
    if (orig <= 0) return 0;
    return Math.round(((orig - spec) / orig) * 100);
  };

  const activeSpecials = specialsData?.specials?.filter(s => s.isActive && new Date(s.endAt) > new Date()) || [];
  const expiredSpecials = specialsData?.specials?.filter(s => !s.isActive || new Date(s.endAt) <= new Date()) || [];

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Specials / Closeouts</h1>
        <p className="text-muted-foreground">
          Mark product groups as special with discounted pricing. All specials run for 2 weeks.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Tag className="h-5 w-5" />
            Create New Special
          </CardTitle>
          <CardDescription>
            Search for a product group and set a special price. The special will automatically expire after 2 weeks.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!selectedGroup ? (
            <div className="space-y-2">
              <label className="text-sm font-medium">Search Product Groups</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search product groups by name..."
                  value={groupSearch}
                  onChange={(e) => setGroupSearch(e.target.value)}
                  className="pl-10"
                  data-testid="input-group-search"
                />
              </div>
              
              {groupSearch.length >= 2 && (
                <div className="max-h-64 overflow-y-auto border rounded-lg">
                  {groupsLoading ? (
                    <div className="p-3 text-center text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin mx-auto" />
                    </div>
                  ) : groupsData?.groups && groupsData.groups.length > 0 ? (
                    groupsData.groups.map((group) => (
                      <div
                        key={group.zohoGroupId}
                        className="flex items-center justify-between p-3 hover:bg-muted/50 border-b last:border-b-0"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{group.zohoGroupName}</p>
                          <p className="text-xs text-muted-foreground">Base Price: ${group.basePrice}</p>
                        </div>
                        {group.hasActiveSpecial ? (
                          <Badge variant="secondary">Already Special</Badge>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setSelectedGroup(group)}
                            data-testid={`button-select-group-${group.zohoGroupId}`}
                          >
                            Select
                          </Button>
                        )}
                      </div>
                    ))
                  ) : (
                    <div className="p-3 text-center text-muted-foreground text-sm">
                      No product groups found
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="p-4 rounded-lg border bg-muted/30">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{selectedGroup.zohoGroupName}</p>
                    <p className="text-sm text-muted-foreground">Original Price: ${selectedGroup.basePrice}</p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setSelectedGroup(null)}
                  >
                    Change
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Special Price</label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="number"
                    step="0.01"
                    min="0.01"
                    placeholder="Enter special price..."
                    value={specialPrice}
                    onChange={(e) => setSpecialPrice(e.target.value)}
                    className="pl-10"
                    data-testid="input-special-price"
                  />
                </div>
                {specialPrice && parseFloat(specialPrice) > 0 && (
                  <p className="text-sm text-green-600">
                    <Percent className="inline h-3 w-3 mr-1" />
                    {calculateDiscount(selectedGroup.basePrice, specialPrice)}% off
                  </p>
                )}
              </div>

              <Button
                onClick={handleCreateSpecial}
                disabled={createSpecialMutation.isPending || !specialPrice}
                className="w-full"
                data-testid="button-create-special"
              >
                {createSpecialMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : null}
                Create 2-Week Special
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Active Specials ({activeSpecials.length})
          </CardTitle>
          <CardDescription>
            Currently running special pricing. These will automatically expire after their 2-week period.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {specialsLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading...
            </div>
          ) : activeSpecials.length > 0 ? (
            <div className="space-y-3">
              {activeSpecials.map((special) => (
                <div
                  key={special.id}
                  className="flex items-center justify-between p-4 rounded-lg border bg-card"
                  data-testid={`active-special-${special.id}`}
                >
                  <div className="flex-1 min-w-0 space-y-1">
                    <p className="font-medium truncate">{special.zohoGroupName}</p>
                    <div className="flex items-center gap-3 text-sm">
                      <span className="text-muted-foreground line-through">${special.originalPrice}</span>
                      <span className="text-green-600 font-semibold">${special.specialPrice}</span>
                      <Badge variant="secondary">
                        {calculateDiscount(special.originalPrice, special.specialPrice)}% off
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Expires {formatDistanceToNow(new Date(special.endAt), { addSuffix: true })} ({format(new Date(special.endAt), "MMM d, yyyy")})
                    </p>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => deleteSpecialMutation.mutate(special.id)}
                    disabled={deleteSpecialMutation.isPending}
                    data-testid={`button-delete-special-${special.id}`}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">No active specials. Create one above to get started.</p>
          )}
        </CardContent>
      </Card>

      {expiredSpecials.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-muted-foreground">Expired Specials ({expiredSpecials.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {expiredSpecials.slice(0, 5).map((special) => (
                <div
                  key={special.id}
                  className="flex items-center justify-between p-3 rounded-lg border bg-muted/30 opacity-60"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">{special.zohoGroupName}</p>
                    <p className="text-xs text-muted-foreground">
                      Expired {format(new Date(special.endAt), "MMM d, yyyy")}
                    </p>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => deleteSpecialMutation.mutate(special.id)}
                    disabled={deleteSpecialMutation.isPending}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
