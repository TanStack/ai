---
id: ContentPartUrlSource
title: ContentPartUrlSource
---

# Interface: ContentPartUrlSource

Defined in: [types.ts:134](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L134)

Source specification for URL-based content.
mimeType is optional as it can often be inferred from the URL or response headers.

## Properties

### mimeType?

```ts
optional mimeType: string;
```

Defined in: [types.ts:146](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L146)

Optional MIME type hint for cases where providers can't infer it from the URL.

***

### type

```ts
type: "url";
```

Defined in: [types.ts:138](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L138)

Indicates this is URL-referenced content.

***

### value

```ts
value: string;
```

Defined in: [types.ts:142](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L142)

HTTP(S) URL or data URI pointing to the content.
