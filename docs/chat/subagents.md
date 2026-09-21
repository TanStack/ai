---
title: Subagents
id: subagents
order: 4
description: "Delegate a turn to a named child agent. The stream tags that work with AG-UI subagent events, and the UI shows a nested part."
keywords:
  - tanstack ai
  - subagents
  - defineAgent
  - router
  - AG-UI
---

You want a specialist to handle some turns (research, writing, a sandbox harness) while the parent chat stays one conversation. `chat({ subagents })` starts that child, tags its events with `subagentRunId`, and the client stores the work in a `type: 'subagent'` part.

## Define a child

`run` is a `chat()` call. The child can use tools, MCP, interrupts, and its own nested `subagents`.

```ts
import { chat, defineAgent } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'

const researcher = defineAgent({
  name: 'researcher',
  description: 'Looks up facts and sources',
  run: (ctx) =>
    chat({
      adapter: openaiText('gpt-5.6'),
      messages: ctx.messages,
      threadId: ctx.threadId,
      runId: ctx.runId,
    }),
})
```

## Route, or let the model pick

All spawn options live on `subagents`. Do not put `agents` or `router` on the root of `chat()`.

**With a router.** The library calls your function, then starts that agent. It does not send subagent tools to the model.

```ts
const stream = chat({
  adapter: openaiText('gpt-5.6'),
  messages,
  subagents: {
    agents: [researcher],
    strategy: 'exclusive',
    router: async ({ agents }) => {
      const result = await decide({
        adapter: typesafeDecider('jev-latest'),
        state: messages,
        questions: {
          target: choice({
            instructions: 'Who must handle this turn?',
            options: {
              main: 'General chat',
              ...Object.fromEntries(
                agents.map((agent) => [agent.name, agent.description]),
              ),
            },
          }),
        },
      })
      return result.target.value
    },
  },
})
```

`choice` options must include `main` plus every agent name.

The router can return `'main'`, one agent name, or an array of names. An array starts those children together.

**Without a router.** The library adds one synthetic server tool per agent. The main model calls that tool. The public stream still emits `SUBAGENT_STARTED` / `SUBAGENT_FINISHED` (or `SUBAGENT_ERROR`) and nested parts. The UI does not treat spawn as a normal tool card.

## Strategy

- `exclusive` (default): the chosen child owns the turn. Main does not answer after it.
- `handoff`: the child streams first. Then main runs with the new child text in the messages.

`sandbox: 'own'` (default) keeps the parent sandbox on the parent run. `sandbox: 'inherit'` copies the parent thread into the child. Inherit plus two children in one turn throws.

## Client

`useChat().subagents[i]` and `messages.parts[n].subagent` are the same live object. Call `stop()` on either one. The client marks that child as error and ignores later events for that id. Abort of the parent `chat({ abortController })` stops running children and emits `SUBAGENT_ERROR`.

```ts
const part = message.parts.find((p) => p.type === 'subagent')
part?.subagent.stop()
```

See [Stream Events](./stream-events) for `SUBAGENT_*` and `subagentRunId`.
