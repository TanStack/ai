---
id: VADConfig
title: VADConfig
---

# Interface: VADConfig

Defined in: [packages/ai/src/realtime/types.ts:12](https://github.com/TanStack/ai/blob/main/packages/ai/src/realtime/types.ts#L12)

Voice activity detection configuration

## Properties

### prefixPaddingMs?

```ts
optional prefixPaddingMs: number;
```

Defined in: [packages/ai/src/realtime/types.ts:16](https://github.com/TanStack/ai/blob/main/packages/ai/src/realtime/types.ts#L16)

Audio to include before speech detection (ms)

***

### silenceDurationMs?

```ts
optional silenceDurationMs: number;
```

Defined in: [packages/ai/src/realtime/types.ts:18](https://github.com/TanStack/ai/blob/main/packages/ai/src/realtime/types.ts#L18)

Silence duration to end turn (ms)

***

### threshold?

```ts
optional threshold: number;
```

Defined in: [packages/ai/src/realtime/types.ts:14](https://github.com/TanStack/ai/blob/main/packages/ai/src/realtime/types.ts#L14)

Sensitivity threshold (0.0-1.0)
