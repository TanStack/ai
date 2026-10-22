---
title: Make a tool look right
id: ui-recipe-format-a-tool
order: 2
description: "Give one tool its own component, and branch on the tool call state so it shows progress instead of raw JSON."
keywords:
  - tanstack ai
  - toolsComponents
  - ToolProps
  - tool call state
  - example
---

Register a tool component under `toolsComponents` and branch on `part.state`. `part.input` and `part.output` are typed from the tool schemas.

The key is the tool name. You need no casts.

This page covers the UI. To run the tool, read [Server tools](../../tools/server-tools) or [Client tools](../../tools/client-tools).

## Full example

```tsx group=weather-tool
import { fetchServerSentEvents } from '@tanstack/ai-react'
import { createChatHook } from '@tanstack/ai-react/ui'
import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'

const getWeather = toolDefinition({
  name: 'getWeather',
  description: 'Look up weather',
  inputSchema: z.object({ city: z.string() }),
  outputSchema: z.object({ temperature: z.number() }),
}).client()

const chatOptions = {
  connection: fetchServerSentEvents('/api/chat'),
  tools: [getWeather],
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
    getWeather: ({ part }) => {
      if (part.state === 'input-streaming') return <p>Looking up weather</p>
      if (part.state === 'input-complete') return <p>Checking {part.input?.city}</p>
      if (part.state === 'error') return <p>Weather lookup failed</p>
      if (part.state === 'complete') {
        return (
          <dl>
            <dt>{part.input?.city}</dt>
            <dd>{part.output?.temperature}&deg;</dd>
          </dl>
        )
      }
      return null
    },
  },
})

export function WeatherChat() {
  const chat = useAppChat({ threadId: 'support-chat' })
  return <chat.AppChat />
}
```

The tool now shows progress while it runs, and a definition list when it finishes.

## How it works

`Parts` finds the tool-call part for `getWeather` and renders your component with that part. The part re-renders each time its state changes.

| `part.state`      | What to show                                         |
| ----------------- | ---------------------------------------------------- |
| `awaiting-input`  | The call started. No arguments yet.                  |
| `input-streaming` | The model still writes the arguments. Show a spinner. |
| `input-complete`  | The arguments are final. `part.input` is safe to read. |
| `complete`        | The result arrived. `part.output` is safe to read.   |
| `error`           | The call failed. Show your own copy.                 |

Two more states apply only to tools that need approval: `approval-requested` and `approval-responded`. Read [Ask before a tool runs](./tool-approval).

## Move it to its own file

A tool map grows fast. Type the props with `ToolProps`, and the component can live in any file:

```tsx group=weather-tool
import type { ToolProps } from '@tanstack/ai-react/ui'

export function WeatherTool({
  part,
}: ToolProps<typeof chatOptions, 'getWeather'>) {
  if (part.state !== 'complete') return null
  return <dd>{part.output?.temperature}&deg;</dd>
}
```

The second type argument is the tool name. With it, `part.input` and `part.output` narrow to the schemas of that tool.

## Next

- A tool that needs a yes or no first? Read [Ask before a tool runs](./tool-approval).
- Text, thinking, or images? Register them under `partsComponents`. Read [Every widget slot](../react#every-widget-slot).
