---
title: Subagent tool input
description: "Agent tools take their arguments in fields: the agent input moves under input. Update the brief on the card, saved threads, and recorded tool calls."
keywords:
  - tanstack ai
  - migration
  - subagents
  - defineAgent
  - inputSchema
---

After the upgrade, a subagent card shows no brief, a middleware reads `undefined` from agent tool args, or a recorded tool call fails with `Agent "researcher" needs input.` The arguments of an agent tool moved into fields. The agent input is now in the `input` field of the tool call.

Your agent code does not change. `run` still reads `ctx.input` as `{ task: string }`.

## What the model sends

Before:

```json
{ "task": "Price Vendor A" }
```

After:

```json
{ "input": { "task": "Price Vendor A" } }
```

An agent without `inputSchema` takes the task as text in `prompt`, for example `{ "prompt": "Draft a post about tides" }`. The other fields are `sessionId` and `background`. See [The tool input](../chat/subagents#the-tool-input).

## Read the brief from the new field

Your UI reads the brief from the `tool-call` part that started the child. Read the `input` field of that part first:

```tsx
import type { UIMessage } from '@tanstack/ai-react'

function briefOf(message: UIMessage, toolCallId: string) {
  for (const part of message.parts) {
    if (part.type !== 'tool-call' || part.id !== toolCallId) continue
    const call = part.input
    // The agent input is in the `input` field of the call.
    const input =
      typeof call === 'object' && call !== null && 'input' in call
        ? call.input
        : undefined
    if (
      typeof input === 'object' &&
      input !== null &&
      'task' in input &&
      typeof input.task === 'string'
    ) {
      return input.task
    }
  }
  return undefined
}
```

## Update middleware that reads agent tool args

Middleware gets the new arguments for an agent tool:

- `onBeforeToolCall`: in `args`. Read the agent input from `args.input`.
- `onAfterToolCall`: in the JSON string `toolCall.function.arguments`.
- The approval `editedArgs`: the same fields.

For example:

```typescript
import { type ChatMiddleware } from '@tanstack/ai'

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

const logBriefs: ChatMiddleware = {
  name: 'log-briefs',
  onBeforeToolCall: (ctx, hookCtx) => {
    if (hookCtx.toolName !== 'researcher' || !isRecord(hookCtx.args)) return
    const input = hookCtx.args.input
    if (isRecord(input)) console.log('brief:', input.task)
  },
}
```

A `transformArgs` decision for an agent tool also returns the new fields, for example `{ input: { task } }`.

The agent tool checks `input` against `inputSchema` when the tool runs, after these hooks. A hook gets the input as the model wrote it, without schema defaults or transforms.

## Finish open subagent calls before you upgrade

A saved thread can have a subagent call that waits for an approval. That call keeps its old arguments. After the upgrade, the resume gives the tool error `Agent "researcher" needs input.`

1. Before you deploy, let users approve or deny the waiting subagent calls.
2. Deploy the upgrade.

A thread with no waiting subagent call needs no change.

## Update recorded tool calls

Test fixtures and mocks that call an agent tool need the new arguments:

1. Find each recorded tool call whose name is an agent name.
2. Move its arguments under `input`: `{"task":"..."}` becomes `{"input":{"task":"..."}}`.
3. For an agent without `inputSchema`, keep `{}`, or send the task as `{"prompt":"..."}`.

Run your tests again. The child gets the same `ctx.input` as before, and the card shows the brief again.
