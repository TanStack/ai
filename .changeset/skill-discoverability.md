---
'@tanstack/ai': patch
'@tanstack/ai-mcp': patch
'@tanstack/ai-sandbox': patch
'@tanstack/ai-memory': patch
---

**Make every bundled Agent Skill discoverable by TanStack Intent.**

Intent finds skills by scanning `node_modules` for packages that carry the
`tanstack-intent` keyword, and can only load what npm actually publishes. Three
packages shipped skills that failed one half of that contract:

- `@tanstack/ai-mcp` wrote its skill into a `skills/` directory that was missing
  from `files`, so it was never published at all.
- `@tanstack/ai-memory` and `@tanstack/ai-sandbox` published their skills but
  lacked the keyword, so Intent never looked at them.

All three now publish `skills` and carry the keyword, matching `@tanstack/ai`,
`@tanstack/ai-code-mode`, and `@tanstack/ai-persistence`.

The client persistence skill also moves from `@tanstack/ai-persistence` to
`@tanstack/ai` as `ai-core/client-persistence`. It teaches
`localStoragePersistence` / `sessionStoragePersistence` / `indexedDBPersistence`
and the `persistence` option on `useChat` — all of which live in the framework
packages, not in `@tanstack/ai-persistence`. An app doing browser-only
persistence never installs that package, so the guidance was unreachable for
exactly the people who needed it, and `ai-core` routed to a path that did not
exist on disk. Skills now follow the code that owns them.
