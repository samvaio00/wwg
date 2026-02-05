import { useState, useCallback, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { 
  Search, 
  Upload, 
  Loader2, 
  ImageIcon,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  CheckCircle,
  Globe,
  EyeOff
} from "lucide-react";
import { useDebounce } from "@/hooks/use-debounce";

interface Group {
  zohoGroupId: string;
  zohoGroupName: string;
  productCount: number;
  hasActiveProducts: boolean;
  isOnline?: boolean;
}

interface GroupsResponse {
  groups: Group[];
  pagination: {
    page: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
  };
}

function GroupImageTile({ group, initialIsOnline, onUploadSuccess }: { 
  group: Group; 
  initialIsOnline: boolean;
  onUploadSuccess: () => void;
}) {
  const [isInView, setIsInView] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [cacheKey, setCacheKey] = useState(Date.now());
  const [localIsOnline, setLocalIsOnline] = useState(initialIsOnline);
  const [isTogglingOnline, setIsTogglingOnline] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    setLocalIsOnline(initialIsOnline);
  }, [initialIsOnline]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsInView(true);
            observer.unobserve(element);
          }
        });
      },
      { rootMargin: "100px", threshold: 0.01 }
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const toggleOnlineMutation = useMutation({
    mutationFn: async (newIsOnline: boolean) => {
      const response = await apiRequest("PATCH", `/api/admin/groups/${group.zohoGroupId}/online-status`, { isOnline: newIsOnline });
      return response.json();
    },
    onMutate: () => {
      setIsTogglingOnline(true);
    },
    onSuccess: (data) => {
      setLocalIsOnline(data.isOnline);
      toast({
        title: data.isOnline ? "Group Online" : "Group Offline",
        description: `${group.zohoGroupName} is now ${data.isOnline ? 'visible' : 'hidden'} on the storefront`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update status",
        description: error.message,
        variant: "destructive",
      });
    },
    onSettled: () => {
      setIsTogglingOnline(false);
    }
  });

  const handleToggleOnline = () => {
    toggleOnlineMutation.mutate(!localIsOnline);
  };
  
  const imageUrl = `/product-images/group-${group.zohoGroupId}.jpg?t=${cacheKey}`;

  const handleUpload = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast({
        title: "Invalid file type",
        description: "Please upload an image file (JPG, PNG, etc.)",
        variant: "destructive"
      });
      return;
    }

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("zohoGroupId", group.zohoGroupId);
      formData.append("image", file);

      const response = await fetch("/api/admin/groups/upload-image", {
        method: "POST",
        body: formData,
        credentials: "include"
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Upload failed");
      }

      setUploadSuccess(true);
      setTimeout(() => setUploadSuccess(false), 3000);
      setImageError(false);
      setImageLoaded(false);
      setCacheKey(Date.now());
      onUploadSuccess();
      
      toast({
        title: "Image uploaded",
        description: `Group image uploaded successfully for ${group.zohoGroupName}`,
      });
    } catch (error) {
      toast({
        title: "Upload failed",
        description: error instanceof Error ? error.message : "Failed to upload image",
        variant: "destructive"
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleUpload(files[0]);
    }
  }, [group.zohoGroupId]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleUpload(files[0]);
    }
    e.target.value = '';
  };

  const hasImage = imageLoaded && !imageError;

  return (
    <Card 
      ref={containerRef}
      className={`overflow-hidden transition-all ${isDragging ? 'ring-2 ring-primary' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      data-testid={`tile-group-${group.zohoGroupId}`}
    >
      <div className="aspect-square relative bg-muted">
        {isUploading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-10 w-10 text-primary animate-spin" />
          </div>
        ) : uploadSuccess ? (
          <div className="flex items-center justify-center h-full bg-green-50 dark:bg-green-950">
            <CheckCircle className="h-10 w-10 text-green-600" />
          </div>
        ) : isDragging ? (
          <div className="flex flex-col items-center justify-center h-full bg-primary/10">
            <Upload className="h-10 w-10 text-primary" />
            <span className="text-xs text-primary mt-1">Drop image here</span>
          </div>
        ) : isInView ? (
          <>
            {!imageLoaded && !imageError && (
              <div className="absolute inset-0 flex items-center justify-center">
                <ImageIcon className="h-10 w-10 text-muted-foreground animate-pulse" />
              </div>
            )}
            {imageError && (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                <ImageIcon className="h-10 w-10 mb-2" />
                <span className="text-xs">No group image</span>
              </div>
            )}
            <img
              src={imageUrl}
              alt={group.zohoGroupName}
              className={`w-full h-full object-contain ${imageLoaded ? "" : "opacity-0 absolute"}`}
              onLoad={() => setImageLoaded(true)}
              onError={() => setImageError(true)}
            />
          </>
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <ImageIcon className="h-10 w-10" />
          </div>
        )}
      </div>
      <CardContent className="p-3 space-y-2">
        <p className="text-xs text-muted-foreground">{group.productCount} items</p>
        <p className="text-sm font-medium line-clamp-2 min-h-[2.5rem]" title={group.zohoGroupName}>
          {group.zohoGroupName}
        </p>
        
        <div className="flex items-center justify-between gap-2 py-1 border-t border-b">
          <div className="flex items-center gap-1.5">
            {localIsOnline ? (
              <Globe className="h-3.5 w-3.5 text-green-600" />
            ) : (
              <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
            )}
            <Label 
              htmlFor={`online-toggle-group-${group.zohoGroupId}`}
              className={`text-xs cursor-pointer ${localIsOnline ? 'text-green-600 font-medium' : 'text-muted-foreground'}`}
            >
              {localIsOnline ? "Online" : "Offline"}
            </Label>
          </div>
          <Switch
            id={`online-toggle-group-${group.zohoGroupId}`}
            checked={localIsOnline}
            onCheckedChange={handleToggleOnline}
            disabled={isTogglingOnline || !group.hasActiveProducts}
            className="scale-75"
            data-testid={`switch-online-group-${group.zohoGroupId}`}
          />
        </div>
        {!group.hasActiveProducts && (
          <p className="text-xs text-amber-600 -mt-1">No active products in Zoho</p>
        )}
        
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept="image/*"
          className="hidden"
        />
        <Button 
          size="sm" 
          variant="outline" 
          className="w-full"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          data-testid={`button-upload-group-${group.zohoGroupId}`}
        >
          {isUploading ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <Upload className="h-4 w-4 mr-2" />
          )}
          {hasImage ? "Replace Image" : "Upload Image"}
        </Button>
      </CardContent>
    </Card>
  );
}

export default function AdminGroupImageUploadPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const debouncedSearch = useDebounce(searchQuery, 300);
  const pageSize = 15;

  const { data, isLoading } = useQuery<GroupsResponse>({
    queryKey: ["/api/admin/groups/for-images", currentPage, debouncedSearch],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: currentPage.toString(),
        pageSize: pageSize.toString(),
      });
      if (debouncedSearch) {
        params.append("search", debouncedSearch);
      }
      const res = await fetch(`/api/admin/groups/for-images?${params}`, {
        credentials: "include"
      });
      if (!res.ok) throw new Error("Failed to fetch groups");
      return res.json();
    },
  });

  const groups = data?.groups || [];
  const pagination = data?.pagination;
  const totalCount = pagination?.totalCount || 0;
  const totalPages = pagination?.totalPages || 1;

  const handleUploadSuccess = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/admin/groups/for-images"] });
  };

  return (
    <div className="p-5 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            Edit Group
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Manage group images and visibility. Drag and drop images onto tiles, upload, or toggle online/offline.
          </p>
        </div>
        <div className="text-sm text-muted-foreground">
          {totalCount} groups
        </div>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by group name or SKU..."
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setCurrentPage(1);
          }}
          className="pl-10"
          data-testid="input-group-search"
        />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : groups.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          {searchQuery ? "No groups found matching your search" : "No groups available"}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-5">
            {groups.map((group) => (
              <GroupImageTile 
                key={group.zohoGroupId} 
                group={group}
                initialIsOnline={group.isOnline ?? true}
                onUploadSuccess={handleUploadSuccess}
              />
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-4">
              <Button
                variant="outline"
                size="icon"
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1}
                data-testid="button-first-page"
              >
                <ChevronsLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                data-testid="button-prev-page"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm text-muted-foreground px-4">
                Page {currentPage} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                data-testid="button-next-page"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage === totalPages}
                data-testid="button-last-page"
              >
                <ChevronsRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
