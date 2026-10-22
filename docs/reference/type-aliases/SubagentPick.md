---
id: SubagentPick
title: SubagentPick
---

```ts
type SubagentPick = 
  | string
  | {
  input?: unknown;
  name: string;
};
```

Defined in: packages/ai/src/activities/chat/agents/spawn.ts:69

One agent in a router pick: its name, or its name and its input. An agent
with `inputSchema` needs `{ name, input }`, and no other agent takes an
input. `chat()` checks both when the turn starts. The type does not. The
input is checked against the schema, and `run` reads it as `ctx.input`.
