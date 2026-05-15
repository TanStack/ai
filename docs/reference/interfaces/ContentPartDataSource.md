---
id: ContentPartDataSource
title: ContentPartDataSource
---

# Interface: ContentPartDataSource

Defined in: [packages/typescript/ai/src/types.ts:145](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L145)

Source specification for inline data content (base64).
Requires a mimeType to ensure providers receive proper content type information.

## Properties

### mimeType

```ts
mimeType: string;
```

Defined in: [packages/typescript/ai/src/types.ts:158](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L158)

The MIME type of the content (e.g., 'image/png', 'audio/wav').
Required for data sources to ensure proper handling by providers.

***

### type

```ts
type: "data";
```

Defined in: [packages/typescript/ai/src/types.ts:149](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L149)

Indicates this is inline data content.

***

### value

```ts
value: string;
```

Defined in: [packages/typescript/ai/src/types.ts:153](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L153)

The base64-encoded content value.
