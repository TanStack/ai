---
'@tanstack/ai': minor
'@tanstack/ai-event-client': minor
'@tanstack/ai-client': patch
'@tanstack/ai-devtools': patch
---

feat: add middleware system and content guard middleware

- **@tanstack/ai**: New `@tanstack/ai/middlewares` subpath with composable chat middleware architecture. Includes `contentGuardMiddleware` (delta and buffered strategies) and `toolCacheMiddleware`. Middleware hooks: `onStart`, `onIteration`, `onChunk`, `onToolPhaseComplete`, `onFinish`.
- **@tanstack/ai-event-client**: Initial release. Extracted `devtoolsMiddleware` from `@tanstack/ai` core into a standalone package for tree-shaking. Emits all DevTools events as an observation-only middleware.
- **@tanstack/ai-client**: Updated event types for middleware integration.
- **@tanstack/ai-devtools**: Updated iteration timeline and conversation UI for middleware-aware event handling.
