---
'@tanstack/ai-code-mode': patch
---

Keep `enum` and `const` values and property descriptions in the generated
Code Mode type stubs. A typed schema such as `{ type: 'string', enum: ['a', 'b'] }`
now renders as `'a' | 'b'` instead of `string`, and property `description`s are
emitted as JSDoc, as the `includeDescriptions` option of `generateTypeStubs`
already documented.
