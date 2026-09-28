---
title: Build your own UI
id: harness-custom-ui
order: 13
description: "Show a harness session in your own terminal screen or web app. One live store holds the messages, tool calls, approvals, and plugin state, and works with any UI library."
keywords:
  - tanstack ai
  - harness
  - session view
  - tanstack store
  - ink
  - custom ui
---

You want your own screen for your harness: your own layout in a terminal, or a page in your web app. `session.events()` gives you raw AG-UI events. To show them, you must join text deltas, follow each tool call, and keep a list of open approvals. That is a reducer, and you must keep it correct.

`createSessionView` does that work. It keeps one live state in a TanStack Store, and it gives you actions and typed events. You show the state with any UI library.

At the end of this page you have a terminal screen in about 20 lines, and the same view in a web app.

## Install

Install the harness and the TanStack Store adapter for your UI library. With no UI library, the harness is enough.

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai-harness @tanstack/react-store
vue: @tanstack/ai-harness @tanstack/vue-store
solid: @tanstack/ai-harness @tanstack/solid-store
svelte: @tanstack/ai-harness @tanstack/svelte-store
preact: @tanstack/ai-harness @tanstack/preact-store
angular: @tanstack/ai-harness @tanstack/angular-store
vanilla: @tanstack/ai-harness
octane: @tanstack/ai-harness

<!-- ::end:tabs -->

The terminal screen on this page uses Ink, which needs Node 22 or later. Install Ink and React too:

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: ink react

<!-- ::end:tabs -->

## 1. Make a view

Open a session, then give it to `createSessionView`:

```ts group=harness-custom-ui
import { createHarnessHost, defineHarness } from '@tanstack/ai-harness'
import { createSessionView } from '@tanstack/ai-harness/view'
import { memoryPersistence } from '@tanstack/ai-persistence'
import { openaiText } from '@tanstack/ai-openai'

const assistant = defineHarness({
  name: 'acme/assistant',
  adapter: openaiText('gpt-5.6'),
})

const host = createHarnessHost({ persistence: memoryPersistence() })
const session = await host.open(assistant, { threadId: 'thread-1' })

const view = createSessionView(session)
await view.ready
```

`view.ready` resolves when the view has the saved messages, the status, and the commands and settings of the session. If you open a thread again, its history is in the view immediately.

## 2. Show the state

`view.store` is a TanStack Store. `useSelector` reads one part of the state, and your component updates only when that part changes. This Ink screen shows the messages and the status:

```tsx ignore
import { Box, Text, render } from 'ink'
import { useSelector } from '@tanstack/react-store'
import type { SessionView } from '@tanstack/ai-harness/view'

function Screen({ view }: { view: SessionView }) {
  const messages = useSelector(view.store, (state) => state.messages)
  const status = useSelector(view.store, (state) => state.status)
  return (
    <Box flexDirection="column">
      {messages.map((message) =>
        message.role === 'assistant' ? (
          <Text key={message.id}>
            {message.parts.map((part) => (part.type === 'text' ? part.text : '')).join('')}
          </Text>
        ) : (
          <Text key={message.id} color="gray">
            {message.role === 'user' ? `> ${message.text}` : message.text}
          </Text>
        ),
      )}
      <Text color="gray">{status}</Text>
    </Box>
  )
}

render(<Screen view={view} />)
await view.send('Summarize the README.')
```

Put the code of steps 1 and 2 in one `.tsx` file, then run it. The screen shows your prompt, then the answer while it streams, then the status `idle`. Press Ctrl+C to quit.

A full Ink screen, with approvals, questions, sign-ins, and child agents, is in [`examples/harness-cli/src/tui.tsx`](https://github.com/TanStack/ai/blob/main/examples/harness-cli/src/tui.tsx). It runs from [`runCli({ ui })`](./cli#run-your-own-screen).

Each TanStack Store adapter reads the store the same way. Vue, Solid, Svelte, and Preact have `useSelector`. Angular has `injectSelector`. With no UI library, subscribe to the store:

```ts group=harness-custom-ui
const subscription = view.store.subscribe((state) => {
  console.log(`${state.status}: ${state.messages.length} messages`)
})
```

Call `subscription.unsubscribe()` to stop.

### What the state holds

The conversation:

- `messages`: the lines to show. Each message has a `role`: `user`, `assistant`, or `notice`.
- `status`: `idle`, `running`, or `requires_action`.
- `connection`: `open`, `reconnecting`, or `closed`.

What waits for the user:

- `approvals`: tool calls that wait for a yes or a no.
- `questions`: questions from a command or a plugin.
- `signIns`: connectors that need a sign-in, with a `url` and a `userCode` when the connector gives them.

The session:

- `threadId`: the id of the conversation.
- `agents`: the background agents that run now.
- `queuedTurns`: the number of messages that wait for their turn.
- `commands`, `config`, and `tools`: what the session has, for a help screen or a settings panel.
- `plugins`: the saved state of each plugin, by plugin name.

An assistant message has `parts`. Each part is one of these:

- `text` or `reasoning`: the text, which grows while it streams.
- `tool-call`: a tool call with its `name`, `args`, and `status` (`running`, `done`, `failed`, or `needs-approval`).
- `agent`: a child agent, with its own `parts`.

A notice has a `kind`:

- `info`: the session continues a turn that a crash stopped.
- `error`: a turn or an action failed.
- `rejected`: the session did not accept a message.
- `command`: the text result of a command.
- `ui`: a line that you added with `view.notice(text)`.

## 3. Act on the session

Start and stop work:

- `view.send(text)`: sends a prompt. While a turn runs, the text steers that turn. Text that starts with `/` runs a command, for example `/goal all tests pass`.
- `view.command(name, input)`: runs a command, for example from a button.
- `view.setConfig(key, value)`: changes a setting, for example `view.setConfig('mode', 'plan')`.
- `view.cancel()`: cancels the running turn.
- `view.dispose()`: stops the view when your screen closes. After that, each action throws an error.

Answer what waits:

- `approval.approve()` and `approval.reject()`: answer one approval. `view.approve(id)` and `view.reject(id)` do the same by id.
- `view.approveAll()` and `view.rejectAll()`: answer all open approvals.
- `question.answer(value)`: answers a question.

If a turn waits for more than one approval, the turn continues after you answer all of them.

## 4. Listen for events

Some items need attention when they arrive. `view.on` calls your handler for each one. When a tool call waits for approval, this handler rings the terminal bell and adds a line to the screen:

```ts group=harness-custom-ui
view.on('approval', (approval) => {
  process.stdout.write('\u0007')
  view.notice(`${approval.tool} waits for your answer.`)
})
```

Items that wait for the user:

- `'approval'`: an approval. Call `approve()` or `reject()` on it.
- `'question'`: a question with a `message`, a `schema`, and `answer(value)`.
- `'signIn'`: a connector that needs a sign-in, with `connector`, `url`, and `userCode`.

Progress:

- `'toolCall'`: `{ id, name }`, when a tool call starts.
- `'agent'`: `{ id, name, status }`, when a child agent starts, finishes, or fails.
- `'error'`: the error text. The view also adds it to `messages` as a notice.
- `'turnEnd'`: `{ operationId }`, when a chat turn ends.

The view calls your handler after the item is in the state, so the handler can read `view.store.get()` and find the item. `view.on` returns a function that removes the handler.

## Plugin state and plugin events

Plugins show their work through state and events. `state.plugins` holds the saved state of each plugin, by plugin name. A plugin can export a selector that checks the shape of its state for you.

With the [goal plugin](./goal) in your harness, `selectGoal` reads the goal from the state, or gives `null`. `GoalMet` is the typed event of the plugin:

```ts group=harness-custom-ui
import { GoalMet, selectGoal } from '@tanstack/ai-harness/plugins'

const goal = selectGoal(view.store.get())
if (goal) view.notice(`Goal: ${goal.text} (${goal.status}, round ${goal.round})`)

view.on(GoalMet, (met) => view.notice(`Goal met: ${met.reason}`))
```

In a component, give the selector to `useSelector`: `useSelector(view.store, selectGoal)`. `view.on` takes any plugin event from `createPluginEvent`, and the handler gets its typed value. `@tanstack/ai-harness/plugins` runs only in Node, so use it with a local session. In a browser, read `state.plugins['tanstack/goal']` and check its shape before you use it.

## A UI in the browser

Your harness runs on a server, and your UI is a web page. Give `createSessionView` a `HarnessClient` in place of a session. The state, the actions, and the events stay the same.

### On the server

Serve the session with `createHarnessHandler`, and mount the handler on `/api/harness`:

```ts group=harness-custom-ui-server
import { createHarnessHandler, createHarnessHost, defineHarness } from '@tanstack/ai-harness'
import { memoryPersistence } from '@tanstack/ai-persistence'
import { openaiText } from '@tanstack/ai-openai'

export const assistant = defineHarness({
  name: 'acme/assistant',
  adapter: openaiText('gpt-5.6'),
})

const host = createHarnessHost({ persistence: memoryPersistence() })

export const handler = createHarnessHandler({
  host,
  harness: assistant,
  authorize: (request) =>
    request.headers.get('authorization') === `Bearer ${process.env.HARNESS_TOKEN}`
      ? { id: 'user-1' }
      : null,
  canAccess: (principal, threadId) => threadId.startsWith(principal.id),
})
```

The handler also serves `GET transcript` and `GET describe`. The view reads them when it starts. For the other routes, see [Connect clients](./connect).

### In the browser

Make the view one time, in code that runs in the browser. Then read it in your components:

```tsx ignore
import { useState } from 'react'
import { useSelector } from '@tanstack/react-store'
import { createHarnessClient } from '@tanstack/ai-harness/client'
import { createSessionView } from '@tanstack/ai-harness/view'

const view = createSessionView(
  createHarnessClient({
    url: '/api/harness',
    threadId: 'user-1-thread',
    headers: { authorization: 'Bearer my-token' },
  }),
)

export function Chat() {
  const messages = useSelector(view.store, (state) => state.messages)
  const approvals = useSelector(view.store, (state) => state.approvals)
  const connection = useSelector(view.store, (state) => state.connection)
  const [draft, setDraft] = useState('')

  return (
    <main>
      <p role="status">{connection === 'reconnecting' ? 'Reconnecting...' : ''}</p>
      {messages.map((message) => (
        <p key={message.id}>
          {message.role === 'assistant'
            ? message.parts.map((part) => (part.type === 'text' ? part.text : '')).join('')
            : message.text}
        </p>
      ))}
      {approvals.map((approval) => (
        <p key={approval.id}>
          Run {approval.tool}?{' '}
          <button type="button" onClick={approval.approve}>
            Yes
          </button>
          <button type="button" onClick={approval.reject}>
            No
          </button>
        </p>
      ))}
      <form
        onSubmit={(event) => {
          event.preventDefault()
          void view.send(draft)
          setDraft('')
        }}
      >
        <input aria-label="Message" value={draft} onChange={(event) => setDraft(event.target.value)} />
        <button type="submit">Send</button>
      </form>
    </main>
  )
}
```

`connection` tells the user about the network:

- `open`: events arrive.
- `reconnecting`: the connection dropped. The client connects again and continues after the last event.
- `closed`: the view stopped reading events, for example after `view.dispose()`.

## What you have now

- A terminal screen in about 20 lines, with no event loop and no reducer.
- The same view in a web app, on a harness that runs on a server.
- Actions, typed events, and plugin state that work with any UI library.
