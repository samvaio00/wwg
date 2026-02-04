import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Percent, Clock, ShoppingCart, Sparkles } from "lucide-react";
import type { Product, Special } from "@shared/schema";
import { ProductDetailModal } from "@/components/product-detail-modal";
import { formatDistanceToNow } from "date-fns";

interface SpecialWithProducts extends Special {
  products: Product[];
}

function ProductCard({ 
  product, 
  specialPrice, 
  originalPrice,
  onClick 
}: { 
  product: Product; 
  specialPrice: string;
  originalPrice: string;
  onClick: () => void;
}) {
  const discount = Math.round(((parseFloat(originalPrice) - parseFloat(specialPrice)) / parseFloat(originalPrice)) * 100);
  const savings = (parseFloat(originalPrice) - parseFloat(specialPrice)).toFixed(2);
  const isOutOfStock = (product.stockQuantity || 0) <= 0;

  return (
    <Card 
      className="overflow-hidden hover-elevate cursor-pointer transition-all"
      onClick={onClick}
      data-testid={`special-product-${product.id}`}
    >
      <div className="relative">
        <div className="aspect-square bg-muted flex items-center justify-center overflow-hidden">
          {product.zohoItemId ? (
            <img
              src={`/api/products/${product.id}/image`}
              alt={product.name}
              className={`object-contain w-full h-full ${isOutOfStock ? "grayscale" : ""}`}
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          ) : (
            <div className="text-muted-foreground text-4xl">
              <ShoppingCart className="h-12 w-12" />
            </div>
          )}
        </div>
        <Badge 
          variant="destructive" 
          className="absolute top-2 right-2 text-sm font-bold"
        >
          {discount}% OFF
        </Badge>
        {isOutOfStock && (
          <Badge variant="secondary" className="absolute top-2 left-2">
            Out of Stock
          </Badge>
        )}
      </div>
      <CardContent className="p-5 space-y-2">
        <p className="text-xs text-muted-foreground font-mono">{product.sku}</p>
        <h3 className="font-medium text-sm line-clamp-2 min-h-[2.5rem]">{product.name}</h3>
        
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold text-green-600">${specialPrice}</span>
            <span className="text-sm text-muted-foreground line-through">${originalPrice}</span>
          </div>
          <p className="text-xs text-green-600 font-medium">
            You save ${savings}!
          </p>
        </div>

        <Button 
          className="w-full mt-2" 
          size="sm"
          disabled={isOutOfStock}
          data-testid={`button-view-special-${product.id}`}
        >
          {isOutOfStock ? "Out of Stock" : "View Deal"}
        </Button>
      </CardContent>
    </Card>
  );
}

function EmptySpecialsState() {
  const wittyMessages = [
    {
      title: "Our Deals Are So Good, They Vanished!",
      subtitle: "Check back soon - new specials are always around the corner.",
    },
    {
      title: "The Early Bird Got All the Worms...",
      subtitle: "But don't worry, new specials are hatching soon!",
    },
    {
      title: "Specials? We Just Sold the Last One!",
      subtitle: "Keep your eyes peeled - fresh deals are coming your way.",
    },
    {
      title: "Our Deals Are Taking a Coffee Break",
      subtitle: "They'll be back refreshed and better than ever!",
    },
  ];

  const randomMessage = wittyMessages[Math.floor(Math.random() * wittyMessages.length)];

  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="relative mb-6">
        <div className="w-24 h-24 rounded-full bg-muted flex items-center justify-center">
          <Sparkles className="h-12 w-12 text-muted-foreground" />
        </div>
        <div className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-primary flex items-center justify-center">
          <Clock className="h-4 w-4 text-primary-foreground" />
        </div>
      </div>
      
      <h2 className="text-2xl font-bold mb-2">{randomMessage.title}</h2>
      <p className="text-muted-foreground max-w-md mb-6">
        {randomMessage.subtitle}
      </p>
      
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Percent className="h-4 w-4" />
        <span>New specials are added regularly - check back often!</span>
      </div>
    </div>
  );
}

export default function SpecialsPage() {
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedSpecialPrice, setSelectedSpecialPrice] = useState<string | null>(null);

  const { data, isLoading } = useQuery<{ specials: SpecialWithProducts[] }>({
    queryKey: ["/api/specials"],
  });

  const specials = data?.specials || [];
  const hasActiveSpecials = specials.length > 0 && specials.some(s => s.products.length > 0);

  const handleProductClick = (product: Product, specialPrice: string) => {
    setSelectedProduct(product);
    setSelectedSpecialPrice(specialPrice);
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
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-destructive/10">
          <Percent className="h-6 w-6 text-destructive" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Specials & Closeouts</h1>
          <p className="text-muted-foreground">
            Limited-time deals on select products. Don't miss out!
          </p>
        </div>
      </div>

      {!hasActiveSpecials ? (
        <EmptySpecialsState />
      ) : (
        <div className="space-y-8">
          {specials.map((special) => (
            special.products.length > 0 && (
              <div key={special.id} className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold">{special.zohoGroupName}</h2>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      <span>
                        Ends {formatDistanceToNow(new Date(special.endAt), { addSuffix: true })}
                      </span>
                    </div>
                  </div>
                  <Badge variant="destructive" className="text-sm">
                    Save {Math.round(((parseFloat(special.originalPrice) - parseFloat(special.specialPrice)) / parseFloat(special.originalPrice)) * 100)}%
                  </Badge>
                </div>
                
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-5">
                  {special.products.map((product) => (
                    <ProductCard
                      key={product.id}
                      product={product}
                      specialPrice={special.specialPrice}
                      originalPrice={special.originalPrice}
                      onClick={() => handleProductClick(product, special.specialPrice)}
                    />
                  ))}
                </div>
              </div>
            )
          ))}
        </div>
      )}

      <ProductDetailModal
        product={selectedProduct}
        open={!!selectedProduct}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedProduct(null);
            setSelectedSpecialPrice(null);
          }
        }}
      />
    </div>
  );
}
