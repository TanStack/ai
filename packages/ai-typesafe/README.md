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

<div align="center">
  <a href="https://npmjs.com/package/@tanstack/ai-typesafe" target="_parent">
    <img alt="NPM downloads" src="https://img.shields.io/npm/dm/@tanstack/ai-typesafe.svg" />
  </a>
  <a href="https://github.com/TanStack/ai" target="_parent">
    <img alt="GitHub stars" src="https://img.shields.io/github/stars/TanStack/ai.svg?style=social&label=Star" />
  </a>
</div>

# @tanstack/ai-typesafe

TypeSafe Jev adapter for [TanStack AI](https://tanstack.com/ai). Call Jev with
`evaluator()` and typed questions. This package talks HTTP with `fetch`. It
does not add a TypeSafe SDK.

## Install

```bash
pnpm add @tanstack/ai @tanstack/ai-typesafe
```

## Setup

Get an API key from [TypeSafe](https://typesafe.ai) and set it as an environment variable:

```bash
export TYPESAFE_API_KEY="..."
```

## Usage

```typescript
import { boolean, choice, evaluator, score } from '@tanstack/ai'
import { typesafeEvaluator } from '@tanstack/ai-typesafe'

const ticketEval = evaluator({
  adapter: typesafeEvaluator('jev-latest'),
})

const result = await ticketEval.decide({
  state: ticket,
  questions: {
    queue: choice({
      instructions: 'Which team should handle this ticket?',
      options: {
        billing: 'Payments, invoices, refunds',
        tech: 'Bugs, outages, integrations',
        sales: 'Pricing, upgrades, new accounts',
      },
    }),
    urgency: score({
      instructions: 'How urgent is this ticket?',
      levels: ['low', 'medium', 'high'],
    }),
    refund: boolean({
      instructions: 'Is the customer asking for a refund?',
    }),
  },
})

result.queue.value
result.meta.model
result.meta.usage
```

`typesafeEvaluator(model)` reads `TYPESAFE_API_KEY` from the environment. To
pass a key yourself, use `createTypesafeEvaluator(model, apiKey)`.

## Supported models

- `jev-latest` — current stable Jev alias
- `jev-1.13.0` — pinned Jev release

You can also pass other TypeSafe model ids as a string.

## License

MIT
