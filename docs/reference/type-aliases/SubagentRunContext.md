---
id: SubagentRunContext
title: SubagentRunContext
---

```ts
type SubagentRunContext<TInput> = SubagentRunInput<TInput> & BoundActivities & object;
```

Defined in: packages/ai/src/activities/chat/agents/define-agent.ts:64

Context the library passes into [defineAgent](../functions/defineAgent.md) `run`.

- `forward` holds the fields a child `chat()` needs, in one spread:
  `chat({ adapter, messages, ...ctx.forward })`.
- The activity functions (`ctx.chat`, `ctx.generateImage`, and the rest)
  take the same options as the plain functions and fill in the thread id,
  a run id, the abort signal, and any middleware a host adds.
- `keys` finds provider keys. `await ctx.keys.adapter(adapter)` builds a
  `keyedAdapter(...)`. The keys come from `subagents.keys`, else from each
  provider's `env` names. A missing key throws an error that names the env
  var.

## Type Declaration

### forward

```ts
forward: SubagentForward;
```

### keys

```ts
keys: ProviderKeys;
```

## Type Parameters

### TInput

`TInput` *extends* [`SchemaInput`](SchemaInput.md) \| `undefined` = `any`
