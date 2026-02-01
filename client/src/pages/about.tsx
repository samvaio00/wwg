import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, Users, Truck, Shield } from "lucide-react";

export default function AboutPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight" data-testid="text-page-title">
          About Us
        </h1>
        <p className="text-muted-foreground">
          Your trusted wholesale partner for quality merchandise
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Who We Are
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p>
            Warner Wireless Gears is a leading wholesale distributor serving retailers across the United States. 
            We specialize in providing high-quality merchandise for gas stations, convenience stores, smoke shops, 
            gift shops, and other retail establishments.
          </p>
          <p>
            With years of experience in the wholesale industry, we understand the unique needs of our retail 
            partners. Our commitment to quality products, competitive pricing, and exceptional customer service 
            has made us a preferred supplier for businesses of all sizes.
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Our Mission
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p>
              To empower retailers with access to premium wholesale merchandise at competitive prices, 
              enabling them to grow their businesses and better serve their customers.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Truck className="h-5 w-5" />
              Fast Shipping
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p>
              We pride ourselves on fast order processing and reliable shipping. Most orders ship within 
              1-2 business days, with real-time tracking provided for all shipments.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Our Product Categories
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-2 md:grid-cols-2 list-disc list-inside">
            <li>Sunglasses &amp; Eyewear</li>
            <li>Cellular Accessories</li>
            <li>Caps &amp; Headwear</li>
            <li>Perfumes &amp; Fragrances</li>
            <li>Novelty Items</li>
            <li>Convenience Store Supplies</li>
            <li>Gift Shop Merchandise</li>
            <li>Seasonal Products</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
