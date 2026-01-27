---
'@tanstack/ai-anthropic': major
---

## Add missing AnthropicModels type export

### WHAT

Added new `AnthropicModels` **type** export to the public API of `@tanstack/ai-anthropic`. This is a union type that represents all supported Anthropic model identifiers, derived from the internal `ANTHROPIC_MODELS` const tuple.

```typescript
export type AnthropicModels = (typeof ANTHROPIC_MODELS)[number]
// Equivalent to: 'claude-opus-4-5' | 'claude-sonnet-4-5' | 'claude-haiku-4-5' | ... (and more)
```

**Note:** The `ANTHROPIC_MODELS` const tuple itself remains internal and is not exported. Only the derived type is part of the public API.

### WHY

Consumers previously had no easy way to get the type-safe union of model names for use in function signatures and variable declarations.

### HOW - Consumers Should Update

Now you can import and use `AnthropicModels` for proper type safety when creating adapter instances:

```typescript
import { createAnthropicChat, AnthropicModels } from '@tanstack/ai-anthropic'

const adapter = (model: AnthropicModels) =>
  createAnthropicChat(model, process.env.ANTHROPIC_API_KEY!, {
    // ... your config options
  })

const stream = chat({
  adapter: adapter('claude-sonnet-4-5'), // Type-checked model selection!
  messages: [{ role: 'user', content: 'Hello!' }],
})
```

The type ensures only valid Anthropic model identifiers can be passed, preventing runtime errors.

### Breaking Change

`createAnthropicChat` now requires the model as the first parameter. If you were calling it without a model parameter, you must update your code:

**Before:**

```typescript
const adapter = createAnthropicChat(process.env.ANTHROPIC_API_KEY!, {
  // ... config
})
```

**After:**

```typescript
const adapter = createAnthropicChat(
  'claude-sonnet-4-5',
  process.env.ANTHROPIC_API_KEY!,
  {
    // ... config
  },
)
```
