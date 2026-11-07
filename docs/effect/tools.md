---
title: Effect Tools
id: effect-tools
order: 2
description: "Write TanStack AI server tools as Effects with AI.serverTool. The tool reads your Effect services, and a Layer provides them to the AI.chat stream."
keywords:
  - tanstack ai
  - effect
  - ai-effect
  - serverTool
  - layer
  - services
  - tools
---

Your tools need your database and your other Effect services. A core server tool is an async function, so it cannot read those services, and its errors are not typed.

`AI.serverTool` makes a tool from a function that returns an Effect. The services of that Effect become requirements of the `AI.chat` stream. You provide them with a Layer.

This page uses the server route from [Effect](./index). The client does not change.

## 1. Define the service and its Layer

```ts ignore
import { Context, Data, Effect, Layer } from 'effect'

export class OrderNotFound extends Data.TaggedError('OrderNotFound')<{
  readonly id: string
}> {}

export class Db extends Context.Service<
  Db,
  {
    readonly findOrder: (
      id: string,
    ) => Effect.Effect<{ status: string }, OrderNotFound>
  }
>()('Db') {}

// A fixed order. Read from your real database here.
export const DbLive = Layer.succeed(Db, {
  findOrder: (id) =>
    id === 'A-100'
      ? Effect.succeed({ status: 'shipped' })
      : Effect.fail(new OrderNotFound({ id })),
})
```

## 2. Write the tool as an Effect

```ts ignore
import { toolDefinition } from '@tanstack/ai'
import * as AI from '@tanstack/ai-effect'
import { Effect, Schema } from 'effect'
import { Db } from './db'

const getOrderDef = toolDefinition({
  name: 'get_order',
  description: 'Get the status of an order',
  inputSchema: AI.toolSchema(Schema.Struct({ id: Schema.String })),
  outputSchema: AI.toolSchema(Schema.Struct({ status: Schema.String })),
})

export const getOrder = AI.serverTool(getOrderDef, ({ id }) =>
  Effect.gen(function* () {
    const db = yield* Db
    return yield* db.findOrder(id)
  }),
)
```

`AI.toolSchema` turns an Effect Schema into a tool schema. It closes every object (`additionalProperties: false`), so OpenAI can check the tool arguments in strict mode.

`AI.serverTool` takes a tool definition and a function. The function gets the parsed input and returns an Effect of the output. The type of `getOrder` keeps `Db` as a requirement.

## 3. Pass the tool and provide the Layer

```ts ignore
import { chatParamsFromRequest, toServerSentEventsResponse } from '@tanstack/ai'
import * as AI from '@tanstack/ai-effect'
import { openaiText } from '@tanstack/ai-openai'
import { Stream } from 'effect'
import { DbLive } from './db'
import { getOrder } from './tools'

export async function POST(request: Request) {
  const params = await chatParamsFromRequest(request)

  const stream = AI.chat({
    adapter: openaiText('gpt-6.1-sol'),
    messages: params.messages,
    threadId: params.threadId,
    runId: params.runId,
    tools: [getOrder],
  }).pipe(Stream.provide(DbLive))

  return toServerSentEventsResponse(Stream.toAsyncIterable(stream))
}
```

The stream needs `Db` until you provide `DbLive`. If you remove `Stream.provide(DbLive)`, `Stream.toAsyncIterable` does not type-check.

Ask "Where is order A-100?". The model calls `get_order`, your Effect reads `Db`, and the reply says the order shipped.

## When the tool fails

If the tool Effect fails, the model gets a tool error:

- The error message goes back to the model as the tool result. The model can tell the user or try again.
- The run continues. The stream does not fail.
- A typed failure (`OrderNotFound`) and a defect (`Effect.die`) both work this way.

Ask for order B-200. `findOrder` fails with `OrderNotFound`. The model gets the tool error and answers the user.

To send the model a normal result instead, catch the error in the tool. For example, `Effect.catchTag('OrderNotFound', () => Effect.succeed({ status: 'unknown' }))`.

## When the run stops

The tool Effect runs with the services of the `AI.chat` stream. It stops when the run stops:

- The browser closes the request.
- Your code stops the stream early, for example with `Stream.take`.
- Your code interrupts the fiber that runs the stream.

In each case, the running tool fiber is interrupted. Its finalizers run, so `Effect.acquireRelease` and `Effect.onInterrupt` clean up as usual.

## Mix with other tools

The `tools` array can also hold core tools, for example `toolDefinition(...).server(...)` or client tools. Only the `AI.serverTool` values add services to the stream.

The full app is in the [Effect Chat tutorial](../tutorials/effect-chat). For images, embeddings, and other activities, see [Effect activities](./activities).
