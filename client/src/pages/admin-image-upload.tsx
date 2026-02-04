import { useState, useCallback, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { 
  Package,
  Search,
  Upload,
  Loader2,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Image as ImageIcon
} from "lucide-react";
import type { Product } from "@shared/schema";

interface ProductsResponse {
  products: Product[];
  pagination: {
    page: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
  };
}

function ProductImageTile({ product, onUploadSuccess }: { 
  product: Product; 
  onUploadSuccess: () => void;
}) {
  const [imageError, setImageError] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  
  const imageUrl = product.zohoItemId 
    ? `/api/products/${product.id}/image`
    : product.imageUrl;

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
      formData.append("image", file);
      formData.append("productId", product.id);

      const response = await fetch("/api/admin/products/upload-image", {
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
      onUploadSuccess();
      
      toast({
        title: "Image uploaded",
        description: `Image uploaded successfully for ${product.sku}`,
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
  }, [product.id]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleUpload(files[0]);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const hasImage = imageUrl && !imageError;

  return (
    <Card 
      className={`overflow-hidden transition-all ${isDragging ? "ring-2 ring-primary border-primary" : ""}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      data-testid={`tile-product-${product.id}`}
    >
      <div className="h-32 relative bg-muted overflow-hidden">
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
        ) : hasImage ? (
          <>
            {!imageLoaded && (
              <div className="absolute inset-0 flex items-center justify-center">
                <Package className="h-12 w-12 text-muted-foreground animate-pulse" />
              </div>
            )}
            <img 
              src={imageUrl} 
              alt={product.name}
              className={`object-contain w-full h-full ${imageLoaded ? "" : "opacity-0"}`}
              loading="lazy"
              onError={() => setImageError(true)}
              onLoad={() => setImageLoaded(true)}
            />
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <Package className="h-12 w-12" />
            <span className="text-xs mt-1">No image</span>
          </div>
        )}
      </div>
      <CardContent className="p-4 space-y-3">
        <div className="h-12">
          <p className="text-xs text-muted-foreground font-mono truncate">{product.sku}</p>
          <h3 className="font-medium text-sm line-clamp-2 leading-tight" data-testid={`text-product-name-${product.id}`}>
            {product.name}
          </h3>
        </div>
        
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileSelect}
          className="hidden"
          data-testid={`input-file-${product.id}`}
        />
        
        <Button
          variant={hasImage ? "outline" : "default"}
          size="sm"
          className="w-full"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          data-testid={`button-upload-${product.id}`}
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

export default function AdminImageUpload() {
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const { toast } = useToast();
  const pageSize = 15;

  const { data, isLoading, refetch } = useQuery<ProductsResponse>({
    queryKey: ["/api/admin/products/for-images", debouncedSearch, currentPage],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: currentPage.toString(),
        pageSize: pageSize.toString(),
      });
      if (debouncedSearch) {
        params.set("search", debouncedSearch);
      }
      const response = await fetch(`/api/admin/products/for-images?${params}`, {
        credentials: "include"
      });
      if (!response.ok) throw new Error("Failed to fetch products");
      return response.json();
    }
  });

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchQuery(value);
    setCurrentPage(1);
    
    const timeoutId = setTimeout(() => {
      setDebouncedSearch(value);
    }, 300);
    
    return () => clearTimeout(timeoutId);
  };

  const handleUploadSuccess = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/admin/products/for-images"] });
  };

  const totalPages = data?.pagination?.totalPages || 1;
  const totalCount = data?.pagination?.totalCount || 0;

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ImageIcon className="h-6 w-6" />
            Product Image Upload
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Upload or replace images for products. Drag and drop images onto tiles or click upload.
          </p>
        </div>
        <div className="text-sm text-muted-foreground">
          {totalCount} products
        </div>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Search by name, SKU, or group..."
          value={searchQuery}
          onChange={handleSearchChange}
          className="pl-9"
          data-testid="input-image-search"
        />
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-5">
          {Array.from({ length: pageSize }).map((_, i) => (
            <Card key={i} className="overflow-hidden">
              <Skeleton className="h-32 w-full" />
              <CardContent className="p-4 space-y-3">
                <div className="space-y-2">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-4 w-full" />
                </div>
                <Skeleton className="h-8 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : data?.products && data.products.length > 0 ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-5">
            {data.products.map((product) => (
              <ProductImageTile
                key={product.id}
                product={product}
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
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                data-testid="button-prev-page"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="px-4 py-2 text-sm">
                Page {currentPage} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
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
      ) : (
        <div className="text-center py-12 text-muted-foreground">
          <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>No products found</p>
          {searchQuery && (
            <p className="text-sm mt-2">Try adjusting your search query</p>
          )}
        </div>
      )}
    </div>
  );
}
