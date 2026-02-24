import { createTRPCReact } from "@trpc/react-query";
import { httpBatchLink, httpSubscriptionLink, splitLink } from "@trpc/client";
import type { AppRouter } from "@serv/trpc";
import { QueryClient } from "@tanstack/react-query";

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
    splitLink({
      condition(op) {
        return op.type === "subscription"
      },
      true: httpSubscriptionLink({
        url: "/trpc",
        eventSourceOptions: {
          withCredentials: true,
        },
      }),
      false: httpBatchLink({
        url: "/trpc",
        headers() {
          return {};
        },
        fetch(url, options) {
          return fetch(url, {
            ...options,
            credentials: "include",
          });
        },
      }),
    }),
  ],
});
