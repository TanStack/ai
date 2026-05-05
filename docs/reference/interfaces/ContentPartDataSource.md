---
id: ContentPartDataSource
title: ContentPartDataSource
---

# Interface: ContentPartDataSource

Defined in: [packages/typescript/ai/src/types.ts:143](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L143)

Source specification for inline data content (base64).
Requires a mimeType to ensure providers receive proper content type information.

## Properties

### mimeType

```ts
mimeType: string;
```

Defined in: [packages/typescript/ai/src/types.ts:156](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L156)

The MIME type of the content (e.g., 'image/png', 'audio/wav').
Required for data sources to ensure proper handling by providers.

***

### type

```ts
type: "data";
```

Defined in: [packages/typescript/ai/src/types.ts:147](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L147)

Indicates this is inline data content.

***

### value

```ts
value: string;
```

Defined in: [packages/typescript/ai/src/types.ts:151](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L151)

The base64-encoded content value.
