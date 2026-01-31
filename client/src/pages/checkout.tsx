import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle, CardFooter, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { 
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { 
  ShoppingCart, 
  Package,
  MapPin,
  ArrowLeft,
  CheckCircle2,
  Loader2
} from "lucide-react";
import type { Cart, CartItem, Product } from "@shared/schema";

type CartItemWithProduct = CartItem & { product: Product };

const checkoutSchema = z.object({
  shippingAddress: z.string().min(1, "Address is required"),
  shippingCity: z.string().min(1, "City is required"),
  shippingState: z.string().min(1, "State is required"),
  shippingZipCode: z.string().min(5, "Valid ZIP code is required"),
});

type CheckoutFormData = z.infer<typeof checkoutSchema>;

function OrderItemSummary({ item }: { item: CartItemWithProduct }) {
  return (
    <div className="flex gap-3 py-2 border-b last:border-b-0">
      <div className="w-12 h-12 bg-muted rounded overflow-hidden flex-shrink-0">
        {item.product.imageUrl ? (
          <img 
            src={item.product.imageUrl} 
            alt={item.product.name}
            className="object-cover w-full h-full"
          />
        ) : (
          <div className="flex items-center justify-center h-full">
            <Package className="h-4 w-4 text-muted-foreground" />
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{item.product.name}</p>
        <p className="text-xs text-muted-foreground">Qty: {item.quantity}</p>
      </div>
      <span className="text-sm font-medium">${item.lineTotal}</span>
    </div>
  );
}

export default function CheckoutPage() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const [orderPlaced, setOrderPlaced] = useState(false);
  const [orderId, setOrderId] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery<{ cart: Cart; items: CartItemWithProduct[] }>({
    queryKey: ["/api/cart"],
  });

  const form = useForm<CheckoutFormData>({
    resolver: zodResolver(checkoutSchema),
    defaultValues: {
      shippingAddress: user?.address || "",
      shippingCity: user?.city || "",
      shippingState: user?.state || "",
      shippingZipCode: user?.zipCode || "",
    },
  });

  const placeOrderMutation = useMutation({
    mutationFn: async (data: CheckoutFormData) => {
      const res = await apiRequest("POST", "/api/orders", data);
      return res.json() as Promise<{ order: { id: string; orderNumber: string } }>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      setOrderId(data.order.id);
      setOrderPlaced(true);
      toast({
        title: "Order placed successfully!",
        description: `Your order #${data.order.orderNumber} is pending approval.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to place order",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: CheckoutFormData) => {
    placeOrderMutation.mutate(data);
  };

  const cart = data?.cart;
  const items = data?.items || [];

  if (orderPlaced && orderId) {
    return (
      <div className="max-w-2xl mx-auto">
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <div className="w-20 h-20 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center mb-6">
              <CheckCircle2 className="h-10 w-10 text-green-600 dark:text-green-400" />
            </div>
            <h2 className="text-2xl font-bold mb-2" data-testid="text-order-success">Order Placed Successfully!</h2>
            <p className="text-muted-foreground text-center mb-6">
              Your order has been submitted and is pending approval. 
              You will receive a notification once it's approved.
            </p>
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => navigate("/orders")} data-testid="button-view-orders">
                View My Orders
              </Button>
              <Button onClick={() => navigate("/products")} data-testid="button-continue-shopping">
                Continue Shopping
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto">
        <Skeleton className="h-8 w-48 mb-6" />
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-96" />
          <Skeleton className="h-96" />
        </div>
      </div>
    );
  }

  if (error || items.length === 0) {
    return (
      <div className="max-w-2xl mx-auto">
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <ShoppingCart className="h-16 w-16 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Your cart is empty</h3>
            <p className="text-muted-foreground text-center mb-4">
              Add some products before checking out.
            </p>
            <Button onClick={() => navigate("/products")}>
              Browse Products
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/cart")} data-testid="button-back-to-cart">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight" data-testid="text-page-title">Checkout</h1>
          <p className="text-muted-foreground">Complete your order</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="h-5 w-5" />
                Shipping Address
              </CardTitle>
              <CardDescription>
                Where should we deliver your order?
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="shippingAddress"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Street Address</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="123 Main Street" 
                            data-testid="input-shipping-address"
                            {...field} 
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid gap-4 sm:grid-cols-3">
                    <FormField
                      control={form.control}
                      name="shippingCity"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>City</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="City" 
                              data-testid="input-shipping-city"
                              {...field} 
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="shippingState"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>State</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="CA" 
                              data-testid="input-shipping-state"
                              {...field} 
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="shippingZipCode"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>ZIP Code</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="90210" 
                              data-testid="input-shipping-zip"
                              {...field} 
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <Button 
                    type="submit" 
                    className="w-full" 
                    size="lg"
                    disabled={placeOrderMutation.isPending}
                    data-testid="button-place-order"
                  >
                    {placeOrderMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      "Place Order"
                    )}
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>
        </div>

        <div>
          <Card>
            <CardHeader>
              <CardTitle>Order Summary</CardTitle>
              <CardDescription>
                {items.length} item{items.length !== 1 ? "s" : ""} in your order
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="max-h-64 overflow-auto">
                {items.map((item) => (
                  <OrderItemSummary key={item.id} item={item} />
                ))}
              </div>

              <div className="border-t pt-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>${cart?.subtotal || "0.00"}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Shipping</span>
                  <span>$0.00</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Tax</span>
                  <span>$0.00</span>
                </div>
                <div className="border-t pt-2">
                  <div className="flex justify-between font-bold text-lg">
                    <span>Total</span>
                    <span data-testid="text-checkout-total">${cart?.subtotal || "0.00"}</span>
                  </div>
                </div>
              </div>
            </CardContent>
            <CardFooter className="bg-muted/50 border-t">
              <p className="text-xs text-muted-foreground">
                By placing your order, you agree to our terms and conditions. 
                Orders require admin approval before processing.
              </p>
            </CardFooter>
          </Card>
        </div>
      </div>
    </div>
  );
}
