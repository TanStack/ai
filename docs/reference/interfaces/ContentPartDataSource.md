---
id: ContentPartDataSource
title: ContentPartDataSource
---

# Interface: ContentPartDataSource

Defined in: [types.ts:116](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L116)

Source specification for inline data content (base64).
Requires a mimeType to ensure providers receive proper content type information.

## Properties

### mimeType

```ts
mimeType: string;
```

Defined in: [types.ts:129](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L129)

The MIME type of the content (e.g., 'image/png', 'audio/wav').
Required for data sources to ensure proper handling by providers.

***

### type

```ts
type: "data";
```

Defined in: [types.ts:120](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L120)

Indicates this is inline data content.

***

### value

```ts
value: string;
```

Defined in: [types.ts:124](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L124)

The base64-encoded content value.
