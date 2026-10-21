---
title: Ask before a tool runs
id: ui-recipe-tool-approval
order: 3
description: "Put a tool behind a yes or no. Show the approval next to the tool, or in a list."
keywords:
  - tanstack ai
  - tool approval
  - needsApproval
  - interruptsComponents
  - example
---

Some tools must not run until a person says yes: deleting a file, sending money. Add `needsApproval: true` to the tool. The run pauses, and your tool component gets an `interrupt` prop with the buttons that you need.

This page covers the UI. For the server side of approvals, read [Tool approval](../../interrupts/tool-approval).

## Full example

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

Ask the model to delete a file. The buttons show next to the tool call.

## How it works

- `resolveInterrupt(true)` approves. `resolveInterrupt(false)` denies. The run continues in both cases.
- `interrupt.status` is `'pending'` while the run waits for an answer.
- `interrupt` is already the approval for this tool, so you do not check `interrupt.kind`.

## Show approvals in a list

Some apps collect every pending decision in one place. Register the tool name under `interruptsComponents.tools`. The approval then leaves the message and renders in `Interrupts`:

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

Then register it, and render `Interrupts` in the layout:

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

`interrupt.originalArgs` holds the arguments that the model proposed. They are typed from the tool `inputSchema`, so `path` is a string here.

## Pick one place for each tool

- If you register the tool under `interruptsComponents.tools`, the approval renders in the list.
- If you do not, the approval goes to the tool component.

Do not do both for one tool.

## Next

- A question that is not about a tool? Read [Ask the user your own question](./custom-interrupt).
