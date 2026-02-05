import { useState, useRef, useEffect } from "react";
import { Package } from "lucide-react";
import type { Product } from "@shared/schema";

interface LazyProductImageProps {
  product: Product;
  isOutOfStock?: boolean;
  iconSize?: "sm" | "md" | "lg";
  className?: string;
}

const iconSizes = {
  sm: "h-8 w-8",
  md: "h-12 w-12",
  lg: "h-16 w-16",
};

export function LazyProductImage({ 
  product, 
  isOutOfStock = false, 
  iconSize = "lg",
  className = ""
}: LazyProductImageProps) {
  const [isInView, setIsInView] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const imageUrl = product.zohoItemId 
    ? `/api/products/${product.id}/image`
    : product.imageUrl;

  useEffect(() => {
    const element = containerRef.current;
    if (!element || !imageUrl) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsInView(true);
            observer.unobserve(element);
          }
        });
      },
      {
        rootMargin: "100px",
        threshold: 0.01,
      }
    );

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [imageUrl]);

  const iconClass = iconSizes[iconSize];

  if (!imageUrl || imageError) {
    return (
      <div ref={containerRef} className={`flex items-center justify-center h-full ${className}`}>
        <Package className={`${iconClass} text-muted-foreground`} />
      </div>
    );
  }

  return (
    <div ref={containerRef} className={`relative h-full ${className}`}>
      {(!isInView || !imageLoaded) && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Package className={`${iconClass} text-muted-foreground ${isInView ? "animate-pulse" : ""}`} />
        </div>
      )}
      {isInView && (
        <img 
          src={imageUrl} 
          alt={product.name}
          className={`object-contain w-full h-full ${isOutOfStock ? "grayscale" : ""} ${imageLoaded ? "" : "opacity-0"}`}
          onError={() => setImageError(true)}
          onLoad={() => setImageLoaded(true)}
        />
      )}
    </div>
  );
}
