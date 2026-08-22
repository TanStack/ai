---
id: ClientToolDeclaration
title: ClientToolDeclaration
---

# Type Alias: ClientToolDeclaration

```ts
type ClientToolDeclaration = object;
```

Defined in: [packages/ai/src/utilities/chat-params.ts:319](https://github.com/TanStack/ai/blob/main/packages/ai/src/utilities/chat-params.ts#L319)

Client-declared tool stub (no execute). `name` is `string`, so arrays that
include these stubs intentionally widen tool-name discrimination —
pass server tools alone when you need a closed name union.

## Properties

### description

```ts
description: string;
```

Defined in: [packages/ai/src/utilities/chat-params.ts:321](https://github.com/TanStack/ai/blob/main/packages/ai/src/utilities/chat-params.ts#L321)

***

### inputSchema

```ts
inputSchema: JSONSchema;
```

Defined in: [packages/ai/src/utilities/chat-params.ts:322](https://github.com/TanStack/ai/blob/main/packages/ai/src/utilities/chat-params.ts#L322)

***

### name

```ts
name: string;
```

Defined in: [packages/ai/src/utilities/chat-params.ts:320](https://github.com/TanStack/ai/blob/main/packages/ai/src/utilities/chat-params.ts#L320)
