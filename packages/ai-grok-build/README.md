# @tanstack/ai-grok-build

Grok Build harness adapter for TanStack AI. Runs the Grok Build coding agent inside a sandbox with local tool execution and stateful sessions.

## Installation

```bash
npm install @tanstack/ai-grok-build
```

## Usage

```ts
import { chat } from '@tanstack/ai'
import { grokBuildText } from '@tanstack/ai-grok-build'

const stream = chat({
  adapter: grokBuildText('grok-build-0.1'),
  messages: [{ role: 'user', content: 'Build a small app.' }],
})
```

Requires a sandbox (via `withSandbox` middleware) and the `grok` (or configured) executable inside the sandbox image with `XAI_API_KEY`.
