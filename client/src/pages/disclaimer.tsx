import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileWarning, Scale, ShieldAlert, UserCheck, Truck } from "lucide-react";

export default function DisclaimerPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight" data-testid="text-page-title">
          Disclaimer
        </h1>
        <p className="text-muted-foreground">
          Important legal information
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileWarning className="h-5 w-5" />
            General Disclaimer
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p>
            The information provided on this website is for general informational purposes only. 
            Warner Wireless Gears makes every effort to ensure the accuracy of product descriptions, 
            pricing, and availability information, but does not guarantee that all information is 
            complete, accurate, or current.
          </p>
          <p>
            Product images are for illustrative purposes only and may not exactly represent the actual 
            product. Colors, sizes, and other attributes may vary slightly from what is displayed.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserCheck className="h-5 w-5" />
            Age Requirement
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p>
            <strong>You must be at least 21 years of age</strong> to access and use this website. 
            By using this site, you confirm that you meet this age requirement.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5" />
            Regulated Products Shipping Policy
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p>
            <strong>Vape, THC/CBD, and Kratom products</strong> are subject to special shipping restrictions:
          </p>
          <ul className="list-disc list-inside space-y-2 text-muted-foreground">
            <li>These products will only be shipped to states where they are legal to sell from Texas</li>
            <li>Customers must provide appropriate licenses to purchase these products</li>
            <li>
              <strong>PACT Act Compliance:</strong> These products will only be shipped to the address 
              listed on the customer's business license. No exceptions will be made for alternate 
              shipping addresses.
            </li>
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Scale className="h-5 w-5" />
            Wholesale Terms
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p>
            This website is intended for registered wholesale customers only. By creating an account 
            and placing orders, you confirm that you are a legitimate business entity authorized to 
            purchase wholesale merchandise for resale purposes.
          </p>
          <p>
            Pricing displayed on this site is for wholesale customers only and may not reflect retail 
            pricing. Prices are subject to change without notice. All orders are subject to acceptance 
            by Warner Wireless Gears.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5" />
            Limitation of Liability
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p>
            Warner Wireless Gears shall not be liable for any indirect, incidental, special, 
            consequential, or punitive damages arising from your use of this website or purchase of 
            products. Our maximum liability shall not exceed the purchase price of the products in question.
          </p>
          <p>
            We do not warrant that the website will be available at all times or that it will be free 
            from errors or viruses. Use of this website is at your own risk.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <div className="bg-muted/50 rounded-lg p-4">
            <h3 className="font-semibold mb-2">Questions?</h3>
            <p className="text-sm text-muted-foreground">
              If you have any questions about these terms or our policies, please contact our 
              customer service team. We are here to help clarify any concerns.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
