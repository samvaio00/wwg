import { useState, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, ShoppingCart, TrendingUp } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface AISearchBoxProps {
  value: string;
  onChange: (value: string) => void;
  onSearch?: (query: string) => void;
  isSearching?: boolean;
  placeholder?: string;
  testId?: string;
  onActionExecuted?: () => void;
}

interface ActionResult {
  action: string;
  success: boolean;
  message: string;
  itemsAdded?: number;
  products?: Array<{ id: string; name: string; quantity: number }>;
}

const ACTION_PATTERNS = [
  /^add\s+(\d+)\s+(.+?)\s+to\s+(?:my\s+)?cart$/i,
  /^add\s+(.+?)\s+to\s+(?:my\s+)?cart$/i,
  /^order\s+(\d+)\s+(.+)$/i,
  /^buy\s+(\d+)\s+(.+)$/i,
  /^get\s+me\s+(\d+)\s+(.+)$/i,
];

const TOP_SELLERS_PATTERNS = [
  /^add\s+(?:the\s+)?(\d+)\s+top\s+sell(?:ing|er)s?\s+(.+?)\s+to\s+(?:my\s+)?cart[,\s]*(\d+)\s+(?:pieces?|pcs?|units?|items?)\s+each$/i,
  /^add\s+(?:the\s+)?(\d+)\s+(?:best|top)\s+sell(?:ing|er)s?\s+(.+?)\s+to\s+(?:my\s+)?cart$/i,
  /^add\s+(?:the\s+)?top\s+(\d+)\s+(.+?)\s+to\s+(?:my\s+)?cart[,\s]*(\d+)\s+(?:pieces?|pcs?|units?|items?)\s+each$/i,
  /^add\s+(?:the\s+)?top\s+(\d+)\s+(.+?)\s+to\s+(?:my\s+)?cart$/i,
  /^(?:get|buy|order)\s+(?:the\s+)?(\d+)\s+(?:best|top)\s+sell(?:ing|er)s?\s+(.+?)[,\s]*(\d+)\s+(?:pieces?|pcs?|units?|items?)\s+each$/i,
  /^(?:get|buy|order)\s+(?:the\s+)?(\d+)\s+(?:best|top)\s+sell(?:ing|er)s?\s+(.+)$/i,
];

interface ParsedAction {
  isAction: boolean;
  isTopSellers?: boolean;
  quantity?: number;
  productQuery?: string;
  topCount?: number;
  category?: string;
  quantityEach?: number;
}

function parseActionCommand(query: string): ParsedAction {
  const trimmed = query.trim();
  
  for (const pattern of TOP_SELLERS_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match) {
      const topCount = parseInt(match[1], 10);
      const category = match[2].trim();
      const quantityEach = match[3] ? parseInt(match[3], 10) : 1;
      return { 
        isAction: true, 
        isTopSellers: true,
        topCount, 
        category,
        quantityEach,
      };
    }
  }
  
  for (const pattern of ACTION_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match) {
      if (match.length === 3) {
        return { isAction: true, quantity: parseInt(match[1], 10), productQuery: match[2] };
      } else if (match.length === 2) {
        return { isAction: true, quantity: 1, productQuery: match[1] };
      }
    }
  }
  
  return { isAction: false };
}

export function AISearchBox({
  value,
  onChange,
  onSearch,
  isSearching = false,
  placeholder = "AI Search",
  testId = "input-ai-search",
  onActionExecuted,
}: AISearchBoxProps) {
  const [isProcessingAction, setIsProcessingAction] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const executeTopSellersAction = useMutation({
    mutationFn: async (params: { topCount: number; category: string; quantityEach: number }) => {
      const topSellersRes = await fetch(`/api/top-sellers/by-category/${encodeURIComponent(params.category)}?limit=${params.topCount}`, {
        credentials: "include",
      });
      const topSellersData = await topSellersRes.json();
      
      if (!topSellersData.products || topSellersData.products.length === 0) {
        throw new Error(`No top selling products found in category "${params.category}"`);
      }

      const productsToAdd = topSellersData.products.slice(0, params.topCount);
      const addedProducts: Array<{ id: string; name: string; quantity: number }> = [];
      const failedProducts: string[] = [];
      
      for (const product of productsToAdd) {
        try {
          const addRes = await apiRequest("POST", "/api/cart/items", {
            productId: product.id,
            quantity: params.quantityEach,
          });
          
          if (addRes.ok) {
            addedProducts.push({ id: product.id, name: product.name, quantity: params.quantityEach });
          } else {
            const errorData = await addRes.json().catch(() => ({}));
            failedProducts.push(product.name + (errorData.message ? ` (${errorData.message})` : ""));
          }
        } catch {
          failedProducts.push(product.name);
        }
      }

      const totalItems = addedProducts.reduce((sum, p) => sum + p.quantity, 0);
      
      if (addedProducts.length === 0) {
        throw new Error(`Could not add any products. ${failedProducts.length > 0 ? `Failed: ${failedProducts.join(", ")}` : ""}`);
      }

      let message = `Added ${addedProducts.length} top selling ${params.category} ${addedProducts.length === 1 ? 'item' : 'items'} (${totalItems} pieces) to your cart`;
      if (failedProducts.length > 0) {
        const failedNames = failedProducts.map(f => f.split(" (")[0]).join(", ");
        message += `. Could not add: ${failedNames}`;
      }

      return {
        action: "add_top_sellers",
        success: true,
        message,
        itemsAdded: totalItems,
        products: addedProducts,
        failedCount: failedProducts.length,
      } as ActionResult & { failedCount?: number };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cart/items"] });
      toast({
        title: result.failedCount && result.failedCount > 0 ? "Partially added" : "Top sellers added",
        description: result.message,
        variant: result.failedCount && result.failedCount > 0 ? "default" : "default",
      });
      onChange("");
      onActionExecuted?.();
    },
    onError: (error: Error) => {
      toast({
        title: "Action failed",
        description: error.message,
        variant: "destructive",
      });
    },
    onSettled: () => {
      setIsProcessingAction(false);
    },
  });

  const executeActionMutation = useMutation({
    mutationFn: async (params: { query: string; quantity: number; productQuery: string }) => {
      const searchRes = await fetch(`/api/ai/search?query=${encodeURIComponent(params.productQuery)}&limit=5`, {
        credentials: "include",
      });
      const searchData = await searchRes.json();
      
      if (!searchData.products || searchData.products.length === 0) {
        throw new Error(`No products found matching "${params.productQuery}"`);
      }

      const product = searchData.products[0];
      
      const addRes = await apiRequest("POST", "/api/cart/items", {
        productId: product.id,
        quantity: params.quantity,
      });
      
      if (!addRes.ok) {
        const error = await addRes.json();
        throw new Error(error.message || "Failed to add to cart");
      }

      return {
        action: "add_to_cart",
        success: true,
        message: `Added ${params.quantity}x ${product.name} to your cart`,
        itemsAdded: params.quantity,
        products: [{ id: product.id, name: product.name, quantity: params.quantity }],
      } as ActionResult;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
      toast({
        title: "Action completed",
        description: result.message,
      });
      onChange("");
      onActionExecuted?.();
    },
    onError: (error: Error) => {
      toast({
        title: "Action failed",
        description: error.message,
        variant: "destructive",
      });
    },
    onSettled: () => {
      setIsProcessingAction(false);
    },
  });

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && value.trim()) {
      const parsed = parseActionCommand(value);
      if (parsed.isAction) {
        e.preventDefault();
        setIsProcessingAction(true);
        
        if (parsed.isTopSellers && parsed.category && parsed.topCount) {
          executeTopSellersAction.mutate({
            topCount: parsed.topCount,
            category: parsed.category,
            quantityEach: parsed.quantityEach || 1,
          });
        } else if (parsed.productQuery) {
          executeActionMutation.mutate({
            query: value,
            quantity: parsed.quantity || 1,
            productQuery: parsed.productQuery,
          });
        }
      } else {
        // Regular search - trigger onSearch callback
        onSearch?.(value.trim());
      }
    }
  }, [value, executeActionMutation, executeTopSellersAction, onSearch]);

  const parsed = parseActionCommand(value);
  const showActionIndicator = parsed.isAction && value.length > 5;
  const isTopSellersAction = parsed.isTopSellers;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="relative w-80 lg:w-96 ml-24">
          <Input
            type="search"
            placeholder={placeholder}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            className={`pr-24 h-9 focus-ring-animate transition-all ${
              showActionIndicator ? "border-primary/50 bg-primary/5" : ""
            }`}
            data-testid={testId}
            disabled={isProcessingAction}
          />
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
            {isProcessingAction && (
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
            )}
            {showActionIndicator && !isProcessingAction && (
              <Badge variant="default" className="text-xs gap-1 badge-pop">
                {isTopSellersAction ? (
                  <>
                    <TrendingUp className="h-3 w-3" />
                    Top Sellers
                  </>
                ) : (
                  <>
                    <ShoppingCart className="h-3 w-3" />
                    Action
                  </>
                )}
              </Badge>
            )}
            {isSearching && !isProcessingAction && !showActionIndicator && (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            )}
            {!isSearching && !showActionIndicator && !isProcessingAction && value.length === 0 && (
              <span className="text-xs text-muted-foreground">Press Enter</span>
            )}
          </div>
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-xs">
        <p className="text-sm">Try: "cheap cables" or "add 5 headsets to cart"</p>
      </TooltipContent>
    </Tooltip>
  );
}
