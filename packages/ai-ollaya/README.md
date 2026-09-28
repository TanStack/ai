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
  <a href="https://npmjs.com/package/@tanstack/ai-ollaya" target="_parent">
    <img alt="NPM downloads" src="https://img.shields.io/npm/dm/@tanstack/ai-ollaya.svg" />
  </a>
  <a href="https://github.com/TanStack/ai" target="_parent">
    <img alt="GitHub stars" src="https://img.shields.io/github/stars/TanStack/ai.svg?style=social&label=Star" />
  </a>
</div>

# @tanstack/ai-ollaya

[Ollaya](https://ollaya.ai) adapter for [TanStack AI](https://tanstack.com/ai).
Call the open-source `laya` decision models with `decide()` and typed
questions, running fully local. This package talks HTTP with `fetch`. It does
not add an SDK.

## Install

```bash
pnpm add @tanstack/ai @tanstack/ai-ollaya
```

## Setup

Ollaya runs open decision models locally — think Ollama, but for the `laya`
decision models instead of chat LLMs. No API key required.

1. **Install Ollaya.** Grab the build for your platform from
   [ollaya.ai](https://ollaya.ai) (or your internal registry) and put the
   `ollaya` binary on your `PATH`.

2. **Start the server.** It listens on `http://127.0.0.1:11435` by default —
   the same URL this adapter defaults to.

   ```bash
   ollaya serve
   ```

3. **Pull a `laya` model** (in another terminal):

   ```bash
   ollaya pull laya:latest        # router: picks laya:en or laya:multilingual
   # or a specific one:
   ollaya pull laya:en            # English (ModernBERT-large)
   ollaya pull laya:multilingual  # 100+ languages (mmBERT-base)
   ```

4. **Verify** the model is available and the server answers:

   ```bash
   ollaya list
   ollaya run laya:latest "My payouts have been failing for 3 days" --preset triage
   ```

That's it — the adapter below talks to the running server over HTTP.

## Usage

```typescript
import { boolean, choice, decide, score } from '@tanstack/ai'
import { ollayaDecider } from '@tanstack/ai-ollaya'

const result = await decide({
  adapter: ollayaDecider('laya:latest'),
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

Point the adapter at a non-default host with the `baseURL` option:

```typescript
ollayaDecider('laya:latest', { baseURL: 'http://my-host:11435' })
```

## Supported models

- `laya:latest` — routes each request to `laya:en` or `laya:multilingual` by
  the text's script and language
- `laya:en` — English decision model (ModernBERT-large)
- `laya:multilingual` — decision model for 100+ languages (mmBERT-base)

You can also pass any other `laya` tag as a string.

## License

MIT
