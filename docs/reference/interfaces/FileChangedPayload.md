---
id: FileChangedPayload
title: FileChangedPayload
---

Defined in: [packages/ai/src/custom-events.ts:36](https://github.com/TanStack/ai/blob/main/packages/ai/src/custom-events.ts#L36)

## Properties

### diff?

```ts
optional diff?: string;
```

Defined in: [packages/ai/src/custom-events.ts:41](https://github.com/TanStack/ai/blob/main/packages/ai/src/custom-events.ts#L41)

Unified diff, when the harness can produce one.

***

### path

```ts
path: string;
```

Defined in: [packages/ai/src/custom-events.ts:39](https://github.com/TanStack/ai/blob/main/packages/ai/src/custom-events.ts#L39)

Absolute path inside the sandbox (under the workspace root).

***

### timestamp

```ts
timestamp: number;
```

Defined in: [packages/ai/src/custom-events.ts:42](https://github.com/TanStack/ai/blob/main/packages/ai/src/custom-events.ts#L42)

***

### type

```ts
type: "create" | "change" | "delete";
```

Defined in: [packages/ai/src/custom-events.ts:37](https://github.com/TanStack/ai/blob/main/packages/ai/src/custom-events.ts#L37)
