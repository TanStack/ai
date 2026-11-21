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

# @tanstack/ai-uthana

Uthana adapter for TanStack AI motion generation. It turns a prompt into a skeletal animation clip (FBX or GLB), made on Uthana's default character or on your own humanoid character.

## Installation

```bash
npm install @tanstack/ai-uthana @tanstack/ai
```

## Usage

### Generate a clip

```typescript
import { generateMotion, getMotionJobStatus } from '@tanstack/ai'
import { uthanaMotion } from '@tanstack/ai-uthana'

const adapter = uthanaMotion('text-to-motion-3.0')

const { jobId } = await generateMotion({
  adapter,
  threadId: 'thread-1',
  prompt: 'A heavy warrior swings a two-handed axe overhead',
  duration: 4,
})

const status = await getMotionJobStatus({ adapter, jobId })
// When status.status is 'completed', status.motion.assets holds the files.
```

Each asset `url` is a `data:` URL with the file bytes. Save the bytes with your game assets.

### Use your own character

```typescript
import { readFile } from 'node:fs/promises'
import { createUthanaCharacter } from '@tanstack/ai-uthana'

const character = await createUthanaCharacter({
  file: new Blob([await readFile('orc.glb')]),
  fileName: 'orc.glb',
  name: 'Orc',
})

// Pass character.characterId as modelOptions.character_id to generateMotion().
```

Set `UTHANA_API_KEY`, or pass `apiKey` in the adapter config. See the [Uthana adapter docs](https://tanstack.com/ai/latest/docs/adapters/uthana).
