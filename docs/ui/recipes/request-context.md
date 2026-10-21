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

Your server route needs to know which tenant or user a chat belongs to, and that value must not go into the prompt. Pass it as `forwardedProps` to `useAppChat()`. Every request from that chat instance carries it, and the model does not see it.

## Client

Put `forwardedProps` on the screen, not on `chatOptions`, because the value changes for each user:

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

Read the value with `chatParamsFromRequest`. Then put it in `context`, where tools and middleware read it:

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
    adapter: openaiText('gpt-6.1-sol'),
    messages: params.messages,
    context: { tenantId },
  })

  return toServerSentEventsResponse(stream)
}
```

Click **Ask**. The route gets `tenantId` from the request, and the model never sees it.

## How it works

- `useAppChat()` sends `forwardedProps` with every request from that instance.
- `chatParamsFromRequest` returns it as `params.forwardedProps`.
- `context` passes it to your tools and middleware.

## Validate it on the server

`forwardedProps` comes from the browser, so a user can change it. Do not trust it for identity or authorization:

1. Get the user id from the auth of the request (your session or token), not from the client.
2. Check each forwarded field against a type or a schema.
3. If a required field is missing, reject the request.

The example above makes sure that `tenantId` is a string, and rejects the request without it. A real app also makes sure that the signed-in user can use that tenant.

## One chat for each user

If a screen can show more than one chat, pass a `threadId` with `forwardedProps`. Two instances with different thread ids keep separate histories.

## Next

- Typed server values for tools and middleware: [Runtime context](../../advanced/runtime-context).
- Browser values that stay on the client: [Client tools](../../tools/client-tools).
