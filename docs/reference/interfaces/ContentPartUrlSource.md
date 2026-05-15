---
id: ContentPartUrlSource
title: ContentPartUrlSource
---

# Interface: ContentPartUrlSource

Defined in: [packages/typescript/ai/src/types.ts:165](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L165)

Source specification for URL-based content.
mimeType is optional as it can often be inferred from the URL or response headers.

## Properties

### mimeType?

```ts
optional mimeType: string;
```

Defined in: [packages/typescript/ai/src/types.ts:177](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L177)

Optional MIME type hint for cases where providers can't infer it from the URL.

***

### type

```ts
type: "url";
```

Defined in: [packages/typescript/ai/src/types.ts:169](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L169)

Indicates this is URL-referenced content.

***

### value

```ts
value: string;
```

Defined in: [packages/typescript/ai/src/types.ts:173](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L173)

HTTP(S) URL or data URI pointing to the content.
