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

# @tanstack/ai-worldlabs

World Labs adapter for TanStack AI world generation (Marble).

## Installation

```bash
npm install @tanstack/ai-worldlabs @tanstack/ai
```

## Usage

```typescript
import { generateWorld } from '@tanstack/ai'
import { worldlabsWorld } from '@tanstack/ai-worldlabs'

const world = await generateWorld({
  adapter: worldlabsWorld('marble-1.1'),
  prompt: 'A mystical forest with glowing mushrooms',
})

// world.url is the Marble viewer URL. world.assets has splat and mesh links.
```

Set `WORLDLABS_API_KEY`, or pass `apiKey` in the adapter config. See the [World Labs adapter docs](https://tanstack.com/ai/latest/docs/adapters/worldlabs).
