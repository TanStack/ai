---
id: StructuredOutputStartEvent
title: StructuredOutputStartEvent
---

# Interface: StructuredOutputStartEvent

Defined in: [packages/typescript/ai/src/types.ts:1184](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1184)

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

Defined in: [packages/typescript/ai/src/types.ts:1148](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1148)

Model identifier for multi-model support

#### Inherited from

[`CustomEvent`](CustomEvent.md).[`model`](CustomEvent.md#model)

***

### name

```ts
name: "structured-output.start";
```

Defined in: [packages/typescript/ai/src/types.ts:1185](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1185)

#### Overrides

```ts
CustomEvent.name
```

***

### value

```ts
value: object;
```

Defined in: [packages/typescript/ai/src/types.ts:1186](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1186)

#### messageId

```ts
messageId: string;
```

#### Overrides

```ts
CustomEvent.value
```
