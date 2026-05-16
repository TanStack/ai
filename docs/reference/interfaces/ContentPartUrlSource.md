---
id: ContentPartUrlSource
title: ContentPartUrlSource
---

# Interface: ContentPartUrlSource

Defined in: [packages/typescript/ai/src/types.ts:185](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L185)

Source specification for URL-based content.
mimeType is optional as it can often be inferred from the URL or response headers.

## Properties

### mimeType?

```ts
optional mimeType: string;
```

Defined in: [packages/typescript/ai/src/types.ts:197](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L197)

Optional MIME type hint for cases where providers can't infer it from the URL.

***

### type

```ts
type: "url";
```

Defined in: [packages/typescript/ai/src/types.ts:189](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L189)

Indicates this is URL-referenced content.

***

### value

```ts
value: string;
```

Defined in: [packages/typescript/ai/src/types.ts:193](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L193)

HTTP(S) URL or data URI pointing to the content.
