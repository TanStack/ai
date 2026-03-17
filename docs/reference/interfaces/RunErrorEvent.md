---
id: RunErrorEvent
title: RunErrorEvent
---

# Interface: RunErrorEvent

Defined in: [types.ts:792](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L792)

Emitted when an error occurs during a run.

## Extends

- [`BaseAGUIEvent`](BaseAGUIEvent.md)

## Properties

### error

```ts
error: object;
```

Defined in: [types.ts:797](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L797)

Error details

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

Defined in: [types.ts:751](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L751)

Model identifier for multi-model support

#### Inherited from

[`BaseAGUIEvent`](BaseAGUIEvent.md).[`model`](BaseAGUIEvent.md#model)

***

### rawEvent?

```ts
optional rawEvent: unknown;
```

Defined in: [types.ts:753](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L753)

Original provider event for debugging/advanced use cases

#### Inherited from

[`BaseAGUIEvent`](BaseAGUIEvent.md).[`rawEvent`](BaseAGUIEvent.md#rawevent)

***

### runId?

```ts
optional runId: string;
```

Defined in: [types.ts:795](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L795)

Run identifier (if available)

***

### timestamp

```ts
timestamp: number;
```

Defined in: [types.ts:749](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L749)

#### Inherited from

[`BaseAGUIEvent`](BaseAGUIEvent.md).[`timestamp`](BaseAGUIEvent.md#timestamp)

***

### type

```ts
type: "RUN_ERROR";
```

Defined in: [types.ts:793](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L793)

#### Overrides

[`BaseAGUIEvent`](BaseAGUIEvent.md).[`type`](BaseAGUIEvent.md#type)
