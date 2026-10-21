---
title: Test with a Fake Model
id: testing
order: 12
description: "Test chat(), tools, and middleware with no network and no API key. fakeText() from @tanstack/ai/testing answers from a script and estimates token usage."
keywords:
  - tanstack ai
  - testing
  - fake adapter
  - mock model
  - unit tests
  - fakeText
---

Tests that call a real model are slow, cost money, and need an API key. They also get a different answer each time.

Use `fakeText()` from `@tanstack/ai/testing`. It is a text adapter that answers from a script that you write. Give it to `chat()` like any other adapter.

## Quick setup

Queue the answers, then run `chat()`:

```ts
import { chat } from '@tanstack/ai'
import { fakeText } from '@tanstack/ai/testing'

const fake = fakeText()
fake.setResponses([{ text: 'Hello!' }])

let answer = ''
for await (const chunk of chat({
  adapter: fake,
  messages: [{ role: 'user', content: 'Hi' }],
})) {
  if (chunk.type === 'TEXT_MESSAGE_CONTENT') answer += chunk.delta
}
console.log(answer) // 'Hello!'
```

Run it. It prints `Hello!` with no network and no key.

## How it works

- Each model call takes the next answer from the queue.
- An empty queue ends the call with a `RUN_ERROR`: "No more fake responses queued".
- `appendResponses` adds answers. `pendingResponses()` counts the answers that are left.
- `fake.state.callCount` counts the model calls that the fake answered.
- The fake reports token usage on each call: `ceil(characters / 4)` over the request and the answer. So a long message costs many tokens, as with a real model.

## Test a tool

Give an answer with `toolCalls`, and `chat()` runs your tool. Then queue the answer that comes after the tool result:

```ts
import { chat, toolDefinition } from '@tanstack/ai'
import { fakeText } from '@tanstack/ai/testing'
import { z } from 'zod'

const getWeather = toolDefinition({
  name: 'get_weather',
  description: 'Get the weather in a city',
  inputSchema: z.object({ city: z.string() }),
}).server(async ({ city }) => ({ city, sky: 'sunny' }))

const fake = fakeText()
fake.setResponses([
  { toolCalls: [{ name: 'get_weather', input: { city: 'Oslo' } }] },
  { text: 'It is sunny in Oslo.' },
])

for await (const chunk of chat({
  adapter: fake,
  messages: [{ role: 'user', content: 'Weather in Oslo?' }],
  tools: [getWeather],
})) {
  if (chunk.type === 'TOOL_CALL_RESULT') console.log(chunk.content)
}
console.log(fake.state.callCount) // 2
```

## Test an error

Give an answer with `error`, and the call fails with a `RUN_ERROR`:

```ts
import { chat } from '@tanstack/ai'
import { fakeText } from '@tanstack/ai/testing'

const fake = fakeText()
fake.setResponses([{ error: 'The provider is down' }])

for await (const chunk of chat({
  adapter: fake,
  messages: [{ role: 'user', content: 'Hi' }],
})) {
  if (chunk.type === 'RUN_ERROR') console.log(chunk.message) // 'The provider is down'
}
```

## Advanced

### Answer from the request

Put a function in the queue to build the answer when the call comes in. It gets the `request` and the `state`:

```ts
import { fakeText } from '@tanstack/ai/testing'

const fake = fakeText()
fake.setResponses([
  ({ request, state }) => ({
    text: `Call ${state.callCount} saw ${request.messages.length} messages.`,
  }),
])
```

### Options

| Option | What it does |
|---|---|
| `model` | The model id. Default `'fake-model'`. |
| `input` | The input kinds that the model reads, for example `['text', 'image']`. Read it back as `fake.inputModalities`, to test code that checks what a model accepts. |
| `contextWindow` | The context window in tokens. Read it back as `fake.contextWindow`. |
| `tokensPerSecond` | Stream the text at this speed, 4 characters for each token. |
| `cache` | With a `threadId`, the part of the request that matches the previous request of the thread counts as cached tokens. |

### Answer fields

| Field | What it does |
|---|---|
| `text` | The visible answer. |
| `thinking` | Thinking text, streamed before the answer. |
| `toolCalls` | `{ name, input?, id? }` calls for `chat()` to run. |
| `finishReason` | `'stop'`, `'length'`, `'content_filter'`, or `'tool_calls'`. Default `'tool_calls'` with tool calls, else `'stop'`. |
| `error` | Fail the call with a `RUN_ERROR` that has this message. |

Your tests now run with no network and no key, and they get the same answer each time.
