import {
  createTRPCClient,
  createTRPCReact,
  httpBatchLink,
  TRPCClientError,
} from "@trpc/react-query";
import type { AppRouter } from "@serv/trpc";
import { QueryClient } from "@tanstack/react-query";
import { AuthService } from "./auth";

export const trpc = createTRPCReact<AppRouter>();

export const trpcClient = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: "/trpc",
      headers() {
        const access_tkn = AuthService.getAccessToken();
        return {
          ...(access_tkn && { Authorization: access_tkn }),
        };
      },
    }),
  ],
});

export const qc = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: (failureCount, error: unknown) => {
        // Don't retry on 401 errors
        if (
          error instanceof TRPCClientError &&
          error?.data?.code === "UNAUTHORIZED"
        ) {
          return false;
        }
        return failureCount < 3;
      },
    },
  },
});
