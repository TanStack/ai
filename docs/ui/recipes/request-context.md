---
title: Send the current user to the server
id: ui-recipe-request-context
order: 5
description: "Pass a user id or tenant from the chat screen to your route with forwardedProps, without putting it in the prompt."
keywords:
  - tanstack ai
  - forwardedProps
  - useAppChat
  - runtime context
  - example
---

Pass `forwardedProps` to `useAppChat()`. Every request from that instance carries it.

```tsx ignore
const chat = useAppChat({
  forwardedProps: { tenantId: 'tenant_456' },
})
```

The value never enters the prompt. The model does not see it.

## Client

`forwardedProps` belongs on the screen, not on `chatOptions`, because it changes per user.

```tsx group=request-context
import { fetchServerSentEvents } from '@tanstack/ai-react'
import { createChatHook } from '@tanstack/ai-react/ui'

const chatOptions = {
  connection: fetchServerSentEvents('/api/chat'),
}

const { useAppChat, useChatContext } = createChatHook({
  options: chatOptions,
  components: {
    input: () => {
      const chat = useChatContext()
      return (
        <button onClick={() => void chat.sendMessage('What are my invoices?')}>
          Ask
        </button>
      )
    },
    layout: ({ Messages, Input }) => (
      <main>
        <Messages />
        <Input />
      </main>
    ),
    message: ({ Parts }) => <article><Parts /></article>,
  },
  partsComponents: {
    text: ({ part }) => <p>{part.content}</p>,
    fallback: () => null,
  },
})

export function TenantChat({ tenantId }: { tenantId: string }) {
  const chat = useAppChat({
    threadId: `tenant-${tenantId}`,
    forwardedProps: { tenantId },
  })
  return <chat.AppChat />
}
```

## Server

Read it with `chatParamsFromRequest`, then map it into `context`. Tools and middleware read `context`.

```tsx
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'

export async function POST(request: Request) {
  const params = await chatParamsFromRequest(request)

  const tenantId =
    typeof params.forwardedProps.tenantId === 'string'
      ? params.forwardedProps.tenantId
      : undefined
  if (!tenantId) return new Response('Missing tenant', { status: 400 })

  const stream = chat({
    adapter: openaiText('gpt-5.6'),
    messages: params.messages,
    context: { tenantId },
  })

  return toServerSentEventsResponse(stream)
}
```

## Validate it. Always.

`forwardedProps` comes from the browser. A user can change it.

Never trust it for identity or authorization. Get the user from your session or token on the server, and use `forwardedProps` only for values that are safe to be wrong:

1. Derive the user id from the request's own auth, not from the client.
2. Check every forwarded field against a type or a schema.
3. Reject the request when a required field is missing.

The example above checks `tenantId` is a string, then refuses the request without it. In a real app you would also confirm the authenticated user may use that tenant.

## One chat per user

Pass `threadId` alongside `forwardedProps` when a screen can show more than one chat. Two instances with different thread ids keep separate histories.

## Next

- Typed server dependencies for tools and middleware: [runtime context](../../advanced/runtime-context).
- Local browser dependencies that stay on the client: [client tools](../../tools/client-tools).
