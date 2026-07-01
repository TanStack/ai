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
  adapter: grokBuildText('composer-2.5'),
  messages: [{ role: 'user', content: 'Build a small app.' }],
})
```

Known model ids: `grok-build`, `grok-build-0.1`, and `composer-2.5` (any string is accepted).

Requires a sandbox (via `withSandbox` middleware) and the `grok` (or configured) executable inside the sandbox image with `XAI_API_KEY`.
