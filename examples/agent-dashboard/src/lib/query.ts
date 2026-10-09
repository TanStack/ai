import { QueryClient } from '@tanstack/react-query'

let client: QueryClient | undefined

export function getQueryClient(): QueryClient {
  client ??= new QueryClient({
    defaultOptions: {
      queries: { staleTime: 2000, refetchOnWindowFocus: false },
    },
  })
  return client
}
