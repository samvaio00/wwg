import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { 
  RefreshCw, 
  CheckCircle, 
  XCircle, 
  Loader2, 
  Sparkles, 
  Mail, 
  Clock,
  Trash2,
  Edit2,
  Eye
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface EmailTemplate {
  id: string;
  campaignType: string;
  subject: string;
  headline: string;
  introduction: string;
  callToAction: string;
  customPrompt: string | null;
  status: string;
  approvedById: string | null;
  approvedAt: string | null;
  rejectionReason: string | null;
  productIds: string[] | null;
  createdAt: string;
  updatedAt: string;
}

const campaignTypeLabels: Record<string, string> = {
  new_highlighted_items: "New Featured Products",
  new_skus: "New Arrivals",
  cart_abandonment: "Cart Reminder",
};

const statusColors: Record<string, string> = {
  draft: "secondary",
  pending_approval: "default",
  approved: "default",
  rejected: "destructive",
};

const statusLabels: Record<string, string> = {
  draft: "Draft",
  pending_approval: "Pending Approval",
  approved: "Approved",
  rejected: "Rejected",
};

export default function AdminEmailTemplatesPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [selectedTemplate, setSelectedTemplate] = useState<EmailTemplate | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [templateToDelete, setTemplateToDelete] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [selectedCampaignType, setSelectedCampaignType] = useState("new_highlighted_items");
  const [customPrompt, setCustomPrompt] = useState("");
  
  const isAdmin = user?.role === "admin";
  const isStaff = user?.role === "staff";
  const isAdminOrStaff = isAdmin || isStaff;

  const { data: templatesData, isLoading } = useQuery<{ templates: EmailTemplate[] }>({
    queryKey: ["/api/admin/email-templates"],
    enabled: isAdminOrStaff,
  });

  const generateMutation = useMutation({
    mutationFn: async ({ campaignType, customPrompt }: { campaignType: string; customPrompt?: string }) => {
      const res = await apiRequest("POST", "/api/admin/email-templates/generate", {
        campaignType,
        customPrompt,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/email-templates"] });
      setGenerateOpen(false);
      setCustomPrompt("");
      toast({
        title: "Template Generated",
        description: "AI has created a new email template for your review",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to generate email template",
        variant: "destructive",
      });
    },
  });

  const approveMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/admin/email-templates/${id}/approve`, {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/email-templates"] });
      setPreviewOpen(false);
      toast({
        title: "Template Approved",
        description: "This template will be used for the next campaign",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to approve template",
        variant: "destructive",
      });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const res = await apiRequest("POST", `/api/admin/email-templates/${id}/reject`, { reason });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/email-templates"] });
      setRejectOpen(false);
      setRejectionReason("");
      toast({
        title: "Template Rejected",
        description: "The template has been rejected",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to reject template",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/admin/email-templates/${id}`, {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/email-templates"] });
      setDeleteOpen(false);
      setTemplateToDelete(null);
      toast({
        title: "Template Deleted",
        description: "The template has been removed",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete template",
        variant: "destructive",
      });
    },
  });

  const regenerateMutation = useMutation({
    mutationFn: async ({ id, customPrompt }: { id: string; customPrompt?: string }) => {
      const res = await apiRequest("POST", `/api/admin/email-templates/${id}/regenerate`, {
        customPrompt,
      });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/email-templates"] });
      setSelectedTemplate(data.template);
      toast({
        title: "Template Regenerated",
        description: "A new version has been created",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to regenerate template",
        variant: "destructive",
      });
    },
  });

  if (!isAdminOrStaff) {
    return (
      <div className="flex h-full items-center justify-center">
        <Card className="w-96">
          <CardContent className="pt-6 text-center">
            <p className="text-muted-foreground">You do not have access to this page.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const templates = templatesData?.templates || [];
  const pendingTemplates = templates.filter(t => t.status === "pending_approval");
  const approvedTemplates = templates.filter(t => t.status === "approved");
  const rejectedTemplates = templates.filter(t => t.status === "rejected");

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Email Campaign Templates</h1>
          <p className="text-muted-foreground">
            Review and approve AI-generated email templates before they are sent to customers
          </p>
        </div>
        <Button
          onClick={() => setGenerateOpen(true)}
          className="gap-2"
          data-testid="button-generate-template"
        >
          <Sparkles className="h-4 w-4" />
          Generate Template
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Approval</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-pending-count">{pendingTemplates.length}</div>
            <p className="text-xs text-muted-foreground">Templates awaiting review</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Approved</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-approved-count">{approvedTemplates.length}</div>
            <p className="text-xs text-muted-foreground">Ready for next campaign</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Rejected</CardTitle>
            <XCircle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-rejected-count">{rejectedTemplates.length}</div>
            <p className="text-xs text-muted-foreground">Need regeneration</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Templates</CardTitle>
          <CardDescription>
            Campaign emails are sent on Wednesdays and Saturdays at 9 AM
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : templates.length === 0 ? (
            <div className="text-center py-8">
              <Mail className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No email templates yet</p>
              <p className="text-sm text-muted-foreground mt-1">
                Generate your first template to get started
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {templates.map((template) => (
                <div
                  key={template.id}
                  className="flex items-start justify-between gap-4 rounded-lg border p-4 hover-elevate cursor-pointer transition-all"
                  data-testid={`template-card-${template.id}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant={statusColors[template.status] as any}>
                        {statusLabels[template.status]}
                      </Badge>
                      <Badge variant="outline">
                        {campaignTypeLabels[template.campaignType] || template.campaignType}
                      </Badge>
                    </div>
                    <h3 className="font-semibold truncate" data-testid={`text-template-subject-${template.id}`}>
                      {template.subject}
                    </h3>
                    <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                      {template.introduction}
                    </p>
                    <p className="text-xs text-muted-foreground mt-2">
                      Created: {new Date(template.createdAt).toLocaleDateString()}
                      {template.approvedAt && ` | Approved: ${new Date(template.approvedAt).toLocaleDateString()}`}
                    </p>
                    {template.rejectionReason && (
                      <p className="text-xs text-destructive mt-1">
                        Rejection reason: {template.rejectionReason}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedTemplate(template);
                        setPreviewOpen(true);
                      }}
                      className="gap-1"
                      data-testid={`button-preview-${template.id}`}
                    >
                      <Eye className="h-3 w-3" />
                      Preview
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        regenerateMutation.mutate({ id: template.id });
                      }}
                      disabled={regenerateMutation.isPending}
                      className="gap-1"
                      data-testid={`button-refresh-${template.id}`}
                    >
                      <RefreshCw className={`h-3 w-3 ${regenerateMutation.isPending ? 'animate-spin' : ''}`} />
                      Refresh
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        setTemplateToDelete(template.id);
                        setDeleteOpen(true);
                      }}
                      className="gap-1 text-destructive hover:text-destructive"
                      data-testid={`button-delete-${template.id}`}
                    >
                      <Trash2 className="h-3 w-3" />
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={generateOpen} onOpenChange={setGenerateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Generate Email Template</DialogTitle>
            <DialogDescription>
              AI will create a professional email template for your campaign
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="campaign-type">Campaign Type</Label>
              <Select
                value={selectedCampaignType}
                onValueChange={setSelectedCampaignType}
              >
                <SelectTrigger id="campaign-type" data-testid="select-campaign-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="new_highlighted_items">New Featured Products</SelectItem>
                  <SelectItem value="new_skus">New Arrivals</SelectItem>
                  <SelectItem value="cart_abandonment">Cart Reminder</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="custom-prompt">Custom Instructions (Optional)</Label>
              <Textarea
                id="custom-prompt"
                placeholder="Add any specific instructions for the AI, e.g., 'Focus on summer products' or 'Use a more casual tone'"
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                rows={3}
                data-testid="input-custom-prompt"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGenerateOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => generateMutation.mutate({
                campaignType: selectedCampaignType,
                customPrompt: customPrompt || undefined,
              })}
              disabled={generateMutation.isPending}
              className="gap-2"
              data-testid="button-confirm-generate"
            >
              {generateMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              Generate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Template Preview</DialogTitle>
            <DialogDescription>
              Review the email template before approving
            </DialogDescription>
          </DialogHeader>
          {selectedTemplate && (
            <div className="space-y-4 py-4">
              <div className="flex items-center gap-2">
                <Badge variant={statusColors[selectedTemplate.status] as any}>
                  {statusLabels[selectedTemplate.status]}
                </Badge>
                <Badge variant="outline">
                  {campaignTypeLabels[selectedTemplate.campaignType] || selectedTemplate.campaignType}
                </Badge>
              </div>

              <div className="space-y-4 rounded-lg border p-4 bg-muted/50">
                <div>
                  <Label className="text-xs text-muted-foreground">Subject Line</Label>
                  <p className="font-semibold mt-1">{selectedTemplate.subject}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Headline</Label>
                  <p className="text-lg font-bold mt-1">{selectedTemplate.headline}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Introduction</Label>
                  <p className="mt-1">{selectedTemplate.introduction}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Call to Action</Label>
                  <Button className="mt-1" size="sm">{selectedTemplate.callToAction}</Button>
                </div>
              </div>

              {selectedTemplate.customPrompt && (
                <div className="rounded-lg border p-4">
                  <Label className="text-xs text-muted-foreground">Custom Prompt Used</Label>
                  <p className="text-sm mt-1">{selectedTemplate.customPrompt}</p>
                </div>
              )}

              {selectedTemplate.status === "pending_approval" && (
                <div className="flex gap-2 justify-end pt-4 border-t">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setPreviewOpen(false);
                      setRejectOpen(true);
                    }}
                    className="gap-1"
                    data-testid="button-reject-template"
                  >
                    <XCircle className="h-4 w-4" />
                    Reject
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      const prompt = window.prompt("Enter custom instructions for regeneration (optional):");
                      if (prompt !== null) {
                        regenerateMutation.mutate({
                          id: selectedTemplate.id,
                          customPrompt: prompt || undefined,
                        });
                      }
                    }}
                    disabled={regenerateMutation.isPending}
                    className="gap-1"
                    data-testid="button-regenerate-template"
                  >
                    {regenerateMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4" />
                    )}
                    Regenerate
                  </Button>
                  <Button
                    onClick={() => approveMutation.mutate(selectedTemplate.id)}
                    disabled={approveMutation.isPending}
                    className="gap-1"
                    data-testid="button-approve-template"
                  >
                    {approveMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <CheckCircle className="h-4 w-4" />
                    )}
                    Approve
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Template</DialogTitle>
            <DialogDescription>
              Please provide a reason for rejection
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Textarea
              placeholder="Enter rejection reason..."
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              rows={3}
              data-testid="input-rejection-reason"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (selectedTemplate && rejectionReason) {
                  rejectMutation.mutate({
                    id: selectedTemplate.id,
                    reason: rejectionReason,
                  });
                }
              }}
              disabled={!rejectionReason || rejectMutation.isPending}
              data-testid="button-confirm-reject"
            >
              {rejectMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Reject Template"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Template</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this template? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (templateToDelete) {
                  deleteMutation.mutate(templateToDelete);
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
