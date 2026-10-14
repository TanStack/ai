---
id: ToolCall
title: ToolCall
---

Defined in: [packages/ai/src/types.ts:194](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L194)

AG-UI `ToolCall` with typed metadata. `function.arguments` is a JSON string.

## Extends

- `Omit`\<`AGUIToolCall`, `"metadata"`\>

## Type Parameters

### TMetadata

`TMetadata` = `unknown`

## Properties

### metadata?

```ts
optional metadata?: TMetadata;
```

Defined in: [packages/ai/src/types.ts:201](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L201)

Provider-specific metadata to carry through the tool call lifecycle.
Typed per-adapter via `TToolCallMetadata`. For example,
`@tanstack/ai-gemini` sets this to `{ thoughtSignature?: string }`.
