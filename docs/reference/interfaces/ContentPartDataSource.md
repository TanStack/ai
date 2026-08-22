---
id: ContentPartDataSource
title: ContentPartDataSource
---

# Interface: ContentPartDataSource

Defined in: [packages/ai/src/types.ts:217](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L217)

Source specification for inline data content (base64).
Requires a mimeType to ensure providers receive proper content type information.

## Properties

### mimeType

```ts
mimeType: string;
```

Defined in: [packages/ai/src/types.ts:230](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L230)

The MIME type of the content (e.g., 'image/png', 'audio/wav').
Required for data sources to ensure proper handling by providers.

***

### type

```ts
type: "data";
```

Defined in: [packages/ai/src/types.ts:221](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L221)

Indicates this is inline data content.

***

### value

```ts
value: string;
```

Defined in: [packages/ai/src/types.ts:225](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L225)

The base64-encoded content value.
