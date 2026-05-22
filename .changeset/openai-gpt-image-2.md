---
'@tanstack/ai-openai': minor
---

Add `gpt-image-2` to the OpenAI image model list. The new model is exposed
through the same tree-shakeable `openaiImage` adapter as `gpt-image-1` and
shares its provider options (`quality`, `background`, `output_format`,
`output_compression`, `moderation`, `partial_images`) and size set
(`1024x1024`, `1536x1024`, `1024x1536`, `auto`).

```ts
import { openaiImage } from '@tanstack/ai-openai/adapters'
import { generate } from '@tanstack/ai'

const adapter = openaiImage({ apiKey: process.env.OPENAI_API_KEY! })

const result = await generate({
  adapter,
  model: 'gpt-image-2',
  prompt: 'A watercolor fox in a snowy forest',
})
```
