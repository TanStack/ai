// Barrel entry for the `@tanstack/ai-react/mcp-apps` subpath. The JSX
// implementation lives in the sibling `.tsx` file; this `.ts` re-export exists
// so kiira's dist->src resolution (which maps `dist/esm/mcp-apps.d.ts` to
// `src/mcp-apps.ts`, never `.tsx`) can type-check the docs snippets that import
// from this subpath.
export type { MCPAppResourceProps } from './mcp-app-resource'
export { MCPAppResource } from './mcp-app-resource'
