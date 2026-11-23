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
# @tanstack/ai-meshy

Meshy adapter for TanStack AI 3D model and motion generation. Use it with `generate3dModel()` to make, texture, rig, and animate 3D models. Use it with `generate3dMotion()` to make animation clips.

## Installation

```bash
npm install @tanstack/ai-meshy @tanstack/ai
```

Set the `MESHY_API_KEY` environment variable, or pass `apiKey` to the adapter.

## Usage

```typescript
import { generate3dModel } from '@tanstack/ai'
import { meshy3dModel } from '@tanstack/ai-meshy'

const model = await generate3dModel({
  adapter: meshy3dModel('text-to-3d-preview', 'meshy-7.1'),
  prompt: 'A small wooden treasure chest with iron bands',
  threadId: 'thread-1',
  wait: true,
})

console.log(model.url, model.format) // 'https://…/model.glb', 'glb'
```

The first argument is the Meshy endpoint. The second argument is the optional Meshy `ai_model`.

## Documentation

Read the [Meshy adapter guide](https://tanstack.com/ai/latest/docs/adapters/meshy) for all endpoints, motion generation, and the helpers.

## License

MIT
