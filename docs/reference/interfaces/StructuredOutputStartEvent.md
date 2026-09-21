---
id: StructuredOutputStartEvent
title: StructuredOutputStartEvent
---

Defined in: [packages/ai/src/types.ts:1426](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1426)

Emitted at the start of a streaming structured-output run, before the JSON
deltas. Tells consumers that the upcoming `TEXT_MESSAGE_CONTENT` deltas
belong to a structured response so they can route those bytes into a
`StructuredOutputPart` instead of building a `TextPart`. Carries the
`messageId` the deltas will be tagged with so the routing decision can be
made per-message rather than globally.

## Extends

- [`CustomEvent`](CustomEvent.md)

## Properties

### metadata?

```ts
optional metadata?: Record<string, any>;
```

Defined in: [packages/ai/src/types.ts:1390](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1390)

#### Inherited from

[`CustomEvent`](CustomEvent.md).[`metadata`](CustomEvent.md#metadata)

***

### name

```ts
name: "structured-output.start";
```

Defined in: [packages/ai/src/types.ts:1427](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1427)

#### Overrides

```ts
CustomEvent.name
```

***

### type

```ts
type: "CUSTOM";
```

Defined in: [packages/ai/src/types.ts:1389](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1389)

#### Inherited from

[`CustomEvent`](CustomEvent.md).[`type`](CustomEvent.md#type)

***

### value

```ts
value: object;
```

Defined in: [packages/ai/src/types.ts:1428](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1428)

#### messageId

```ts
messageId: string;
```

#### Overrides

```ts
CustomEvent.value
```
