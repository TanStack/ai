---
id: StructuredOutputStartEvent
title: StructuredOutputStartEvent
---

# Interface: StructuredOutputStartEvent

Defined in: [packages/typescript/ai/src/types.ts:1165](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1165)

Emitted at the start of a streaming structured-output run, before the JSON
deltas. Tells consumers that the upcoming `TEXT_MESSAGE_CONTENT` deltas
belong to a structured response so they can route those bytes into a
`StructuredOutputPart` instead of building a `TextPart`. Carries the
`messageId` the deltas will be tagged with so the routing decision can be
made per-message rather than globally.

## Extends

- `Omit`\<[`CustomEvent`](CustomEvent.md), `"name"` \| `"value"`\>

## Indexable

```ts
[key: string]: unknown
```

```ts
[key: number]: unknown
```

## Properties

### name

```ts
name: "structured-output.start";
```

Defined in: [packages/typescript/ai/src/types.ts:1169](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1169)

***

### value

```ts
value: object;
```

Defined in: [packages/typescript/ai/src/types.ts:1170](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1170)

#### messageId

```ts
messageId: string;
```
