---
'@tanstack/ai-isolate-quickjs': minor
---

Replace asyncify-suspended host functions with promise-based bridging in the QuickJS isolate driver. Sequential awaits of the same async tool binding previously corrupted QuickJS refcounts and could abort the WASM module (https://github.com/justjake/quickjs-emscripten/issues/258) — the passing tests relied on an incidental heap-layout effect of the injected `console` global. Tool bindings now return QuickJS promises resolved from the host, which never suspend the WASM stack, and the driver uses the plain (non-asyncify) QuickJS build. Concurrent tool calls via `Promise.all` in sandboxed code are now supported, and execution timeouts are enforced with a host-side deadline in addition to the QuickJS interrupt handler.

**Migration notes:**

- **WASM variant changed.** The driver now loads the sync QuickJS build. If you bundle or self-host the wasm binary, ship `@jitl/quickjs-wasmfile-release-sync/wasm` instead of `@jitl/quickjs-wasmfile-release-asyncify/wasm` — the sync glue cannot instantiate the asyncify binary.
- **Timeouts are now terminal for the context.** After a `TimeoutError` (previously surfaced as `InternalError: interrupted`), outstanding tool calls are cancelled with a timeout error inside the sandbox, the context is disposed, and subsequent `execute()` calls return `DisposedError` — the timed-out program's interrupted jobs stay queued in the VM and must not run inside a later execution. Create a new context after a timeout; `@tanstack/ai-code-mode` already creates a context per execution, so typical Code Mode usage is unaffected.
