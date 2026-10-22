---
id: AgentProduces
title: AgentProduces
---

```ts
type AgentProduces = 
  | "text"
  | "image"
  | "video"
  | "audio"
  | "speech"
  | "voice"
  | "transcription"
  | "embedding"
  | "world"
  | "liveVideo"
  | string & object;
```

Defined in: packages/ai/src/activities/chat/agents/define-agent.ts:75

What an agent makes. Informative: a host can use it to find an agent by
the kind of output it produces.
