---
id: VADConfig
title: VADConfig
---

# Interface: VADConfig

Defined in: [packages/typescript/ai/src/realtime/types.ts:8](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/realtime/types.ts#L8)

Voice activity detection configuration

## Properties

### prefixPaddingMs?

```ts
optional prefixPaddingMs: number;
```

Defined in: [packages/typescript/ai/src/realtime/types.ts:12](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/realtime/types.ts#L12)

Audio to include before speech detection (ms)

***

### silenceDurationMs?

```ts
optional silenceDurationMs: number;
```

Defined in: [packages/typescript/ai/src/realtime/types.ts:14](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/realtime/types.ts#L14)

Silence duration to end turn (ms)

***

### threshold?

```ts
optional threshold: number;
```

Defined in: [packages/typescript/ai/src/realtime/types.ts:10](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/realtime/types.ts#L10)

Sensitivity threshold (0.0-1.0)
