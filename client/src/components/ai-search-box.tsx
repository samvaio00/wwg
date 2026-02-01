import { useState, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, Sparkles, Loader2, ShoppingCart, Zap } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface AISearchBoxProps {
  value: string;
  onChange: (value: string) => void;
  isAIActive?: boolean;
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

function parseActionCommand(query: string): { isAction: boolean; quantity?: number; productQuery?: string } {
  const trimmed = query.trim();
  
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
  isAIActive = false,
  isSearching = false,
  placeholder = "Try: 'cheap cables' or 'add 5 headsets to cart'...",
  testId = "input-ai-search",
  onActionExecuted,
}: AISearchBoxProps) {
  const [isProcessingAction, setIsProcessingAction] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const executeActionMutation = useMutation({
    mutationFn: async (params: { query: string; quantity: number; productQuery: string }) => {
      const searchRes = await apiRequest("GET", `/api/ai/search?q=${encodeURIComponent(params.productQuery)}&limit=5`);
      const searchData = await searchRes.json();
      
      if (!searchData.products || searchData.products.length === 0) {
        throw new Error(`No products found matching "${params.productQuery}"`);
      }

      const product = searchData.products[0];
      
      const addRes = await apiRequest("POST", "/api/cart", {
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
      if (parsed.isAction && parsed.productQuery) {
        e.preventDefault();
        setIsProcessingAction(true);
        executeActionMutation.mutate({
          query: value,
          quantity: parsed.quantity || 1,
          productQuery: parsed.productQuery,
        });
      }
    }
  }, [value, executeActionMutation]);

  const parsed = parseActionCommand(value);
  const showActionIndicator = parsed.isAction && value.length > 5;

  return (
    <div className="flex items-center gap-2">
      <div className="relative w-80 lg:w-96">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground transition-colors" />
        <Input
          type="search"
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          className={`pl-10 pr-16 h-9 focus-ring-animate transition-all ${
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
              <ShoppingCart className="h-3 w-3" />
              Action
            </Badge>
          )}
          {isSearching && !isProcessingAction && !showActionIndicator && (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          )}
          {isAIActive && !isSearching && !showActionIndicator && !isProcessingAction && (
            <Badge variant="secondary" className="text-xs gap-1 badge-pop">
              <Sparkles className="h-3 w-3 ai-pulse" />
              AI
            </Badge>
          )}
        </div>
      </div>
      
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Zap className="h-3.5 w-3.5 text-primary" />
        <span className="hidden sm:inline font-medium">AI Search</span>
      </div>
    </div>
  );
}
