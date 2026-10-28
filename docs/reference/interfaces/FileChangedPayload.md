---
id: FileChangedPayload
title: FileChangedPayload
---

Defined in: packages/ai/src/custom-events.ts:35

## Properties

### diff?

```ts
optional diff?: string;
```

Defined in: packages/ai/src/custom-events.ts:40

Unified diff, when the harness can produce one.

***

### path

```ts
path: string;
```

Defined in: packages/ai/src/custom-events.ts:38

Absolute path inside the sandbox (under the workspace root).

***

### timestamp

```ts
timestamp: number;
```

Defined in: packages/ai/src/custom-events.ts:41

***

### type

```ts
type: "create" | "change" | "delete";
```

Defined in: packages/ai/src/custom-events.ts:36
