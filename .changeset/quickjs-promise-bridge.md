---
'@tanstack/ai-isolate-quickjs': patch
---

Replace asyncify-suspended host functions with promise-based bridging in the QuickJS isolate driver. Sequential awaits of the same async tool binding previously corrupted QuickJS refcounts and could abort the WASM module (https://github.com/justjake/quickjs-emscripten/issues/258) — the passing tests relied on an incidental heap-layout effect of the injected `console` global. Tool bindings now return QuickJS promises resolved from the host, which never suspend the WASM stack, and the driver uses the plain (non-asyncify) QuickJS build. Concurrent tool calls via `Promise.all` in sandboxed code are now supported, and execution timeouts are enforced with a host-side deadline in addition to the QuickJS interrupt handler.
