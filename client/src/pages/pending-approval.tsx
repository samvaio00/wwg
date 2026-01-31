import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Clock, LogOut, Mail, Building2, User } from "lucide-react";
import wwgLogo from "@assets/wwg-logo_1769841225412.jpg";

export default function PendingApprovalPage() {
  const { user, logout } = useAuth();

  const handleLogout = async () => {
    await logout();
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center space-y-2 text-center">
          <img src={wwgLogo} alt="Warner Wireless Gears" className="h-20 w-auto object-contain" />
        </div>

        <Card className="border-border">
          <CardHeader className="text-center space-y-2">
            <div className="flex justify-center">
              <div className="rounded-full bg-amber-100 dark:bg-amber-900/30 p-3">
                <Clock className="h-8 w-8 text-amber-600 dark:text-amber-500" />
              </div>
            </div>
            <CardTitle className="text-2xl" data-testid="text-pending-title">Account Pending Approval</CardTitle>
            <CardDescription>
              Thank you for registering! Your application is being reviewed by our team.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="rounded-lg bg-muted p-4 space-y-3">
              <h3 className="font-medium text-sm">Your Registration Details</h3>
              <div className="space-y-2 text-sm text-muted-foreground">
                {user?.businessName && (
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4" />
                    <span data-testid="text-business-name">{user.businessName}</span>
                  </div>
                )}
                {user?.contactName && (
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4" />
                    <span data-testid="text-contact-name">{user.contactName}</span>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4" />
                  <span data-testid="text-email">{user?.email}</span>
                </div>
              </div>
            </div>

            <div className="space-y-2 text-center text-sm text-muted-foreground">
              <p>We typically review applications within 1-2 business days.</p>
              <p>You'll receive an email notification once your account is approved.</p>
            </div>

            <Button 
              variant="outline" 
              className="w-full" 
              onClick={handleLogout}
              data-testid="button-logout"
            >
              <LogOut className="h-4 w-4 mr-2" />
              Sign Out
            </Button>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground">
          Need help? Contact us at support@warnerwireless.com
        </p>
      </div>
    </div>
  );
}
