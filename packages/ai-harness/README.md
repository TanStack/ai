<div align="center">
  <picture>
    <source
      media="(prefers-color-scheme: dark)"
      srcset="https://tanstack.com/api/readme/ai.png?theme=dark"
    />
    <source
      media="(prefers-color-scheme: light)"
      srcset="https://tanstack.com/api/readme/ai.png"
    />
    <img
      src="https://tanstack.com/api/readme/ai.png"
      alt="TanStack AI"
      width="900"
    />
  </picture>
</div>

<br />

# @tanstack/ai-harness

Build agent harnesses on TanStack AI: long-lived sessions, typed agents, and plugins.

`chat()` answers one request. A harness keeps one conversation open across many turns. It takes new messages while it works, runs typed agents from code, and loads plugins that add tools, prompts, and middleware.

## Installation

```bash
npm install @tanstack/ai @tanstack/ai-harness @tanstack/ai-persistence
```

## Usage

```ts
import { defineAgent } from '@tanstack/ai'
import { createHarnessHost, defineHarness } from '@tanstack/ai-harness'
import { memoryPersistence } from '@tanstack/ai-persistence'
import { openaiText } from '@tanstack/ai-openai'
import { z } from 'zod'

const pricer = defineAgent({
  name: 'pricer',
  description: 'Looks up the price of a vendor plan',
  inputSchema: z.object({ vendor: z.string() }),
  run: async (ctx) => ({ vendor: ctx.input.vendor, cents: 1200 }),
})

const assistant = defineHarness({
  name: 'acme/assistant',
  adapter: openaiText('gpt-5.6'),
  agents: [pricer],
})

const host = createHarnessHost({ persistence: memoryPersistence() })
const session = await host.open(assistant, { threadId: 'thread-1' })

const turn = await session.prompt('Hello!')
console.log(turn.text)

const price = await session.agents.pricer.run({ vendor: 'acme' })
console.log(price.cents)
```

## Documentation

Read [Build your first harness](https://tanstack.com/ai/latest/docs/harness/overview).

## License

MIT
