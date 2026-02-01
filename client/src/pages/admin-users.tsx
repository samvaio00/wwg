import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { 
  CheckCircle, 
  XCircle, 
  Clock, 
  Users, 
  UserCheck, 
  UserX, 
  Loader2,
  Building2,
  Mail,
  Phone,
  MapPin,
  Ban,
  RotateCcw,
  Shield,
  UserPlus,
  Trash2
} from "lucide-react";
import type { SafeUser } from "@shared/schema";
import { insertAdminStaffSchema, type InsertAdminStaff } from "@shared/schema";

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'approved':
      return <Badge variant="default" className="bg-green-600" data-testid="badge-status-approved"><CheckCircle className="h-3 w-3 mr-1" />Approved</Badge>;
    case 'pending':
      return <Badge variant="secondary" data-testid="badge-status-pending"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
    case 'rejected':
      return <Badge variant="destructive" data-testid="badge-status-rejected"><XCircle className="h-3 w-3 mr-1" />Rejected</Badge>;
    case 'suspended':
      return <Badge variant="outline" className="border-orange-500 text-orange-600" data-testid="badge-status-suspended"><Ban className="h-3 w-3 mr-1" />Suspended</Badge>;
    default:
      return <Badge variant="outline" data-testid="badge-status-unknown">{status}</Badge>;
  }
}

function RoleBadge({ role }: { role: string }) {
  switch (role) {
    case 'admin':
      return <Badge variant="default" data-testid="badge-role-admin">Admin</Badge>;
    case 'staff':
      return <Badge variant="secondary" className="bg-blue-600 dark:bg-blue-700 text-white" data-testid="badge-role-staff">Staff</Badge>;
    case 'customer':
      return <Badge variant="secondary" data-testid="badge-role-customer">Customer</Badge>;
    case 'pending':
      return <Badge variant="outline" data-testid="badge-role-pending">Pending</Badge>;
    default:
      return <Badge variant="outline" data-testid="badge-role-unknown">{role}</Badge>;
  }
}

function UserCard({ user, onApprove, onReject, onSuspend, onReactivate, onDelete, isActioning, showDelete = false }: { 
  user: SafeUser; 
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onSuspend: (id: string) => void;
  onReactivate: (id: string) => void;
  onDelete?: (id: string) => void;
  isActioning: boolean;
  showDelete?: boolean;
}) {
  return (
    <Card className="hover-elevate" data-testid={`card-user-${user.id}`}>
      <CardContent className="p-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-lg" data-testid={`text-business-name-${user.id}`}>
                {user.businessName || 'No Business Name'}
              </h3>
              <StatusBadge status={user.status} />
              <RoleBadge role={user.role} />
            </div>
            
            <div className="grid gap-1 text-sm text-muted-foreground">
              {user.contactName && (
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  <span data-testid={`text-contact-${user.id}`}>{user.contactName}</span>
                </div>
              )}
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4" />
                <span data-testid={`text-email-${user.id}`}>{user.email}</span>
              </div>
              {user.phone && (
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4" />
                  <span data-testid={`text-phone-${user.id}`}>{user.phone}</span>
                </div>
              )}
              {(user.city || user.state) && (
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4" />
                  <span data-testid={`text-location-${user.id}`}>
                    {[user.city, user.state].filter(Boolean).join(', ')}
                  </span>
                </div>
              )}
            </div>
            
            <p className="text-xs text-muted-foreground">
              Registered: {new Date(user.createdAt).toLocaleDateString()}
            </p>
          </div>
          
          <div className="flex flex-wrap gap-2">
            {user.status === 'pending' && (
              <>
                <Button 
                  size="sm" 
                  onClick={() => onApprove(user.id)}
                  disabled={isActioning}
                  data-testid={`button-approve-${user.id}`}
                >
                  {isActioning ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserCheck className="h-4 w-4 mr-1" />}
                  Approve
                </Button>
                <Button 
                  size="sm" 
                  variant="destructive"
                  onClick={() => onReject(user.id)}
                  disabled={isActioning}
                  data-testid={`button-reject-${user.id}`}
                >
                  {isActioning ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserX className="h-4 w-4 mr-1" />}
                  Reject
                </Button>
              </>
            )}
            {user.status === 'approved' && user.role !== 'admin' && (
              <Button 
                size="sm" 
                variant="outline"
                onClick={() => onSuspend(user.id)}
                disabled={isActioning}
                data-testid={`button-suspend-${user.id}`}
              >
                {isActioning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4 mr-1" />}
                Suspend
              </Button>
            )}
            {(user.status === 'suspended' || user.status === 'rejected') && (
              <Button 
                size="sm" 
                variant="outline"
                onClick={() => onReactivate(user.id)}
                disabled={isActioning}
                data-testid={`button-reactivate-${user.id}`}
              >
                {isActioning ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4 mr-1" />}
                Reactivate
              </Button>
            )}
            {showDelete && onDelete && (user.role === 'admin' || user.role === 'staff') && (
              <Button 
                size="sm" 
                variant="destructive"
                onClick={() => onDelete(user.id)}
                disabled={isActioning}
                data-testid={`button-delete-${user.id}`}
              >
                {isActioning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4 mr-1" />}
                Delete
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AdminUsersPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [actioningId, setActioningId] = useState<string | null>(null);
  
  const isAdmin = user?.role === "admin";

  const form = useForm<InsertAdminStaff>({
    resolver: zodResolver(insertAdminStaffSchema),
    defaultValues: {
      email: "",
      password: "",
      contactName: "",
      role: "staff",
    },
  });

  const { data: usersData, isLoading } = useQuery<{ users: SafeUser[] }>({
    queryKey: ['/api/admin/users'],
  });

  const users = usersData?.users || [];
  const pendingUsers = users.filter(u => u.status === 'pending');
  const approvedUsers = users.filter(u => u.status === 'approved' && u.role !== 'admin' && u.role !== 'staff');
  const adminStaffUsers = users.filter(u => u.role === 'admin' || u.role === 'staff');
  const otherUsers = users.filter(u => u.status !== 'pending' && u.status !== 'approved');

  const approveMutation = useMutation({
    mutationFn: async (id: string) => {
      setActioningId(id);
      return apiRequest('POST', `/api/admin/users/${id}/approve`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
      toast({ title: "User approved", description: "The user can now access the platform." });
    },
    onError: (error: any) => {
      toast({ variant: "destructive", title: "Error", description: error.message });
    },
    onSettled: () => setActioningId(null),
  });

  const rejectMutation = useMutation({
    mutationFn: async (id: string) => {
      setActioningId(id);
      return apiRequest('POST', `/api/admin/users/${id}/reject`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
      toast({ title: "User rejected", description: "The application has been rejected." });
    },
    onError: (error: any) => {
      toast({ variant: "destructive", title: "Error", description: error.message });
    },
    onSettled: () => setActioningId(null),
  });

  const suspendMutation = useMutation({
    mutationFn: async (id: string) => {
      setActioningId(id);
      return apiRequest('POST', `/api/admin/users/${id}/suspend`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
      toast({ title: "User suspended", description: "The user's access has been suspended." });
    },
    onError: (error: any) => {
      toast({ variant: "destructive", title: "Error", description: error.message });
    },
    onSettled: () => setActioningId(null),
  });

  const reactivateMutation = useMutation({
    mutationFn: async (id: string) => {
      setActioningId(id);
      return apiRequest('POST', `/api/admin/users/${id}/reactivate`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
      toast({ title: "User reactivated", description: "The user can now access the platform again." });
    },
    onError: (error: any) => {
      toast({ variant: "destructive", title: "Error", description: error.message });
    },
    onSettled: () => setActioningId(null),
  });

  const createStaffMutation = useMutation({
    mutationFn: async (data: InsertAdminStaff) => {
      return apiRequest('POST', '/api/admin/users/staff', data);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
      toast({ title: "User created", description: `${variables.role === 'admin' ? 'Admin' : 'Staff'} user created successfully.` });
      form.reset();
    },
    onError: (error: any) => {
      toast({ variant: "destructive", title: "Error", description: error.message });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      setActioningId(id);
      return apiRequest('DELETE', `/api/admin/users/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
      toast({ title: "User deleted", description: "The user has been removed from the system." });
    },
    onError: (error: any) => {
      toast({ variant: "destructive", title: "Error", description: error.message });
    },
    onSettled: () => setActioningId(null),
  });

  const onSubmit = (data: InsertAdminStaff) => {
    createStaffMutation.mutate(data);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-page-title">User Management</h1>
        <p className="text-muted-foreground">Review and manage user accounts</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Approval</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-pending-count">{pendingUsers.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Users</CardTitle>
            <UserCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-active-count">{approvedUsers.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-count">{users.length}</div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="pending" className="space-y-4">
        <TabsList>
          <TabsTrigger value="pending" data-testid="tab-pending">
            Pending ({pendingUsers.length})
          </TabsTrigger>
          <TabsTrigger value="approved" data-testid="tab-approved">
            Customers ({approvedUsers.length})
          </TabsTrigger>
          {isAdmin && (
            <TabsTrigger value="staff" data-testid="tab-staff">
              <Shield className="h-4 w-4 mr-1" />
              Admin & Staff ({adminStaffUsers.length})
            </TabsTrigger>
          )}
          <TabsTrigger value="other" data-testid="tab-other">
            Other ({otherUsers.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="space-y-4">
          {pendingUsers.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <CheckCircle className="h-12 w-12 text-green-500 mb-4" />
                <p className="text-muted-foreground">No pending applications</p>
              </CardContent>
            </Card>
          ) : (
            pendingUsers.map(user => (
              <UserCard 
                key={user.id} 
                user={user} 
                onApprove={(id) => approveMutation.mutate(id)}
                onReject={(id) => rejectMutation.mutate(id)}
                onSuspend={(id) => suspendMutation.mutate(id)}
                onReactivate={(id) => reactivateMutation.mutate(id)}
                isActioning={actioningId === user.id}
              />
            ))
          )}
        </TabsContent>

        <TabsContent value="approved" className="space-y-4">
          {approvedUsers.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Users className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No approved users yet</p>
              </CardContent>
            </Card>
          ) : (
            approvedUsers.map(user => (
              <UserCard 
                key={user.id} 
                user={user} 
                onApprove={(id) => approveMutation.mutate(id)}
                onReject={(id) => rejectMutation.mutate(id)}
                onSuspend={(id) => suspendMutation.mutate(id)}
                onReactivate={(id) => reactivateMutation.mutate(id)}
                isActioning={actioningId === user.id}
              />
            ))
          )}
        </TabsContent>

        {isAdmin && (
          <TabsContent value="staff" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <UserPlus className="h-5 w-5" />
                  Add Admin or Staff User
                </CardTitle>
                <CardDescription>
                  Create a new administrator or staff member account
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <FormField
                        control={form.control}
                        name="contactName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Name</FormLabel>
                            <FormControl>
                              <Input placeholder="Full name" data-testid="input-new-user-name" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="email"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Email</FormLabel>
                            <FormControl>
                              <Input type="email" placeholder="email@example.com" data-testid="input-new-user-email" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="password"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Password</FormLabel>
                            <FormControl>
                              <Input type="password" placeholder="Min 6 characters" data-testid="input-new-user-password" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="role"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Role</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                              <FormControl>
                                <SelectTrigger data-testid="select-new-user-role">
                                  <SelectValue placeholder="Select role" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="staff">Staff</SelectItem>
                                <SelectItem value="admin">Admin</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    <Button 
                      type="submit" 
                      disabled={createStaffMutation.isPending}
                      data-testid="button-create-user"
                    >
                      {createStaffMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : (
                        <UserPlus className="h-4 w-4 mr-2" />
                      )}
                      Create User
                    </Button>
                  </form>
                </Form>
              </CardContent>
            </Card>

            {adminStaffUsers.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Shield className="h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">No admin or staff users</p>
                </CardContent>
              </Card>
            ) : (
              adminStaffUsers.map(u => (
                <UserCard 
                  key={u.id} 
                  user={u} 
                  onApprove={(id) => approveMutation.mutate(id)}
                  onReject={(id) => rejectMutation.mutate(id)}
                  onSuspend={(id) => suspendMutation.mutate(id)}
                  onReactivate={(id) => reactivateMutation.mutate(id)}
                  onDelete={(id) => deleteMutation.mutate(id)}
                  isActioning={actioningId === u.id}
                  showDelete={true}
                />
              ))
            )}
          </TabsContent>
        )}

        <TabsContent value="other" className="space-y-4">
          {otherUsers.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Users className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No rejected or suspended users</p>
              </CardContent>
            </Card>
          ) : (
            otherUsers.map(user => (
              <UserCard 
                key={user.id} 
                user={user} 
                onApprove={(id) => approveMutation.mutate(id)}
                onReject={(id) => rejectMutation.mutate(id)}
                onSuspend={(id) => suspendMutation.mutate(id)}
                onReactivate={(id) => reactivateMutation.mutate(id)}
                isActioning={actioningId === user.id}
              />
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
