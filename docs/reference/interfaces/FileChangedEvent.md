---
id: FileChangedEvent
title: FileChangedEvent
---

Defined in: [packages/ai/src/types.ts:1856](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1856)

Custom event for extensibility.

@ag-ui/core provides: `name`, `value`, `subagentRunId?`

## Extends

- [`CustomEvent`](CustomEvent.md)

## Properties

### metadata?

```ts
optional metadata?: Record<string, any>;
```

Defined in: [packages/ai/src/types.ts:1747](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1747)

Extra information attached to this event.

#### Inherited from

[`CustomEvent`](CustomEvent.md).[`metadata`](CustomEvent.md#metadata)

***

### name

```ts
name: "file.changed";
```

Defined in: [packages/ai/src/types.ts:1857](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1857)

What this custom event is. Required: without it a consumer cannot route
the value.

#### Overrides

```ts
CustomEvent.name
```

***

### type

```ts
type: "CUSTOM";
```

Defined in: [packages/ai/src/types.ts:1746](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1746)

#### Inherited from

[`CustomEvent`](CustomEvent.md).[`type`](CustomEvent.md#type)

***

### value

```ts
value: object;
```

Defined in: [packages/ai/src/types.ts:1858](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1858)

The payload. Any JSON value, and required.

#### diff

```ts
diff: string;
```

#### path

```ts
path: string;
```

#### Overrides

```ts
CustomEvent.value
```
