import { createTRPCReact } from '@trpc/react-query';
import { httpBatchLink } from '@trpc/client';
import type { AppRouter } from '@serv/trpc';
import { QueryClient } from '@tanstack/react-query';

export const trpc = createTRPCReact<AppRouter>();
export const qc = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: false,
    },
  },
});

export const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: '/trpc',
      headers() {
        return {};
      },
      fetch(url, options) {
        return fetch(url, {
          ...options,
          credentials: 'include', // Important: send cookies
        });
      },
    }),
  ],
});
