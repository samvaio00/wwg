import { QueryClient, QueryFunction } from "@tanstack/react-query";

const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;

function isNetworkError(error: unknown): boolean {
  return error instanceof TypeError && error.message.includes('fetch');
}

function isRetryableError(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

async function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function parseErrorMessage(res: Response): Promise<string> {
  try {
    const data = await res.json();
    if (data.message) return data.message;
    if (data.error) return data.error;
  } catch {
    const text = await res.text().catch(() => '');
    if (text) return text;
  }
  
  switch (res.status) {
    case 400: return "Invalid request. Please check your input.";
    case 401: return "Please sign in to continue.";
    case 403: return "You don't have permission to do this.";
    case 404: return "The requested resource was not found.";
    case 429: return "Too many requests. Please wait a moment.";
    case 500: return "Server error. Please try again later.";
    default: return res.statusText || "An unexpected error occurred.";
  }
}

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retries = MAX_RETRIES
): Promise<Response> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        ...options,
        credentials: "include",
      });
      
      if (res.ok || res.status === 401 || res.status === 403 || res.status === 400) {
        return res;
      }
      
      if (isRetryableError(res.status) && attempt < retries) {
        await delay(RETRY_DELAY * Math.pow(2, attempt));
        continue;
      }
      
      return res;
    } catch (error) {
      lastError = error as Error;
      
      if (isNetworkError(error) && attempt < retries) {
        await delay(RETRY_DELAY * Math.pow(2, attempt));
        continue;
      }
      
      throw error;
    }
  }
  
  throw lastError || new Error("Request failed after retries");
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const res = await fetchWithRetry(url, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
  });

  if (!res.ok) {
    const message = await parseErrorMessage(res);
    const error = new Error(message) as Error & { status?: number };
    error.status = res.status;
    throw error;
  }
  
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";

export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const url = queryKey.join("/");
    
    const res = await fetchWithRetry(url, {
      method: "GET",
    });

    if (res.status === 401) {
      if (unauthorizedBehavior === "returnNull") {
        return null;
      }
      throw new Error("Please sign in to continue.");
    }

    if (!res.ok) {
      const message = await parseErrorMessage(res);
      throw new Error(message);
    }
    
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: 30000,
      retry: (failureCount, error) => {
        if (error instanceof Error && 'status' in error) {
          const status = (error as Error & { status?: number }).status;
          if (status === 401 || status === 403 || status === 400) {
            return false;
          }
        }
        return failureCount < 2;
      },
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    },
    mutations: {
      retry: (failureCount, error) => {
        if (error instanceof Error && 'status' in error) {
          const status = (error as Error & { status?: number }).status;
          if (status === 401 || status === 403 || status === 400) {
            return false;
          }
        }
        return failureCount < 1;
      },
    },
  },
});
