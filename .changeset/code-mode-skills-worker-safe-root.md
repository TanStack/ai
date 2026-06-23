---
'@tanstack/ai-code-mode-skills': minor
---

Make the `@tanstack/ai-code-mode-skills` root export Worker/browser-safe.

The root entry previously re-exported `createFileSkillStorage` (via `export * from './storage'`), which eagerly pulled in `node:fs` / `node:path`. This broke Cloudflare Workers and browser bundlers even for consumers that only used non-storage helpers like `createSkillManagementTools` or `createSkillsSystemPrompt`.

The Node-only file storage now lives **only** behind the `@tanstack/ai-code-mode-skills/storage` subpath. The root entry still re-exports the browser-safe `createMemorySkillStorage`.

**Breaking:** import `createFileSkillStorage` from `@tanstack/ai-code-mode-skills/storage` instead of the package root.
