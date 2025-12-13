---
id: RunErrorEvent
title: RunErrorEvent
---

# Interface: RunErrorEvent

Defined in: [types.ts:660](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L660)

Emitted when an error occurs during a run.

## Extends

- [`BaseEvent`](BaseEvent.md)

## Properties

### error

```ts
error: object;
```

Defined in: [types.ts:663](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L663)

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

Defined in: [types.ts:629](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L629)

TanStack AI addition: Model identifier for multi-model support

#### Inherited from

[`BaseEvent`](BaseEvent.md).[`model`](BaseEvent.md#model)

***

### rawEvent?

```ts
optional rawEvent: unknown;
```

Defined in: [types.ts:631](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L631)

Original provider event for debugging/advanced use cases

#### Inherited from

[`BaseEvent`](BaseEvent.md).[`rawEvent`](BaseEvent.md#rawevent)

***

### runId?

```ts
optional runId: string;
```

Defined in: [types.ts:662](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L662)

***

### timestamp

```ts
timestamp: number;
```

Defined in: [types.ts:627](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L627)

#### Inherited from

[`BaseEvent`](BaseEvent.md).[`timestamp`](BaseEvent.md#timestamp)

***

### type

```ts
type: "RUN_ERROR";
```

Defined in: [types.ts:661](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L661)

#### Overrides

[`BaseEvent`](BaseEvent.md).[`type`](BaseEvent.md#type)
