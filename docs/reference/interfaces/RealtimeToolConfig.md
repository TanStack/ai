---
id: RealtimeToolConfig
title: RealtimeToolConfig
---

Defined in: packages/ai/src/realtime/types.ts:25

Serializable tool descriptor for realtime session configuration.
Contains only the metadata needed by providers, not Zod schemas or execute functions.

## Properties

### description

```ts
description: string;
```

Defined in: packages/ai/src/realtime/types.ts:27

***

### inputSchema?

```ts
optional inputSchema?: Record<string, any>;
```

Defined in: packages/ai/src/realtime/types.ts:28

***

### name

```ts
name: string;
```

Defined in: packages/ai/src/realtime/types.ts:26

***

### outputSchema?

```ts
optional outputSchema?: Record<string, any>;
```

Defined in: packages/ai/src/realtime/types.ts:29
