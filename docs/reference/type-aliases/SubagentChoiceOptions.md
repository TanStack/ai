---
id: SubagentChoiceOptions
title: SubagentChoiceOptions
---

```ts
type SubagentChoiceOptions<TAgents> = object & { [K in TAgents[number]["name"]]: string };
```

Defined in: [packages/ai/src/activities/chat/agents/define-agent.ts:72](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/agents/define-agent.ts#L72)

Choice options for a `decide()` router. `main` is required plus every agent name.

## Type Declaration

### main

```ts
main: string;
```

## Type Parameters

### TAgents

`TAgents` *extends* `ReadonlyArray`\<[`DefinedAgent`](../interfaces/DefinedAgent.md)\>
