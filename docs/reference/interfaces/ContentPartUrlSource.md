---
id: ContentPartUrlSource
title: ContentPartUrlSource
---

# Interface: ContentPartUrlSource

Defined in: [packages/ai/src/types.ts:200](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L200)

Source specification for URL-based content.
mimeType is optional as it can often be inferred from the URL or response headers.

## Properties

### mimeType?

```ts
optional mimeType: string;
```

Defined in: [packages/ai/src/types.ts:212](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L212)

Optional MIME type hint for cases where providers can't infer it from the URL.

***

### type

```ts
type: "url";
```

Defined in: [packages/ai/src/types.ts:204](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L204)

Indicates this is URL-referenced content.

***

### value

```ts
value: string;
```

Defined in: [packages/ai/src/types.ts:208](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L208)

HTTP(S) URL or data URI pointing to the content.
