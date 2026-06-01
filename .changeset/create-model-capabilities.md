---
'@tanstack/ai': minor
---

`createModel` now accepts a capabilities object — `createModel(name, { input, features, tools, providerOptions })` — in addition to the existing `createModel(name, input)` form. `ExtendedModelDef` gains optional `features` and `tools` fields.
