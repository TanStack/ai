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

Sometimes the run needs an answer that is not a tool approval: pick a plan, choose a date, confirm an address. Define the question with `defineInterrupt`. The server pauses the run and asks, and your component answers.

Two schemas define the exchange:

- `payloadSchema`: what the server sends to you.
- `responseSchema`: what you send back.

This page covers the UI. To pause a run on the server, read [Generic interrupts](../../interrupts/generic).

## Full example

1. Define the interrupt. The server sends a list of plan names. You send one name back.

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

2. Add it to `interrupts` in `chatOptions`. Register a component under its id in `interruptsComponents.generic`, and render `Interrupts` in the layout:

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

When the server asks, the plan buttons show in the interrupt list.

## How it works

- `interrupt.payload` matches your `payloadSchema`, so `options` is a string array.
- `resolveInterrupt` accepts only what your `responseSchema` allows. Passing a number here is a compile error.
- No tool owns a generic interrupt, so it always renders in `Interrupts`. If the layout does not render `Interrupts`, the question never shows.

## Always register a fallback

`fallback` catches two things:

- An interrupt id that you did not register.
- An unbound interrupt. Something outside this chat owns it, so it cannot be answered here.

If the copy must be different, branch on `interrupt.kind === 'unbound'`.

## Next

- Approving a tool instead? Read [Ask before a tool runs](./tool-approval).
