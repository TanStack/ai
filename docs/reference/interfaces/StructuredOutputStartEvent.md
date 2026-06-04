---
id: StructuredOutputStartEvent
title: StructuredOutputStartEvent
---

# Interface: StructuredOutputStartEvent

Defined in: [packages/ai/src/types.ts:1245](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1245)

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

Defined in: [packages/ai/src/types.ts:1209](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1209)

Model identifier for multi-model support

#### Inherited from

[`CustomEvent`](CustomEvent.md).[`model`](CustomEvent.md#model)

***

### name

```ts
name: "structured-output.start";
```

Defined in: [packages/ai/src/types.ts:1246](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1246)

#### Overrides

```ts
CustomEvent.name
```

***

### value

```ts
value: object;
```

Defined in: [packages/ai/src/types.ts:1247](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1247)

#### messageId

```ts
messageId: string;
```

#### Overrides

```ts
CustomEvent.value
```
