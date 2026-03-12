---
id: RealtimeStateChangeCallback
title: RealtimeStateChangeCallback
---

# Type Alias: RealtimeStateChangeCallback

```ts
type RealtimeStateChangeCallback = (state: RealtimeClientState) => void;
```

Defined in: [ai-client/src/realtime-types.ts](https://github.com/TanStack/ai/blob/main/packages/typescript/ai-client/src/realtime-types.ts)

Callback function invoked when the realtime client state changes. Receives the full current `RealtimeClientState`.
