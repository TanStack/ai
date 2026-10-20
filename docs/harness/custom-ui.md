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
  adapter: openaiText('gpt-6.1-sol'),
})

const host = createHarnessHost({ persistence: memoryPersistence() })
const session = await host.open(assistant, { threadId: 'thread-1' })

const view = createSessionView(session)
await view.ready
```

`view.ready` resolves when the view has the saved messages, the status, and the commands and settings of the session. If you open a thread again, its history is in the view immediately. And if a turn is still running when you open the view, you see that turn from its start, not only from the moment you opened it.

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

An Ink screen with approvals, questions, sign-ins, and child agents is in [`examples/harness-cli/src/tui.tsx`](https://github.com/TanStack/ai/blob/main/examples/harness-cli/src/tui.tsx). It runs from [`runCli({ ui })`](./cli#run-your-own-screen).

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

What waits for the user. Each item is a [wait](./waits) of the session:

- `approvals`: tool calls that wait for a yes or a no.
- `clientTools`: tool calls that run in your UI and wait for their output. See [Run a tool in the browser](#run-a-tool-in-the-browser).
- `interrupts`: everything else a turn can wait for, for example a value that a tool asks for. See [Answer other interrupts](#answer-other-interrupts).
- `questions`: questions of `step.ask` (in a command, a durable tool, or an agent run) and of an MCP server. See [Show a question](#show-a-question).
- `signIns`: connectors that need a sign-in, with a `url` and a `userCode` when the connector gives them.

`waits` lists every open wait in one array, as `snapshot().pendingWaits` does, with the `kind` of each one. Use it for a badge or a count. Answer each wait through its item in the lists above.

The session:

- `threadId`: the id of the conversation.
- `agents`: the background agents that run now. Each one has an `id`, a `name`, a `status` (`running`, or `waiting` for an answer), `send`, and `cancel`.
- `queuedTurns` and `waitingInputs`: how many messages wait for their turn, and which ones, in the order they run.
- `plugins`: the saved state of each plugin, by plugin name.

Settings and usage, for a settings panel or a status bar:

- `commands`, `config`, and `tools`: what the session has, for a help screen.
- `models`: the model names from `defineHarness({ models })`, for a model menu.
- `settings`: the stored settings of the thread, for example the model it uses now.
- `usage`: the token usage of the thread. It updates after each model call.

In a harness with `routing`, an assistant message also has `agent`: the name of the root agent that wrote it, or `undefined` for the main model. After a [handoff](./handoffs), the next agent writes a new message in the same turn.

An assistant message has `parts`. Each part is one of these:

- `text` or `reasoning`: the text, which grows while it streams.
- `tool-call`: a tool call with its `name`, `args`, and `status` (`running`, `done`, `failed`, or `needs-approval`).
- `agent`: a child agent, with its own `parts`, its `status`, and its `result` when it gives one. See [Show subagents](#show-subagents).
- `media`: a file that an agent made. See [Show media](#show-media).

A notice has a `kind`:

- `info`: the session continues a turn that a crash stopped, or a [reset](./fork-and-reset#reset-with-a-handoff-note) started a fresh context.
- `error`: a turn or an action failed.
- `rejected`: the session did not accept a message.
- `command`: the text result of a command.
- `ui`: a line that you added with `view.notice({ text })`.

## 3. Act on the session

Send work:

- `view.send(text)`: sends a prompt. While a turn runs, the text steers that turn. Text that starts with `/` runs a command, for example `/goal all tests pass`. With `{ as: 'operator' }`, it sends the [reply of an operator](./handoffs#reply-as-the-operator), and no model runs.
- `view.followUp(text)`: the message waits, and runs as its own turn after the current work.
- `view.continueWithoutMessage()`: starts a turn from the saved messages, with no new message.
- `view.runCommand({ name, input })`: runs a command, for example from a button.
- `view.putMedia({ body, mimeType, name })`: stores a file. Send the record you get back with `view.send(text, [record])`. See [Show media](#show-media).
Change the session:

- `view.setPluginSetting({ key, value })`: changes a config value, for example `view.setPluginSetting({ key: 'mode', value: 'plan' })`.
- `view.updateThreadSettings({ settings })`: changes the stored settings of the thread, for example `view.updateThreadSettings({ settings: { model: 'strong' } })`.
- `view.reset({ note })`: the model starts fresh from the next turn, with your `note` first. See [Reset with a handoff note](./fork-and-reset#reset-with-a-handoff-note).
- `view.revert({ messageId })` and `view.unrevert()`: go back to a message, and undo that.

Stop work:

- `view.cancel()`: cancels the running turn. `view.cancel({ operationId })` cancels one operation, for example a background agent.
- `view.cancelInput({ inputId })`: drops a message from `waitingInputs` before it runs. `view.changeInputDelivery({ inputId, delivery: 'steer' })` moves it into the running turn instead.
- `view.dispose()`: stops the view when your screen closes. After that, each action throws an error.

On a view with a [`HarnessClient`](#a-ui-in-the-browser), two actions need `expose` in the harness:

- `view.command`, and a `/command` in `view.send`, run only the commands in `expose.commands`.
- `view.setPluginSetting` sets only the keys in `expose.config`.

For any other command or key, the view adds a `rejected` notice with the text `Not accepted: not_exposed`. It also calls your `'error'` handler with that text. On a client, `commands` and `config` in the state list only the exposed items.

See [Choose what clients can change](./connect#choose-what-clients-can-change).

Answer what waits:

- `approval.approve()` and `approval.reject()`: answer one approval. `view.approve({ id })` and `view.reject({ id })` do the same by id.
- `view.approveAll()` and `view.rejectAll()`: answer all open approvals.
- `call.resolve(output)` and `call.fail(message)`: answer one client tool call.
- `request.resolve(value)` and `request.cancel()`: answer one item of `interrupts`.
- `question.answer(value)`: answers a question.

Want the tool to run with different arguments than the model picked? Pass them to `approve`:

```ts group=harness-custom-ui
const [waiting] = view.store.get().approvals
waiting?.approve({ editedArgs: { path: 'notes/draft.md' } })
```

`reject({ payload })` sends data with a no, when the tool's approval schema takes some.

If a turn waits for more than one approval, client tool, or interrupt, the turn continues after you answer all of them.

A background agent run can wait too, for example for an approval of `permissions()`. Its waits are in the same `approvals`, `clientTools`, and `interrupts` lists. The view sends the answer to each of them at once, and the run continues. See [When a background agent waits](./subagents#when-a-background-agent-waits).

Message a background agent:

- `agent.send(text, { mode })`: sends a message to one item of `state.agents`. `mode` is `'steer'` (the default) or `'followUp'`. See [Message a running agent](./subagents#message-a-running-agent).

```ts group=harness-custom-ui
const [agent] = view.store.get().agents
if (agent) {
  await agent.send('Add a title.', { mode: 'followUp' })
}
```

`agent.cancel()` stops the run, and the runs it started.

A session and a `HarnessClient` can do all of this. You can also give `createSessionView` your own `SessionViewSource`. Its methods take the same arguments as the session methods, for example `resolve({ resume })` and `cancel({ operationId })`. `send` takes `mode` for a steer or a follow-up, and `to` for a message to an agent run.

A source must have these members:

- Inputs: `send`, `resolve`, `cancel`, `answer`, `runCommand`, and `setPluginSetting`.
- Reads: `events`, `snapshot`, `transcript`, and `describe`.

These members are optional:

- `continueWithoutMessage`, `cancelInput`, `changeInputDelivery`, `updateThreadSettings`, `reset`, `revert`, and `unrevert`. Without one, its view action adds an `error` notice.
- `putMedia`. Without it, `view.putMedia` rejects.
- `mediaUrl` and `loadMedia`. Without `mediaUrl`, media parts have no `url`. Without `loadMedia`, `load()` rejects.
- `agentTranscript`. Without it, `view.loadAgent` does nothing, so a saved child shows only its card.

## 4. Listen for events

Some items need attention when they arrive. `view.on` calls your handler for each one. When a tool call waits for approval, this handler rings the terminal bell and adds a line to the screen:

```ts group=harness-custom-ui
view.on('approval', (approval) => {
  process.stdout.write('\u0007')
  view.notice({ text: `${approval.tool} waits for your answer.` })
})
```

Items that wait for the user:

- `'approval'`: an approval. Call `approve()` or `reject()` on it.
- `'clientTool'`: a client tool call. Call `resolve(output)` or `fail(message)` on it.
- `'interrupt'`: an item of `interrupts`. Call `resolve(value)` or `cancel()` on it.
- `'question'`: a question with a `message`, a `schema`, a `url` when the user must open a page, and `answer(value)`.
- `'signIn'`: a connector that needs a sign-in, with `connector`, `url`, and `userCode`.

Progress:

- `'toolCall'`: `{ id, name }`, when a tool call starts.
- `'agent'`: `{ id, name, status }`, when a child agent starts, finishes, or fails.
- `'error'`: the error text. The view also adds it to `messages` as a notice.
- `'turnEnd'`: `{ operationId }`, when a chat turn ends. A turn that stops for an approval has not ended, so it does not fire then.

The view calls your handler after the item is in the state, so the handler can read `view.store.get()` and find the item. `view.on` returns a function that removes the handler.

The view also keeps its state right on its own:

- Each event from `client.events()` or `session.events()` has the `threadId` it belongs to. The `RUN_STARTED` event of a child run has the `parentRunId` of the run that started it. Use them to show the run tree in your own UI.
- When the server sends `harness.gap`, some events are gone. The view stops its read, loads the snapshot and the transcript again, then reads on from the new snapshot. So no turn shows twice after the gap. See [Write a client in any language](./protocol#when-events-are-missing).

## Show a question

A command, a durable tool, or an agent run can ask the user with `step.ask`. An MCP server can ask during a tool call. Each item of `state.questions` has:

- `id` and `message`.
- `schema`: the JSON Schema of the answer, when the question has one. Without a schema, the answer is text.
- `secret`: the answer is a key or a password. Hide what the user types.
- `url`: a page that the user must open before they answer, for example a payment page.
- `answer(value)`: sends the answer.

When a question has a `url`, show the link. The user opens it, then answers. The session does not open the page. This handler adds the link to the screen:

```ts group=harness-custom-ui
view.on('question', (question) => {
  if (question.url) view.notice({ text: `Open ${question.url}, then answer.` })
})
```

### Show a field only when it applies

A schema can make a field apply only when another field has a value. JSON Schema writes this with `if` and `then`. In this schema, `address` applies only when `delivery` is `mail`:

```json
{
  "type": "object",
  "properties": {
    "delivery": { "type": "string", "enum": ["pickup", "mail"] },
    "address": { "type": "string" }
  },
  "required": ["delivery"],
  "if": { "properties": { "delivery": { "const": "mail" } } },
  "then": { "required": ["address"] }
}
```

The view gives you the schema as is. Your UI reads the condition. This function returns the fields that `then` adds for the answer so far:

```ts group=harness-custom-ui
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function fieldsThatApply(schema: unknown, answer: Record<string, unknown>) {
  if (!isRecord(schema) || !isRecord(schema.if) || !isRecord(schema.then)) {
    return []
  }
  const rules = isRecord(schema.if.properties)
    ? Object.entries(schema.if.properties)
    : []
  const matches = rules.every(
    ([field, rule]) => isRecord(rule) && answer[field] === rule.const,
  )
  const required = schema.then.required
  return matches && Array.isArray(required) ? required : []
}
```

Call it each time the user changes a field. Show a field from the result, and hide it again when the result no longer has it:

```ts group=harness-custom-ui
const [question] = view.store.get().questions
const extra = fieldsThatApply(question?.schema, { delivery: 'mail' })
// With the schema above, `extra` is ['address'].
```

## Answer other interrupts

Some turns wait for something that is not a yes or a no. A tool can stop the turn to ask for a value, or your own code can stop it for a form. The view puts these in `state.interrupts`: the waits of kind `question` (for example a call of the `question` tool) and `human`. Each item has:

- `id`, `reason`, and `message`: what the turn waits for. `reason` is the name the interrupt gave itself, for example `pick_region`.
- `payload`: the data the interrupt sent for your UI, for example the fields of a form.
- `responseSchema`: the JSON Schema of the answer, when it has one. [Show a field only when it applies](#show-a-field-only-when-it-applies) works for it too.
- `resolve(value)`: sends the answer.
- `cancel()`: answers with no value, and the turn continues without one.

This handler shows each one, and answers the region picker right away:

```ts group=harness-custom-ui
view.on('interrupt', (request) => {
  view.notice({ text: request.message ?? `The turn waits for ${request.reason}.` })
  if (request.reason === 'pick_region') request.resolve({ region: 'eu-west-1' })
})
```

## Show media

A user sends a screenshot, and an agent draws an image. The view gives you each file as a media part, with a URL that works in `<img>`, `<audio>`, and `<video>`.

The media parts are in these places:

- `media` of a user message: the files that the user sent.
- `parts` of an `agent` part: the files that this child agent made.
- `parts` of an assistant message, at the end: the files of the turn, after the view loads the history again (for example after a restart).

This component shows the parts of a message, with the parts of each child agent:

```tsx
import type { MediaPart, ViewPart } from '@tanstack/ai-harness/view'

function Media({ part }: { part: MediaPart }) {
  if (part.url === undefined) return <span>{part.name}</span>
  if (part.kind === 'image') return <img src={part.url} alt={part.name} />
  if (part.kind === 'audio') return <audio controls src={part.url} />
  if (part.kind === 'video') return <video controls src={part.url} />
  return (
    <a href={part.url} download={part.name}>
      {part.name}
    </a>
  )
}

export function Parts({ parts }: { parts: Array<ViewPart> }) {
  return (
    <>
      {parts.map((part, index) => {
        if (part.type === 'text') return <p key={index}>{part.text}</p>
        if (part.type === 'media') return <Media key={part.id} part={part} />
        if (part.type === 'agent') return <Parts key={part.id} parts={part.parts} />
        return null
      })}
    </>
  )
}
```

A media part has:

- `id`, `kind`, `mimeType`, `name`, and `size` (in bytes).
- `url`: a URL for the file, when the source can give one. The view gets a new URL before the old one expires.
- `load()`: the bytes of the file, as a `Uint8Array`.

Where `url` comes from:

- With `createHarnessClient`, `url` is a signed URL from the handler. See [Send and show media](./media).
- With a local session, `url` is a data URL for a file up to 1 MB. A bigger file has no `url`, so use `load()`.

To send files with a message, give their records to `view.send`. This code sends a screenshot from the disk:

```ts group=harness-custom-ui
import { readFile } from 'node:fs/promises'

const screenshot = await session.putMedia({
  body: await readFile('./bug.png'),
  mimeType: 'image/png',
  name: 'bug.png',
})
await view.send('What is wrong in this screenshot?', [screenshot])
```

In a browser, get the record from `client.putMedia({ body: file, mimeType: file.type, name: file.name })`. The user message then shows the file in `media`.

## Show subagents

A child agent is an `agent` part in the assistant message of the turn that started it. The component in [Show media](#show-media) already draws one, with its own parts inside. On top of `parts`, each `agent` part has:

- `status`: `running`, `done`, or `failed`, and `error` when it failed.
- `result`: the typed result of the agent, when it gives one.

After a reload, each saved child shows only its card: `name`, `status`, `error`, and `result`, with no `parts`. To show what the child wrote, call `view.loadAgent({ id })`, for example when the user opens the child. The view reads the saved messages of the child (see [Show what a child wrote after a reload](./subagents#show-what-a-child-wrote-after-a-reload)) and fills its part:

```ts group=harness-custom-ui
const last = view.store.get().messages.at(-1)
const child =
  last?.role === 'assistant'
    ? last.parts.find((part) => part.type === 'agent')
    : undefined
if (child?.type === 'agent') await view.loadAgent({ id: child.id })
```

A nested child in that part loads the same way, with its own `loadAgent` call. A background child that still runs keeps getting its new text in the same part.

A terminal screen that prints the old turns only one time (for example Ink `Static`) must load the saved children before its first render. [`examples/harness-cli/src/tui.tsx`](https://github.com/TanStack/ai/blob/main/examples/harness-cli/src/tui.tsx) does this in `loadSavedAgents`.

To show a line when a child ends, listen for `'agent'`:

```ts group=harness-custom-ui
view.on('agent', (child) => {
  if (child.status !== 'running') view.notice({ text: `${child.name} is ${child.status}.` })
})
```

## Plugin state and plugin events

Plugins show their work through state and events. `state.plugins` holds the saved state of each plugin, by plugin name.

`view.on` takes any plugin event from `createPluginEvent`, and the handler gets its typed value:

```ts group=harness-custom-ui
import { createPluginEvent } from '@tanstack/ai-harness'

const Deployed = createPluginEvent<{ env: string }>('acme/deploy:done')

view.on(Deployed, (done) => view.notice({ text: `Deployed to ${done.env}` }))
```

`state.plugins` is plugin data, so check its shape before you use it.

## A UI in the browser

Your harness runs on a server, and your UI is a web page. Give `createSessionView` a `HarnessClient` in place of a session. The state, the actions, and the events stay the same.

### On the server

Serve the session with `createHarnessHandler`, and mount the handler on `/api/harness`:

```ts group=harness-custom-ui-server
import { createHarnessHost, defineHarness, membersOnly } from '@tanstack/ai-harness'
import { createHarnessHandler } from '@tanstack/ai-harness/server'
import { memoryPersistence } from '@tanstack/ai-persistence'
import { openaiText } from '@tanstack/ai-openai'

export const assistant = defineHarness({
  name: 'acme/assistant',
  adapter: openaiText('gpt-6.1-sol'),
})

const host = createHarnessHost({
  persistence: memoryPersistence(),
  access: {
    getUser: ({ request }) =>
      request.headers.get('authorization') === `Bearer ${process.env.HARNESS_TOKEN}`
        ? { id: 'user-1' }
        : null,
    rules: membersOnly(),
  },
})

export const handler = createHarnessHandler({ host, harness: assistant })
```

`membersOnly()` lets each user use the threads that they opened, and the threads shared with them. See [Access and tenants](./access).

The handler also serves `GET transcript` and `GET describe`. The view reads them when it starts. For the other routes, see [Connect clients](./connect).

`GET transcript`, `GET snapshot`, `GET events`, and the other read paths read the thread without a session, so they start no plugins on the server. `GET describe` opens the session, because the plugins give the commands and the settings. To read a thread in a route of your own, use `host.observe`. See [Read a thread without a session](./lifecycle#read-a-thread-without-a-session).

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

## Run a tool in the browser

Some tools must run where the user is, for example a tool that opens a screen of your app. The server cannot run them. Give the harness the tool with no `.server()` implementation. The turn then waits, and the view lists the call in `clientTools`. Your page runs the tool and sends the output.

1. Put the tool in a file that the server and the browser both import:

```ts group=harness-custom-ui-tools
import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'

export const openScreenInput = z.object({ route: z.string() })

export const openScreen = toolDefinition({
  name: 'openScreen',
  description: 'Open a screen of the app for the user.',
  inputSchema: openScreenInput,
  outputSchema: z.object({ opened: z.boolean() }),
})
```

2. On the server, give the tool to the harness:

```ts group=harness-custom-ui-tools-server
import { defineHarness } from '@tanstack/ai-harness'
import { openaiText } from '@tanstack/ai-openai'
import { openScreen } from './tools'

export const assistant = defineHarness({
  name: 'acme/assistant',
  adapter: openaiText('gpt-6.1-sol'),
  tools: [openScreen],
})
```

3. In the browser, run the tool when the view gets the call:

```ts group=harness-custom-ui-tools-client
import { createHarnessClient } from '@tanstack/ai-harness/client'
import { createSessionView } from '@tanstack/ai-harness/view'
import { openScreenInput } from './tools'

const view = createSessionView(
  createHarnessClient({ url: '/api/harness', threadId: 'user-1-thread' }),
)

view.on('clientTool', (call) => {
  if (call.tool !== 'openScreen') return
  const input = openScreenInput.safeParse(call.args)
  if (!input.success) {
    call.fail('The route is not a string.')
    return
  }
  history.pushState({}, '', input.data.route)
  call.resolve({ opened: true })
})
```

A client tool call has:

- `tool` and `args`: the tool name and the input that the model gave.
- `resolve(output)`: sends the output. The model gets it as the tool result.
- `fail(message)`: sends a failure. The model sees that the tool failed with `message`.

A turn can wait for approvals and client tools at the same time. When each item has an answer, the view sends all the answers together. Then the turn continues. To show the calls in a component, read `state.clientTools` with `useSelector`, the same as `approvals`.

## What you have now

- A terminal screen in about 20 lines, with no event loop and no reducer.
- The same view in a web app, on a harness that runs on a server.
- Tools that run in the browser, with their output sent back from the view.
- Actions, typed events, and plugin state that work with any UI library.
- Images, audio, and video from the session, with URLs that the view keeps valid.
