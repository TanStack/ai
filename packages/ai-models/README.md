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

# @tanstack/ai-models

A model catalog you can read at runtime: each model's context window, price, reasoning levels, input kinds, and wire quirks, for 38 providers.

```ts
import { getModel, modelCost, clampReasoningLevel } from '@tanstack/ai-models'

const model = getModel('deepseek', 'deepseek-v4-flash')
model?.contextWindow // 1000000
modelCost(model!, { input: 12_000, output: 800 }).total // USD
clampReasoningLevel(model!, 'medium') // 'high': the nearest level the model has
```

- No dependencies, and no Node.js APIs, so it runs on edge runtimes too.
- One subpath per provider (`@tanstack/ai-models/deepseek`), so a build ships only the providers it imports.
- The data comes from [models.dev](https://models.dev) and the OpenRouter and Vercel model lists. `pnpm generate:models` refreshes it.

Read the guide: [Model catalog](https://tanstack.com/ai/latest/docs/models/catalog).
