---
title: Subagents
id: subagents
order: 4
description: "Give some turns to a named child agent, such as a researcher or a writer. The parent chat stays one conversation, and the UI shows the child as a card."
keywords:
  - tanstack ai
  - subagents
  - defineAgent
  - router
  - sandbox
  - AG-UI
---

A subagent runs one job, such as research or a sandbox task, inside the same conversation. The user still sees one thread.

A subagent is a named child agent. Give it to `chat({ subagents })`, and the parent model can start it like a tool. The client shows the work of the child as a card inside the assistant message.

Want a full TanStack Start app with a researcher, an SEO agent, and a writer? Open the [Subagents tutorial](../tutorials/subagents).

## Quick setup

### 1. Define a child and give it to `chat()`

`run` is the work of the child. Here it is a chat call with its own model. `ctx.chat` fills in the ids, the parent conversation, and the abort signal for you.

```ts
// api/chat.ts
import {
  chat,
  chatParamsFromRequest,
  defineAgent,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'

const researcher = defineAgent({
  name: 'researcher',
  description: 'Looks up facts and sources',
  run: (ctx) => ctx.chat({ adapter: openaiText('gpt-6.1-sol') }),
})

export async function POST(request: Request) {
  const params = await chatParamsFromRequest(request)
  const stream = chat({
    adapter: openaiText('gpt-6.1-sol'),
    messages: params.messages,
    threadId: params.threadId,
    runId: params.runId,
    subagents: { agents: [researcher] },
  })
  return toServerSentEventsResponse(stream)
}
```

### 2. Show the child in the client

A child arrives as a part with `type: 'subagent'`. Show its name, its status, and its text:

```tsx
import { useState } from 'react'
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'

export function Chat() {
  const [input, setInput] = useState('')
  const { messages, sendMessage } = useChat({
    connection: fetchServerSentEvents('/api/chat'),
    threadId: 'support-chat',
  })

  return (
    <>
      {messages.map((message) => (
        <div key={message.id}>
          {message.parts.map((part, index) => {
            if (part.type === 'text') {
              return <p key={index}>{part.content}</p>
            }
            if (part.type === 'subagent') {
              return (
                <section key={part.subagent.id}>
                  <strong>
                    {part.subagent.name} ({part.subagent.status})
                  </strong>
                  {part.subagent.messages.flatMap((child) =>
                    child.parts.map((childPart, childIndex) =>
                      childPart.type === 'text' ? (
                        <p key={`${child.id}-${childIndex}`}>
                          {childPart.content}
                        </p>
                      ) : null,
                    ),
                  )}
                </section>
              )
            }
            return null
          })}
        </div>
      ))}
      <form
        onSubmit={(event) => {
          event.preventDefault()
          if (input.trim() === '') {
            return
          }
          sendMessage(input)
          setInput('')
        }}
      >
        <input value={input} onChange={(event) => setInput(event.target.value)} />
        <button type="submit">Send</button>
      </form>
    </>
  )
}
```

### 3. Try it

Send "Find three facts about squids". The parent model calls the `researcher` tool. A `researcher` card appears with the status `running`, fills with the text of the child, and then shows `finished`.

## How it works

- The library adds one server tool for each agent. The parent model decides when to call it, and it can also skip it.
- The model can pass the task as `prompt`. The child gets it as the last user message, after the conversation as it is at that tool call.
- The events of the child stream while the tool runs. Each event carries `subagentRunId`, between `SUBAGENT_STARTED` and `SUBAGENT_FINISHED` (or `SUBAGENT_ERROR`).
- The client puts that work in a `type: 'subagent'` part. The UI does not show it as a normal tool card.
- The text of the child becomes the tool result, and the parent model continues from there.
- The parent `RUN_FINISHED.usage` includes the token usage of every child.

A child can use tools, MCP, interrupts, and its own nested `subagents`. It can also return a plain value or make an image. See [Return a value, or call any activity](./subagents-advanced#return-a-value-or-call-any-activity).

## Route, or let the model pick

Without a router, the parent model picks the child. With a router, your code picks it, and the library sends no subagent tools to the model.

Put all spawn options on `subagents`. Do not put `agents` or `router` on the root of `chat()`.

Here a Jev decider picks the target. Its `choice` options must include `main` plus every agent name:

```ts
import { chat, choice, decide, defineAgent } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { typesafeDecider } from '@tanstack/ai-typesafe'

const messages = [{ role: 'user' as const, content: 'Capital of France?' }]

const researcher = defineAgent({
  name: 'researcher',
  description: 'Looks up facts and sources',
  run: (ctx) => ctx.chat({ adapter: openaiText('gpt-6.1-sol') }),
})

const stream = chat({
  adapter: openaiText('gpt-6.1-sol'),
  messages,
  threadId: 'thread-1',
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

The router returns `'main'` to keep the turn on the parent, or an agent name. `strategy` sets what happens after the child:

- `exclusive` (default): the chosen child owns the turn. Main does not answer after it.
- `handoff`: the child streams first. Then main runs with the new child text in the messages.

A router can also start several agents, in parallel or one after another, and give each one an input. See [Router picks](./subagents-advanced#router-picks).

## Let the model write the brief

In a long thread, the child gets the full conversation at the tool call, with every earlier tool result. Each parallel child gets its own copy, and the child must find its task in it.

Add `inputSchema` to the agent. The parent model then writes the input of the child when it calls the tool. `run` reads that input as `ctx.input`:

```ts
import { chat, defineAgent } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { z } from 'zod'

const messages = [
  { role: 'user' as const, content: 'Compare pricing for the vendors we picked' },
]

const researcher = defineAgent({
  name: 'researcher',
  description: 'Researches one focused question and returns sourced findings',
  inputSchema: z.object({
    task: z
      .string()
      .describe('What to find and what to return. The researcher sees only this text.'),
  }),
  run: (ctx) =>
    chat({
      adapter: openaiText('gpt-6.1-sol'),
      messages: [{ role: 'user', content: ctx.input.task }],
      threadId: ctx.threadId,
      runId: ctx.runId,
      parentRunId: ctx.parentRunId,
      subagentRunId: ctx.subagentRunId,
      resume: ctx.resume,
    }),
})

const stream = chat({
  adapter: openaiText('gpt-6.1-sol'),
  messages,
  threadId: 'thread-1',
  subagents: { agents: [researcher] },
})
```

- `ctx.input` has the type of the schema. Here it is `{ task: string }`.
- If the input does not match the schema, the model gets a tool error and can call the tool again. The child does not start.
- `ctx.messages` still holds the parent conversation. If the child needs more context, add parts of it.
- A resumed child gets the same `ctx.input` as the first run.

When you call the plain `chat()` in `run`, pass every `ctx` id and `resume` to it, as in this sample. A child that stops for an approval needs `parentRunId` and `resume` to continue. `...ctx.forward` passes all of them in one spread.

To show the brief on the card, see [Show the brief on a card](./subagents-advanced#show-the-brief-on-a-card).

## Continue a child

Each tool call starts a new child. Sometimes the model must send a follow-up to a child that already answered, like "make it shorter".

Add `withPersistence` to the parent `chat()`. Each result then gives the model the `subagentRunId` of the child, and the model continues that child with `sessionId`:

```ts
import {
  chat,
  chatParamsFromRequest,
  defineAgent,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { memoryPersistence, withPersistence } from '@tanstack/ai-persistence'

const writer = defineAgent({
  name: 'writer',
  description: 'Writes and edits drafts',
  run: (ctx) => ctx.chat({ adapter: openaiText('gpt-6.1-sol') }),
})

// A continued child loads from this store. Use a durable backend in production.
const persistence = memoryPersistence()

export async function POST(request: Request) {
  const params = await chatParamsFromRequest(request)
  const stream = chat({
    adapter: openaiText('gpt-6.1-sol'),
    messages: params.messages,
    threadId: params.threadId,
    runId: params.runId,
    middleware: [withPersistence(persistence)],
    subagents: { agents: [writer] },
  })
  return toServerSentEventsResponse(stream)
}
```

The model continues the writer like this:

1. The model calls `writer` with `{ "prompt": "Draft a post about tides" }`.
2. It gets `{ "subagentRunId": "subagent-1767225600000-x7k2m9q", "result": "Tides rise twice a day..." }`.
3. In a later turn, it calls `writer` with `{ "sessionId": "subagent-1767225600000-x7k2m9q", "prompt": "Make it shorter" }`.

The writer gets the task of its first call, its stored transcript, then `Make it shorter` as the last user message. The stream uses the same `subagentRunId`, so the client shows the new work on the same card.

For every field of the tool input, and the errors a wrong call gets, see [The tool input](./subagents-advanced#the-tool-input).

## Interrupts in a child

Some child work needs a person first, for example deleting a file. Give that child tool `needsApproval: true`. The child stops, and the parent run ends with the interrupt of the child. The client answers it like any other interrupt, and the next run continues the same child.

1. Share one tool definition between the server and the client:

```typescript title="tools.ts"
import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'

export const deleteFile = toolDefinition({
  name: 'deleteFile',
  description: 'Delete a file',
  needsApproval: true,
  inputSchema: z.object({ path: z.string() }),
})
```

2. Give the child the server tool. Pass the resume fields from the request to the parent `chat()`:

```typescript title="route.ts"
import {
  chat,
  chatParamsFromRequest,
  defineAgent,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { deleteFile } from './tools'

const cleaner = defineAgent({
  name: 'cleaner',
  description: 'Deletes old files',
  run: (ctx) =>
    chat({
      adapter: openaiText('gpt-6.1-sol'),
      messages: ctx.messages,
      threadId: ctx.threadId,
      runId: ctx.runId,
      parentRunId: ctx.parentRunId,
      subagentRunId: ctx.subagentRunId,
      resume: ctx.resume,
      tools: [deleteFile.server(({ path }: { path: string }) => ({ deleted: path }))],
    }),
})

export async function POST(request: Request) {
  const params = await chatParamsFromRequest(request)
  const stream = chat({
    adapter: openaiText('gpt-6.1-sol'),
    messages: params.messages,
    threadId: params.threadId,
    runId: params.runId,
    ...(params.parentRunId ? { parentRunId: params.parentRunId } : {}),
    ...(params.resume ? { resume: params.resume } : {}),
    subagents: { agents: [cleaner], router: () => 'cleaner' },
  })

  return toServerSentEventsResponse(stream)
}
```

3. Register the same definition on the client, and answer the interrupt:

```tsx title="cleanup-panel.tsx"
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'
import { deleteFile } from './tools'

export function CleanupPanel() {
  const chat = useChat({
    connection: fetchServerSentEvents('/api/chat'),
    threadId: 'support-chat',
    tools: [deleteFile.client()],
  })

  return (
    <section>
      <button onClick={() => chat.sendMessage('Clean up old files')}>
        Clean up
      </button>
      {chat.interrupts.map((interrupt) =>
        interrupt.kind === 'tool-approval' ? (
          <button key={interrupt.id} onClick={() => interrupt.resolveInterrupt(true)}>
            Approve delete
          </button>
        ) : null,
      )}
    </section>
  )
}
```

While the child waits, its card has `status: 'suspended'` and `interruptIds`. After you approve, the card shows the tool result and the reply of the child. Client tools in a child work the same way.

How the resume continues:

- With a router, the resume uses the plan that the router picked in the first run. It does not call the router again. If the router gave an agent of that plan an input, the resume fails.
- Without a router, the tool call of the child stays open until the resume. Then the parent model reads the result of the child.
- The result content carries the output or the error of the child. It carries `subagentRunId` only when the model can continue the child: with a persistence store, or for a background child. Otherwise the id stays in the subagent events.

## Limit the tree

A child can have children of its own, and a model can call a child many times. Set `limits` so one request cannot start a tree with no end:

```ts
import { chat, defineAgent } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'

const researcher = defineAgent({
  name: 'researcher',
  description: 'Looks up facts',
  run: (ctx) => ctx.chat({ adapter: openaiText('gpt-6.1-sol') }),
})

const stream = chat({
  adapter: openaiText('gpt-6.1-sol'),
  messages: [{ role: 'user', content: 'Research squids in depth' }],
  threadId: 'thread-1',
  subagents: {
    agents: [researcher],
    limits: { maxDepth: 2, maxConcurrent: 3, maxCalls: 12, timeoutMs: 120_000 },
  },
})
```

- `maxDepth`: how deep the tree can grow. The first chat is depth 0.
- `maxCalls`: how many children the whole tree can start.
- `maxConcurrent`: how many children one run can have running at the same time.
- `timeoutMs`: how long one child can run. A child never gets more time than its parent has left.

A refused start reaches the model as a tool error, for example `subagent limit reached (maxCalls 12)`. For the full list, see [Limit details](./subagents-advanced#limit-details).

## Persistence

Put `withPersistence` on the parent `chat()` only. The parent stores each child:

- the child run, linked to the parent run
- the full child transcript
- the pending interrupts of the child
- the card status

A reload then shows every card, and a resume continues a waiting child. See [Subagent cards on reload](../persistence/chat-persistence-advanced#subagent-cards-on-reload).

> [!WARNING]
> Do not add `withPersistence` to a child `chat()` too. The child does not know that it runs as a subagent, so it stores the same child again under its own run and thread ids. Its interrupt records then conflict with the records of the parent, and a reload can lose the pending approval.

## Advanced

For router plans, the tool input, value results, keys, middleware, sandboxes, and custom cards with `createChatHook`, see [Subagents: Advanced](./subagents-advanced).
