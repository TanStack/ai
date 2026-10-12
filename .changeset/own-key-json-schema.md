---
'@tanstack/ai-utils': patch
'@tanstack/openai-base': patch
'@tanstack/ai-mistral': patch
'@tanstack/ai-openrouter': patch
'@tanstack/ai-gemini': patch
'@tanstack/ai-bedrock': patch
---

Keep a schema property or a tool argument named `__proto__`. Before this fix, code that copied it with `out[key] = value` set the prototype of the copy instead, so the key was lost.

- `@tanstack/ai-utils`: `transformNullsToUndefined` and `undoNullWidening` keep the key.
- `@tanstack/openai-base` and `@tanstack/ai-mistral`: the strict schema and its null-widening map keep the key.
- `@tanstack/ai-openrouter`: the Responses tool input normalizer keeps the key, and it ignores a schema property that is only inherited.
- `@tanstack/ai-gemini`: the Interactions adapter keeps the key in tool parameters.
- `@tanstack/ai-bedrock`: the Converse adapter puts the tool schemas, tool inputs, and tool result JSON back into the request body after the AWS SDK serializes it, because the SDK drops the key.
