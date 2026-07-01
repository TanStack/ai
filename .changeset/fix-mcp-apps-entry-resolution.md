---
'@tanstack/ai-react': patch
---

Restructure the `@tanstack/ai-react/mcp-apps` entry so its source is resolvable by the docs snippet type-checker: the JSX implementation moves to `mcp-app-resource.tsx` and `mcp-apps.ts` re-exports it. Public exports (`MCPAppResource`, `MCPAppResourceProps`) and the subpath are unchanged.
