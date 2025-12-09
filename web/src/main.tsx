import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { HomePage } from "./pages/pages.ts";
import { trpc, trpcClient, qc } from "./servs/client.ts";
import { QueryClientProvider } from "@tanstack/react-query";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <trpc.Provider client={trpcClient} queryClient={qc}>
      <QueryClientProvider client={qc}>
        <HomePage />
      </QueryClientProvider>
    </trpc.Provider>
  </StrictMode>,
);
