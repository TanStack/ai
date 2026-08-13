---
id: StructuredOutputStartEvent
title: StructuredOutputStartEvent
---

# Interface: StructuredOutputStartEvent

Defined in: [packages/ai/src/types.ts:1375](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1375)

Emitted at the start of a streaming structured-output run, before the JSON
deltas. Tells consumers that the upcoming `TEXT_MESSAGE_CONTENT` deltas
belong to a structured response so they can route those bytes into a
`StructuredOutputPart` instead of building a `TextPart`. Carries the
`messageId` the deltas will be tagged with so the routing decision can be
made per-message rather than globally.

## Extends

- [`CustomEvent`](CustomEvent.md)

## Indexable

```ts
[k: string]: unknown
```

## Properties

### model?

```ts
optional model: string;
```

Defined in: [packages/ai/src/types.ts:1339](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1339)

Model identifier for multi-model support

#### Inherited from

[`CustomEvent`](CustomEvent.md).[`model`](CustomEvent.md#model)

***

### name

```ts
name: "structured-output.start";
```

Defined in: [packages/ai/src/types.ts:1376](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1376)

#### Overrides

```ts
CustomEvent.name
```

***

### value

```ts
value: object;
```

Defined in: [packages/ai/src/types.ts:1377](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1377)

#### messageId

```ts
messageId: string;
```

#### Overrides

```ts
CustomEvent.value
```
