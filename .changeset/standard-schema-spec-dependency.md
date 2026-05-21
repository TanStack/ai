---
'@tanstack/ai': patch
---

Move `@standard-schema/spec` from `devDependencies` to `dependencies`. Closes #602.

The package's published `.d.ts` files (`types.d.ts`, `activities/chat/tools/tool-definition.d.ts`, `activities/chat/tools/schema-converter.d.ts`) import types from `@standard-schema/spec`, so consumers need it installed for type resolution to succeed. With `skipLibCheck: true`, `tsc` silently ignored the unresolved module, but type-aware tools like `@typescript-eslint` (with `recommendedTypeChecked` / `projectService: true`) failed to resolve return types — surfacing as `Unsafe assignment of an error typed value` on `useChat()` destructuring and cascading errors through downstream usages.
