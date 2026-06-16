---
'@tanstack/ai-mcp': patch
---

Fix `@tanstack/ai-mcp` CLI crashing on startup with `Error: Dynamic require of "fs" is not supported`. The CLI ships as an ESM bundle with `json-schema-to-typescript` inlined, which uses CJS `require()` internally. Enabling tsup's `shims` option injects a `createRequire(import.meta.url)` shim so those `require()` calls resolve correctly.
