---
title: Client-Tool Execution
id: interrupts-client-tool-execution
order: 5
description: "Run a tool in the browser and return its typed output to resume the run."
keywords:
  - tanstack ai
  - client tool
  - client-tool-execution
  - addToolResult
  - resolveInterrupt
---

# Client-Tool Execution

Some tools run in the browser — reading local state, showing UI, calling a
device API — and the run needs their result back. That produces a
`client-tool-execution` interrupt. You have a pending execution item; you want to
compute its output and resume.

Approval and execution are independent axes: a client tool with
`needsApproval: true` first produces a [tool-approval](./tool-approval) decision,
and only if approved does the server later ask for its browser result here.

## Resolve with typed output

Register the tool so its `outputSchema` types `resolveInterrupt`:

```tsx
// app/receipt-tool.tsx
import { toolDefinition } from '@tanstack/ai'
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'
import { z } from 'zod'

const showReceiptTool = toolDefinition({
  name: 'showReceipt',
  description: 'Render a receipt in the browser',
  inputSchema: z.object({ receiptId: z.string() }),
  outputSchema: z.object({ displayed: z.boolean() }),
})

export function ReceiptTools() {
  const { interrupts } = useChat({
    threadId: 'account-42',
    connection: fetchServerSentEvents('/api/chat'),
    tools: [showReceiptTool] as const,
  })

  return (
    <>
      {interrupts.map((interrupt) => {
        if (
          interrupt.kind !== 'client-tool-execution' ||
          interrupt.toolName !== 'showReceipt'
        ) {
          return null
        }
        // Render the receipt in the browser, then return its typed output.
        return (
          <button
            key={interrupt.id}
            disabled={!interrupt.canResolve}
            onClick={() => interrupt.resolveInterrupt({ displayed: true })}
          >
            Mark receipt shown
          </button>
        )
      })}
    </>
  )
}
```

`resolveInterrupt`'s argument is typed by the tool's `outputSchema`, and the
output is validated before it's staged and submitted as part of the
[batch](./multiple). When the result is computed rather than confirmed by a
click, resolve it from an effect once the item appears instead of on `onClick`.

## `addToolResult` interop

The existing `addToolResult` API still works: for a matching native item it
delegates to the same staged client-tool resolution, while legacy streams keep
their historical result path. See [Client Tools](../tools/client-tools).
