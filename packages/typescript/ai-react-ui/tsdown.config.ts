import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs", "esm"],
  clean: true,
  dts: true,
  external: ["react", "react-dom", "@tanstack/ai-react"],
});

