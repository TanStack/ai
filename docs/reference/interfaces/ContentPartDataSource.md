---
id: ContentPartDataSource
title: ContentPartDataSource
---

# Interface: ContentPartDataSource

Defined in: [packages/ai/src/types.ts:181](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L181)

Source specification for inline data content (base64).
Requires a mimeType to ensure providers receive proper content type information.

## Properties

### mimeType

```ts
mimeType: string;
```

Defined in: [packages/ai/src/types.ts:194](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L194)

The MIME type of the content (e.g., 'image/png', 'audio/wav').
Required for data sources to ensure proper handling by providers.

***

### type

```ts
type: "data";
```

Defined in: [packages/ai/src/types.ts:185](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L185)

Indicates this is inline data content.

***

### value

```ts
value: string;
```

Defined in: [packages/ai/src/types.ts:189](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L189)

The base64-encoded content value.
