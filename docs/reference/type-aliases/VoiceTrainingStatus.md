---
id: VoiceTrainingStatus
title: VoiceTrainingStatus
---

```ts
type VoiceTrainingStatus = "ready" | "training" | "failed";
```

Defined in: [packages/ai/src/types.ts:2627](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2627)

Whether a created voice is usable.

- `'ready'` — usable in `generateSpeech()` now. Every adapter today returns
  this, because they all finish the voice inside `generateVoice()`.
- `'training'` — the provider accepted the request but is still building
  the voice, so it is not usable yet. Reserved for providers that train
  asynchronously; no adapter returns it yet, and reading the state back
  will land with the first adapter that needs it.
- `'failed'` — the provider finished without producing a usable voice.
