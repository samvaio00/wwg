import { useQuery } from "@tanstack/react-query";
import type { Product } from "@shared/schema";

interface AISearchResult {
  products: Product[];
  searchType: "semantic" | "keyword" | "hybrid";
  processingTime: number;
  totalResults: number;
}

interface UseAISearchOptions {
  category?: string;
  enabled?: boolean;
  minQueryLength?: number;
}

export function useAISearch(
  submittedQuery: string,
  options: UseAISearchOptions = {}
) {
  const {
    category,
    enabled = true,
    minQueryLength = 2,
  } = options;

  const shouldSearch = enabled && submittedQuery.trim().length >= minQueryLength;

  const { data, isLoading, error, isFetching } = useQuery<AISearchResult>({
    queryKey: ["/api/ai/search", submittedQuery, category],
    queryFn: async () => {
      try {
        const params = new URLSearchParams();
        params.set("query", submittedQuery.trim());
        if (category && category !== "all") {
          params.set("category", category);
        }
        
        const res = await fetch(`/api/ai/search?${params.toString()}`, {
          credentials: "include",
        });
        
        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}));
          throw new Error(errorData.message || "AI search temporarily unavailable");
        }
        
        const result = await res.json();
        
        if (!result || typeof result !== 'object') {
          return { products: [], searchType: "keyword" as const, processingTime: 0, totalResults: 0 };
        }
        
        return {
          products: Array.isArray(result.products) ? result.products : [],
          searchType: result.searchType || "keyword",
          processingTime: result.processingTime || 0,
          totalResults: result.totalResults || 0,
        };
      } catch (err) {
        console.error("AI search error:", err);
        throw err;
      }
    },
    enabled: shouldSearch,
    staleTime: 30000,
    gcTime: 60000,
    retry: 1,
    retryDelay: 500,
  });

  const safeProducts = Array.isArray(data?.products) ? data.products : [];

  return {
    results: safeProducts as Product[],
    searchType: data?.searchType,
    processingTime: data?.processingTime,
    totalResults: data?.totalResults || 0,
    isSearching: isLoading || isFetching,
    error,
    isAISearchActive: shouldSearch,
    submittedQuery,
  };
}
