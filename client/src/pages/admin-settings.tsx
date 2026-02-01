import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Settings, ExternalLink } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export default function AdminSettingsPage() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight" data-testid="text-page-title">Settings</h1>
        <p className="text-muted-foreground">
          Manage system settings and preferences
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            System Settings
          </CardTitle>
          <CardDescription>
            Configure application settings and preferences
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Link href="/admin/zoho-status">
              <Button variant="outline" className="w-full justify-start h-auto py-4" data-testid="link-zoho-status">
                <div className="text-left">
                  <div className="flex items-center gap-2">
                    <ExternalLink className="h-4 w-4" />
                    <span className="font-medium">Zoho Integration</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Manage Zoho sync, test connection, and view API stats
                  </p>
                </div>
              </Button>
            </Link>

            <Link href="/admin/highlighted-products">
              <Button variant="outline" className="w-full justify-start h-auto py-4" data-testid="link-highlighted-products">
                <div className="text-left">
                  <div className="flex items-center gap-2">
                    <ExternalLink className="h-4 w-4" />
                    <span className="font-medium">Highlighted Products</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Select products to feature on the homepage
                  </p>
                </div>
              </Button>
            </Link>

            <Link href="/admin/email-templates">
              <Button variant="outline" className="w-full justify-start h-auto py-4" data-testid="link-email-templates">
                <div className="text-left">
                  <div className="flex items-center gap-2">
                    <ExternalLink className="h-4 w-4" />
                    <span className="font-medium">Email Templates</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Manage promotional email campaign templates
                  </p>
                </div>
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
