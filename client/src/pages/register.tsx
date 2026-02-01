import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Building2, User, Phone, Mail, Lock, MapPin, CheckCircle, AlertCircle, ArrowLeft, CalendarDays, Upload, FileText, X } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import wwgLogo from "@assets/wwg-logo_1769841225412.jpg";

type RegistrationStep = "email" | "existing-customer" | "new-customer";

interface CustomerCheckResult {
  found: boolean;
  active: boolean;
  customerId?: string;
  customerName?: string;
  companyName?: string;
}

const emailSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
});

const existingCustomerSchema = z.object({
  zohoCustomerId: z.string().min(1, "Customer ID is required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

const newCustomerSchema = z.object({
  businessName: z.string().min(2, "Business name is required"),
  contactName: z.string().min(2, "Contact name is required"),
  dateOfBirth: z.string().min(1, "Date of birth is required").refine((date) => {
    const birthDate = new Date(date);
    const today = new Date();
    const age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    const dayDiff = today.getDate() - birthDate.getDate();
    const actualAge = monthDiff < 0 || (monthDiff === 0 && dayDiff < 0) ? age - 1 : age;
    return actualAge >= 21;
  }, "You must be at least 21 years old to register"),
  phone: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zipCode: z.string().optional(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

export default function RegisterPage() {
  const [, navigate] = useLocation();
  const { register } = useAuth();
  const { toast } = useToast();
  const [step, setStep] = useState<RegistrationStep>("email");
  const [email, setEmail] = useState("");
  const [customerData, setCustomerData] = useState<CustomerCheckResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const emailForm = useForm<z.infer<typeof emailSchema>>({
    resolver: zodResolver(emailSchema),
    defaultValues: { email: "" },
  });

  const existingForm = useForm<z.infer<typeof existingCustomerSchema>>({
    resolver: zodResolver(existingCustomerSchema),
    defaultValues: { zohoCustomerId: "", password: "", confirmPassword: "" },
  });

  const [certificateFile, setCertificateFile] = useState<File | null>(null);
  const [isUploadingFile, setIsUploadingFile] = useState(false);

  const newForm = useForm<z.infer<typeof newCustomerSchema>>({
    resolver: zodResolver(newCustomerSchema),
    defaultValues: {
      businessName: "",
      contactName: "",
      dateOfBirth: "",
      phone: "",
      address: "",
      city: "",
      state: "",
      zipCode: "",
      password: "",
      confirmPassword: "",
    },
  });

  const checkEmail = async (data: z.infer<typeof emailSchema>) => {
    setIsLoading(true);
    try {
      const response = await apiRequest("POST", "/api/auth/check-customer", { email: data.email });
      const result = await response.json();
      
      setEmail(data.email);
      setCustomerData(result);
      
      if (result.found && result.active) {
        setStep("existing-customer");
      } else {
        setStep("new-customer");
      }
    } catch (error: any) {
      const errorData = error.message ? JSON.parse(error.message) : {};
      if (errorData.alreadyRegistered) {
        toast({
          variant: "destructive",
          title: "Email already registered",
          description: "Please sign in instead.",
        });
      } else {
        toast({
          variant: "destructive",
          title: "Error checking email",
          description: errorData.message || "Please try again",
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const registerExistingCustomer = async (data: z.infer<typeof existingCustomerSchema>) => {
    setIsLoading(true);
    try {
      const response = await apiRequest("POST", "/api/auth/register-existing", {
        email,
        password: data.password,
        zohoCustomerId: data.zohoCustomerId,
      });
      const result = await response.json();
      
      toast({
        title: "Registration successful!",
        description: "Your account has been verified and activated.",
      });
      navigate("/");
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Registration failed",
        description: error.message || "Customer ID does not match. Please check and try again.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const validTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/gif'];
      if (!validTypes.includes(file.type)) {
        toast({
          variant: "destructive",
          title: "Invalid file type",
          description: "Please upload a PDF, JPEG, PNG, or GIF file.",
        });
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        toast({
          variant: "destructive",
          title: "File too large",
          description: "File size must be less than 5MB.",
        });
        return;
      }
      setCertificateFile(file);
    }
  };

  const removeFile = () => {
    setCertificateFile(null);
  };

  const registerNewCustomer = async (data: z.infer<typeof newCustomerSchema>) => {
    setIsLoading(true);
    try {
      let certificateUrl = "";
      
      if (certificateFile) {
        setIsUploadingFile(true);
        const formData = new FormData();
        formData.append("file", certificateFile);
        
        const uploadResponse = await fetch("/api/upload/certificate", {
          method: "POST",
          body: formData,
        });
        
        if (!uploadResponse.ok) {
          throw new Error("Failed to upload certificate");
        }
        
        const uploadResult = await uploadResponse.json();
        certificateUrl = uploadResult.url;
        setIsUploadingFile(false);
      }

      await register({
        email,
        password: data.password,
        businessName: data.businessName,
        contactName: data.contactName,
        dateOfBirth: data.dateOfBirth,
        phone: data.phone,
        address: data.address,
        city: data.city,
        state: data.state,
        zipCode: data.zipCode,
        certificateUrl,
      });
      toast({
        title: "Registration submitted!",
        description: "Your application is pending approval. We'll notify you once approved.",
      });
      navigate("/");
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Registration failed",
        description: error.message || "Please try again",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const goBack = () => {
    setStep("email");
    setCustomerData(null);
    emailForm.reset();
    existingForm.reset();
    newForm.reset();
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-lg space-y-6">
        <div className="flex flex-col items-center space-y-2 text-center">
          <img src={wwgLogo} alt="Warner Wireless Gears" className="h-24 w-auto object-contain" />
          <p className="text-muted-foreground">B2B Distribution</p>
        </div>

        {step === "email" && (
          <Card className="border-border">
            <CardHeader className="space-y-1">
              <CardTitle className="text-2xl">Create an account</CardTitle>
              <CardDescription>
                Enter your email to get started
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...emailForm}>
                <form onSubmit={emailForm.handleSubmit(checkEmail)} className="space-y-4">
                  <FormField
                    control={emailForm.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center gap-2">
                          <Mail className="h-4 w-4 text-muted-foreground" />
                          Email Address
                        </FormLabel>
                        <FormControl>
                          <Input
                            type="email"
                            placeholder="you@business.com"
                            data-testid="input-email"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <Button
                    type="submit"
                    className="w-full"
                    disabled={isLoading}
                    data-testid="button-check-email"
                  >
                    {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Continue
                  </Button>
                </form>
              </Form>

              <div className="mt-6 text-center text-sm">
                <span className="text-muted-foreground">Already have an account? </span>
                <Link href="/login" className="text-primary hover:underline" data-testid="link-login">
                  Sign in
                </Link>
              </div>
            </CardContent>
          </Card>
        )}

        {step === "existing-customer" && customerData && (
          <Card className="border-border">
            <CardHeader className="space-y-1">
              <Button
                variant="ghost"
                size="sm"
                className="w-fit -ml-2 mb-2"
                onClick={goBack}
                data-testid="button-back"
              >
                <ArrowLeft className="h-4 w-4 mr-1" />
                Back
              </Button>
              <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                <CheckCircle className="h-5 w-5" />
                <span className="font-medium">Existing Customer Found!</span>
              </div>
              <CardTitle className="text-2xl">Welcome back, {customerData.companyName || customerData.customerName}</CardTitle>
              <CardDescription>
                Verify your customer ID to activate your account
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mb-4 p-3 bg-muted rounded-md">
                <p className="text-sm text-muted-foreground">Email: <span className="font-medium text-foreground">{email}</span></p>
              </div>

              <Form {...existingForm}>
                <form onSubmit={existingForm.handleSubmit(registerExistingCustomer)} className="space-y-4">
                  <FormField
                    control={existingForm.control}
                    name="zohoCustomerId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center gap-2">
                          <Building2 className="h-4 w-4 text-muted-foreground" />
                          Customer ID
                        </FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Your Zoho customer ID"
                            data-testid="input-customer-id"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                        <p className="text-xs text-muted-foreground">
                          This is the customer ID assigned to you. Check your invoices or contact support if unsure.
                        </p>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={existingForm.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center gap-2">
                          <Lock className="h-4 w-4 text-muted-foreground" />
                          Create Password
                        </FormLabel>
                        <FormControl>
                          <Input
                            type="password"
                            placeholder="Minimum 8 characters"
                            data-testid="input-password"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={existingForm.control}
                    name="confirmPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center gap-2">
                          <Lock className="h-4 w-4 text-muted-foreground" />
                          Confirm Password
                        </FormLabel>
                        <FormControl>
                          <Input
                            type="password"
                            placeholder="Confirm your password"
                            data-testid="input-confirm-password"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <Button
                    type="submit"
                    className="w-full"
                    disabled={isLoading}
                    data-testid="button-register-existing"
                  >
                    {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Activate Account
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>
        )}

        {step === "new-customer" && (
          <Card className="border-border">
            <CardHeader className="space-y-1">
              <Button
                variant="ghost"
                size="sm"
                className="w-fit -ml-2 mb-2"
                onClick={goBack}
                data-testid="button-back"
              >
                <ArrowLeft className="h-4 w-4 mr-1" />
                Back
              </Button>
              <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                <AlertCircle className="h-5 w-5" />
                <span className="font-medium">New Customer Application</span>
              </div>
              <CardTitle className="text-2xl">Apply for Wholesale Access</CardTitle>
              <CardDescription>
                Complete the form below. Your application will be reviewed by our team.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mb-4 p-3 bg-muted rounded-md">
                <p className="text-sm text-muted-foreground">Email: <span className="font-medium text-foreground">{email}</span></p>
              </div>

              <Form {...newForm}>
                <form onSubmit={newForm.handleSubmit(registerNewCustomer)} className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormField
                      control={newForm.control}
                      name="businessName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="flex items-center gap-2">
                            <Building2 className="h-4 w-4 text-muted-foreground" />
                            Business Name
                          </FormLabel>
                          <FormControl>
                            <Input
                              placeholder="Your Business LLC"
                              data-testid="input-business-name"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={newForm.control}
                      name="contactName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="flex items-center gap-2">
                            <User className="h-4 w-4 text-muted-foreground" />
                            Contact Name
                          </FormLabel>
                          <FormControl>
                            <Input
                              placeholder="John Smith"
                              data-testid="input-contact-name"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={newForm.control}
                    name="dateOfBirth"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center gap-2">
                          <CalendarDays className="h-4 w-4 text-muted-foreground" />
                          Date of Birth (Must be 21+)
                        </FormLabel>
                        <FormControl>
                          <Input
                            type="date"
                            max={new Date(new Date().setFullYear(new Date().getFullYear() - 21)).toISOString().split('T')[0]}
                            data-testid="input-date-of-birth"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={newForm.control}
                    name="phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center gap-2">
                          <Phone className="h-4 w-4 text-muted-foreground" />
                          Phone (Optional)
                        </FormLabel>
                        <FormControl>
                          <Input
                            type="tel"
                            placeholder="(555) 123-4567"
                            data-testid="input-phone"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={newForm.control}
                    name="address"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center gap-2">
                          <MapPin className="h-4 w-4 text-muted-foreground" />
                          Business Address (Optional)
                        </FormLabel>
                        <FormControl>
                          <Input
                            placeholder="123 Main Street"
                            data-testid="input-address"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid gap-4 sm:grid-cols-3">
                    <FormField
                      control={newForm.control}
                      name="city"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>City</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="City"
                              data-testid="input-city"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={newForm.control}
                      name="state"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>State</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="CA"
                              data-testid="input-state"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={newForm.control}
                      name="zipCode"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>ZIP Code</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="90210"
                              data-testid="input-zip"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="space-y-2">
                    <FormLabel className="flex items-center gap-2">
                      <Upload className="h-4 w-4 text-muted-foreground" />
                      Sales Tax Certificate / Business License (Optional)
                    </FormLabel>
                    <p className="text-xs text-muted-foreground">
                      Upload a copy of your Sales Tax Certificate or Business License for faster approval.
                    </p>
                    {!certificateFile ? (
                      <div className="border-2 border-dashed rounded-md p-4">
                        <label className="flex flex-col items-center cursor-pointer">
                          <FileText className="h-8 w-8 text-muted-foreground mb-2" />
                          <span className="text-sm text-muted-foreground mb-1">
                            Click to upload or drag and drop
                          </span>
                          <span className="text-xs text-muted-foreground">
                            PDF, JPEG, PNG, or GIF (max 5MB)
                          </span>
                          <input
                            type="file"
                            accept=".pdf,.jpg,.jpeg,.png,.gif"
                            onChange={handleFileChange}
                            className="hidden"
                            data-testid="input-certificate"
                          />
                        </label>
                      </div>
                    ) : (
                      <div className="border rounded-md p-3 flex items-center justify-between bg-muted/50">
                        <div className="flex items-center gap-2">
                          <FileText className="h-5 w-5 text-primary" />
                          <div>
                            <p className="text-sm font-medium truncate max-w-[200px]">{certificateFile.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {(certificateFile.size / 1024).toFixed(1)} KB
                            </p>
                          </div>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={removeFile}
                          data-testid="button-remove-certificate"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>

                  <FormField
                    control={newForm.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center gap-2">
                          <Lock className="h-4 w-4 text-muted-foreground" />
                          Password
                        </FormLabel>
                        <FormControl>
                          <Input
                            type="password"
                            placeholder="Minimum 8 characters"
                            data-testid="input-password"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={newForm.control}
                    name="confirmPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center gap-2">
                          <Lock className="h-4 w-4 text-muted-foreground" />
                          Confirm Password
                        </FormLabel>
                        <FormControl>
                          <Input
                            type="password"
                            placeholder="Confirm your password"
                            data-testid="input-confirm-password"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <Button
                    type="submit"
                    className="w-full"
                    disabled={isLoading}
                    data-testid="button-register-new"
                  >
                    {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Submit Application
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>
        )}

        <p className="text-center text-xs text-muted-foreground">
          By registering, you agree to our Terms of Service and Privacy Policy.
          {step === "new-customer" && " Your account will be reviewed before activation."}
        </p>
      </div>
    </div>
  );
}
