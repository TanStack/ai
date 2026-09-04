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

# @tanstack/ai-reactor

Reactor adapter for TanStack AI live world generation (Orbis, Happy Oyster, LingBot, Helios).

## Installation

```bash
npm install @tanstack/ai-reactor @tanstack/ai
```

## Usage

### Server: mint a session token

```typescript
import { generateWorld } from '@tanstack/ai'
import { reactorWorld } from '@tanstack/ai-reactor'

const world = await generateWorld({
  adapter: reactorWorld('visko-orbis-stable'),
  prompt: 'A neon cyberpunk city at night',
})

// Hand world.token, world.model, and world.prompt to the browser.
```

Set `REACTOR_API_KEY`, or pass `apiKey` in the adapter config. The browser connects with `@reactor-team/js-sdk`. See the [Reactor adapter docs](https://tanstack.com/ai/latest/docs/adapters/reactor).
