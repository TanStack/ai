# @tanstack/ai-nebius

Nebius Token Factory adapter for TanStack AI.

## Installation

```bash
npm install @tanstack/ai-nebius
```

## Usage

```typescript
import { chat } from '@tanstack/ai'
import { nebiusText } from '@tanstack/ai-nebius'

const stream = chat({
  adapter: nebiusText('deepseek-ai/DeepSeek-R1-0528'),
  messages: [{ role: 'user', content: 'Hello!' }],
})
```

## Documentation

See the [Nebius Token Factory adapter documentation](../../../docs/adapters/nebius.md) for full details.
