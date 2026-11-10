---
id: SandboxCreatedEvent
title: SandboxCreatedEvent
---

Defined in: [packages/ai/src/types.ts:1902](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1902)

`withSandbox` sends this after it creates a new sandbox.

## Extends

- [`CustomEvent`](CustomEvent.md)

## Properties

### metadata?

```ts
optional metadata?: Record<string, any>;
```

Defined in: [packages/ai/src/types.ts:1829](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1829)

Extra information attached to this event.

#### Inherited from

[`CustomEvent`](CustomEvent.md).[`metadata`](CustomEvent.md#metadata)

***

### name

```ts
name: "sandbox.created";
```

Defined in: [packages/ai/src/types.ts:1903](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1903)

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

Defined in: [packages/ai/src/types.ts:1828](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1828)

#### Inherited from

[`CustomEvent`](CustomEvent.md).[`type`](CustomEvent.md#type)

***

### value

```ts
value: object;
```

Defined in: [packages/ai/src/types.ts:1904](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1904)

The payload. Any JSON value, and required.

#### provider

```ts
provider: string;
```

#### sandboxId

```ts
sandboxId: string;
```

#### Overrides

```ts
CustomEvent.value
```
