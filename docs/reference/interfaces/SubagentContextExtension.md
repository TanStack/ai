---
id: SubagentContextExtension
title: SubagentContextExtension
---

Defined in: [packages/ai/src/activities/chat/agents/define-agent.ts:78](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/agents/define-agent.ts#L78)

What a host adds to `ctx` through `SubagentBinding.extend`. Empty here: a
host package augments it, so its fields type-check on `ctx` in every `run`.
Make each field optional: a run that a plain `chat()` starts has no host,
so it has none of them.
