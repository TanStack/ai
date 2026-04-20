---
id: ContentPartDataSource
title: ContentPartDataSource
---

# Interface: ContentPartDataSource

Defined in: [packages/typescript/ai/src/types.ts:142](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L142)

Source specification for inline data content (base64).
Requires a mimeType to ensure providers receive proper content type information.

## Properties

### mimeType

```ts
mimeType: string;
```

Defined in: [packages/typescript/ai/src/types.ts:155](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L155)

The MIME type of the content (e.g., 'image/png', 'audio/wav').
Required for data sources to ensure proper handling by providers.

***

### type

```ts
type: "data";
```

Defined in: [packages/typescript/ai/src/types.ts:146](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L146)

Indicates this is inline data content.

***

### value

```ts
value: string;
```

Defined in: [packages/typescript/ai/src/types.ts:150](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L150)

The base64-encoded content value.
