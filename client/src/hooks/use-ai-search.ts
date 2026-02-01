import { useState, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Product } from "@shared/schema";

interface AISearchResult {
  products: Array<{
    id: string;
    sku: string;
    name: string;
    category: string;
    brand: string | null;
    basePrice: string;
    description: string | null;
    tags: string[] | null;
    imageUrl: string | null;
    similarity?: number;
  }>;
  searchType: "semantic" | "keyword" | "hybrid";
  processingTime: number;
  totalResults: number;
}

interface UseAISearchOptions {
  category?: string;
  enabled?: boolean;
  debounceMs?: number;
  minQueryLength?: number;
}

export function useAISearch(
  query: string,
  options: UseAISearchOptions = {}
) {
  const {
    category,
    enabled = true,
    debounceMs = 400,
    minQueryLength = 2,
  } = options;

  const [debouncedQuery, setDebouncedQuery] = useState(query);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
    }, debounceMs);

    return () => clearTimeout(timer);
  }, [query, debounceMs]);

  const shouldSearch = enabled && debouncedQuery.trim().length >= minQueryLength;

  const { data, isLoading, error, isFetching } = useQuery<AISearchResult>({
    queryKey: ["/api/ai/search", debouncedQuery, category],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("query", debouncedQuery.trim());
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
    results: data?.products || [],
    searchType: data?.searchType,
    processingTime: data?.processingTime,
    totalResults: data?.totalResults || 0,
    isSearching: isLoading || isFetching,
    error,
    isAISearchActive: shouldSearch,
    debouncedQuery,
  };
}
