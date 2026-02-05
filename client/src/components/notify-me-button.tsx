import { useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Bell, BellOff, Loader2 } from "lucide-react";

interface NotifyMeButtonProps {
  productId: string;
  size?: "sm" | "default";
  className?: string;
  showLabel?: boolean;
}

export function NotifyMeButton({ 
  productId, 
  size = "sm", 
  className = "",
  showLabel = true 
}: NotifyMeButtonProps) {
  const { toast } = useToast();
  const [isOptimistic, setIsOptimistic] = useState<boolean | null>(null);

  const { data: notificationStatus, isLoading } = useQuery<{ subscribed: boolean }>({
    queryKey: ["/api/stock-notifications", productId],
    staleTime: 30000,
  });

  const subscribed = isOptimistic !== null ? isOptimistic : notificationStatus?.subscribed;

  const subscribeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/stock-notifications/${productId}`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Failed to subscribe");
      }
      return res.json();
    },
    onMutate: () => {
      setIsOptimistic(true);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/stock-notifications", productId] });
      queryClient.invalidateQueries({ queryKey: ["/api/stock-notifications"] });
      toast({
        title: "Notification Set",
        description: data.message || "You'll be notified when this item is back in stock.",
      });
    },
    onError: (error: Error) => {
      setIsOptimistic(null);
      toast({
        title: "Error",
        description: error.message || "Failed to subscribe to notifications.",
        variant: "destructive",
      });
    },
    onSettled: () => {
      setIsOptimistic(null);
    },
  });

  const unsubscribeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("DELETE", `/api/stock-notifications/${productId}`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Failed to unsubscribe");
      }
      return res.json();
    },
    onMutate: () => {
      setIsOptimistic(false);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/stock-notifications", productId] });
      queryClient.invalidateQueries({ queryKey: ["/api/stock-notifications"] });
      toast({
        title: "Notification Removed",
        description: "You will no longer be notified about this item.",
      });
    },
    onError: (error: Error) => {
      setIsOptimistic(null);
      toast({
        title: "Error",
        description: error.message || "Failed to remove notification.",
        variant: "destructive",
      });
    },
    onSettled: () => {
      setIsOptimistic(null);
    },
  });

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (subscribed) {
      unsubscribeMutation.mutate();
    } else {
      subscribeMutation.mutate();
    }
  };

  const isPending = subscribeMutation.isPending || unsubscribeMutation.isPending;

  return (
    <Button
      size={size}
      variant={subscribed ? "secondary" : "outline"}
      className={`${className} ${subscribed ? "bg-amber-100 hover:bg-amber-200 dark:bg-amber-900/30 dark:hover:bg-amber-900/50 text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-700" : ""}`}
      onClick={handleClick}
      disabled={isPending || isLoading}
      data-testid={`button-notify-me-${productId}`}
    >
      {isPending || isLoading ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : subscribed ? (
        <>
          <BellOff className="h-3 w-3" />
          {showLabel && <span className="ml-1">Notified</span>}
        </>
      ) : (
        <>
          <Bell className="h-3 w-3" />
          {showLabel && <span className="ml-1">Notify Me</span>}
        </>
      )}
    </Button>
  );
}
