---
'@tanstack/ai-anthropic': minor
---

## Add missing ANTHROPIC_MODELS type export

### WHAT

Added missing `ANTHROPIC_MODELS` type export to the public API of `@tanstack/ai-anthropic` and updated the documentation to correctly reference it.

The `ANTHROPIC_MODELS` is a const tuple that contains all supported Anthropic model identifiers:

```typescript
type ANTHROPIC_MODELS = readonly [
  'claude-opus-4-5',
  'claude-sonnet-4-5',
  'claude-haiku-4-5',
  'claude-opus-4-1',
  'claude-sonnet-4',
  'claude-sonnet-3-7',
  'claude-opus-4',
  'claude-haiku-3-5',
  'claude-haiku-3',
]
```

### WHY

The `ANTHROPIC_MODELS` type was already used internally and in the model metadata but was not exported from the main package entry point. This prevented consumers from using it for type-safe model selection when creating custom adapter instances, resulting in incomplete TypeScript support and requiring workarounds like manual type assertions.

By exporting this type, consumers now have full type safety when working with Anthropic models and can write more maintainable code.

### HOW - Consumers Should Update

Now you can import and use `ANTHROPIC_MODELS` for proper type safety when creating adapter instances:

```typescript
import { createAnthropicChat, ANTHROPIC_MODELS } from '@tanstack/ai-anthropic'

const adapter = (model: ANTHROPIC_MODELS) =>
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
