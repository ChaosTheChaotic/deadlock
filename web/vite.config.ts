import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react({
      babel: {
        plugins: [["babel-plugin-react-compiler"]],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@serv": path.resolve(__dirname, "../serv/src"),
      "@hooks": path.resolve(__dirname, "src/hooks"),
      "@pages": path.resolve(__dirname, "src/pages"),
      "@servs": path.resolve(__dirname, "src/servs"),
      "@contexts": path.resolve(__dirname, "src/contexts"),
      "@components": path.resolve(__dirname, "src/components"),
    },
  },
});
