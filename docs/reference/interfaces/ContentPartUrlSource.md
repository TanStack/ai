---
id: ContentPartUrlSource
title: ContentPartUrlSource
---

# Interface: ContentPartUrlSource

Defined in: [types.ts:136](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L136)

Source specification for URL-based content.
mimeType is optional as it can often be inferred from the URL or response headers.

## Properties

### mimeType?

```ts
optional mimeType: string;
```

Defined in: [types.ts:148](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L148)

Optional MIME type hint for cases where providers can't infer it from the URL.

***

### type

```ts
type: "url";
```

Defined in: [types.ts:140](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L140)

Indicates this is URL-referenced content.

***

### value

```ts
value: string;
```

Defined in: [types.ts:144](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L144)

HTTP(S) URL or data URI pointing to the content.
