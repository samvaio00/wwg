import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Sparkles, Plus, Loader2, ShoppingCart, HelpCircle } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const PLACEHOLDER_TIPS = [
  "Try: I need vape products for my smoke shop, around $500 worth",
  "Try: 20 cases of phone chargers and cables",
  "Try: Sunglasses for summer display, mix of styles",
  "Try: Impulse items for gas station checkout counter",
  "Try: Best selling CBD products, $300 budget",
  "Try: Phone cases and screen protectors for iPhone and Samsung",
  "Try: Novelty items and air fresheners for convenience store",
  "Try: Perfumes and body mists, variety pack",
];

interface Suggestion {
  productId: string;
  sku: string;
  name: string;
  category: string;
  price: string;
  quantity: number;
  reason: string;
}

interface CartBuilderResult {
  suggestions: Suggestion[];
  summary: string;
  totalEstimate: string;
  needsClarification?: boolean;
  clarificationQuestion?: string | null;
}

export function AICartBuilder() {
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [result, setResult] = useState<CartBuilderResult | null>(null);
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const { toast } = useToast();

  useEffect(() => {
    if (!open) return;
    const interval = setInterval(() => {
      setPlaceholderIndex((prev) => (prev + 1) % PLACEHOLDER_TIPS.length);
    }, 4000);
    return () => clearInterval(interval);
  }, [open]);

  const buildMutation = useMutation({
    mutationFn: async (prompt: string) => {
      const response = await apiRequest("POST", "/api/ai/cart-builder", { prompt });
      return response.json() as Promise<CartBuilderResult>;
    },
    onSuccess: (data) => {
      setResult(data);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to get AI recommendations. Please try again.",
        variant: "destructive",
      });
    },
  });

  const addToCartMutation = useMutation({
    mutationFn: async (items: { productId: string; quantity: number }[]) => {
      for (const item of items) {
        await apiRequest("POST", "/api/cart/items", item);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
      toast({
        title: "Added to Cart",
        description: "AI-recommended products have been added to your cart.",
      });
      setOpen(false);
      setResult(null);
      setPrompt("");
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to add items to cart. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleBuild = () => {
    if (prompt.trim()) {
      buildMutation.mutate(prompt.trim());
    }
  };

  const handleAddAll = () => {
    if (result?.suggestions) {
      const items = result.suggestions.map((s) => ({
        productId: s.productId,
        quantity: s.quantity,
      }));
      addToCartMutation.mutate(items);
    }
  };

  const handleAddSingle = async (suggestion: Suggestion) => {
    try {
      await apiRequest("POST", "/api/cart/items", {
        productId: suggestion.productId,
        quantity: suggestion.quantity,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
      toast({
        title: "Added to Cart",
        description: `${suggestion.name} (x${suggestion.quantity}) added to your cart.`,
      });
    } catch {
      toast({
        title: "Error",
        description: "Failed to add item to cart.",
        variant: "destructive",
      });
    }
  };

  const handleClose = () => {
    setOpen(false);
    setResult(null);
    setPrompt("");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DialogTrigger asChild>
            <Button 
              variant="ghost" 
              className="text-white hover:bg-gray-700"
              data-testid="button-ai-cart-builder"
            >
              <Sparkles className="h-4 w-4 mr-1.5" />
              <span className="text-sm font-medium">AI Order</span>
            </Button>
          </DialogTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <p>AI Cart Builder - Describe what you need and let AI suggest products</p>
        </TooltipContent>
      </Tooltip>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            AI Cart Builder
          </DialogTitle>
          <DialogDescription>
            Describe what you need and our AI will recommend products for your store.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Textarea
              placeholder={PLACEHOLDER_TIPS[placeholderIndex]}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="min-h-[100px] transition-all"
              data-testid="input-ai-prompt"
            />
            <Button
              onClick={handleBuild}
              disabled={!prompt.trim() || buildMutation.isPending}
              className="w-full gap-2"
              data-testid="button-ai-build"
            >
              {buildMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Getting recommendations...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Get AI Recommendations
                </>
              )}
            </Button>
          </div>

          {result?.needsClarification && result.clarificationQuestion && (
            <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <HelpCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-amber-800 dark:text-amber-200">Need more details</p>
                  <p className="text-sm text-amber-700 dark:text-amber-300 mt-1" data-testid="text-clarification">
                    {result.clarificationQuestion}
                  </p>
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
                    Update your request above and try again
                  </p>
                </div>
              </div>
            </div>
          )}

          {result && !result.needsClarification && (
            <div className="space-y-4">
              <div className="bg-muted/50 rounded-lg p-4">
                <p className="text-sm" data-testid="text-ai-summary">{result.summary}</p>
                <p className="text-sm font-medium mt-2">
                  Estimated Total: <span className="text-primary">{result.totalEstimate}</span>
                </p>
              </div>

              <div className="space-y-3">
                <h4 className="font-medium">Recommended Products ({result.suggestions.length})</h4>
                {result.suggestions.map((suggestion, index) => (
                  <Card key={suggestion.productId} data-testid={`card-suggestion-${index}`}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium">{suggestion.name}</span>
                            <Badge variant="outline">{suggestion.category}</Badge>
                            <span className="text-xs text-muted-foreground">{suggestion.sku}</span>
                          </div>
                          <p className="text-sm text-muted-foreground mt-1">{suggestion.reason}</p>
                          <div className="flex items-center gap-4 mt-2 text-sm">
                            <span>${suggestion.price} each</span>
                            <span>Qty: {suggestion.quantity}</span>
                            <span className="font-medium">
                              ${(parseFloat(suggestion.price) * suggestion.quantity).toFixed(2)}
                            </span>
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleAddSingle(suggestion)}
                          className="shrink-0"
                          data-testid={`button-add-suggestion-${index}`}
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </div>

        {result && result.suggestions.length > 0 && !result.needsClarification && (
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={handleClose} data-testid="button-ai-close">
              Close
            </Button>
            <Button
              onClick={handleAddAll}
              disabled={addToCartMutation.isPending}
              className="gap-2"
              data-testid="button-add-all-suggestions"
            >
              {addToCartMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Adding...
                </>
              ) : (
                <>
                  <ShoppingCart className="h-4 w-4" />
                  Add All to Cart
                </>
              )}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
