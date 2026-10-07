---
id: SandboxFileDiffEvent
title: SandboxFileDiffEvent
---

Defined in: [packages/ai/src/types.ts:1613](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1613)

Custom event for extensibility.

@ag-ui/core provides: `name`, `value`, `subagentRunId?`

## Extends

- [`CustomEvent`](CustomEvent.md)

## Properties

### metadata?

```ts
optional metadata?: Record<string, any>;
```

Defined in: [packages/ai/src/types.ts:1510](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1510)

Extra information attached to this event.

#### Inherited from

[`CustomEvent`](CustomEvent.md).[`metadata`](CustomEvent.md#metadata)

***

### name

```ts
name: "sandbox.file.diff";
```

Defined in: [packages/ai/src/types.ts:1614](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1614)

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

Defined in: [packages/ai/src/types.ts:1509](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1509)

#### Inherited from

[`CustomEvent`](CustomEvent.md).[`type`](CustomEvent.md#type)

***

### value

```ts
value: object;
```

Defined in: [packages/ai/src/types.ts:1615](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1615)

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
