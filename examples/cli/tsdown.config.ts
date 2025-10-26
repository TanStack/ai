import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["./src/index.ts"],
  format: ["esm"],
  unbundle: false,
  dts: true,
  sourcemap: true,
  clean: true,
  minify: false,
  banner: {
    js: "#!/usr/bin/env node",
  },
});
