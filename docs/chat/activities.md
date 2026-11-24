---
title: Activities
id: activities
order: 7
description: "Show the progress or the pending state of a tool or a middleware as a typed row in useChat. Chat persistence keeps the row after a reload."
keywords:
  - tanstack ai
  - activities
  - defineActivityType
  - emitActivity
  - progress
  - pending state
  - ACTIVITY_SNAPSHOT
---

Define an activity type with `defineActivityType`, then call `emitActivity` from a server tool or a middleware. The client gets a typed row in `messages`, and chat persistence keeps that row after a reload.

For a high-volume stream, such as log lines, use [custom events](../protocol/custom-events).

## Quick setup

### 1. Define the activity type

Put the definition in a module that the server and the client both import:

```ts
// activities.ts
import { defineActivityType } from '@tanstack/ai'
import { z } from 'zod'

export const deployProgress = defineActivityType({
  activityType: 'deploy.progress',
  contentSchema: z.object({ step: z.number(), total: z.number() }),
})
```

- `activityType`: the name of the type. The client reads it as `part.activityType`.
- `contentSchema`: a Standard Schema, such as a Zod schema. It gives the type of the content, and it checks the content on each call. The content must be an object, and the schema must have `validate`. A schema that has only JSON Schema is a compile error.

### 2. Emit it from a server tool

Call `context?.emitActivity?.(definition, id, content)` in the tool. The `id` names the row. Each call with the same `id` replaces the content of that row:

```ts
// tools.ts
import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'
import { deployProgress } from './activities'

// Stands in for one deploy step, such as a build or an upload.
const runStep = () => new Promise((resolve) => setTimeout(resolve, 2000))

export const deploy = toolDefinition({
  name: 'deploy',
  description: 'Deploy an app to production',
  inputSchema: z.object({ app: z.string() }),
}).server(async ({ app }, context) => {
  const id = `deploy-${context?.toolCallId}`
  const total = 3
  for (let step = 0; step < total; step++) {
    context?.emitActivity?.(deployProgress, id, { step, total })
    await runStep()
  }
  context?.emitActivity?.(deployProgress, id, { step: total, total })
  return { deployed: app }
})
```

Here `step` counts the finished steps. The last call sets `step` to `total`.

Give the tool to `chat()`:

```ts
// api/chat.ts
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { deploy } from './tools'

export async function POST(request: Request) {
  const params = await chatParamsFromRequest(request)
  const stream = chat({
    adapter: openaiText('gpt-6.1-sol'),
    messages: params.messages,
    threadId: params.threadId,
    runId: params.runId,
    tools: [deploy],
  })
  return toServerSentEventsResponse(stream)
}
```

### 3. Read it in the client

Each row is a message with `role: 'activity'` and one part with `type: 'activity'`. Pass the definition to `useChat({ activities })`. Then `part.activityType === 'deploy.progress'` gives `part.content` its type:

```tsx
// chat.tsx
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'
import { deployProgress } from './activities'

export function Chat() {
  const { messages, sendMessage, isLoading } = useChat({
    connection: fetchServerSentEvents('/api/chat'),
    threadId: 'deploy-chat',
    activities: [deployProgress],
  })

  return (
    <>
      <button onClick={() => sendMessage('Deploy the shop app')}>Deploy</button>
      {messages.map((message) => (
        <div key={message.id}>
          {message.parts.map((part, index) => {
            if (part.type === 'text') {
              return <p key={index}>{part.content}</p>
            }
            if (part.type !== 'activity' || part.activityType !== 'deploy.progress') {
              return null
            }
            const { step, total } = part.content
            if (step === total) {
              return <p key={index}>Deployed.</p>
            }
            // A row that is not done is live only while the run streams.
            return isLoading ? (
              <p key={index}>
                Deploying: {step} of {total} steps done...
              </p>
            ) : null
          })}
        </div>
      ))}
    </>
  )
}
```

`activities` only gives the types. The client does not check the content that it gets.

Do you render with `createChatUI` or `createChatHook`? Give each activity type its own component with `activitiesComponents`. See [React Chat UI](../ui/react).

### 4. Try it

Click Deploy. The model calls the `deploy` tool. A row shows "Deploying: 0 of 3 steps done..." and counts up every two seconds. At the end, it says "Deployed."

## Keep the row after a reload

Add [chat persistence](../persistence/chat-persistence). `withPersistence` saves the rows, and `reconstructChat` gives them back.

1. Add `withPersistence` and a `GET` to the route. `memoryPersistence()` has an `activities` store:

```ts
// api/chat.ts
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import {
  memoryPersistence,
  reconstructChat,
  withPersistence,
} from '@tanstack/ai-persistence'
import { deploy } from './tools'

// Use a durable backend in production.
const persistence = memoryPersistence()

export async function POST(request: Request) {
  const params = await chatParamsFromRequest(request)
  const stream = chat({
    adapter: openaiText('gpt-6.1-sol'),
    messages: params.messages,
    threadId: params.threadId,
    runId: params.runId,
    tools: [deploy],
    middleware: [withPersistence(persistence)],
  })
  return toServerSentEventsResponse(stream)
}

export function GET(request: Request): Promise<Response> {
  // Add `authorize` in a multi-user app. See Client persistence.
  return reconstructChat(persistence, request)
}
```

2. In the client, add `persistence: true` to the `useChat` options of step 3.
3. Click Deploy, and wait until the row says "Deployed." Then reload the page.

The "Deployed." row comes back from the store.

For a run that still streams:

- **`withPersistence` saves on each change.** It saves the rows on each activity change of the run. A reload gets each row with its last saved content.
- **A durable transport follows the run.** To get the next updates after a reload, use [resumable streams](../resumable-streams/overview). The client joins the run again, the run log replays the rows, and `isLoading` is `true` again.
- **A row from a middleware `setup` is saved at once, before the run starts.** A run that fails or stops in `setup` keeps the rows that it sent.
- **A row that is not done can be out of date.** A lost connection or a server crash can leave it in the middle. That is why the snippet in step 3 shows it only while `isLoading` is `true`.

For your own backend, add an `activities` store. See [AG-UI activity rows on reload](../persistence/chat-persistence-advanced#ag-ui-activity-rows-on-reload).

## Emit from a middleware

A middleware can send a row too, for example while it loads data before the model starts. Middleware always has `ctx.emitActivity`, so you call it without `?.`.

1. Add a type for it to `activities.ts`:

```ts
// activities.ts
import { defineActivityType } from '@tanstack/ai'
import { z } from 'zod'

export const deployProgress = defineActivityType({
  activityType: 'deploy.progress',
  contentSchema: z.object({ step: z.number(), total: z.number() }),
})

export const filesStatus = defineActivityType({
  activityType: 'files.status',
  contentSchema: z.object({ status: z.enum(['loading', 'ready']) }),
})
```

2. Call `ctx.emitActivity` in a hook:

```ts
// load-files.ts
import type { ChatMiddleware } from '@tanstack/ai'
import { filesStatus } from './activities'

// Stands in for your own slow work, such as a database read.
const loadProjectFiles = () => new Promise((resolve) => setTimeout(resolve, 2000))

export const loadFiles: ChatMiddleware = {
  name: 'load-files',
  async onStart(ctx) {
    const id = `files-${ctx.runId}`
    ctx.emitActivity(filesStatus, id, { status: 'loading' })
    await loadProjectFiles()
    ctx.emitActivity(filesStatus, id, { status: 'ready' })
  },
}
```

3. Add `loadFiles` to `middleware` in `chat()`. Add `filesStatus` to `activities` in `useChat`.

Each run now starts with a `files.status` row that goes from `loading` to `ready`. The engine sends each update immediately, also while the hook still waits.

## Built-in activity types

`useChat` types two built-in types. They need no entry in `activities`:

| `activityType` | Sent by | Guide |
| --- | --- | --- |
| `sandbox.status` | `withSandbox`, while the sandbox starts | [Show a pending state while the sandbox starts](../sandbox/events#show-a-pending-state-while-the-sandbox-starts) |
| `sandbox.approval` | The Claude Code, OpenCode, and ACP adapters, when an action waits for a decision | [Show an approval prompt](../sandbox/events#show-an-approval-prompt) |

Their definitions are `sandboxStatusActivity` and `sandboxApprovalActivity`, from `@tanstack/ai`.

To answer a pending `sandbox.approval` row, call `respondToSandboxApproval(approvalId, granted)` from `useChat`. See [Show an approval prompt](../sandbox/events#show-an-approval-prompt).

## Read a type that you did not declare

`===` accepts only the built-in names and the names in `activities`, so a typo is a compile error. For any other type, call the `is()` of its definition. `is()` takes any value, so a card can check the part itself:

```tsx
// review-card.tsx
import { defineActivityType } from '@tanstack/ai'
import { z } from 'zod'

export const reviewStatus = defineActivityType({
  activityType: 'review.status',
  contentSchema: z.object({ reviewer: z.string() }),
})

export function ReviewCard({ part }: { part: unknown }) {
  if (!reviewStatus.is(part)) {
    return null
  }
  return <p>Waiting for a review from {part.content.reviewer}.</p>
}
```

Render `<ReviewCard part={part} />` for each part. The card shows only the `review.status` rows, with typed content. It works in any chat, also in a chat with no `activities`.

A type that no check selects still gets to the last `else`, or to the `default` branch of a `switch`. There, `content` is `Record<string, unknown>`.

## Things to know

- **Pick an id that no message has**, for example `deploy-<toolCallId>`. If the id is the id of a message, the engine logs a warning and does not keep the row.
- **The schema checks each call.** Bad content makes `emitActivity` throw a `TypeError`. In a tool, the tool call fails, and the model gets the error. The check is synchronous, so a schema with an async check also makes it throw.
- **`chat()` gives a tool `emitActivity`, also through the [sandbox tool bridge](../sandbox/tools).** A tool has no `emitActivity` on an MCP server, in WebMCP, or in a direct `execute()` call. That is why step 2 calls it with `?.`.
- **Each call sends one AG-UI `ACTIVITY_SNAPSHOT` event** with the full content.
- **The model never gets activity rows as input.**
