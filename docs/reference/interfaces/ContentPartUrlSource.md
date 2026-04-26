---
id: ContentPartUrlSource
title: ContentPartUrlSource
---

# Interface: ContentPartUrlSource

Defined in: [packages/typescript/ai/src/types.ts:163](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L163)

Source specification for URL-based content.
mimeType is optional as it can often be inferred from the URL or response headers.

## Properties

### mimeType?

```ts
optional mimeType: string;
```

Defined in: [packages/typescript/ai/src/types.ts:175](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L175)

Optional MIME type hint for cases where providers can't infer it from the URL.

***

### type

```ts
type: "url";
```

Defined in: [packages/typescript/ai/src/types.ts:167](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L167)

Indicates this is URL-referenced content.

***

### value

```ts
value: string;
```

Defined in: [packages/typescript/ai/src/types.ts:171](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L171)

HTTP(S) URL or data URI pointing to the content.
