import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
<<<<<<< Updated upstream
import { HomePage } from "./pages/index";
=======
import {
  HomePage,
  AdminDashboard,
  UserManagement,
  SettingsPage,
  FrontEndQuestions,
} from "./pages/index";
>>>>>>> Stashed changes
import { trpc, trpcClient, qc } from "@servs/client.ts";
import { QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@contexts/index";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <trpc.Provider client={trpcClient} queryClient={qc}>
      <QueryClientProvider client={qc}>
        <AuthProvider>
<<<<<<< Updated upstream
          <HomePage />
=======
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/admin" element={<AdminDashboard />} />
              <Route path="/users" element={<UserManagement />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/frontendtest" element={<FrontEndQuestions />} />
              <Route path="*" element={<Navigate to="/" />} />
            </Routes>
          </BrowserRouter>
>>>>>>> Stashed changes
        </AuthProvider>
      </QueryClientProvider>
    </trpc.Provider>
  </StrictMode>,
);
