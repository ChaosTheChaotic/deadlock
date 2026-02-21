import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import "./index.css";
import { HomePage, AdminDashboard, UserManagement } from "./pages/index";
import { trpc, trpcClient, qc } from "@servs/client.ts";
import { QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@contexts/index";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <trpc.Provider client={trpcClient} queryClient={qc}>
      <QueryClientProvider client={qc}>
        <AuthProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/admin" element={<AdminDashboard />} />
              <Route path="/users" element={<UserManagement />} />
              <Route path="*" element={<Navigate to="/" />} />
            </Routes>
          </BrowserRouter>
        </AuthProvider>
      </QueryClientProvider>
    </trpc.Provider>
  </StrictMode>,
);
