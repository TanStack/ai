---
id: ClientToolDeclaration
title: ClientToolDeclaration
---

```ts
type ClientToolDeclaration = object;
```

Defined in: packages/ai/src/utilities/chat-params.ts:313

Client-declared tool stub (no execute). `name` is `string`, so arrays that
include these stubs intentionally widen tool-name discrimination —
pass server tools alone when you need a closed name union.

## Properties

### description

```ts
description: string;
```

Defined in: packages/ai/src/utilities/chat-params.ts:315

***

### inputSchema

```ts
inputSchema: JSONSchema;
```

Defined in: packages/ai/src/utilities/chat-params.ts:316

***

### name

```ts
name: string;
```

Defined in: packages/ai/src/utilities/chat-params.ts:314
