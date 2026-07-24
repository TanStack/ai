---
id: RealtimeToolConfig
title: RealtimeToolConfig
---

# Interface: RealtimeToolConfig

Defined in: [packages/ai/src/realtime/types.ts:25](https://github.com/TanStack/ai/blob/main/packages/ai/src/realtime/types.ts#L25)

Serializable tool descriptor for realtime session configuration.
Contains only the metadata needed by providers, not Zod schemas or execute functions.

## Properties

### description

```ts
description: string;
```

Defined in: [packages/ai/src/realtime/types.ts:27](https://github.com/TanStack/ai/blob/main/packages/ai/src/realtime/types.ts#L27)

***

### inputSchema?

```ts
optional inputSchema: Record<string, any>;
```

Defined in: [packages/ai/src/realtime/types.ts:28](https://github.com/TanStack/ai/blob/main/packages/ai/src/realtime/types.ts#L28)

***

### name

```ts
name: string;
```

Defined in: [packages/ai/src/realtime/types.ts:26](https://github.com/TanStack/ai/blob/main/packages/ai/src/realtime/types.ts#L26)

***

### outputSchema?

```ts
optional outputSchema: Record<string, any>;
```

Defined in: [packages/ai/src/realtime/types.ts:29](https://github.com/TanStack/ai/blob/main/packages/ai/src/realtime/types.ts#L29)
