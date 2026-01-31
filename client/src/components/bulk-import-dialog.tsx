import { useState, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Upload, FileSpreadsheet, Download, CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

type BulkImportResult = {
  message: string;
  results: {
    success: { sku: string; quantity: number; productName: string }[];
    failed: { sku: string; quantity: number; reason: string }[];
  };
};

function parseCSV(text: string): { sku: string; quantity: number }[] {
  const lines = text.trim().split('\n');
  const items: { sku: string; quantity: number }[] = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    const isHeader = i === 0 && (
      line.toLowerCase().includes('sku') || 
      line.toLowerCase().includes('quantity') ||
      line.toLowerCase().includes('qty')
    );
    if (isHeader) continue;
    
    const parts = line.split(/[,\t;]/).map(p => p.trim().replace(/^["']|["']$/g, ''));
    if (parts.length >= 2) {
      const sku = parts[0];
      const quantity = parseInt(parts[1], 10);
      if (sku && !isNaN(quantity) && quantity > 0) {
        items.push({ sku, quantity });
      }
    }
  }
  
  return items;
}

export function BulkImportDialog() {
  const [open, setOpen] = useState(false);
  const [csvText, setCsvText] = useState("");
  const [parsePreview, setParsePreview] = useState<{ sku: string; quantity: number }[]>([]);
  const [importResult, setImportResult] = useState<BulkImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const importMutation = useMutation({
    mutationFn: async (items: { sku: string; quantity: number }[]) => {
      const response = await apiRequest("POST", "/api/cart/bulk-import", { items });
      return response.json() as Promise<BulkImportResult>;
    },
    onSuccess: (data) => {
      setImportResult(data);
      queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
      
      if (data.results.failed.length === 0) {
        toast({
          title: "Import Successful",
          description: `Added ${data.results.success.length} items to your cart`,
        });
      } else {
        toast({
          title: "Import Completed with Issues",
          description: `${data.results.success.length} added, ${data.results.failed.length} failed`,
          variant: "destructive",
        });
      }
    },
    onError: (error) => {
      toast({
        title: "Import Failed",
        description: error instanceof Error ? error.message : "Failed to import items",
        variant: "destructive",
      });
    },
  });

  const handleTextChange = (text: string) => {
    setCsvText(text);
    const items = parseCSV(text);
    setParsePreview(items);
    setImportResult(null);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      handleTextChange(text);
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleImport = () => {
    if (parsePreview.length === 0) {
      toast({
        title: "No Items",
        description: "Please add valid SKU and quantity data",
        variant: "destructive",
      });
      return;
    }
    importMutation.mutate(parsePreview);
  };

  const handleClose = () => {
    setOpen(false);
    setCsvText("");
    setParsePreview([]);
    setImportResult(null);
  };

  const downloadTemplate = () => {
    const template = "SKU,Quantity\nEXAMPLE-001,10\nEXAMPLE-002,5\nEXAMPLE-003,20";
    const blob = new Blob([template], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'order_template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => isOpen ? setOpen(true) : handleClose()}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" data-testid="button-bulk-import">
          <Upload className="h-4 w-4 mr-2" />
          Bulk Import
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            Bulk Order Import
          </DialogTitle>
          <DialogDescription>
            Upload a CSV file or paste SKU and quantity data to quickly add items to your cart.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4">
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => fileInputRef.current?.click()}
              data-testid="button-upload-csv"
            >
              <Upload className="h-4 w-4 mr-2" />
              Upload CSV
            </Button>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={downloadTemplate}
              data-testid="button-download-template"
            >
              <Download className="h-4 w-4 mr-2" />
              Download Template
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.txt"
              onChange={handleFileUpload}
              className="hidden"
            />
          </div>

          <div>
            <label className="text-sm font-medium mb-2 block">
              CSV Data (SKU, Quantity - one per line)
            </label>
            <Textarea
              value={csvText}
              onChange={(e) => handleTextChange(e.target.value)}
              placeholder={"SKU,Quantity\nSUNG-001,10\nPHONE-CASE-BLK,5\nCAP-SNAP-RED,20"}
              className="font-mono text-sm min-h-[120px]"
              data-testid="input-csv-data"
            />
          </div>

          {parsePreview.length > 0 && !importResult && (
            <div className="border rounded-md p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Preview ({parsePreview.length} items)</span>
                <Badge variant="secondary">{parsePreview.reduce((s, i) => s + i.quantity, 0)} total units</Badge>
              </div>
              <div className="max-h-[150px] overflow-y-auto space-y-1">
                {parsePreview.slice(0, 20).map((item, i) => (
                  <div key={i} className="text-sm flex justify-between text-muted-foreground">
                    <span className="font-mono">{item.sku}</span>
                    <span>x{item.quantity}</span>
                  </div>
                ))}
                {parsePreview.length > 20 && (
                  <div className="text-sm text-muted-foreground">
                    ... and {parsePreview.length - 20} more items
                  </div>
                )}
              </div>
            </div>
          )}

          {importResult && (
            <div className="space-y-3">
              {importResult.results.success.length > 0 && (
                <div className="border border-green-200 dark:border-green-900 bg-green-50 dark:bg-green-950/30 rounded-md p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <span className="text-sm font-medium text-green-700 dark:text-green-400">
                      Successfully Added ({importResult.results.success.length})
                    </span>
                  </div>
                  <div className="max-h-[100px] overflow-y-auto space-y-1">
                    {importResult.results.success.map((item, i) => (
                      <div key={i} className="text-sm text-green-700 dark:text-green-400 flex justify-between">
                        <span>{item.productName}</span>
                        <span>x{item.quantity}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {importResult.results.failed.length > 0 && (
                <div className="border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 rounded-md p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <XCircle className="h-4 w-4 text-red-600" />
                    <span className="text-sm font-medium text-red-700 dark:text-red-400">
                      Failed ({importResult.results.failed.length})
                    </span>
                  </div>
                  <div className="max-h-[100px] overflow-y-auto space-y-1">
                    {importResult.results.failed.map((item, i) => (
                      <div key={i} className="text-sm text-red-700 dark:text-red-400 flex justify-between gap-4">
                        <span className="font-mono">{item.sku}</span>
                        <span className="text-right">{item.reason}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="bg-muted/50 rounded-md p-3 text-sm text-muted-foreground">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium mb-1">CSV Format Tips:</p>
                <ul className="list-disc list-inside space-y-0.5">
                  <li>First column: Product SKU</li>
                  <li>Second column: Quantity</li>
                  <li>Use comma, tab, or semicolon as separator</li>
                  <li>Header row is optional (will be auto-detected)</li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={handleClose} data-testid="button-cancel-import">
            {importResult ? "Close" : "Cancel"}
          </Button>
          {!importResult && (
            <Button 
              onClick={handleImport} 
              disabled={parsePreview.length === 0 || importMutation.isPending}
              data-testid="button-confirm-import"
            >
              {importMutation.isPending ? "Importing..." : `Import ${parsePreview.length} Items`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
