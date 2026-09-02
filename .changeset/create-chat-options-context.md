---
'@tanstack/ai': patch
---

fix: `createChatOptions` now preserves the runtime-context requirement on its return type. When tools or middleware declare a required context, the input already enforces `context` via `RuntimeContextOption`, but the return type declared it optional — so spreading the result into `chat()` failed to typecheck (`Type 'undefined' is not assignable to type '...'`). The return type now applies the same `RuntimeContextOption` conditional as the parameter, so the documented spread pattern compiles with context-typed tools. Type-level only; runtime is unchanged.
