import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { RefreshCw, CheckCircle, XCircle, Loader2, Package, AlertTriangle } from "lucide-react";

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

export default function AdminSettingsPage() {
  const { toast } = useToast();
  const [lastSyncResult, setLastSyncResult] = useState<SyncResult | null>(null);
  const [testResult, setTestResult] = useState<TestResult | null>(null);

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
    </div>
  );
}
