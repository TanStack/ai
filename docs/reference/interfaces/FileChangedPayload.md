---
id: FileChangedPayload
title: FileChangedPayload
---

# Interface: FileChangedPayload

Defined in: [packages/ai/src/custom-events.ts:35](https://github.com/TanStack/ai/blob/main/packages/ai/src/custom-events.ts#L35)

## Properties

### diff?

```ts
optional diff: string;
```

Defined in: [packages/ai/src/custom-events.ts:40](https://github.com/TanStack/ai/blob/main/packages/ai/src/custom-events.ts#L40)

Unified diff, when the harness can produce one.

***

### path

```ts
path: string;
```

Defined in: [packages/ai/src/custom-events.ts:38](https://github.com/TanStack/ai/blob/main/packages/ai/src/custom-events.ts#L38)

Absolute path inside the sandbox (under the workspace root).

***

### timestamp

```ts
timestamp: number;
```

Defined in: [packages/ai/src/custom-events.ts:41](https://github.com/TanStack/ai/blob/main/packages/ai/src/custom-events.ts#L41)

***

### type

```ts
type: "create" | "change" | "delete";
```

Defined in: [packages/ai/src/custom-events.ts:36](https://github.com/TanStack/ai/blob/main/packages/ai/src/custom-events.ts#L36)
