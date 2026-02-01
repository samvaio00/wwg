import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RotateCcw, Clock, Package, AlertCircle } from "lucide-react";

export default function ReturnPolicyPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight" data-testid="text-page-title">
          Return Policy
        </h1>
        <p className="text-muted-foreground">
          Our commitment to your satisfaction
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RotateCcw className="h-5 w-5" />
            Return Guidelines
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p>
            At Warner Wireless Gears, we strive to ensure complete customer satisfaction with every order. 
            If you are not satisfied with your purchase, we offer a straightforward return process.
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Return Window
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p>
              Returns must be initiated within <strong>30 days</strong> of receiving your order.
            </p>
            <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
              <li>No Return Authorization (RA) number required</li>
              <li>Original invoice or packing slip is not required</li>
              <li>Contact us to arrange your return</li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Condition Requirements
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p>
              Items must be returned in their <strong>original condition</strong>.
            </p>
            <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
              <li>Products must be unused and in original packaging</li>
              <li>All tags and labels must be attached</li>
              <li>Items must be free from damage, stains, or odors</li>
            </ul>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5" />
            Non-Returnable Items
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-3">The following items cannot be returned:</p>
          <ul className="list-disc list-inside space-y-1 text-muted-foreground">
            <li>Vape products and accessories</li>
            <li>Kratom products</li>
            <li>THC/CBD products</li>
            <li>Candies and edible items</li>
            <li>Medicine and health supplements</li>
            <li>Clearance or final sale items</li>
            <li>Products showing signs of use or damage</li>
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <div className="bg-muted/50 rounded-lg p-4">
            <h3 className="font-semibold mb-2">Need to Return an Item?</h3>
            <p className="text-sm text-muted-foreground">
              Please contact our customer service team to initiate a return. Have your order number ready 
              for faster processing. We typically respond within 1 business day.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
