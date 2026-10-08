---
title: Test with a Fake Model
id: testing
order: 16
description: "Test chat(), tools, and middleware with no network and no API key. fakeText() from @tanstack/ai/testing answers from a script and estimates token usage."
keywords:
  - tanstack ai
  - testing
  - fake adapter
  - mock model
  - unit tests
  - fakeText
---

A test that calls a real model is slow, costs money, needs an API key, and can get a different answer each time. `fakeText()` from `@tanstack/ai/testing` is a text adapter that answers from a script you write. Pass it to `chat()` like any other adapter.

## Answer a prompt

Queue the answers, then run `chat()`:

```ts group=testing
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

- Each model call takes the next answer from the queue.
- An empty queue ends the call with a `RUN_ERROR`: "No more fake responses queued".
- `appendResponses` adds answers to the queue, and `pendingResponses()` counts what is left.

## Test a tool

An answer with `toolCalls` makes `chat()` run your tools. Queue the answer that comes after the tool results too:

```ts group=testing
import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'

const getWeather = toolDefinition({
  name: 'get_weather',
  description: 'Get the weather in a city',
  inputSchema: z.object({ city: z.string() }),
}).server(async ({ city }) => ({ city, sky: 'sunny' }))

const weatherFake = fakeText()
weatherFake.setResponses([
  { toolCalls: [{ name: 'get_weather', input: { city: 'Oslo' } }] },
  { text: 'It is sunny in Oslo.' },
])

for await (const chunk of chat({
  adapter: weatherFake,
  messages: [{ role: 'user', content: 'Weather in Oslo?' }],
  tools: [getWeather],
})) {
  if (chunk.type === 'TOOL_CALL_RESULT') console.log(chunk.content)
}
console.log(weatherFake.state.callCount) // 2
```

## Answer from the request

A function in the queue builds its answer when the call arrives. It gets one object with the `request` and the `state`:

```ts group=testing
const echo = fakeText()
echo.setResponses([
  ({ request, state }) => ({
    text: `Call ${state.callCount} saw ${request.messages.length} messages.`,
  }),
])
```

## Test errors and overflow

An answer with `error` fails the call. With [`isContextOverflow`](./compaction#compact-now-after-an-overflow), test the code that compacts and retries:

```ts group=testing
import { isContextOverflow } from '@tanstack/ai'

const small = fakeText({ contextWindow: 1_000 })
small.setResponses([{ error: 'prompt is too long: 2000 tokens > 1000 maximum' }])

for await (const chunk of chat({
  adapter: small,
  messages: [{ role: 'user', content: 'A very long question' }],
})) {
  if (chunk.type === 'RUN_ERROR') {
    console.log(isContextOverflow({ error: chunk })) // true
  }
}
```

The fake also reports token usage on each call: `ceil(characters / 4)` over the request and the answer. So a long message is many tokens, like with a real model.

## Options

| Option | What it does |
|---|---|
| `model` | The model id. Default `'fake-model'`. |
| `input` | The input kinds the model reads, for example `['text', 'image']`. |
| `contextWindow` | The context window in tokens. Read it back as `fake.contextWindow`. |
| `tokensPerSecond` | Stream the text at this pace, 4 characters per token. |
| `cache` | With a `threadId`, count the part of the request that matches the thread's previous request as cached tokens. |

## Answer fields

| Field | What it does |
|---|---|
| `text` | The visible answer. |
| `thinking` | Thinking text, streamed before the answer. |
| `toolCalls` | `{ name, input?, id? }` calls for `chat()` to run. |
| `finishReason` | `'stop'`, `'length'`, `'content_filter'`, or `'tool_calls'`. Default `'tool_calls'` with tool calls, else `'stop'`. |
| `error` | Fail the call with a `RUN_ERROR` that has this message. |

Your tests now run with no network and no key, and they get the same answers every time.
