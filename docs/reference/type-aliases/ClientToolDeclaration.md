---
id: ClientToolDeclaration
title: ClientToolDeclaration
---

```ts
type ClientToolDeclaration = object;
```

Defined in: [packages/ai/src/utilities/chat-params.ts:313](https://github.com/TanStack/ai/blob/main/packages/ai/src/utilities/chat-params.ts#L313)

Client-declared tool stub (no execute). `name` is `string`, so arrays that
include these stubs intentionally widen tool-name discrimination —
pass server tools alone when you need a closed name union.

## Properties

### description

```ts
description: string;
```

Defined in: [packages/ai/src/utilities/chat-params.ts:315](https://github.com/TanStack/ai/blob/main/packages/ai/src/utilities/chat-params.ts#L315)

***

### inputSchema

```ts
inputSchema: JSONSchema;
```

Defined in: [packages/ai/src/utilities/chat-params.ts:316](https://github.com/TanStack/ai/blob/main/packages/ai/src/utilities/chat-params.ts#L316)

***

### name

```ts
name: string;
```

Defined in: [packages/ai/src/utilities/chat-params.ts:314](https://github.com/TanStack/ai/blob/main/packages/ai/src/utilities/chat-params.ts#L314)
