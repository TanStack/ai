---
id: ClientToolDeclaration
title: ClientToolDeclaration
---

# Type Alias: ClientToolDeclaration

```ts
type ClientToolDeclaration = object;
```

Defined in: [packages/ai/src/utilities/chat-params.ts:323](https://github.com/TanStack/ai/blob/main/packages/ai/src/utilities/chat-params.ts#L323)

Client-declared tool stub (no execute). `name` is `string`, so arrays that
include these stubs intentionally widen `TypedStreamChunk` tool-name
discrimination — pass server tools alone when you need a closed name union.

## Properties

### description

```ts
description: string;
```

Defined in: [packages/ai/src/utilities/chat-params.ts:325](https://github.com/TanStack/ai/blob/main/packages/ai/src/utilities/chat-params.ts#L325)

***

### inputSchema

```ts
inputSchema: JSONSchema;
```

Defined in: [packages/ai/src/utilities/chat-params.ts:326](https://github.com/TanStack/ai/blob/main/packages/ai/src/utilities/chat-params.ts#L326)

***

### name

```ts
name: string;
```

Defined in: [packages/ai/src/utilities/chat-params.ts:324](https://github.com/TanStack/ai/blob/main/packages/ai/src/utilities/chat-params.ts#L324)
