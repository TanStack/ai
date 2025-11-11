import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["./src/index.ts", "./src/event-client.ts"],
  format: ["esm"],
  unbundle: true,
  dts: true,
  sourcemap: true,
  clean: true,
  minify: false,
});
