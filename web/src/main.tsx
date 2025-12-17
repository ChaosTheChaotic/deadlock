import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { HomePage } from "./pages/index";
import { trpc, trpcClient, qc } from "./servs/client.ts";
import { QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "./contexts/auth.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <trpc.Provider client={trpcClient} queryClient={qc}>
      <QueryClientProvider client={qc}>
	<AuthProvider>
	  <HomePage />
	</AuthProvider>
      </QueryClientProvider>
    </trpc.Provider>
  </StrictMode>,
);
