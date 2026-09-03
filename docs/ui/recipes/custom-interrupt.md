---
title: Ask the user your own question
id: ui-recipe-custom-interrupt
order: 4
description: "Define an interrupt with your own payload and response schemas, then render it in the chat."
keywords:
  - tanstack ai
  - defineInterrupt
  - generic interrupt
  - interruptsComponents
  - example
---

Use `defineInterrupt` when the question is not about approving a tool. The server pauses the run and asks. Your component answers.

Two schemas define the exchange:

1. `payloadSchema` is what the server sends you.
2. `responseSchema` is what you send back.

## Define it

```tsx group=plan-interrupt
import { defineInterrupt } from '@tanstack/ai'
import { z } from 'zod'

export const choosePlan = defineInterrupt({
  id: 'choosePlan',
  payloadSchema: z.object({
    options: z.array(z.string()),
  }),
  responseSchema: z.string(),
})
```

The server sends a list of plan names. You send one name back.

## Render it

Add the interrupt to `chatOptions`, then register a component under `interruptsComponents.generic`. The key is the interrupt id.

```tsx group=plan-interrupt
import { fetchServerSentEvents } from '@tanstack/ai-react'
import { createChatHook } from '@tanstack/ai-react/ui'

const chatOptions = {
  connection: fetchServerSentEvents('/api/chat'),
  interrupts: [choosePlan],
}

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
  partsComponents: {
    text: ({ part }) => <p>{part.content}</p>,
    fallback: () => null,
  },
  interruptsComponents: {
    generic: {
      choosePlan: ({ interrupt }) => (
        <fieldset>
          <legend>Pick a plan</legend>
          {interrupt.payload?.options.map((plan) => (
            <button key={plan} onClick={() => interrupt.resolveInterrupt(plan)}>
              {plan}
            </button>
          ))}
        </fieldset>
      ),
      fallback: ({ interrupt }) => <p>{interrupt.reason}</p>,
    },
  },
})

export function PlanChat() {
  const chat = useAppChat()
  return <chat.AppChat />
}
```

`interrupt.payload` matches your `payloadSchema`, so `options` is a string array. `resolveInterrupt` accepts only what your `responseSchema` allows, so passing a number here is a compile error.

## Generic interrupts always render in the list

A tool approval can render next to its tool. A generic interrupt cannot, because no tool owns it. Render `Interrupts` in your layout or it never appears.

## Always register a fallback

`fallback` catches two things:

1. An interrupt id you did not register.
2. An unbound interrupt, which arrives with no id at all.

Branch on `interrupt.kind === 'unbound'` when the copy must differ.

## Next

- Approving a tool instead? See [tool approval](./tool-approval).
- More interrupt shapes and the protocol behind them: [generic interrupts](../../interrupts/generic).
