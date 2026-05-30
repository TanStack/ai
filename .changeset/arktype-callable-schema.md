---
'@tanstack/ai': patch
---

Fix `convertSchemaToJsonSchema` (and tool input/output validation) for ArkType schemas. ArkType's `type()` returns a callable function with `~standard` attached, but the Standard Schema detection guards required `typeof schema === 'object'`, so ArkType schemas were never recognized and the raw validator function was passed through instead of a JSON Schema object. The guards now also accept callable schemas. (#276)
