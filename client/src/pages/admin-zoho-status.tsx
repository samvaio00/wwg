import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { RefreshCw, CheckCircle, XCircle, Loader2, Package, AlertTriangle, Clock, RotateCcw, Play, Webhook, Radio, Calendar, Image, Download, Search, Upload } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useDebounce } from "@/hooks/use-debounce";

interface ItemGroup {
  zohoGroupId: string;
  groupName: string;
  productCount: number;
}

interface ProductSearchResult {
  id: string;
  sku: string;
  name: string;
  zohoItemId: string;
  zohoGroupId: string | null;
  zohoGroupName: string | null;
  category: string | null;
  hasImage: boolean;
}

interface ZohoStats {
  today: {
    apiCalls: number;
    successfulCalls: number;
    failedCalls: number;
    recordsPulled: number;
    recordsUpdated: number;
    syncs: number;
    customersSentToZoho: number;
    ordersSentToZoho: number;
  };
  month: {
    apiCalls: number;
    successfulCalls: number;
    failedCalls: number;
  };
}

interface SyncResult {
  created: number;
  updated: number;
  skipped: number;
  total: number;
  errors: string[];
}

interface TestResult {
  success: boolean;
  message: string;
}

interface Job {
  id: string;
  jobType: string;
  status: string;
  userId: string | null;
  orderId: string | null;
  attempts: number | null;
  maxAttempts: number | null;
  errorMessage: string | null;
  createdAt: string;
  lastAttemptAt: string | null;
}

interface JobsResponse {
  pending: Job[];
  failed: Job[];
  totalPending: number;
  totalFailed: number;
}

interface WebhookEvent {
  type: string;
  action: string;
  timestamp: string;
  success: boolean;
  details?: string;
}

interface WebhookStats {
  today: {
    total: number;
    successful: number;
    failed: number;
    byAction: Record<string, number>;
  };
  month: {
    total: number;
    successful: number;
    failed: number;
  };
  lastReceived: string | null;
  recentEvents: WebhookEvent[];
}

interface SchedulerStatus {
  enabled: boolean;
  enableFrequentZohoSync: boolean;
  zohoSync: {
    mode: string;
    dormant: boolean;
  };
  dailyZohoSync: {
    schedule: string;
    lastRun: string | null;
    nextRun: string;
  };
  weeklyZohoBackup: {
    schedule: string;
    lastRun: string | null;
    nextRun: string;
  };
}

interface ImageSyncStatus {
  isRunning: boolean;
  processed: number;
  total: number;
  downloaded: number;
  skipped: number;
  errors: number;
  startedAt: string | null;
}

export default function AdminZohoStatus() {
  const { toast } = useToast();
  const [lastSyncResult, setLastSyncResult] = useState<SyncResult | null>(null);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [singleProductId, setSingleProductId] = useState("");
  const [groupSearchQuery, setGroupSearchQuery] = useState("");
  const [selectedGroup, setSelectedGroup] = useState<ItemGroup | null>(null);
  const debouncedGroupSearch = useDebounce(groupSearchQuery, 300);
  const [productSearchQuery, setProductSearchQuery] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<ProductSearchResult | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const debouncedProductSearch = useDebounce(productSearchQuery, 300);

  const { data: zohoStats, isLoading, refetch, isFetching } = useQuery<ZohoStats>({
    queryKey: ['/api/admin/analytics/zoho-api-stats'],
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  });

  const { data: jobsData, isLoading: jobsLoading } = useQuery<JobsResponse>({
    queryKey: ["/api/admin/jobs"],
  });

  const { data: webhookStats, isLoading: webhookLoading, refetch: refetchWebhooks } = useQuery<WebhookStats>({
    queryKey: ["/api/admin/analytics/webhook-stats"],
    refetchOnWindowFocus: false,
    staleTime: 30000,
  });

  const { data: schedulerStatus } = useQuery<SchedulerStatus>({
    queryKey: ["/api/admin/scheduler/status"],
    refetchOnWindowFocus: false,
  });

  const { data: imageSyncStatus, refetch: refetchImageStatus } = useQuery<ImageSyncStatus>({
    queryKey: ["/api/admin/images/sync-status"],
    refetchInterval: (query) => {
      return query.state.data?.isRunning ? 2000 : false;
    },
  });

  const { data: groupSearchResults, isLoading: groupSearchLoading } = useQuery<{ groups: ItemGroup[] }>({
    queryKey: ["/api/admin/groups/search", debouncedGroupSearch],
    queryFn: async () => {
      if (!debouncedGroupSearch || debouncedGroupSearch.length < 2) {
        return { groups: [] };
      }
      const res = await fetch(`/api/admin/groups/search?q=${encodeURIComponent(debouncedGroupSearch)}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Search failed");
      return res.json();
    },
    enabled: debouncedGroupSearch.length >= 2,
  });

  const { data: productSearchResults, isLoading: productSearchLoading } = useQuery<{ products: ProductSearchResult[] }>({
    queryKey: ["/api/admin/products/search", debouncedProductSearch],
    queryFn: async () => {
      if (!debouncedProductSearch || debouncedProductSearch.length < 2) {
        return { products: [] };
      }
      const res = await fetch(`/api/admin/products/search?q=${encodeURIComponent(debouncedProductSearch)}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Search failed");
      return res.json();
    },
    enabled: debouncedProductSearch.length >= 2,
  });

  const imageUploadMutation = useMutation({
    mutationFn: async ({ productId, zohoItemId, file }: { productId: string; zohoItemId: string; file: File }) => {
      const formData = new FormData();
      formData.append("productId", productId);
      formData.append("zohoItemId", zohoItemId);
      formData.append("image", file);
      
      const res = await fetch("/api/admin/products/upload-image", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Upload failed");
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/products/search"] });
      toast({
        title: "Image Uploaded",
        description: data.message || "Product image has been uploaded successfully",
      });
      setSelectedProduct(null);
      setSelectedFile(null);
      setImagePreview(null);
      setProductSearchQuery("");
    },
    onError: (error) => {
      toast({
        title: "Upload Failed",
        description: error instanceof Error ? error.message : "Failed to upload image",
        variant: "destructive",
      });
    },
  });

  const bulkImageSyncMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/images/sync", {});
      return res.json();
    },
    onSuccess: () => {
      refetchImageStatus();
      toast({
        title: "Image Sync Started",
        description: "Downloading product images in the background. This may take a while due to rate limiting.",
      });
    },
    onError: (error) => {
      toast({
        title: "Image Sync Failed",
        description: error instanceof Error ? error.message : "Failed to start image sync",
        variant: "destructive",
      });
    },
  });

  const singleImageRefreshMutation = useMutation({
    mutationFn: async (productId: string) => {
      const res = await apiRequest("POST", `/api/admin/products/${productId}/refresh-image`, {});
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      toast({
        title: "Image Refreshed",
        description: data.message || "Product image has been refreshed",
      });
    },
    onError: (error) => {
      toast({
        title: "Image Refresh Failed",
        description: error instanceof Error ? error.message : "Failed to refresh image",
        variant: "destructive",
      });
    },
  });

  const groupImageRefreshMutation = useMutation({
    mutationFn: async (zohoGroupId: string) => {
      const res = await apiRequest("POST", `/api/admin/groups/${zohoGroupId}/refresh-images`, {});
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      toast({
        title: "Group Images Refreshed",
        description: `Refreshed images for ${data.updated || 0} products in the group`,
      });
    },
    onError: (error) => {
      toast({
        title: "Group Image Refresh Failed",
        description: error instanceof Error ? error.message : "Failed to refresh group images",
        variant: "destructive",
      });
    },
  });

  const retryJobMutation = useMutation({
    mutationFn: async (jobId: string) => {
      const res = await apiRequest("POST", `/api/admin/jobs/${jobId}/retry`, {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/jobs"] });
      toast({
        title: "Job Queued",
        description: "The job has been queued for retry",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to retry job",
        variant: "destructive",
      });
    },
  });

  const processJobsMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/jobs/process", {});
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/jobs"] });
      const successCount = data.results?.filter((r: { success: boolean }) => r.success).length || 0;
      const failCount = data.results?.length - successCount || 0;
      toast({
        title: "Jobs Processed",
        description: `${successCount} succeeded, ${failCount} failed`,
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to process jobs",
        variant: "destructive",
      });
    },
  });

  const testMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/zoho/test", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to test connection");
      return res.json() as Promise<TestResult>;
    },
    onSuccess: (data) => {
      setTestResult(data);
      toast({
        title: data.success ? "Connection Successful" : "Connection Failed",
        description: data.message,
        variant: data.success ? "default" : "destructive",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to test Zoho connection",
        variant: "destructive",
      });
    },
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/zoho/sync", {});
      return res.json() as Promise<SyncResult>;
    },
    onSuccess: (data) => {
      setLastSyncResult(data);
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      refetch();
      
      if (data.errors.length === 0) {
        toast({
          title: "Sync Complete",
          description: `Created ${data.created}, updated ${data.updated}, skipped ${data.skipped} products`,
        });
      } else {
        toast({
          title: "Sync Completed with Errors",
          description: `${data.errors.length} errors occurred during sync`,
          variant: "destructive",
        });
      }
    },
    onError: () => {
      toast({
        title: "Sync Failed",
        description: "Failed to sync products from Zoho",
        variant: "destructive",
      });
    },
  });

  const manualSyncMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/scheduler/sync", { type: "zoho" });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/analytics/zoho-api-stats"] });
      refetch();
      const zohoResult = data.results?.zoho;
      if (zohoResult) {
        toast({
          title: "Sync Complete",
          description: `Created ${zohoResult.created || 0}, updated ${zohoResult.updated || 0}, delisted ${zohoResult.delisted || 0} products`,
        });
      } else {
        toast({
          title: "Sync Complete",
          description: "Zoho sync completed successfully",
        });
      }
    },
    onError: (error) => {
      toast({
        title: "Sync Failed",
        description: error instanceof Error ? error.message : "Failed to sync from Zoho",
        variant: "destructive",
      });
    },
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Zoho Integration Status</h1>
          <p className="text-muted-foreground">
            Monitor API calls, sync activity, and manage Zoho operations
          </p>
        </div>
        <Button 
          onClick={() => {
            refetch();
            refetchWebhooks();
          }} 
          disabled={isFetching || webhookLoading}
          variant="outline"
          data-testid="button-refresh-stats"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isFetching || webhookLoading ? 'animate-spin' : ''}`} />
          Refresh Stats
        </Button>
      </div>

      {/* Sync Mode Status */}
      <Card data-testid="card-sync-mode">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Radio className="h-5 w-5" />
            Sync Mode
          </CardTitle>
          <CardDescription>
            Current data synchronization configuration
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-4">
            {schedulerStatus?.enableFrequentZohoSync ? (
              <>
                <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 text-sm" data-testid="badge-sync-mode-polling">
                  <Clock className="h-3 w-3 mr-1" />
                  Scheduled Sync (every 2 hours)
                </Badge>
                <Badge variant="outline" className="text-sm" data-testid="badge-weekly-backup">
                  <Calendar className="h-3 w-3 mr-1" />
                  Weekly Full Sync: Sunday 2 AM
                </Badge>
              </>
            ) : (
              <>
                <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 text-sm" data-testid="badge-sync-mode-webhooks">
                  <Webhook className="h-3 w-3 mr-1" />
                  Real-time Webhooks (Primary)
                </Badge>
                <Badge variant="outline" className="text-sm" data-testid="badge-daily-sync">
                  <Clock className="h-3 w-3 mr-1" />
                  Daily Backup: 3 AM
                </Badge>
                <Badge variant="outline" className="text-sm" data-testid="badge-weekly-backup">
                  <Calendar className="h-3 w-3 mr-1" />
                  Weekly Full Sync: Sunday 2 AM
                </Badge>
              </>
            )}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-4">
            <Button
              onClick={() => manualSyncMutation.mutate()}
              disabled={manualSyncMutation.isPending}
              data-testid="button-sync-now"
            >
              {manualSyncMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Syncing...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Sync Now
                </>
              )}
            </Button>
            <span className="text-sm text-muted-foreground">
              Pull latest changes from Zoho Inventory
            </span>
          </div>
          {!schedulerStatus?.enableFrequentZohoSync && (
            <div className="mt-4 text-sm text-muted-foreground space-y-1">
              {schedulerStatus?.dailyZohoSync && (
                <>
                  <p>Next daily sync: {new Date(schedulerStatus.dailyZohoSync.nextRun).toLocaleString()}</p>
                  {schedulerStatus.dailyZohoSync.lastRun && (
                    <p>Last daily sync: {new Date(schedulerStatus.dailyZohoSync.lastRun).toLocaleString()}</p>
                  )}
                </>
              )}
              {schedulerStatus?.weeklyZohoBackup && (
                <>
                  <p>Next weekly sync: {new Date(schedulerStatus.weeklyZohoBackup.nextRun).toLocaleString()}</p>
                  {schedulerStatus.weeklyZohoBackup.lastRun && (
                    <p>Last weekly sync: {new Date(schedulerStatus.weeklyZohoBackup.lastRun).toLocaleString()}</p>
                  )}
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Image Management */}
      <Card data-testid="card-image-management">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Image className="h-5 w-5" />
            Product Image Management
          </CardTitle>
          <CardDescription>
            Download and refresh product images from Zoho Inventory
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Bulk Image Sync */}
          <div className="space-y-3">
            <h4 className="font-medium text-sm">Bulk Image Sync</h4>
            <div className="flex flex-wrap items-center gap-4">
              <Button
                onClick={() => bulkImageSyncMutation.mutate()}
                disabled={bulkImageSyncMutation.isPending || imageSyncStatus?.isRunning}
                data-testid="button-bulk-image-sync"
              >
                {bulkImageSyncMutation.isPending || imageSyncStatus?.isRunning ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {imageSyncStatus?.isRunning ? "Syncing..." : "Starting..."}
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4 mr-2" />
                    Download All Images
                  </>
                )}
              </Button>
              <span className="text-sm text-muted-foreground">
                Download images for all products from Zoho (runs in background)
              </span>
            </div>
            {imageSyncStatus?.isRunning && (
              <div className="p-3 rounded-lg border bg-muted/30 space-y-2">
                <div className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  <span className="text-sm font-medium">Image sync in progress...</span>
                </div>
                <div className="text-sm text-muted-foreground space-y-1">
                  <p>Processed: {imageSyncStatus.processed} / {imageSyncStatus.total}</p>
                  <p>Downloaded: {imageSyncStatus.downloaded} | Skipped: {imageSyncStatus.skipped} | Errors: {imageSyncStatus.errors}</p>
                  {imageSyncStatus.startedAt && (
                    <p>Started: {new Date(imageSyncStatus.startedAt).toLocaleString()}</p>
                  )}
                </div>
                <div className="w-full bg-muted rounded-full h-2">
                  <div 
                    className="bg-primary h-2 rounded-full transition-all" 
                    style={{ width: `${imageSyncStatus.total > 0 ? (imageSyncStatus.processed / imageSyncStatus.total) * 100 : 0}%` }}
                  />
                </div>
              </div>
            )}
            {!imageSyncStatus?.isRunning && imageSyncStatus?.processed && imageSyncStatus.processed > 0 && (
              <div className="p-3 rounded-lg border bg-green-50 dark:bg-green-950 text-sm">
                <div className="flex items-center gap-2 text-green-700 dark:text-green-300">
                  <CheckCircle className="h-4 w-4" />
                  <span>Last sync completed: {imageSyncStatus.downloaded} downloaded, {imageSyncStatus.skipped} skipped, {imageSyncStatus.errors} errors</span>
                </div>
              </div>
            )}
          </div>

          {/* Single Product Image Refresh */}
          <div className="space-y-3 pt-4 border-t">
            <h4 className="font-medium text-sm">Refresh Single Product Image</h4>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                type="text"
                placeholder="Product ID (UUID)"
                value={singleProductId}
                onChange={(e) => setSingleProductId(e.target.value)}
                className="w-80"
                data-testid="input-product-id"
              />
              <Button
                onClick={() => {
                  if (singleProductId.trim()) {
                    singleImageRefreshMutation.mutate(singleProductId.trim());
                    setSingleProductId("");
                  }
                }}
                disabled={singleImageRefreshMutation.isPending || !singleProductId.trim()}
                variant="outline"
                data-testid="button-refresh-single-image"
              >
                {singleImageRefreshMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Enter a product UUID to refresh its image from Zoho
            </p>
          </div>

          {/* Group Image Refresh */}
          <div className="space-y-3 pt-4 border-t">
            <h4 className="font-medium text-sm">Refresh Item Group Images</h4>
            <div className="space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Search by item name, group name, or SKU..."
                  value={groupSearchQuery}
                  onChange={(e) => {
                    setGroupSearchQuery(e.target.value);
                    setSelectedGroup(null);
                  }}
                  className="pl-9 w-full max-w-md"
                  data-testid="input-group-search"
                />
              </div>
              
              {/* Search Results */}
              {groupSearchQuery.length >= 2 && !selectedGroup && (
                <div className="rounded-lg border bg-background max-w-md max-h-60 overflow-auto">
                  {groupSearchLoading ? (
                    <div className="p-4 flex items-center gap-2 text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Searching...
                    </div>
                  ) : groupSearchResults?.groups && groupSearchResults.groups.length > 0 ? (
                    <div className="divide-y">
                      {groupSearchResults.groups.map((group) => (
                        <button
                          key={group.zohoGroupId}
                          onClick={() => {
                            setSelectedGroup(group);
                            setGroupSearchQuery(group.groupName);
                          }}
                          className="w-full p-3 text-left hover-elevate flex items-center justify-between gap-2"
                          data-testid={`group-result-${group.zohoGroupId}`}
                        >
                          <div>
                            <p className="font-medium text-sm">{group.groupName}</p>
                            <p className="text-xs text-muted-foreground">ID: {group.zohoGroupId}</p>
                          </div>
                          <Badge variant="secondary" className="text-xs">
                            {group.productCount} items
                          </Badge>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="p-4 text-sm text-muted-foreground text-center">
                      No groups found matching "{groupSearchQuery}"
                    </div>
                  )}
                </div>
              )}
              
              {/* Selected Group */}
              {selectedGroup && (
                <div className="flex flex-wrap items-center gap-3 p-3 rounded-lg border bg-muted/30 max-w-md">
                  <div className="flex-1">
                    <p className="font-medium text-sm">{selectedGroup.groupName}</p>
                    <p className="text-xs text-muted-foreground">{selectedGroup.productCount} products in group</p>
                  </div>
                  <Button
                    onClick={() => {
                      groupImageRefreshMutation.mutate(selectedGroup.zohoGroupId);
                    }}
                    disabled={groupImageRefreshMutation.isPending}
                    data-testid="button-refresh-group-images"
                  >
                    {groupImageRefreshMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Refreshing...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Refresh Images
                      </>
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSelectedGroup(null);
                      setGroupSearchQuery("");
                    }}
                    data-testid="button-clear-group-selection"
                  >
                    <XCircle className="h-4 w-4" />
                  </Button>
                </div>
              )}
              
              <p className="text-xs text-muted-foreground">
                Search for an item group by name, product name, or SKU to refresh all images in that group
              </p>
            </div>
          </div>

          {/* Manual Image Upload */}
          <div className="space-y-3 pt-4 border-t">
            <h4 className="font-medium text-sm flex items-center gap-2">
              <Upload className="h-4 w-4" />
              Manual Image Upload
            </h4>
            <p className="text-xs text-muted-foreground">
              Upload custom images for products that don't have images in Zoho
            </p>
            
            <div className="space-y-3">
              {/* Product Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Search product by name, SKU, or group..."
                  value={productSearchQuery}
                  onChange={(e) => {
                    setProductSearchQuery(e.target.value);
                    setSelectedProduct(null);
                    setSelectedFile(null);
                    setImagePreview(null);
                  }}
                  className="pl-9 w-full max-w-md"
                  data-testid="input-product-image-search"
                />
              </div>
              
              {/* Product Search Results */}
              {productSearchQuery.length >= 2 && !selectedProduct && (
                <div className="rounded-lg border bg-background max-w-md max-h-60 overflow-auto">
                  {productSearchLoading ? (
                    <div className="p-4 flex items-center gap-2 text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Searching...
                    </div>
                  ) : productSearchResults?.products && productSearchResults.products.length > 0 ? (
                    <div className="divide-y">
                      {productSearchResults.products.map((product) => (
                        <button
                          key={product.id}
                          onClick={() => {
                            setSelectedProduct(product);
                            setProductSearchQuery(product.name);
                          }}
                          className="w-full p-3 text-left hover-elevate flex items-center justify-between gap-2"
                          data-testid={`product-result-${product.id}`}
                        >
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-sm truncate">{product.name}</p>
                            <p className="text-xs text-muted-foreground">
                              SKU: {product.sku}
                              {product.zohoGroupName && ` | Group: ${product.zohoGroupName}`}
                            </p>
                          </div>
                          {product.hasImage ? (
                            <Badge variant="secondary" className="text-xs bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">
                              Has Image
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="text-xs">
                              No Image
                            </Badge>
                          )}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="p-4 text-sm text-muted-foreground text-center">
                      No products found matching "{productSearchQuery}"
                    </div>
                  )}
                </div>
              )}
              
              {/* Selected Product & Upload Form */}
              {selectedProduct && (
                <div className="p-4 rounded-lg border bg-muted/30 max-w-md space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sm">{selectedProduct.name}</p>
                      <p className="text-xs text-muted-foreground">
                        SKU: {selectedProduct.sku}
                        {selectedProduct.category && ` | Category: ${selectedProduct.category}`}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Zoho ID: {selectedProduct.zohoItemId}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setSelectedProduct(null);
                        setSelectedFile(null);
                        setImagePreview(null);
                        setProductSearchQuery("");
                      }}
                      data-testid="button-clear-product-selection"
                    >
                      <XCircle className="h-4 w-4" />
                    </Button>
                  </div>
                  
                  {/* File Input */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Select Image</label>
                    <Input
                      type="file"
                      accept="image/jpeg,image/png,image/gif,image/webp"
                      onChange={(e) => {
                        const file = e.target.files?.[0] || null;
                        setSelectedFile(file);
                        if (file) {
                          const reader = new FileReader();
                          reader.onloadend = () => {
                            setImagePreview(reader.result as string);
                          };
                          reader.readAsDataURL(file);
                        } else {
                          setImagePreview(null);
                        }
                      }}
                      className="cursor-pointer"
                      data-testid="input-image-file"
                    />
                    <p className="text-xs text-muted-foreground">
                      Supported formats: JPEG, PNG, GIF, WebP (max 10MB)
                    </p>
                  </div>
                  
                  {/* Image Preview */}
                  {imagePreview && (
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Preview</label>
                      <div className="w-32 h-32 rounded-lg border bg-background overflow-hidden">
                        <img 
                          src={imagePreview} 
                          alt="Preview" 
                          className="w-full h-full object-contain"
                        />
                      </div>
                    </div>
                  )}
                  
                  {/* Upload Button */}
                  <Button
                    onClick={() => {
                      if (selectedProduct && selectedFile) {
                        imageUploadMutation.mutate({
                          productId: selectedProduct.id,
                          zohoItemId: selectedProduct.zohoItemId,
                          file: selectedFile,
                        });
                      }
                    }}
                    disabled={!selectedFile || imageUploadMutation.isPending}
                    className="w-full"
                    data-testid="button-upload-image"
                  >
                    {imageUploadMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Uploading...
                      </>
                    ) : (
                      <>
                        <Upload className="h-4 w-4 mr-2" />
                        Upload Image
                      </>
                    )}
                  </Button>
                  
                  {selectedProduct.hasImage && (
                    <p className="text-xs text-amber-600 dark:text-amber-400">
                      This product already has an image. Uploading will replace it.
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Webhook Stats */}
      <Card data-testid="card-webhook-stats">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Webhook className="h-5 w-5" />
            Webhook Activity
          </CardTitle>
          <CardDescription>
            Real-time updates received from Zoho via webhooks
          </CardDescription>
        </CardHeader>
        <CardContent>
          {webhookLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading webhook stats...
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Today's Webhooks</p>
                  <p className="text-2xl font-bold" data-testid="text-webhooks-today">{webhookStats?.today?.total || 0}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Successful</p>
                  <p className="text-2xl font-bold text-green-600" data-testid="text-webhooks-successful">{webhookStats?.today?.successful || 0}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Failed</p>
                  <p className="text-2xl font-bold text-red-600" data-testid="text-webhooks-failed">{webhookStats?.today?.failed || 0}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">This Month</p>
                  <p className="text-2xl font-bold" data-testid="text-webhooks-month">{webhookStats?.month?.total || 0}</p>
                </div>
              </div>

              {webhookStats?.lastReceived && (
                <div className="pt-2 border-t text-sm text-muted-foreground">
                  Last webhook received: {new Date(webhookStats.lastReceived).toLocaleString()}
                </div>
              )}

              {webhookStats?.today?.byAction && Object.keys(webhookStats.today.byAction).length > 0 && (
                <div className="pt-2 border-t">
                  <h5 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Today's Events by Type</h5>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(webhookStats.today.byAction).map(([action, count]) => (
                      <Badge key={action} variant="outline" className="text-xs">
                        {action}: {count}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {webhookStats?.recentEvents && webhookStats.recentEvents.length > 0 && (
                <div className="pt-2 border-t">
                  <h5 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Recent Events</h5>
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {webhookStats.recentEvents.slice(0, 10).map((event, i) => (
                      <div key={i} className="flex items-center justify-between text-sm p-2 rounded bg-muted/30">
                        <div className="flex items-center gap-2">
                          {event.success ? (
                            <CheckCircle className="h-3 w-3 text-green-500" />
                          ) : (
                            <XCircle className="h-3 w-3 text-red-500" />
                          )}
                          <span className="font-mono text-xs">{event.type}.{event.action}</span>
                          {event.details && (
                            <span className="text-muted-foreground truncate max-w-[200px]">{event.details}</span>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {new Date(event.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {(!webhookStats?.today?.total && !webhookStats?.recentEvents?.length) && (
                <div className="text-center py-4 text-muted-foreground">
                  <Webhook className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No webhooks received yet</p>
                  <p className="text-xs">Webhooks will appear here as Zoho sends updates</p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Zoho Inventory Integration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Zoho Inventory Integration
          </CardTitle>
          <CardDescription>
            Sync products from your Zoho Inventory account
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <Button
              variant="outline"
              onClick={() => testMutation.mutate()}
              disabled={testMutation.isPending}
              data-testid="button-test-zoho"
            >
              {testMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Testing...
                </>
              ) : (
                <>
                  {testResult?.success ? (
                    <CheckCircle className="h-4 w-4 mr-2 text-green-500" />
                  ) : testResult?.success === false ? (
                    <XCircle className="h-4 w-4 mr-2 text-red-500" />
                  ) : null}
                  Test Connection
                </>
              )}
            </Button>

            <Button
              onClick={() => syncMutation.mutate()}
              disabled={syncMutation.isPending}
              data-testid="button-sync-zoho"
            >
              {syncMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Syncing Products...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Sync Products from Zoho
                </>
              )}
            </Button>
          </div>

          {testResult && (
            <div className={`p-3 rounded-lg ${testResult.success ? "bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800" : "bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800"}`}>
              <p className={`text-sm ${testResult.success ? "text-green-700 dark:text-green-300" : "text-red-700 dark:text-red-300"}`}>
                {testResult.message}
              </p>
            </div>
          )}

          {lastSyncResult && (
            <div className="space-y-3">
              <h4 className="font-medium">Last Sync Results</h4>
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">
                  Total: {lastSyncResult.total}
                </Badge>
                <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                  Created: {lastSyncResult.created}
                </Badge>
                <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                  Updated: {lastSyncResult.updated}
                </Badge>
                <Badge variant="outline">
                  Skipped: {lastSyncResult.skipped}
                </Badge>
                {lastSyncResult.errors.length > 0 && (
                  <Badge variant="destructive">
                    Errors: {lastSyncResult.errors.length}
                  </Badge>
                )}
              </div>

              {lastSyncResult.errors.length > 0 && (
                <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="h-4 w-4 text-red-500" />
                    <span className="text-sm font-medium text-red-700 dark:text-red-300">Sync Errors</span>
                  </div>
                  <ul className="text-sm text-red-600 dark:text-red-400 space-y-1">
                    {lastSyncResult.errors.slice(0, 5).map((error, i) => (
                      <li key={i}>{error}</li>
                    ))}
                    {lastSyncResult.errors.length > 5 && (
                      <li>...and {lastSyncResult.errors.length - 5} more errors</li>
                    )}
                  </ul>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* API Stats */}
      {isLoading ? (
        <Card>
          <CardContent className="py-8">
            <div className="text-center text-muted-foreground">Loading stats...</div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Today's Activity</CardTitle>
              <CardDescription>API calls and sync operations today</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Total API Calls</p>
                    <p className="text-2xl font-bold">{zohoStats?.today?.apiCalls || 0}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Sync Operations</p>
                    <p className="text-2xl font-bold">{zohoStats?.today?.syncs || 0}</p>
                  </div>
                </div>
                
                <div className="space-y-2 pt-2 border-t">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Successful Calls</span>
                    <Badge variant="outline" className="text-green-600 border-green-600">
                      {zohoStats?.today?.successfulCalls || 0}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Failed Calls</span>
                    <Badge variant="outline" className="text-red-600 border-red-600">
                      {zohoStats?.today?.failedCalls || 0}
                    </Badge>
                  </div>
                </div>

                <div className="space-y-2 pt-2 border-t">
                  <h5 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Received from Zoho</h5>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">New Records Pulled</span>
                    <span className="font-medium">{zohoStats?.today?.recordsPulled || 0}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Records Updated</span>
                    <span className="font-medium">{zohoStats?.today?.recordsUpdated || 0}</span>
                  </div>
                </div>

                <div className="space-y-2 pt-2 border-t">
                  <h5 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Sent to Zoho</h5>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">New Customers Added</span>
                    <span className="font-medium">{zohoStats?.today?.customersSentToZoho || 0}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Orders Invoiced</span>
                    <span className="font-medium">{zohoStats?.today?.ordersSentToZoho || 0}</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>This Month</CardTitle>
              <CardDescription>Monthly API call summary</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Total API Calls</p>
                  <p className="text-2xl font-bold">{zohoStats?.month?.apiCalls || 0}</p>
                </div>
                
                <div className="space-y-2 pt-2 border-t">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Successful Calls</span>
                    <Badge variant="outline" className="text-green-600 border-green-600">
                      {zohoStats?.month?.successfulCalls || 0}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Failed Calls</span>
                    <Badge variant="outline" className="text-red-600 border-red-600">
                      {zohoStats?.month?.failedCalls || 0}
                    </Badge>
                  </div>
                </div>

                {zohoStats?.month?.apiCalls ? (
                  <div className="pt-2 border-t">
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Success Rate</span>
                      <span className="font-medium">
                        {((zohoStats.month.successfulCalls / zohoStats.month.apiCalls) * 100).toFixed(1)}%
                      </span>
                    </div>
                  </div>
                ) : null}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Zoho Sync Jobs */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Zoho Sync Jobs
          </CardTitle>
          <CardDescription>
            View and retry failed Zoho operations (customer creation, order push)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <Button
              onClick={() => processJobsMutation.mutate()}
              disabled={processJobsMutation.isPending || !jobsData?.totalPending}
              data-testid="button-process-jobs"
            >
              {processJobsMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 mr-2" />
                  Process Pending Jobs ({jobsData?.totalPending || 0})
                </>
              )}
            </Button>
          </div>

          {jobsLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading jobs...
            </div>
          ) : (
            <>
              {/* Summary badges */}
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">
                  Pending: {jobsData?.totalPending || 0}
                </Badge>
                {(jobsData?.totalFailed || 0) > 0 && (
                  <Badge variant="destructive">
                    Failed: {jobsData?.totalFailed || 0}
                  </Badge>
                )}
              </div>

              {/* Pending jobs list */}
              {jobsData?.pending && jobsData.pending.length > 0 && (
                <div className="space-y-2">
                  <h4 className="font-medium text-sm">Pending Jobs</h4>
                  <div className="space-y-2">
                    {jobsData.pending.map((job) => (
                      <div
                        key={job.id}
                        className="flex items-center justify-between p-3 rounded-lg border bg-muted/30"
                        data-testid={`job-pending-${job.id}`}
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs">
                              {job.jobType === "create_zoho_customer" ? "Create Customer" : "Push Order"}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              Attempts: {job.attempts || 0}/{job.maxAttempts || 3}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Created: {new Date(job.createdAt).toLocaleString()}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Failed jobs list */}
              {jobsData?.failed && jobsData.failed.length > 0 && (
                <div className="space-y-2">
                  <h4 className="font-medium text-sm flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-red-500" />
                    Failed Jobs
                  </h4>
                  <div className="space-y-2">
                    {jobsData.failed.map((job) => (
                      <div
                        key={job.id}
                        className="p-3 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950"
                        data-testid={`job-failed-${job.id}`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <Badge variant="destructive" className="text-xs">
                                {job.jobType === "create_zoho_customer" ? "Create Customer" : "Push Order"}
                              </Badge>
                              <span className="text-xs text-red-600 dark:text-red-400">
                                Failed after {job.attempts || 0} attempts
                              </span>
                            </div>
                            {job.errorMessage && (
                              <p className="text-xs text-red-700 dark:text-red-300">
                                {job.errorMessage}
                              </p>
                            )}
                            <p className="text-xs text-muted-foreground">
                              Last attempt: {job.lastAttemptAt ? new Date(job.lastAttemptAt).toLocaleString() : 'N/A'}
                            </p>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => retryJobMutation.mutate(job.id)}
                            disabled={retryJobMutation.isPending}
                            data-testid={`button-retry-job-${job.id}`}
                          >
                            <RotateCcw className="h-3 w-3 mr-1" />
                            Retry
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* No jobs message */}
              {!jobsData?.pending?.length && !jobsData?.failed?.length && (
                <div className="text-center py-4 text-muted-foreground">
                  <CheckCircle className="h-8 w-8 mx-auto mb-2 text-green-500" />
                  <p className="text-sm">All Zoho operations are up to date</p>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
