---
title: Ask before a tool runs
id: ui-recipe-tool-approval
order: 3
description: "Gate a tool behind a yes or no. Render the approval next to the tool, or in a list."
keywords:
  - tanstack ai
  - tool approval
  - needsApproval
  - interruptsComponents
  - example
---

Add `needsApproval: true` to the tool. The run pauses and your UI gets an `interrupt` prop.

```tsx ignore
const deleteFile = toolDefinition({
  name: 'deleteFile',
  description: 'Delete a file',
  needsApproval: true,
  inputSchema: z.object({ path: z.string() }),
  outputSchema: z.object({ deleted: z.boolean() }),
}).client()
```

You choose where the approval appears. Two places are available.

## Next to the tool

The tool component receives `interrupt` alongside `part`. Render the buttons there.

```tsx group=inline-approval
import { fetchServerSentEvents } from '@tanstack/ai-react'
import { createChatHook } from '@tanstack/ai-react/ui'
import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'

const deleteFile = toolDefinition({
  name: 'deleteFile',
  description: 'Delete a file',
  needsApproval: true,
  inputSchema: z.object({ path: z.string() }),
  outputSchema: z.object({ deleted: z.boolean() }),
}).client()

const chatOptions = {
  connection: fetchServerSentEvents('/api/chat'),
  tools: [deleteFile],
}

const { useAppChat } = createChatHook({
  options: chatOptions,
  components: {
    layout: ({ Messages }) => <main><Messages /></main>,
    message: ({ Parts }) => <article><Parts /></article>,
  },
  partsComponents: {
    text: ({ part }) => <p>{part.content}</p>,
    fallback: () => null,
  },
  toolsComponents: {
    deleteFile: ({ part, interrupt }) => {
      if (interrupt?.status === 'pending') {
        return (
          <div>
            <p>Delete {part.input?.path}?</p>
            <button onClick={() => interrupt.resolveInterrupt(true)}>
              Delete
            </button>
            <button onClick={() => interrupt.resolveInterrupt(false)}>
              Keep
            </button>
          </div>
        )
      }
      if (part.state === 'complete') {
        return <p>{part.output?.deleted ? 'Deleted' : 'Kept'}</p>
      }
      return <p>{part.input?.path}</p>
    },
  },
})

export function FileChat() {
  const chat = useAppChat()
  return <chat.AppChat />
}
```

`resolveInterrupt(true)` approves. `resolveInterrupt(false)` denies. The run continues either way.

## In a list instead

Some apps collect every pending decision in one place. Register the tool name under `interruptsComponents.tools` and the approval moves out of the message.

```tsx group=inline-approval
import type { InterruptProps } from '@tanstack/ai-react/ui'

export function DeleteApproval({
  interrupt,
}: InterruptProps<typeof chatOptions, 'deleteFile'>) {
  return (
    <div>
      <p>Delete {interrupt.originalArgs.path}?</p>
      <button onClick={() => interrupt.resolveInterrupt(true)}>Delete</button>
      <button onClick={() => interrupt.resolveInterrupt(false)}>Keep</button>
    </div>
  )
}
```

Then wire it up and render `Interrupts` in the layout:

```tsx ignore
const { useAppChat } = createChatHook({
  options: chatOptions,
  components: {
    layout: ({ Messages, Interrupts }) => (
      <main>
        <Messages />
        <Interrupts />
      </main>
    ),
    message: ({ Parts }) => <article><Parts /></article>,
  },
  partsComponents: { fallback: () => null },
  toolsComponents: {
    deleteFile: ({ part }) => <p>{part.input?.path}</p>,
  },
  interruptsComponents: {
    tools: { deleteFile: DeleteApproval },
  },
})
```

The tool component no longer reads `interrupt`. Its approval is in the list.

## Pick one place per tool

Register the tool under `interruptsComponents.tools` and the approval renders in the list. Leave it out and the approval reaches the tool component instead. Do not do both for one tool.

`interrupt.originalArgs` holds the arguments the model proposed. It is typed from the tool's `inputSchema`, so `path` is a string here.

## Next

- A decision that is not about a tool? See [a custom interrupt](./custom-interrupt).
- More on the protocol behind this: [tool approval](../../interrupts/tool-approval).
