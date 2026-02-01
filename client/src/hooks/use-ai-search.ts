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

  // Only search when a query has been submitted (via Enter key)
  const shouldSearch = enabled && submittedQuery.trim().length >= minQueryLength;

  const { data, isLoading, error, isFetching } = useQuery<AISearchResult>({
    queryKey: ["/api/ai/search", submittedQuery, category],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("query", submittedQuery.trim());
      if (category && category !== "all") {
        params.set("category", category);
      }
      
      const res = await fetch(`/api/ai/search?${params.toString()}`, {
        credentials: "include",
      });
      
      if (!res.ok) {
        throw new Error("AI search failed");
      }
      
      return res.json();
    },
    enabled: shouldSearch,
    staleTime: 30000,
    gcTime: 60000,
  });

  return {
    results: (data?.products || []) as Product[],
    searchType: data?.searchType,
    processingTime: data?.processingTime,
    totalResults: data?.totalResults || 0,
    isSearching: isLoading || isFetching,
    error,
    isAISearchActive: shouldSearch,
    submittedQuery,
  };
}
