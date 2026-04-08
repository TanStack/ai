---
'@tanstack/ai': patch
---

fix(ai): move @standard-schema/spec from devDependencies to dependencies

Without this package installed, all types that depend on `StandardJSONSchemaV1` silently degrade to `any` — tool definitions lose type inference and `chat()` return types become `any`.
