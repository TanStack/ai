---
id: ContentPartDataSource
title: ContentPartDataSource
---

# Interface: ContentPartDataSource

Defined in: [packages/typescript/ai/src/types.ts:167](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L167)

Source specification for inline data content (base64).
Requires a mimeType to ensure providers receive proper content type information.

## Properties

### mimeType

```ts
mimeType: string;
```

Defined in: [packages/typescript/ai/src/types.ts:180](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L180)

The MIME type of the content (e.g., 'image/png', 'audio/wav').
Required for data sources to ensure proper handling by providers.

***

### type

```ts
type: "data";
```

Defined in: [packages/typescript/ai/src/types.ts:171](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L171)

Indicates this is inline data content.

***

### value

```ts
value: string;
```

Defined in: [packages/typescript/ai/src/types.ts:175](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L175)

The base64-encoded content value.
