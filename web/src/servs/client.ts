import { createTRPCClient, createTRPCReact, httpBatchLink } from "@trpc/react-query";
import type { appRouter } from '../../../serv/src/trpc';
import { QueryClient } from "@tanstack/react-query";

export const trpc = createTRPCReact<appRouter>();

export const trpcClient = createTRPCClient<appRouter>({
  links: [
    httpBatchLink({
      url: "/trpc",
    })
  ]
})

export const qc = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
    }
  }
})
