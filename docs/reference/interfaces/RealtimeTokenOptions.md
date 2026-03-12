---
id: RealtimeTokenOptions
title: RealtimeTokenOptions
---

# Interface: RealtimeTokenOptions

Defined in: [realtime/types.ts](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/realtime/types.ts)

Options for the `realtimeToken()` function.

## Properties

### adapter

```ts
adapter: RealtimeTokenAdapter;
```

The token adapter to use. Each provider has its own token adapter:

- `openaiRealtimeToken()` from `@tanstack/ai-openai`
- `elevenlabsRealtimeToken()` from `@tanstack/ai-elevenlabs`
