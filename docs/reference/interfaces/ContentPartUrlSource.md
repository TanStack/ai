---
id: ContentPartUrlSource
title: ContentPartUrlSource
---

# Interface: ContentPartUrlSource

Defined in: [packages/ai/src/types.ts:237](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L237)

Source specification for URL-based content.
mimeType is optional as it can often be inferred from the URL or response headers.

## Properties

### mimeType?

```ts
optional mimeType?: string;
```

Defined in: [packages/ai/src/types.ts:249](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L249)

Optional MIME type hint for cases where providers can't infer it from the URL.

***

### type

```ts
type: "url";
```

Defined in: [packages/ai/src/types.ts:241](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L241)

Indicates this is URL-referenced content.

***

### value

```ts
value: string;
```

Defined in: [packages/ai/src/types.ts:245](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L245)

HTTP(S) URL or data URI pointing to the content.
