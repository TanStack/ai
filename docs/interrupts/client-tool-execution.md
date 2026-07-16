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
import { useEffect } from 'react'
import { toolDefinition } from '@tanstack/ai'
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'
import { z } from 'zod'

const showReceiptTool = toolDefinition({
  name: 'showReceipt',
  description: 'Render a receipt in the browser',
  inputSchema: z.object({ receiptId: z.string() }),
  outputSchema: z.object({ displayed: z.boolean() }),
})

export function ReceiptTool() {
  const { interrupts } = useChat({
    threadId: 'account-42',
    connection: fetchServerSentEvents('/api/chat'),
    tools: [showReceiptTool] as const,
  })

  const execution = interrupts.find(
    (item) =>
      item.kind === 'client-tool-execution' && item.toolName === 'showReceipt',
  )

  useEffect(() => {
    if (
      execution?.kind === 'client-tool-execution' &&
      execution.toolName === 'showReceipt'
    ) {
      // ...render the receipt, then report the result:
      execution.resolveInterrupt({ displayed: true })
    }
  }, [execution])

  return null
}
```

The output is validated against the tool's `outputSchema`. `resolveInterrupt`
stages it and submits as part of the [batch](./multiple).

## `addToolResult` interop

The existing `addToolResult` API still works: for a matching native item it
delegates to the same staged client-tool resolution, while legacy streams keep
their historical result path. See [Client Tools](../tools/client-tools).
