---
id: ContentPartSource
title: ContentPartSource
---

# Interface: ContentPartSource

Defined in: [types.ts:165](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L165)

Source specification for multimodal content.
Supports both inline data (base64) and URL-based content.

## Properties

### type

```ts
type: "data" | "url";
```

Defined in: [types.ts:171](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L171)

The type of source:
- 'data': Inline data (typically base64 encoded)
- 'url': URL reference to the content

***

### value

```ts
value: string;
```

Defined in: [types.ts:177](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L177)

The actual content value:
- For 'data': base64-encoded string
- For 'url': HTTP(S) URL or data URI
