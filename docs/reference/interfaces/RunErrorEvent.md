---
id: RunErrorEvent
title: RunErrorEvent
---

# Interface: RunErrorEvent

Defined in: [types.ts:588](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L588)

Emitted when an error occurs during a run.

## Extends

- [`BaseEvent`](BaseEvent.md)

## Properties

### error

```ts
error: object;
```

Defined in: [types.ts:591](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L591)

#### code?

```ts
optional code: string;
```

#### message

```ts
message: string;
```

***

### model?

```ts
optional model: string;
```

Defined in: [types.ts:557](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L557)

TanStack AI addition: Model identifier for multi-model support

#### Inherited from

[`BaseEvent`](BaseEvent.md).[`model`](BaseEvent.md#model)

***

### rawEvent?

```ts
optional rawEvent: unknown;
```

Defined in: [types.ts:559](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L559)

Original provider event for debugging/advanced use cases

#### Inherited from

[`BaseEvent`](BaseEvent.md).[`rawEvent`](BaseEvent.md#rawevent)

***

### runId?

```ts
optional runId: string;
```

Defined in: [types.ts:590](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L590)

***

### timestamp

```ts
timestamp: number;
```

Defined in: [types.ts:555](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L555)

#### Inherited from

[`BaseEvent`](BaseEvent.md).[`timestamp`](BaseEvent.md#timestamp)

***

### type

```ts
type: "RUN_ERROR";
```

Defined in: [types.ts:589](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L589)

#### Overrides

[`BaseEvent`](BaseEvent.md).[`type`](BaseEvent.md#type)
