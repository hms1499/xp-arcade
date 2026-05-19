import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  plugins: [react() as any],
  test: {
    environment: "jsdom",
    globals: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      // `@stacks/connect` pulls in `@stacks/connect-ui`'s Stencil bundle,
      // which crashes under jsdom. Swap it for an inert stub in tests.
      "@stacks/connect": path.resolve(
        __dirname,
        "test/stacks-connect-stub.ts",
      ),
    },
  },
});
