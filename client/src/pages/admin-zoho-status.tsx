import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { RefreshCw, CheckCircle, XCircle, Loader2, Package, AlertTriangle, Clock, RotateCcw, Play, Webhook, Radio, Calendar } from "lucide-react";

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
  weeklyZohoBackup: {
    schedule: string;
    lastRun: string | null;
    nextRun: string;
  };
}

export default function AdminZohoStatus() {
  const { toast } = useToast();
  const [lastSyncResult, setLastSyncResult] = useState<SyncResult | null>(null);
  const [testResult, setTestResult] = useState<TestResult | null>(null);

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
                  Real-time Webhooks
                </Badge>
                <Badge variant="outline" className="text-sm" data-testid="badge-weekly-backup">
                  <Calendar className="h-3 w-3 mr-1" />
                  Weekly Backup: {schedulerStatus?.weeklyZohoBackup?.schedule || "Sunday 2 AM"}
                </Badge>
                <Badge variant="secondary" className="text-sm text-muted-foreground" data-testid="badge-polling-dormant">
                  API Polling: Dormant
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
          {schedulerStatus?.weeklyZohoBackup && !schedulerStatus.enableFrequentZohoSync && (
            <div className="mt-4 text-sm text-muted-foreground">
              <p>Next backup sync: {new Date(schedulerStatus.weeklyZohoBackup.nextRun).toLocaleString()}</p>
              {schedulerStatus.weeklyZohoBackup.lastRun && (
                <p>Last backup: {new Date(schedulerStatus.weeklyZohoBackup.lastRun).toLocaleString()}</p>
              )}
            </div>
          )}
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
