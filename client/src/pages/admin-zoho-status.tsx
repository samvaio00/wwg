import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw } from "lucide-react";

interface ZohoStats {
  today: {
    apiCalls: number;
    successfulCalls: number;
    failedCalls: number;
    recordsPulled: number;
    recordsUpdated: number;
    syncs: number;
  };
  month: {
    apiCalls: number;
    successfulCalls: number;
    failedCalls: number;
  };
}

export default function AdminZohoStatus() {
  const { data: zohoStats, isLoading, refetch, isFetching } = useQuery<ZohoStats>({
    queryKey: ['/api/admin/analytics/zoho-api-stats'],
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Zoho Integration Status</h1>
          <p className="text-muted-foreground">
            Monitor API calls and sync activity with Zoho
          </p>
        </div>
        <Button 
          onClick={() => refetch()} 
          disabled={isFetching}
          variant="outline"
          data-testid="button-refresh-stats"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

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
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Records Pulled (New)</span>
                    <span className="font-medium">{zohoStats?.today?.recordsPulled || 0}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Records Updated</span>
                    <span className="font-medium">{zohoStats?.today?.recordsUpdated || 0}</span>
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
    </div>
  );
}
