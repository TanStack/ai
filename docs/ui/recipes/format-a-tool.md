---
title: Make a tool look right
id: ui-recipe-format-a-tool
order: 2
description: "Register a component for one tool, and branch on the tool call state so it never shows raw JSON."
keywords:
  - tanstack ai
  - toolsComponents
  - ToolProps
  - tool call state
  - example
---

Register the tool under `toolsComponents`. The key is the tool name.

```tsx ignore
toolsComponents: {
  getWeather: ({ part }) => <p>{part.input?.city}</p>,
}
```

`part.input` and `part.output` are typed from the tool's schemas. You do not cast them.

## The problem with one line

A tool call is not one event. It arrives in stages: the model names the tool, streams the arguments, then the result comes back. A component that only reads `part.output` renders nothing for most of that time.

Branch on `part.state` instead.

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
  const chat = useAppChat()
  return <chat.AppChat />
}
```

The tool now shows progress while it runs, and a definition list when it finishes.

## The states you care about

| `part.state` | What to show |
| --- | --- |
| `awaiting-input` | The call started. No arguments yet. |
| `input-streaming` | The model is still writing the arguments. Show a spinner. |
| `input-complete` | Arguments are final. `part.input` is safe to read. |
| `complete` | The result arrived. `part.output` is safe to read. |
| `error` | The call failed. Show your own copy. |

Two more states apply only to tools that need approval: `approval-requested` and `approval-responded`. See [tool approval](./tool-approval).

## Move it to its own file

A tool map grows fast. Type the props with `ToolProps` and the component lives anywhere.

```tsx group=weather-tool
import type { ToolProps } from '@tanstack/ai-react/ui'

export function WeatherTool({
  part,
}: ToolProps<typeof chatOptions, 'getWeather'>) {
  if (part.state !== 'complete') return null
  return <dd>{part.output?.temperature}&deg;</dd>
}
```

The second type argument is the tool name. Pass it, and `part.input` and `part.output` narrow to that tool's schemas.

## Next

- A tool that needs a yes or no first? See [tool approval](./tool-approval).
- Formatting text, thinking, or images? Register them under `partsComponents`. See the [React guide](../react).
