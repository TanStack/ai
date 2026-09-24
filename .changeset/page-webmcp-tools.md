---
'@tanstack/ai-client': minor
'@tanstack/ai-react': minor
'@tanstack/ai-preact': minor
'@tanstack/ai-octane': minor
'@tanstack/ai-vue': minor
'@tanstack/ai-solid': minor
'@tanstack/ai-svelte': minor
'@tanstack/ai-remix': minor
'@tanstack/ai-angular': minor
---

Give the WebMCP tools on a page to your chat as client tools.

- `getWebMCPTools()` and `subscribeWebMCPTools()` in `@tanstack/ai-client` read `document.modelContext` and return client tools. Each tool runs through WebMCP `executeTool()`. A `filter` option skips tools. Every framework package re-exports both functions.
- Reject duplicate page tool names after filtering so tools from different frames cannot silently replace each other in chat.
- New framework APIs return a reactive list: `usePageWebMCPTools` (React, Preact, Octane, Vue, Solid), `createPageWebMCPTools` (Svelte, Remix), and `injectPageWebMCPTools` (Angular).
- The chat APIs in Preact, Vue, Solid, Svelte, Remix, and Angular now pick up `tools` that change after the chat is created. Vue accepts a ref or getter. Angular accepts a `Signal` or getter. Solid, Svelte, and Remix read a `get tools()` getter.
- `useWebMCPTools`, `createWebMCPTools`, and `injectWebMCPTools` are now `useRegisterWebMCPTools`, `createRegisterWebMCPTools`, and `injectRegisterWebMCPTools`. The old names and their options types still work, but they are deprecated. They will be removed in 1.0.0.
