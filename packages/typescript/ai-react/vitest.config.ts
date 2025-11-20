import { defineConfig } from "vitest/config";
import { resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  test: {
    globals: true,
    environment: "jsdom",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html", "lcov"],
      exclude: [
        "node_modules/",
        "dist/",
        "tests/",
        "**/*.test.ts",
        "**/*.test.tsx",
        "**/*.config.ts",
        "**/types.ts",
      ],
      include: ["src/**/*.ts"],
    },
  },
  resolve: {
    alias: {
      "@tanstack/ai/event-client": resolve(__dirname, "../ai/src/event-client.ts"),
    },
  },
});

