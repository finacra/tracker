import { QueryClient } from '@tanstack/react-query'

// Create a client with optimized defaults for your use case
export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // With 60 users, staleTime prevents unnecessary refetches
        staleTime: 5 * 60 * 1000, // 5 minutes - data is fresh for 5 min
        gcTime: 10 * 60 * 1000, // 10 minutes (formerly cacheTime)
        retry: 1, // Only retry once on failure
        refetchOnWindowFocus: false, // Don't refetch on window focus (reduces load)
        refetchOnReconnect: true, // Refetch when network reconnects
        refetchOnMount: false, // Don't refetch on mount if data is fresh
      },
      mutations: {
        retry: 0, // Don't retry mutations
      },
    },
  })
}

// Singleton pattern for SSR compatibility
let browserQueryClient: QueryClient | undefined = undefined

export function getQueryClient() {
  if (typeof window === 'undefined') {
    // Server: always make a new query client
    return makeQueryClient()
  } else {
    // Browser: use singleton pattern to keep the same query client
    if (!browserQueryClient) browserQueryClient = makeQueryClient()
    return browserQueryClient
  }
}
