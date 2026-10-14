import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    proxy: { "/api": `http://localhost:${process.env.PORT ?? "3001"}` },
  },
  test: {
    environment: "jsdom",
    setupFiles: "./src/test-setup.ts",
    include: [
      "src/**/*.test.{ts,tsx}",
      "shared/**/*.test.ts",
      "server/**/*.test.ts",
    ],
  },
});
