import { useState, useCallback, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Loader2, ShoppingCart, TrendingUp, Sparkles, Layers, Search, Lightbulb } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface AISearchBoxProps {
  value: string;
  onChange: (value: string) => void;
  onSearch?: (query: string) => void;
  isSearching?: boolean;
  placeholder?: string;
  testId?: string;
  onActionExecuted?: () => void;
  aiEnabled?: boolean;
  onAIToggle?: (enabled: boolean) => void;
  showAIToggle?: boolean;
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

// Patterns for "add each of" type commands - matches products and adds each one
const ADD_EACH_PATTERNS = [
  // "add 1 box each of available geek bar pulse x flavors to my cart"
  /^add\s+(\d+)\s+(?:box(?:es)?|piece(?:s)?|unit(?:s)?|item(?:s)?|pack(?:s)?|case(?:s)?|)?\s*(?:each|of\s+each)\s+(?:of\s+)?(?:available\s+|in\s*stock\s+)?(.+?)\s+to\s+(?:my\s+)?cart$/i,
  // "add 1 of each available geek bar to cart"
  /^add\s+(\d+)\s+(?:of\s+)?each\s+(?:available\s+|in\s*stock\s+)?(.+?)\s+to\s+(?:my\s+)?cart$/i,
  // "add each available geek bar pulse x to cart" (quantity defaults to 1)
  /^add\s+(?:each|all)\s+(?:available\s+|in\s*stock\s+)?(.+?)\s+to\s+(?:my\s+)?cart$/i,
  // "add all geek bar flavors to my cart"
  /^add\s+all\s+(.+?)\s+to\s+(?:my\s+)?cart$/i,
  // "order 1 each of geek bar pulse x flavors"
  /^(?:order|buy|get)\s+(\d+)\s+(?:of\s+)?each\s+(?:available\s+|in\s*stock\s+)?(.+)$/i,
  // "get me 2 of each available geek bar"
  /^get\s+me\s+(\d+)\s+(?:of\s+)?each\s+(?:available\s+|in\s*stock\s+)?(.+)$/i,
];

const TOP_SELLERS_PATTERNS = [
  /^add\s+(?:the\s+)?(\d+)\s+top\s+sell(?:ing|er)s?\s+(.+?)\s+to\s+(?:my\s+)?cart[,\s]*(\d+)\s+(?:pieces?|pcs?|units?|items?)\s+each$/i,
  /^add\s+(?:the\s+)?(\d+)\s+(?:best|top)\s+sell(?:ing|er)s?\s+(.+?)\s+to\s+(?:my\s+)?cart$/i,
  /^add\s+(?:the\s+)?top\s+(\d+)\s+(.+?)\s+to\s+(?:my\s+)?cart[,\s]*(\d+)\s+(?:pieces?|pcs?|units?|items?)\s+each$/i,
  /^add\s+(?:the\s+)?top\s+(\d+)\s+(.+?)\s+to\s+(?:my\s+)?cart$/i,
  /^(?:get|buy|order)\s+(?:the\s+)?(\d+)\s+(?:best|top)\s+sell(?:ing|er)s?\s+(.+?)[,\s]*(\d+)\s+(?:pieces?|pcs?|units?|items?)\s+each$/i,
  /^(?:get|buy|order)\s+(?:the\s+)?(\d+)\s+(?:best|top)\s+sell(?:ing|er)s?\s+(.+)$/i,
];

// Patterns for detecting "top seller" search filter (not action commands)
const TOP_SELLER_SEARCH_PATTERNS = [
  /\btop\s*sell(?:er|ing|ers)?\b/i,
  /\bbest\s*sell(?:er|ing|ers)?\b/i,
  /\bmost\s*popular\b/i,
  /\bhot\s*sell(?:er|ing|ers)?\b/i,
  /\btrending\b/i,
];

function hasTopSellerSearchFilter(query: string): boolean {
  return TOP_SELLER_SEARCH_PATTERNS.some(pattern => pattern.test(query));
}

interface ParsedAction {
  isAction: boolean;
  isTopSellers?: boolean;
  isAddEach?: boolean;
  quantity?: number;
  productQuery?: string;
  topCount?: number;
  category?: string;
  quantityEach?: number;
}

function parseActionCommand(query: string): ParsedAction {
  const trimmed = query.trim();
  
  // Check for "add each of" patterns first (must be before regular ACTION_PATTERNS)
  for (const pattern of ADD_EACH_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match) {
      // Patterns have either (quantity, productQuery) or just (productQuery)
      if (match.length === 3) {
        return { 
          isAction: true, 
          isAddEach: true,
          quantityEach: parseInt(match[1], 10),
          productQuery: match[2].trim(),
        };
      } else if (match.length === 2) {
        return { 
          isAction: true, 
          isAddEach: true,
          quantityEach: 1,
          productQuery: match[1].trim(),
        };
      }
    }
  }
  
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

const AI_SEARCH_EXAMPLES = [
  { icon: Search, label: "Search products", example: '"USB cables" or "lightning charger"' },
  { icon: TrendingUp, label: "Find top sellers", example: '"top seller vapes" or "best selling cables"' },
  { icon: Search, label: "Search by SKU", example: '"812934025840" or partial SKU' },
  { icon: Layers, label: "Bulk add variants", example: '"add 1 each of geek bar pulse flavors to cart"' },
  { icon: TrendingUp, label: "Add top sellers", example: '"add 5 top sellers chargers to cart"' },
];

export function AISearchBox({
  value,
  onChange,
  onSearch,
  isSearching = false,
  placeholder,
  testId = "input-ai-search",
  onActionExecuted,
  aiEnabled = true,
  onAIToggle,
  showAIToggle = true,
}: AISearchBoxProps) {
  const [isProcessingAction, setIsProcessingAction] = useState(false);
  const [showExamples, setShowExamples] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const dynamicPlaceholder = placeholder || (aiEnabled 
    ? "AI Search - try 'top seller cables' or 'best selling chargers'" 
    : "Search by name, SKU, or keyword...");

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

  // Mutation for "add each of" commands - searches and adds all matching in-stock products
  const executeAddEachAction = useMutation({
    mutationFn: async (params: { productQuery: string; quantityEach: number }) => {
      // Search for matching products using AI search
      const searchRes = await fetch(`/api/ai/search?query=${encodeURIComponent(params.productQuery)}&limit=50`, {
        credentials: "include",
      });
      const searchData = await searchRes.json();
      
      if (!searchData.products || searchData.products.length === 0) {
        throw new Error(`No products found matching "${params.productQuery}"`);
      }

      // Filter to in-stock products only
      const inStockProducts = searchData.products.filter((p: { stockQuantity?: number }) => (p.stockQuantity || 0) > 0);
      
      if (inStockProducts.length === 0) {
        throw new Error(`No in-stock products found matching "${params.productQuery}"`);
      }

      const addedProducts: Array<{ id: string; name: string; quantity: number }> = [];
      const failedProducts: string[] = [];
      
      // Add each matching product to cart
      for (const product of inStockProducts) {
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

      let message = `Added ${addedProducts.length} matching ${addedProducts.length === 1 ? 'product' : 'products'} (${totalItems} total pieces) to your cart`;
      if (failedProducts.length > 0) {
        const failedNames = failedProducts.slice(0, 3).map(f => f.split(" (")[0]).join(", ");
        message += `. Could not add: ${failedNames}${failedProducts.length > 3 ? ` and ${failedProducts.length - 3} more` : ''}`;
      }

      return {
        action: "add_each",
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
        title: result.failedCount && result.failedCount > 0 ? "Partially added" : "Products added",
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

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && value.trim()) {
      if (aiEnabled) {
        const parsed = parseActionCommand(value);
        if (parsed.isAction) {
          e.preventDefault();
          setIsProcessingAction(true);
          
          if (parsed.isAddEach && parsed.productQuery) {
            // "add each of" / "add all matching" type commands
            executeAddEachAction.mutate({
              productQuery: parsed.productQuery,
              quantityEach: parsed.quantityEach || 1,
            });
          } else if (parsed.isTopSellers && parsed.category && parsed.topCount) {
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
          onSearch?.(value.trim());
        }
      } else {
        onSearch?.(value.trim());
      }
    }
  }, [value, aiEnabled, executeActionMutation, executeTopSellersAction, executeAddEachAction, onSearch]);

  const parsed = aiEnabled ? parseActionCommand(value) : { isAction: false };
  const showActionIndicator = aiEnabled && parsed.isAction && value.length > 5;
  const isTopSellersAction = parsed.isTopSellers;
  const isAddEachAction = parsed.isAddEach;
  
  // Detect "top seller" search filter (for non-action searches)
  const hasTopSellerFilter = aiEnabled && !parsed.isAction && value.length > 5 && hasTopSellerSearchFilter(value);
  const showTopSellerSearchIndicator = hasTopSellerFilter;

  return (
    <div className="flex items-center gap-3">
      {showAIToggle && (
        <div className="flex items-center gap-2 shrink-0">
          <Switch
            id="ai-toggle"
            checked={aiEnabled}
            onCheckedChange={(checked) => onAIToggle?.(checked)}
            data-testid="switch-ai-toggle"
          />
          <Label 
            htmlFor="ai-toggle" 
            className={`text-sm font-medium cursor-pointer flex items-center gap-1.5 transition-colors ${
              aiEnabled ? "text-primary" : "text-muted-foreground"
            }`}
          >
            <Sparkles className={`h-3.5 w-3.5 ${aiEnabled ? "text-primary" : "text-muted-foreground"}`} />
            AI
          </Label>
        </div>
      )}
      <Popover open={showExamples && aiEnabled} onOpenChange={setShowExamples}>
        <PopoverTrigger asChild>
          <div className="relative w-96 lg:w-[26rem]">
            <Input
              ref={inputRef}
              type="search"
              placeholder={dynamicPlaceholder}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => aiEnabled && value.length === 0 && setShowExamples(true)}
              onBlur={() => setTimeout(() => setShowExamples(false), 150)}
              className={`pr-20 h-9 focus-ring-animate transition-all ${
                showActionIndicator ? "border-primary/50 bg-primary/5" : ""
              } ${showTopSellerSearchIndicator ? "border-amber-500/50 bg-amber-500/5" : ""}`}
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
                  ) : isAddEachAction ? (
                    <>
                      <Layers className="h-3 w-3" />
                      Bulk Add
                    </>
                  ) : (
                    <>
                      <ShoppingCart className="h-3 w-3" />
                      Action
                    </>
                  )}
                </Badge>
              )}
              {showTopSellerSearchIndicator && !isProcessingAction && !showActionIndicator && (
                <Badge variant="secondary" className="text-xs gap-1 badge-pop">
                  <TrendingUp className="h-3 w-3" />
                  Top Seller
                </Badge>
              )}
              {isSearching && !isProcessingAction && !showActionIndicator && (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              )}
              {!isSearching && !showActionIndicator && !isProcessingAction && value.length === 0 && (
                <span className="text-xs text-muted-foreground">Enter</span>
              )}
            </div>
          </div>
        </PopoverTrigger>
        <PopoverContent 
          side="bottom" 
          align="start" 
          className="w-96 p-0"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <div className="p-3 border-b bg-muted/30">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Lightbulb className="h-4 w-4 text-amber-500" />
              AI Search Examples
            </div>
          </div>
          <div className="divide-y">
            {AI_SEARCH_EXAMPLES.map((item, index) => (
              <button
                key={index}
                className="w-full p-3 text-left hover-elevate flex items-start gap-3"
                onMouseDown={(e) => {
                  e.preventDefault();
                  const exampleText = item.example.split('"')[1] || "";
                  onChange(exampleText);
                  setShowExamples(false);
                  inputRef.current?.focus();
                }}
                data-testid={`ai-example-${index}`}
              >
                <item.icon className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium">{item.label}</p>
                  <p className="text-xs text-muted-foreground truncate">{item.example}</p>
                </div>
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
