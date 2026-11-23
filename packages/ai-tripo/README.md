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

# @tanstack/ai-tripo

Tripo adapter for TanStack AI 3D model generation. Use it with `generate3DModel()` to make 3D models from text, from one image, or from multiview images. You can also texture, convert, rig, retarget, decimate, UV unwrap, and segment a model.

## Installation

```bash
npm install @tanstack/ai-tripo @tanstack/ai
```

Set the `TRIPO_API_KEY` environment variable, or pass `apiKey` to the adapter.

## Usage

```typescript
import { generate3DModel } from '@tanstack/ai'
import { tripo3DModel } from '@tanstack/ai-tripo'

const model = await generate3DModel({
  adapter: tripo3DModel('image-to-model'),
  prompt: [
    {
      type: 'image',
      source: { type: 'url', value: 'https://example.com/robot.png' },
    },
  ],
  threadId: 'thread-1',
  wait: true,
})

console.log(model.url, model.format) // 'https://.../model.glb', 'glb'
```

The first argument is the Tripo endpoint. The second argument is the optional Tripo model version, for example `'v3.1-20260211'`.

## Documentation

Read the [Tripo adapter guide](https://tanstack.com/ai/latest/docs/adapters/tripo) for all endpoints, rigging, animation, and the helpers.

## License

MIT
