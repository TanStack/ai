# TanStack AI Qwik

Qwik v2 integration for TanStack AI.

This package is currently scaffolded with a minimal Qwik hook so the
package build and example-app integration can be verified before the AI client
adapter is implemented.

```tsx
import { component$ } from '@qwik.dev/core'
import { useAiQwikHello } from '@tanstack/ai-qwik'

export default component$(() => {
  const hello = useAiQwikHello('Qwik')

  return <h1>{hello.message}</h1>
})
```
