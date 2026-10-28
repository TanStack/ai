---
id: VADConfig
title: VADConfig
---

Defined in: packages/ai/src/realtime/types.ts:12

Voice activity detection configuration

## Properties

### prefixPaddingMs?

```ts
optional prefixPaddingMs?: number;
```

Defined in: packages/ai/src/realtime/types.ts:16

Audio to include before speech detection (ms)

***

### silenceDurationMs?

```ts
optional silenceDurationMs?: number;
```

Defined in: packages/ai/src/realtime/types.ts:18

Silence duration to end turn (ms)

***

### threshold?

```ts
optional threshold?: number;
```

Defined in: packages/ai/src/realtime/types.ts:14

Sensitivity threshold (0.0-1.0)
