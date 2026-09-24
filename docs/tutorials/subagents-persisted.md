---
title: Persisted subagents
id: subagents-persisted
order: 6
description: "Keep the blog desk after a refresh. Subagent cards come back, and a live run continues."
---

Finish the [Subagents](./subagents) tutorial first. A refresh on that desk drops every card.

This page saves the thread on the server. A closed tab leaves the run in progress. A refresh shows the cards again. If a run is still in progress, the same run continues.

The copy in this tutorial lives in the dev server process. If you restart that process, the chat is gone. A database that saves the same fields keeps the chat.

## 1. Install the persistence package

You already have `@tanstack/ai` and `@tanstack/ai-react`. Add the store package.

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai-persistence

<!-- ::end:tabs -->

## 2. Keep one thread id

Create `src/lib/thread.ts`.

```typescript
export const THREAD_ID = 'blog-desk'
```

Use this same id on the client and on the server. A new id on each load starts an empty chat.

This example has no login, so every visitor shares the `blog-desk` thread. In a real app, make sure that the caller owns the thread before POST or GET reads or writes it.

## 3. Tell the hook that the server owns the chat

In `src/chat-ui.tsx`, replace `chatOptions` with this object.

Keep the message component, the input, and the text part. Step 5 replaces the researcher card.

In the layout, set the heading to `Saved blog desk`. Under that heading, add two sentences. A refresh keeps this chat. A refresh during a run continues the stream.

```tsx ignore
import { fetchServerSentEvents } from '@tanstack/ai-react'
import { blogAgents } from '@/lib/blog-agents'
import { byok } from '@/lib/byok'
import { THREAD_ID } from '@/lib/thread'

export const chatOptions = {
  connection: fetchServerSentEvents('/api/chat'),
  byok,
  threadId: THREAD_ID,
  persistence: true,
  subagents: blogAgents,
}
```

`persistence: true` does two things when the page opens.

1. The hook sends `GET ?threadId=blog-desk`.
2. The response is `{ messages, activeRun }`. The hook shows `messages`.

If `activeRun` is set, the hook joins that run. It sends `GET ?offset=-1&runId=` and plays the log. The cards continue from that log.

The next load reads the server copy.

## 4. Replace the chat route

Replace `src/routes/api.chat.ts` with this file. It is the full route from the example.

```ts ignore
import { createFileRoute } from '@tanstack/react-router'
import {
  chat,
  chatParamsFromRequest,
  decide,
  memoryStream,
  resumeServerSentEventsResponse,
  subagentRoute,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import {
  memoryPersistence,
  reconstructChat,
  withPersistence,
} from '@tanstack/ai-persistence'
import {
  createOpenRouterDecider,
  createOpenRouterText,
} from '@tanstack/ai-openrouter'
import { openrouterByok } from '@tanstack/ai-openrouter/byok'
import { byokMissing, getByokKey } from '@tanstack/ai/byok/server'
import { createBlogAgents } from '@/lib/agents'

const FIRST_CHUNK_MS = 30_000

const persistence = memoryPersistence()

export const Route = createFileRoute('/api/chat')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const params = await chatParamsFromRequest(request)
        const apiKey = getByokKey(request, openrouterByok.id)
        if (!apiKey) return byokMissing(openrouterByok)
        const agents = createBlogAgents(apiKey)
        const stream = chat({
          adapter: createOpenRouterText('openai/gpt-5.5', apiKey),
          messages: params.messages,
          threadId: params.threadId,
          runId: params.runId,
          middleware: [withPersistence(persistence)],
          ...(params.parentRunId !== undefined
            ? { parentRunId: params.parentRunId }
            : {}),
          ...(params.resume !== undefined ? { resume: params.resume } : {}),
          subagents: {
            agents,
            strategy: 'exclusive',
            router: async ({ messages, agents: routed, abortSignal }) => {
              const state = messages.at(-1)
              if (state === undefined) return 'main'
              const route = subagentRoute(routed, { then: ['writer'] })
              const result = await decide({
                adapter: createOpenRouterDecider(
                  '~typesafe/jev-latest',
                  apiKey,
                ),
                state,
                questions: route.questions,
                abortSignal,
              })
              return route.pick(result)
            },
          },
        })
        return toServerSentEventsResponse(stream, {
          durability: { adapter: memoryStream(request) },
        })
      },
      GET: ({ request }) => {
        const durability = memoryStream(request, {
          firstChunkDeadlineMs: FIRST_CHUNK_MS,
        })
        if (durability.resumeFrom() !== null) {
          return resumeServerSentEventsResponse({ adapter: durability })
        }
        return reconstructChat(persistence, request)
      },
    },
  },
})
```

One module-level `memoryPersistence()` is the store for every request. `POST` starts a run. `GET` either replays a live run or rebuilds the saved thread.

### What the store keeps

`withPersistence` writes two kinds of rows.

The message store holds the transcript for `blog-desk`. `saveThread` replaces that transcript.

The run store holds one row per run.

- The parent row uses the chat `runId` and the thread id `blog-desk`.
- A child row stores the card id from `SUBAGENT_STARTED` as `runId` and as `subagentRunId`. `parentRunId` is the chat run. `name` is `researcher`, `writer`, or `seo`.
- The child thread id is `subagent:` plus that card id. `findActiveRun('blog-desk')` returns the parent run. `ctx.runId` in the child `chat()` is the parent run id, a colon, and the card id. `ctx.threadId` is the parent thread id, a colon, and the agent name.
- The middleware saves the child transcript on the child thread: text, reasoning, tool calls, and tool results.
- The parent assistant message id is `assistant:` plus the parent run id. `metadata.tanstack.runId` is that same id. The saved text is `researcher:` and the notes, then `seo:` and the notes.

`reconstructChat` reads `metadata.tanstack.runId`. It calls `listByParentRun`. It puts one card on the assistant message for each child. The card is the only place the notes show.

Your own database must save `parentRunId`, `subagentRunId`, and `name`. It must implement `listByParentRun`. `reconstructChat` uses that method to build the cards.

### What POST does

`chatParamsFromRequest` reads the body. The body has `messages`, `threadId`, and `runId`. The client also sends the run id in the `X-Run-Id` header. `memoryStream(request)` reads that header and opens the log for this run.

`getByokKey` reads the OpenRouter key from the header that the page sends. The call passes `openrouterByok.id`, so the server does not read `OPENROUTER_API_KEY`. This example has no login, so a server key would pay for requests from any caller.

`memoryStorage()` keeps the key in memory only. After a refresh, the cards come back without a key. Paste the key again before you send the next message.

`chat()` receives `middleware: [withPersistence(persistence)]`. On this path the router runs before the main model. The persistence middleware records the child events.

1. It opens the parent run and saves the messages from the request.
2. When a child starts, it opens the child run and saves the link fields.
3. When a child streams, it saves its text, reasoning, and tool calls.
4. When the turn ends, it marks the parent run and the child runs complete.

`toServerSentEventsResponse` does the delivery.

- It writes a `run.accepted` chunk into the log before it pulls `chat()`. A refresh during the router can join.
- It records every chunk, then sends that chunk to the browser.
- If the browser disconnects, the helper continues to read `chat()` and writes each chunk into the log. The model continues.
- When the run ends, it closes the log.

`chat.stop()` stops the view in this tab. The server run continues. A refresh joins it again.

### What GET does

`memoryStream(request)` looks at the URL.

If the URL has a resume offset, `resumeFrom()` is not null. That request is a join. When the offset is `-1`, `resumeServerSentEventsResponse` replays the log from the start. The hook uses that replay to continue a live run.

If there is no resume offset, the request is a normal load. `reconstructChat(persistence, request)` reads `?threadId=`. It returns the saved messages and `activeRun`.

`activeRun` is the parent run while its status is `running`. After the run is complete, `activeRun` is null. When `activeRun` is null, the hook shows the cards from `messages`.

### What the next message sends

The hook sends the full thread on the next POST. Each card becomes text in the shape `name:` plus the notes. The writer system prompt tells the model to use earlier research text. The writer receives the saved notes in `messages`.

## 5. Give the researcher a tool and reasoning

A refresh must bring back more than text. Give the researcher one tool and turn on reasoning. Then its card has reasoning, a tool call, and a tool result to restore.

In `src/lib/blog-agents.ts`, add `toolDefinition` from `@tanstack/ai`. Define the tool, then add it to the researcher's `tools`:

```ts ignore
export const lookupWikipedia = toolDefinition({
  name: 'lookupWikipedia',
  description:
    'Get the Wikipedia summary of one topic. Pass a short page title, for example "Octopus".',
  inputSchema: {
    type: 'object',
    properties: { title: { type: 'string' } },
    required: ['title'],
  },
})

export const researcher = {
  name: 'researcher',
  description:
    'Does this turn need facts or sources? Answer yes when the user asks to look something up, even if they also ask for a draft or for SEO. Answer no when they do not ask to look anything up.',
  tools: [lookupWikipedia],
} as const
```

The definition holds no server code, so the browser reads it too. It types the researcher's tool calls in the UI.

In `src/lib/agents.ts`, import `lookupWikipedia` and add the server side of the tool above `createBlogAgents`:

```ts ignore
const lookupWikipediaTool = lookupWikipedia.server(async (input) => {
  const title =
    typeof input === 'object' &&
    input !== null &&
    'title' in input &&
    typeof input.title === 'string'
      ? input.title
      : ''
  if (title.length === 0) {
    throw new Error('lookupWikipedia needs a page title')
  }
  const response = await fetch(
    `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`,
    { headers: { 'user-agent': 'tanstack-ai-subagents-persisted-example' } },
  )
  if (response.status === 404) return { title, found: false }
  if (!response.ok) {
    throw new Error(`Wikipedia returned ${response.status} for ${title}`)
  }
  const page: unknown = await response.json()
  const extract =
    typeof page === 'object' &&
    page !== null &&
    'extract' in page &&
    typeof page.extract === 'string'
      ? page.extract
      : ''
  if (extract.length === 0) return { title, found: false }
  return {
    title,
    found: true,
    extract,
    url: `https://en.wikipedia.org/wiki/${encodeURIComponent(title)}`,
  }
})
```

A 404, or a page with no summary, returns `{ found: false }`. Any other HTTP status throws, so the card shows the error.

In the researcher `chat()` call, add the tool and the reasoning option. Keep `subagentRunId: ctx.subagentRunId` on each child `chat()`. Tell the model to use the tool:

```ts ignore
modelOptions: { reasoning: { effort: 'medium' } },
tools: [lookupWikipediaTool],
systemPrompts: [
  'You research for a blog desk. Call lookupWikipedia once for each topic before you reply. Then reply in Markdown with short notes, and give the Wikipedia URL as the source. Use a list. Do not write the full post.',
],
```

In `src/chat-ui.tsx`, import `ThinkingPart` from `@tanstack/ai-react/ui`. Add a `thinking` entry to `partsComponents`:

```tsx ignore
thinking: ({ part }) => (
  <ThinkingPart
    content={part.content}
    className="mb-2 rounded border border-gray-700 bg-gray-800/60 p-2 text-xs text-gray-400"
  />
),
```

The researcher card draws the tool call. In `src/components/subagent-card.tsx`, import the `SubagentPartsProps` type from `@tanstack/ai-react/ui`. Add the tool widget above the cards:

```tsx ignore
const researcherTools: SubagentPartsProps<
  BlogChatOptions,
  'researcher'
>['toolsComponents'] = {
  lookupWikipedia: ({ part, result }) => (
    <details className="mb-2 rounded border border-emerald-500/30 bg-emerald-500/5 p-2 text-xs text-emerald-300">
      <summary className="cursor-pointer font-mono">
        lookupWikipedia({part.arguments}) ({part.state})
      </summary>
      <pre className="mt-1 whitespace-pre-wrap text-gray-400">
        {result === undefined
          ? 'No result yet'
          : typeof result.content === 'string'
            ? result.content
            : JSON.stringify(result.content)}
      </pre>
    </details>
  ),
}
```

Replace the researcher card with this function. The notes stay open, so the tool row is visible:

```tsx ignore
export function Researcher({
  subagent,
  Parts,
}: SubagentProps<BlogChatOptions, 'researcher'>) {
  return (
    <section className="mt-3 rounded-lg border border-orange-500/30 bg-gray-900/80 p-3 text-gray-100">
      <AgentHeader
        name={subagent.name}
        status={subagent.status}
        onStop={subagent.stop}
      />
      {subagent.error ? (
        <p className="text-xs text-red-400">{subagent.error.message}</p>
      ) : null}
      <div className="mt-2">
        <Parts toolsComponents={researcherTools} />
      </div>
    </section>
  )
}
```

- The keys come from the researcher's `tools`. A tool name that the researcher does not have is a type error.
- The kit renders a tool call only through a `toolsComponents` entry with the same name. A tool with no entry renders nothing.
- This entry is on the researcher card, so only that card uses it. Its text and reasoning still use the root widgets.
- `result` is the matching tool result, so the result shows inside the same row.

To replace other widgets on one card, see [Style one child's parts](../chat/subagents#style-one-childs-parts).

## Try it

1. Paste an OpenRouter key. Send `do research on octopuses and seo titles`. Wait until both cards say finished. The research card shows reasoning, a `lookupWikipedia` row, and the notes.
2. Refresh the page. The research card and the SEO card are still there. The research card still has its reasoning and its tool row.
3. Send `Now write the article`. The writer uses the saved notes. Refresh. All three cards stay.
4. Send a longer prompt. Refresh while a card says running. The same card continues.
5. Click Stop while a card says running. Refresh. The same card continues.

<!-- ::client-example library=ai framework=react slug=subagents-persisted -->
