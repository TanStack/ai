---
id: SandboxResumedEvent
title: SandboxResumedEvent
---

Defined in: [packages/ai/src/types.ts:1907](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1907)

`withSandbox` sends this after it resumes an existing sandbox.

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
name: "sandbox.resumed";
```

Defined in: [packages/ai/src/types.ts:1908](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1908)

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

Defined in: [packages/ai/src/types.ts:1909](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1909)

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
