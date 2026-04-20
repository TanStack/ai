---
'@tanstack/ai-client': patch
---

fix(ai-client): add `@standard-schema/spec` to devDependencies so the type references `@tanstack/ai` forwards through `InferToolInput` / `InferToolOutput` resolve at build time. Types-only dep with no runtime cost; prevents tool-definition input/output inference from silently collapsing to `unknown` for consumers of `useChat` / `ChatClient`.
