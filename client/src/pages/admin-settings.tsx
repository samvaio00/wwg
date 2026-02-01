import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { RefreshCw, CheckCircle, XCircle, Loader2, Package, AlertTriangle, Clock, RotateCcw, Play, Star, Search, X } from "lucide-react";
import type { Product } from "@shared/schema";

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

export default function AdminSettingsPage() {
  const { toast } = useToast();
  const [lastSyncResult, setLastSyncResult] = useState<SyncResult | null>(null);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [productSearch, setProductSearch] = useState("");

  const { data: jobsData, isLoading: jobsLoading } = useQuery<JobsResponse>({
    queryKey: ["/api/admin/jobs"],
  });

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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight" data-testid="text-page-title">Settings</h1>
        <p className="text-muted-foreground">
          Manage integrations and system settings
        </p>
      </div>

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

      {/* Failed Zoho Jobs */}
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

      {/* Highlighted Products */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Star className="h-5 w-5" />
            Highlighted Products
          </CardTitle>
          <CardDescription>
            Select products to feature on the homepage. If none are selected, products from the "Warner" category will be shown.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Search to add products */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Add Products</label>
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
            
            {/* Search results */}
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

          {/* Currently highlighted products */}
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
