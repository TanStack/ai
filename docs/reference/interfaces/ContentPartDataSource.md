---
id: ContentPartDataSource
title: ContentPartDataSource
---

# Interface: ContentPartDataSource

Defined in: [packages/ai/src/types.ts:204](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L204)

Source specification for inline data content (base64).
Requires a mimeType to ensure providers receive proper content type information.

## Properties

### mimeType

```ts
mimeType: string;
```

Defined in: [packages/ai/src/types.ts:217](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L217)

The MIME type of the content (e.g., 'image/png', 'audio/wav').
Required for data sources to ensure proper handling by providers.

***

### type

```ts
type: "data";
```

Defined in: [packages/ai/src/types.ts:208](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L208)

Indicates this is inline data content.

***

### value

```ts
value: string;
```

Defined in: [packages/ai/src/types.ts:212](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L212)

The base64-encoded content value.
