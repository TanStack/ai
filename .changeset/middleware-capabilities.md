---
'@tanstack/ai': minor
---

Add a type-safe capability system to chat middleware. `createCapability<T>()('name')` returns a `[get, provide]` accessor tuple that is also its own identity for `requires`/`provides` declarations — no separate token import. The middleware context also exposes `ctx.get(capability)` / `ctx.getOptional(capability)` / `ctx.provide(capability, value)`, typed by the handle you pass. Middleware gain a `setup` provisioning hook (runs first, before `onConfig`) plus `requires`/`provides`/`optionalRequires`. `chat()` validates that every required capability is provided, at compile time (an array coverage check and the new order-aware `createChatMiddleware()` builder) and at runtime (clear errors before the adapter runs). Adapters can now declare `requires`. This is the primitive layer for upcoming persistence and sandbox middleware; no concrete capabilities ship yet.
